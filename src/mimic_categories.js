'use strict';
const CATEGORIES=Object.freeze([
  {value:'streamers',name:'🎙️ Streamer-Memes',short:'Streamer',description:'Chat, Rage, Clips und Hype – gesprochene Reaktionen.'},
  {value:'memes',name:'😂 Internet-Memes',short:'Memes',description:'Kurze Meme-Sprüche und absurde Reaktionen.'},
  {value:'gaming',name:'🎮 Gaming',short:'Gaming',description:'Lobby-Sprüche, Clutches und eigene Arcade-Sounds.'},
  {value:'anime',name:'⚡ Anime',short:'Anime',description:'Dramatische Ansagen, Kampf-Rufe und Power-Up-Laute.'},
  {value:'horror',name:'👻 Horror',short:'Horror',description:'Unheimliche Sprüche, Geister und Monster.'},
  {value:'beatbox',name:'🥁 Beatbox',short:'Beatbox',description:'Kick, Snare, Hi-Hat und kurze Rhythmen.'},
  {value:'animals',name:'🐾 Tier-Imitationen',short:'Tiere',description:'Bellen, Miauen, Quaken und andere Tier-Laute.'},
  {value:'machines',name:'🤖 Maschinen',short:'Maschinen',description:'Motoren, Alarme, Roboter und UFOs.'},
  {value:'voices',name:'🗣️ Stimm-Laute',short:'Stimmen',description:'Wow, Hmm, Lachen und andere Stimmübungen.'},
  {value:'melodies',name:'🎵 Melodien',short:'Melodien',description:'Eigene kurze Melodien zum Nachsummen.'}
].map(Object.freeze));
const PACKS=Object.freeze([
  {name:'🎉 Alles gemischt',value:'mixed'},
  {name:'🔥 Streamer + Memes + Gaming',value:'party'},
  ...CATEGORIES.map(({name,value})=>({name,value})),
  {name:'📁 Eigene Clips',value:'custom'}
]);
const DIFFICULTIES=Object.freeze([{name:'🎲 Gemischt',value:'mixed'},{name:'🟢 Einfach',value:'easy'},{name:'🟡 Normal',value:'normal'},{name:'🔴 Schwer',value:'hard'}]);
function categoriesFor(pack){
  if(pack==='mixed')return CATEGORIES.map(x=>x.value);
  if(pack==='party')return ['streamers','memes','gaming'];
  if(Array.isArray(pack)){
    if(!pack.length||pack.length>5||pack.some(x=>!CATEGORIES.some(c=>c.value===x)&&x!=='custom'))throw Error('Wähle ein bis fünf Kategorien.');
    return [...new Set(pack)];
  }
  if(pack==='custom'||CATEGORIES.some(c=>c.value===pack))return [pack];
  throw Error('Unbekannte Sound-Kategorie.');
}
const categoryName=value=>CATEGORIES.find(c=>c.value===value)?.name||(value==='custom'?'📁 Eigene Clips':'🎉 Gemischt');
const selectionName=pack=>Array.isArray(pack)?pack.map(x=>categoryName(x)).join(' + '):PACKS.find(x=>x.value===pack)?.name||categoryName(pack);
function matchDifficulty(sound,difficulty='mixed'){if(!DIFFICULTIES.some(x=>x.value===difficulty))throw Error('Unbekannte Schwierigkeit.');return difficulty==='mixed'||(sound.difficulty||'normal')===difficulty;}
module.exports={CATEGORIES,PACKS,DIFFICULTIES,categoriesFor,categoryName,selectionName,matchDifficulty};
