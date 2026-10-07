'use strict';
const {PermissionsBitField, ChannelType} = require('discord.js');
const F = PermissionsBitField.Flags;
const FIELDS = Object.freeze({
  role_permissions: ['role', 'grant', 'revoke'], assign_role: ['role', 'member'], remove_role: ['role', 'member'],
  edit_role: ['role', 'name', 'color'], delete_role: ['role'], move_role: ['role', 'position'],
  channel_permissions: ['target', 'subject', 'allow', 'deny', 'inherit'],
  move_channel: ['target', 'parent', 'position'], slowmode: ['target', 'seconds'],
  voice_settings: ['target', 'limit', 'bitrate'], channel_nsfw: ['target', 'enabled'],
  lock_channel: ['target', 'enabled'], delete_channel: ['target'], delete_messages: ['target', 'count'],
  pin_message: ['target', 'message'], unpin_message: ['target', 'message'],
  timeout: ['member', 'seconds', 'reason'], kick: ['member', 'reason'], ban: ['member', 'reason'],
  unban: ['member', 'reason'], nickname: ['member', 'name'], invite: ['target', 'seconds', 'uses'],
  guild_settings: ['name', 'description']
});
const OPTIONAL = new Set(['grant','revoke','allow','deny','inherit','parent','position','limit','bitrate','reason','description','name','color']);
const PERMISSIONS = {
  role_permissions:F.ManageRoles,assign_role:F.ManageRoles,remove_role:F.ManageRoles,edit_role:F.ManageRoles,delete_role:F.ManageRoles,move_role:F.ManageRoles,
  channel_permissions:F.ManageRoles,move_channel:F.ManageChannels,slowmode:F.ManageChannels,voice_settings:F.ManageChannels,channel_nsfw:F.ManageChannels,
  lock_channel:F.ManageRoles,delete_channel:F.ManageChannels,delete_messages:F.ManageMessages,pin_message:F.PinMessages||F.ManageMessages,unpin_message:F.PinMessages||F.ManageMessages,
  timeout:F.ModerateMembers,kick:F.KickMembers,ban:F.BanMembers,unban:F.BanMembers,nickname:F.ManageNicknames,invite:F.CreateInstantInvite,guild_settings:F.ManageGuild
};
const TEXT = [ChannelType.GuildText,ChannelType.GuildAnnouncement];
const GUILD_ONLY=new Set(['Administrator','KickMembers','BanMembers','ManageGuild','ViewAuditLog','ViewGuildInsights','ChangeNickname','ManageNicknames','ManageGuildExpressions','ManageEmojisAndStickers','ModerateMembers','ViewCreatorMonetizationAnalytics','CreateGuildExpressions']);
function validateAction(a) {
  if (!Object.hasOwn(FIELDS,a.kind) || Object.keys(a).some(k=>k!=='kind'&&!FIELDS[a.kind].includes(k))) throw Error('Nicht unterstützte Aktion.');
  const out={kind:a.kind};
  for (const field of FIELDS[a.kind]) {
    const value=a[field];
    if (value===undefined && OPTIONAL.has(field)) continue;
    if (['grant','revoke','allow','deny','inherit'].includes(field)) {
      if (!Array.isArray(value)||value.length>60||value.some(v=>typeof v!=='string'||!Object.hasOwn(F,v))) throw Error('Unbekannte Discord-Berechtigung.');
      out[field]=[...new Set(value)]; continue;
    }
    if (['seconds','position','limit','bitrate','count','uses'].includes(field)) {
      const ranges={seconds:a.kind==='timeout'?[0,28*86400]:a.kind==='slowmode'?[0,21600]:[0,604800],position:[0,499],limit:[0,99],bitrate:[8000,384000],count:[1,100],uses:[0,100]};
      const [min,max]=ranges[field];if(!Number.isInteger(value)||value<min||value>max)throw Error(`Ungültiges Feld: ${field}.`);
      out[field]=value;continue;
    }
    if(field==='enabled'){if(typeof value!=='boolean')throw Error('An/Aus fehlt.');out[field]=value;continue;}
    const max=field==='description'?120:field==='reason'?300:field==='name'&&a.kind==='nickname'?32:100;
    if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw Error(`Ungültiges Feld: ${field}.`);
    out[field]=value.trim();
  }
  if(out.color&&!/^#[\da-f]{6}$/i.test(out.color))throw Error('Farbe braucht #RRGGBB.');
  const groups=a.kind==='role_permissions'?['grant','revoke']:a.kind==='channel_permissions'?['allow','deny','inherit']:null;
  if(groups){const flat=groups.flatMap(k=>out[k]||[]);if(!flat.length||new Set(flat).size!==flat.length)throw Error('Berechtigungen fehlen oder widersprechen sich.');}
  if(a.kind==='channel_permissions'&&['allow','deny','inherit'].some(k=>(out[k]||[]).some(name=>GUILD_ONLY.has(name))))throw Error('Serverweite Rechte gehören zu role_permissions, nicht zu Kanalrechten.');
  const requiredChanges={edit_role:['name','color'],move_channel:['parent','position'],voice_settings:['limit','bitrate'],guild_settings:['name','description']};
  if(requiredChanges[a.kind]&&!requiredChanges[a.kind].some(k=>out[k]!==undefined))throw Error('Nenne mindestens eine Änderung.');
  if(a.kind==='nickname'&&!out.name)throw Error('Neuer Nickname fehlt.');
  return out;
}
function role(state,ref) {
  const id=String(ref).replace(/^<@&(\d+)>$/,'$1');
  const matches=state.roles.filter(r=>r.id===id||r.name===ref||(ref==='@everyone'&&r.id===state.guild.id));
  if(matches.length!==1)throw Error(matches.length?'Rollenname ist mehrdeutig. Erwähne die Rolle.':`Rolle „${ref}“ nicht gefunden.`);
  return matches[0];
}
const userId=(ref,i)=>ref==='self'||ref==='mir'?i.user.id:String(ref).replace(/^<@!?(\d+)>$/,'$1');
async function member(state,ref,i) {
  const id=userId(ref,i);if(!/^\d{1,22}$/.test(id))throw Error('Erwähne das Mitglied mit @ oder gib seine Discord-ID an.');
  state.targetMembers||=new Map();if(state.targetMembers.has(id))return state.targetMembers.get(id);
  const m=await state.guild.members.fetch({user:id,force:true});if(!m)throw Error('Mitglied nicht gefunden.');state.targetMembers.set(id,m);return m;
}
function authority(ctx,state,i) {
  const current={...i,member:state.member,memberPermissions:state.member.permissions};
  return i.user.id===state.guild.ownerId || Boolean(ctx.canManageBotSettings?.(current) ?? state.member.permissions.has(F.ManageGuild));
}
function editableRole(state,r,{everyone=false}={}) {
  if(r.managed||r.id===state.guild.id&&!everyone)throw Error('Diese Systemrolle bleibt geschützt.');
  if(r.id!==state.guild.id&&(r.editable===false||state.bot.roles?.highest&&r.position>=state.bot.roles.highest.position))throw Error('Die Rolle muss unter der höchsten Bot-Rolle stehen.');
}
function grantable(state,names) {
  if(names.some(name=>!state.bot.permissions.has(F[name])))throw Error('Pixel kann nur Rechte vergeben, die er selbst besitzt.');
}
async function preflight(ctx,state,a,i,target) {
  if(!authority(ctx,state,i))throw Error('Rollenrechte, Zugriffsrechte und Moderation darf nur die Bot-Verwaltung oder der Owner beauftragen.');
  const permissions=target?target.permissionsFor(state.bot):state.bot.permissions;
  if(!permissions?.has(PERMISSIONS[a.kind]))throw Error(`Dem Bot fehlt die Berechtigung für ${a.kind}.`);
  if(target&&(!target.permissionsFor(state.member)?.has(F.ViewChannel)||!permissions.has(F.ViewChannel)))throw Error('Der Zielkanal ist nicht zugänglich.');
  let r,m,subject;
  if(a.role){r=role(state,a.role);editableRole(state,r,{everyone:a.kind==='role_permissions'});}
  const adminFlags=['Administrator','ManageGuild','ManageRoles'];
  const grantsAdmin=a.kind==='role_permissions'&&(a.grant||[]).some(n=>adminFlags.includes(n));
  const assignsAdmin=a.kind==='assign_role'&&adminFlags.some(n=>r.permissions.has(F[n],false));
  if((grantsAdmin||assignsAdmin)&&i.user.id!==state.guild.ownerId&&!ctx.isBotOwner?.(i)&&!state.member.permissions.has(F.Administrator))throw Error('Administrator- und Rollenverwaltungsrechte kann nur ein Administrator oder Owner vergeben.');
  if(a.kind==='role_permissions')grantable(state,a.grant||[]);
  if(a.kind==='move_role'&&a.position>=state.bot.roles?.highest?.position)throw Error('Die Rolle muss unter der höchsten Bot-Rolle bleiben.');
  if(a.member&&a.kind!=='unban')m=await member(state,a.member,i);
  if(a.kind==='unban'&&!/^\d{1,22}$/.test(userId(a.member,i)))throw Error('Zum Entbannen ist eine Discord-ID nötig.');
  if(['kick','ban','timeout','nickname'].includes(a.kind)) {
    if(m.id===state.guild.ownerId||m.id===state.bot.id)throw Error('Server-Owner und Pixel bleiben geschützt.');
    const flag={kick:'kickable',ban:'bannable',timeout:'moderatable',nickname:'manageable'}[a.kind];
    if(m[flag]===false||state.bot.roles?.highest&&m.roles?.highest?.position>=state.bot.roles.highest.position)throw Error('Pixel steht in der Rollen-Hierarchie nicht über diesem Mitglied.');
    if(a.kind==='timeout'&&m.permissions?.has(F.Administrator))throw Error('Discord erlaubt keinen Timeout für Administratoren.');
  }
  if(['slowmode','channel_nsfw','delete_messages','pin_message','unpin_message'].includes(a.kind)&&!TEXT.includes(target?.type))throw Error('Diese Aktion braucht einen Textkanal.');
  if(['delete_messages','pin_message','unpin_message'].includes(a.kind)&&!permissions.has(F.ReadMessageHistory))throw Error('Pixel braucht Nachrichtenverlauf lesen im Zielkanal.');
  if(a.kind==='voice_settings'&&target?.type!==ChannelType.GuildVoice)throw Error('Diese Aktion braucht einen Voice-Kanal.');
  if(a.kind==='voice_settings'&&a.bitrate>(state.guild.maximumBitrate||96000))throw Error('Die gewünschte Bitrate ist für diesen Server zu hoch.');
  if(a.kind==='move_channel'&&a.parent){const parent=ctx.resolveChannel(state,a.parent);if(parent.type!==ChannelType.GuildCategory)throw Error('Das Ziel muss eine Kategorie sein.');if(parent.id===target.id||target.type===ChannelType.GuildCategory)throw Error('Kategorien können nicht ineinander verschoben werden.');if(!parent.permissionsFor(state.bot)?.has([F.ViewChannel,F.ManageChannels]))throw Error('Pixel braucht Rechte in der Zielkategorie.');}
  if(a.kind==='channel_permissions') {
    if(a.subject.startsWith('member:')){subject=await member(state,a.subject.slice(7),i);if(subject.id===state.bot.id)throw Error('Pixels eigenen Kanalzugriff bitte nicht über /new sperren.');}
    else {subject=role(state,a.subject.replace(/^role:/,''));if(subject.managed)throw Error('Verwaltete Systemrollen bleiben geschützt.');}
    grantable(state,a.allow||[]);
  }
  if(a.kind==='delete_channel') {
    const gd=ctx.guildData(state.guild.id),ids=new Set([state.guild.rulesChannelId,state.guild.publicUpdatesChannelId,...Object.values(gd.channels||{}),...Object.values(gd.setupOverrides||{})].filter(Boolean));
    if(ids.has(target.id)||/^ticket-owner:/.test(String(target.topic||'')))throw Error('Dieser Kanal wird von einem Bot-System verwendet. Lösche oder ändere seine Zuordnung zuerst gezielt.');
    if(target.type===ChannelType.GuildCategory&&state.channels.some(c=>c.parentId===target.id))throw Error('Verschiebe die Unterkanäle zuerst; die Kategorie enthält noch Kanäle.');
  }
  if(['pin_message','unpin_message'].includes(a.kind)&&!/^\d{1,22}$/.test(a.message))throw Error('Gib die Nachrichten-ID an.');
  return {r,m,subject};
}
async function execute(ctx,state,a,i,target) {
  const {r,m,subject}=await preflight(ctx,state,a,i,target),reason=a.reason||`/new von ${i.user.id}`;
  switch(a.kind) {
    case 'role_permissions': {const flags=new PermissionsBitField(r.permissions.bitfield);flags.add((a.grant||[]).map(n=>F[n]));flags.remove((a.revoke||[]).map(n=>F[n]));await r.setPermissions(flags,reason);return `✅ Rechte für ${r.name}: +${(a.grant||[]).join(', ')||'keine'} / −${(a.revoke||[]).join(', ')||'keine'}`;}
    case 'assign_role': await m.roles.add(r,reason);return `✅ ${m.displayName||m.id} hat ${r.name}`;
    case 'remove_role': await m.roles.remove(r,reason);return `✅ ${r.name} von ${m.displayName||m.id} entfernt`;
    case 'edit_role': await r.edit({...(a.name?{name:a.name}:{}),...(a.color?{color:parseInt(a.color.slice(1),16)}:{}),reason});return `✅ Rolle ${a.name||r.name} angepasst`;
    case 'move_role': await r.setPosition(a.position,{reason});return `✅ Rolle ${r.name} verschoben`;
    case 'delete_role': await r.delete(reason);return `✅ Rolle ${r.name} gelöscht`;
    case 'channel_permissions': {const changes={};for(const [list,value]of [['allow',true],['deny',false],['inherit',null]])for(const permission of a[list]||[])changes[permission]=value;await target.permissionOverwrites.edit(subject,changes,{reason});return `✅ Kanalrechte für ${subject.name||subject.displayName||subject.id} in ${target.name} angepasst`;}
    case 'move_channel': {if(a.parent)await target.setParent(ctx.resolveChannel(state,a.parent).id,{lockPermissions:false,reason});if(a.position!==undefined)await target.setPosition(a.position,{reason});return `✅ ${target.name} verschoben; bestehende Kanalrechte bleiben erhalten`;}
    case 'slowmode': await target.setRateLimitPerUser(a.seconds,reason);return `✅ Slowmode in ${target.name}: ${a.seconds}s`;
    case 'voice_settings': await target.edit({...(a.limit!==undefined?{userLimit:a.limit}:{}),...(a.bitrate!==undefined?{bitrate:a.bitrate}:{}),reason});return `✅ Voice-Einstellungen in ${target.name} angepasst`;
    case 'channel_nsfw': await target.setNSFW(a.enabled,reason);return `✅ Altersbeschränkung in ${target.name}: ${a.enabled?'an':'aus'}`;
    case 'lock_channel': await target.permissionOverwrites.edit(state.guild.id,{[target.type===ChannelType.GuildVoice?'Connect':'SendMessages']:a.enabled?false:null},{reason});return `✅ ${target.name}: ${a.enabled?'gesperrt':'Sperre aufgehoben'}`;
    case 'delete_channel': await target.delete(reason);return `✅ Kanal ${target.name} gelöscht`;
    case 'delete_messages': {const deleted=await target.bulkDelete(a.count,true);return `✅ ${deleted.size} aktuelle Nachrichten gelöscht; Nachrichten über 14 Tage alt bleiben erhalten`;}
    case 'pin_message': case 'unpin_message': {const message=await target.messages.fetch(a.message);await message[a.kind==='pin_message'?'pin':'unpin'](reason);return `✅ Nachricht ${a.kind==='pin_message'?'angepinnt':'gelöst'}`;}
    case 'timeout': await m.timeout(a.seconds?a.seconds*1000:null,reason);return `✅ Timeout für ${m.displayName||m.id}: ${a.seconds?a.seconds+'s':'aufgehoben'}`;
    case 'kick': await m.kick(reason);return `✅ ${m.displayName||m.id} vom Server entfernt`;
    case 'ban': await m.ban({reason,deleteMessageSeconds:0});return `✅ ${m.displayName||m.id} gebannt`;
    case 'unban': await state.guild.members.unban(userId(a.member,i),reason);return '✅ Bann aufgehoben';
    case 'nickname': await m.setNickname(a.name,reason);return `✅ Nickname: ${a.name}`;
    case 'invite': {const link=await target.createInvite({maxAge:a.seconds,maxUses:a.uses,unique:true,reason});return `✅ Einladung: ${link.url}`;}
    case 'guild_settings': await state.guild.edit({...(a.name?{name:a.name}:{}),...(a.description?{description:a.description}:{}),reason});return '✅ Servername/Beschreibung angepasst';
    default: throw Error('Unbekannte Aktion.');
  }
}
module.exports={FIELDS,PERMISSIONS,validateAction,preflight,execute,role,authority};
