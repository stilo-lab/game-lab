'use strict';
const ref=require('./game_reference'),{clean}=require('./game_knowledge');
const action=q=>/\b(?:role|roles|rolle|rollen|channel|kanal|kanale|dm|giveaway|ticket|member|mitglied)\b/.test(ref.fold(q))&&/\b(?:create|make|give|gib|erstelle|mache|delete|losche|send|sende|ban|kick|timeout)\b/.test(ref.fold(q));
function sourceLine(c,de){return `${de?'Community-Daten, Stand':'Community data, reviewed'} ${c.reviewDate||'unknown'}${Date.now()-Date.parse(c.reviewDate)>30*86400000?(de?' · ARCHIVSTAND':' · ARCHIVE'):''} · ${de?'Abruf':'fetched'} ${new Date(c.fetchedAt).toISOString().slice(0,10)}${c.refreshError?(de?' · Aktualisierung fehlgeschlagen':' · refresh failed'):c.bundled?(de?' · mitgeliefert':' · bundled'):''}\n<${c.source}>`;}
function detail(key,row,c,language='en'){
  const de=language==='de',money=n=>n===null||n===undefined?(de?'unbekannt':'unknown'):'$'+Number(n).toLocaleString('en-US');
  const lines=[`**${ref.games[key].name} · ${clean(row.name)}**`,`${de?'Gemeldete Seltenheit':'Reported rarity'}: ${clean(row.rarity)}`,`${de?'Gruppe':'Group'}: ${clean(row.group)}`,`${de?'Gemeldetes Basis-Einkommen':'Reported base income'}: ${money(row.income)}${row.income!==null&&row.income!==undefined?'/s':''}`];
  if(row.cost!==undefined)lines.push(`${de?'Gemeldete Kaufkosten':'Reported purchase cost'}: ${money(row.cost)}`);
  if(row.egg)lines.push(`${de?'Gemeldete Ei-Quelle':'Reported egg source'}: ${clean(row.egg)}`);
  if(row.obtain)lines.push(`${de?'Historisch erhältlich über':'Historically obtained from'}: ${clean(row.obtain)}`);
  if(row.aliases?.length)lines.push(`Aliases: ${row.aliases.map(clean).join(', ')}`);
  if(row.disputed)lines.push(de?'⚠️ Quellenangaben sind widersprüchlich; nicht für eine genaue Rechnung verwenden.':'⚠️ Source records conflict; do not use this as a precise calculation input.');
  if(row.notes)lines.push(clean(row.notes));
  lines.push(de?'Basis-Einkommen und Kaufkosten sind keine Markt- oder Trade-Preise.':'Base income and purchase cost are not market or trade prices.',sourceLine(c,de));
  return lines.join('\n').slice(0,1850);
}
function natural(key,question,c,language='en'){
  if(!ref.games[key]||!c||action(question))return null;
  const q=ref.fold(question),de=language==='de',g=ref.games[key],category=ref.category(question);
  if(category){
    const s=g.sections[category],level=q.match(/\b(?:rebirth|wiedergeburt)\s*(?:level|lvl|stufe)?\s*(\d{1,2})\b/);
    const hit=level?'Rebirth '+level[1]:ref.matchQuestion(s?.records||[],question)[0]?.name||'';
    return ref.sectionText(key,category,hit,1,language);
  }
  const hits=ref.matchQuestion(c.records,question);
  if(hits.length){return detail(key,hits[0],c,language)+(hits.length>1?'\n'+(de?'Weitere passende Namen: ':'Other matching names: ')+hits.slice(1).map(r=>clean(r.name)).join(', '):'');}
  for(const type of ['mutations','traits']){
    const hit=ref.matchQuestion(g.sections[type]?.records||[],question)[0];
    if(hit)return ref.sectionText(key,type,hit.name,1,language);
  }
  if(/\b(?:best|highest|top|strongest|beste|besten|starkste|hochste)\b/.test(q)&&/\b(?:pet|pets|brainrot|brainrots|egg|income|earner|einkommen|verdienst)\b/.test(q)){
    const top=c.records.filter(r=>Number.isFinite(r.income)&&r.income>0&&!r.disputed).sort((a,b)=>b.income-a.income).slice(0,5);
    return `**${g.name} · ${de?'Höchste gemeldete Basis-Einkommen':'Highest reported base incomes'}**\n`+top.map(r=>`• ${clean(r.name)} — $${r.income.toLocaleString('en-US')}/s`).join('\n')+'\n\n'+sourceLine(c,de)+'\n'+(de?'Nur bekannte Quellenwerte; keine Bestätigung für das beste Pet, aktuelle Erhältlichkeit oder einen Trade-Preis.':'Known source values only; not proof of the best item, current availability or a trade price.');
  }
  const guide=ref.guide(key,question,language);
  const intro=q.replace(/\b(?:steal an egg|steal a egg|steal a brainrot|sab|sae)\b/g,'').trim();
  const basicIntro=/\b(?:beginner|basics|start|anfang|anfanger|how to play|wie spielt|overview|uberblick)\b/.test(intro)||/^(?:what is|was ist)(?: this game| das spiel)?$/.test(intro);
  if(guide&&(guide.topic!=='basics'||basicIntro)&&(/\b(?:egg|pet|pets|brainrot|brainrots|mutation|mutationen|trait|index|rebirth|treadmill|laufband|biome|biom|speed|codes?|admin abuse|taco tuesday)\b/.test(q)||ref.explicitGame(question)||/^(?:how to play|how do i start|beginner|basics|wie spielt man|wie fange ich an|anfanger|alles|everything)[ !?.]*$/.test(q))){
    return `**${g.name} · ${guide.topic}**\n${guide.text}`+(guide.source?'\n<'+guide.source+'>':'')+'\n'+(de?'Katalog: ':'Catalog: ')+c.records.length+(de?' gespeicherte Einträge; Stand ':' bundled records; reviewed ')+(c.reviewDate||'unknown');
  }
  if(ref.explicitGame(question)||/\b(?:egg|pet|brainrot|mutation|trait|treadmill|laufband|biome|rebirth)\b/.test(q))return `**${g.name}**\n`+(de?'Dazu habe ich keinen passenden belegten Datensatz gefunden. Nenne den genauen Item-Namen oder nutze /game index. Unbekannte Werte und Mechaniken bleiben unbekannt.':'I could not find a matching sourced record for that detail. Give the exact item name or use /game index. Unknown values and mechanics stay unknown.');
  return null;
}
module.exports={natural,detail,sourceLine,action};
