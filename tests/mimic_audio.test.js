'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {synth,wavEncode,wavDecode,effect,pcmStereo48,pcmMono16}=require('../src/mimic_audio');
const {scoreMimic}=require('../src/mimic_score');const {createScorePool}=require('../src/mimic_workers');const {createSoundStore}=require('../src/mimic_sounds');
const notes=[220,277,330,440].map(f=>({f,d:.4,gap:.15})),reference=synth(notes);
test('Melody contour works for high/deep voices and rejects reversed or flat melody',()=>{
  const same=scoreMimic(reference,reference),deep=scoreMimic(reference,synth(notes.map(n=>({...n,f:n.f/2,style:'voice'}))));
  assert.equal(same.score,100);assert.ok(deep.score>=95,JSON.stringify(deep));
  for(const wrong of [notes.toReversed(),notes.map(n=>({...n,f:220}))])assert.ok(scoreMimic(reference,synth(wrong)).score<80);
});
test('Tempo and number of attacks affect real scoring',()=>{
  const fast=scoreMimic(reference,synth(notes.map(n=>({...n,d:.15,gap:.03}))));
  assert.ok(fast.rhythm<50);assert.ok(fast.score<75,JSON.stringify(fast));
  const one=scoreMimic(reference,synth([{f:220,d:2.1}]));assert.ok(one.attacks<40);
});
test('Silence, nonfinite or oversized input cannot earn points',()=>{
  for(const data of [new Float32Array(5000),Float32Array.from([NaN,Infinity]),new Float32Array(128001)])assert.equal(scoreMimic(reference,data).score,0);
  let seed=3;const noise=Float32Array.from(reference,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/2**32-.5)*.5;});assert.ok(scoreMimic(reference,noise).score<35);
});
test('Volume and initial Discord latency do not decide the score',()=>{
  const delayed=new Float32Array(reference.length+8000);delayed.set(reference.map(x=>x*.25),8000);assert.ok(scoreMimic(reference,delayed).score>=97);
});
test('WAV/48k stereo roundtrip and all sabotage effects produce bounded audio',()=>{
  const wav=wavEncode(reference),decoded=wavDecode(wav);assert.ok(scoreMimic(reference,decoded).score>=98);
  const mono=pcmMono16(pcmStereo48(reference));assert.ok(scoreMimic(reference,mono).score>=98);
  for(const type of ['echo','saturation','pitch','chop','fart']){const data=effect(reference,type);assert.ok(data.length);assert.ok(data.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));assert.notDeepEqual(data,reference);}
  assert.equal(wav.readUInt32LE(24),16000);
});
test('Invalid WAV formats, long/silent/truncated files are rejected',()=>{
  for(const data of [Buffer.from('fake.wav'),wavEncode(new Float32Array(100)),wavEncode(new Float32Array(120000)),wavEncode(new Float32Array(16000)),wavEncode(reference).subarray(0,100)])assert.throws(()=>wavDecode(data));
  const compressed=wavEncode(reference);compressed.writeUInt16LE(3,20);assert.throws(()=>wavDecode(compressed));
});
test('The four original packs retain eight playable WAVs alongside the category update',async()=>{
  const store=createSoundStore({db:{},saveDB(){},dataDirectory:'/tmp'});assert.equal(store.list('1').length,104);
  for(const pack of ['animals','machines','voices','melodies']){const list=store.list('1',pack);assert.equal(list.length,8);for(const sound of list){const data=await store.load('1',sound);assert.ok(data.length>=6400&&data.length<=96000);assert.equal(scoreMimic(data,data).score,100,sound.id);}}
});
test('Real worker pool completes parallel scores and rejects work after shutdown',async()=>{
  const pool=createScorePool({limit:2});try{const result=await Promise.all(Array.from({length:5},()=>pool.score(reference,reference)));assert.ok(result.every(x=>x.score===100));}finally{pool.close();}await assert.rejects(pool.score(reference,reference));
});
test('Worker timeout is bounded and can shut down in-flight jobs',async()=>{
  const pool=createScorePool({limit:1,timeoutMs:1});await assert.rejects(pool.score(reference,reference),/lange/);pool.close();
  const closed=createScorePool({limit:1});const jobs=[closed.score(reference,reference),closed.score(reference,reference)];closed.close();for(const p of jobs)await assert.rejects(p,/beendet/);
});
test('Custom WAV upload persists/reloads/removes only its own server sound',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-')),db={};let saves=0;
  const store=createSoundStore({db,saveDB(){saves++;},dataDirectory:directory,fetchImpl:async()=>new Response(wavEncode(reference))});
  try{const sound=await store.upload('123','@everyone\nTest',{name:'clip.wav',url:'https://cdn.discordapp.com/attachments/clip',size:30000});assert.ok(/^[a-f0-9]{24}$/.test(sound.id));assert.ok(!sound.name.includes('@'));assert.equal(store.list('123','custom').length,1);assert.equal(store.list('456','custom').length,0);assert.ok((await store.load('123',{...sound,pack:'custom'})).length);await assert.rejects(store.remove('456',sound.id));await store.remove('123',sound.id);assert.equal(store.list('123','custom').length,0);assert.equal(saves,2);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Uploads reject external URLs, invalid content and streaming size bypass',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-'));
  try{for(const [url,body]of [['http://cdn.discordapp.com/x',reference],['https://evil.test/x',reference],['https://cdn.discordapp.com/x',Buffer.alloc(2100000)],['https://cdn.discordapp.com/x',Buffer.from('oops')]]){
    let fetched=false;const store=createSoundStore({db:{},saveDB(){},dataDirectory:directory,fetchImpl:async()=>{fetched=true;return new Response(body);}});
    await assert.rejects(store.upload('123','Test',{name:'x.wav',url,size:1}));if(url.includes('evil')||url.startsWith('http:'))assert.equal(fetched,false);
  }}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Failed database save rolls custom audio back without losing old entries',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-')),db={};
  const store=createSoundStore({db,saveDB(){throw Error('disk full');},dataDirectory:directory,fetchImpl:async()=>new Response(wavEncode(reference))});
  try{await assert.rejects(store.upload('123','Test',{name:'x.wav',url:'https://cdn.discordapp.com/x',size:1}),/disk full/);assert.equal(store.list('123','custom').length,0);assert.deepEqual(await fs.readdir(path.join(directory,'mimic-sounds','123')),[]);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
