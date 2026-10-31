'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {SlashCommandBuilder,PermissionFlagsBits:P,MessageFlags,EmbedBuilder}=require('discord.js');
const locale=require('./localization');
const DEFAULTS=Object.freeze({enabled:true,action:'ban',messageLimit:30,windowSeconds:8,repeatLimit:10,massLimit:3});
const RANGES={messageLimit:[12,60],windowSeconds:[4,20],repeatLimit:[6,20],massLimit:[2,5]},DAY=86400000;
const snowflake=id=>typeof id==='string'&&/^\d{16,22}$/.test(id);
const t=(gid,en,de)=>locale.languageFor(gid)==='de'?de:en;
function settings(gd){
  const root=gd?.botSecurity,out={...DEFAULTS,trustedBotIds:[]};
  if(root===undefined)return out;
  if(!root||typeof root!=='object'||Array.isArray(root)||(root.incidents!==undefined&&!Array.isArray(root.incidents))||(root.settings!==undefined&&(!root.settings||typeof root.settings!=='object'||Array.isArray(root.settings)))||(root.trustedBotIds!==undefined&&(!Array.isArray(root.trustedBotIds)||root.trustedBotIds.some(id=>!snowflake(id))))){out.enabled=false;out.invalid=true;return out;}
  const value=root.settings||{};if(typeof value.enabled==='boolean')out.enabled=value.enabled;
  if(value.action!==undefined)out.action=['ban','kick','alert'].includes(value.action)?value.action:'alert';
  for(const [key,[min,max]]of Object.entries(RANGES))if(Number.isInteger(value[key]))out[key]=Math.max(min,Math.min(max,value[key]));
  out.trustedBotIds=[...new Set(root.trustedBotIds||[])].slice(0,50);return out;
}
function signature(message){
  const parts=[String(message.content||'').slice(0,4000)];
  for(const e of (message.embeds||[]).slice(0,3)){parts.push(String(e.title||'').slice(0,256),String(e.description||'').slice(0,2000));for(const f of (e.fields||[]).slice(0,5))parts.push(String(f.name||'').slice(0,100),String(f.value||'').slice(0,300));}
  return parts.join(' ').slice(0,8000).normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function buildCommands(){return [new SlashCommandBuilder().setName('botsecurity').setDescription('Bot owner: detect and remove spam bots; manage trusted bots').setDMPermission(false)
  .addSubcommand(s=>s.setName('status').setDescription('Show bot-spam settings, trusted IDs and required permissions'))
  .addSubcommand(s=>s.setName('config').setDescription('Configure separate bot-spam protection')
    .addBooleanOption(o=>o.setName('enabled').setDescription('Bot protection is independent of member AutoMod'))
    .addStringOption(o=>o.setName('action').setDescription('Default: ban; fall back to kick when ban is unavailable').addChoices({name:'Ban; otherwise kick when allowed',value:'ban'},{name:'Kick only',value:'kick'},{name:'Delete spam and alert only',value:'alert'}))
    .addIntegerOption(o=>o.setName('messages').setDescription('Messages per bot across channels; default 30').setMinValue(12).setMaxValue(60))
    .addIntegerOption(o=>o.setName('seconds').setDescription('Rate window; default 8 seconds').setMinValue(4).setMaxValue(20))
    .addIntegerOption(o=>o.setName('repeats').setDescription('Repeated content/embeds in 15 seconds; default 10').setMinValue(6).setMaxValue(20))
    .addIntegerOption(o=>o.setName('mass_mentions').setDescription('Actual everyone/here notifications per rate window; default 3').setMinValue(2).setMaxValue(5)))
  .addSubcommand(s=>s.setName('trust').setDescription('Exclude an explicitly trusted bot from automatic spam actions').addUserOption(o=>o.setName('bot').setDescription('An existing bot member').setRequired(true)))
  .addSubcommand(s=>s.setName('untrust').setDescription('Remove a bot ID from the trust list').addStringOption(o=>o.setName('bot_id').setDescription('Exact Discord bot user ID from status').setRequired(true).setMinLength(16).setMaxLength(22)))
  .addSubcommand(s=>s.setName('incidents').setDescription('Show recent bot/webhook incidents and exact action outcomes'))
  .addSubcommand(s=>s.setName('test').setDescription('Run a private local bot/webhook detection simulation'))];}
function createBotSecurity({client,guildData,saveDB,OWNER_ID,isGuildApproved=()=>true,recordPunishment=async()=>{},alert=async()=>{},now=Date.now,maxSenders=10000}={}){
  const senders=new Map(),queues=new Map(),alerts=new Map(),notificationBudgets=new Map(),deletions=new Map(),commandTimes=new Map();maxSenders=Math.max(1,Math.min(10000,Number(maxSenders)||10000));
  function state(gid){const gd=guildData(gid);if(gd.botSecurity===undefined)gd.botSecurity={};const s=gd.botSecurity;
    if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid saved bot-security data. Preserve the database for recovery.');
    if(s.settings===undefined)s.settings={};if(s.trustedBotIds===undefined)s.trustedBotIds=[];if(s.incidents===undefined)s.incidents=[];
    if(!Array.isArray(s.incidents)||!Array.isArray(s.trustedBotIds)||settings(gd).invalid)throw Error('Invalid saved bot-security data. Preserve the database for recovery.');return s;
  }
  function commit(gid,fn){const gd=guildData(gid),previous=structuredClone(state(gid));try{const result=fn(state(gid));saveDB();return result;}catch(error){gd.botSecurity=previous;throw error;}}
  function serial(gid,fn){const next=(queues.get(gid)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(gid,next);return next.finally(()=>{if(queues.get(gid)===next)queues.delete(gid);});}
  function source(message){
    const gid=message.guild?.id,self=client?.user?.id||message.guild?.members?.me?.id;
    if(!gid||!self||!isGuildApproved(gid)||message.author?.id===self||message.author?.id===OWNER_ID)return null;
    const c=settings(guildData(gid));if(!c.enabled)return null;
    if(message.webhookId){if(!snowflake(message.webhookId))return null;if(message.applicationId===message.author?.id&&c.trustedBotIds.includes(message.applicationId))return null;return {gid,id:message.webhookId,kind:'webhook',c};}
    if(message.author?.bot!==true||!snowflake(message.author.id)||c.trustedBotIds.includes(message.author.id))return null;
    return {gid,id:message.author.id,kind:'bot',c};
  }
  function observe(message,{edited=false}={}){
    const sender=source(message);if(!sender)return null;const key=sender.gid+':'+sender.kind+':'+sender.id,at=now();if(Number.isFinite(message.createdTimestamp)&&at-message.createdTimestamp>30000)return null;let s=senders.get(key);
    if(edited)return s&&(s.busy||s.until>at)?{kind:'blocked',sender,state:s,key}:null;
    s||={seen:[],times:[],repeats:[],mass:[],until:0,busy:false};if(s.seen.includes(message.id))return null;
    s.seen=[...s.seen.slice(-79),message.id];s.at=at;senders.delete(key);senders.set(key,s);while(senders.size>maxSenders)senders.delete(senders.keys().next().value);
    if(s.busy||s.until>at)return {kind:'blocked',sender,state:s,key};
    s.times=s.times.filter(n=>at-n<sender.c.windowSeconds*1000);s.times.push(at);
    const text=signature(message),hash=text.length>=12?createHash('sha256').update(text).digest('hex'):null;
    s.repeats=s.repeats.filter(row=>at-row.at<15000);if(hash)s.repeats.push({at,hash});s.repeats=s.repeats.slice(-80);
    s.mass=s.mass.filter(n=>at-n<sender.c.windowSeconds*1000);if(message.mentions?.everyone===true)s.mass.push(at);
    const reason=s.times.length>=sender.c.messageLimit?'bot-message-flood':hash&&s.repeats.filter(r=>r.hash===hash).length>=sender.c.repeatLimit?'bot-repeated-content':s.mass.length>=sender.c.massLimit?'bot-mass-mentions':null;
    if(!reason)return null;s.busy=true;s.until=at+60000;s.times=[];s.repeats=[];s.mass=[];
    return {kind:'offense',sender,state:s,key,reason,at,messageId:message.id,channelId:message.channel?.id};
  }
  async function remove(message,s){
    const me=message.guild.members?.me;if(!message.deletable||!message.delete||!message.channel?.permissionsFor?.(me)?.has(P.ManageMessages))return;
    const at=now(),gid=message.guild.id,old=deletions.get(gid),budget=old&&at-old.at<10000?old:{at,count:0};
    if(!s.deletions||at-s.deletions.at>=10000)s.deletions={at,count:0};if(budget.count>=100||s.deletions.count>=5)return;
    budget.count++;s.deletions.count++;deletions.delete(gid);deletions.set(gid,budget);while(deletions.size>2000)deletions.delete(deletions.keys().next().value);await message.delete().catch(()=>{});
  }
  async function notify(guild,key,text){const at=now(),prior=alerts.get(key);if(prior!==undefined&&at-prior<60000)return;alerts.delete(key);alerts.set(key,at);while(alerts.size>5000)alerts.delete(alerts.keys().next().value);
    const old=notificationBudgets.get(guild.id),budget=old&&at-old.at<10000?old:{at,count:0};if(budget.count>=5)return;budget.count++;notificationBudgets.delete(guild.id);notificationBudgets.set(guild.id,budget);while(notificationBudgets.size>2000)notificationBudgets.delete(notificationBudgets.keys().next().value);await alert(guild,text).catch(()=>{});}
  async function enforce(message,d){
    if(!d)return false;if(d.handled)return true;d.handled=true;
    const current=source(message);if(!current||current.id!==d.sender.id||current.kind!==d.sender.kind){d.state.busy=false;return false;}
    if(d.kind==='blocked'){await remove(message,d.state);return true;}
    try{await serial(current.gid,async()=>{
      if(!source(message)||now()-d.at>30000)return;
      await remove(message,d.state);
      const s=state(current.gid),recent=s.incidents.filter(r=>r&&now()-r.at<DAY),last=recent.findLast(r=>r.targetId===current.id&&r.source===current.kind);
      if(last&&(['attempting','uncertain'].includes(last.status)||now()-last.at<60000))return;
      if(recent.length>=500){await notify(message.guild,current.gid+':capacity',t(current.gid,'Bot-security incident capacity reached. Automatic removals paused; review /botsecurity incidents.','Speichergrenze für Bot-Vorfälle erreicht. Automatisches Entfernen pausiert; prüfe /botsecurity incidents.'));return;}
      if(current.kind==='webhook'){
        commit(current.gid,s=>{s.incidents=recent;s.incidents.push({id:randomUUID(),targetId:current.id,source:'webhook',reason:d.reason,channelId:d.channelId,at:now(),action:'alert',status:'webhook-alert'});});
        await notify(message.guild,d.key,t(current.gid,`Webhook spam detected: ${current.id} in ${d.channelId}. Spam deletion is limited; no member was kicked or banned. Review this webhook.`,`Webhook-Spam erkannt: ${current.id} in ${d.channelId}. Spam wird begrenzt gelöscht; kein Mitglied wurde gekickt oder gebannt. Prüfe diesen Webhook.`));return;
      }
      const [member,me]=await Promise.all([message.guild.members.fetch({user:current.id,force:true}),message.guild.members.fetchMe({force:true})]);
      const fresh=source(message);if(!fresh||now()-d.at>30000||member.id!==current.id||member.user?.bot!==true||member.id===me.id||member.id===OWNER_ID)return;
      let action=fresh.c.action,status='attempting';
      if(action==='ban'&&(!me.permissions.has(P.BanMembers)||member.bannable!==true))action=me.permissions.has(P.KickMembers)&&member.kickable===true?'kick':'alert';
      if(action==='kick'&&(!me.permissions.has(P.KickMembers)||member.kickable!==true))action='alert';
      if(action==='alert')status=fresh.c.action==='alert'?'observed':'blocked-permissions';
      if(action!=='alert'&&recent.filter(r=>['ban','kick'].includes(r.action)&&now()-r.at<60000).length>=10){await notify(message.guild,current.gid+':rate',t(current.gid,'Bot-security removal limit reached: 10 action attempts per minute. Review the raid and use /raid lock if needed.','Bot-Schutzlimit erreicht: zehn Aktionsversuche pro Minute. Prüfe den Raid und nutze bei Bedarf /raid lock.'));return;}
      const id=randomUUID(),record={id,targetId:current.id,source:'bot',reason:d.reason,channelId:d.channelId,messageId:d.messageId,at:now(),action,status};
      commit(current.gid,s=>{s.incidents=recent;s.incidents.push(record);});
      if(action==='alert'){await notify(message.guild,d.key,t(current.gid,`Bot spam detected: ${current.id} (${d.reason}). ${status==='blocked-permissions'?'Removal blocked by permissions or role hierarchy.':'Configured for alerts only.'}`,`Bot-Spam erkannt: ${current.id} (${d.reason}). ${status==='blocked-permissions'?'Entfernen durch fehlende Rechte oder Rollenhierarchie blockiert.':'Nur Meldungen sind konfiguriert.'}`));return;}
      try{
        const reason='Pixel bot-spam protection: '+d.reason;
        if(action==='ban')await member.ban({deleteMessageSeconds:0,reason});else await member.kick(reason);
      }catch(error){
        const known=[50013,50001,10007].includes(Number(error.code)),outcome=known?'failed':'uncertain';
        try{commit(current.gid,()=>{record.status=outcome;record.errorCode=Number(error.code)||null;});}catch{}
        await notify(message.guild,d.key,t(current.gid,`Bot-spam ${action} ${outcome}: ${current.id}. No successful removal is claimed. Check permissions, hierarchy and /botsecurity incidents.`,`Bot-Spam-Aktion ${action}: ${outcome} für ${current.id}. Erfolgreiches Entfernen wird nicht behauptet. Prüfe Rechte, Rollenhierarchie und /botsecurity incidents.`));return;
      }
      try{commit(current.gid,()=>{record.status=action==='ban'?'banned':'kicked';record.completedAt=now();});}
      catch{await notify(message.guild,d.key,t(current.gid,`Bot ${current.id} was ${action==='ban'?'banned':'kicked'}, but saving the final outcome failed. Do not replay the removal.`,`Bot ${current.id} wurde ${action==='ban'?'gebannt':'gekickt'}, aber der Endstand konnte nicht gespeichert werden. Wiederhole das Entfernen nicht.`));return;}
      await recordPunishment(message.guild,current.id,null,action,0,d.reason,'bot-spam').catch(()=>{});
      await notify(message.guild,d.key,t(current.gid,`Spam bot ${current.id} ${action==='ban'?'banned':'kicked'} (${d.reason}).`,`Spam-Bot ${current.id} ${action==='ban'?'gebannt':'gekickt'} (${d.reason}).`));
    });}catch(error){await notify(message.guild,d.key,t(current.gid,`Bot-spam protection could not complete for ${current.id}. Check storage, Discord permissions and the incident log. No successful removal is claimed.`,`Bot-Spam-Prüfung für ${current.id} nicht abgeschlossen. Prüfe Speicher, Discord-Rechte und Vorfallsprotokoll. Erfolgreiches Entfernen wird nicht behauptet.`));}
    finally{d.state.busy=false;}return true;
  }
  function localTest(gd){return ['messages','repeats','webhook'].map(scenario=>{
    let clock=1000;const clone=structuredClone(gd),fake=createBotSecurity({client:{user:{id:'999999999999999991'}},guildData:()=>clone,saveDB:()=>{throw Error('Simulation must not save.');},OWNER_ID:'999999999999999992',now:()=>clock}),guild={id:'999999999999999993',members:{me:{id:'999999999999999991'}}};let first=null;
    for(let n=1;n<=80;n++){clock+=20;const decision=fake.observe({id:'sim-'+n,guild,author:{id:'999999999999999994',bot:true},webhookId:scenario==='webhook'?'999999999999999995':null,content:scenario==='repeats'?'same local bot simulation content':'local bot simulation '+n,mentions:{everyone:false},channel:{id:'999999999999999996'}});if(decision){first=n;break;}}
    return {scenario,first,samples:80};
  });}
  async function handleInteraction(i){
    if(!i.isChatInputCommand?.()||i.commandName!=='botsecurity')return false;
    if(!snowflake(OWNER_ID)||i.user?.id!==OWNER_ID){await i.reply({content:'Only the configured bot owner can change bot-spam protection.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;}
    if(!i.guild||!isGuildApproved(i.guild.id)){await i.reply({content:'Use this command in an approved server.',flags:MessageFlags.Ephemeral});return true;}
    await i.deferReply({flags:MessageFlags.Ephemeral});const gid=i.guild.id;
    try{await serial(gid,async()=>{
      await i.guild.members.fetch({user:i.user.id,force:true});const sub=i.options.getSubcommand(),c=settings(guildData(gid));
      const previous=commandTimes.get(gid);if(previous!==undefined&&now()-previous<2000)throw Error('Please wait two seconds between bot-security requests.');commandTimes.delete(gid);commandTimes.set(gid,now());while(commandTimes.size>2000)commandTimes.delete(commandTimes.keys().next().value);
      const say=content=>i.editReply({content,allowedMentions:{parse:[]}});
      if(sub==='test')return say(t(gid,'🧪 Local bot detection only; no messages or moderation actions sent.\n','🧪 Nur lokale Bot-Erkennung; keine Nachrichten oder Moderationsaktionen gesendet.\n')+localTest(guildData(gid)).map(r=>`${r.scenario}: ${r.first??t(gid,'disabled / no detection','ausgeschaltet / keine Erkennung')} / ${r.samples}`).join('\n'));
      if(sub==='config'){
        const next={...c};delete next.trustedBotIds;delete next.invalid;const active=i.options.getBoolean('enabled'),action=i.options.getString('action');if(active!==null&&active!==undefined)next.enabled=active;if(action!==null&&action!==undefined){if(!['ban','kick','alert'].includes(action))throw Error('Invalid bot-spam action.');next.action=action;}
        for(const [name,key]of [['messages','messageLimit'],['seconds','windowSeconds'],['repeats','repeatLimit'],['mass_mentions','massLimit']]){const value=i.options.getInteger(name);if(value===null||value===undefined)continue;const [min,max]=RANGES[key];if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid bot-spam threshold.');next[key]=value;}
        commit(gid,s=>{s.settings=next;});return say(t(gid,'✅ Bot-spam protection settings saved.','✅ Einstellungen für Bot-Spam-Schutz gespeichert.'));
      }
      if(sub==='trust'){
        const user=i.options.getUser('bot',true),member=await i.guild.members.fetch({user:user.id,force:true});if(!snowflake(user.id)||!member.user?.bot)throw Error('Choose a current bot member.');if(user.id===client.user?.id)return say(t(gid,'Pixel is always protected from self-moderation.','Pixel ist immer vor Selbstmoderation geschützt.'));
        if(!c.trustedBotIds.includes(user.id)&&c.trustedBotIds.length>=50)throw Error('At most 50 trusted bot IDs.');commit(gid,s=>{s.trustedBotIds=[...new Set([...c.trustedBotIds,user.id])];});return say(t(gid,`✅ Trusted bot: <@${user.id}>.`,`✅ Vertrauenswürdiger Bot: <@${user.id}>.`));
      }
      if(sub==='untrust'){const id=i.options.getString('bot_id',true);if(!snowflake(id))throw Error('Enter an exact Discord bot ID.');commit(gid,s=>{s.trustedBotIds=c.trustedBotIds.filter(uid=>uid!==id);});return say(t(gid,`✅ Bot ${id} removed from the trust list.`,`✅ Bot ${id} aus der Vertrauensliste entfernt.`));}
      if(sub==='incidents'){const records=state(gid).incidents.slice(-15).reverse();return say(t(gid,'Recent bot/webhook incidents\n','Letzte Bot-/Webhook-Vorfälle\n')+(records.map(r=>`${r.targetId} · ${r.source} · ${r.action} · **${r.status}** · <t:${Math.floor(r.at/1000)}:R>`).join('\n')||t(gid,'No incidents recorded.','Keine Vorfälle gespeichert.')));}
      if(sub!=='status')throw Error('Unknown bot-security command.');
      const me=await i.guild.members.fetchMe({force:true}),e=new EmbedBuilder().setTitle(t(gid,'🤖 Bot-spam protection','🤖 Bot-Spam-Schutz')).setColor(c.enabled?0x5865f2:0xe67e22).setDescription(t(gid,`**Enabled:** ${c.enabled}\n**Action:** ${c.action}\n**Rate:** ${c.messageLimit}/${c.windowSeconds}s across channels\n**Repeats:** ${c.repeatLimit}/15s · **Mass mentions:** ${c.massLimit}/${c.windowSeconds}s\n**Ban Members:** ${me.permissions.has(P.BanMembers)} · **Kick Members:** ${me.permissions.has(P.KickMembers)}\nPixel is exempt. Other admin bots are checked. Role hierarchy still applies. Webhook spam is deleted within limits and reported; webhooks are never treated as members.`,`**Aktiv:** ${c.enabled}\n**Aktion:** ${c.action}\n**Rate:** ${c.messageLimit}/${c.windowSeconds}s über alle Kanäle\n**Wiederholungen:** ${c.repeatLimit}/15s · **Massen-Pings:** ${c.massLimit}/${c.windowSeconds}s\n**Mitglieder bannen:** ${me.permissions.has(P.BanMembers)} · **Mitglieder kicken:** ${me.permissions.has(P.KickMembers)}\nPixel ist ausgenommen. Andere Admin-Bots werden geprüft. Die Rollenhierarchie gilt weiterhin. Webhook-Spam wird begrenzt gelöscht und gemeldet; Webhooks werden nie als Mitglieder behandelt.`));
      for(let n=0;n<Math.max(1,c.trustedBotIds.length);n+=20)e.addFields({name:t(gid,'Trusted bots','Vertrauenswürdige Bots')+(n?' · '+(n/20+1):''),value:c.trustedBotIds.slice(n,n+20).map(id=>`<@${id}> · ${id}`).join('\n')||t(gid,'None','Keine')});
      await i.editReply({embeds:[e],allowedMentions:{parse:[]}});
    });}catch(error){await i.editReply({content:'❌ '+String(error.message||'Bot-security request failed.').slice(0,1000),allowedMentions:{parse:[]}});}return true;
  }
  return {observe,enforce,handleInteraction,localTest,state,size:()=>senders.size};
}
module.exports={DEFAULTS,settings,signature,buildCommands,createBotSecurity};
