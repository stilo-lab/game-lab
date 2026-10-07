'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const {CATEGORIES,PACKS,categoriesFor}=require('../src/mimic_categories'),{createSoundStore}=require('../src/mimic_sounds'),{createMimicEngine}=require('../src/mimic_engine'),{synth,wavEncode}=require('../src/mimic_audio'),{scoreMimic}=require('../src/mimic_score'),{decodeMedia,ffmpegPath}=require('../src/mimic_media');
const reference=synth([{f:220,d:.4,gap:.1},{f:330,d:.4}]);
function engineFixture(){
  const db={},store=createSoundStore({db,saveDB(){},dataDirectory:'/tmp'}),played=[];
  const engine=createMimicEngine({sounds:store,scorePool:{score:async(a,b)=>scoreMimic(a,b),close(){}},voiceFactory:()=>({connect:async()=>({play:async()=>{},capture:async ids=>new Map(ids.map(id=>[id,new Float32Array()])),close(){},forget(){}})}),quietLeases:{restore:async()=>0},db,saveDB(){},onUpdate:async s=>{if(s.phase==='reference')played.push(s.sound);},delay:async()=>{},random:()=>0});
  const s=engine.create({guildId:'123',voiceChannel:{id:'vc'},host:{id:'A',name:'Alpha'},rounds:10,pack:'party',mode:'classic',quiet:false});return {engine,s,store,played};
}
test('Ten categories, party preset and custom combinations reject unknown selections',()=>{
  assert.equal(CATEGORIES.length,10);assert.deepEqual(categoriesFor('party'),['streamers','memes','gaming']);assert.equal(categoriesFor('mixed').length,10);assert.deepEqual(categoriesFor(['streamers','memes','streamers']),['streamers','memes']);
  for(const value of ['bad',[],['bad'],Array(6).fill('memes')])assert.throws(()=>categoriesFor(value));assert.ok(PACKS.length<=25);
});
test('All 104 packaged sounds are real playable audio with matching provenance and 56 speech clips',async()=>{
  const store=createSoundStore({db:{},saveDB(){},dataDirectory:'/tmp'}),list=store.list('123');assert.equal(list.length,104);assert.equal(new Set(list.map(s=>s.id)).size,104);let spoken=0;
  for(const clip of list){
    const data=await store.load('123',clip);assert.ok(data.length>=6400&&data.length<=96000,clip.id);assert.ok(data.some(x=>Math.abs(x)>.01));assert.equal(scoreMimic(data,data).score,100,clip.id);assert.ok(['easy','normal','hard'].includes(clip.difficulty));
    if(clip.sha256)assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname,'../assets/mimic',`${clip.id}.wav`))).digest('hex'),clip.sha256);
    if(clip.source==='synthetic-speech'){spoken++;assert.ok(clip.text.length>1&&clip.voice);}
  }
  assert.equal(spoken,56);for(const cat of CATEGORIES){const clips=store.list('123',cat.value);assert.ok(clips.length>=8);assert.ok(clips.some(x=>x.difficulty==='easy'));assert.ok(clips.some(x=>x.difficulty==='hard'));}
});
test('Custom meme category upload persists, mixes once, respects difficulty and preserves legacy clips',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-cats-'));const db={mimic:{sounds:{'123':[{id:'a'.repeat(24),name:'Legacy',seconds:1}]},stats:{'123':{wins:7}}}};
  const store=createSoundStore({db,saveDB(){},dataDirectory:dir,fetchImpl:async()=>new Response(wavEncode(reference))});
  try{
    const before=store.list('123','memes').length,clip=await store.upload('123','Meme',{name:'meme.wav',size:100,url:'https://cdn.discordapp.com/meme'},{category:'memes',difficulty:'hard'});
    assert.equal(store.list('123','memes').length,before+1);assert.equal(store.list('123',['memes','custom']).filter(x=>x.id===clip.id).length,1);assert.equal(store.list('456','memes').length,before);assert.ok(store.list('123','memes','hard').some(x=>x.id===clip.id));assert.ok(!store.list('123','memes','easy').some(x=>x.id===clip.id));assert.equal(store.list('123','custom').length,2);assert.equal(db.mimic.stats['123'].wins,7);assert.equal(db.mimic.sounds['123'][0].name,'Legacy');
    const reloaded=createSoundStore({db:JSON.parse(JSON.stringify(db)),saveDB(){},dataDirectory:dir});assert.equal(reloaded.list('123','custom').length,2);await store.remove('123',clip.id);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Category and difficulty configure is host-locked, resets readiness and rejects empty/unknown mix',async()=>{
  const {engine,s}=engineFixture();engine.join(s,{id:'B',name:'Beta'});engine.ready(s,'A');engine.ready(s,'B');assert.throws(()=>engine.configure(s,'B',{pack:['memes']}),/Host/);assert.equal(s.players.get('A').ready,true);
  engine.configure(s,'A',{pack:['anime','memes'],difficulty:'hard'});assert.deepEqual(s.pack,['anime','memes']);assert.ok([...s.players.values()].every(p=>!p.ready));assert.throws(()=>engine.configure(s,'A',{pack:'custom'}),/keine/);assert.deepEqual(s.pack,['anime','memes']);assert.throws(()=>engine.configure(s,'A',{difficulty:'impossible'}));assert.throws(()=>engine.configure(s,'A',{pack:['invalid']}));await engine.stop('123');
});
test('Voting keeps one vote per participant, removes departed votes and only host applies',async()=>{
  const {engine,s}=engineFixture();for(const id of ['B','C','D'])engine.join(s,{id,name:id});engine.vote(s,'A','memes');engine.vote(s,'A','streamers');engine.vote(s,'B','memes');engine.vote(s,'C','memes');engine.vote(s,'D','anime');assert.equal(s.votes.size,4);assert.throws(()=>engine.vote(s,'outsider','memes'));assert.throws(()=>engine.applyVotes(s,'B'),/Host/);
  await engine.leave(s,'D');assert.equal(s.votes.has('D'),false);assert.deepEqual(engine.applyVotes(s,'A'),['memes','streamers']);assert.deepEqual(s.pack,['memes','streamers']);await engine.stop('123');
});
test('Mixed rounds visit all ten categories and never repeat a sound before exhausting the mix',async()=>{
  const {engine,s,played}=engineFixture();engine.configure(s,'A',{pack:'mixed'});engine.ready(s,'A');await engine.start(s,'A');assert.equal(played.length,10);assert.equal(new Set(played.map(x=>x.pack)).size,10);assert.equal(new Set(played.map(x=>x.id)).size,10);assert.equal(s.phase,'ended');
});
test('A delayed recording-panel edit cannot postpone the shared microphone capture',async()=>{
  let recording=false,captures=0;
  const db={},sounds=createSoundStore({db,saveDB(){},dataDirectory:'/tmp'});
  const engine=createMimicEngine({sounds,scorePool:{score:async(a,b)=>scoreMimic(a,b),close(){}},voiceFactory:()=>({connect:async()=>({play:async()=>{},capture:async ids=>{recording=true;captures++;return new Map(ids.map(id=>[id,new Float32Array()]));},close(){}})}),quietLeases:{restore:async()=>0},db,saveDB(){},delay:async()=>{},random:()=>0,
    onUpdate:async s=>{if(s.phase==='countdown')recording=false;if(s.phase==='recording'){assert.equal(recording,true);await Promise.resolve();}}
  });
  const s=engine.create({guildId:'123',voiceChannel:{id:'vc'},host:{id:'A',name:'Alpha'},rounds:3,pack:'memes',mode:'classic'});
  engine.ready(s,'A');await engine.start(s,'A');assert.equal(captures,3);assert.match(s.note,/Party abgeschlossen/);
});
test('Hard party preset contains only requested categories and locks voting while running',async()=>{
  const {engine,s,played}=engineFixture();engine.configure(s,'A',{pack:'party',difficulty:'hard'});engine.ready(s,'A');const task=engine.start(s,'A');assert.throws(()=>engine.configure(s,'A',{pack:'anime'}),/gesperrt/);assert.throws(()=>engine.vote(s,'A','memes'));await task;assert.ok(played.every(x=>['streamers','memes','gaming'].includes(x.pack)&&x.difficulty==='hard'));
});
test('Actual MP3 and OGG uploads decode locally; explicit excerpt cuts a longer recording',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-media-'));const wav=path.join(directory,'clip.wav');await fs.writeFile(wav,wavEncode(reference));
  try{
    for(const format of ['mp3','ogg']){const file=path.join(directory,`clip.${format}`);execFileSync(ffmpegPath(),['-v','error','-y','-i',wav,file]);const data=await decodeMedia(await fs.readFile(file),format);assert.ok(scoreMimic(reference,data).score>=90,format);}
    const long=synth([{f:220,d:8}]);const excerpt=await decodeMedia(wavEncode(long),'wav',{start:2,duration:1});assert.ok(excerpt.length>=15900&&excerpt.length<=16100);assert.ok(excerpt.some(x=>Math.abs(x)>.1));await assert.rejects(decodeMedia(wavEncode(long),'wav'));
    const full=path.join(directory,'long.wav'),mp3=path.join(directory,'long.mp3');await fs.writeFile(full,wavEncode(long));execFileSync(ffmpegPath(),['-v','error','-y','-i',full,mp3]);await assert.rejects(decodeMedia(await fs.readFile(mp3),'mp3'),/6|sechs|Sekunden/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Media rejects playlists, misleading extensions, invalid ranges and malformed compressed audio',async()=>{
  for(const [bytes,extension,range]of [[Buffer.from('#EXTM3U\nhttps://example.test/file.mp3'),'mp3',{}],[wavEncode(reference),'exe',{}],[wavEncode(reference),'mp3',{}],[Buffer.from('fake'),'ogg',{}],[wavEncode(reference),'wav',{start:-1}],[wavEncode(reference),'wav',{duration:7}]])await assert.rejects(decodeMedia(bytes,extension,range));
});

function controllerFixture({botQuietDenied=false}={}){
  const {createMimicParty}=require('../src/mimic_party'),{ChannelType,PermissionFlagsBits:P}=require('discord.js');const messages=[],outputs=[];let voiceCalls=0;
  const members=new Map();const guild={id:'123',members:{fetch:async id=>members.get(id),fetchMe:async()=>({id:'bot'})}},vc={id:'vc',type:ChannelType.GuildVoice,guild,permissionsFor:()=>({has:flag=>!botQuietDenied||flag!==P.ManageChannels})};
  for(const id of ['A','B'])members.set(id,{id,displayName:id,user:{bot:false},voice:{channel:vc,channelId:'vc'}});
  const party=createMimicParty({client:{guilds:{cache:new Map([['123',guild]])}},db:{},saveDB(){},dataDirectory:'/tmp',isGuildApproved:()=>true,OWNER_ID:'owner',voiceFactory:()=>({busy:()=>false,connect:async(_,signal)=>{voiceCalls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}})});
  function interaction(user='A',command='lobby',values={},customId){
    const message={id:'panel',edit:async payload=>{messages.push(payload);return message;}};
    const i={guild,user:{id:user},memberPermissions:{has:flag=>user==='A'&&[P.ManageGuild,P.ManageChannels].includes(flag)},commandName:'mimic',customId,values:values.selection,isChatInputCommand:()=>!customId,
      options:{getSubcommand:()=>command,getString:name=>values[name]??null,getInteger:name=>values[name]??null,getBoolean:name=>values[name]??null,getNumber:name=>values[name]??null},
      deferReply:async()=>{i.deferred=true;},deferUpdate:async()=>{i.deferred=true;},reply:async p=>{i.replied=true;outputs.push(p);messages.push(p);return message;},editReply:async p=>{outputs.push(p);messages.push(p);return message;}};return i;
  }
  return {party,messages,outputs,interaction,get voiceCalls(){return voiceCalls;},token:()=>messages.find(p=>p.components?.length)?.components[0].toJSON().components[0].custom_id.split(':')[1]};
}
test('Real lobby selectors serialize within five Discord rows and protect host category selection',async()=>{
  const f=controllerFixture();try{
    await f.party.handleInteraction(f.interaction());const token=f.token(),payload=f.messages.at(-1);assert.equal(payload.components.length,5);for(const row of payload.components)for(const c of row.toJSON().components){assert.ok(c.custom_id.length<=100);if(c.options)assert.ok(c.options.length<=25);}
    await f.party.handleInteraction(f.interaction('B','',{},`mim:${token}:join`));await f.party.handleInteraction(f.interaction('A','',{},`mim:${token}:ready`));
    await f.party.handleInteraction(f.interaction('B','',{selection:['memes']},`mim:${token}:packs`));assert.match(f.outputs.at(-1).content,/Host/);
    await f.party.handleInteraction(f.interaction('A','',{selection:['memes','anime']},`mim:${token}:packs`));const newPanel=f.messages.at(-1).embeds[0].toJSON();assert.ok(JSON.stringify(newPanel).includes('Internet-Memes'));assert.ok(JSON.stringify(newPanel).includes('Anime'));assert.equal(f.voiceCalls,0);
    await f.party.handleInteraction(f.interaction('A','',{selection:['memes']},`mim:${token}:ballot`));assert.match(f.messages.at(-1).embeds[0].toJSON().fields.find(x=>x.name.includes('Wunsch')).value,/1 Stimme/);
  }finally{await f.party.onShutdown();}
});
test('Replay quiet needs only bot channel rights and reports missing bot rights before opening a lobby',async()=>{
  const f=controllerFixture();try{await f.party.handleInteraction(f.interaction('B','lobby',{'replay-ruhe':true}));assert.equal(f.party.hasSession('123'),true);assert.equal(f.voiceCalls,0);}finally{await f.party.onShutdown();}
  const g=controllerFixture({botQuietDenied:true});try{await g.party.handleInteraction(g.interaction('B','lobby',{'replay-ruhe':true}));assert.equal(g.party.hasSession('123'),false);assert.match(g.outputs.at(-1).content,/Pixel braucht/);}finally{await g.party.onShutdown();}
});
test('Real catalog and preview use packaged speech audio and reject foreign or path-traversal IDs',async()=>{
  const f=controllerFixture();try{
    await f.party.handleInteraction(f.interaction('A','packs'));assert.match(f.outputs.at(-1).content,/Streamer-Memes/);assert.ok(f.outputs.at(-1).content.length<2000);
    await f.party.handleInteraction(f.interaction('A','sounds',{pack:'memes',seite:1}));assert.match(f.outputs.at(-1).content,/memes-spoken/);
    await f.party.handleInteraction(f.interaction('A','preview',{id:'memes-spoken-1'}));const payload=f.outputs.at(-1);assert.ok(payload.files[0].attachment.length>44);assert.equal(payload.files[0].attachment.toString('ascii',0,4),'RIFF');
    for(const id of ['../db','a'.repeat(24),'unknown']){await f.party.handleInteraction(f.interaction('A','preview',{id}));assert.match(f.outputs.at(-1).content,/nicht gefunden/);}assert.equal(f.voiceCalls,0);
  }finally{await f.party.onShutdown();}
});
test('Controller rejects stale category menus and blocks pre-listening after the game starts',async()=>{
  const f=controllerFixture();try{
    await f.party.handleInteraction(f.interaction());const token=f.token();await f.party.handleInteraction(f.interaction('A','',{selection:['memes']},'mim:expired:packs'));assert.match(f.outputs.at(-1).content,/abgelaufen/);
    await f.party.handleInteraction(f.interaction('A','',{},`mim:${token}:ready`));await f.party.handleInteraction(f.interaction('A','start'));
    await f.party.handleInteraction(f.interaction('A','preview',{id:'memes-spoken-1'}));assert.match(f.outputs.at(-1).content,/gesperrt/);await f.party.handleInteraction(f.interaction('A','',{selection:['memes']},`mim:${token}:packs`));assert.match(f.outputs.at(-1).content,/gesperrt/);
  }finally{await f.party.onShutdown();}
});
test('Every source unrelated to categories remains byte-identical to Mimic 1.9.0',async()=>{
  const baseline=require('./fixtures/meme-untouched.json');for(const [file,hash]of Object.entries(baseline))assert.equal(crypto.createHash('sha256').update(require('./permissions_preservation').previousMimicRelease(file,await fs.readFile(path.join(__dirname,'../src',file),'utf8'))).digest('hex'),hash,file);
});
