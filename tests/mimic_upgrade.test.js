'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {PermissionsBitField,ChannelType}=require('discord.js');
const {ORIGINALS,sourceURL,fetchOriginal,isOriginalVoice}=require('../src/mimic_originals');
const {createSoundStore}=require('../src/mimic_sounds');
const {createMimicEngine}=require('../src/mimic_engine');
const {createMimicParty,buildMimicCommands,panel}=require('../src/mimic_party');
const {synth,wavEncode,RATE}=require('../src/mimic_audio');
const {ffmpegPath}=require('../src/mimic_media');
const {scoreMimic}=require('../src/mimic_score');
const reference=synth([{f:200,to:300,d:.5,gap:.15},{f:300,to:180,d:.5}]);
let encoded;
async function mp3(){
  if(encoded)return encoded;
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-codec-'));
  try{const input=path.join(folder,'fixture.wav'),output=path.join(folder,'fixture.mp3');await fs.writeFile(input,wavEncode(reference));execFileSync(ffmpegPath(),['-v','error','-y','-i',input,output]);encoded=await fs.readFile(output);return encoded;}
  finally{await fs.rm(folder,{recursive:true,force:true});}
}
function response(bytes,type='audio/mpeg'){return new Response(bytes,{status:200,headers:{'content-type':type}});}
test('Original mode excludes every packaged synthetic voice and keeps actual uploads and sound effects',()=>{
  const store=createSoundStore({db:{},saveDB(){},dataDirectory:'/tmp'});
  const original=store.list('123','mixed','mixed','original');assert.ok(original.length>0);assert.ok(original.every(s=>s.source!=='synthetic-speech'));
  assert.equal(store.list('123','streamers','mixed','original').length,0);
  assert.equal(isOriginalVoice({pack:'custom',source:'original-clip'}),true);assert.equal(isOriginalVoice({pack:'custom',source:'upload'}),true);
  assert.equal(isOriginalVoice({pack:'streamers',source:'original-synth'}),false);assert.equal(isOriginalVoice({pack:'voices'}),false);
});
test('Curated recordings have distinct HTTPS source pages and MP3s, with clips limited to six seconds',()=>{
  assert.equal(ORIGINALS.length,5);assert.equal(new Set(ORIGINALS.map(x=>x.audio)).size,5);
  for(const clip of ORIGINALS){assert.equal(sourceURL(clip.page).protocol,'https:');assert.match(sourceURL(clip.audio,{audio:true}).pathname,/\.mp3$/);assert.ok(clip.duration<=6);}
});
test('Original importer decodes actual MP3 bytes into WAV and preserves their shape rather than generating speech',async()=>{
  const source=await mp3(),imported=await fetchOriginal(ORIGINALS[0].audio,{duration:1,fetchImpl:async()=>response(source)});
  assert.ok(imported.samples.length>=15900&&imported.samples.length<=16100);assert.ok(scoreMimic(reference.subarray(0,RATE),imported.samples).score>=90);
  assert.equal(imported.audioUrl,ORIGINALS[0].audio);imported.samples.fill(0);
});
test('Sound-page parsing takes only a same-site direct MP3 and never follows external URLs or redirects',async()=>{
  const calls=[],source=await mp3(),html=`<a href="https://example.test/fake.mp3">bad</a><a download href="${ORIGINALS[0].audio}">Download MP3</a>`;
  const imported=await fetchOriginal(ORIGINALS[0].page,{fetchImpl:async(url,options)=>{calls.push(String(url));assert.equal(options.redirect,'error');return response(String(url).endsWith('.mp3')?source:html,String(url).endsWith('.mp3')?'audio/mpeg':'text/html');}});
  assert.deepEqual(calls,[ORIGINALS[0].page,ORIGINALS[0].audio]);imported.samples.fill(0);
});
test('Original sources reject private URLs, unknown hosts, playlists, credentials, tracking, spoofed audio and oversized streams',async()=>{
  for(const link of ['http://127.0.0.1/x.mp3','https://www.myinstants.com.evil.test/media/sounds/x.mp3','https://name:pass@www.myinstants.com/media/sounds/x.mp3','https://www.myinstants.com/media/sounds/../x.mp3','https://www.myinstants.com/media/sounds/x.mp3?token=secret','https://www.youtube.com/watch?v=example'])assert.throws(()=>sourceURL(link,{audio:true}));
  await assert.rejects(fetchOriginal(ORIGINALS[0].audio,{fetchImpl:async()=>response('not audio')}),/MP3/);
  await assert.rejects(fetchOriginal(ORIGINALS[0].audio,{fetchImpl:async()=>response(Buffer.alloc(2*1024*1024+1))}),/groß/);
  await assert.rejects(fetchOriginal(ORIGINALS[0].audio,{fetchImpl:async()=>response('<html>','text/html')}),/MP3/);
});
test('An unavailable source produces an actionable message instead of a generated replacement voice',async()=>{
  await assert.rejects(fetchOriginal(ORIGINALS[0].audio,{fetchImpl:async()=>new Response('',{status:404})}),/Originaldatei|erreichbar/);
});
test('Imported originals survive a restart, carry exact source and file hashes, and deduplicate repeated requests',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-original-store-')),db={};let fetches=0;
  const source=await mp3(),fetchImpl=async()=>{fetches++;return response(source);};
  try{
    const store=createSoundStore({db,saveDB(){},dataDirectory:folder,fetchImpl});
    const entry=await store.importOriginal('123','Trymacs',ORIGINALS[0].audio,{duration:1,sourcePage:ORIGINALS[0].page});
    assert.equal(entry.source,'original-clip');assert.equal(entry.sourcePage,ORIGINALS[0].page);
    const file=path.join(folder,'mimic-sounds/123',entry.id+'.wav');assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),entry.sha256);
    const restarted=createSoundStore({db,saveDB(){},dataDirectory:folder,fetchImpl});const cached=await restarted.importOriginal('123','Trymacs',ORIGINALS[0].audio,{duration:1});assert.equal(cached.id,entry.id);assert.equal(fetches,1);
    const selected=restarted.list('123','streamers','mixed','original');assert.equal(selected.length,1);const samples=await restarted.load('123',selected[0]);assert.ok(samples.length>0);samples.fill(0);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('Shared preset installation fetches each original once and reuses the verified files on the next lobby',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-preset-')),db={},source=await mp3();let calls=0;
  try{const store=createSoundStore({db,saveDB(){},dataDirectory:folder,fetchImpl:async()=>{calls++;return response(source);}});
    const [a,b]=await Promise.all([store.prepareOriginals('123'),store.prepareOriginals('123')]);assert.equal(a,b);assert.equal(a.loaded.length,5);assert.equal(a.failed.length,0);assert.equal(calls,5);
    await store.prepareOriginals('123');assert.equal(calls,5);assert.equal(store.list('123','custom').length,5);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('Database failure after an import removes the new file and restores the previous catalog',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-import-fail-')),db={},source=await mp3();
  try{const store=createSoundStore({db,saveDB(){throw Error('ENOSPC');},dataDirectory:folder,fetchImpl:async()=>response(source)});
    await assert.rejects(store.importOriginal('123','Original',ORIGINALS[0].audio,{duration:1}),/ENOSPC/);assert.equal(store.list('123','custom').length,0);assert.deepEqual(await fs.readdir(path.join(folder,'mimic-sounds/123')),[]);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('Tampering with an imported file cannot silently replace its recorded original source',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mimic-hash-')),source=await mp3();
  try{const store=createSoundStore({db:{},saveDB(){},dataDirectory:folder,fetchImpl:async()=>response(source)}),entry=await store.importOriginal('123','Original',ORIGINALS[0].audio,{duration:1});
    await fs.writeFile(path.join(folder,'mimic-sounds/123',entry.id+'.wav'),wavEncode(synth([{f:800,d:1}])));await assert.rejects(store.load('123',{...entry,pack:'custom'}),/verändert/);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
function engineFixture(){
  const events=[],captures=[],played=[];let engine,hook;
  const sessionConnection={play:async data=>played.push(Float32Array.from(data)),capture:async ids=>{captures.push([...ids]);return new Map(ids.map(id=>[id,Float32Array.from(reference)]));},close(){},forget(){},interrupt(){}};
  engine=createMimicEngine({sounds:{list:()=>[{id:'test',name:'Original',pack:'streamers',source:'original-clip'}],load:async()=>Float32Array.from(reference)},scorePool:{score:async(a,b)=>scoreMimic(a,b),close(){}},voiceFactory:()=>({connect:async()=>sessionConnection}),quietLeases:{lock:async()=>events.push('lock'),restore:async()=>{events.push('restore');return 0;}},db:{},saveDB(){},delay:async()=>{},random:()=>0,onUpdate:async s=>{events.push(s.phase);if(hook)await hook(s);}});
  const s=engine.create({guildId:'123',voiceChannel:{id:'vc'},host:{id:'A',name:'Alpha'},rounds:3,pack:'streamers',mode:'classic',quiet:true,voiceSource:'original'});engine.join(s,{id:'B',name:'Beta'});
  return {engine,s,events,captures,played,setHook:fn=>hook=fn};
}
test('Replay restores microphone permissions between players and exposes a reaction window for each take',async()=>{
  const f=engineFixture();f.engine.ready(f.s,'A');f.engine.ready(f.s,'B');await f.engine.start(f.s,'A');
  assert.equal(f.events.filter(x=>x==='reaction').length,6);
  for(let i=0;i<f.events.length;i++)if(f.events[i]==='reaction')assert.equal(f.events[i-1],'restore');
  assert.equal(f.s.history.length,3);assert.equal(f.s.samples.size,0);
});
test('A pause requested during a take occurs only after audio has been erased and resumes with fresh rounds',async()=>{
  const f=engineFixture();let paused=false;
  f.setHook(s=>{if(s.phase==='recording'&&s.round===1)f.engine.pause(s,'A');if(s.phase==='paused'){paused=true;assert.equal(s.samples.size,0);assert.equal(s.reference,null);assert.equal(f.captures.length,1);assert.throws(()=>f.engine.pause(s,'B'),/Host/);f.engine.pause(s,'A');}});
  f.engine.ready(f.s,'A');f.engine.ready(f.s,'B');await f.engine.start(f.s,'A');assert.equal(paused,true);assert.equal(f.captures.length,3);assert.equal(f.s.pauseRequested,false);
});
test('Wheel animation precedes actionable sabotage; paused and ended panels serialize with valid component limits',async()=>{
  const f=engineFixture();f.s.mode='chaos';f.engine.ready(f.s,'A');f.engine.ready(f.s,'B');await f.engine.start(f.s,'A');assert.ok(f.events.indexOf('wheel_spin')<f.events.indexOf('wheel'));
  for(const phase of ['lobby','paused','ended']){const payload=panel({...f.s,phase});assert.ok(payload.components.length<=5);for(const row of payload.components)assert.ok(row.toJSON().components.length<=5);payload.embeds[0].toJSON();}
  assert.equal(panel(f.s).components[0].toJSON().components[0].label,'Noch eine Party');
});
function controller({quietPermission=true,failImports=false,holdCapture=false}={}) {
  const messages=[],outputs=[],db={},taken=[],original={id:'a'.repeat(24),name:'Community-Original',category:'streamers',pack:'custom',difficulty:'normal',source:'original-clip',sourcePage:ORIGINALS[0].page,seconds:1.15};
  let imports=0,closed=0,resolveCapture;
  const rights=new PermissionsBitField(Object.values(PermissionsBitField.Flags)),noQuiet=new PermissionsBitField(rights).remove(PermissionsBitField.Flags.Administrator,PermissionsBitField.Flags.ManageChannels);
  const members=new Map(),guild={id:'123',members:{fetch:async id=>members.get(id),fetchMe:async()=>({id:'bot',permissions:quietPermission?rights:noQuiet})}};
  const vc={id:'vc',guild,type:ChannelType.GuildVoice,permissionsFor:m=>m.permissions||rights};
  for(const id of ['A','B'])members.set(id,{id,displayName:id,user:{bot:false},permissions:rights,voice:{channel:vc,channelId:'vc'}});
  const soundStore={list:(gid,pack,difficulty,source)=>{assert.equal(source,'original');return failImports?pack==='streamers'?[]:[{id:'machine',pack:'machines',name:'Alarm'}]:[original];},load:async()=>Float32Array.from(reference),prepareOriginals:async()=>{imports++;return {loaded:failImports?[]:[original],failed:failImports?[{name:'Original',message:'nicht erreichbar'}]:[]};}};
  const audio={play:async()=>{},capture:async ids=>{const result=new Map(ids.map(id=>{const samples=Float32Array.from(reference);taken.push(samples);return [id,samples];}));if(holdCapture)await new Promise(resolve=>{resolveCapture=resolve;});return result;},close:()=>closed++,connection:{once(){},on(){}},forget(){},interrupt(){}};
  const party=createMimicParty({client:{user:{id:'bot'},guilds:{cache:new Map([['123',guild]])}},db,saveDB(){},dataDirectory:'/tmp',isGuildApproved:()=>true,OWNER_ID:'owner',soundStoreFactory:()=>soundStore,micDelay:async()=>{},voiceFactory:()=>({busy:()=>false,connect:async()=>audio})});
  const interaction=(user='A',sub='lobby',values={},customId)=>{const message={id:'panel',edit:async p=>{messages.push(p);return message;}};const i={guild,user:{id:user},memberPermissions:rights,commandName:'mimic',customId,values:values.selection,isChatInputCommand:()=>!customId,
    options:{getSubcommand:()=>sub,getString:k=>values[k]??null,getInteger:k=>values[k]??null,getBoolean:k=>values[k]??null,getNumber:k=>values[k]??null},deferReply:async()=>i.deferred=true,deferUpdate:async()=>i.deferred=true,
    reply:async p=>{i.replied=true;outputs.push(p);messages.push(p);return message;},editReply:async p=>{outputs.push(p);messages.push(p);return message;}};return i;};
  return {party,interaction,messages,outputs,members,db,taken,soundStore,get imports(){return imports;},get closed(){return closed;},releaseCapture:()=>resolveCapture?.(),token:()=>messages.find(p=>p.components?.length)?.components[0].toJSON().components[0].custom_id.split(':')[1]};
}
test('Actual lobby defaults to original voices, prepares its source clips, and automatically enables replay quiet when permitted',async()=>{
  const f=controller();try{await f.party.handleInteraction(f.interaction());assert.equal(f.imports,1);assert.equal(f.party.hasSession('123'),true);const data=f.messages.at(-1).embeds[0].toJSON();assert.ok(JSON.stringify(data).includes('Synthetische Sprachvorlagen sind ausgeschaltet'));assert.ok(JSON.stringify(data).includes('kurz pausiert'));assert.equal(f.messages.at(-1).components.length,5);}finally{await f.party.onShutdown();}
});
test('An inaccessible original pack never silently uses old AI streamer voices',async()=>{
  const f=controller({failImports:true});try{await f.party.handleInteraction(f.interaction('A','lobby',{pack:'streamers'}));assert.equal(f.party.hasSession('123'),false);assert.match(f.outputs.at(-1).content,/Originalclips/);}finally{await f.party.onShutdown();}
});
test('Mic check records only its caller, shares the Voice reservation, closes the connection and erases all audio',async()=>{
  const f=controller({holdCapture:true});try{const pending=f.party.handleInteraction(f.interaction('B','mic'));while(!f.taken.length)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.party.hasSession('123'),true);await f.party.handleInteraction(f.interaction('A','mic'));assert.match(f.outputs.at(-1).content,/freien Voice/);f.releaseCapture();await pending;assert.ok(f.taken.every(a=>a.every(x=>x===0)));assert.equal(f.closed,1);assert.equal(f.party.hasSession('123'),false);assert.match(f.outputs.at(-1).content,/Signal sieht gut/);}finally{await f.party.onShutdown();}
});
test('Mute and denied replay permissions return actionable results without creating unnecessary recordings',async()=>{
  const f=controller({quietPermission:false});try{f.members.get('A').voice.selfMute=true;await f.party.handleInteraction(f.interaction('A','mic'));assert.equal(f.taken.length,0);assert.match(f.outputs.at(-1).content,/Mikrofon/);
    await f.party.handleInteraction(f.interaction('B','lobby',{'replay-ruhe':true}));assert.equal(f.party.hasSession('123'),false);assert.match(f.outputs.at(-1).content,/Pixel braucht/);
    await f.party.handleInteraction(f.interaction('B','lobby'));assert.equal(f.party.hasSession('123'),true);
  }finally{await f.party.onShutdown();}
});
test('New Mimic commands validate with Discord builders, within the 25-subcommand limit',()=>{
  const cmd=buildMimicCommands()[0].toJSON();assert.ok(cmd.options.length<=25);for(const name of ['originals','import','mic','pause'])assert.ok(cmd.options.some(s=>s.name===name));
});
test('Rematch creates a fresh lobby and never silently restores earlier recording consent',async()=>{
  const f=controller();try{
    await f.party.handleInteraction(f.interaction());const token=f.token();
    await f.party.handleInteraction(f.interaction('A','stop'));assert.equal(f.party.hasSession('123'),false);
    const outsider=f.interaction('B','',{},`mim:${token}:rematch`);outsider.memberPermissions=new PermissionsBitField(PermissionsBitField.Flags.ViewChannel);
    await f.party.handleInteraction(outsider);assert.equal(f.party.hasSession('123'),false);assert.match(f.outputs.at(-1).content,/Mitspieler/);
    await f.party.handleInteraction(f.interaction('A','',{},`mim:${token}:rematch`));assert.equal(f.party.hasSession('123'),true);
    const next=f.messages.at(-1),json=JSON.stringify(next.embeds[0].toJSON());assert.ok(json.includes('Spieler · 1/5'));assert.ok(json.includes('Bereit'));
    const newToken=next.components[0].toJSON().components[0].custom_id.split(':')[1];assert.notEqual(newToken,token);assert.equal(f.taken.length,0);
    await f.party.handleInteraction(f.interaction('A','',{},`mim:${token}:rematch`));assert.match(f.outputs.at(-1).content,/abgelaufen/);
  }finally{await f.party.onShutdown();}
});
test('The update preserves all 34 prior modules outside the documented server-action and Mimic changes',async()=>{
  const {spec,previousPixelRelease}=require('./new_mimic_preservation');assert.equal(Object.keys(spec).length,34);
  for(const [name,item]of Object.entries(spec)){const source=previousPixelRelease(name,await fs.readFile(path.join(__dirname,'../src',name),'utf8'));assert.equal(crypto.createHash('sha256').update(source).digest('hex'),item.sha256,name);}
});
test('All 24 portable non-speech sounds match approved existing files exactly and contain no AI voicelines',async()=>{
  const stock=require('../src/mimic_stock');assert.equal(stock.catalog().length,24);
  for(const sound of stock.catalog()){assert.equal(sound.source==='synthetic-speech',false);assert.deepEqual(stock.bundledSound(sound.id),await fs.readFile(path.join(__dirname,'../assets/mimic',sound.id+'.wav')));}
  assert.equal(stock.bundledSound('streamers-spoken-1'),null);
});
test('Missing asset directories cannot disable Mimic: its stock sounds load from the portable source file',async()=>{
  const store=createSoundStore({db:{},saveDB(){},dataDirectory:'/tmp',assetDirectory:'/does-not-exist-pixel-mimic'});
  const sounds=store.list('123','mixed','mixed','original');assert.equal(sounds.length,24);
  for(const sound of sounds){const samples=await store.load('123',sound);assert.ok(samples.length>=6400);samples.fill(0);}
});
