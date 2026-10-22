'use strict';
// Parse only explicit server wishes. Execution, permissions and confirmation stay
// in new_assistant/new_actions. Names are matched exactly, never approximately.
const {PermissionsBitField}=require('discord.js');
const {normalize}=require('./offline_intelligence');
const F=PermissionsBitField.Flags;
const RIGHTS={
  'administrator':'Administrator','admin':'Administrator','nachrichten verwalten':'ManageMessages','nachrichten senden':'SendMessages','nachrichten lesen':'ViewChannel','kanal ansehen':'ViewChannel','kanal sehen':'ViewChannel','verlauf lesen':'ReadMessageHistory','nachrichtenverlauf lesen':'ReadMessageHistory',
  'rollen verwalten':'ManageRoles','kanale verwalten':'ManageChannels','server verwalten':'ManageGuild','mitglieder moderieren':'ModerateMembers','mitglieder bannen':'BanMembers','mitglieder kicken':'KickMembers','verbinden':'Connect','sprechen':'Speak',
  'reaktionen hinzufugen':'AddReactions','dateien anhangen':'AttachFiles','links einbetten':'EmbedLinks','einladungen erstellen':'CreateInstantInvite','alle erwahnen':'MentionEveryone','audit log ansehen':'ViewAuditLog','webhooks verwalten':'ManageWebhooks',
  'nicknamen verwalten':'ManageNicknames','nickname andern':'ChangeNickname','mitglieder verschieben':'MoveMembers','mitglieder stummschalten':'MuteMembers','mitglieder taubschalten':'DeafenMembers','streamen':'Stream','umfragen senden':'SendPolls','nachrichten anpinnen':'PinMessages',
  'threads verwalten':'ManageThreads','offentliche threads erstellen':'CreatePublicThreads','private threads erstellen':'CreatePrivateThreads','in threads schreiben':'SendMessagesInThreads','externe emojis verwenden':'UseExternalEmojis','externe sticker verwenden':'UseExternalStickers','soundboard verwenden':'UseSoundboard','events verwalten':'ManageEvents','events erstellen':'CreateEvents','anwendungsbefehle verwenden':'UseApplicationCommands'
};
const unquote=value=>String(value||'').trim().replace(/^["'„“]([\s\S]*)["'“]$/,'$1');
const readable=value=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'');
function splitList(value){
  const result=[];let quote=null,buffer='';
  for(let i=0;i<value.length;i++){const c=value[i];if(quote){buffer+=c;if(c===quote||quote==='„'&&c==='“')quote=null;continue;}
    if(['"',"'",'„','“'].includes(c)){quote=c;buffer+=c;continue;}
    const join=value.slice(i).match(/^\s+und\s+/i);if(c===','||join){if(buffer.trim())result.push(unquote(buffer));buffer='';if(join)i+=join[0].length-1;}else buffer+=c;}
  if(quote)throw Error('Ein Anführungszeichen ist noch offen.');if(buffer.trim())result.push(unquote(buffer));return result;
}
function rights(value){
  const n=normalize(value).replace(/^(?:die\s+)?(?:rechte?|berechtigungen?)\s*:?\s*/,'');
  if(n==='alle rechte'||n==='alle berechtigungen'||n==='alle')return Object.keys(F);
  const list=splitList(n).map(v=>RIGHTS[v]||Object.keys(F).find(k=>normalize(k)===v));
  if(!list.length||list.some(v=>!v))throw Error('Ein Recht ist nicht eindeutig. Nutze deutsche Namen oder genaue Discord-Schlüssel wie ManageMessages.');
  return [...new Set(list)];
}
function resolve(value,rows,label){
  let ref=unquote(value);const mention=ref.match(/^<(?:@!?|@&|#)(\d{1,22})>$/);if(mention)return mention[1];
  if(/^\d{1,22}$/.test(ref))return ref;
  ref=ref.replace(/^[@#]/,'');
  const unique=[...new Map((rows||[]).map(r=>[r.id,r])).values()];
  const exact=unique.filter(r=>normalize(r.name)===normalize(ref));
  const matches=exact.length?exact:unique.filter(r=>readable(r.name)===readable(ref));
  if(matches.length!==1)throw Error(matches.length?`${label} ist mehrdeutig. Nutze eine Erwähnung oder ID.`:`${label} „${ref}“ nicht gefunden. Nutze eine Erwähnung oder ID.`);
  return matches[0].id;
}
function seconds(text){
  const m=normalize(text).match(/^(\d+)\s*(s|sek|sekunde|sekunden|min|m|minute|minuten|h|stunde|stunden|d|tag|tage|tagen|w|woche|wochen)$/);
  if(!m)throw Error('Dauer bitte z. B. als „10 Minuten“ angeben.');
  const factor=/^(s|sek)/.test(m[2])?1:/^(min|m$)/.test(m[2])?60:/^(h|stund)/.test(m[2])?3600:/^(d|tag)/.test(m[2])?86400:604800;
  const value=Number(m[1])*factor;if(!Number.isSafeInteger(value))throw Error('Dauer ist zu groß.');return value;
}
function parse(clause,context={}){
  const text=String(clause).trim();let m;
  const member=ref=>/^(?:mir|mich|ich|self)$/i.test(ref)?'self':resolve(ref,context.members,'Mitglied');
  const role=ref=>resolve(/^(?:diese|diese rolle|gerade erstellte)$/i.test(ref)&&context.previousRole?context.previousRole:ref,context.roles,'Rolle');
  const channel=ref=>normalize(ref)==='hier'?context.currentChannel:resolve(String(ref).replace(/^(?:den |dem )?(?:kanal|channel)\s+/i,''),context.channels,'Kanal');
  const subject=ref=>/^rolle\s+/i.test(ref)?role(ref.replace(/^rolle\s+/i,'')):/^<@&/.test(ref)||ref==='@everyone'?role(ref):'member:'+member(ref.replace(/^(?:mitglied|nutzer)\s+/i,''));
  if((m=text.match(/^(?:gib|gebe|entziehe|nimm|entferne)\s+(?:der\s+)?rolle\s+(.+?)\s+(?:die\s+)?(?:rechte?|berechtigungen?)\s*:?\s+(.+?)(?:\s+weg)?$/i))){
    return [{kind:'role_permissions',role:role(m[1]),[/^(?:entziehe|nimm|entferne)/i.test(text)?'revoke':'grant']:rights(m[2])}];
  }
  if((m=text.match(/^(gib|gebe|weise|nimm|nehme|entferne|entziehe)\s+(?:dem\s+)?(?:mitglied\s+|nutzer\s+)?(.+?)\s+(?:die\s+)?(rolle|rollen)\s+(.+?)(?:\s+(?:weg|ab|zu))?$/i))&&!/^(?:(?:der\s+)?rolle\b|der$|die$)/i.test(m[2])){
    const who=member(m[2]),refs=normalize(m[3])==='rollen'?splitList(m[4]):[unquote(m[4])];
    return refs.map(ref=>({kind:/^(?:gib|gebe|weise)$/i.test(m[1])?'assign_role':'remove_role',member:who,role:role(ref)}));
  }
  if((m=text.match(/^(gib|gebe|entferne|entziehe)\s+(?:die\s+)?rolle\s+(.+?)\s+(an|von|fur|für)\s+(.+)$/i)))return [{kind:/^(?:entferne|entziehe)$/i.test(m[1])||normalize(m[3])==='von'?'remove_role':'assign_role',role:role(m[2]),member:member(m[4])}];
  if((m=text.match(/^(?:benenne|nenne)\s+(?:die\s+)?rolle\s+(.+?)\s+in\s+(.+?)\s+um$/i)))return [{kind:'edit_role',role:role(m[1]),name:unquote(m[2])}];
  if((m=text.match(/^verschiebe\s+(?:die\s+)?rolle\s+(.+?)\s+auf\s+(?:position\s+)?(\d+)$/i)))return [{kind:'move_role',role:role(m[1]),position:Number(m[2])}];
  if((m=text.match(/^(?:losche|lösche|entferne)\s+(?:die\s+)?rolle\s+(.+)$/i)))return [{kind:'delete_role',role:role(m[1])}];
  if((m=text.match(/^(erlaube|verbiete|vererbe)\s+(.+?)\s+in\s+(?:kanal\s+)?(.+?)\s*:\s*(.+)$/i)))return [{kind:'channel_permissions',subject:subject(m[2]),target:channel(m[3]),[{erlaube:'allow',verbiete:'deny',vererbe:'inherit'}[normalize(m[1])]]:rights(m[4])}];
  if((m=text.match(/^(?:setze|andere|ändere)\s+(?:das\s+)?(?:thema|topic)\s+(?:in|von|fur|für)\s+(.+?)\s+(?:auf|:)\s*(.+)$/i)))return [{kind:'topic',target:channel(m[1]),text:unquote(m[2])}];
  if((m=text.match(/^verschiebe\s+(?:den\s+)?kanal\s+(.+?)\s+auf\s+position\s+(\d+)$/i)))return [{kind:'move_channel',target:channel(m[1]),position:Number(m[2])}];
  if((m=text.match(/^(?:losche|lösche|entferne)\s+(?:den\s+|die\s+)?(?:kanal|kategorie)\s+(.+)$/i)))return [{kind:'delete_channel',target:channel(m[1])}];
  if((m=text.match(/^(?:losche|lösche|entferne)\s+(?:die\s+)?(?:letzten\s+)?(\d+)\s+nachrichten\s+in\s+(.+)$/i)))return [{kind:'delete_messages',count:Number(m[1]),target:channel(m[2])}];
  if((m=text.match(/^(?:setze|andere|ändere)\s+(?:das\s+)?(?:voice.?limit|nutzerlimit|benutzerlimit)\s+(?:in|von|fur|für)\s+(.+?)\s+auf\s+(\d+)$/i)))return [{kind:'voice_settings',target:channel(m[1]),limit:Number(m[2])}];
  if((m=text.match(/^(?:setze|andere|ändere)\s+(?:die\s+)?bitrate\s+(?:in|von|fur|für)\s+(.+?)\s+auf\s+(\d+)\s*(kbps|kbit\/s|bps|bit\/s)?$/i)))return [{kind:'voice_settings',target:channel(m[1]),bitrate:Number(m[2])*(m[3]&&/^k/i.test(m[3])?1000:1)}];
  if((m=text.match(/^(?:schalte|setze)\s+(?:nsfw|altersbeschrankung|altersbeschränkung)\s+in\s+(.+?)\s+(an|ein|aus)$/i)))return [{kind:'channel_nsfw',target:channel(m[1]),enabled:normalize(m[2])!=='aus'}];
  if((m=text.match(/^(pinne|entpinne)\s+(?:die\s+)?(?:nachricht\s+)?(\d+)\s+in\s+(.+?)(?:\s+an)?$/i)))return [{kind:normalize(m[1])==='pinne'?'pin_message':'unpin_message',message:m[2],target:channel(m[3])}];
  if((m=text.match(/^(?:setze\s+)?timeout\s+(?:fur|für)\s+(.+?)\s+(?:fur|für)\s+(.+?)(?:\s+wegen\s+(.+))?$/i))){const time=seconds(m[2]);if(time>28*86400)throw Error('Timeouts sind höchstens 28 Tage lang.');return [{kind:'timeout',member:member(m[1]),seconds:time,...(m[3]?{reason:unquote(m[3])}:{})}];}
  if((m=text.match(/^(?:hebe|entferne)\s+(?:den\s+)?timeout\s+(?:von|fur|für)\s+(.+?)(?:\s+auf)?$/i)))return [{kind:'timeout',member:member(m[1]),seconds:0}];
  if((m=text.match(/^(kicke|kick|banne|ban|entbanne|unban)\s+(.+?)(?:\s+wegen\s+(.+))?$/i)))return [{kind:/^(?:kicke|kick)$/i.test(m[1])?'kick':/^(?:entbanne|unban)$/i.test(m[1])?'unban':'ban',member:member(m[2]),...(m[3]?{reason:unquote(m[3])}:{})}];
  if((m=text.match(/^(?:andere|ändere|setze)\s+(?:den\s+)?(?:nickname|spitznamen)\s+von\s+(.+?)\s+auf\s+(.+)$/i)))return [{kind:'nickname',member:member(m[1]),name:unquote(m[2])}];
  if((m=text.match(/^(?:erstelle|erstell|mache|mach)\s+(?:eine[n]?\s+)?einladung\s+(?:fur|für|in)\s+(.+?)\s+(?:gultig|gültig)\s+(.+?)\s+(?:mit|maximal)\s+(\d+)\s+(?:nutzungen|benutzungen)$/i)))return [{kind:'invite',target:channel(m[1]),seconds:seconds(m[2]),uses:Number(m[3])}];
  if((m=text.match(/^(?:andere|ändere|setze)\s+(?:den\s+)?servernamen\s+auf\s+(.+)$/i)))return [{kind:'guild_settings',name:unquote(m[1])}];
  if((m=text.match(/^(?:andere|ändere|setze)\s+(?:die\s+)?serverbeschreibung\s+auf\s+(.+)$/i)))return [{kind:'guild_settings',description:unquote(m[1])}];
  if((m=text.match(/^(?:erstelle|mache|mach)\s+(?:eine\s+)?umfrage\s+in\s+(.+?)\s*:\s*(.+?)\s*\|\s*(.+)$/i)))return [{kind:'poll',target:channel(m[1]),text:unquote(m[2]),options:m[3].split('|').map(unquote)}];
  if(/^(?:losche|lösche|vergiss|leere)\s+(?:meinen|mein)\s+(?:ai.?verlauf|ki.?verlauf|chat.?verlauf|gedachtnis|gedächtnis)$/i.test(text))return [{kind:'reset_memory'}];
  return null;
}
const HELP='Offline versteht /new unter anderem:\n'
  +'• Gib @Nutzer die Rolle Helfer / Nimm @Nutzer die Rolle Helfer weg\n• Gib @Nutzer die Rollen VIP und Helfer\n• Erstelle eine Rolle Helfer mit Farbe Blau\n• Gib Rolle Helfer Rechte Nachrichten verwalten\n• Entziehe Rolle Helfer Rechte ManageMessages\n• Benenne Rolle Helfer in Support um / Verschiebe Rolle Helfer auf Position 3\n• Lösche Rolle Helfer (mit Vorschau)\n'
  +'• Erstelle einen Textkanal clips / Erstelle eine Kategorie Gaming\n• Verschiebe Kanal clips in Kategorie Gaming / Benenne clips in videos um\n• Setze Thema in clips auf Neuigkeiten\n• Erlaube Rolle Helfer in clips: Nachrichten senden\n• Verbiete @Nutzer in clips: Nachrichten senden\n• Vererbe Rolle Helfer in clips: AttachFiles\n• Sperre Kanal clips / Entsperre Kanal clips\n• Setze Slowmode in clips auf 2 Minuten\n• Setze Voicelimit in Lounge auf 5 / Setze Bitrate in Lounge auf 64 kbps\n• Schalte NSFW in clips an / Lösche Kanal clips\n'
  +'• Poste in hier: Hallo / Erstelle Umfrage in hier: Spiel? | Minecraft | Roblox\n• Lösche 10 Nachrichten in hier / Pinne Nachricht 123 in hier an\n• Timeout für @Nutzer für 10 Minuten wegen Spam / Hebe Timeout von @Nutzer auf\n• Kicke @Nutzer wegen Grund / Banne @Nutzer wegen Grund / Entbanne 123456\n• Ändere Nickname von @Nutzer auf Neuer Name\n• Erstelle Einladung für hier gültig 1 Stunde mit 5 Nutzungen\n• Ändere Servernamen auf Neuer Name / Ändere Serverbeschreibung auf Beschreibung\n• Aktiviere Counting in clips / Schalte Anti-Spam an\n• Lösche meinen AI-Verlauf\n\nNutze echte Erwähnungen, eindeutige Namen oder IDs. Rechte und Rollen-Hierarchie prüft der Bot vor der Ausführung. Änderungen mit Risiko erscheinen als Vorschau. Unbekannte Teilaufträge stoppen den gesamten Plan.';
module.exports={parse,rights,resolve,seconds,HELP};
