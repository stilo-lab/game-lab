'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const {createSoundStore}=require('../src/mimic_sounds');
const {createNarrator,DEFAULTS,EVENTS}=require('../src/mimic_narrator');
const {createMimicEngine}=require('../src/mimic_engine');
const {buildMimicCommands,createMimicParty}=require('../src/mimic_party');
const {PermissionFlagsBits:P,PermissionsBitField,ChannelType}=require('discord.js');
const {checkInstallation}=require('../src/install_check');
const {synth,wavEncode,RATE}=require('../src/mimic_audio');
const {ffmpegPath}=require('../src/mimic_media');
// Codec fixtures only; these generated test bytes are never distributed as game voices.
const reference=synth([{f:240,d:.55,gap:.1},{f:360,d:.45}]);
let mp3;
async function audio(){if(mp3)return mp3;const dir=await fs.mkdtemp(path.join(os.tmpdir(),'host-codec-'));try{await fs.writeFile(path.join(dir,'in.wav'),wavEncode(reference));execFileSync(ffmpegPath(),['-v','error','-y','-i',path.join(dir,'in.wav'),path.join(dir,'out.mp3')]);mp3=await fs.readFile(path.join(dir,'out.mp3'));return mp3;}finally{await fs.rm(dir,{recursive:true,force:true});}}
const response=(data,type='audio/mpeg')=>new Response(data,{headers:{'content-type':type}});
async function fixture(options={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'host-store-')),db={},bytes=await audio();let downloads=0;const narrator=createNarrator({db,saveDB:options.saveDB||(()=>{}),dataDirectory:dir,fetchImpl:async()=>{downloads++;return response(bytes);}});return {dir,db,narrator,downloads:()=>downloads,clean:()=>fs.rm(dir,{recursive:true,force:true})};}
test('The complete source installation includes ai_runtime and every required core module',()=>assert.deepEqual(checkInstallation(),[]));
test('Missing ai_runtime is reported before startup with an actionable upload instruction',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-startup-'));try{await fs.writeFile(path.join(dir,'index.js'),"require('./ai_runtime'); require('./mimic_party');");assert.deepEqual(checkInstallation(dir),['ai_runtime.js']);await fs.copyFile(path.join(__dirname,'../src/install_check.js'),path.join(dir,'install_check.js'));const r=spawnSync(process.execPath,[path.join(dir,'install_check.js')],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/src\/ai_runtime.js/);assert.match(r.stderr,/ALLE Dateien/);assert.doesNotMatch(r.stderr,/MODULE_NOT_FOUND/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Startup reaches the configuration check rather than MODULE_NOT_FOUND without a token or Discord login',()=>{
  const env={...process.env};delete env.DISCORD_TOKEN;delete env.OWNER_ID;
  const r=spawnSync(process.execPath,['src/index.js'],{cwd:path.join(__dirname,'..'),env,encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.match(r.stderr,/DISCORD_TOKEN und OWNER_ID/);assert.doesNotMatch(r.stderr,/MODULE_NOT_FOUND|Cannot find module/);
});
test('Recordings mode excludes all generated tones and synthetic voices, even when assets exist',()=>{
  const db={mimic:{sounds:{'123':[{id:'a',name:'Take',category:'voices',source:'upload'},{id:'b',name:'Clip',category:'gaming',source:'original-clip'},{id:'c',name:'AI',category:'voices',source:'synthetic-speech'},{id:'d',name:'Host',category:'voices',source:'original-clip',role:'announcer'}]}}};const store=createSoundStore({db,saveDB(){},dataDirectory:'/tmp'});assert.deepEqual(store.list('123','mixed','mixed','recordings').map(x=>x.id),['a','b']);assert.equal(store.list('456','mixed','mixed','recordings').length,0);
});
test('Recordings mode cannot replace a missing original pack with generated stock sounds',()=>{
  const store=createSoundStore({db:{},saveDB(){},dataDirectory:'/tmp',assetDirectory:'/no-mimic-assets-here'});assert.equal(store.list('123','mixed','mixed','recordings').length,0);assert.equal(store.list('123','mixed','mixed','all').length,24);
});
test('Narrator presets import MP3 recordings once, retain source links and verify cache bytes after restart',async()=>{
  const f=await fixture();try{const [a,b]=await Promise.all([f.narrator.prepare('123'),f.narrator.prepare('123')]);assert.equal(a,b);assert.equal(a.loaded.length,4);assert.equal(a.failed.length,0);assert.equal(f.downloads(),4);await f.narrator.prepare('123');assert.equal(f.downloads(),4);
    const next=createNarrator({db:f.db,saveDB(){},dataDirectory:f.dir,fetchImpl:async()=>{throw Error('unexpected network');}});assert.equal((await next.prepare('123')).loaded.length,4);for(const clip of DEFAULTS){assert.equal(next.status('123').clips[clip.event].sourcePage,clip.page);const samples=await next.load('123',clip.event);assert.ok(samples.length>=6400);samples.fill(0);}
  }finally{await f.clean();}
});
test('Spoken playback uses saved original audio, caps the level and erases the playback copy',async()=>{
  const f=await fixture();try{await f.narrator.prepare('123');let buffer,peak=0;const s={guildId:'123',narration:true,abort:new AbortController(),connection:{play:async data=>{buffer=data;for(const x of data)peak=Math.max(peak,Math.abs(x));}}};assert.equal(await f.narrator.say(s,'record'),true);assert.ok(peak>.01&&peak<=.60001);assert.ok(buffer.every(x=>x===0));assert.equal(await f.narrator.say(s,'wheel'),false);assert.equal(f.downloads(),4);}finally{await f.clean();}
});
test('Disabling a narrator never downloads or plays a generated substitute',async()=>{
  const f=await fixture();try{f.narrator.enable('123',false);assert.equal((await f.narrator.prepare('123')).enabled,false);assert.equal(f.downloads(),0);assert.equal(await f.narrator.say({guildId:'123',narration:true,abort:new AbortController(),connection:{play(){assert.fail('disabled narrator played');}}},'record'),false);}finally{await f.clean();}
});
test('Narrator download failure stays separate from the templates and never manufactures a voice',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'host-unavailable-'));try{const n=createNarrator({db:{},saveDB(){},dataDirectory:dir,fetchImpl:async()=>new Response('',{status:404})});const r=await n.prepare('123');assert.equal(r.loaded.length,0);assert.equal(r.failed.length,4);assert.deepEqual(n.status('123').clips,{});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('A server can upload its own German narrator clip and later preset loading preserves it',async()=>{
  const f=await fixture();try{const n=createNarrator({db:f.db,saveDB(){},dataDirectory:f.dir,fetchImpl:async url=>String(url).includes('discordapp')?response(wavEncode(reference),'audio/wav'):response(await audio())});const clip=await n.install('123','record',{attachment:{name:'los.wav',url:'https://cdn.discordapp.com/attachments/own.wav',size:20000},duration:1});assert.equal(clip.source,'upload');const hash=clip.sha256;await n.prepare('123');assert.equal(n.status('123').clips.record.sha256,hash);assert.equal(n.status('123').clips.record.isDefault,false);}finally{await f.clean();}
});
test('Invalid narrator events, private URLs, two inputs and oversized Discord attachments are rejected',async()=>{
  const f=await fixture();try{await assert.rejects(f.narrator.install('123','../../data',{link:DEFAULTS[0].audio}),/Ungültige/);await assert.rejects(f.narrator.install('123','record',{}),/Genau eine/);await assert.rejects(f.narrator.install('123','record',{link:DEFAULTS[0].audio,attachment:{}}),/Genau eine/);await assert.rejects(f.narrator.install('123','record',{attachment:{name:'file.wav',size:2*1024*1024+1,url:'https://cdn.discordapp.com/x'}}),/2 MB/);await assert.rejects(f.narrator.install('123','record',{link:'https://127.0.0.1/file.mp3'}),/Myinstants/);assert.equal(f.downloads(),0);}finally{await f.clean();}
});
test('Failed narrator replacement restores both the original file and database metadata',async()=>{
  const f=await fixture();try{await f.narrator.prepare('123');const before=await fs.readFile(path.join(f.dir,'mimic-narrator/123/record.wav')),saved=f.narrator.status('123').clips.record;const n=createNarrator({db:f.db,saveDB(){throw Error('disk full');},dataDirectory:f.dir,fetchImpl:async()=>response(await audio())});await assert.rejects(n.install('123','record',{link:DEFAULTS[0].audio,duration:.8}),/disk full/);assert.deepEqual(n.status('123').clips.record,saved);assert.deepEqual(await fs.readFile(path.join(f.dir,'mimic-narrator/123/record.wav')),before);}finally{await f.clean();}
});
function engineFixture({broken=false,narratorFailure=false}={}){
  const log=[],takes=[];let captureActive=false;
  const conn={play:async samples=>{assert.equal(captureActive,false);log.push(['play',samples.length]);},capture:async ids=>{captureActive=true;log.push(['capture']);const map=new Map(ids.map(id=>{const take=Float32Array.from(reference);takes.push(take);return[id,take];}));captureActive=false;return map;},close(){log.push(['close']);},forget(){},interrupt(){}};
  const host={say:async(s,event)=>{assert.equal(captureActive,false);log.push(['host',event,s.phase]);if(narratorFailure)throw Error('missing clip');await s.connection.play(new Float32Array(8000).fill(.1));return true;}};
  const clips=[...(broken?[{id:'broken',name:'Missing',source:'original-clip',pack:'voices'}]:[]),{id:'ok',name:'Voice',source:'original-clip',pack:'voices'}];
  const engine=createMimicEngine({sounds:{list:()=>clips,load:async(_,clip)=>{if(clip.id==='broken')throw Error('ENOENT');return Float32Array.from(reference);}},narrator:host,scorePool:{score:async()=>({score:90,status:'ok',melody:90,rhythm:90,attacks:90}),close(){}},voiceFactory:()=>({connect:async()=>conn}),quietLeases:{lock:async()=>{},restore:async()=>0},db:{},saveDB(){},delay:async()=>{},random:()=>0});
  const s=engine.create({guildId:'123',voiceChannel:{id:'vc'},host:{id:'A',name:'Alpha'},rounds:3,pack:'voices',mode:'classic',voiceSource:'recordings',narration:true});engine.ready(s,'A');return {engine,s,log,takes};
}
test('Human Start and Finish bracket each capture; countdown contains no generated beeps in recordings mode',async()=>{
  const f=engineFixture();await f.engine.start(f.s,'A');for(let i=0;i<f.log.length;i++)if(f.log[i][0]==='capture'){assert.equal(f.log[i-2][1],'record');assert.equal(f.log[i+1][1],'stop');}assert.equal(f.log.filter(x=>x[0]==='capture').length,3);assert.equal(f.log.some(x=>x[0]==='host'&&x[1]==='win'),true);assert.equal(f.log.filter(x=>x[0]==='play'&&x[1]===1600).length,0);assert.ok(f.takes.every(x=>x.every(v=>v===0)));assert.equal(f.s.history.length,3);
});
test('Missing narration never stops a round, and broken template files are skipped without generated replacements',async()=>{
  const f=engineFixture({broken:true,narratorFailure:true});await f.engine.start(f.s,'A');assert.equal(f.s.history.length,3);assert.equal(f.s.unavailable.has('broken'),true);assert.equal(f.s.sound.id,'ok');assert.equal(f.s.narratorError,'missing clip');assert.ok(f.takes.every(x=>x.every(v=>v===0)));
});
test('Spoken host commands and options serialize inside Discord limits',()=>{
  const cmd=buildMimicCommands()[0].toJSON();assert.ok(cmd.options.length<=25);for(const sub of ['spielleiter','ansage'])assert.ok(cmd.options.some(x=>x.name===sub));assert.ok(EVENTS.length<=25);assert.ok(cmd.options.find(x=>x.name==='lobby').options.some(x=>x.name==='spielleiter'));
});
function controller(){
  const writes=[],messages=[],rights=new PermissionsBitField([P.ViewChannel,P.Connect,P.Speak,P.ManageGuild]);
  const guild={id:'123',members:{fetch:async id=>({id,user:{bot:false},displayName:id,voice:{channel:vc,channelId:'vc'},permissions:rights}),fetchMe:async()=>({permissions:rights})}},vc={id:'vc',guild,type:ChannelType.GuildVoice,permissionsFor:()=>rights};
  const host={status:()=>({enabled:true,clips:{record:{event:'record'}}}),prepare:async()=>({loaded:[{event:'record'}],failed:[]}),say:async()=>false,enable:(...args)=>writes.push(['enable',...args]),install:async(gid,event)=>{writes.push(['install',gid,event]);return{event};},load:async()=>Float32Array.from(reference)};
  const store={list:(_gid,_pack,_difficulty,source)=>{assert.equal(source,'recordings');return[{id:'template',name:'Original',source:'original-clip',pack:'voices'}];},prepareOriginals:async()=>({loaded:[{id:'template'}],failed:[]})};
  const party=createMimicParty({client:{guilds:{cache:new Map([['123',guild]])}},db:{},saveDB(){},dataDirectory:'/tmp',isGuildApproved:()=>true,OWNER_ID:'owner',narratorFactory:()=>host,soundStoreFactory:()=>store,voiceFactory:()=>({busy:()=>false})});
  const interaction=(sub,values={},manager=true)=>{
    const i={guild,user:{id:'A'},memberPermissions:manager?rights:new PermissionsBitField(P.ViewChannel),commandName:'mimic',isChatInputCommand:()=>true,options:{getSubcommand:()=>sub,getString:key=>values[key]??null,getNumber:key=>values[key]??null,getInteger:key=>values[key]??null,getBoolean:key=>values[key]??null,getAttachment:key=>values[key]??null},deferReply:async()=>i.deferred=true,reply:async p=>{messages.push(p);i.replied=true;},editReply:async p=>{messages.push(p);return{id:'panel',edit:async q=>messages.push(q)};}};return i;
  };
  return {party,writes,messages,interaction};
}
test('Narrator installation and server enable settings require management before performing writes',async()=>{
  const f=controller();try{await f.party.handleInteraction(f.interaction('ansage',{phase:'record',link:DEFAULTS[0].audio},false));assert.equal(f.writes.length,0);assert.match(f.messages.at(-1).content,/Server verwalten/);
    await f.party.handleInteraction(f.interaction('spielleiter',{aktiv:false},false));assert.equal(f.writes.length,0);
    await f.party.handleInteraction(f.interaction('ansage',{phase:'record',link:DEFAULTS[0].audio}));assert.deepEqual(f.writes,[['install','123','record']]);await f.party.handleInteraction(f.interaction('spielleiter',{aktiv:false}));assert.deepEqual(f.writes.at(-1),['enable','123',false]);
  }finally{await f.party.onShutdown();}
});
test('The actual default lobby uses recordings and narration; a duplicate lobby does not start another preparation',async()=>{
  const f=controller();try{await f.party.handleInteraction(f.interaction('lobby'));assert.equal(f.party.hasSession('123'),true);const json=JSON.stringify(f.messages.at(-1).embeds[0].toJSON());assert.ok(json.includes('Keine erzeugten'));assert.ok(json.includes('gespeicherte Sprachansagen'));await f.party.handleInteraction(f.interaction('lobby'));assert.match(f.messages.at(-1).content,/schon eine Voice-Party/);}finally{await f.party.onShutdown();}
});
test('The update preserves all 37 previous source modules outside its documented Mimic improvements',async()=>{
  const {spec,previousNewMimicRelease}=require('./mimic_host_preservation');assert.equal(Object.keys(spec).length,37);for(const[name,item]of Object.entries(spec)){const text=previousNewMimicRelease(name,await fs.readFile(path.join(__dirname,'../src',name),'utf8'));assert.equal(crypto.createHash('sha256').update(text).digest('hex'),item.sha256,name);}
});
