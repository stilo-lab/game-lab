'use strict';
// Short community-hosted recordings. Attribution describes the source page;
// it is not a claim that a creator officially supplied or endorsed the pack.
const ORIGINALS=Object.freeze([
  {key:'trymacs-on-me',name:'Trymacs · On me, ich bin tot',category:'streamers',difficulty:'normal',duration:3.5,
    page:'https://www.myinstants.com/en/instant/on-me-ich-bin-tod-trymacs-67591/',audio:'https://www.myinstants.com/media/sounds/on-me-ich-bin-tod-trymacs.mp3'},
  {key:'papaplatte-stanni',name:'Papaplatte · Stanni?',category:'streamers',difficulty:'easy',duration:1.5,
    page:'https://www.myinstants.com/en/instant/stanni-papaplatte-3424/',audio:'https://www.myinstants.com/media/sounds/stanni-papaplatte.mp3'},
  {key:'papaplatte-tamaris',name:'Papaplatte · Tamaris',category:'memes',difficulty:'normal',duration:2.5,
    page:'https://www.myinstants.com/en/instant/papaplatte-tamaris-24889/',audio:'https://www.myinstants.com/media/sounds/papaplatte-tamaris.mp3'},
  {key:'bastighg-guam',name:'BastiGHG · Wo ist Guam?',category:'gaming',difficulty:'hard',duration:2.6,
    page:'https://www.myinstants.com/en/instant/bastighg-wo-ist-guam-5562/',audio:'https://www.myinstants.com/media/sounds/bastighg-wo-ist-guam_P5g4ZCh.mp3'},
  {key:'bastighg-ay-zip',name:'BastiGHG · Ay Zip',category:'streamers',difficulty:'easy',duration:1.8,
    page:'https://www.myinstants.com/en/instant/bastighg-ay-zip-8128/',audio:'https://www.myinstants.com/media/sounds/bastighg-ay-zip_k9M5Gnu.mp3'}
].map(Object.freeze));
function sourceURL(value,{audio=false}={}) {
  let u;try{u=new URL(value);}catch{throw Error('Ungültiger Clip-Link.');}
  if(u.protocol!=='https:'||!['www.myinstants.com','myinstants.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash)throw Error('Nutze einen direkten Myinstants-Clip-Link oder /mimic upload für deine Audiodatei.');
  const pathname=decodeURIComponent(u.pathname);
  if(audio?!/^\/media\/sounds\/[a-z0-9_ .()\-]+\.mp3$/i.test(pathname):!/^\/(?:[a-z]{2}\/)?instant\/[a-z0-9-]+\/$/.test(pathname))throw Error('Bitte eine einzelne Sound-Seite oder deren MP3-Link verwenden.');
  u.hostname='www.myinstants.com';return u;
}
async function boundedFetch(url,fetchImpl,maxBytes) {
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok||!response.body)throw Error('Clip-Quelle momentan nicht erreichbar. Erneut versuchen oder die Originaldatei hochladen.');
  if(response.url){const actual=new URL(response.url);if(actual.hostname!=='www.myinstants.com'&&actual.hostname!=='myinstants.com')throw Error('Fremde Clip-Weiterleitung abgelehnt.');}
  if(Number(response.headers?.get?.('content-length'))>maxBytes)throw Error('Clip-Datei ist zu groß.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes)throw Error('Clip-Datei ist zu groß.');parts.push(Buffer.from(part.value));}}
  finally{await reader.cancel().catch(()=>{});}
  return {bytes:Buffer.concat(parts),type:response.headers?.get?.('content-type')||''};
}
async function fetchOriginal(link,{fetchImpl=fetch,start=0,duration=6}={}) {
  if(!Number.isFinite(start)||start<0||start>120||!Number.isFinite(duration)||duration<.4||duration>6)throw Error('Ausschnitt: Start 0–120s, Länge 0,4–6s.');
  const isAudio=String(link).split('?')[0].endsWith('.mp3');let url=sourceURL(link,{audio:isAudio});const page=isAudio?null:url.href;
  if(!isAudio) {
    const {bytes,type}=await boundedFetch(url,fetchImpl,512*1024);
    if(type&&!type.includes('text/html'))throw Error('Der Link ist keine Sound-Seite.');
    const html=bytes.toString('utf8');
    const links=[...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+\.mp3)["']/gi)].map(m=>m[1]);
    const paths=[...html.matchAll(/["'](\/media\/sounds\/[^"']+\.mp3)["']/g)].map(m=>m[1]);
    const candidate=[...links,...paths].find(value=>{try{sourceURL(new URL(value,url).href,{audio:true});return true;}catch{return false;}});
    if(!candidate)throw Error('Kein direkter MP3-Download auf der Sound-Seite gefunden. /mimic upload funktioniert auch.');
    url=sourceURL(new URL(candidate,url).href,{audio:true});
  }
  const {bytes,type}=await boundedFetch(url,fetchImpl,2*1024*1024);
  if(type&&!/audio\/(?:mpeg|mp3)|application\/octet-stream/i.test(type))throw Error('Die Quelle liefert keine MP3-Audiodatei.');
  const signature=bytes.subarray(0,3).toString('ascii')==='ID3'||bytes.length>1&&bytes[0]===255&&(bytes[1]&224)===224;
  if(!signature)throw Error('Die Quelle enthält keine gültigen MP3-Daten.');
  const samples=await require('./mimic_media').decodeMedia(bytes,'mp3',{start,duration,padShort:true});
  return {samples,audioUrl:url.href,sourcePage:page,start,duration};
}
const isOriginalVoice=sound=>sound.source!=='synthetic-speech'&&!(sound.source!=='upload'&&sound.source!=='original-clip'&&['streamers','memes','gaming','anime','horror','voices','beatbox'].includes(sound.pack));
module.exports={ORIGINALS,sourceURL,fetchOriginal,isOriginalVoice};
