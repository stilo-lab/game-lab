'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {wavDecode,wavEncode}=require('./mimic_audio');
const {PACKS,CATEGORIES,categoriesFor,matchDifficulty}=require('./mimic_categories');
const {decodeMedia}=require('./mimic_media');
function createSoundStore({db,saveDB,dataDirectory,fetchImpl=fetch}){
  const catalog=require('../assets/mimic/catalog.json');
  const locks=new Set();
  const records=guildId=>{db.mimic??={};db.mimic.sounds??={};return db.mimic.sounds[guildId]??=[];};
  const file=(guildId,id)=>{if(!/^\d{1,22}$/.test(guildId)||! /^[a-f0-9]{24}$/.test(id))throw Error('Ungültige Sound-ID.');return path.join(dataDirectory,'mimic-sounds',guildId,`${id}.wav`);};
  const list=(guildId,pack='mixed',difficulty='mixed')=>{
    const selected=categoriesFor(pack),allCustom=selected.includes('custom');
    const builtins=catalog.filter(x=>selected.includes(x.pack));
    const custom=records(guildId).filter(x=>allCustom||selected.includes(x.category)).map(x=>({...x,pack:'custom',category:x.category||'custom'}));
    return [...builtins,...custom].filter(x=>matchDifficulty(x,difficulty));
  };
  const packs=guildId=>PACKS.map(p=>({...p,count:list(guildId,p.value).length}));
  async function load(guildId,sound){
    if(sound.pack==='custom')return wavDecode(await fs.readFile(file(guildId,sound.id)));
    if(!catalog.some(x=>x.id===sound.id)||! /^[a-z0-9-]+$/.test(sound.id))throw Error('Sound nicht gefunden.');
    return wavDecode(await fs.readFile(path.join(__dirname,'../assets/mimic',`${sound.id}.wav`)));
  }
  async function upload(guildId,name,attachment,{category='custom',difficulty='normal',start=0,duration}={}){
    if(locks.has(guildId))throw Error('Ein Sound wird gerade gespeichert. Bitte kurz warten.');locks.add(guildId);
    let target;
    try{
      if(records(guildId).length>=30)throw Error('Maximal 30 eigene Sounds pro Server.');
      if(category!=='custom'&&!CATEGORIES.some(x=>x.value===category)||!['easy','normal','hard'].includes(difficulty))throw Error('Ungültige Kategorie oder Schwierigkeit.');
      const extension=attachment?.name?.toLowerCase().split('.').pop();
      if(!attachment||attachment.size>2*1024*1024||!['wav','mp3','ogg'].includes(extension))throw Error('Bitte eine WAV-, MP3- oder OGG-Datei bis 2 MB auswählen.');
      const url=new URL(attachment.url);
      if(url.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Bitte eine Datei direkt in Discord hochladen.');
      const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok||!response.body)throw Error('Discord-Datei konnte nicht heruntergeladen werden.');
      const reader=response.body.getReader(),parts=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw Error('Datei ist zu groß.');parts.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
      const samples=await decodeMedia(Buffer.concat(parts),extension,{start,duration}),id=crypto.randomBytes(12).toString('hex');
      target=file(guildId,id);await fs.mkdir(path.dirname(target),{recursive:true});
      const tmp=`${target}.tmp`;try{await fs.writeFile(tmp,wavEncode(samples),{flag:'wx'});await fs.rename(tmp,target);}finally{await fs.unlink(tmp).catch(()=>{});samples.fill(0);}
      const entry={id,name:String(name).replace(/[\r\n`<>@]/g,'').trim().slice(0,60)||'Eigener Sound',seconds:samples.length/16000,category,difficulty,source:'upload'};
      records(guildId).push(entry);
      try{saveDB();}catch(error){records(guildId).pop();throw error;}
      return entry;
    }catch(error){if(target)await fs.unlink(target).catch(()=>{});throw error;}
    finally{locks.delete(guildId);}
  }
  async function remove(guildId,id){
    if(locks.has(guildId))throw Error('Ein Sound wird gerade gespeichert.');locks.add(guildId);
    try{
      const sounds=records(guildId),index=sounds.findIndex(x=>x.id===id);if(index<0)throw Error('Sound-ID nicht gefunden.');
      const [entry]=sounds.splice(index,1);try{saveDB();}catch(error){sounds.splice(index,0,entry);throw error;}
      await fs.unlink(file(guildId,id)).catch(error=>{if(error.code!=='ENOENT')console.warn('Mimic Sound löschen:',error.code);});
    }finally{locks.delete(guildId);}
  }
  return {list,load,upload,remove,packs};
}
module.exports={PACKS,createSoundStore};
