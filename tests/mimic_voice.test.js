'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const Opus=require('opusscript');const {synth,pcmStereo48,pcmMono16}=require('../src/mimic_audio');const {scoreMimic}=require('../src/mimic_score');const {wait}=require('../src/mimic_voice');
test('Actual Discord audio-resource pipeline encodes raw PCM without ffmpeg',async()=>{
  const {Readable}=require('node:stream'),v=require('@discordjs/voice'),resource=v.createAudioResource(Readable.from([pcmStereo48(synth([{f:220,d:.4}]))]),{inputType:v.StreamType.Raw});let packets=0;
  for await(const packet of resource.playStream){assert.ok(packet.length>0&&packet.length<1500);packets++;}assert.equal(packets,20);assert.equal(resource.edges.length,1);assert.equal(resource.edges[0].type,'opus encoder');
});
function setup(){
  const v=require('@discordjs/voice');let current=null,destroyed=0;const subscribed=[],streams=new Map(),output=[];
  const player=new EventEmitter();player.stop=()=>{};player.play=resource=>{(async()=>{for await(const chunk of resource.stream)output.push(Buffer.from(chunk));player.emit('stateChange',{}, {status:v.AudioPlayerStatus.Idle});})().catch(e=>player.emit('error',e));};
  const connection={state:{status:v.VoiceConnectionStatus.Ready},subscribe(){},receiver:{subscribe(id){const stream=new PassThrough();subscribed.push(id);streams.set(id,stream);return stream;}},destroy(){destroyed++;if(current===this)current=null;}};
  const module={exports:{}},file=path.join(__dirname,'../src/mimic_voice.js');const createRequire=require('node:module').createRequire(file);
  const stub={...v,getVoiceConnection:()=>current,joinVoiceChannel:()=>{current=connection;return connection;},createAudioPlayer:()=>player,createAudioResource:stream=>({stream}),entersState:async()=>{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:n=>n==='@discordjs/voice'?stub:createRequire(n),setTimeout,clearTimeout,AbortSignal,Buffer,console});
  return {adapter:module.exports.createVoiceAdapter(),streams,subscribed,output,connection,get destroyed(){return destroyed;},setForeign:()=>{current={destroy(){throw Error('foreign connection destroyed');}};}};
}
test('Real Opus codec roundtrip retains a mimicable melody',()=>{
  const reference=synth([{f:220,d:.4,gap:.1},{f:330,d:.4,gap:.1},{f:440,d:.4}]),pcm=pcmStereo48(reference),encoder=new Opus(48000,2,Opus.Application.AUDIO),decoder=new Opus(48000,2,Opus.Application.AUDIO),chunks=[];
  try{for(let offset=0;offset<pcm.length;offset+=3840){const frame=Buffer.alloc(3840);pcm.copy(frame,0,offset,Math.min(offset+3840,pcm.length));chunks.push(pcmMono16(decoder.decode(encoder.encode(frame,960))));}
    const decoded=new Float32Array(chunks.reduce((n,x)=>n+x.length,0));let at=0;for(const chunk of chunks){decoded.set(chunk,at);at+=chunk.length;}assert.ok(scoreMimic(reference,decoded).score>=90,JSON.stringify(scoreMimic(reference,decoded)));
  }finally{encoder.delete();decoder.delete();}
});
test('Voice capture subscribes to consenting IDs only and preserves a microphone pause',async()=>{
  const h=setup(),abort=new AbortController(),audio=await h.adapter.connect({id:'vc',guild:{id:'123'}},abort.signal);
  const encoder=new Opus(48000,2,Opus.Application.AUDIO),packet=encoder.encode(pcmStereo48(synth([{f:220,d:.02}])),960);
  const take=audio.capture(['A'],.32);for(const ms of [20,40,60,190,210])setTimeout(()=>h.streams.get('A').write(packet),ms);
  try{const recordings=await take;assert.deepEqual(h.subscribed,['A']);const data=recordings.get('A');assert.ok(data.some(x=>Math.abs(x)>.01));assert.ok(data.subarray(1500,2300).every(x=>x===0));assert.equal(h.streams.get('A').destroyed,true);data.fill(0);}finally{encoder.delete();audio.close();}
});
test('Forgetting a participant destroys stream and erases the buffered take',async()=>{
  const h=setup(),abort=new AbortController(),audio=await h.adapter.connect({id:'vc',guild:{id:'123'}},abort.signal);const pending=audio.capture(['A','B'],.04);audio.forget('A');const recordings=await pending;assert.equal(recordings.has('A'),false);assert.equal(recordings.has('B'),true);assert.equal(h.streams.get('A').destroyed,true);audio.close();
});
test('Raw PCM playback works without ffmpeg and destroy respects connection ownership',async()=>{
  const h=setup(),abort=new AbortController(),audio=await h.adapter.connect({id:'vc',guild:{id:'123'}},abort.signal);await audio.play(synth([{f:220,d:.1}]));assert.equal(h.output[0].length,1600*3*4);assert.ok(h.output[0].some(x=>x!==0));h.setForeign();audio.close();assert.equal(h.destroyed,0);
});
test('Aborted captures destroy subscriptions; stopped timers reject promptly',async()=>{
  const h=setup(),abort=new AbortController(),audio=await h.adapter.connect({id:'vc',guild:{id:'123'}},abort.signal);const pending=audio.capture(['A'],7);abort.abort();await assert.rejects(pending,/beendet/);assert.equal(h.streams.get('A').destroyed,true);audio.close();assert.equal(h.destroyed,1);await assert.rejects(wait(30000,abort.signal),/beendet/);
});
test('Voice adapter refuses to replace an already occupied guild connection',async()=>{
  const h=setup();h.setForeign();await assert.rejects(h.adapter.connect({id:'vc',guild:{id:'123'}},new AbortController().signal),/bereits/);assert.equal(h.destroyed,0);
});
