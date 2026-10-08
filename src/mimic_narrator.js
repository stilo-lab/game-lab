'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {fetchOriginal}=require('./mimic_originals');
const {decodeMedia}=require('./mimic_media');
const {wavDecode,wavEncode}=require('./mimic_audio');
const EVENTS=Object.freeze([
  {value:'intro',name:'Begrüßung'}, {value:'reference',name:'Vorlage anhören'},
  {value:'countdown',name:'Countdown / Bereit'}, {value:'record',name:'Jetzt nachmachen'},
  {value:'stop',name:'Aufnahme beendet'}, {value:'scoring',name:'Bewertung'},
  {value:'replay',name:'Replay'}, {value:'wheel',name:'Glücksrad'},
  {value:'round',name:'Runde abgeschlossen'}, {value:'win',name:'Party abgeschlossen'},
  {value:'pause',name:'Pause'}, {value:'resume',name:'Fortsetzen'}
].map(Object.freeze));
const DEFAULTS=Object.freeze([
  {event:'countdown',name:'Mario Party · Ready',duration:1.2,page:'https://www.myinstants.com/de/instant/mario-party-announcer-ready-99518/',audio:'https://www.myinstants.com/media/sounds/mario-party-announcer-ready.mp3'},
  {event:'record',name:'Mario Party · Start',duration:1.2,page:'https://www.myinstants.com/en/instant/mario-party-announcer-start-19739/',audio:'https://www.myinstants.com/media/sounds/mario-party-announcer-start.mp3'},
  {event:'stop',name:'Mario Party · Finish',duration:1.3,page:'https://www.myinstants.com/de/instant/mario-party-announcer-finish-93120/',audio:'https://www.myinstants.com/media/sounds/mario-party-announcer-finish.mp3'},
  {event:'win',name:'Announcer · Congratulations',duration:2,page:'https://www.myinstants.com/en/instant/announcer-congratulations-15201/',audio:'https://www.myinstants.com/media/sounds/announcer-congratulations.mp3'}
].map(Object.freeze));
function createNarrator({db,saveDB,dataDirectory,fetchImpl=fetch}){
  const locks=new Set(),tasks=new Map();
  const settings=gid=>{db.mimic??={};db.mimic.narrators??={};return db.mimic.narrators[gid]??={enabled:true,clips:{}};};
  const file=(gid,event)=>{
    if(!/^\d{1,22}$/.test(gid)||!EVENTS.some(x=>x.value===event))throw Error('Ungültige Spielleiter-Ansage.');
    return path.join(dataDirectory,'mimic-narrator',gid,event+'.wav');
  };
  async function load(gid,event){
    const entry=settings(gid).clips[event];if(!entry)return null;
    const bytes=await fs.readFile(file(gid,event));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Spielleiter-Datei verändert. Ansage neu laden.');
    return wavDecode(bytes);
  }
  async function save(gid,event,samples,metadata){
    const target=file(gid,event),bytes=wavEncode(samples),tmp=target+'.tmp';
    if(!samples.some(x=>Math.abs(x)>.001))throw Error('Die Ansage enthält kein hörbares Signal.');
    await fs.mkdir(path.dirname(target),{recursive:true});
    const previous=settings(gid).clips[event],oldBytes=await fs.readFile(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    try{
      await fs.writeFile(tmp,bytes,{flag:'wx'});await fs.rename(tmp,target);
      const entry={...metadata,event,seconds:samples.length/16000,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
      settings(gid).clips[event]=entry;
      try{saveDB();}catch(error){if(previous)settings(gid).clips[event]=previous;else delete settings(gid).clips[event];if(oldBytes)await fs.writeFile(target,oldBytes);else await fs.unlink(target).catch(()=>{});throw error;}
      return entry;
    }finally{await fs.unlink(tmp).catch(()=>{});bytes.fill(0);oldBytes?.fill(0);}
  }
  async function install(gid,event,{link,attachment,start=0,duration=6,name,sourcePage,isDefault=false}={}){
    if(locks.has(gid))throw Error('Eine Spielleiter-Ansage wird gerade gespeichert.');
    file(gid,event);if(Boolean(link)===Boolean(attachment))throw Error('Genau eine Originaldatei oder einen Myinstants-Link angeben.');
    locks.add(gid);let samples;
    try{
      let metadata;
      if(link){const clip=await fetchOriginal(link,{fetchImpl,start,duration});samples=clip.samples;metadata={name:name||EVENTS.find(x=>x.value===event).name,source:'original-clip',sourcePage:clip.sourcePage||clip.audioUrl,audioUrl:clip.audioUrl};}
      else{
        const ext=attachment.name?.toLowerCase().split('.').pop();let url;
        try{url=new URL(attachment.url);}catch{throw Error('Eine Datei direkt in Discord hochladen.');}
        if(!['wav','mp3','ogg'].includes(ext)||attachment.size>2*1024*1024||url.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Nutze eine Discord-Datei als WAV, MP3 oder OGG bis 2 MB.');
        const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok||!response.body)throw Error('Ansage konnte nicht geladen werden.');
        const reader=response.body.getReader(),parts=[];let length=0;
        try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>2*1024*1024)throw Error('Ansage ist zu groß.');parts.push(Buffer.from(next.value));}}finally{await reader.cancel().catch(()=>{});}
        samples=await decodeMedia(Buffer.concat(parts),ext,{start,duration,padShort:true});metadata={name:name||EVENTS.find(x=>x.value===event).name,source:'upload'};
      }
      return await save(gid,event,samples,{...metadata,sourcePage:sourcePage||metadata.sourcePage,isDefault});
    }finally{samples?.fill(0);locks.delete(gid);}
  }
  function prepare(gid){
    if(tasks.has(gid))return tasks.get(gid);
    const task=(async()=>{
      const loaded=[],failed=[];
      if(!settings(gid).enabled)return {loaded,failed,enabled:false};
      for(const clip of DEFAULTS){
        try{
          const current=settings(gid).clips[clip.event];
          if(current){try{const samples=await load(gid,clip.event);samples.fill(0);loaded.push(current);continue;}catch{if(!current.isDefault)throw Error('Deine Ansage ist beschädigt. Erneut hochladen.');}}
          const entry=await install(gid,clip.event,{link:clip.audio,name:clip.name,duration:clip.duration,sourcePage:clip.page,isDefault:true});loaded.push(entry);
        }catch(error){failed.push({event:clip.event,name:clip.name,message:String(error.message).slice(0,160)});}
      }
      return {loaded,failed,enabled:true};
    })().finally(()=>tasks.delete(gid));tasks.set(gid,task);return task;
  }
  function enable(gid,enabled){const state=settings(gid),before=state.enabled;state.enabled=enabled;try{saveDB();}catch(e){state.enabled=before;throw e;}}
  async function say(session,event){
    if(!session.narration||!settings(session.guildId).enabled||session.abort.signal.aborted)return false;
    let samples;
    try{
      samples=await load(session.guildId,event);if(!samples)return false;
      let peak=0;for(const x of samples)peak=Math.max(peak,Math.abs(x));
      const gain=peak?Math.min(2,.6/peak):1;for(let i=0;i<samples.length;i++)samples[i]*=gain;
      await session.connection.play(samples);return true;
    }catch(error){if(session.abort.signal.aborted)throw error;session.narratorError=String(error.message).slice(0,150);return false;}
    finally{samples?.fill(0);}
  }
  return {prepare,install,load,enable,say,status:gid=>structuredClone(settings(gid))};
}
module.exports={createNarrator,EVENTS,DEFAULTS};
