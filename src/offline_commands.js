'use strict';
// English and additional German forms feed the existing typed, permission-checked engine.
const {normalize}=require('./offline_intelligence');
const extra=require('./offline_actions');
const COLORS={blue:'#3498db',red:'#e74c3c',green:'#2ecc71',yellow:'#f1c40f',purple:'#9b59b6',violet:'#9b59b6',orange:'#e67e22',pink:'#e91e63',white:'#ffffff',black:'#000000',grey:'#95a5a6',gray:'#95a5a6',gold:'#f1c40f'};
const unquote=s=>String(s||'').trim().replace(/^["„']([\s\S]*)["“']$/,'$1');
function duration(s){const n=normalize(s),m=n.match(/^(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|h|days?|d|weeks?|w)$/);if(!m)return extra.seconds(s);const value=Number(m[1])*(/^s/.test(m[2])?1:/^m/.test(m[2])?60:/^h/.test(m[2])?3600:/^d/.test(m[2])?86400:604800);if(!Number.isSafeInteger(value))throw Error('Duration is too large.');return value;}
function parts(rest){const q=rest.match(/^["„']([^"“']+)["“']\s*(.*)$/);if(q)return [q[1],q[2]];const at=rest.search(/\s+(?:with|without|but|in|under|inside)\s+/i);return at<0?[rest.trim(),'']:[rest.slice(0,at).trim(),rest.slice(at).trim()];}
function parse(raw,c={}){
  const text=String(raw).trim().replace(/^(?:please\s+|can you\s+(?:please\s+)?|could you\s+(?:please\s+)?)/i,'').replace(/[?!]+$/,'');let m;
  const role=ref=>extra.resolve(/^(?:that|this|new)(?: role)?$/i.test(ref)&&c.previousRole?c.previousRole:unquote(ref),c.roles,'Role');
  const channel=ref=>/^(?:here|this channel)$/i.test(ref)?c.currentChannel:extra.resolve(unquote(String(ref).replace(/^(?:the )?(?:channel|category)\s+/i,'')),c.channels,'Channel');
  const member=ref=>/^(?:me|myself|self)$/i.test(ref)?'self':extra.resolve(unquote(ref),c.members,'Member');
  const subject=ref=>/^role\s+/i.test(ref)?role(ref.replace(/^role\s+/i,'')):/^<@&/.test(ref)||ref==='@everyone'?role(ref):'member:'+member(ref.replace(/^(?:member|user)\s+/i,''));
  const color=s=>/^#[0-9a-f]{6}$/i.test(s.trim())?s.trim():COLORS[normalize(s).replace(/^(?:the )?(?:color|colour)\s+/,'')];
  if((m=text.match(/^(?:create|add|make|set up)\s+(?:me\s+)?(?:a[n]?\s+|the\s+)?(role|text channel|voice channel|voice chat|channel|category|vc)\s+(?:(?:called|named)\s+)?(.+)$/i))){
    const type=m[1].toLowerCase(),[name,tail]=parts(m[2]);if(!name||name.length>100)throw Error('Choose a name with 1–100 characters.');
    if(type==='role'){
      let chosenColor,grant=[];if(tail){let rest=tail.replace(/^(?:with|in)\s+/i,'');const segments=rest.split(/\s*(?:,|\band\b)\s*/i);for(const segment of segments){const col=color(segment);if(col){if(chosenColor)throw Error('Choose one role color.');chosenColor=col;}else grant.push(...extra.rights(segment));}}
      return [{kind:'role',name,...chosenColor?{color:chosenColor}:{}},...grant.length?[{kind:'role_permissions',role:name,grant:[...new Set(grant)]}]:[]];
    }
    const kind=type==='category'?'category':/voice|vc/.test(type)?'voice_channel':'text_channel';let parent;
    if(tail){const p=tail.match(/^(?:in|under|inside)\s+(?:the\s+)?(?:category\s+)?(.+)$/i);if(!p||kind==='category')throw Error('Please state an exact parent category.');parent=channel(p[1]);}
    return [{kind,name,...parent?{parent}:{}}];
  }
  if((m=text.match(/^(?:give|add|assign)\s+(?:the\s+)?roles?\s+(.+?)\s+to\s+(.+)$/i)))return extra.splitNames(m[1]).map(ref=>({kind:'assign_role',member:member(m[2]),role:role(ref)}));
  if((m=text.match(/^(?:give|grant|add|assign)\s+(.+?)\s+(?:the\s+)?roles?\s+(.+?)(?:\s+(?:please))?$/i)))return extra.splitNames(m[2]).map(ref=>({kind:'assign_role',member:member(m[1]),role:role(ref)}));
  if((m=text.match(/^(?:remove|take|revoke)\s+(?:the\s+)?roles?\s+(.+?)\s+from\s+(.+)$/i)))return extra.splitNames(m[1]).map(ref=>({kind:'remove_role',member:member(m[2]),role:role(ref)}));
  if((m=text.match(/^(?:give|grant|remove|revoke)\s+(?:the\s+)?role\s+(.+?)\s+(?:the\s+)?(?:permissions?|rights?)\s+(.+)$/i)))return [{kind:'role_permissions',role:role(m[1]),[/^(?:remove|revoke)/i.test(text)?'revoke':'grant']:extra.rights(m[2])}];
  if((m=text.match(/^(?:rename|change the name of)\s+(?:the\s+)?role\s+(.+?)\s+(?:to|into)\s+(.+)$/i)))return [{kind:'edit_role',role:role(m[1]),name:unquote(m[2])}];
  if((m=text.match(/^(?:set|change)\s+(?:the\s+)?(?:color|colour)\s+of\s+(?:the\s+)?role\s+(.+?)\s+to\s+(.+)$/i))){const value=color(m[2]);if(!value)throw Error('Choose a color name or #RRGGBB.');return [{kind:'edit_role',role:role(m[1]),color:value}];}
  if((m=text.match(/^move\s+(?:the\s+)?role\s+(.+?)\s+to\s+(?:position\s+)?(\d+)$/i)))return [{kind:'move_role',role:role(m[1]),position:Number(m[2])}];
  if((m=text.match(/^delete\s+(?:the\s+)?role\s+(.+)$/i)))return [{kind:'delete_role',role:role(m[1])}];
  if((m=text.match(/^rename\s+(?:the\s+)?channel\s+(.+?)\s+to\s+(.+)$/i)))return [{kind:'rename_channel',target:channel(m[1]),name:unquote(m[2])}];
  if((m=text.match(/^(?:set|change)\s+(?:the\s+)?topic\s+(?:in|of|for)\s+(.+?)\s+to\s+(.+)$/i)))return [{kind:'topic',target:channel(m[1]),text:unquote(m[2])}];
  if((m=text.match(/^move\s+(?:the\s+)?channel\s+(.+?)\s+(?:to|into)\s+(?:the\s+)?(?:category\s+)?(.+)$/i)))return [{kind:'move_channel',target:channel(m[1]),parent:channel(m[2])}];
  if((m=text.match(/^(?:set|change)\s+slowmode\s+(?:in|for)\s+(.+?)\s+to\s+(.+)$/i)))return [{kind:'slowmode',target:channel(m[1]),seconds:duration(m[2])}];
  if((m=text.match(/^(?:disable|remove|turn off)\s+slowmode\s+(?:in|for)\s+(.+)$/i)))return [{kind:'slowmode',target:channel(m[1]),seconds:0}];
  if((m=text.match(/^(lock|unlock|delete)\s+(?:the\s+)?channel\s+(.+)$/i)))return [{kind:m[1].toLowerCase()==='delete'?'delete_channel':'lock_channel',target:channel(m[2]),...m[1].toLowerCase()==='delete'?{}:{enabled:m[1].toLowerCase()==='lock'}}];
  if((m=text.match(/^(?:enable|activate|set up)\s+counting\s+in\s+(.+)$/i)))return [{kind:'counting',target:channel(m[1])}];
  if((m=text.match(/^(enable|disable|activate|deactivate|turn on|turn off)\s+(ai|support[ -]?ai|anti[ -]?spam|automod|translation|welcome|ticket[ -]?feedback)$/i))){const key=normalize(m[2]),feature=/support/.test(key)?'supportAiEnabled':/spam|automod/.test(key)?'autoModEnabled':key==='translation'?'translationEnabled':key==='welcome'?'welcomeEnabled':/feedback/.test(key)?'ticketFeedbackEnabled':'aiEnabled';return [{kind:'feature',feature,enabled:!/^disable|^deactivate|^turn off/i.test(m[1])}];}
  if((m=text.match(/^(?:post|send|write)\s+(?:in|to)\s+(.+?)\s*:\s*([\s\S]+)$/i)))return [{kind:'post',target:channel(m[1]),text:unquote(m[2])}];
  if((m=text.match(/^(?:create|make)\s+(?:a\s+)?poll\s+in\s+(.+?)\s*:\s*(.+?)\s*\|\s*(.+)$/i)))return [{kind:'poll',target:channel(m[1]),text:unquote(m[2]),options:m[3].split('|').map(unquote)}];
  if((m=text.match(/^(allow|deny|inherit|reset)\s+(.+?)\s+in\s+(.+?)\s*:\s*(.+)$/i)))return [{kind:'channel_permissions',subject:subject(m[2]),target:channel(m[3]),[m[1].toLowerCase()==='allow'?'allow':m[1].toLowerCase()==='deny'?'deny':'inherit']:extra.rights(m[4])}];
  if((m=text.match(/^set\s+(?:the\s+)?(?:voice ?limit|user limit)\s+in\s+(.+?)\s+to\s+(\d+)$/i)))return [{kind:'voice_settings',target:channel(m[1]),limit:Number(m[2])}];
  if((m=text.match(/^set\s+(?:the\s+)?bitrate\s+in\s+(.+?)\s+to\s+(\d+)\s*(kbps|bps)?$/i)))return [{kind:'voice_settings',target:channel(m[1]),bitrate:Number(m[2])*(m[3]==='kbps'?1000:1)}];
  if((m=text.match(/^(enable|disable)\s+nsfw\s+in\s+(.+)$/i)))return [{kind:'channel_nsfw',target:channel(m[2]),enabled:m[1].toLowerCase()==='enable'}];
  if((m=text.match(/^(?:delete|clear)\s+(\d+)\s+messages\s+in\s+(.+)$/i)))return [{kind:'delete_messages',count:Number(m[1]),target:channel(m[2])}];
  if((m=text.match(/^(pin|unpin)\s+(?:message\s+)?(\d+)\s+in\s+(.+)$/i)))return [{kind:m[1].toLowerCase()==='pin'?'pin_message':'unpin_message',message:m[2],target:channel(m[3])}];
  if((m=text.match(/^(?:timeout|time out)\s+(.+?)\s+for\s+(.+?)(?:\s+(?:because|reason:)\s+(.+))?$/i)))return [{kind:'timeout',member:member(m[1]),seconds:duration(m[2]),...m[3]?{reason:unquote(m[3])}:{}}];
  if((m=text.match(/^(?:remove timeout from|untimeout)\s+(.+)$/i)))return [{kind:'timeout',member:member(m[1]),seconds:0}];
  if((m=text.match(/^(kick|ban|unban)\s+(.+?)(?:\s+(?:because|reason:)\s+(.+))?$/i))&&!/\swegen\s/i.test(text))return [{kind:m[1].toLowerCase(),member:member(m[2]),...m[3]?{reason:unquote(m[3])}:{}}];
  if((m=text.match(/^(?:set|change)\s+(?:the\s+)?nickname\s+of\s+(.+?)\s+to\s+(.+)$/i)))return [{kind:'nickname',member:member(m[1]),name:unquote(m[2])}];
  if((m=text.match(/^(?:create|make)\s+(?:an?\s+)?invite\s+(?:for|in|to)\s+(.+?)(?:\s+(?:valid\s+)?for\s+(.+?))?(?:\s+with\s+(\d+)\s+uses)?$/i)))return [{kind:'invite',target:channel(m[1]),seconds:m[2]?duration(m[2]):3600,uses:m[3]?Number(m[3]):5}];
  if((m=text.match(/^(?:set|change)\s+(?:the\s+)?server\s+(name|description)\s+to\s+(.+)$/i)))return [{kind:'guild_settings',[m[1].toLowerCase()]:unquote(m[2])}];
  if(/^(?:clear|reset|delete|forget)\s+my\s+(?:ai |chat )?(?:history|memory)$/i.test(text))return [{kind:'reset_memory'}];
  if((m=text.match(/^(?:gib|gebe|weise)\s+(.+?)\s+(?:die\s+)?rolle\s+(.+?)\s+zu$/i)))return [{kind:'assign_role',member:member(m[1]),role:role(m[2])}];
  if((m=text.match(/^(?:mach|mache)\s+(?:mich|mir)\s+(?:zur?\s+)?(?:rolle\s+)?(.+)$/i)))return [{kind:'assign_role',member:'self',role:role(m[1])}];
  if((m=text.match(/^(?:erstelle|mach|mache|generiere)\s+(?:mir\s+)?(?:einen?\s+)?(?:invite|einladungslink|einladung)\s*(?:fur|für|in)?\s*(.*)$/i))){if(m[1]&&/gultig|gültig|nutzungen|benutzungen/.test(m[1]))return null;return [{kind:'invite',target:m[1]?channel(m[1]):c.currentChannel,seconds:3600,uses:5}];}
  return null;
}
module.exports={parse,duration};
