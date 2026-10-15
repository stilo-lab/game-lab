'use strict';

// Deterministic offline helpers: no eval, model downloads, network or server writes.
const normalize=value=>String(value || '').normalize('NFKC').toLowerCase().replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
const clean=value=>String(value || '').replace(/@everyone|@here/gi,'[Gruppen-Ping]').slice(0,6000);
function texts(request) {
  if(typeof request?.contents==='string')return [request.contents];
  return (Array.isArray(request?.contents)?request.contents:[]).filter(m=>m && (!m.role || m.role==='user')).flatMap(m=>(m.parts || []).filter(p=>typeof p.text==='string').map(p=>p.text));
}
function payload(request) {for(const text of texts(request)){try{const value=JSON.parse(text);if(value && typeof value==='object')return value;}catch{}}return {};}
function arithmetic(question) {
  const match=String(question).match(/(?:^|\b(?:berechne|rechne|was ist|wieviel ist|wie viel ist)\s*:?)\s*([\d.,\s()+*/^−-]+)\s*\??$/i);
  if(!match || !/[+*/^−-]/.test(match[1]))return null;
  const expression=match[1].replace(/,/g,'.').replace(/−/g,'-').replace(/\s/g,'');
  if(expression.length>300)return null;
  const tokens=expression.match(/\d+(?:\.\d+)?|[()+*/^-]/g)||[];
  if(tokens.join('')!==expression || tokens.length>200)return null;
  let pos=0,operations=0;
  function primary(){const token=tokens[pos++];if(token==='+' || token==='-'){const value=primary();return token==='-'?-value:value;}if(token==='('){const value=sum();if(tokens[pos++]!==')')throw Error('Klammer fehlt');return value;}if(!/^\d+(?:\.\d+)?$/.test(token || ''))throw Error('Ungültige Rechnung');return Number(token);}
  function unary(){if(tokens[pos]==='+' || tokens[pos]==='-'){const op=tokens[pos++],value=unary();return op==='-'?-value:value;}return power();}
  function power(){let value=primary();if(tokens[pos]==='^'){pos++;const exponent=unary();if(Math.abs(exponent)>100)throw Error('Exponent zu groß');value=value**exponent;}return value;}
  function product(){let value=unary();while(['*','/'].includes(tokens[pos])){const op=tokens[pos++],right=unary();if(++operations>100 || op==='/' && right===0)throw Error('Division durch null');value=op==='*'?value*right:value/right;}return value;}
  function sum(){let value=product();while(['+','-'].includes(tokens[pos])){const op=tokens[pos++],right=product();if(++operations>100)throw Error('Zu groß');value=op==='+'?value+right:value-right;}return value;}
  try{const value=sum();if(pos!==tokens.length || !Number.isFinite(value))return null;return `${expression} = ${Number(value.toPrecision(12))}`;}catch{return 'Diese Rechnung ist ungültig oder überschreitet die Grenzen des Offline-Rechners.';}
}
function chat(question,{knowledge='',faq=null,history=[],support=false}={}) {
  history=Array.isArray(history)?history:[];
  const q=clean(question).trim(),n=normalize(q),math=arithmetic(q);
  if(math)return math+'\n\n🧩 Offline berechnet.';
  if(/^(?:hi|hey|yo|hallo|moin|servus)[!?.,\s]*$/.test(n))return 'yo, offline-modus läuft. was brauchst du?';
  if(/^(?:danke|thx|passt|gelost|geht wieder)[!?.,\s]*$/.test(n))return 'passt, freut mich 🙂';
  if(faq?.answer)return `📚 Lokale Hilfe:\n${clean(faq.answer)}\n\n🧩 Offline-Modus`;
  if(String(knowledge).trim())return `📚 Gespeichertes Serverwissen:\n${clean(knowledge).replace(/\[[^\]\n]{1,90}\]/g,'').slice(0,3500)}\n\n🧩 Offline-Modus: aus hinterlegten Angaben, ohne Websuche.`;
  const previous=history.filter(m=>m.role==='user').slice(-3).map(m=>m.parts?.[0]?.text || m.text || '').join(' ');
  const focus=/^(?:geht nicht|geht nd|nope|hat nix gebracht|warum|weiter)[!?.,\s]*$/.test(n)?q+' '+previous:q;
  if(/(?:anti.?spam|security|sicherheit)/i.test(focus))return '🛡️ Nutze `/security status` für den Schutzstatus. Als Serververwaltung kannst du mit `/security config` die Schwellen ändern. Der globale AutoMod-Schalter steht in `/settings`.\n\n🧩 Offline-Hilfe';
  if(/(?:setup|kanal|rollen?|berechtigung)/i.test(focus))return 'Nutze `/serversetup` für ein Design mit Wunschfeld oder `/new` für gezielte Änderungen. Offline kannst du zum Beispiel schreiben: „Erstelle eine Rolle Helfer“, „Erstelle einen Textkanal clips“ oder „Setze Slowmode in #chat auf 5 Sekunden“. Die Vorschau zeigt, was tatsächlich umgesetzt werden kann.\n\n🧩 Offline-Hilfe';
  if(/(?:railway|bot.*offline|restart|neustart|cannot find module)/i.test(focus))return 'Prüfe im Railway-Deploy die erste Fehlermeldung und die angezeigte Paketversion. Bei „Cannot find module“ müssen alle mitgelieferten src-Dateien direkt im vorhandenen src-Ordner liegen. Ein Neustart behebt keine fehlende Datei. Welche genaue Meldung steht dort?\n\n🧩 Offline-Hilfe';
  if(/(?:youtube|upload|404)/i.test(focus))return 'Nutze den direkten YouTube-Kanal-Link oder @Handle, keinen einzelnen Video-Link. Falls YouTube den Feed ablehnt, prüfe das gespeicherte Abo und optional YOUTUBE_API_KEY. Abos und bereits erkannte Videos bleiben erhalten. Welche genaue Meldung erscheint?\n\n🧩 Offline-Hilfe';
  return support?'🧩 Der Offline-Support ist aktiv. Beschreibe bitte die genaue Fehlermeldung und den letzten Versuch. Ich kann gespeicherte FAQ und Serverwissen nutzen; bei einem unbekannten Problem hilft „Get Human Support“. Bilder und aktuelle Webseiten kann dieser Offline-Modus nicht auswerten.':'🧩 Offline-Modus: Ich kann gespeichertes /learn-Wissen, Bot-Hilfe und einfache Rechnungen nutzen. `/new` und `/serversetup` verstehen unterstützte lokale Wünsche. Für freie Texte, beliebigen Code oder aktuelle Recherchen ist ein KI-Modell nötig. Welchen konkreten Bot-Wunsch soll ich umsetzen?';
}
function resolve(ref,rows,kind) {
  ref=String(ref || '').trim().replace(/^["'„“]|["'„“]$/g,'');
  const mention=ref.match(/^<[@#]&?!?(\d+)>$/);if(mention)return mention[1];
  const readable=value=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'');
  const matches=(rows || []).filter(r=>r.id===ref || normalize(r.name)===normalize(ref) || readable(r.name)===readable(ref));
  if(matches.length>1)throw Error(`${kind} ist mehrdeutig. Nutze eine Erwähnung.`);
  return matches.length===1?matches[0].id:ref;
}
function duration(text) {
  const m=normalize(text).match(/(\d+)\s*(sekunden?|s|minuten?|min|m|stunden?|h)\b/);
  return m?Number(m[1])*({s:1,m:60,h:3600}[m[2]] || (/^sek/.test(m[2])?1:/^min/.test(m[2])?60:3600)):null;
}
const RIGHTS={'nachrichten verwalten':'ManageMessages','rollen verwalten':'ManageRoles','kanale verwalten':'ManageChannels','server verwalten':'ManageGuild','mitglieder moderieren':'ModerateMembers','nachrichten senden':'SendMessages','kanal ansehen':'ViewChannel','verlauf lesen':'ReadMessageHistory','verbinden':'Connect','sprechen':'Speak','administrator':'Administrator','mitglieder bannen':'BanMembers','mitglieder kicken':'KickMembers'};
function newPlan(data) {
  const original=String(data.request || '').trim(),context=data.server_context || {},actions=[];
  const answer=text=>({summary:'Offline-Wunsch',actions:[{kind:'answer',text:'🧩 '+text}]});
  if(!original || original.length>1800)return answer('Bitte beschreibe einen konkreten Bot-Wunsch.');
  const clauses=original.split(/\s*;\s*|\n+|\s+und dann\s+/i).filter(Boolean);
  if(clauses.length>12)return answer('Maximal zwölf klare Teilaufträge pro Wunsch.');
  let previousRole=null;
  try {
    for(const clause of clauses) {
      const n=normalize(clause);let m;
      if((m=clause.match(/^(?:bitte\s+)?(?:erstelle|erstell|mache|mach|lege)\s+(?:mir\s+)?(?:eine[n]?\s+|die\s+)?(rolle|textkanal|text.?channel|sprachkanal|voice.?kanal|voice.?channel|kategorie)\s+(?:namens\s+|mit (?:dem )?namen\s+)?(.+)$/i))) {
        const type=normalize(m[1]),rest=m[2].trim();
        const label=rest.match(/^["„']([^"“']+)["“']/)?.[1] || rest.split(/\s+(?:mit|in|unter|und)\s+|,/i)[0].trim();
        if(!label || label.length>100)throw Error('Name fehlt oder ist zu lang.');
        const color=rest.match(/#[0-9a-f]{6}\b/i)?.[0];
        if(type==='rolle') {
          actions.push({kind:'role',name:label,...(color?{color}:{})});previousRole=label;
          const explicit=rest.match(/\s+mit\s+(.+)/i)?.[1];
          if(explicit){const grant=Object.entries(RIGHTS).filter(([word])=>normalize(explicit).includes(word)).map(([,key])=>key);if(grant.length)actions.push({kind:'role_permissions',role:label,grant});else if(!color)throw Error('Diese Berechtigung ist offline nicht eindeutig.');}
        } else {
          const kind=type==='kategorie'?'category':/sprach|voice/.test(type)?'voice_channel':'text_channel';
          const parent=rest.match(/\s+(?:in|unter)\s+(?:der\s+)?(?:kategorie\s+)?(.+)$/i)?.[1];
          actions.push({kind,name:label,...(parent?{parent:resolve(parent,context.channels,'Kategorie')}:{})});
        }
      } else if((m=clause.match(/^(?:gib|weise)\s+(mir|<@!?\d+>)\s+(?:die\s+)?rolle\s+(.+?)(?:\s+zu)?$/i))) {
        actions.push({kind:'assign_role',member:m[1]==='mir'?'self':m[1],role:resolve(m[2],context.roles,'Rolle')});
      } else if((m=clause.match(/^(?:gib|gebe)\s+(?:der\s+)?rolle\s+(.+?)\s+(?:die\s+)?(?:rechte?|berechtigungen?)\s*:?\s+(.+)$/i))) {
        const grant=Object.entries(RIGHTS).filter(([word])=>normalize(m[2]).includes(word)).map(([,key])=>key);
        if(!grant.length)throw Error('Rechte nicht erkannt.');actions.push({kind:'role_permissions',role:resolve(m[1],context.roles,'Rolle'),grant});
      } else if((m=clause.match(/^(?:setze|setz|aktiviere)\s+(?:den\s+)?slowmode\s+(?:in|fur|für)\s+(.+?)\s+(?:auf\s+)?(\d+\s*(?:sekunden?|s))$/i))) {
        actions.push({kind:'slowmode',target:resolve(m[1],context.channels,'Kanal'),seconds:duration(m[2])});
      } else if((m=clause.match(/^(?:schalte|aktiviere|deaktiviere)\s+(ai|ki|support.?ai|support.?ki|automod|anti.?spam|ubersetzung|übersetzung|welcome)(?:\s+(an|ein|aus))?$/i))) {
        const key=normalize(m[1]),feature=/support/.test(key)?'supportAiEnabled':/automod|spam/.test(key)?'autoModEnabled':/ubersetzung/.test(key)?'translationEnabled':/welcome/.test(key)?'welcomeEnabled':'aiEnabled';
        actions.push({kind:'feature',feature,enabled:!/^deaktiviere/i.test(clause)&&normalize(m[2])!=='aus'});
      } else if((m=clause.match(/^benenne\s+(?:den\s+)?(?:kanal\s+)?(.+?)\s+in\s+(.+?)\s+um$/i))) {
        actions.push({kind:'rename_channel',target:resolve(m[1],context.channels,'Kanal'),name:m[2].replace(/^["„']|["“']$/g,'')});
      } else if((m=clause.match(/^(?:sperre|entsperre)\s+(?:den\s+)?(?:kanal\s+)?(.+)$/i))) {
        actions.push({kind:'lock_channel',target:resolve(m[1],context.channels,'Kanal'),enabled:!/^entsperre/i.test(clause)});
      } else if((m=clause.match(/^(?:aktiviere|setze)\s+counting\s+(?:in|auf)\s+(.+)$/i))) {
        actions.push({kind:'counting',target:resolve(m[1],context.channels,'Kanal')});
      } else if((m=clause.match(/^(?:schreibe|poste|sende)\s+(?:in|nach)\s+(.+?)\s*:\s*([\s\S]+)$/i))) {
        actions.push({kind:'post',target:normalize(m[1])==='hier'?context.currentChannel:resolve(m[1],context.channels,'Kanal'),text:clean(m[2])});
      } else return answer('Diesen Wunsch kann ich offline nicht eindeutig planen. Beispiele: „Erstelle eine Rolle Helfer; gib mir die Rolle Helfer“, „Erstelle einen Textkanal clips“ oder „Setze Slowmode in #chat auf 5 Sekunden“. Es wurde nichts geändert.');
      if(actions.length>12)throw Error('Mehr als zwölf Aktionen.');
    }
    return {summary:'🧩 Offline geplant: '+clean(original).slice(0,500),actions};
  } catch(error){return answer(error.message+' Bitte formuliere den Wunsch genauer. Es wurde nichts geändert.');}
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
    const knowledge=system.match(/Server-spezifisches Wissen[^\n]*:\n([\s\S]*?)(?=\n\nAdmin-Verbesserungen|\nANTWORTQUALITÄT|$)/)?.[1] || '';
    output=chat(last.split('\n\nWichtig:')[0],{knowledge,history:request.contents || []});
  }
  return {text:output,offline:true};
}
module.exports={normalize,arithmetic,chat,newPlan,setupPlan,pulse,request};
