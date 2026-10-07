'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {wavDecode,wavEncode}=require('./mimic_audio');
const {PACKS,CATEGORIES,categoriesFor,matchDifficulty}=require('./mimic_categories');
const {decodeMedia}=require('./mimic_media');
const {ORIGINALS,fetchOriginal,isOriginalVoice}=require('./mimic_originals');
function createSoundStore({db,saveDB,dataDirectory,fetchImpl=fetch,assetDirectory=path.join(__dirname,'../assets/mimic')}){
  let catalog;
  try{catalog=require(path.join(assetDirectory,'catalog.json'));}
  catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;catalog=require('./mimic_stock').catalog();}
  const locks=new Set(),originalTasks=new Map();
  const records=guildId=>{db.mimic??={};db.mimic.sounds??={};return db.mimic.sounds[guildId]??=[];};
  const file=(guildId,id)=>{if(!/^\d{1,22}$/.test(guildId)||! /^[a-f0-9]{24}$/.test(id))throw Error('Ungültige Sound-ID.');return path.join(dataDirectory,'mimic-sounds',guildId,`${id}.wav`);};
  const list=(guildId,pack='mixed',difficulty='mixed',voiceSource='all')=>{
    const selected=categoriesFor(pack),allCustom=selected.includes('custom');
    const builtins=catalog.filter(x=>selected.includes(x.pack));
    const custom=records(guildId).filter(x=>allCustom||selected.includes(x.category)).map(x=>({...x,pack:'custom',category:x.category||'custom'}));
    return [...builtins,...custom].filter(x=>matchDifficulty(x,difficulty)&&(voiceSource!=='original'||isOriginalVoice(x)));
  };
  const packs=guildId=>PACKS.map(p=>({...p,count:list(guildId,p.value).length}));
  async function load(guildId,sound){
    if(sound.pack==='custom'){const bytes=await fs.readFile(file(guildId,sound.id));if(sound.sha256&&crypto.createHash('sha256').update(bytes).digest('hex')!==sound.sha256)throw Error('Die gespeicherte Originaldatei wurde verändert. Clip neu importieren.');return wavDecode(bytes);}
    if(!catalog.some(x=>x.id===sound.id)||! /^[a-z0-9-]+$/.test(sound.id))throw Error('Sound nicht gefunden.');
    try{return wavDecode(await fs.readFile(path.join(assetDirectory,`${sound.id}.wav`)));}
    catch(error){const bundled=require('./mimic_stock').bundledSound(sound.id);if(!bundled)throw error;return wavDecode(bundled);}
  }
  async function importOriginal(guildId,name,link,{category='streamers',difficulty='normal',start=0,duration=6,sourcePage}={}){
    if(locks.has(guildId))throw Error('Ein Sound wird gerade gespeichert. Bitte kurz warten.');locks.add(guildId);
    let target,samples,entry;
    try{
      if(category!=='custom'&&!CATEGORIES.some(x=>x.value===category)||!['easy','normal','hard'].includes(difficulty))throw Error('Ungültige Kategorie oder Schwierigkeit.');
      const prior=records(guildId).find(x=>x.source==='original-clip'&&x.importLink===String(link)&&x.start===start&&x.duration===duration);
      if(prior){try{const cached=await load(guildId,{...prior,pack:'custom'});cached.fill(0);return prior;}catch{await fs.unlink(file(guildId,prior.id)).catch(()=>{});}}
      if(records(guildId).length>=30&&!prior)throw Error('Maximal 30 eigene Sounds pro Server.');
      const imported=await fetchOriginal(link,{fetchImpl,start,duration});samples=imported.samples;
      const id=prior?.id||crypto.randomBytes(12).toString('hex'),bytes=wavEncode(samples);target=file(guildId,id);await fs.mkdir(path.dirname(target),{recursive:true});
      const tmp=`${target}.tmp`;try{await fs.writeFile(tmp,bytes,{flag:'wx'});await fs.rename(tmp,target);}finally{await fs.unlink(tmp).catch(()=>{});}
      entry={id,name:String(name).replace(/[\r\n`<>@]/g,'').trim().slice(0,60)||'Original-Clip',seconds:samples.length/16000,category,difficulty,source:'original-clip',sourcePage:sourcePage||imported.sourcePage||imported.audioUrl,audioUrl:imported.audioUrl,importLink:String(link),start,duration,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
      const rows=records(guildId),index=prior?rows.indexOf(prior):-1;if(index>=0)rows[index]=entry;else rows.push(entry);
      try{saveDB();}catch(error){if(index>=0)rows[index]=prior;else rows.pop();throw error;}
      return entry;
    }catch(error){if(target)await fs.unlink(target).catch(()=>{});throw error;}
    finally{samples?.fill(0);locks.delete(guildId);}
  }
  function prepareOriginals(guildId){
    if(originalTasks.has(guildId))return originalTasks.get(guildId);
    const task=(async()=>{
      const loaded=[],failed=[];
      for(const clip of ORIGINALS){try{loaded.push(await importOriginal(guildId,clip.name,clip.audio,{...clip,sourcePage:clip.page}));}catch(error){failed.push({name:clip.name,message:String(error.message).slice(0,180)});}}
      return {loaded,failed};
    })().finally(()=>originalTasks.delete(guildId));originalTasks.set(guildId,task);return task;
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
  return {list,load,upload,remove,packs,importOriginal,prepareOriginals};
}
module.exports={PACKS,createSoundStore};
