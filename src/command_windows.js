'use strict';
const {randomUUID}=require('node:crypto');
const {PermissionFlagsBits:P,ChannelType,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');
const l10n=require('./localization'),actions=require('./new_actions');
const FIELDS={direct_message:['member','text'],action_panel:['target','name','text','color','buttons'],delete_panel:['panel']};
const DANGEROUS=require('./invite_rewards').DANGEROUS;
const allowedMentions={parse:[],repliedUser:false};
const t=(gid,en,de)=>l10n.languageFor(gid)==='de'?de:en;
const buttonFields={role:['label','type','role','mode'],ticket:['label','type'],link:['label','type','url'],reply:['label','type','text'],request:['label','type','request'],form:['label','type','fields','destination']};
function string(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('Invalid '+label+'.');return value;}
function url(value){string(value,500,'link');let parsed;try{parsed=new URL(value);}catch{throw Error('Use a complete HTTPS link.');}if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Use an HTTPS link without embedded credentials.');return value;}
function validateAction(a){
  if(!a||!Object.hasOwn(FIELDS,a.kind)||Object.keys(a).some(k=>k!=='kind'&&!FIELDS[a.kind].includes(k)))throw Error('Unsupported window or message action.');
  if(a.kind==='direct_message')return {kind:a.kind,member:string(a.member,100,'recipient').trim(),text:string(a.text,1800,'message')};
  if(a.kind==='delete_panel'){const id=string(a.panel,36,'window ID');if(!/^[a-f\d-]{36}$/i.test(id))throw Error('Use the window ID from its footer.');return {kind:a.kind,panel:id};}
  const out={kind:a.kind,target:string(a.target,100,'channel').trim(),name:string(a.name,100,'window title'),buttons:[]};
  if(a.text!==undefined)out.text=string(a.text,1800,'window description');if(a.color!==undefined){if(!/^#[\da-f]{6}$/i.test(a.color))throw Error('Use #RRGGBB for the window color.');out.color=a.color;}
  if(!Array.isArray(a.buttons)||!a.buttons.length||a.buttons.length>10)throw Error('A window needs one to ten buttons.');
  for(const b of a.buttons){if(!b||!Object.hasOwn(buttonFields,b.type)||Object.keys(b).some(k=>!buttonFields[b.type].includes(k)))throw Error('Unsupported button configuration.');const clean={type:b.type,label:string(b.label,80,'button label')};
    if(b.type==='role'){clean.role=string(b.role,100,'role').trim();clean.mode=b.mode||'toggle';if(!['add','remove','toggle'].includes(clean.mode))throw Error('Choose add, remove or toggle for a role button.');}
    if(b.type==='link')clean.url=url(b.url);
    if(b.type==='reply')clean.text=string(b.text,1800,'button reply');
    if(b.type==='request')clean.request=string(b.request,1000,'button request');
    if(b.type==='form'){if(!Array.isArray(b.fields)||!b.fields.length||b.fields.length>5)throw Error('A form needs one to five field labels.');clean.fields=b.fields.map(f=>string(f,45,'form label'));clean.destination=string(b.destination,100,'form destination').trim();}
    out.buttons.push(clean);
  }
  return out;
}
const schemaProperties={panel:{type:'string'},buttons:{type:'array',maxItems:10,items:{type:'object',required:['type','label'],properties:{type:{type:'string',enum:Object.keys(buttonFields)},label:{type:'string'},role:{type:'string'},mode:{type:'string',enum:['add','remove','toggle']},url:{type:'string'},text:{type:'string'},request:{type:'string'},fields:{type:'array',maxItems:5,items:{type:'string'}},destination:{type:'string'}}}}};
const HELP='action_panel creates a Discord window: target=currentChannel if unspecified, name=title, optional text/color, buttons=1–10 objects. Button types: role(label,role,mode:add/remove/toggle), ticket(label), link(label,url HTTPS), reply(label,text), request(label,request), form(label,fields:1–5 labels,destination channel). User labels and messages are literal data. Request buttons run as the clicking user with a new review and their current permissions. Self-role buttons cannot grant staff permissions or protected roles. direct_message needs member (one explicit user ID or self) and exact text; at most five explicit recipients per plan, no group DMs. All messages need a recipient/content preview and confirmation. delete_panel needs the window ID shown in its footer. Do not execute code or invent functionality.';
function createCommandWindows(ctx){
  const now=ctx.now||Date.now,busy=new Set(),forms=new Map(),cooldowns=new Map(),formCooldowns=new Map();
  function data(gid){const gd=ctx.guildData(gid);gd.commandWindows||={};const d=gd.commandWindows;d.panels||={};if(!Array.isArray(d.dmAttempts))d.dmAttempts=[];return d;}
  function manager(state,i){return i.user.id===state.guild.ownerId||ctx.isBotOwner?.(i)||Boolean(ctx.canManageBotSettings?.({...i,member:state.member,memberPermissions:state.member.permissions})??state.member.permissions.has(P.ManageGuild));}
  function requireManager(state,i){if(!manager(state,i))throw Error(t(state.guild.id,'Manage Server is required for this action.','Für diese Aktion brauchst du Server verwalten.'));}
  function resolveChannel(state,ref){const id=String(ref).replace(/^<#(\d+)>$/,'$1'),found=state.channels.filter(c=>c.id===id||c.name===ref);if(found.length!==1)throw Error('Mention one exact channel.');return found[0];}
  function channelAccess(state,channel,{creator=true}={}){if(![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel?.type))throw Error('Choose a server text channel.');if(!channel.permissionsFor(state.bot)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('Pixel needs View Channel, Send Messages and Embed Links in the destination.');if(creator&&!channel.permissionsFor(state.member)?.has([P.ViewChannel,P.SendMessages]))throw Error('You cannot publish in this destination.');}
  function safeRole(state,ref,i){const r=actions.role(state,ref),protectedIds=[ctx.guildData(state.guild.id).supportRoleId,...(ctx.protectedRoleIds?.(state.guild.id)||[])];
    const privilegedOverwrite=state.channels.some(ch=>{const entry=ch.permissionOverwrites?.cache?.get(r.id);return entry&&(BigInt(entry.allow?.bitfield||0)&DANGEROUS)!==0n;});
    if(r.id===state.guild.id||r.managed||r.editable===false||protectedIds.includes(r.id)||privilegedOverwrite||(BigInt(r.permissions.bitfield)&DANGEROUS)!==0n)throw Error('Staff, system and privileged roles cannot be self-role buttons.');
    if(!state.bot.permissions.has(P.ManageRoles)||r.position>=state.bot.roles.highest.position)throw Error('The self-role must be below Pixel; Pixel needs Manage Roles.');
    if(!String(r.id).startsWith('planned-role-')&&i.user.id!==state.guild.ownerId&&!ctx.isBotOwner?.(i)&&state.member.roles?.highest&&r.position>=state.member.roles.highest.position)throw Error('The self-role must be below your highest role.');return r;
  }
  function recipientId(ref,i){const id=ref==='self'?i.user.id:String(ref).replace(/^<@!?(\d+)>$/,'$1');if(!/^\d{1,22}$/.test(id))throw Error('Mention one specific member or use their Discord ID.');return id;}
  function quota(gid,actor,target,planning=0){const recent=data(gid).dmAttempts.filter(row=>now()-row.at<3600000),rows=recent.filter(row=>row.actorId===actor);if(recent.length+planning>=2000)throw Error('The server DM capacity is busy. Try again later.');if(rows.some(row=>row.targetId===target&&now()-row.at<60000))throw Error('Wait one minute before messaging this member again.');if(rows.length+planning>=20||rows.filter(row=>now()-row.at<60000).length+planning>=5)throw Error('The DM limit is five per minute and twenty per hour.');}
  async function preflight(state,a,i,{planning=false}={}){
    if(a.kind==='direct_message'){
      const id=recipientId(a.member,i);if(id!==i.user.id)requireManager(state,i);const member=await state.guild.members.fetch({user:id,force:true});if(!member||member.user?.bot)throw Error('Choose a human member of this server.');
      const simulate=planning?(state.windowDMs||=[]):[];if(simulate.includes(id))throw Error('A recipient may only appear once in a DM plan.');quota(state.guild.id,i.user.id,id,simulate.length);if(planning)simulate.push(id);
      (state.windowRecipients||=new Map()).set(id,member);return member;
    }
    requireManager(state,i);
    if(a.kind==='delete_panel'){const p=data(state.guild.id).panels[a.panel];if(!p||p.guildId!==state.guild.id)throw Error('Window not found in this server.');const ch=resolveChannel(state,p.channelId);channelAccess(state,ch);if(planning){state.windowDeleted||=new Set();if(state.windowDeleted.has(p.id))throw Error('The same window is listed twice.');state.windowDeleted.add(p.id);if(p.status==='active'||p.status==='publishing')state.windowPanelDelta=(state.windowPanelDelta||0)-1;}return p;}
    const channel=resolveChannel(state,a.target);channelAccess(state,channel);if(Object.values(data(state.guild.id).panels).filter(p=>p.status==='active'||p.status==='publishing').length+(planning?(state.windowPanelDelta||0):0)>=50)throw Error('At most 50 active windows per server. Remove one first.');if(planning)state.windowPanelDelta=(state.windowPanelDelta||0)+1;
    for(const b of a.buttons){if(b.type==='role')safeRole(state,b.role,i);if(b.type==='form')channelAccess(state,resolveChannel(state,b.destination));if(b.type==='ticket'&&!ctx.openTicket)throw Error('Ticket integration is unavailable.');if(b.type==='request'&&!ctx.getAssistant)throw Error('Request integration is unavailable.');}
    return channel;
  }
  function render(p){const rows=[];for(let offset=0;offset<p.buttons.length;offset+=5)rows.push(new ActionRowBuilder().addComponents(p.buttons.slice(offset,offset+5).map((b,n)=>{const button=new ButtonBuilder().setLabel(b.label);return b.type==='link'?button.setStyle(ButtonStyle.Link).setURL(b.url):button.setCustomId(`pxwindow:click:${p.id}:${offset+n}`).setStyle(b.type==='role'?(b.mode==='remove'?ButtonStyle.Danger:ButtonStyle.Success):ButtonStyle.Primary);})));const embed=new EmbedBuilder().setTitle(p.name).setColor(p.color?parseInt(p.color.slice(1),16):0x5865f2).setDescription(p.text||t(p.guildId,'Choose an option below.','Wähle unten eine Option.')).setFooter({text:t(p.guildId,'Pixel · Window ID: ','Pixel · Fenster-ID: ')+p.id});if(p.buttons.some(b=>b.type==='form'))embed.addFields({name:t(p.guildId,'Forms','Formulare'),value:t(p.guildId,'Submitting a form sends your answers to the destination configured by this server.','Mit dem Absenden werden deine Antworten an den vom Server festgelegten Zielkanal gesendet.')});return {embeds:[embed],components:rows,allowedMentions};}
  async function execute(state,a,i,effectKey){
    const result=await preflight(state,a,i),gid=state.guild.id,d=data(gid);
    if(a.kind==='direct_message'){
      if(d.dmAttempts.some(row=>row.effectKey===effectKey))throw Error('This DM was already attempted. Check its saved status before requesting another.');
      const entry={effectKey,actorId:i.user.id,targetId:result.id,at:now(),status:'attempting'};const old=d.dmAttempts;d.dmAttempts=[...old.filter(row=>now()-row.at<86400000),entry].slice(-5000);try{ctx.saveDB();}catch(error){d.dmAttempts=old;throw error;}
      try{const payload={content:a.text,embeds:[new EmbedBuilder().setDescription(t(gid,`Requested by <@${i.user.id}> in **${state.guild.name||gid}**.`,`Angefordert von <@${i.user.id}> auf **${state.guild.name||gid}**.`))],allowedMentions};const message=await l10n.withProtectedValues([a.text],()=>result.send(payload));entry.status='sent';entry.messageId=message.id;ctx.saveDB();return t(gid,`✅ DM delivered to <@${result.id}> (${result.id}).`,`✅ DM an <@${result.id}> (${result.id}) zugestellt.`);}
      catch(error){if(entry.status!=='sent'){entry.status='failed';try{ctx.saveDB();}catch{}}throw Error(entry.status==='sent'?'The DM was delivered, but saving the result failed. Do not resend it.':t(gid,'The DM could not be delivered. The member may have closed DMs.','Die DM konnte nicht zugestellt werden. Das Mitglied hat möglicherweise DMs deaktiviert.'));}
    }
    if(a.kind==='delete_panel'){
      const p=result,old=p.status;p.status='disabling';try{ctx.saveDB();}catch(error){p.status=old;throw error;}
      try{const channel=resolveChannel(state,p.channelId);const msg=await channel.messages.fetch(p.messageId);if(msg.author?.id&&msg.author.id!==state.bot.id)throw Error('This message is not owned by Pixel.');await msg.edit({components:[]});}catch(error){if(Number(error.code)!==10008)throw error;}
      p.status='disabled';p.disabledAt=now();ctx.saveDB();return '✅ Window disabled: '+p.id;
    }
    const buttons=a.buttons.map(b=>({...b,...b.type==='role'?{role:safeRole(state,b.role,i).id}:{},...b.type==='form'?{destination:resolveChannel(state,b.destination).id}:{}}));
    const p={...a,buttons,id:randomUUID(),guildId:gid,channelId:result.id,creatorId:i.user.id,status:'publishing',createdAt:now()};delete p.kind;delete p.target;
    for(const [id,old]of Object.entries(d.panels))if(old.status==='disabled'&&now()-(old.disabledAt||old.createdAt)>30*86400000)delete d.panels[id];
    d.panels[p.id]=p;try{ctx.saveDB();}catch(error){delete d.panels[p.id];throw error;}
    let message;try{message=await l10n.withProtectedValues([p.name,p.text||'',...p.buttons.map(b=>b.label)],()=>l10n.withLiteralUI(p.buttons.map(b=>b.label),()=>result.send(render(p))));p.messageId=message.id;p.status='active';ctx.saveDB();}catch(error){p.status='failed';if(message)await message.delete().catch(()=>{});try{ctx.saveDB();}catch{}throw error;}
    return t(gid,`✅ Window created in <#${result.id}> · ID: ${p.id}`,`✅ Fenster in <#${result.id}> erstellt · ID: ${p.id}`);
  }
  function describe(a,state){const gid=state.guild.id;if(a.kind==='direct_message'){const id=recipientId(a.member,{user:state.member}),m=state.windowRecipients?.get(id);return t(gid,`✉️ DM to ${m?.displayName||id} · <@${id}> · ID ${id}\n${a.text}`,`✉️ DM an ${m?.displayName||id} · <@${id}> · ID ${id}\n${a.text}`);}if(a.kind==='delete_panel')return '🗑️ '+t(gid,'Disable window ','Fenster deaktivieren ')+a.panel;return `🪟 **${a.name}** → <#${resolveChannel(state,a.target).id}>\n`+(a.text?a.text+'\n':'')+a.buttons.map(b=>`• **${b.label}** → `+(b.type==='role'?`${b.mode} <@&${safeRole(state,b.role,{user:state.member}).id}>`:b.type==='form'?`${b.fields.join(', ')} → <#${resolveChannel(state,b.destination).id}>`:b.type==='link'?b.url:b.type==='request'?b.request:b.type==='reply'?b.text:t(gid,'Open a support ticket','Support-Ticket öffnen'))).join('\n');}
  async function fresh(guild,userId){const [member,bot,channels,roles]=await Promise.all([guild.members.fetch({user:userId,force:true}),guild.members.fetchMe({force:true}),guild.channels.fetch(),guild.roles.fetch()]);return {guild,member,bot,channels:[...channels.values()].filter(Boolean),roles:[...roles.values()].filter(Boolean)};}
  function bound(i,p){return p&&p.status==='active'&&p.guildId===i.guild?.id&&p.channelId===(i.channelId||i.channel?.id)&&p.messageId===i.message?.id;}
  async function checkPanel(i,p,b){const state=await fresh(i.guild,i.user.id),channel=resolveChannel(state,p.channelId);channelAccess(state,channel,{creator:false});if(!channel.permissionsFor(state.member)?.has(P.ViewChannel))throw Error('This window is not accessible to you.');if(b.type==='role'||b.type==='form'){const creator=await fresh(i.guild,p.creatorId);requireManager(creator,{guild:i.guild,user:{id:p.creatorId},member:creator.member});if(b.type==='role')safeRole(creator,b.role,{guild:i.guild,user:{id:p.creatorId},member:creator.member});else channelAccess(creator,resolveChannel(creator,b.destination));}return state;}
  function proxy(i,request,{ticket=false}={}){const adapted=require('./request_commands').adapt(i,request,true);return new Proxy(adapted,{get(target,key){if(key==='deferReply'||key==='deferUpdate')return async()=>{};if(ticket&&key==='update')return payload=>i.editReply(payload);const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});}
  const respond=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions});
  async function handleInteraction(i){
    if(!String(i.customId||'').startsWith('pxwindow:'))return false;
    if(!i.guild||ctx.isMaintenance?.(i)){await respond(i,t(i.guild?.id,'The window is currently unavailable.','Das Fenster ist gerade nicht verfügbar.'));return true;}
    const [,mode,id,index]=i.customId.split(':');
    if(mode==='form'){
      const token=forms.get(id),p=token&&data(i.guild.id).panels[token.panelId],b=p?.buttons[token.index];
      if(!token||token.expiresAt<now()||token.userId!==i.user.id||token.guildId!==i.guild.id||token.channelId!==(i.channelId||i.channel?.id)||p?.status!=='active'||p.messageId!==token.messageId){await respond(i,'This form expired or belongs to another user.');return true;}
      await i.deferReply({flags:MessageFlags.Ephemeral});const key='form:'+id;if(busy.has(key)){await i.editReply({content:'This form is already being submitted.'});return true;}busy.add(key);
      try{const state=await checkPanel(i,p,b),target=resolveChannel(state,b.destination),values=b.fields.map((label,n)=>({name:label,value:string(i.fields.getTextInputValue('field'+n),1000,'form answer')}));
        const current=data(i.guild.id).panels[p.id];if(current.status!=='active'||!forms.has(id))throw Error('This form is no longer available.');
        const rateKey=p.id+':'+i.user.id,previous=formCooldowns.get(rateKey);if(previous!==undefined&&now()-previous<20000)throw Error('Wait twenty seconds before submitting another form.');formCooldowns.set(rateKey,now());if(formCooldowns.size>10000)formCooldowns.delete(formCooldowns.keys().next().value);
        forms.delete(id);await l10n.withProtectedValues(values.flatMap(v=>[v.name,v.value]),()=>target.send({embeds:[new EmbedBuilder().setTitle(b.label.slice(0,256)).setDescription(t(i.guild.id,`Submitted by <@${i.user.id}> · Window ${p.id}`,`Abgesendet von <@${i.user.id}> · Fenster ${p.id}`)).addFields(values)],allowedMentions}));await i.editReply({content:t(i.guild.id,'✅ Form submitted.','✅ Formular abgesendet.'),allowedMentions});
      }catch(error){await i.editReply({content:'❌ '+String(error.message||error).slice(0,1000),allowedMentions});}finally{busy.delete(key);}return true;
    }
    const p=data(i.guild.id).panels[id],n=Number(index),b=p?.buttons[n];
    if(mode!=='click'||!/^\d{1,2}$/.test(String(index))||!b||!bound(i,p)){await respond(i,'This window is unavailable or belongs to another message.');return true;}
    const key=i.guild.id+':'+i.user.id+':'+p.id,last=cooldowns.get(key);if(busy.has(key)||last!==undefined&&now()-last<2000){await respond(i,'Please wait a moment before using this window again.');return true;}cooldowns.set(key,now());if(cooldowns.size>10000)cooldowns.delete(cooldowns.keys().next().value);
    if(b.type==='form'){
      for(const [id,f]of forms)if(f.expiresAt<now())forms.delete(id);if(forms.size>=1000){await respond(i,'Too many open forms. Try again later.');return true;}
      const token=randomUUID();forms.set(token,{panelId:p.id,index:n,userId:i.user.id,guildId:i.guild.id,channelId:p.channelId,messageId:p.messageId,expiresAt:now()+10*60000});
      await l10n.withLiteralUI([b.label,...b.fields],()=>i.showModal(new ModalBuilder().setCustomId('pxwindow:form:'+token).setTitle(b.label.slice(0,45)).addComponents(b.fields.map((label,n)=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field'+n).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))))));return true;
    }
    busy.add(key);await i.deferReply({flags:MessageFlags.Ephemeral});
    try{const state=await checkPanel(i,p,b);if(!bound(i,data(i.guild.id).panels[id]))throw Error('This window was disabled.');
      if(b.type==='role'){const creator=await i.guild.members.fetch({user:p.creatorId,force:true}),r=safeRole({...state,member:creator},b.role,{guild:i.guild,user:{id:p.creatorId},member:creator});const remove=b.mode==='remove'||b.mode==='toggle'&&state.member.roles.cache.has(r.id);await state.member.roles[remove?'remove':'add'](r.id,`Window ${p.id}; requested by ${i.user.id}`);await i.editReply({content:t(i.guild.id,`✅ Role ${remove?'removed':'added'}: ${r.name}`,`✅ Rolle ${remove?'entfernt':'hinzugefügt'}: ${r.name}`),allowedMentions});}
      else if(b.type==='reply')await l10n.withProtectedValues([b.text],()=>i.editReply({content:b.text,allowedMentions}));
      else if(b.type==='request')await ctx.getAssistant().handle(proxy(i,b.request));
      else if(b.type==='ticket')await ctx.openTicket(proxy(i,'',{ticket:true}));
      else throw Error('Use the link button directly.');
    }catch(error){await i.editReply({content:'❌ '+String(error.message||error).slice(0,1000),allowedMentions});}finally{busy.delete(key);}return true;
  }
  return {preflight,execute,describe,handleInteraction,data};
}
module.exports={FIELDS,schemaProperties,HELP,validateAction,createCommandWindows};
