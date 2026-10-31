'use strict';
const {SlashCommandBuilder,MessageFlags,PermissionFlagsBits:P,AuditLogEvent:A}=require('discord.js');
const ID=/^\d{17,20}$/;
function command(){return new SlashCommandBuilder().setName('no-bot').setDescription('Bot owner: remove bots invited by a selected member using audit evidence').setDMPermission(false)
  .addUserOption(o=>o.setName('member').setDescription('Member whose bot additions should be blocked').setRequired(true))
  .addBooleanOption(o=>o.setName('blocked').setDescription('Default true; false removes this restriction'));}
function createGuildDefense(ctx={}){
  const now=ctx.now||Date.now,joins=new Map(),changes=new Map(),busy=new Set(),notices=new Map();
  function data(gid){const gd=ctx.guildData(gid);if(gd.guildDefense===undefined)gd.guildDefense={version:0,blockedInviters:[],incidents:[]};const d=gd.guildDefense;if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.blockedInviters)||d.blockedInviters.length>500||d.blockedInviters.some(id=>!ID.test(id))||!Array.isArray(d.incidents)||d.incidents.length>1000)throw Error('Invalid saved guild-defense data.');return d;}
  function commit(gid,fn){const gd=ctx.guildData(gid),previous=structuredClone(data(gid));try{const result=fn(data(gid));ctx.saveDB();return result;}catch(e){gd.guildDefense=previous;throw e;}}
  function prepare(gid){const gd=ctx.guildData(gid),d=data(gid);if(d.version===1)return gd;
    if(gd.securitySettings!==undefined&&(!gd.securitySettings||typeof gd.securitySettings!=='object'||Array.isArray(gd.securitySettings))||gd.botSecurity!==undefined&&(!gd.botSecurity||typeof gd.botSecurity!=='object'||Array.isArray(gd.botSecurity))||gd.botSecurity?.settings!==undefined&&(!gd.botSecurity.settings||typeof gd.botSecurity.settings!=='object'||Array.isArray(gd.botSecurity.settings)))throw Error('Invalid security settings; preserve them.');
    const before={securitySettings:gd.securitySettings,botSecurity:gd.botSecurity,guildDefense:structuredClone(d)};
    gd.securitySettings={...gd.securitySettings,messageLimit:Math.min(gd.securitySettings?.messageLimit??10,6),windowSeconds:5,repeatLimit:3,pingLimit:5,linkLimit:4};
    gd.botSecurity={...gd.botSecurity,settings:{...gd.botSecurity?.settings,messageLimit:12,windowSeconds:4,repeatLimit:6,massLimit:2}};
    gd.guildDefense={...d,version:1,upgradedAt:now(),previousThresholds:{human:before.securitySettings||null,bot:before.botSecurity?.settings||null}};
    try{ctx.saveDB();}catch(e){if(before.securitySettings===undefined)delete gd.securitySettings;else gd.securitySettings=before.securitySettings;if(before.botSecurity===undefined)delete gd.botSecurity;else gd.botSecurity=before.botSecurity;gd.guildDefense=before.guildDefense;throw e;}return gd;
  }
  const active=gid=>ctx.isGuildApproved?.(gid)&&!ctx.isMaintenance?.();
  async function alert(guild,text){const key=guild.id+':'+text.slice(0,50),at=notices.get(key);if(at!==undefined&&now()-at<60000)return;notices.set(key,now());while(notices.size>2000)notices.delete(notices.keys().next().value);try{await ctx.alert?.(guild,text);}catch{}}
  async function removeBot(guild,targetId,entry,reason){
    if(!active(guild.id)||!ID.test(targetId)||targetId===ctx.client.user?.id||targetId===ctx.OWNER_ID||busy.has(guild.id+':'+targetId))return false;const key=guild.id+':'+targetId;busy.add(key);
    try{const state=data(guild.id);const recent=state.incidents.filter(r=>now()-r.at<86400000);if(recent.some(r=>r.auditId===entry.id||r.targetId===targetId&&['attempting','uncertain','banned','kicked'].includes(r.status))||recent.length>=1000||recent.filter(r=>now()-r.at<60000&&r.action).length>=10)return false;
      const [member,me]=await Promise.all([guild.members.fetch({user:targetId,force:true}),guild.members.fetchMe({force:true})]);if(member?.id!==targetId||member.user?.bot!==true||!active(guild.id))return false;
      if(reason==='blocked-inviter'&&!data(guild.id).blockedInviters.includes(entry.executorId))return false;
      const action=member.bannable&&me.permissions.has(P.BanMembers)?'ban':member.kickable&&me.permissions.has(P.KickMembers)?'kick':null,incident={auditId:entry.id,targetId,executorId:entry.executorId,reason,at:now(),action,status:action?'attempting':'blocked-permissions'};
      commit(guild.id,d=>{d.incidents=d.incidents.filter(r=>now()-r.at<86400000);d.incidents.push(incident);});if(!action){await alert(guild,'Cannot remove raid/invited bot '+targetId+': missing ban/kick permission or role hierarchy.');return false;}
      try{if(action==='ban')await member.ban({deleteMessageSeconds:0,reason:'Pixel defense: '+reason+'; audit '+entry.id});else await member.kick('Pixel defense: '+reason+'; audit '+entry.id);}
      catch{try{commit(guild.id,d=>{const row=d.incidents.find(r=>r.auditId===entry.id);if(row)row.status='uncertain';});}catch{}await alert(guild,'Bot removal outcome uncertain; no automatic replay: '+targetId);return false;}
      try{commit(guild.id,d=>{const row=d.incidents.find(r=>r.auditId===entry.id);if(row)row.status=action==='ban'?'banned':'kicked';});}catch{}await alert(guild,`Removed bot ${targetId}: ${reason}, audit ${entry.id}.`);return true;
    }catch{return false;}finally{busy.delete(key);}
  }
  async function audit(entry,guild){
    if(!guild||!active(guild.id)||!entry||!ID.test(entry.id)||!ID.test(entry.executorId)||!Number.isFinite(entry.createdTimestamp)||entry.executorId===ctx.client.user?.id||entry.executorId===ctx.OWNER_ID||now()-entry.createdTimestamp>30000||entry.createdTimestamp>now()+3000)return false;
    try{prepare(guild.id);if(entry.action===A.BotAdd){if(!ID.test(entry.targetId)||!data(guild.id).blockedInviters.includes(entry.executorId))return false;return await removeBot(guild,entry.targetId,entry,'blocked-inviter');}
      if(![A.ChannelDelete,A.RoleDelete,A.ChannelUpdate,A.RoleUpdate].includes(entry.action))return false;
      if(ctx.guildData(guild.id).botSecurity?.trustedBotIds?.includes(entry.executorId))return false;
      const member=await guild.members.fetch({user:entry.executorId,force:true});if(member.user?.bot!==true)return false;
      const key=guild.id+':'+entry.executorId,rows=(changes.get(key)||[]).filter(r=>now()-r.at<10000);if(rows.some(r=>r.id===entry.id))return false;rows.push({id:entry.id,at:now(),destructive:[A.ChannelDelete,A.RoleDelete].includes(entry.action)});changes.delete(key);changes.set(key,rows.slice(-10));while(changes.size>10000)changes.delete(changes.keys().next().value);
      if(rows.filter(r=>r.destructive).length>=2||rows.length>=4)return await removeBot(guild,entry.executorId,entry,'rapid-structure-changes');return false;
    }catch{return false;}
  }
  async function memberJoined(member){
    if(!active(member.guild.id))return false;prepare(member.guild.id);if(member.user.bot){
      try{const me=await member.guild.members.fetchMe({force:true});if(!me.permissions.has(P.ViewAuditLog)){await alert(member.guild,'View Audit Log is required to enforce /no-bot restrictions.');return false;}
        // The gateway audit event is primary; a bounded lookup covers event ordering.
        const logs=await member.guild.fetchAuditLogs({type:A.BotAdd,limit:10});const matches=[...logs.entries.values()].filter(e=>e.targetId===member.id&&Number.isFinite(e.createdTimestamp)&&Math.abs(now()-e.createdTimestamp)<=15000);if(matches.length===1)return await audit(matches[0],member.guild);
      }catch{}return false;
    }
    const rows=(joins.get(member.guild.id)||[]).filter(at=>now()-at<10000);rows.push(now());joins.set(member.guild.id,rows.slice(-30));while(joins.size>2000)joins.delete(joins.keys().next().value);if(rows.length>=3)await alert(member.guild,'Early join-raid alert: '+rows.length+' joins in 10 seconds. Review members; no automatic human bans.');return false;
  }
  async function handleInteraction(i){if(!i.isChatInputCommand?.()||i.commandName!=='no-bot')return false;
    try{if(!ID.test(String(ctx.OWNER_ID))||i.user.id!==ctx.OWNER_ID)throw Error('Only the configured bot owner can use /no-bot.');if(!i.guild||!active(i.guild.id))throw Error('Use this in an approved server outside maintenance.');await i.deferReply({flags:MessageFlags.Ephemeral});await i.guild.members.fetch({user:i.user.id,force:true});prepare(i.guild.id);const user=i.options.getUser('member',true),blocked=i.options.getBoolean('blocked')??true;if(!ID.test(user.id)||user.bot||user.id===i.guild.ownerId||user.id===ctx.OWNER_ID)throw Error('Choose a human member other than the server/bot owner.');await i.guild.members.fetch({user:user.id,force:true});const list=data(i.guild.id).blockedInviters;if(blocked&&!list.includes(user.id)&&list.length>=500)throw Error('Restriction limit reached.');commit(i.guild.id,d=>{d.blockedInviters=blocked?[...new Set([...d.blockedInviters,user.id])]:d.blockedInviters.filter(id=>id!==user.id);});
      await i.editReply({content:(blocked?'🛡️ Bot additions by <@'+user.id+'> are restricted.':'Restriction removed for <@'+user.id+'>.')+'\nDiscord has no per-member pre-invite deny. Pixel removes a newly added bot only when a recent audit entry identifies this inviter. Needs View Audit Log + Ban/Kick + higher role. To prevent installation itself, remove Manage Server/Administrator from the member’s roles.',allowedMentions:{parse:[]}});
    }catch(e){const p={content:'❌ '+String(e.message||e).slice(0,700),allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(p).catch(()=>{});else await i.reply({...p,flags:MessageFlags.Ephemeral}).catch(()=>{});}return true;
  }
  return {prepare,audit,memberJoined,handleInteraction};
}
module.exports={command,createGuildDefense};
