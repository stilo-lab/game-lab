'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {SlashCommandBuilder,PermissionFlagsBits:P,PermissionsBitField,ChannelType,MessageFlags,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,GatewayIntentBits}=require('discord.js');
const guardModule=require('./security_guard'),locale=require('./localization');
const KEYS=Object.freeze(['SendMessages','SendMessagesInThreads','CreatePublicThreads','CreatePrivateThreads']);
const MASK=KEYS.reduce((n,k)=>n|P[k],0n),snowflake=id=>typeof id==='string'&&/^\d{16,22}$/.test(id);
const t=(gid,en,de)=>locale.languageFor(gid)==='de'?de:en;
const flags=row=>Object.fromEntries(KEYS.map(k=>[k,(BigInt(row?.allow?.bitfield??row?.allow??0)&P[k])!==0n?true:(BigInt(row?.deny?.bitfield??row?.deny??0)&P[k])!==0n?false:null]));
function snapshot(channel){return [...channel.permissionOverwrites.cache.values()].map(r=>({id:r.id,type:r.type,allow:String(r.allow.bitfield??r.allow),deny:String(r.deny.bitfield??r.deny)})).sort((a,b)=>a.id.localeCompare(b.id));}
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function patchesFor(rows,gid,bot){
  const selected=new Map([[gid,rows.find(r=>r.id===gid)||{id:gid,type:0,allow:'0',deny:'0'}]]);
  for(const row of rows)if(row.id!==bot.id&&(BigInt(row.allow)&MASK)!==0n)selected.set(row.id,row);
  const out=[];
  for(const row of selected.values()){const before=flags(row),after=Object.fromEntries(KEYS.map(k=>[k,false]));if(KEYS.some(k=>before[k]!==after[k]))out.push({id:row.id,type:row.type,existed:rows.some(r=>r.id===row.id),before,after});}
  if(!bot.permissions.has(P.Administrator)){
    const row=rows.find(r=>r.id===bot.id)||{id:bot.id,type:1,allow:'0',deny:'0'},before=flags(row),after={...before};
    for(const k of KEYS)if(bot.channelPermissions.has(P[k]))after[k]=true;
    if(KEYS.some(k=>before[k]!==after[k]))out.push({id:bot.id,type:1,existed:rows.some(r=>r.id===bot.id),before,after});
  }
  return out;
}
function validPatches(patches){return Array.isArray(patches)&&patches.length>0&&patches.length<=100&&new Set(patches.map(p=>p.id)).size===patches.length&&patches.every(p=>snowflake(p.id)&&[0,1].includes(p.type)&&typeof p.existed==='boolean'&&['before','after'].every(key=>p[key]&&Object.keys(p[key]).length===KEYS.length&&KEYS.every(k=>Object.hasOwn(p[key],k)&&[true,false,null].includes(p[key][k]))));}
function applyPatches(rows,patches,restore=false){
  if(!validPatches(patches))throw Error('Invalid saved permission snapshot.');
  const result=new Map(rows.map(r=>[r.id,{...r}]));let conflicts=0;
  for(const patch of patches){
    let row=result.get(patch.id);
    if(restore&&!row){if(patch.existed)conflicts++;continue;}
    row||={id:patch.id,type:patch.type,allow:'0',deny:'0'};
    const current=flags(row);let allow=BigInt(row.allow),deny=BigInt(row.deny),changed=false;
    for(const key of KEYS){
      if(patch.before[key]===patch.after[key])continue;
      if(restore&&current[key]!==patch.after[key]){if(current[key]!==patch.before[key])conflicts++;continue;}
      const value=patch[restore?'before':'after'][key],bit=P[key];allow&=~bit;deny&=~bit;if(value===true)allow|=bit;if(value===false)deny|=bit;changed=true;
    }
    if(!changed)continue;
    if(restore&&!patch.existed&&allow===0n&&deny===0n)result.delete(patch.id);else result.set(patch.id,{...row,allow:String(allow),deny:String(deny)});
  }
  if(result.size>100)throw Error('This channel would exceed 100 permission overwrites.');
  return {rows:[...result.values()].sort((a,b)=>a.id.localeCompare(b.id)),conflicts};
}
function simulation(gd,scenario='all'){
  const scenarios=['messages','repeats','pings','links','mass','commands'];if(scenario!=='all'&&!scenarios.includes(scenario))throw Error('Unknown simulation scenario.');
  return (scenario==='all'?scenarios:[scenario]).map(name=>{
    let clock=1000000;const config=structuredClone(gd),guard=guardModule.createGuard({guildData:()=>config,ownerId:'SIM-OWNER',now:()=>clock,saveDB:()=>{throw Error('Simulation must not save.');}}),guild={id:'SIM-GUILD',ownerId:'SIM-GUILD-OWNER'},member={permissions:new PermissionsBitField(0n)};
    let first=null,blocked=0;
    for(let n=1;n<=40;n++){
      clock+=25;
      if(name==='commands'){if(!guard.commandGate({guild,user:{id:'SIM-MEMBER'},member,commandName:'new'})){first??=n;blocked++;}continue;}
      const mentions={users:new Map(),roles:new Map(),everyone:name==='mass'};
      if(name==='pings')for(let k=0;k<30;k++)mentions.users.set('SIM-'+k,{});
      const content=name==='repeats'?'local simulation repeated sample':name==='links'?Array.from({length:20},(_,k)=>'https://example.invalid/'+k).join(' '):'local simulation sample '+n;
      const decision=guard.observe({id:'SIM-'+n,guild,author:{id:'SIM-MEMBER',bot:false},member,content,mentions});if(decision){first??=n;blocked++;}
    }
    return {scenario:name,samples:40,firstDetected:first,blocked,active:name==='commands'||(guardModule.settings(gd).enabled&&gd.settings?.autoModEnabled!==false)};
  });
}
function buildCommands(){return [new SlashCommandBuilder().setName('raid').setDescription('Bot owner: security audit, private simulation and reversible channel protection').setDMPermission(false)
  .addSubcommand(s=>s.setName('audit').setDescription('Inspect current protection, bot permissions and risky roles'))
  .addSubcommand(s=>s.setName('test').setDescription('Simulate spam locally; no messages or punishments are sent').addStringOption(o=>o.setName('scenario').setDescription('Detection to test').addChoices(...['all','messages','repeats','pings','links','mass','commands'].map(value=>({name:value,value})))))
  .addSubcommand(s=>s.setName('lock').setDescription('Preview a temporary write lock for one selected text channel')
    .addChannelOption(o=>o.setName('channel').setDescription('Exactly one channel to protect').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Automatic restoration after 1–60 minutes; default 10').setMinValue(1).setMaxValue(60)))
  .addSubcommand(s=>s.setName('restore').setDescription('Restore the saved write permissions for one protected channel').addChannelOption(o=>o.setName('channel').setDescription('Channel with a saved raid-protection snapshot').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)))
  .addSubcommand(s=>s.setName('status').setDescription('Show saved channel protections and restoration status'))];}
function createRaidSecurity({client,guildData,saveDB,OWNER_ID,isGuildApproved=()=>true,setupLocks=new Set(),now=Date.now,aiConfigured=false}={}){
  const previews=new Map(),queues=new Map(),cooldowns=new Map();
  const owner=i=>snowflake(OWNER_ID)&&i.user?.id===OWNER_ID;
  function state(gid){const gd=guildData(gid);if(gd.raidSecurity===undefined)gd.raidSecurity={};const s=gd.raidSecurity;
    if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Saved raid-protection data is invalid; preserve the database for recovery.');
    if(s.locks===undefined)s.locks={};if(s.history===undefined)s.history=[];
    if(!s.locks||typeof s.locks!=='object'||Array.isArray(s.locks)||!Array.isArray(s.history))throw Error('Saved raid-protection data is invalid; preserve the database for recovery.');return s;}
  function commit(gid,fn){const gd=guildData(gid),previous=structuredClone(state(gid));try{const result=fn(state(gid));saveDB();return result;}catch(error){gd.raidSecurity=previous;throw error;}}
  function serial(gid,fn){const next=(queues.get(gid)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(gid,next);return next.finally(()=>{if(queues.get(gid)===next)queues.delete(gid);});}
  const say=(i,content,components=[])=>i.editReply({content,components,embeds:[],allowedMentions:{parse:[]}});
  async function fresh(guild,id){
    const [channel,bot]=await Promise.all([guild.channels.fetch(id,{force:true}),guild.members.fetchMe({force:true})]);
    if(!channel||channel.guild?.id!==guild.id||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw Error(t(guild.id,'Choose one text channel in this server.','Wähle genau einen Textkanal auf diesem Server.'));
    const permissions=channel.permissionsFor(bot);if(!permissions?.has([P.ViewChannel,P.ManageChannels,P.ManageRoles]))throw Error(t(guild.id,'The bot needs View Channel, Manage Channels and Manage Roles in this channel.','Der Bot braucht Kanal ansehen, Kanäle verwalten und Rollen verwalten in diesem Kanal.'));
    return {channel,bot:{id:bot.id,permissions:bot.permissions,channelPermissions:permissions}};
  }
  async function write(channel,rows,reason){await channel.permissionOverwrites.set(rows.map(r=>({...r,allow:BigInt(r.allow),deny:BigInt(r.deny)})),reason);}
  async function restore(guild,id,automatic=false){
    const record=state(guild.id).locks[id];if(!record)throw Error(t(guild.id,'No saved protection for this channel.','Für diesen Kanal ist keine Sperre gespeichert.'));
    if(record.channelId!==id||record.guildId!==guild.id||!validPatches(record.patches))throw Error('Invalid saved permission snapshot.');
    const {channel}=await fresh(guild,id),current=snapshot(channel),plan=applyPatches(current,record.patches,true);
    commit(guild.id,()=>{record.status='restoring';record.retryAt=now()+30000;});
    await write(channel,plan.rows,'Pixel raid protection: restore saved write permissions');
    commit(guild.id,s=>{s.history.push({id:record.id,channelId:id,ownerId:record.ownerId,endedAt:now(),automatic,conflicts:plan.conflicts});s.history=s.history.slice(-25);delete s.locks[id];});
    return plan.conflicts;
  }
  async function audit(i){
    const gid=i.guild.id,gd=guildData(gid),c=guardModule.settings(gd),checks=[];let bot,roles;
    try{bot=await i.guild.members.fetchMe({force:true});}catch{checks.push(t(gid,'⚠️ Current bot permissions could not be fetched.','⚠️ Aktuelle Bot-Rechte konnten nicht abgerufen werden.'));}
    try{roles=await i.guild.roles.fetch();}catch{checks.push(t(gid,'⚠️ Current roles could not be fetched.','⚠️ Aktuelle Rollen konnten nicht abgerufen werden.'));}
    const active=c.enabled&&gd.settings?.autoModEnabled!==false;
    checks.push(t(gid,`Anti-spam: **${active?'ON':'OFF'}** · ${c.messageLimit}/${c.windowSeconds}s · repeats ${c.repeatLimit}/20s · pings ${c.pingLimit} · links ${c.linkLimit}`,`Anti-Spam: **${active?'AN':'AUS'}** · ${c.messageLimit}/${c.windowSeconds}s · Wiederholungen ${c.repeatLimit}/20s · Pings ${c.pingLimit} · Links ${c.linkLimit}`));
    checks.push(t(gid,`Warnings escalate to saved-strike timeouts up to 15 minutes. Base timeout: ${c.timeoutMinutes} min.`,`Warnungen eskalieren bei gespeicherten Folge-Verstößen bis maximal 15 Minuten Timeout. Basis: ${c.timeoutMinutes} Min.`));
    checks.push(t(gid,'Heavy-command limits remain active even when AutoMod is off. Owner/admin: 20; others: 6 calls per 20s.','Limits für aufwendige Befehle bleiben bei ausgeschaltetem AutoMod aktiv. Owner/Admin: 20; andere: 6 Aufrufe pro 20s.'));
    if(bot)for(const key of ['ManageMessages','ModerateMembers','ManageChannels','ManageRoles','BanMembers','KickMembers'])checks.push(`${bot.permissions.has(P[key])?'✅':'⚠️'} ${key}`);
    const risky=roles?[...roles.values()].filter(r=>r.id!==gid&&!r.managed&&r.permissions.has([P.Administrator],false)):[];
    const everyone=roles?.get(gid);if(everyone&&(everyone.permissions.bitfield&(P.Administrator|P.ManageChannels|P.ManageRoles|P.ManageWebhooks|P.MentionEveryone)))checks.push(t(gid,'🚨 @everyone has sensitive server permissions. Review its role permissions.','🚨 @everyone hat sensible Serverrechte. Prüfe seine Rollenrechte.'));
    checks.push(t(gid,`Administrator roles (excluding managed roles): ${risky.length}. Owner/admins bypass channel restrictions.`,`Administratorrollen (ohne verwaltete Rollen): ${risky.length}. Owner/Admins umgehen Kanalsperren.`));
    const managementMask=P.ManageGuild|P.ManageChannels|P.ManageRoles|P.ManageWebhooks|P.BanMembers|P.KickMembers|P.ModerateMembers;
    const sensitive=roles?[...roles.values()].filter(r=>r.id!==gid&&!r.managed&&(r.permissions.bitfield&managementMask)!==0n):[];
    checks.push(t(gid,`Roles with management, webhook or moderation rights: ${sensitive.length}. Verify that these are assigned only to trusted accounts.`,`Rollen mit Verwaltungs-, Webhook- oder Moderationsrechten: ${sensitive.length}. Prüfe, dass nur vertrauenswürdige Konten diese Rollen erhalten.`));
    const botConfig=require('./bot_security').settings(gd);
    checks.push(t(gid,`Separate bot-spam protection: ${botConfig.enabled?'ON':'OFF'} · action ${botConfig.action} · ${botConfig.messageLimit}/${botConfig.windowSeconds}s · trusted bots ${botConfig.trustedBotIds.length}. /botsecurity status shows details. Webhooks are reported and their spam is deleted within limits; they cannot be kicked as members.`,`Gesonderter Bot-Spam-Schutz: ${botConfig.enabled?'AN':'AUS'} · Aktion ${botConfig.action} · ${botConfig.messageLimit}/${botConfig.windowSeconds}s · vertrauenswürdige Bots ${botConfig.trustedBotIds.length}. Details unter /botsecurity status. Webhooks werden gemeldet und ihr Spam begrenzt gelöscht; sie sind keine kickbaren Mitglieder.`));
    checks.push(t(gid,'Existing join-raid alerts: 8 joins in 60s; coordinated-text alerts: 4 accounts in 60s. These are alerts, not automatic bans.','Bisherige Join-Raid-Warnung: 8 Beitritte in 60s; koordinierter Text: 4 Accounts in 60s. Das sind Warnungen, keine automatischen Banns.'));
    checks.push(t(gid,`AI moderation key configured: ${aiConfigured?'yes':'no'}; model connectivity was not tested.`,`KI-Moderationsschlüssel konfiguriert: ${aiConfigured?'ja':'nein'}; Modellverbindung wurde nicht geprüft.`));
    const intents=client?.options?.intents;if(intents?.has&&!intents.has(GatewayIntentBits.MessageContent))checks.push(t(gid,'⚠️ Message Content intent is absent in the running client. Text checks can be incomplete.','⚠️ Message-Content-Intent fehlt im laufenden Client. Textprüfungen können unvollständig sein.'));
    if(!active)checks.push(t(gid,'⚠️ Message-spam detection is disabled. Use /security config and the AutoMod switch in /settings.','⚠️ Nachrichten-Spam-Prüfung ist ausgeschaltet. Nutze /security config und den AutoMod-Schalter in /settings.'));
    await i.editReply({embeds:[new EmbedBuilder().setColor(active?0x5865f2:0xe67e22).setTitle(t(gid,'🛡️ Owner security audit','🛡️ Owner-Sicherheitsprüfung')).setDescription(checks.join('\n\n').slice(0,4096))],allowedMentions:{parse:[]}});
  }
  async function preview(i){
    const gid=i.guild.id,id=i.options.getChannel('channel',true)?.id,minutes=i.options.getInteger('minutes')??10;if(!snowflake(id)||!Number.isInteger(minutes)||minutes<1||minutes>60)throw Error('Invalid channel or duration.');
    if(state(gid).locks[id])throw Error(t(gid,'Restore the existing protection before locking this channel again.','Stelle die vorhandene Sperre wieder her, bevor du diesen Kanal erneut sperrst.'));
    if(Object.keys(state(gid).locks).length>=10)throw Error('At most ten individually selected channel protections per server.');
    const {channel,bot}=await fresh(i.guild,id),rows=snapshot(channel),patches=patchesFor(rows,gid,bot);applyPatches(rows,patches);
    for(const [key,p]of previews)if(p.expiresAt<now())previews.delete(key);if(previews.size>=100)throw Error('Too many open protection previews.');
    const token=randomUUID(),p={guildId:gid,invocationChannelId:i.channelId||i.channel.id,userId:i.user.id,channelId:id,minutes,patches,beforeHash:fingerprint(rows),expiresAt:now()+120000};previews.set(token,p);
    const msg=await say(i,t(gid,`Protect <#${id}> for **${minutes} minutes**?\nThis temporarily changes four write permissions in **${patches.length} permission overwrite(s)**. A saved snapshot restores those bits later. Owner/admins can bypass it. New role/member overrides added afterward are not automatically controlled.`,`<#${id}> für **${minutes} Minuten** schützen?\nDabei werden vier Schreibrechte in **${patches.length} Kanalüberschreibung(en)** vorübergehend geändert. Ein gespeicherter Stand stellt diese Bits später wieder her. Owner/Admins können die Sperre umgehen. Später neu angelegte Rollen-/Nutzerüberschreibungen werden nicht automatisch gesperrt.`),[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pxraid:apply:'+token).setLabel(t(gid,'Apply channel protection','Kanalsperre anwenden')).setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('pxraid:cancel:'+token).setLabel(t(gid,'Cancel','Abbrechen')).setStyle(ButtonStyle.Secondary))]);
    if(msg?.id)p.previewMessageId=msg.id;
  }
  async function confirm(i){
    const [,action,token,...extra]=i.customId.split(':'),p=previews.get(token),gid=i.guild.id;
    if(extra.length||!['apply','cancel'].includes(action)||!p||p.expiresAt<now()||p.guildId!==gid||p.userId!==i.user.id||p.invocationChannelId!==(i.channelId||i.channel?.id)||(p.previewMessageId&&p.previewMessageId!==i.message?.id))throw Error(t(gid,'This protection preview expired or belongs to another context.','Diese Sperrvorschau ist abgelaufen oder gehört zu einem anderen Kontext.'));
    if(action==='cancel'){previews.delete(token);return say(i,t(gid,'Channel protection cancelled.','Kanalsperre abgebrochen.'));}
    if(setupLocks.has(gid))throw Error(t(gid,'Wait for the current setup or request to finish.','Warte, bis das aktuelle Setup oder der Auftrag fertig ist.'));
    setupLocks.add(gid);
    try{
      const {channel}=await fresh(i.guild,p.channelId),rows=snapshot(channel);if(fingerprint(rows)!==p.beforeHash)throw Error(t(gid,'Channel permissions changed. Open a new /raid lock preview.','Kanalrechte wurden geändert. Öffne eine neue /raid lock-Vorschau.'));
      if(state(gid).locks[p.channelId]||Object.keys(state(gid).locks).length>=10)throw Error('This channel is already protected or the server limit was reached.');
      const plan=applyPatches(rows,p.patches),record={id:token,guildId:gid,channelId:p.channelId,ownerId:i.user.id,patches:p.patches,createdAt:now(),expiresAt:now()+p.minutes*60000,status:'applying'};
      commit(gid,s=>{s.locks[p.channelId]=record;});previews.delete(token);
      try{await write(channel,plan.rows,'Pixel raid protection: owner-confirmed temporary write lock');}
      catch(error){try{commit(gid,()=>{record.status='restore-required';record.expiresAt=now();});}catch{}throw Error(t(gid,'The lock was not confirmed. Its saved snapshot is queued for safe restoration.','Die Sperre konnte nicht bestätigt werden. Ihr gespeicherter Stand ist zur sicheren Wiederherstellung vorgemerkt.'));}
      try{commit(gid,()=>{record.status='active';});}catch{throw Error(t(gid,'The permission update succeeded but its status could not be saved. Restoration will be retried; use /raid restore if needed.','Die Rechteänderung war erfolgreich, ihr Status konnte aber nicht gespeichert werden. Wiederherstellung wird erneut versucht; nutze bei Bedarf /raid restore.'));}
      await say(i,t(gid,`✅ <#${record.channelId}> protected until <t:${Math.floor(record.expiresAt/1000)}:R>. /raid restore reverses the saved changes.`,`✅ <#${record.channelId}> bis <t:${Math.floor(record.expiresAt/1000)}:R> geschützt. /raid restore nimmt die gespeicherten Änderungen zurück.`));
    }finally{setupLocks.delete(gid);}
  }
  async function handleInteraction(i){
    const component=String(i.customId||'').startsWith('pxraid:'),command=i.isChatInputCommand?.()&&i.commandName==='raid';if(!component&&!command)return false;
    if(!owner(i)){await i.reply({content:snowflake(OWNER_ID)?'Only the configured bot owner can use /raid.':'The configured OWNER_ID must be a valid Discord user ID.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;}
    if(!i.guild||!isGuildApproved(i.guild.id)){await i.reply({content:'Use /raid in an approved server.',flags:MessageFlags.Ephemeral});return true;}
    if(component)await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
    try{await serial(i.guild.id,async()=>{
      if(!owner(i))throw Error('Only the configured bot owner can use /raid.');
      await i.guild.members.fetch({user:i.user.id,force:true});
      if(component)return confirm(i);
      const sub=i.options.getSubcommand(),gid=i.guild.id;
      if(['audit','test','lock'].includes(sub)){const key=gid+':'+i.user.id,last=cooldowns.get(key);if(last!==undefined&&now()-last<3000)throw Error(t(gid,'Please wait three seconds between protection requests.','Warte bitte drei Sekunden zwischen Schutzanfragen.'));cooldowns.set(key,now());if(cooldowns.size>1000)cooldowns.delete(cooldowns.keys().next().value);}
      if(sub==='audit')return audit(i);
      if(sub==='test'){const result=simulation(guildData(gid),i.options.getString('scenario')||'all');return say(i,t(gid,'🧪 Local detection simulation — no server messages, renames or punishments were performed.\n','🧪 Lokaler Erkennungstest — keine Servernachrichten, Umbenennungen oder Strafen ausgeführt.\n')+result.map(r=>`${r.scenario}: ${r.active?(r.firstDetected?t(gid,'first detection at sample ','erste Erkennung bei Probe ')+r.firstDetected:t(gid,'no detection','keine Erkennung')):t(gid,'protection OFF','Schutz AUS')} (${r.samples})`).join('\n'));}
      if(sub==='status'){const rows=Object.values(state(gid).locks);return say(i,t(gid,'🛡️ Saved channel protections\n','🛡️ Gespeicherte Kanalsperren\n')+(rows.map(r=>`<#${r.channelId}> · ${r.status} · <t:${Math.floor(r.expiresAt/1000)}:R>`).join('\n')||t(gid,'No saved locks.','Keine gespeicherten Sperren.')));}
      if(sub==='lock')return preview(i);
      if(sub==='restore'){
        if(setupLocks.has(gid))throw Error(t(gid,'Wait for the current setup or request to finish.','Warte, bis das aktuelle Setup oder der Auftrag fertig ist.'));
        setupLocks.add(gid);try{const id=i.options.getChannel('channel',true)?.id;if(!snowflake(id))throw Error('Invalid channel.');const conflicts=await restore(i.guild,id);return say(i,t(gid,`✅ Saved write permissions restored. ${conflicts} later permission change(s) were preserved.`,`✅ Gespeicherte Schreibrechte wiederhergestellt. ${conflicts} spätere Rechteänderung(en) wurden erhalten.`));}finally{setupLocks.delete(gid);}
      }
      throw Error('Unknown raid-protection command.');
    });}catch(error){await say(i,'❌ '+String(error.message||error).slice(0,1400));}return true;
  }
  async function tick(){for(const guild of client.guilds.cache.values()){if(!isGuildApproved(guild.id)||setupLocks.has(guild.id))continue;await serial(guild.id,async()=>{
    for(const r of Object.values(state(guild.id).locks)){if(!r||typeof r!=='object'){console.warn('Invalid saved raid snapshot:',guild.id);continue;}if((r.retryAt||0)>now()||r.status==='active'&&r.expiresAt>now())continue;
      if(setupLocks.has(guild.id))break;setupLocks.add(guild.id);try{await restore(guild,r.channelId,true);}catch(error){console.warn('Raid protection restoration pending:',guild.id,r.channelId,error.code||error.message);}finally{setupLocks.delete(guild.id);}}
  }).catch(error=>console.warn('Raid restoration guild check failed:',guild.id,error.code||error.message));}}
  return {handleInteraction,tick,state,previews};
}
module.exports={KEYS,MASK,snapshot,fingerprint,patchesFor,applyPatches,validPatches,simulation,buildCommands,createRaidSecurity};
