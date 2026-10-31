'use strict';
const {SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,EmbedBuilder,MessageFlags,PermissionFlagsBits:P,ChannelType}=require('discord.js');
const crypto=require('node:crypto'),locale=require('./localization');
const ID=/^\d{17,20}$/,TOKEN=/^[a-f0-9]{24}$/;
const FORMS=Object.freeze({
  application:{en:'Moderator application',de:'Mod-Bewerbung',fields:[['role','Role / area you want','Gewünschte Rolle / Bereich'],['motivation','Why do you want to join the team?','Warum möchtest du ins Team?'],['experience','Relevant experience (or none yet)','Erfahrung (oder noch keine)'],['availability','Available times and weekly hours','Zeiten und Wochenstunden'],['scenario','How would you handle spam or a conflict?','Umgang mit Spam oder einem Konflikt?']]},
  bug:{en:'Bug report',de:'Fehlermeldung',fields:[['where','Game, feature or command affected','Betroffenes Spiel / Feature / Befehl'],['steps','Steps to reproduce the problem','Schritte zum Nachstellen'],['expected','What did you expect to happen?','Was sollte passieren?'],['actual','What happened? Include the error text','Was passiert? Genauer Fehlertext'],['evidence','Device, time and optional evidence links','Gerät, Zeitpunkt, optionale Belege']]},
  report:{en:'Member / staff report',de:'Mitglied / Teammitglied melden',fields:[['target','Member ID or message link','Mitglieds-ID oder Nachrichtenlink'],['incident','What happened? Give factual details','Was ist passiert? Konkrete Fakten'],['when','When and where did it happen?','Wann und wo ist es passiert?'],['evidence','Evidence links or where to find proof','Beleglinks oder Fundort der Beweise']]},
  appeal:{en:'Ban appeal',de:'Entbannungsantrag',fields:[['account','Affected Discord / game account ID','Betroffene Discord- / Spielkonto-ID'],['case','Ban reason, date and case ID if known','Banngrund, Datum, bekannte Fall-ID'],['explanation','Explain what happened in your words','Erkläre den Vorfall mit eigenen Worten'],['request','What should the team review?','Was soll das Team prüfen?'],['evidence','Optional evidence or extra context','Optionale Belege / weiterer Kontext']]}
});
const CATEGORY={'staff-application':'application','mod-application':'application','bug-report':'bug','report-player':'report','ban-appeal':'appeal'};
const normalize=s=>String(s||'').slice(0,3000).normalize('NFKC').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').replace(/[_-]+/g,' ');
function detect(text){
  const n=normalize(text);if(!n.trim()||/^(?:```|>)/.test(n)||/^(?:how (?:do|can)|wie kann|was ist|what is)\b/.test(n)||/\b(?:keine?\w*|nicht|not|no|don't|do not)\b.{0,25}\b(?:bewerb\w*|apply|application|apllication)\b/.test(n))return null;
  if(/\b(?:ban\s*appeal|bann\s*appeal|entbann\w*|unban|wurde gebannt|i (?:was|got) banned)\b/.test(n))return 'appeal';
  if(/\b(?:report (?:a |an |the )?(?:player|user|member|mod|staff)|(?:spieler|mitglied|moderator|mod|staff) melden|(?:staff|mod|admin) abuse|gescammt|betrogen)\b/.test(n))return 'report';
  if(/\b(?:mod(?:erator)?|staff|team|support(?:er)?)\b.{0,70}\b(?:appl?i?cation|apllication|appication|apply|bewerb\w*)\b|\b(?:appl?i?cation|apllication|appication|bewerb\w*|apply)\b.{0,70}\b(?:mod(?:erator)?|staff|team|support(?:er)?)\b|\b(?:als mod(?:erator)? bewerben|modbewerbung|teambewerbung|staffbewerbung)\b/.test(n))return 'application';
  if(/\b(?:bug(?: report)?|fehlermeldung|fehler melden|error report|report (?:a )?bug|cannot find module|funktioniert nicht|geht (?:nicht|nd))\b/.test(n))return 'bug';
  return null;
}
function command(){return new SlashCommandBuilder().setName('ticketform').setDescription('Automatic ticket forms and a manual form choice').setDMPermission(false)
  .addSubcommand(s=>s.setName('status').setDescription('Show whether automatic ticket forms are enabled'))
  .addSubcommand(s=>s.setName('config').setDescription('Enable or disable automatic forms; needs Manage Server').addBooleanOption(o=>o.setName('enabled').setDescription('Automatic local topic detection').setRequired(true)))
  .addSubcommand(s=>s.setName('offer').setDescription('Offer a form inside this existing private ticket').addStringOption(o=>o.setName('type').setDescription('Form topic').setRequired(true).addChoices(...Object.entries(FORMS).map(([value,f])=>({name:f.en,value})))));}
function validate(state){
  if(state===undefined)return null;
  if(!state||typeof state!=='object'||Array.isArray(state)||state.version!==1||!Object.hasOwn(FORMS,state.type)||!TOKEN.test(state.token)||!['posting','offered','dismissed','submitted','uncertain'].includes(state.status)||!Number.isFinite(state.createdAt)||state.panelId!==undefined&&!ID.test(state.panelId))throw Error('Invalid saved ticket form; preserve the ticket data.');
  if(state.session&&(!TOKEN.test(state.session.token)||!ID.test(state.session.userId)||!Number.isFinite(state.session.at)||!['en','de'].includes(state.session.language)))throw Error('Invalid saved form session.');
  if(state.submission&&(!ID.test(state.submission.id)||!['sending','posted','uncertain'].includes(state.submission.status)||!Array.isArray(state.submission.answers)||state.submission.answers.length>5||state.submission.answers.some(a=>typeof a!=='string'||a.length>800)))throw Error('Invalid saved form submission.');return state;
}
function clean(value){return String(value||'').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\b(?:mfa\.[\w-]{30,}|[\w-]{23,30}\.[\w-]{6}\.[\w-]{25,}|AIza[\w-]{30,}|sk-[\w-]{20,})\b/g,'[redacted]').replace(/((?:api[_ -]?key|token|password|passwort|client[_ -]?secret)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]');}
function createTicketIntake(ctx={}){
  const now=ctx.now||Date.now,locks=new Set(),recoveries=new Map(),commandTimes=new Map();
  const lang=gid=>ctx.languageFor?.(gid)||locale.languageFor(gid),t=(gid,en,de)=>lang(gid)==='de'?de:en;
  const record=cid=>ctx.getTicket(cid);
  function enabled(gid){const value=ctx.guildData(gid).ticketForms;if(value===undefined)return true;if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Error('Invalid saved ticket-form settings.');return value.enabled;}
  function commit(ticket,fn){const had=Object.hasOwn(ticket,'intake'),previous=ticket.intake,next=previous===undefined?undefined:structuredClone(validate(previous));ticket.intake=fn(next);try{ctx.saveDB();return ticket.intake;}catch(e){if(had)ticket.intake=previous;else delete ticket.intake;throw e;}}
  function active(gid,cid,uid){const ticket=record(cid);if(!ctx.isGuildApproved?.(gid)||ctx.isMaintenance?.()||!ticket||ticket.guildId!==gid||ticket.status==='closed'||ticket.ignoredAsSystemChannel||!ID.test(ticket.ownerId)||uid&&ticket.ownerId!==uid||ctx.isProtected?.(gid,cid))throw Error(t(gid,'This private ticket is unavailable.','Dieses private Ticket ist nicht verfügbar.'));return ticket;}
  async function fresh(guild,cid,uid,{manager=false,staff=false}={}){
    const ticket=active(guild.id,cid,staff?null:uid);
    const [member,bot,channel]=await Promise.all([guild.members.fetch({user:uid,force:true}),guild.members.fetchMe({force:true}),guild.channels.fetch(cid,{force:true})]);await guild.roles.fetch();
    if(!member||member.id!==uid||!channel||channel.guildId!==guild.id||![ChannelType.GuildText,ChannelType.PublicThread,ChannelType.PrivateThread,ChannelType.AnnouncementThread].includes(channel.type))throw Error('Ticket channel unavailable.');
    if(channel.isThread?.()||[ChannelType.PublicThread,ChannelType.PrivateThread,ChannelType.AnnouncementThread].includes(channel.type)){const parent=await guild.channels.fetch(channel.parentId,{force:true});if(!parent||parent.guildId!==guild.id)throw Error('Thread parent unavailable.');}
    if(channel.type!==ChannelType.PrivateThread&&channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)!==false)throw Error(t(guild.id,'Forms require a private ticket channel.','Formulare brauchen einen privaten Ticketkanal.'));
    const send=[ChannelType.PublicThread,ChannelType.PrivateThread,ChannelType.AnnouncementThread].includes(channel.type)?P.SendMessagesInThreads:P.SendMessages;
    for(const who of [member,bot]){const perms=channel.permissionsFor(who);if(!perms?.has([P.ViewChannel,P.ReadMessageHistory,send])||who.id===bot.id&&!perms.has(P.EmbedLinks))throw Error(t(guild.id,'Missing ticket read/send/embed permissions.','Lese-/Sende-/Embed-Rechte im Ticket fehlen.'));if(channel.type===ChannelType.PrivateThread&&!perms.has(P.ManageThreads)){const threadMember=await channel.members.fetch({member:who.id,force:true,cache:false}).catch(()=>null);if(threadMember?.id!==who.id)throw Error('Private thread membership required.');}}
    const canManage=member.permissions.has(P.ManageGuild)||guild.ownerId===uid||(ID.test(String(ctx.OWNER_ID))&&ctx.OWNER_ID===uid),canStaff=canManage||ctx.isSupportMember?.(member,guild.id);
    if(manager&&!canManage||staff&&uid!==ticket.ownerId&&!canStaff)throw Error(t(guild.id,'Only this ticket’s owner or the support team can choose its form.','Nur der Ticket-Ersteller oder das Support-Team darf das Formular wählen.'));
    active(guild.id,cid,staff?null:uid);return {ticket,member,bot,channel};
  }
  function panel(gid,cid,state){const f=FORMS[state.type],de=lang(gid)==='de';return {content:'📝 **'+(de?f.de:f.en)+'**\n'+t(gid,'I recognized the ticket topic. Use the button to fill in the matching form. Your answers are posted only in this ticket for the team. Do not enter passwords or tokens. The team decides; submitting does not grant a role or approve anything.','Ich habe das Ticket-Thema erkannt. Fülle über den Button das passende Formular aus. Deine Antworten landen nur in diesem Ticket für das Team. Keine Passwörter oder Tokens angeben. Das Team entscheidet; die Abgabe vergibt keine Rolle und genehmigt nichts.'),components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pxintake:open:${cid}:${state.token}`).setLabel(t(gid,'Fill in form','Formular ausfüllen')).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`pxintake:skip:${cid}:${state.token}`).setLabel(t(gid,'Continue without form','Ohne Formular weiter')).setStyle(ButtonStyle.Secondary)),new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`pxintake:choose:${cid}:${state.token}`).setPlaceholder(t(gid,'Different topic? Choose a form','Anderes Thema? Formular wählen')).addOptions(...Object.entries(FORMS).map(([value,f])=>({label:de?f.de:f.en,value,default:value===state.type}))))],allowedMentions:{parse:[]}};}
  async function recover(guild,cid,ticket){
    const at=recoveries.get(cid);if(at!==undefined&&now()-at<60000)return false;recoveries.set(cid,now());while(recoveries.size>5000)recoveries.delete(recoveries.keys().next().value);
    const {channel,bot}=await fresh(guild,cid,ticket.ownerId);const state=validate(ticket.intake),batch=await channel.messages.fetch({limit:30,cache:false});
    const found=[...batch.values()].find(m=>m.author?.id===bot.id&&(m.components||[]).some(r=>(r.components||[]).some(c=>(c.customId||c.custom_id)===`pxintake:open:${cid}:${state.token}`)));
    if(!found)return false;commit(ticket,s=>({...s,status:'offered',panelId:found.id}));return true;
  }
  async function offer(guild,cid,type,{manual=false,actorId=null}={}){
    if(!Object.hasOwn(FORMS,type)||locks.has(cid))return false;locks.add(cid);
    try{
      let ticket=active(guild.id,cid);if(!enabled(guild.id)||!manual&&(!Number.isFinite(ticket.createdAt)||now()-ticket.createdAt>86400000))return false;
      const existing=validate(ticket.intake);if(existing){if(['posting','uncertain'].includes(existing.status))return await recover(guild,cid,ticket);return false;}
      const {channel}=await fresh(guild,cid,actorId||ticket.ownerId,{staff:manual});ticket=active(guild.id,cid);if(!enabled(guild.id)||ticket.intake!==undefined)return false;
      const state={version:1,type,token:crypto.randomBytes(12).toString('hex'),status:'posting',createdAt:now()};commit(ticket,()=>state);
      let sent;try{sent=await channel.send({...panel(guild.id,cid,state),nonce:crypto.createHash('sha256').update(cid+':'+state.token).digest('hex').slice(0,24),enforceNonce:true});}catch{try{commit(ticket,s=>({...s,status:'uncertain'}));}catch{}return false;}
      try{commit(ticket,s=>({...s,status:'offered',panelId:sent.id}));}catch{/* The saved posting marker is recoverable by its exact component token. */}return true;
    }catch{return false;}finally{locks.delete(cid);}
  }
  async function onMessage(message){
    if(message?.author?.bot!==false||message.webhookId||!message.guild||message.createdTimestamp&&now()-message.createdTimestamp>300000)return false;
    try{const ticket=active(message.guild.id,message.channel.id,message.author.id);if(!enabled(message.guild.id)||ticket.intake!==undefined)return false;const type=CATEGORY[ticket.category]||detect(message.content);if(!type)return false;const made=await offer(message.guild,message.channel.id,type);return made&&!['report','appeal'].includes(type);}catch{return false;}
  }
  function modal(gid,cid,state,session){const de=session.language==='de',form=FORMS[state.type],m=new ModalBuilder().setCustomId(`pxintake:submit:${cid}:${session.token}`).setTitle(de?form.de:form.en);form.fields.forEach((f,n)=>m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('f'+n).setLabel(de?f[2]:f[1]).setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(!['evidence','experience'].includes(f[0])))));return m;}
  async function interaction(i){
    const isCommand=i.isChatInputCommand?.()&&i.commandName==='ticketform',component=String(i.customId||'').startsWith('pxintake:');if(!isCommand&&!component)return false;
    const gid=i.guild?.id,reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});let locked=false,cid=i.channelId;
    try{
      if(!gid||!ctx.isGuildApproved?.(gid)||ctx.isMaintenance?.())throw Error(t(gid,'Use this in an approved server outside maintenance.','Nutze das auf einem freigegebenen Server außerhalb der Wartung.'));
      if(isCommand){
        const sub=i.options.getSubcommand();await i.deferReply({flags:MessageFlags.Ephemeral});
        if(sub==='status'){await i.editReply({content:t(gid,'Automatic ticket forms: ','Automatische Ticket-Formulare: ')+enabled(gid),allowedMentions:{parse:[]}});return true;}
        if(sub==='config'){
          const m=await i.guild.members.fetch({user:i.user.id,force:true});await i.guild.roles.fetch();if(!(m.permissions.has(P.ManageGuild)||i.guild.ownerId===i.user.id||ID.test(String(ctx.OWNER_ID))&&ctx.OWNER_ID===i.user.id))throw Error('Manage Server is required.');
          const value=i.options.getBoolean('enabled',true);if(typeof value!=='boolean')throw Error('Invalid configuration.');enabled(gid);const gd=ctx.guildData(gid),previous=gd.ticketForms;gd.ticketForms={enabled:value};try{ctx.saveDB();}catch(e){if(previous===undefined)delete gd.ticketForms;else gd.ticketForms=previous;throw e;}
          await i.editReply({content:t(gid,'Ticket-form setting saved.','Ticket-Formular-Einstellung gespeichert.'),allowedMentions:{parse:[]}});return true;
        }
        if(sub!=='offer')throw Error('Unknown ticket-form command.');const type=i.options.getString('type',true);if(!Object.hasOwn(FORMS,type))throw Error('Unknown form.');await fresh(i.guild,cid,i.user.id,{staff:true});const ok=await offer(i.guild,cid,type,{manual:true,actorId:i.user.id});await i.editReply({content:ok?t(gid,'Matching form offered in this ticket.','Passendes Formular in diesem Ticket angeboten.'):t(gid,'No new form posted. Check settings; an existing, dismissed or submitted form is not duplicated.','Kein neues Formular gepostet. Prüfe die Einstellungen; ein vorhandenes, übersprungenes oder abgegebenes Formular wird nicht dupliziert.'),allowedMentions:{parse:[]}});return true;
      }
      const parts=i.customId.split(':'),action=parts[1],token=parts[3];cid=parts[2];if(parts.length!==4||cid!==i.channelId||!ID.test(cid)||!TOKEN.test(token)||!['open','skip','choose','submit'].includes(action))throw Error('Invalid ticket form.');
      if(locks.has(cid))throw Error(t(gid,'This form is being processed. Wait briefly.','Das Formular wird gerade verarbeitet. Warte kurz.'));locks.add(cid);locked=true;
      const {ticket,channel,bot}=await fresh(i.guild,cid,i.user.id);if(!enabled(gid))throw Error(t(gid,'Ticket forms are disabled.','Ticket-Formulare sind ausgeschaltet.'));const state=validate(ticket.intake);if(!state||state.status!=='offered'||state.submission)throw Error(t(gid,'This form is unavailable or has already been submitted.','Dieses Formular ist nicht verfügbar oder bereits abgegeben.'));
      if(action!=='submit'&&(token!==state.token||i.message?.id!==state.panelId||i.message?.author?.id!==bot.id))throw Error('This button belongs to another form.');
      if(action!=='submit'){
        const key=gid+':'+i.user.id,previous=commandTimes.get(key);if(previous!==undefined&&now()-previous<2000)throw Error(t(gid,'Wait two seconds before using the form controls again.','Warte zwei Sekunden, bevor du das Formular erneut bedienst.'));commandTimes.set(key,now());for(const [k,at]of commandTimes)if(now()-at>60000)commandTimes.delete(k);while(commandTimes.size>5000)commandTimes.delete(commandTimes.keys().next().value);
      }
      if(action==='open'){
        const session={token:crypto.randomBytes(12).toString('hex'),at:now(),userId:i.user.id,language:lang(gid)};commit(ticket,s=>({...s,session}));await i.showModal(modal(gid,cid,state,session));return true;
      }
      if(action==='skip'){commit(ticket,s=>({...s,status:'dismissed',session:undefined}));await i.update({content:t(gid,'Form skipped. Continue describing your request to the team.','Formular übersprungen. Beschreibe dein Anliegen dem Team.'),components:[],allowedMentions:{parse:[]}});return true;}
      if(action==='choose'){const type=i.values?.[0];if(i.values?.length!==1||!Object.hasOwn(FORMS,type))throw Error('Unknown form.');const updated=commit(ticket,s=>({...s,type,session:undefined}));await i.update(panel(gid,cid,updated));return true;}
      const session=state.session;if(!i.isModalSubmit?.()||!session||session.token!==token||session.userId!==i.user.id||now()-session.at>900000||now()<session.at)throw Error(t(gid,'The form expired. Open it again from the ticket button.','Das Formular ist abgelaufen. Öffne es erneut über den Ticket-Button.'));
      const form=FORMS[state.type],answers=form.fields.map((f,n)=>{const value=i.fields.getTextInputValue('f'+n);if(typeof value!=='string'||value.length>800||!['experience','evidence'].includes(f[0])&&!value.trim())throw Error('Check the form fields (maximum 800 characters each).');return clean(value).slice(0,800);});
      if(i.fields.fields&&[...i.fields.fields.keys()].some(k=>!form.fields.some((_,n)=>'f'+n===k)))throw Error('Unexpected form fields.');
      await i.deferReply({flags:MessageFlags.Ephemeral});await fresh(i.guild,cid,i.user.id);if(!enabled(gid))throw Error('Ticket forms are disabled.');
      const submission={id:i.id,at:now(),status:'sending',answers,language:session.language};commit(ticket,s=>({...s,submission,session:undefined}));
      const de=session.language==='de',e=new EmbedBuilder().setColor(0x5865f2).setTitle('📝 '+(de?form.de:form.en)).setDescription((de?'Abgegeben von ':'Submitted by ')+`<@${i.user.id}>`+'\n'+(de?'Das Team prüft die Angaben. Keine automatische Annahme oder Moderationsentscheidung.':'The team reviews these claims. No automatic acceptance or moderation decision.')).addFields(...form.fields.map((f,n)=>({name:de?f[2]:f[1],value:answers[n]||(de?'Nicht angegeben':'Not provided')}))).setTimestamp();
      let sent;try{sent=await locale.withProtectedValues([...answers,...form.fields.flat(),e.data.title,e.data.description],()=>channel.send({embeds:[e],allowedMentions:{parse:[]},nonce:crypto.createHash('sha256').update(cid+':'+i.id).digest('hex').slice(0,24),enforceNonce:true}));}
      catch{try{commit(ticket,s=>({...s,submission:{...s.submission,status:'uncertain'}}));}catch{}throw Error(t(gid,'Your answers are saved, but the Discord post could not be confirmed. Ask the team to check this ticket; no automatic resend.','Deine Antworten sind gespeichert, der Discord-Beitrag ist aber nicht bestätigt. Bitte das Team, das Ticket zu prüfen; kein automatischer Neuversand.'));}
      try{commit(ticket,s=>({...s,status:'submitted',submission:{...s.submission,status:'posted',messageId:sent.id}}));}catch{throw Error(t(gid,'The form was posted, but the final database update failed. The saved attempt prevents duplicate submission.','Das Formular wurde gepostet, aber der letzte Speicherschritt schlug fehl. Der gespeicherte Versuch verhindert eine doppelte Abgabe.'));}
      await i.editReply({content:t(gid,'Form submitted in this ticket. The team can review it.','Formular in diesem Ticket abgegeben. Das Team kann es prüfen.'),allowedMentions:{parse:[]}});
      await channel.messages.fetch(state.panelId).then(m=>m.edit({content:t(gid,'✅ Form submitted. The team will review it here.','✅ Formular abgegeben. Das Team prüft es hier.'),components:[],allowedMentions:{parse:[]}})).catch(()=>{});return true;
    }catch(e){const text='❌ '+String(e.message||'Ticket form unavailable.').slice(0,600);if(i.deferred||i.replied)await i.editReply({content:text,allowedMentions:{parse:[]}}).catch(()=>{});else await reply(text).catch(()=>{});return true;}
    finally{if(locked)locks.delete(cid);}
  }
  return {onMessage,offer,handleInteraction:interaction};
}
module.exports={FORMS,CATEGORY,detect,command,validate,clean,createTicketIntake};
