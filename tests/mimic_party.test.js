'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMimicEngine,CARDS}=require('../src/mimic_engine');const {buildMimicCommands,panel,createMimicParty}=require('../src/mimic_party');
const {synth}=require('../src/mimic_audio');const {scoreMimic}=require('../src/mimic_score');
const ref=synth([{f:220,d:.3,gap:.1},{f:330,d:.3,gap:.1},{f:440,d:.4}]);
function harness(overrides={}){
  const events=[],takes=[],db={},sent=[],captureIds=[];let closes=0,saves=0,hook;
  const h={db,events,takes,sent,captureIds,hook:fn=>{hook=fn;},get closes(){return closes;},get saves(){return saves;}};
  const audio={play:async data=>sent.push(Float32Array.from(data)),capture:async ids=>{captureIds.push([...ids]);return new Map(ids.map(id=>{const take=Float32Array.from(ref);takes.push(take);return[id,take];}));},close:()=>{closes++;},forget:id=>events.push(`forget:${id}`),interrupt:()=>events.push('interrupt')};
  h.audio=audio;
  const engine=createMimicEngine({sounds:{list:()=>[{id:'test',name:'Test'}],load:async()=>Float32Array.from(ref)},scorePool:{score:async(a,b)=>scoreMimic(a,b),close(){}},voiceFactory:()=>({connect:async()=>audio}),quietLeases:{lock:async()=>events.push('lock'),restore:async()=>{events.push('restore');return 0;}},db,saveDB(){saves++;},onUpdate:async s=>{events.push(s.phase);if(hook)await hook(s);},delay:async(ms,signal)=>{if(signal.aborted)throw Error('aborted');},random:()=>0,...overrides});
  const create=()=>engine.create({guildId:'123',voiceChannel:{id:'vc'},host:{id:'A',name:'Alpha'},rounds:3,pack:'mixed',mode:'classic',quiet:true});
  return Object.assign(h,{engine,create});
}
test('Slash command serializes all game controls without exceeding Discord limits',()=>{
  const cmd=buildMimicCommands()[0].toJSON();assert.equal(cmd.name,'mimic');assert.ok(cmd.options.length<=25);assert.ok(cmd.options.some(s=>s.name==='preview'));assert.ok(cmd.options.some(s=>s.name==='packs'));for(const option of cmd.options){assert.ok(option.description.length<=100);for(const child of option.options||[])assert.ok(child.description.length<=100);}
});
test('Consent, readiness, host control, max five and duplicate starts are enforced',async()=>{
  const h=harness(),s=h.create();assert.throws(()=>h.engine.start(s,'A'),/Bereit/);for(const id of ['B','C','D','E'])h.engine.join(s,{id,name:id});assert.throws(()=>h.engine.join(s,{id:'F',name:'F'}),/voll/);h.engine.join(s,{id:'B',name:'B'});
  for(const id of s.players.keys())h.engine.ready(s,id);assert.throws(()=>h.engine.start(s,'B'),/Host/);
  const task=h.engine.start(s,'A');assert.throws(()=>h.engine.start(s,'A'),/bereits/);assert.throws(()=>h.engine.join(s,{id:'Z',name:'Z'}),/läuft/);await task;assert.equal(h.closes,1);
});
test('Three complete rounds score actual takes, replay each player, erase audio and save once',async()=>{
  const h=harness(),s=h.create();h.engine.join(s,{id:'B',name:'Beta'});h.engine.ready(s,'A');h.engine.ready(s,'B');await h.engine.start(s,'A');
  assert.equal(h.engine.hasSession('123'),false);assert.equal(s.phase,'ended');assert.equal(s.history.length,3);assert.equal(s.players.get('A').total,300);assert.equal(s.players.get('B').total,300);assert.equal(h.saves,1);assert.equal(h.closes,1);assert.ok(h.takes.every(t=>t.every(x=>x===0)));assert.ok(h.captureIds.every(ids=>ids.join(',')==='A,B'));assert.equal(h.db.mimic.stats['123'].players.A.wins,1);
  assert.ok(h.events.indexOf('reference')<h.events.indexOf('recording'));assert.ok(h.events.indexOf('recording')<h.events.indexOf('replay'));
});
test('Chaos wheel applies one-shot sabotage next round and reveals attacker in replay',async()=>{
  const h=harness({random:max=>max===CARDS.length?CARDS.indexOf('echo'):0}),s=h.create();s.mode='chaos';h.engine.join(s,{id:'B',name:'Beta'});h.engine.ready(s,'A');h.engine.ready(s,'B');let attacked=0;
  h.hook(async state=>{if(state.phase==='wheel'){h.engine.attack(s,'A','B',s.round);attacked++;assert.throws(()=>h.engine.attack(s,'A','B',s.round));assert.throws(()=>h.engine.attack(s,'B','B',s.round));}if(state.phase==='replay'&&state.round===2)assert.equal(state.roundResults.find(r=>r.id==='B').attacker,'A');});
  await h.engine.start(s,'A');assert.equal(attacked,2);assert.ok(s.history[1].find(r=>r.id==='B').score<100);assert.equal(s.players.get('A').total,300);
});
test('Shield blocks a next-round sabotage; multiplier rewards actual score only',async()=>{
  let turn=0;const h=harness({random:max=>max===CARDS.length?[CARDS.indexOf('echo'),CARDS.indexOf('shield'),CARDS.indexOf('double'),CARDS.indexOf('bonus')][turn++%4]:0}),s=h.create();s.mode='chaos';h.engine.join(s,{id:'B',name:'Beta'});h.engine.ready(s,'A');h.engine.ready(s,'B');
  h.hook(async state=>{if(state.phase==='wheel'&&state.round===1)h.engine.attack(s,'A','B',1);});await h.engine.start(s,'A');assert.equal(s.history[1].find(r=>r.id==='B').score,100);assert.equal(s.history[2].find(r=>r.id==='A').points,200);assert.equal(s.players.get('B').total,315);
});
test('No microphone signal earns zero even when a fart sabotage replaces audio',async()=>{
  const h=harness({random:max=>max===CARDS.length?CARDS.indexOf('fart'):0}),s=h.create();s.mode='chaos';h.engine.join(s,{id:'B',name:'Beta'});h.engine.ready(s,'A');h.engine.ready(s,'B');h.audio.capture=async ids=>new Map(ids.map(id=>[id,id==='B'?new Float32Array(ref.length):Float32Array.from(ref)]));
  h.hook(async state=>{if(state.phase==='wheel')h.engine.attack(s,'A','B',s.round);});await h.engine.start(s,'A');assert.equal(s.players.get('B').total,0);assert.ok(s.history.every(round=>round.find(r=>r.id==='B').score===0));
});
test('Aborting an active capture releases connection, clears takes and never saves partial stats',async()=>{
  const h=harness(),s=h.create();h.engine.ready(s,'A');let capturing;const started=new Promise(resolve=>{capturing=resolve;});h.audio.capture=async()=>{capturing();await new Promise(resolve=>s.abort.signal.addEventListener('abort',resolve,{once:true}));throw Error('aborted');};
  const task=h.engine.start(s,'A');await started;await h.engine.stop('123','Stopped');await task;assert.equal(h.closes,1);assert.equal(h.saves,0);assert.equal(h.engine.hasSession('123'),false);assert.equal(s.reference,null);assert.equal(s.note,'Stopped');
});
test('Leaving transfers host, deletes own take and aborts an in-progress own replay',async()=>{
  const h=harness(),s=h.create();h.engine.join(s,{id:'B',name:'Beta'});const own=Float32Array.from(ref);s.connection=h.audio;s.samples.set('A',own);s.replayId='A';await h.engine.leave(s,'A');assert.equal(s.host.id,'B');assert.ok(own.every(x=>x===0));assert.ok(h.events.includes('interrupt'));assert.equal(s.samples.has('A'),false);await h.engine.stop('123');
});
test('Voice failure and permission failure clean up instead of wedging future lobbies',async()=>{
  for(const fail of [{voiceFactory:()=>({connect:async()=>{throw Error('UDP blocked');}})},{quietLeases:{lock:async()=>{throw Error('permissions');},restore:async()=>0}}]){const h=harness(fail),s=h.create();h.engine.ready(s,'A');await h.engine.start(s,'A');assert.equal(h.engine.hasSession('123'),false);assert.equal(h.saves,0);assert.match(s.note,/gestoppt/);await h.engine.stop('123');const next=h.create();await h.engine.stop(next.guildId);}
});
test('External voice lock, game capacity and stale session controls are enforced',async()=>{
  const blocked=harness({isExternalBusy:()=>true});assert.throws(()=>blocked.create(),/andere/);
  const h=harness({maxSessions:1}),s=h.create();assert.throws(()=>h.create(),/schon/);assert.throws(()=>h.engine.create({...s,guildId:'456'}),/belegt/);await h.engine.stop('123');assert.throws(()=>h.engine.ready(s,'A'),/beendet/);
});
test('Panel has Discord-valid components, no mass mentions, and explicit consent',async()=>{
  const h=harness(),s=h.create();s.host.name='@everyone';s.players.get('A').name='@everyone';const p=panel(s);const json=p.embeds[0].toJSON();assert.ok(JSON.stringify(json).includes('RAM'));assert.ok(!JSON.stringify(json).includes('@everyone'));assert.deepEqual(p.allowedMentions,{parse:[]});for(const row of p.components)for(const button of row.toJSON().components)assert.ok(button.custom_id.length<100);await h.engine.stop('123');const ended=panel(s);assert.equal(ended.components.length,1);assert.match(ended.components[0].toJSON().components[0].custom_id,/:rematch$/);
});
test('Completed leaderboard save failures preserve previous records',async()=>{
  const h=harness({saveDB(){throw Error('full');}}),s=h.create();h.engine.ready(s,'A');await h.engine.start(s,'A');assert.equal(h.db.mimic.stats['123'],undefined);assert.match(s.note,/full/);
});
test('Controller rejects unapproved guild and maintenance without touching voice',async()=>{
  let touched=0;const party=createMimicParty({client:{guilds:{cache:new Map()}},db:{},saveDB(){},dataDirectory:'/tmp',isGuildApproved:()=>false,voiceFactory:()=>{touched++;throw Error('voice');}});
  let content;const i={guild:{id:'123'},user:{id:'A'},commandName:'mimic',isChatInputCommand:()=>true,options:{getSubcommand:()=> 'lobby'},reply:async p=>{content=p.content;}};
  assert.equal(await party.handleInteraction(i),true);assert.match(content,/freigeschaltet/);assert.equal(touched,0);await party.onShutdown();
});
test('Unavailable optional Mimic module leaves old command registration usable',()=>{
  const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require.resolve('../src/index'),'utf8');const from=source.indexOf('let mimicModule = null;'),to=source.indexOf('// Optional module: a missing/broken YouTube',from);const context={require(){throw Error('missing');},console:{warn(){}}};vm.runInNewContext(source.slice(from,to)+'\nresult={module:mimicModule,count:mimicCommands.length}',context);assert.equal(context.result.module,null);assert.equal(context.result.count,0);
});
test('A real VoiceConnection disconnect immediately aborts the current recording',async()=>{
  const {EventEmitter}=require('node:events'),h=harness(),s=h.create();h.audio.connection=new EventEmitter();h.engine.ready(s,'A');h.audio.capture=async()=>{h.audio.connection.emit('disconnected');throw Error('disconnected');};await h.engine.start(s,'A');assert.equal(h.engine.hasSession('123'),false);assert.match(s.note,/unterbrochen/);assert.equal(h.saves,0);assert.equal(h.closes,1);
});
test('Spotify refuses Mimic reservations and never destroys another feature’s connection on shutdown',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),file=path.join(__dirname,'../src/spotify_party.js');const localRequire=require('node:module').createRequire(file);let destroyed=0,current={destroy(){destroyed++;}},voiceBusy=true;
  const context={module:{exports:{}},process:{env:{}},__dirname:path.dirname(file),console,setTimeout,clearTimeout,URL,Buffer,
    require:name=>name==='@discordjs/voice'?{getVoiceConnection:()=>current}:name==='node:fs'?{...fs,existsSync:()=>true,readFileSync:file=>file.endsWith('spotify_auth.json')?'{}':'{}'}:localRequire(name)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8').replace('const sessions = new Map();','const sessions = new Map(); testSessions = sessions;'),context);
  const spotify=context.module.exports.createSpotifyParty({client:{},footer:x=>x,isGuildApproved:()=>true,isVoiceBusy:()=>voiceBusy});let text;const i={guild:{id:'123'},user:{id:'A'},isChatInputCommand:()=>true,commandName:'spotify',options:{getSubcommand:()=> 'start'},reply:async p=>{text=p.content;}};
  await spotify.handleInteraction(i);assert.match(text,/andere Voice/);assert.equal(destroyed,0);
  voiceBusy=false;await spotify.handleInteraction(i);assert.match(text,/andere Voice/);const owned={destroy(){destroyed++;}};context.testSessions.set('123',{connection:owned});spotify.onShutdown();assert.equal(destroyed,0);
  context.testSessions.set('123',{connection:owned});current=owned;spotify.onShutdown();assert.equal(destroyed,1);
});
test('A pending Spotify start reserves the guild before asynchronous work and blocks Mimic',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),file=path.join(__dirname,'../src/spotify_party.js'),localRequire=require('node:module').createRequire(file);
  const context={module:{exports:{}},process:{env:{}},__dirname:path.dirname(file),console,setTimeout,clearTimeout,URL,Buffer,
    require:name=>name==='@discordjs/voice'?{getVoiceConnection:()=>undefined}:name==='node:fs'?{...fs,existsSync:()=>true,readFileSync:file=>file.endsWith('spotify_auth.json')?JSON.stringify({guilds:{'123':{refreshToken:'fixture'}}}):'{}'}:localRequire(name)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8'),context);const spotify=context.module.exports.createSpotifyParty({client:{},footer:x=>x,isGuildApproved:()=>true});let release,blocked;
  const i={guild:{id:'123'},user:{id:'A'},member:{voice:{channel:{id:'vc'}}},isChatInputCommand:()=>true,commandName:'spotify',options:{getSubcommand:()=> 'start'},deferReply:()=>new Promise((_,reject)=>{release=()=>reject(Error('intentional pre-network stop'));}),reply:async p=>{blocked=p.content;}};
  const task=spotify.handleInteraction(i);assert.equal(spotify.isActiveOrStarting('123'),true);const h=harness({isExternalBusy:spotify.isActiveOrStarting});assert.throws(()=>h.create(),/andere/);await spotify.handleInteraction(i);assert.match(blocked,/bereits/);release();await assert.rejects(task,/pre-network/);assert.equal(spotify.isActiveOrStarting('123'),false);spotify.onShutdown();
});
test('Mimic edits reverse to the exact previous release with every other module unchanged',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{previousMegaRelease,spec}=require('./mimic_preservation');
  for(const [file,entry]of Object.entries(spec))assert.equal(crypto.createHash('sha256').update(previousMegaRelease(file,fs.readFileSync(path.join(__dirname,'../src',file),'utf8'))).digest('hex'),entry.sha256,file);
  const untouched=require('./fixtures/mimic-untouched.json');for(const [file,hash]of Object.entries(untouched))assert.equal(crypto.createHash('sha256').update(require('./permissions_preservation').previousMimicRelease(file,fs.readFileSync(path.join(__dirname,'../src',file),'utf8'))).digest('hex'),hash,file);
});
