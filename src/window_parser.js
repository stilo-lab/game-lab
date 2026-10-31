'use strict';
const extra=require('./offline_actions');
const uq=value=>String(value||'').trim().replace(/^["„']([\s\S]*)["“']$/,'$1');
function split(text,words=false){
  const out=[];let part='',quote=null;
  for(let i=0;i<text.length;i++){
    const ch=text[i];if(quote){part+=ch;if(ch===quote||quote==='“'&&ch==='”')quote=null;continue;}
    if(['"','„','“'].includes(ch)){quote=ch==='„'?'“':ch;part+=ch;continue;}
    const word=words&&text.slice(i).match(/^\s+(?:und|and)\s+/i);
    if(ch==='|'||ch===';'||word){if(part.trim())out.push(part.trim());part='';if(word)i+=word[0].length-1;continue;}part+=ch;
  }
  if(quote)throw Error('Close the quoted text before adding another button.');if(part.trim())out.push(part.trim());return out;
}
function channel(ref,c){if(/^(?:hier|here|this channel)$/i.test(ref))return c.currentChannel;return extra.resolve(uq(ref).replace(/^#/,'').replace(/^(?:kanal|channel)\s+/i,''),c.channels,'Channel');}
function member(ref,c){if(/^(?:mir|mich|me|myself|self)$/i.test(ref))return 'self';return extra.resolve(uq(ref).replace(/^(?:dem\s+)?(?:spieler|mitglied|user|member)\s+/i,''),c.members,'Member');}
function role(ref,c){return extra.resolve(uq(ref).replace(/^(?:die|der|the)\s+/i,''),c.roles,'Role');}
function button(raw,c){
  const labelFor=(en,de)=>/^(?:de|deutsch|german)/i.test(c.bot_language||'')?de:en;
  let text=raw.trim().replace(/^(?:einen?\s+|a\s+)?(?:button|knopf)\s+(?:für|fur|for|zum)\s+/i,'').replace(/^(?:die|der|eine?|the|a)\s+(?=rolle|role|ticket)/i,'').replace(/\s+(?:kann|können|koennen)$/i,''),label=null,m;
  const named=text.match(/^(?:["„]([^"“]+)["“]|([^:|]{1,80}))\s*(?:=>|->)\s*([\s\S]+)$/);if(named){label=(named[1]||named[2]).trim();text=named[3].trim();}
  if(/^(?:(?:ein|einen|a)\s+)?(?:support[ -]?)?ticket(?:\s+(?:öffnen|oeffnen|open))?$/i.test(text))return {type:'ticket',label:label||labelFor('Open ticket','Ticket öffnen')};
  if((m=text.match(/^(?:link|url)(?:\s+(.+?))?\s*:?\s+(https:\/\/\S+)$/i)))return {type:'link',label:label||uq(m[1])||labelFor('Open link','Link öffnen'),url:m[2]};
  if(/^https:\/\/\S+$/i.test(text))return {type:'link',label:label||labelFor('Open link','Link öffnen'),url:text};
  if((m=text.match(/^(?:antwort|nachricht|info|reply|message)\s*:\s*([\s\S]+)$/i)))return {type:'reply',label:label||'Info',text:uq(m[1])};
  if((m=text.match(/^(?:befehl|command|aktion|action)\s*:?\s+["„]([\s\S]+)["“]$/i)))return {type:'request',label:label||labelFor('Run request','Befehl ausführen'),request:m[1]};
  if((m=text.match(/^(?:formular|form)\s*(?:["„]([^"“]+)["“])?\s*(?:mit\s+(?:den\s+)?feldern|with\s+fields)\s+(.+?)\s+(?:an|nach|in|to)\s+(.+)$/i)))return {type:'form',label:label||m[1]||labelFor('Open form','Formular öffnen'),fields:m[2].split(/\s*,\s*/).map(uq),destination:channel(m[3],c)};
  if((m=text.match(/^(?:rolle|role)\s+(.+?)(?:\s+(geben|bekommen|nehmen|erhalten|holen|entfernen|umschalten|get|add|remove|toggle))?$/i)))return {type:'role',label:label||uq(m[1]),role:role(m[1],c),mode:/entfernen|remove/.test(m[2]||'')?'remove':/geben|bekommen|nehmen|erhalten|holen|get|add/.test(m[2]||'')?'add':'toggle'};
  if((m=text.match(/^(?:(?:die|the)\s+)?(?:rolle|role)\s+(.+?)\s+(?:erhalten|holen|get)$/i)))return {type:'role',label:label||uq(m[1]),role:role(m[1],c),mode:'add'};
  if((m=text.match(/^(get|give|add|remove|toggle)\s+(?:the\s+)?role\s+(.+)$/i)))return {type:'role',label:label||uq(m[2]),role:role(m[2],c),mode:m[1].toLowerCase()==='remove'?'remove':m[1].toLowerCase()==='toggle'?'toggle':'add'};
  throw Error('Describe each button as role, ticket, link, reply, form or command. Example: Rolle VIP | Ticket öffnen.');
}
function parseRequest(raw,c={}){
  const text=String(raw||'').trim().replace(/^(?:bitte\s+|please\s+|kannst du\s+(?:bitte\s+)?|can you\s+(?:please\s+)?)/i,'');let m;
  const answer=message=>({summary:'Request details',actions:[{kind:'answer',text:message}]});
  try{
    let recipients,body;
    if((m=text.match(/^(?:schreibe?|sende|schicke|send|write)\s+(?:eine?\s+|a\s+)?(?:dm|pn|direktnachricht|private nachricht|direct message|private message)\s+(?:an|to)\s+(.+?)\s*(?::|\s+mit\s+(?:(?:dem\s+)?(?:text|inhalt)\s+)?|\s+saying\s+)([\s\S]+)$/i))){recipients=m[1];body=m[2];}
    else if((m=text.match(/^(?:schreibe?|sende|schicke|send|write)\s+(.+?)\s+(?:eine?\s+|a\s+)?(?:dm|pn|direktnachricht|private nachricht|direct message|private message)\s*(?::|mit\s+(?:(?:dem\s+)?(?:text|inhalt)\s+)?|saying\s+)([\s\S]+)$/i))){recipients=m[1];body=m[2];}
    else if((m=text.match(/^dm\s+(.+?)\s*:\s*([\s\S]+)$/i))){recipients=m[1];body=m[2];}
    else if((m=text.match(/^(?:schreibe?|schicke|write|message)\s+(.+?)\s+(?:privat|privately)\s*:\s*([\s\S]+)$/i))){recipients=m[1];body=m[2];}
    if(recipients!==undefined){
      const refs=split(recipients.replace(/\s*,\s*/g,'|'),true);if(!refs.length||refs.length>5)throw Error('Mention one to five specific members. Group or mass DMs are not supported.');
      const ids=refs.map(ref=>member(ref,c));if(new Set(ids).size!==ids.length)throw Error('The recipient is listed more than once.');
      const message=uq(body);if(!message.trim())throw Error('Include the exact message after a colon.');
      return {summary:'Send the reviewed direct message',actions:ids.map(id=>({kind:'direct_message',member:id,text:message}))};
    }
    if(/^(?:schreibe?|sende|schicke|send|write|dm)\b/i.test(text)&&/\b(?:dm|direktnachricht|private nachricht|direct message|private message|pn)\b/i.test(text))return answer('Mention the recipient and the exact text. Example: Schreibe @Mia eine DM: Hallo!');
    if((m=text.match(/^(?:entferne|lösche|loesche|remove|delete)\s+(?:das\s+|the\s+)?(?:fenster|panel|window|menu)\s+([a-f\d-]{36})$/i)))return {summary:'Remove this window',actions:[{kind:'delete_panel',panel:m[1]}]};
    if((m=text.match(/^(?:erstelle?|mach|mache|bau|baue|create|make|build|set up)\s+(?:mir\s+)?(?:ein(?:en|e)?\s+|a\s+|an\s+)?(?:fenster|panel|menü|menu|window)\b([\s\S]*)$/i))){
      const rest=m[1].trim(),divider=rest.match(/\s*(?:\bmit\s+(?:(?:den|diesen)\s+)?(?:buttons?|knöpfen|knoepfen)\s*:?|\bwith\s+buttons?\s*:?|\bwo\s+(?:(?:ich|man|wir)\s+)?|\bmit\s*:?)\s*/i);
      if(!divider)return answer('Which buttons should the window contain? Example: Erstelle ein Fenster "Community" mit Buttons: Rolle VIP | Ticket öffnen.');
      let header=rest.slice(0,divider.index).trim(),body=rest.slice(divider.index+divider[0].length).replace(/^(?:buttons?\s*:?\s*)/i,'');
      let target=c.currentChannel;const location=header.match(/\s+(?:in|nach|to)\s+(.+)$/i);if(location){target=channel(location[1],c);header=header.slice(0,location.index).trim();}
      if(/^(?:in|nach|to)\s+/i.test(header)){target=channel(header.replace(/^(?:in|nach|to)\s+/i,''),c);header='';}
      const items=split(body, !/[|;]/.test(body));if(!items.length||items.length>10)throw Error('Choose one to ten buttons, separated by |.');
      return {summary:'Create a window with the requested buttons',actions:[{kind:'action_panel',target,name:uq(header)||'Community',buttons:items.map(item=>button(item,c))}]};
    }
    return null;
  }catch(error){return answer('🧩 '+error.message+' Nothing has been sent or created.');}
}
module.exports={parseRequest,split,button};
