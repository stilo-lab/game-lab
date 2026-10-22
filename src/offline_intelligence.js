'use strict';
const assistantContext=require('./assistant_context');
const localReasoning=require('./offline_reasoning');

// Local text tools only. Never load models, evaluate code, fetch URLs or change a server.
const normalize=value=>String(value ?? '').slice(0,24000).normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').toLowerCase().replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
const safe=value=>String(value ?? '').slice(0,6000).replace(/@everyone|@here/gi,'[Gruppen-Ping]').replace(/<@(?:!|&)?\d+>/g,'[Erwähnung]')
  .replace(/((?:bot[ _-]?token|api[ _-]?key|password|passwort|secret)\s*[:=]\s*)\S+/gi,'$1[geschwärzt]');
const STOP=new Set('der die das den dem des ein eine einen einer einem und oder aber ist sind war waren ich du er sie es wir ihr man mein meine dein deine mit ohne fur von auf im in am an zu zum zur so wie was wer wo wann warum bitte pls bro hab habe hat haben geht nicht schon noch auch nur jetzt mal kann konnen will mochte denn doch mir mich sich unser unsere dieses diese welche welcher wird werden wurde bitte'.split(' '));
const FAMILIES=[['youtube','yt','uploads','upload','shorts'],['discord','dc'],['event','events','veranstaltung','veranstaltungen','turnier'],['start','startet','starten','beginn','beginnt','anfang','uhrzeit'],['regel','regeln','rules','erlaubt','verboten'],['bewerbung','bewerben','staff','moderator','mod'],['sicherheit','security','antispam','spam','automod'],['rolle','rollen','role','roles'],['kanal','kanale','channel','channels'],['support','ticket','tickets','hilfe'],['mimic','mimik'],['counting','zahlen','zahlkanal']];
const groups=new Map(FAMILIES.flatMap((items,i)=>items.map(word=>[word,i])));
function words(value){return [...new Set((normalize(value).match(/[\p{L}\p{N}]+/gu)||[]).map(w=>({nd:'nicht',ned:'nicht',nich:'nicht',ki:'ai'}[w]||w)).filter(w=>w.length>1&&w.length<=64&&!STOP.has(w)))].slice(0,120);}
function near(a,b){
  if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length){const diff=[];for(let k=0;k<a.length;k++)if(a[k]!==b[k])diff.push(k);if(diff.length===2&&diff[1]===diff[0]+1&&a[diff[0]]===b[diff[1]]&&a[diff[1]]===b[diff[0]])return true;}
  let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
  return edits+(i<a.length||j<b.length?1:0)<=1;
}
function affinity(a,b){return a===b?3:groups.has(a)&&groups.get(a)===groups.get(b)?2:near(a,b)?1:0;}
function searchKnowledge(knowledge,query){
  const terms=words(query).slice(0,40);if(!terms.length)return [];
  const text=String(knowledge??'').slice(0,24000),lines=text.split(/\n+/).filter(s=>s.trim());
  const rows=[];let current='';
  for(const line of lines){
    if(/^\s*\[[^\]\n]+\]/.test(line)||!current){if(current)rows.push(current);current=line;}
    else if(/^\s*\[[^\]\n]+\]/.test(current))current+='\n'+line;
    else {rows.push(current);current=line;}
  }
  if(current)rows.push(current);
  const ranked=rows.slice(0,120).map((raw,index)=>{
    const text=raw.replace(/^\s*(?:\[[^\]\n]{1,100}\]\s*){1,6}/,'').trim(),body=words(text);
    const score=assistantContext.relevance(query,text);
    return {text:safe(text).slice(0,1500),score,index};
  }).filter(r=>r.text&&r.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
  const unique=new Set();return ranked.filter(r=>{const n=normalize(r.text);if(unique.has(n))return false;unique.add(n);return true;}).slice(0,3).map(r=>r.text);
}
function messageText(m){return String((Array.isArray(m?.parts)?m.parts.filter(p=>typeof p?.text==='string').map(p=>p.text).join('\n'):'')||m?.text||'').slice(0,6000);}
const FAILED=/^(?:nein[,.! ]*)?(?:geht(?: immer noch)? (?:nicht|nd|nich)|funktioniert(?: immer noch)? nicht|klappt(?: immer noch)? nicht|nope|hat (?:nix|nichts) gebracht|immer noch (?:gleich|kaputt|nicht)|andere losung)[!?.\s]*$/;
const FOLLOW=/^(?:und (?:jetzt|dann)|weiter|warum|wieso|wie(?: genau)?|was jetzt|nochmal|genauer|erklare(?: es)?(?: genauer)?|erklär(?: es)?(?: genauer)?|kurzer|kurz|ausfuhrlicher|mehr details|mach weiter|was meinst du)[!?.\s]*$/;
function isFollowup(q){return assistantContext.isFollowup(q);}
function topic(q){
  const known=assistantContext.domain(q);if(known)return known;
  const n=normalize(q);
  if(/cannot find module|module_not_found|railway|restart|neustart|deploy|bot.*(?:offline|startet nicht)|invalid.*token|tokeninvalid|disallowed intents/.test(n))return 'railway';
  if(/youtube|\byt\b|uploads?|404|shorts/.test(n))return 'youtube';
  if(/missing (?:access|permissions)|50013|50001|berechtigung|zugriff verweigert/.test(n))return 'permissions';
  if(/anti.?spam|security|sicherheit|automod/.test(n))return 'security';
  if(/counting|zahlkanal|zahlenkanal/.test(n))return 'counting';
  if(/mimi[ck]|spiel.?leiter/.test(n))return 'mimic';
  if(/\blearn\b|serverwissen|wissen (?:lernen|speichern)/.test(n))return 'learn';
  if(/setup|kanal|\brollen?\b|\bnew\b/.test(n))return 'setup';
  if(/\b(ai|ki|offline)\b/.test(n))return 'ai';
  return null;
}
function dialogue(question,history){
  return assistantContext.conversation(question,history);
}
function number(value){const n=String(value).replace(/,/g,'.');return /^[-+]?\d+(?:\.\d+)?$/.test(n)?Number(n):NaN;}
const fmt=value=>Number.isFinite(value)?Number(value.toPrecision(12)).toLocaleString('de-DE',{useGrouping:false,maximumSignificantDigits:12}):'Grenze des Offline-Rechners überschritten';
function arithmetic(question){
  const q=normalize(question).replace(/[?!]+$/,'').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
  const amount='([-+]?\\d+(?:[.,]\\d+)?)';let m;
  if((m=q.match(new RegExp('^(?:wie viel |wieviel )?(?:prozent|%) (?:sind|ist) '+amount+' (?:von|vom) '+amount+'$')))){
    const a=number(m[1]),b=number(m[2]);return b===0?'Prozentvergleich mit einem Grundwert von 0 ist nicht definiert.':`${m[1]} von ${m[2]} = ${fmt(a/b*100)} %`;
  }
  if((m=q.match(new RegExp('^(?:(?:berechne|rechne|was (?:ist|sind)|wie viel (?:ist|sind))\\s+)?'+amount+'\\s*(?:%|prozent)\\s*(?:von|vom)\\s*'+amount+'$'))))return `${m[1]} % von ${m[2]} = ${fmt(number(m[1])*number(m[2])/100)}`;
  if((m=q.match(new RegExp('^(?:(?:erhohe|senke|reduziere)\\s+)?'+amount+'\\s*(?:um|[+\\-])\\s*'+amount+'\\s*(?:%|prozent)(?:\\s*(erhohen|erhoht|senken|senken|reduzieren|reduziert|rabatt))?$')))){
    const decrease=/^(?:senke|reduziere)/.test(q)||/\d\s*-\s*\d/.test(q)||/senken|reduzier|rabatt/.test(q);
    if(!decrease&&!/erhoh|\+/.test(q))return null;
    return `${m[1]} ${decrease?'−':'+'} ${m[2]} % = ${fmt(number(m[1])*(1+(decrease?-1:1)*number(m[2])/100))}`;
  }
  let expression=q.replace(/^(?:(?:bitte )?(?:berechne|rechne)(?: mir)?|was (?:ist|sind)|wie ?viel (?:ist|sind))\s*:?\s*/,'')
    .replace(/^teile\s+(.+)\s+durch\s+(.+)$/,'$1 / $2').replace(/\bwurzel aus\s+([-+]?\d+(?:[.,]\d+)?)/g,'sqrt($1)')
    .replace(/\bquadratwurzel\s+([-+]?\d+(?:[.,]\d+)?)/g,'sqrt($1)').replace(/\bplus\b/g,'+').replace(/\bminus\b/g,'-').replace(/\bmal\b/g,'*').replace(/\bgeteilt durch\b|\bdurch\b/g,'/').replace(/\bhoch\b/g,'^')
    .replace(/,/g,'.').replace(/\s/g,'');
  if(expression.length>300||!/[+*/^%-]|sqrt\(/.test(expression))return null;
  const tokens=expression.match(/sqrt|\d+(?:\.\d+)?|[()+*/^%-]/g)||[];
  if(tokens.join('')!==expression||tokens.length>200)return null;
  let pos=0,operations=0;
  const check=n=>{if(++operations>120||!Number.isFinite(n))throw Error('Grenze');return n;};
  function primary(){const t=tokens[pos++];let value;if(t==='('){value=sum();if(tokens[pos++]!==')')throw Error('Klammer');}
    else if(t==='sqrt'){if(tokens[pos++]!=='(')throw Error('Klammer');value=sum();if(tokens[pos++]!==')'||value<0)throw Error('Wurzel');value=check(Math.sqrt(value));}
    else {if(!/^\d+(?:\.\d+)?$/.test(t||''))throw Error('Zahl');value=Number(t);}
    while(tokens[pos]==='%'){pos++;value=check(value/100);}return value;}
  function unary(){if(tokens[pos]==='+'||tokens[pos]==='-'){const op=tokens[pos++],v=unary();return op==='-'?-v:v;}return power();}
  function power(){let v=primary();if(tokens[pos]==='^'){pos++;const e=unary();if(Math.abs(e)>100)throw Error('Exponent');v=check(v**e);}return v;}
  function product(){let v=unary();while(['*','/'].includes(tokens[pos])){const op=tokens[pos++],r=unary();if(op==='/'&&r===0)throw Error('Null');v=check(op==='*'?v*r:v/r);}return v;}
  function sum(){let v=product();while(['+','-'].includes(tokens[pos])){const op=tokens[pos++],r=product();v=check(op==='+'?v+r:v-r);}return v;}
  try{const value=sum();if(pos!==tokens.length||!Number.isFinite(value))throw Error('Rest');return `${expression} = ${Number(value.toPrecision(12))}`;}
  catch{return 'Diese Rechnung ist ungültig oder überschreitet die Grenzen des Offline-Rechners.';}
}
const UNITS={};
function unit(names,dimension,factor,label){for(const name of names.split('|'))UNITS[name]={dimension,factor,label};}
unit('mm|millimeter','length',.001,'mm');unit('cm|zentimeter','length',.01,'cm');unit('m|meter','length',1,'m');unit('km|kilometer','length',1000,'km');
unit('mg|milligramm','mass',.001,'mg');unit('g|gramm','mass',1,'g');unit('kg|kilogramm|kilo','mass',1000,'kg');unit('t|tonne|tonnen','mass',1e6,'t');
unit('ms|millisekunde|millisekunden','time',.001,'ms');unit('s|sek|sekunde|sekunden','time',1,'Sekunden');unit('min|minute|minuten','time',60,'Minuten');unit('h|stunde|stunden','time',3600,'Stunden');unit('d|tag|tage|tagen','time',86400,'Tage');
unit('ml|milliliter','volume',.001,'ml');unit('l|liter','volume',1,'l');
unit('b|byte|bytes','data',1,'Byte');unit('kb','data',1000,'KB');unit('mb','data',1e6,'MB');unit('gb','data',1e9,'GB');unit('kib','data',1024,'KiB');unit('mib','data',1024**2,'MiB');unit('gib','data',1024**3,'GiB');
function convert(question){
  const q=normalize(question).replace(/[?!]+$/,'').replace(/^(?:rechne|wandle)(?: mir)?\s+/,'').replace(/^(?:wie viel(?:e)? (?:ist|sind)|was sind)\s+/,'').replace(/\s+(?:um|bitte)$/,'');
  const m=q.match(/^([-+]?\d+(?:[.,]\d+)?)\s*([\p{L}°]+)\s+(?:in|zu|nach|=)\s*([\p{L}°]+)$/u);if(!m)return null;
  const value=number(m[1]),a=UNITS[m[2]],b=UNITS[m[3]];
  if(a&&b){if(a.dimension!==b.dimension)return 'Diese Einheiten messen unterschiedliche Größen und lassen sich so nicht umrechnen.';return `${m[1]} ${a.label} = ${fmt(value*a.factor/b.factor)} ${b.label}`;}
  const temperatures={'c':'c','°c':'c','celsius':'c','f':'f','°f':'f','fahrenheit':'f','k':'k','kelvin':'k'},from=temperatures[m[2]],to=temperatures[m[3]];
  if(from&&to){const c=from==='c'?value:from==='k'?value-273.15:(value-32)*5/9;if(c< -273.15-1e-9)return 'Eine Temperatur unter dem absoluten Nullpunkt ist nicht möglich.';const result=to==='c'?c:to==='k'?c+273.15:c*9/5+32;return `${m[1]} ${from==='k'?'K':'°'+from.toUpperCase()} = ${fmt(result)} ${to==='k'?'K':'°'+to.toUpperCase()}`;}
  return null;
}
function summarize(text,max=3){
  const source=safe(text).replace(/\n*🧩[^\n]*$/,'').slice(0,6000);
  const sentences=(source.match(/[^.!?\n]+(?:[.!?]+|$)/g)||[]).map(s=>s.trim()).filter(s=>s.length>8).slice(0,100);
  if(!sentences.length)return null;
  const frequency=new Map();for(const s of sentences)for(const w of words(s))frequency.set(w,(frequency.get(w)||0)+1);
  const selected=sentences.map((text,index)=>({text,index,score:words(text).reduce((n,w)=>n+(frequency.get(w)||0),0)/Math.sqrt(text.length)})).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,max).sort((a,b)=>a.index-b.index);
  return selected.map(s=>'• '+s.text.slice(0,400)).join('\n');
}
const GUIDE={
  music:[
    'Für YouTube-Ton direkt im Discord-VC: Geh in einen Sprachkanal und nutze `/music play` mit `titel` als Link oder Suchbegriff. `/music queue` zeigt die Reihenfolge; `/music diagnose` prüft YouTube-Abrufdienst und FFmpeg. Pixel braucht Kanal anzeigen, Verbinden und Sprechen. Hörst du keinen Ton, oder tritt Pixel dem VC gar nicht bei?',
    'Prüfe `/music diagnose`: Fehlt der YouTube-Abrufdienst, führe auf dem Bot-Host `npm run music:setup` aus. Fehlt FFmpeg, prüfe die Installation von ffmpeg-static. Sind beide bereit, prüfe die VC-Rechte und ob Pixel serverseitig stummgeschaltet ist. Was zeigt die Diagnose genau?',
    'Wenn die Werkzeuge bereit sind und YouTube den Abruf verweigert, teste einen anderen öffentlichen Titel und gib dem Team die genaue Musik-Fehlermeldung. Ein Spotify-Login ändert diesen YouTube-Abruf nicht. Die Warteschlange kannst du mit `/music stop` beenden; vorhandene Botdaten müssen dafür nicht gelöscht werden.'
  ],
  spotify:[
    'Spotify Connect steuert die Wiedergabe auf einem Spotify-Gerät. Für Musik direkt im Discord-VC nutze `/music play`. Für Spotify-Verbindung und Geräte gibt es `/spotify diagnose`, `/spotify connect` und `/spotify devices`. Geht es um den Login oder darum, wo der Ton abgespielt wird?',
    'Bei „redirect_uri“ muss die unter `/spotify connect` angezeigte Redirect URI exakt in den Spotify-App-Einstellungen eingetragen und gespeichert sein. Nutze anschließend einen neuen Connect-Link. Bei einem Geräteproblem prüfe stattdessen `/spotify devices`. Welche Meldung erscheint?',
    'Gib dem Team die Ausgabe von `/spotify diagnose` und die Fehlermeldung mit geschwärzten Zugangsdaten. Für gemeinsamen Ton im Discord-VC ist `/music play` der passende Player.'
  ],
  railway:[
    'Öffne den letzten Railway-Deploy und lies die erste Fehlermeldung. Bei „Cannot find module“ prüfe den genannten Dateipfad: Die Update-Dateien gehören direkt in den vorhandenen src-Ordner. Welche genaue Meldung steht dort?',
    'Prüfe im fehlgeschlagenen Deploy, welcher Commit gestartet wurde und ob die genannte Datei in genau diesem Commit liegt. Bei „src/src/…“ liegt sie eine Ebene zu tief. Kopiere nur den Fehlerausschnitt mit geschwärzten Zugangsdaten.',
    'Vergleiche den Importpfad im Fehler mit dem echten Dateinamen einschließlich Groß-/Kleinschreibung. Wenn der Pfad stimmt, brauche ich die erste Fehlermeldung samt genanntem Dateinamen; ein weiterer Neustart liefert dafür keine neue Information.'
  ],
  youtube:[
    'Verwende für das Abo einen YouTube-Kanal-Link oder @Handle. Prüfe, ob der gespeicherte Kanal der gewünschte ist. Welcher Fehler erscheint beim Eintragen oder bei einem späteren Upload?',
    'Prüfe jetzt die gespeicherte Kanal-ID statt erneut denselben Link einzutragen. Ein 404 kann vom Kanal oder vom Feed kommen. Nenne den betroffenen Kanal und die genaue Fehlermeldung; ohne Webzugriff kann ich seine Erreichbarkeit nicht selbst prüfen.',
    'Gib dem Team den Kanal-Link, die gespeicherte Kanal-ID, den Fehler und den Zeitpunkt des Tests. Damit kann es Feed und optionalen API-Zugriff gezielt prüfen. Teile dafür keine API-Schlüssel.'
  ],
  permissions:[
    'Prüfe die Bot-Rechte im betroffenen Kanal und dessen Kategorie. Verweigerte Kanalrechte können Serverrechte einschränken. Bei Rollenänderungen muss die Bot-Rolle außerdem über der Zielrolle stehen. Welche Aktion wird abgelehnt?',
    'Prüfe die effektiven Rechte für Pixel im konkreten Zielkanal und die Reihenfolge der Rollen. Nenne den Fehlercode und die abgelehnte Aktion; ich kann die aktuellen Discord-Rechte hier nicht selbst sehen.',
    'Lass die Serververwaltung die Kanalüberschreibungen und die Bot-Rollenhöhe gemeinsam prüfen. Übernimm nur die für die betroffene Aktion benötigten Rechte. Notiere Fehlercode, Kanal und Aktion für das Team.'
  ],
  counting:[
    'Prüfe mit `/counting` die Zuordnung zum Zählkanal und vergleiche den gespeicherten Stand mit der letzten akzeptierten Zahl. Schreibe nur eine Zahl pro Nachricht. Bei welcher Zahl und nach welchem Ereignis stoppt es?',
    'Prüfe, ob die nächste Zahl vom selben Mitglied kommt und ob Pixel im Zählkanal Nachrichten lesen und senden kann. Nenne gespeicherten Stand, nächste gesendete Zahl und sichtbare Reaktion.',
    'Halte den aktuellen Zählerstand fest und gib dem Team den Zeitpunkt sowie die letzten akzeptierten Zahlen. So lässt sich ein Fehler nach Neustart von einer abgelehnten Eingabe unterscheiden, ohne den Stand zurückzusetzen.'
  ],
  mimic:[
    'Für Mimic muss Pixel im gewünschten Sprachkanal sein und „Verbinden“ sowie „Sprechen“ dürfen. Prüfe außerdem, ob die vorhandenen Mimic-Audiodateien im assets-Ordner liegen. Fehlt der Ton ganz oder nur die Spielleiter-Stimme?',
    'Prüfe als Nächstes, ob der Bot serverseitig stummgeschaltet ist und ob im Deploy ein Audio- oder Dateifehler erscheint. Nenne die Kategorie und ob andere Sounds noch funktionieren.',
    'Gib dem Team die Kategorie, den betroffenen Sound und den ersten Audiofehler aus dem Deploy. Ich kann offline keine fehlenden Originalstimmen beschaffen oder Audiodateien anhören.'
  ],
  security:['🛡️ `/security status` zeigt den Schutz. Als Serververwaltung kannst du mit `/security config` die Schwellen einstellen. Den globalen AutoMod-Schalter findest du in `/settings`.',
    'Prüfe zuerst `/security status` und den AutoMod-Schalter in `/settings`. Owner und Administratoren sind von automatischen Spam-Strafen ausgenommen. Nenne, welcher Schutz fehlt und ob der Bot die nötigen Moderationsrechte hat.'],
  setup:['Nutze `/serversetup` für eine Design-Vorschau oder `/new` für einzelne Wünsche. Offline-Beispiel: „Mach einen Kanal clips und erstelle eine Rolle Helfer in Blau“. Bestehende Aktionsrechte und Bestätigungen gelten weiterhin.'],
  learn:['Die Serververwaltung kann mit `/learn` Fakten und Abläufe hinterlegen. Frag danach konkret nach dem Thema; die Offline-Hilfe sucht passende Einträge, auch mit einigen Synonymen und Tippfehlern. Normale Chatnachrichten ändern dieses Serverwissen nicht.'],
  ai:['🧩 Die lokale Hilfe versteht Bot-Fragen, gespeichertes `/learn`-Wissen, Folgefragen, Rechnungen, Prozente, Einheiten und Textauszüge. Beispiele: „15 % von 240“, „2 Stunden in Minuten“, „Fasse zusammen: …“. Freie Wissensfragen und aktuelle Recherchen brauchen ein Sprachmodell beziehungsweise Webzugriff.']
};
function chat(question,{knowledge='',faq=null,history=[],support=false}={}){
  const q=safe(question).trim(),n=normalize(q),d=dialogue(q,history),focus=d.focus,t=d.domain||topic(d.subject||q),smart=localReasoning.solve(q,history,{arithmetic}),math=arithmetic(q),conversion=convert(q);
  if(smart&&smart.kind!=='unsupported')return smart.text+'\n\n🧩 Offline berechnet; bei Folgefragen aus deinen Eingaben neu berechnet.';
  if(math||conversion)return (math||conversion)+'\n\n🧩 Offline berechnet.';
  if(/(?:was (?:steht|siehst|ist)|prufe|analysiere).*(?:bild|screenshot|anhang|foto)/.test(n))return '🧩 Offline kann ich Bilder nicht auswerten. Schreib bitte den sichtbaren Text oder die genaue Fehlermeldung hier hinein.';
  if(/^(?:hi|hey|yo|hallo|moin|servus)[!?.,\s]*$/.test(n))return 'yo 🙂 Was brauchst du? Ich bin im Offline-Modus.';
  if(/^(?:danke|thx|passt|gelost|geht wieder|hat geklappt)[!?.,\s]*$/.test(n))return 'passt, freut mich 🙂';
  if(/(?:was habe ich (?:zuletzt )?(?:gesagt|geschrieben|gefragt)|was war meine letzte frage)/.test(n))return d.users.length?'Zuletzt hast du geschrieben:\n'+d.users.slice(-3).map(s=>'• '+safe(s).slice(0,450)).join('\n')+'\n\n🧩 Nur aus diesem Gespräch.':'In diesem Gespräch ist noch keine frühere Nachricht verfügbar.';
  const text=q.match(/^(?:fasse(?: mir)?(?: (?:diesen|den) text)? zusammen|zusammenfassen|kurzfassung|zusammenfassung|mach(?:e)? (?:mir )?stichpunkte)\s*:\s*([\s\S]+)$/i)?.[1];
  if(text){const result=summarize(text);return result?'📄 Textauszug:\n'+result+'\n\n🧩 Offline gekürzt; nur Aussagen aus deinem Text.':'Bitte gib nach dem Doppelpunkt den Text an, den ich kürzen soll.';}
  if(/^(?:kurzer|kurz|mach(?:e)? (?:es |das )?kurzer)[.!?\s]*$/.test(n)&&d.previous){const result=summarize(d.previous,2);if(result)return 'Kurzfassung der vorigen Antwort:\n'+result+'\n\n🧩 Offline gekürzt.';}
  if(d.attempts&&t&&GUIDE[t])return GUIDE[t][Math.min(d.attempts,GUIDE[t].length-1)]+'\n\n🧩 Nächster lokaler Prüfschritt.';
  if(d.attempts)return (d.attempts>1?'Für eine gezielte Prüfung braucht das Team die genaue Fehlermeldung, dein Ziel und die bereits gescheiterten Schritte.':'Welche genaue Fehlermeldung oder Reaktion kam beim letzten Schritt?')+(d.subject?'\nBezug: „'+safe(d.subject).slice(0,200)+'“.':'')+'\n\n🧩 Offline-Modus';
  const local=searchKnowledge(knowledge,focus);
  const conflict=localReasoning.knownConflict(local,focus);if(conflict)return conflict+'\n\n🧩 Nur aus dem gespeicherten Serverwissen.';
  if(faq?.answer)return '📚 Lokale Hilfe:\n'+safe(faq.answer)+'\n\n🧩 Offline-Modus';
  if(local.length)return '📚 Passendes Serverwissen:\n'+local.map(s=>'• '+s).join('\n')+'\n\n🧩 Offline-Modus: aus hinterlegten Angaben. Mehrere Angaben sind keine automatische Aktualitätsprüfung.';
  if(t==='spotify'&&/redirect_uri|redirect uri/.test(n))return GUIDE.spotify[1]+'\n\n🧩 Offline-Hilfe';
  if(t==='music'&&/sign in|confirm.*bot|\b403\b|\b429\b|verweigert|blockiert/.test(n))return GUIDE.music[2]+'\n\n🧩 Offline-Hilfe';
  if(t==='youtube'&&/^(?:youtube|yt)(?: geht (?:nicht|nd))?[!?.,\s]*$/.test(n))return 'Meinst du YouTube-Upload-Meldungen mit `/youtube` und `/uploads` oder Musik im Sprachkanal mit `/music play`?\n\n🧩 Offline-Hilfe';
  if(t&&GUIDE[t])return GUIDE[t][0]+'\n\n🧩 Offline-Hilfe';
  if(smart)return smart.text+'\n\n🧩 Offline-Modus';
  if(d.followup&&d.subject)return 'Ich beziehe mich auf: „'+safe(d.subject).slice(0,200)+'“.\n'+(d.attempts?'Welche genaue Fehlermeldung oder Reaktion kam beim letzten Schritt?':'Welchen Punkt davon soll ich erklären?')+'\n\n🧩 Offline-Modus';
  return support?'🧩 Offline-Support: Nenne bitte die genaue Fehlermeldung und den letzten Versuch. Ich nutze passendes Serverwissen und FAQ; unbekannte Fälle kann das Team über „Get Human Support“ prüfen.':'🧩 Offline-Modus: Ich helfe mit Bot-Fragen, /learn-Wissen, Rechnungen, Prozenten, Einheiten und Textauszügen. Schreib z. B. „15 % von 240“ oder „2 Stunden in Minuten“. Für diese freie Frage habe ich lokal keine passende Antwort; beschreibe bitte das konkrete Ziel.';
}

module.exports={normalize,safe,words,searchKnowledge,messageText,isFollowup,dialogue,arithmetic,convert,summarize,chat};
