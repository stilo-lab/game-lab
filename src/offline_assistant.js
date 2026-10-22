'use strict';

// Deterministic offline helpers: no eval, model downloads, network or server writes.
const intelligence=require('./offline_intelligence');
const offlineActions=require('./offline_actions');
const normalize=intelligence.normalize,clean=intelligence.safe;
function texts(request) {
  if(typeof request?.contents==='string')return [request.contents];
  return (Array.isArray(request?.contents)?request.contents:[]).filter(m=>m && (!m.role || m.role==='user')).flatMap(m=>(m.parts || []).filter(p=>typeof p.text==='string').map(p=>p.text));
}
function payload(request) {for(const text of texts(request)){try{const value=JSON.parse(text);if(value && typeof value==='object')return value;}catch{}}return {};}
const arithmetic=intelligence.arithmetic,chat=intelligence.chat;
function resolve(ref,rows,kind) {
  ref=String(ref || '').trim().replace(/^["'„“]|["'„“]$/g,'');
  const mention=ref.match(/^<[@#]&?!?(\d+)>$/);if(mention)return mention[1];
  const readable=value=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'');
  const matches=(rows || []).filter(r=>r.id===ref || normalize(r.name)===normalize(ref) || readable(r.name)===readable(ref));
  if(matches.length>1)throw Error(`${kind} ist mehrdeutig. Nutze eine Erwähnung.`);
  return matches.length===1?matches[0].id:ref;
}
function duration(text) {
  const m=normalize(text).match(/(\d+)\s*(sekunden?|sek|s|minuten?|min|m|stunden?|h)\b/);
  return m?Number(m[1])*({s:1,m:60,h:3600}[m[2]] || (/^sek/.test(m[2])?1:/^min/.test(m[2])?60:3600)):null;
}
const RIGHTS={'nachrichten verwalten':'ManageMessages','rollen verwalten':'ManageRoles','kanale verwalten':'ManageChannels','server verwalten':'ManageGuild','mitglieder moderieren':'ModerateMembers','nachrichten senden':'SendMessages','kanal ansehen':'ViewChannel','verlauf lesen':'ReadMessageHistory','verbinden':'Connect','sprechen':'Speak','administrator':'Administrator','mitglieder bannen':'BanMembers','mitglieder kicken':'KickMembers'};
const COLORS={blau:'#3498db',rot:'#e74c3c',grun:'#2ecc71',gelb:'#f1c40f',lila:'#9b59b6',violett:'#9b59b6',orange:'#e67e22',pink:'#e91e63',weiss:'#ffffff',schwarz:'#000000',grau:'#95a5a6',gold:'#f1c40f'};
function color(value){const n=normalize(value).replace(/^(?:der\s+)?farbe\s+/,'');return /^#[0-9a-f]{6}$/i.test(n)?n:COLORS[n]||null;}
function unquote(value){return String(value).trim().replace(/^["'„“]([\s\S]*)["'“]$/,'$1');}
function permissions(value){
  return offlineActions.rights(value);
}
function clauses(request){
  const result=[];let buffer='',quote=null;
  for(let i=0;i<request.length;i++){
    const ch=request[i];
    if(quote){buffer+=ch;if(ch===quote||quote==='„'&&ch==='“')quote=null;continue;}
    if(['"',"'",'„','“'].includes(ch)){quote=ch==='“'?'“':ch;buffer+=ch;continue;}
    // A post body is literal text, even if it contains semicolons or command words.
    if(ch===':'&&/^(?:(?:bitte|kannst du)\s+)*(?:(?:schreibe|poste|sende)\b|(?:erstelle|mache|mach)\s+(?:eine\s+)?umfrage\b)/i.test(buffer)){buffer+=request.slice(i);i=request.length;break;}
    if(/^\s+wegen\s+/i.test(request.slice(i))&&/^(?:kicke?|banne?|entbanne|timeout|setze timeout)\b/i.test(buffer)){buffer+=request.slice(i);i=request.length;break;}
    const join=request.slice(i).match(/^\s+und(?: dann)?\s+(?=(?:erstelle|erstell|mache|mach|lege|gib|gebe|weise|setze|setz|schalte|aktiviere|deaktiviere|benenne|sperre|entsperre|verschiebe|entferne|entziehe|andere|ändere|nimm|nehme|kicke|banne|entbanne|pinne|entpinne|erlaube|verbiete|vererbe|hebe|losche|lösche)\b)/i);
    if(ch===';'||ch==='\n'||join){if(buffer.trim())result.push(buffer.trim());buffer='';if(join)i+=join[0].length-1;continue;}
    buffer+=ch;
  }
  if(quote)throw Error('Ein Anführungszeichen ist noch offen.');
  if(buffer.trim())result.push(buffer.trim());return result;
}
function commandText(raw){
  const polite=/^(?:kannst du|konntest du|könntest du|wurdest du|würdest du)\s+/i.test(raw);
  let text=String(raw).trim().replace(/^(?:kannst du|konntest du|könntest du|wurdest du|würdest du)\s+/i,'').replace(/^(?:bitte\s+)+/i,'').replace(/^mir\s+/i,'');
  if(polite&&/\s+(?:erstellen|anlegen|machen)[?.!]*$/i.test(text))text='erstelle '+text.replace(/\s+(?:erstellen|anlegen|machen)[?.!]*$/i,'').replace(/\s+bitte$/i,'');
  if(/^lege\b/i.test(text))text=text.replace(/\s+an$/i,'');
  text=text.replace(/^(?:mache|mach|lege|erstell)\s+/i,'erstelle ').replace(/^(erstelle\s+(?:mir\s+)?)(?:nen|n)\s+/i,'$1einen ').replace(/^(erstelle\s+(?:mir\s+)?)(?:ne|eine)\s+/i,'$1eine ')
    .replace(/^(erstelle\s+(?:mir\s+)?(?:einen?\s+|die\s+)?)(?:channel|kanal)\s+/i,'$1Textkanal ').replace(/^(erstelle\s+(?:mir\s+)?(?:einen?\s+)?)(?:voice|vc)\s+/i,'$1Sprachkanal ');
  return text;
}
function newPlan(data){
  const original=String(data.request||'').trim(),context=structuredClone(data.server_context||{}),actions=[];
  const answer=text=>({summary:'Offline-Wunsch',actions:[{kind:'answer',text:'🧩 '+text}]});
  if(!original||original.length>1800)return answer('Bitte beschreibe einen konkreten Bot-Wunsch mit höchstens 1800 Zeichen.');
  if(/^(?:hilfe|help|moglichkeiten|möglichkeiten|was kannst du|was kann new|alles)[!?.,\s]*$/i.test(original))return answer(offlineActions.HELP);
  const listing=normalize(original).match(/^(?:zeige|liste)\s+(?:mir\s+)?(?:alle\s+)?(rollen|kanale|mitglieder)(?:\s+auf)?$/);
  if(listing){const key={rollen:'roles',kanale:'channels',mitglieder:'members'}[listing[1]],rows=context[key]||[];return answer('Verfügbare '+listing[1]+':\n'+rows.map(r=>clean(r.name)+' — '+r.id).join('\n').slice(0,5400));}
  let previousRole=null;
  try{
    const parts=clauses(original);if(parts.length>12)throw Error('Maximal zwölf klare Teilaufträge pro Wunsch.');
    for(const raw of parts){
      const clause=commandText(raw),start=actions.length;let m;
      const extra=offlineActions.parse(clause,context);
      if(extra)actions.push(...extra);
      else if((m=clause.match(/^erstelle\s+(?:mir\s+)?(?:eine[n]?\s+|die\s+)?(rolle|textkanal|text.?channel|sprachkanal|voice.?kanal|voice.?channel|kategorie)\s+(?:namens\s+|mit (?:dem )?namen\s+)?(.+)$/i))){
        const type=normalize(m[1]),rest=m[2].trim(),quoted=rest.match(/^["'„“]([^"'“]+)["'“]\s*(.*)$/);
        const boundary=rest.search(/\s+(?:mit|in|unter|und|ohne|aber)\s+|,/i),label=unquote(quoted?quoted[1]:boundary>=0?rest.slice(0,boundary):rest),tail=quoted?quoted[2]:boundary>=0?rest.slice(boundary).trim():'';
        if(!label||label.length>100||/[\u0000-\u001f]/.test(label))throw Error('Name fehlt oder ist zu lang.');
        if(type==='rolle'){
          let roleColor=null,grant=[];
          if(tail){
            const attrs=tail.replace(/^(?:mit|in)\s+/i,'').split(/\s*(?:,|\bund\b)\s*/i).filter(Boolean),rights=[];
            for(const attr of attrs){const c=color(attr);if(c){if(roleColor)throw Error('Bitte nur eine Rollenfarbe nennen.');roleColor=c;}else rights.push(attr);}
            if(rights.length)grant=permissions(rights.join(' und '));
          }
          actions.push({kind:'role',name:label,...(roleColor?{color:roleColor}:{})});previousRole=label;
          if(grant.length)actions.push({kind:'role_permissions',role:label,grant});
        }else{
          const kind=type==='kategorie'?'category':/sprach|voice/.test(type)?'voice_channel':'text_channel';
          let parent;
          if(tail){const p=tail.match(/^(?:in|unter)\s+(?:der\s+)?(?:kategorie\s+)?(.+)$/i);if(!p||kind==='category')throw Error('Für diesen Zusatz fehlt ein eindeutiger Wunsch.');parent=resolve(unquote(p[1]),context.channels,'Kategorie');}
          actions.push({kind,name:label,...(parent?{parent}:{})});
        }
      }else if((m=clause.match(/^(?:gib|gebe|weise|entferne)\s+(mir|<@!?\d+>)\s+(?:die\s+)?rolle\s+(.+?)(?:\s+zu)?$/i))){
        const roleRef=/^(?:diese|diese rolle|gerade erstellte)$/i.test(m[2])?previousRole:m[2];if(!roleRef)throw Error('Welche Rolle meinst du?');
        actions.push({kind:/^entferne/i.test(clause)?'remove_role':'assign_role',member:normalize(m[1])==='mir'?'self':m[1],role:resolve(roleRef,context.roles,'Rolle')});
      }else if((m=clause.match(/^(gib|gebe|entziehe)\s+(?:der\s+)?rolle\s+(.+?)\s+(?:die\s+)?(?:rechte?|berechtigungen?)\s*:?\s+(.+)$/i))){
        actions.push({kind:'role_permissions',role:resolve(m[2],context.roles,'Rolle'),[/^entziehe$/i.test(m[1])?'revoke':'grant']:permissions(m[3])});
      }else if((m=clause.match(/^(?:setze|setz|aktiviere)\s+(?:den\s+)?slowmode\s+(?:in|fur|für)\s+(.+?)\s+(?:auf\s+)?(\d+\s*(?:sekunden?|sek|s|minuten?|min|m|stunden?|h))$/i))){
        const seconds=duration(m[2]);if(seconds===null||seconds>21600)throw Error('Slowmode unterstützt 0 bis 6 Stunden.');
        actions.push({kind:'slowmode',target:normalize(m[1])==='hier'?context.currentChannel:resolve(m[1],context.channels,'Kanal'),seconds});
      }else if((m=clause.match(/^(?:schalte|deaktiviere)\s+(?:den\s+)?slowmode\s+(?:in|fur|für)\s+(.+?)(?:\s+aus)$/i))){
        actions.push({kind:'slowmode',target:normalize(m[1])==='hier'?context.currentChannel:resolve(m[1],context.channels,'Kanal'),seconds:0});
      }else if((m=clause.match(/^(schalte|aktiviere|deaktiviere)\s+(ai|ki|support.?ai|support.?ki|automod|anti.?spam|ubersetzung|übersetzung|welcome|ticket.?feedback)(?:\s+(an|ein|aus))?$/i))){
        const key=normalize(m[2]);if(/^schalte$/i.test(m[1])&&!m[3])throw Error('Soll die Funktion an oder aus?');
        if(/^deaktiviere$/i.test(m[1])&&m[3]&&m[3]!=='aus'||/^aktiviere$/i.test(m[1])&&m[3]==='aus')throw Error('An und Aus widersprechen sich.');
        const feature=/support/.test(key)?'supportAiEnabled':/automod|spam/.test(key)?'autoModEnabled':/ubersetzung/.test(key)?'translationEnabled':/welcome/.test(key)?'welcomeEnabled':/feedback/.test(key)?'ticketFeedbackEnabled':'aiEnabled';
        actions.push({kind:'feature',feature,enabled:!/^deaktiviere$/i.test(m[1])&&normalize(m[3])!=='aus'});
      }else if((m=clause.match(/^benenne\s+(?:den\s+)?(?:kanal\s+)?(.+?)\s+in\s+(.+?)\s+um$/i))){
        actions.push({kind:'rename_channel',target:resolve(m[1],context.channels,'Kanal'),name:unquote(m[2])});
      }else if((m=clause.match(/^(?:sperre|entsperre)\s+(?:den\s+)?(?:kanal\s+)?(.+)$/i))){
        actions.push({kind:'lock_channel',target:resolve(m[1],context.channels,'Kanal'),enabled:!/^entsperre/i.test(clause)});
      }else if((m=clause.match(/^(?:aktiviere|setze)\s+counting\s+(?:in|auf)\s+(.+)$/i))){
        actions.push({kind:'counting',target:resolve(m[1],context.channels,'Kanal')});
      }else if((m=clause.match(/^verschiebe\s+(?:den\s+)?(?:kanal\s+)?(.+?)\s+in\s+(?:die\s+)?(?:kategorie\s+)?(.+)$/i))){
        actions.push({kind:'move_channel',target:resolve(m[1],context.channels,'Kanal'),parent:resolve(m[2],context.channels,'Kategorie')});
      }else if((m=clause.match(/^(?:andere|ändere|setze)\s+(?:die\s+)?farbe\s+(?:der\s+)?rolle\s+(.+?)\s+auf\s+(.+)$/i))){
        const c=color(m[2]);if(!c)throw Error('Nenne eine Farbe wie Blau oder einen Wert wie #3498db.');actions.push({kind:'edit_role',role:resolve(m[1],context.roles,'Rolle'),color:c});
      }else if((m=clause.match(/^(?:schreibe|poste|sende)\s+(?:in|nach)\s+(.+?)\s*:\s*([\s\S]+)$/i))){
        actions.push({kind:'post',target:normalize(m[1])==='hier'?context.currentChannel:resolve(m[1],context.channels,'Kanal'),text:clean(unquote(m[2]))});
      }else{
        if(parts.length===1&&(arithmetic(original)||intelligence.convert(original)||/^(?:was|wie|warum|wo|wann|wer|hilfe|fasse|zusammenfassung)\b/i.test(original)))return answer(chat(original));
        throw Error('Diesen Wunsch kann ich offline nicht eindeutig planen. Beispiele: „Mach einen Kanal clips und erstelle eine Rolle Helfer in Blau“, „Gib mir die Rolle Helfer“ oder „Setze Slowmode in #chat auf 2 Minuten“.');
      }
      if(actions.length>12)throw Error('Mehr als zwölf Aktionen.');
      // Later clauses may refer to explicitly planned objects by their exact name.
      for(const action of actions.slice(start)){
        if(action.kind==='role'){context.roles ||= [];if(!context.roles.some(r=>r.name===action.name))context.roles.push({id:action.name,name:action.name});context.previousRole=action.name;}
        if(['category','text_channel','voice_channel'].includes(action.kind)){context.channels ||= [];if(!context.channels.some(c=>c.name===action.name))context.channels.push({id:action.name,name:action.name,type:{category:4,text_channel:0,voice_channel:2}[action.kind]});}
      }
    }
    if(!actions.length)throw Error('Bitte nenne einen konkreten Wunsch.');
    return {summary:'🧩 Offline geplant: '+clean(original).slice(0,500),actions};
  }catch(error){return answer(error.message+' Bitte formuliere den Wunsch genauer. Es wurde nichts geändert.');}
}
function setupPlan(data) {
  const plan=structuredClone(data.aktuellerEntwurf || {}),wish=String(data.wunsch || ''),n=normalize(wish);
  if(!Array.isArray(plan.categories))throw Error('Offline-Entwurf braucht eine vorhandene Vorlage.');
  let changed=false;const style=data.gewaehltesDesign;
  if(/(?:keine schmuckschrift|schlicht|normale schrift)/.test(n)){
    for(const category of plan.categories){category.name=category.name.normalize('NFKC');for(const channel of category.channels)channel.name=channel.name.normalize('NFKC').replace(/^『([^』]+)』(.+)$/,'$1│$2').toLowerCase();}changed=true;
  }
  const count=n.match(/(\d+|zwei|drei|vier|funf|sechs)\s+(?:voice.?kanale|sprachkanale|voice.?chats)/);
  if(count) {
    const number=Number(count[1]) || {zwei:2,drei:3,vier:4,funf:5,sechs:6}[count[1]];
    if(number<1 || number>10)throw Error('Offline sind 1–10 Voice-Kanäle pro Wunsch möglich.');
    let category=plan.categories.find(c=>c.key==='section-voice');
    if(!category){category={key:'section-voice',name:'🔊 Voice',channels:[]};plan.categories.push(category);}
    const existing=category.channels.filter(c=>c.kind==='voice').length;
    if(existing>number){let kept=0;category.channels=category.channels.filter(c=>c.kind!=='voice' || ++kept<=number);}
    for(let i=existing+1;i<=number;i++)category.channels.push({key:'offline-voice-'+i,name:'🔊│lounge-'+i,kind:'voice',access:'public',purpose:null});changed=true;
  }
  const cat=wish.match(/(?:erstelle|erstell|fuge|füge)\s+(?:eine\s+)?kategorie\s+["„']?([^"“';\n]+?)(?:["“']|\s+(?:mit|hinzu)|$)/i);
  if(cat) {
    const label=cat[1].trim();if(label.length>80)throw Error('Kategoriename ist zu lang.');
    const key='offline-'+normalize(label).replace(/[^a-z0-9]/g,'').slice(0,25);
    if(!plan.categories.some(c=>c.key===key || normalize(c.name).replace(/[^\p{L}\p{N}]/gu,'')===normalize(label).replace(/[^\p{L}\p{N}]/gu,'')))plan.categories.push({key,name:'🎮 '+label,channels:[{key:key+'-chat',name:'💬│'+label.toLowerCase()+'-chat',kind:'text',access:'public',purpose:null}]});changed=true;
  }
  const channel=wish.match(/(?:erstelle|erstell|fuge|füge)\s+(?:einen\s+)?textkanal\s+["„']?([^"“';\n]+?)(?:["“']|\s+hinzu|$)/i);
  if(channel) {
    const label=channel[1].trim(),key='offline-'+normalize(label).replace(/[^a-z0-9]/g,'').slice(0,25);
    const category=plan.categories.find(c=>c.key==='section-community') || plan.categories[0];
    if(!plan.categories.some(c=>c.channels.some(ch=>ch.key===key || normalize(ch.name).replace(/[^\p{L}\p{N}]/gu,'')===normalize(label).replace(/[^\p{L}\p{N}]/gu,''))))category.channels.push({key,name:'💬│'+label.toLowerCase(),kind:'text',access:'public',purpose:null});changed=true;
  }
  if(/gaming.?voice.*(?:uber|vor).*chill/.test(n)) {
    for(const c of plan.categories){const game=c.channels.findIndex(ch=>ch.key==='voice-gaming'),chill=c.channels.findIndex(ch=>ch.key==='voice-chill');if(game>=0&&chill>=0){const [row]=c.channels.splice(game,1);c.channels.splice(c.channels.findIndex(ch=>ch.key==='voice-chill'),0,row);changed=true;}}
  }
  if(!changed)throw Error('Offline unterstützt dieses Wunschfeld z. B. „3 Voice-Kanäle“, „Erstelle eine Kategorie Minecraft“, „Erstelle einen Textkanal clips“ und „Gaming-Voice über Chill“. Für diesen freien Wunsch brauche ich eine genauere unterstützte Formulierung. Es wurde nichts geändert.');
  plan.title='🧩 Offline: '+String(plan.title || 'Server-Design').slice(0,65);return plan;
}
function pulse(transcript) {
  const lines=String(transcript).split('\n').map(s=>s.trim()).filter(Boolean).slice(-80);
  return {summary:`🧩 Offline-Auswertung von ${lines.length} Textzeilen. Die folgenden Fragen stammen wörtlich aus dem Ausschnitt; Stimmung und Absichten werden nicht bewertet.`,topics:[],questions:lines.filter(s=>s.includes('?')).slice(-5).map(s=>clean(s).slice(0,180)),problems:[],actions:['Offene Fragen gemeinsam prüfen.'],announcement:''};
}
function request(request,label='') {
  const data=payload(request),system=String(request.config?.systemInstruction || ''),userTexts=texts(request),last=userTexts.at(-1)||'';
  let output;
  if(/^new_planner/.test(label))output=JSON.stringify(newPlan(data));
  else if(label==='server_setup_design') {try{output=JSON.stringify(setupPlan(data));}catch(error){error.offline=true;throw error;}}
  else if(label==='ai_pulse')output=JSON.stringify(pulse(last.split('CHAT:\n').at(-1)));
  else if(/moderation classifier|classify existing discord channels/i.test(system))output=/existing discord channels/i.test(system)?'[]':JSON.stringify({insult:false,severity:0,targetUserId:null,mutualConflict:false,counterpartUserId:null,scam:false,threat:false,confidence:0,reason:'Offline: keine semantische Moderationsentscheidung.'});
  else if(/precise Discord translator/i.test(system))output='🧩 Offline: Eine zuverlässige freie Übersetzung ist ohne Sprachmodell nicht verfügbar.';
  else if(/neutral Discord dispute mediator/i.test(system))output='🧩 Offline-Schlichtung: Beschreibt bitte nacheinander den konkreten Vorfall und welche Lösung ihr euch wünscht. Das Team prüft Belege und entscheidet; ich vergebe keine Schuld oder Strafen. Bilder kann der Offline-Modus nicht auswerten.';
  else if(/staff application/i.test(system))output='🧩 Offline-Bewerbungsprüfung\n'+clean(last).slice(0,900)+'\n\nFragen fürs Gespräch: Welche Erfahrung bringst du mit? Wie löst du Konflikte? Welche Zeiten sind möglich? Wie gehst du mit vertraulichen Daten um? Wann holst du einen anderen Moderator dazu?';
  else if(/summariz|briefing|internal staff assistant|community-vorschlag|frage des tages/i.test(system)) {
    if(/frage des tages/i.test(system))output='Welches Spiel würdest du heute mit der Community ausprobieren?';
    else if(/community-vorschlag/i.test(system))output='🧩 Offline-Rückmeldung: Dein Vorschlag ist gespeichert. Prüft im Team den Nutzen, den Aufwand und einen kleinen ersten Test. Eine Umsetzung wurde nicht genehmigt.';
    else output='🧩 Lokale Text-/Datenauswertung\n'+clean(last).slice(0,1600)+'\n\nDas Team prüft offene Angaben und Belege. Diese Ausgabe ist ein Auszug der vorhandenen Informationen, keine neue Tatsachenbewertung.';
  } else {
    const knowledge=system.match(/Server-spezifisches Wissen[^\n]*:\n([\s\S]*?)(?=\n\nAdmin-Verbesserungen|\nANTWORTQUALITÄT|$)/)?.[1]
      || system.match(/PASSENDES SERVERWISSEN AUS \/learn:\n([\s\S]*?)(?=\nFAQ-KONTEXT|$)/)?.[1] || '';
    const support=/ticket_ai/.test(label)&&typeof data.current_request==='string';
    let faq=null;try{faq=JSON.parse(system.match(/FAQ-KONTEXT[^\n]*:\n([^\n]*)/)?.[1]||'null');}catch{}
    const history=support?(Array.isArray(data.recent_ticket_conversation)?data.recent_ticket_conversation:[]).map(m=>({role:m.role==='user'?'user':'model',text:m.text})):request.contents || [];
    output=chat(support?data.current_request:last.split('\n\nWichtig:')[0],{knowledge,faq,history,support});
  }
  return {text:output,offline:true};
}
module.exports={normalize,arithmetic,chat,newPlan,setupPlan,pulse,request};
