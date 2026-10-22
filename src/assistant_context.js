'use strict';
// Shared, bounded text analysis. Conversation data never grants command permissions.
const norm=value=>String(value??'').slice(0,24000).normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').toLowerCase().replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();
function messageText(m){return String((Array.isArray(m?.parts)?m.parts.filter(p=>typeof p?.text==='string').map(p=>p.text).join('\n'):'')||m?.text||'').slice(0,6000);}
const FAILED=/^(?:(?:nein|nee|ne)[,.! ]*)?(?:geht(?: immer noch)? (?:nicht|nd|ned|nich)|(?:das |es )?(?:funktioniert|klappt)(?: immer noch)? (?:nicht|nd|ned)|nope|hat (?:nix|nichts) gebracht|immer noch(?: (?:gleich|kaputt|nicht|nd))?|andere losung|same)[!?.\s]*$/;
function failed(value){return FAILED.test(norm(value));}
function correction(value){return /^(?:nein|nee|ne)[,.! ]+\S|^(?:ich meine|ich mein|ich meinte|gemeint ist|korrektur:|stattdessen|sondern)\b/.test(norm(value));}
function isFollowup(value){
  const n=norm(value);
  return failed(n)||correction(n)||/^(?:ha|hae|hm|hmm|ok|okay|ne|nein|ja|warum|wieso|weiter|nochmal|genauer|wie(?: genau)?|was jetzt|und (?:jetzt|dann)|was meinst du|kurzer|kurz|ausfuhrlicher|mehr details|mach weiter|erklare(?: es)?(?: genauer)?|noch (?:nicht|nd)|(?:gebe|gib|schick)(?:e)?(?: mir)? (?:den |die )?links?(?: bitte| pls)?|links?(?: bitte| pls)?|was kostet (?:das|es)|wie teuer ist (?:das|es))[!?.,\s]*$/.test(n)
    ||/^und (?:wie|wann|wo|wer|was|das|dann|jetzt)\b/.test(n)
    ||/^(?:ich habe|ich hab|habe|hab|schon|bereits)\b.{0,500}\b(?:versucht|probiert|getestet|gemacht|neu gestartet|installiert|gepruft)\b/.test(n)
    ||/^(?:mach(?:e)? (?:es |das )?(?:kurzer|langer)|(?:die|der|das|es|dort|da)(?:[?!.]|$)|davon\s+\d|kein(?:en)? (?:ton|sound)\b|error\b|fehler:|exception\b|traceback\b|cannot find module\b|missing permissions\b|redirect_uri\b|sign in to confirm\b|http [45]\d\d\b)/.test(n);
}
function domain(value){
  const n=norm(value);
  if(/\bmimi[ck]|spiel.?leiter/.test(n))return 'mimic';
  if(/spotify|redirect_uri|redirect uri/.test(n))return 'spotify';
  if(/\/music\b|yt-dlp|ffmpeg|\bmusik\b|(?:youtube|\byt\b).*(?:\bvc\b|voice|ton|audio)|(?:\bvc\b|voice).*(?:youtube|\byt\b|song)/.test(n))return 'music';
  if(/cannot find module|module_not_found|railway|restart|neustart|deploy|bot.*(?:offline|startet nicht)|invalid.*token|tokeninvalid|disallowed intents/.test(n))return 'railway';
  if(/youtube|\byt\b|uploads?|shorts|\b404\b/.test(n))return 'youtube';
  if(/missing (?:access|permissions)|50013|50001|berechtigung|zugriff verweigert/.test(n))return 'permissions';
  if(/anti.?spam|security|sicherheit|automod/.test(n))return 'security';
  if(/counting|zahlkanal|zahlenkanal/.test(n))return 'counting';
  if(/\blearn\b|serverwissen|wissen (?:lernen|speichern)/.test(n))return 'learn';
  if(/setup|kanal|\brollen?\b|\bnew\b/.test(n))return 'setup';
  if(/\b(ai|ki|offline)\b/.test(n))return 'ai';
  return null;
}
function conversation(question,history=[]){
  const q=String(question??'').slice(0,6000),rows=(Array.isArray(history)?history:[]).slice(-24).filter(m=>m&&['user','model','assistant'].includes(m.role));
  if(rows.at(-1)?.role==='user'&&norm(messageText(rows.at(-1)))===norm(q))rows.pop();
  const users=rows.filter(m=>m.role==='user').map(messageText);let anchorIndex=-1;
  for(let i=rows.length-1;i>=0;i--)if(rows[i].role==='user'&&!isFollowup(messageText(rows[i]))){anchorIndex=i;break;}
  if(anchorIndex<0)for(let i=rows.length-1;i>=0;i--)if(rows[i].role==='user'){anchorIndex=i;break;}
  const anchor=anchorIndex>=0?messageText(rows[anchorIndex]):'',anchorDomain=domain(anchor);
  const specificDomain=value=>{
    const d=domain(value),n=norm(value);
    if(anchorDomain&&d==='setup'&&anchorDomain!=='setup'&&!/setup|\brollen?\b|\bnew\b|(?:erstelle|benenn|umbenenn|verschieb|losch|mach).*kanal|kanal.*(?:erstell|benenn|verschieb|losch|einricht)/.test(n))return null;
    if(anchorDomain&&d==='youtube'&&!/youtube|\byt\b|upload|shorts/.test(n))return null;
    return d;
  };
  const currentDomain=specificDomain(q);
  let followup=isFollowup(q);
  // A concrete subject named in a follow-up can deliberately change the subject.
  if(followup&&currentDomain&&anchorDomain&&currentDomain!==anchorDomain&&!correction(q))followup=false;
  const activeRows=followup&&anchorIndex>=0?rows.slice(anchorIndex):[],activeUsers=activeRows.filter(m=>m.role==='user').map(messageText);
  const subject=followup?anchor||q:q;
  const latestCorrection=[...activeUsers,q].filter(correction).at(-1)||'';
  const correctionDomain=specificDomain(latestCorrection),changedSubject=Boolean(latestCorrection&&correctionDomain&&anchorDomain&&correctionDomain!==anchorDomain);
  const focus=changedSubject?[...new Set([latestCorrection,q])].join('\n'):followup?[...new Set([subject,...activeUsers.slice(-3),q])].join('\n').slice(0,10000):q;
  return {rows,users,activeUsers,followup,subject,focus,
    previous:messageText([...rows].reverse().find(m=>m.role==='model'||m.role==='assistant')),
    attempts:followup?[...activeUsers,q].filter(failed).length:0,
    domain:correctionDomain||currentDomain||domain(subject),
    corrections:[...activeUsers,q].filter(correction).slice(-4),
    constraints:[...activeUsers,q].filter(t=>/\b(?:ohne|nur|behalte|behalten|nicht loschen|nichts loschen|zerstore|zerstor|nd loschen|kein|keine|keinen|statt|sondern|don't|without|keep)\b/.test(norm(t))).slice(-5)};
}
const STOP=new Set('der die das den dem des ein eine einen einer einem und oder aber ist sind war waren ich du er sie es wir ihr man mein meine dein deine mit ohne fur von auf im in am an zu zum zur so wie was wer wo wann warum bitte pls bro hab habe hat haben geht nicht schon noch auch nur jetzt mal kann konnen will mochte denn doch mir mich sich unser unsere dieses diese welche welcher wird werden wurde the a an and or is are my your it to of for can please this that'.split(' '));
const FAMILIES=[['youtube','yt','uploads','upload','shorts'],['discord','dc'],['event','events','veranstaltung','veranstaltungen','turnier'],['start','startet','starten','beginn','beginnt','anfang','uhrzeit'],['regel','regeln','rules','erlaubt','verboten'],['bewerbung','bewerben','staff','moderator','mod'],['sicherheit','security','antispam','spam','automod'],['rolle','rollen','role','roles'],['kanal','kanale','channel','channels'],['support','ticket','tickets','hilfe'],['mimic','mimik'],['counting','zahlen','zahlkanal'],['musik','music','song','songs'],['preis','kosten','kostet']];
const groups=new Map(FAMILIES.flatMap((items,i)=>items.map(word=>[word,i])));
function words(value){return [...new Set((norm(value).match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>1&&w.length<=64&&!STOP.has(w)))].slice(0,120);}
function near(a,b){
  if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length){const d=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])d.push(i);if(d.length===2&&d[1]===d[0]+1&&a[d[0]]===b[d[1]]&&a[d[1]]===b[d[0]])return true;}
  let i=0,j=0,count=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++count>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return count+(i<a.length||j<b.length?1:0)<=1;
}
const affinity=(a,b)=>a===b?3:groups.has(a)&&groups.get(a)===groups.get(b)?2:near(a,b)?1:0;
function relevance(query,body,title=''){
  const terms=words(query).slice(0,40),b=words(body),t=words(title);
  return terms.reduce((sum,w)=>sum+Math.max(0,...b.map(x=>affinity(w,x)))+Math.max(0,...t.map(x=>affinity(w,x)*2)),0);
}
module.exports={norm,messageText,failed,correction,isFollowup,domain,conversation,words,affinity,relevance};
