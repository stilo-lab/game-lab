'use strict';
const SOURCE='https://stealanegg.app/wiki/egg-index/';
const OFFICIAL='https://www.roblox.com/games/107778070777162/Steal-An-Egg';
const SOURCES={'steal-an-egg':SOURCE,'steal-a-brainrot':'https://stealabrainrotgame.wiki/brainrots/'};
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const clean=s=>String(s??'').replace(/@/g,'@\u200b').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,150);
function decode(s){return String(s).replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi,entity=>{const map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};if(map[entity])return map[entity];const n=entity[2]?.toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);return n>0&&n<0x110000?String.fromCodePoint(n):'';});}
function plain(s){return clean(decode(String(s).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' '))).replace(/\s+/g,' ').trim();}
function parseCatalog(html,now=Date.now()){
  if(typeof html!=='string'||html.length>2_000_000)throw Error('Game index response is too large.');
  const rows=[];const seen=new Set();
  for(const m of html.matchAll(/<tr\b([^>]*\bdata-name=[^>]*)>([\s\S]*?)<\/tr>/gi)){
    const attrs={};for(const a of m[1].matchAll(/\b(data-(?:name|group|rarity|income))="([^"]*)"/g))attrs[a[1]]=decode(a[2]);
    const name=attrs['data-name'];if(!name||name.length>100||!/^[-\p{L}\p{N} .,()'’&#+/]+$/u.test(name))throw Error('Invalid item in the community index.');
    const key=normalize(name);if(seen.has(key))continue;seen.add(key);
    const raw=attrs['data-income'],income=raw&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):null;
    if(income!==null&&(!Number.isFinite(income)||income<0||income>1e24))throw Error('Invalid income in the community index.');
    const cells=[...m[2].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(v=>v[1]);
    rows.push({name,group:clean(attrs['data-group']||'Unknown'),rarity:clean(attrs['data-rarity']||'Unknown'),income,incomeDate:m[2].match(/Community-reported base[^<]*?(20\d\d-\d\d-\d\d)/i)?.[1]||null,
      egg:plain(cells[2]?.match(/<small\b[^>]*>([\s\S]*?)<\/small>/i)?.[1]||''),aliases:m[2].match(/Also:\s*([^<]+)/i)?[plain(m[2].match(/Also:\s*([^<]+)/i)[1])]:[],
      disputed:/disputed|unresolved|discrepancy/i.test(m[2]),notes:plain((cells[4]||'').replace(/References:[\s\S]*/i,''))});
    if(rows.length>500)throw Error('The community index exceeds the supported size.');
  }
  if(rows.length<10)throw Error('The community index layout changed or its records are unavailable.');
  return {schemaVersion:2,game:'steal-an-egg',source:SOURCE,sourceType:'community-reported',fetchedAt:now,reviewDate:html.match(/Community records reviewed\s+(20\d\d-\d\d-\d\d)/i)?.[1]||null,records:rows};
}
function parseBrainrotCatalog(html,now=Date.now()){
  if(typeof html!=='string'||html.length>2_000_000)throw Error('Game index response is too large.');
  const records=[],seen=new Set(),reviewDate=html.match(/Wiki data pulled:\s*(?:<[^>]+>\s*)*([A-Za-z]+\s+\d{1,2},\s+20\d\d)/i)?.[1];
  const numeric=raw=>{const m=plain(raw).replace(/,/g,'').match(/^\$?(\d+(?:\.\d+)?)([A-Za-z]*?)(?:\/s)?$/i),units={'':1,K:1e3,M:1e6,B:1e9,T:1e12,QA:1e15,QI:1e18,SX:1e21,SP:1e24};if(!m||!Object.hasOwn(units,m[2].toUpperCase()))return null;const n=Number(m[1])*units[m[2].toUpperCase()];if(!Number.isFinite(n)||n>1e24)throw Error('Invalid index number.');return n;};
  for(const section of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>[\s\S]*?(<table\b[\s\S]*?<\/table>)/gi)){
    const rarity=plain(section[1]).replace(/\s+brainrots?\s*\(\d+\)\s*$/i,'');
    for(const row of section[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      if(!/<td\b/i.test(row[1]))continue;
      const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(v=>v[1]);if(cells.length!==5)throw Error('Brainrot index layout changed.');
      const name=plain(cells[0]);if(!name||name.length>100||!/^[-\p{L}\p{N} .,()'’&#+/]+$/u.test(name))throw Error('Invalid Brainrot name.');if(seen.has(normalize(name)))continue;seen.add(normalize(name));
      records.push({name,rarity,group:rarity,income:numeric(cells[1]),cost:numeric(cells[2]),obtain:plain(cells[4]),incomeDate:reviewDate&&Number.isFinite(Date.parse(reviewDate+' UTC'))?new Date(reviewDate+' UTC').toISOString().slice(0,10):null});if(records.length>1200)throw Error('Brainrot index is too large.');
    }
  }
  if(records.length<10)throw Error('Brainrot index layout changed or records are unavailable.');
  return {schemaVersion:2,game:'steal-a-brainrot',source:SOURCES['steal-a-brainrot'],sourceType:'community-reported',fetchedAt:now,reviewDate:records[0].incomeDate,records};
}
async function fetchCatalog({key='steal-an-egg',fetchImpl=fetch,signal,now=Date.now()}={}){
  const source=SOURCES[key];if(!source)throw Error('No configured public catalog for this game.');
  const r=await fetchImpl(source,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),headers:{'User-Agent':'Pixel-Community-Bot/1.37 public-index'}});
  if(!r.ok)throw Error('The community index is temporarily unavailable (HTTP '+r.status+').');
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>2_000_000){await r.body.cancel?.().catch(()=>{});throw Error('Game index response is too large.');}chunks.push(Buffer.from(chunk));}
  return (key==='steal-a-brainrot'?parseBrainrotCatalog:parseCatalog)(Buffer.concat(chunks).toString('utf8'),now);
}
function quoteKey(item,variant='Normal'){return normalize(item)+'|'+normalize(variant);}
function validateQuote(input,now=Date.now()){
  const item=String(input.item||'').trim(),variant=String(input.variant||'Normal').trim(),unit=String(input.unit||'points').trim();
  if(!item||item.length>100||!variant||variant.length>100||!unit||unit.length>30||/[\u0000-\u001f@`]/.test(item+variant+unit))throw Error('Use clear item, variant and unit names without mentions.');
  if(typeof input.amount!=='number'||!Number.isFinite(input.amount)||input.amount<=0||input.amount>1e18)throw Error('Value must be a positive number up to 1e18.');
  let source=null;if(input.source){const url=new URL(input.source);if(url.protocol!=='https:'||url.username||url.password||url.href.length>500)throw Error('Use a public HTTPS source URL without credentials.');source=url.href;}
  const observed=String(input.observed||new Date(now).toISOString().slice(0,10));if(!/^20\d\d-\d\d-\d\d$/.test(observed)||!Number.isFinite(Date.parse(observed+'T00:00:00Z'))||new Date(observed+'T00:00:00Z').toISOString().slice(0,10)!==observed||Date.parse(observed)>now+86400000)throw Error('Use a valid observation date (YYYY-MM-DD), not a future date.');
  return {item,variant,unit,amount:input.amount,source,observed,recordedAt:now,kind:'server-estimate'};
}
function offer(text){
  const parts=String(text||'').split(/\s*\+\s*/);if(!parts.length||parts.length>10)throw Error('Use up to ten items, separated by +. Example: 2x Dragon [Rainbow] + Chicken [Normal]');
  return parts.map(raw=>{const m=raw.trim().match(/^(?:(\d{1,4})\s*x\s+)?([^\[\]\r\n]{1,100}?)(?:\s*\[([^\[\]\r\n]{1,100})\])?$/i);if(!m||Number(m[1]||1)<1)throw Error('Use quantity x item [exact variant], separated by +.');return {item:m[2].trim(),variant:m[3]?.trim()||'Normal',quantity:Number(m[1]||1)};});
}
function compare(give,receive,quotes,now=Date.now()){
  const sides=[offer(give),offer(receive)],missing=[],stale=[],units=new Set();
  const totals=sides.map(items=>items.reduce((total,row)=>{const q=quotes[quoteKey(row.item,row.variant)];if(!q){missing.push(row.item+' ['+row.variant+']');return total;}units.add(normalize(q.unit));if(now-Date.parse(q.observed)>7*86400000)stale.push(q.item+' ['+q.variant+']');return total+q.amount*row.quantity;},0));
  if(missing.length||stale.length||units.size!==1||!totals.every(Number.isFinite))return {complete:false,missing:[...new Set(missing)],stale:[...new Set(stale)],mixedUnits:units.size>1,sides};
  const diff=totals[1]-totals[0],percent=totals[0]?diff/totals[0]*100:0;return {complete:true,give:totals[0],receive:totals[1],difference:diff,percent,unit:quotes[quoteKey(sides[0][0].item,sides[0][0].variant)].unit,sides};
}
module.exports={SOURCE,OFFICIAL,SOURCES,normalize,clean,parseCatalog,parseBrainrotCatalog,fetchCatalog,quoteKey,validateQuote,offer,compare};
