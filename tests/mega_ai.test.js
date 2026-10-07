'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createMemory,TTL}=require('../src/ai_memory');
const quality=require('../src/ai_quality'),{CHARACTERS}=require('../src/pixel_characters');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
const pair=(q,a)=>[{role:'user',parts:[{text:q}]},{role:'model',parts:[{text:a}]}];
function memoryFixture(){const users={'g:u':{xp:76,pixelCharacterId:'zelda'},'g:other':{xp:5}},state={now:1000,saves:0,fail:false};
  const deps={getRecord:(g,u,create)=>create?(users[g+':'+u] ||= {}):users[g+':'+u],now:()=>state.now,save:()=>{if(state.fail)throw Error('disk');state.saves++;},logger:{warn(){}}};return {users,state,deps,memory:createMemory(deps)};}
test('Conversation memory survives a new process and keeps XP, selection and other users',()=>{
  const f=memoryFixture();f.memory.write('g','u','c',pair('Kanal 404','Prüfe die ID'));const restarted=createMemory(f.deps);assert.deepEqual(restarted.read('g','u','c'),pair('Kanal 404','Prüfe die ID'));assert.equal(f.users['g:u'].xp,76);assert.equal(f.users['g:u'].pixelCharacterId,'zelda');assert.deepEqual(restarted.read('g','other','c'),[]);assert.deepEqual(restarted.read('other','u','c'),[]);assert.deepEqual(restarted.read('g','u','other'),[]);
});
test('Memory expires after two hours, caps stored channels, and rollback preserves older history',()=>{
  const f=memoryFixture();for(let i=0;i<5;i++){f.state.now++;f.memory.write('g','u','c'+i,pair('Frage'+i,'Antwort'));}assert.equal(Object.keys(f.users['g:u'].aiConversations).length,3);
  const old=JSON.stringify(f.users['g:u'].aiConversations);f.state.fail=true;f.memory.write('g','u','c4',pair('Neue Frage','Andere Antwort'));assert.equal(JSON.stringify(f.users['g:u'].aiConversations),old);assert.throws(()=>f.memory.clear('g','u','c4'));assert.equal(JSON.stringify(f.users['g:u'].aiConversations),old);
  f.state.now+=TTL;assert.deepEqual(f.memory.read('g','u','c4'),[]);
});
test('Memory reset is channel scoped and malformed persisted data cannot crash AI',()=>{
  const f=memoryFixture();f.memory.write('g','u','c',pair('A','B'));f.memory.write('g','u','other',pair('C','D'));f.memory.clear('g','u','c');assert.deepEqual(f.memory.read('g','u','c'),[]);assert.deepEqual(f.memory.read('g','u','other'),pair('C','D'));
  f.users['g:u'].aiConversations={c:{updatedAt:Infinity,messages:[]},x:{updatedAt:1000,messages:'invalid'}};assert.deepEqual(f.memory.read('g','u','c'),[]);assert.deepEqual(f.memory.read('g','u','x'),[]);
});
test('Support context retains replies of all ten characters but excludes indicators and unrelated bots',()=>{
  for(const c of CHARACTERS){const messages=[{id:'old',author:{id:'bot',bot:true},content:`✨ **${c.name}**\nPrüfe die Kanal-ID.`,createdTimestamp:1},{id:'thinking',author:{id:'bot',bot:true},content:`✨ **${c.name}**\nIch denke nach …`,createdTimestamp:2},{id:'other',author:{id:'otherbot',bot:true},content:'**Pixel Zelda** Fake',createdTimestamp:3}];
    const rows=quality.ticketContext(messages,{id:'current',createdTimestamp:4,channel:{id:'c'},guild:{id:'g'}},'bot');assert.equal(rows.length,1);assert.equal(rows[0].text,'Prüfe die Kanal-ID.');assert.equal(rows[0].role,'assistant');}
});
test('Conversation focus remembers tried steps and corrections without treating bot guesses as facts',()=>{
  const value=JSON.parse(quality.conversationSignals([...pair('Neustart schon probiert','Du hast Windows'),...pair('Nein, ich meine Android','Okay')],'geht immer noch nicht'));
  assert.equal(value.reported_attempts.length,1);assert.equal(value.corrections.length,1);assert.equal(value.latest_is_feedback,true);assert.equal(JSON.stringify(value).includes('Windows'),false);
});
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function chatFixture(options={}){
  const state={calls:[],saves:0},db=options.db||{users:{}};
  const ctx={Date,Map,Set,JSON,console:{warn(){}},require:localRequire,process:{env:options.env||{}},db,
    AI_NAME:'Pixel Gojo',BOT_NAME:'Pixel',GEMINI_MODEL:'configured',GEMINI_FALLBACK_MODEL:'fallback',saveDB:()=>state.saves++,
    getGuildLearnContext:()=>({knowledge:'',instructions:''}),getAiFeedbackText:()=>'',geminiStatus:e=>e.status,
    generateGeminiContent:async r=>{state.calls.push(JSON.parse(JSON.stringify(r)));return options.generate?options.generate(r,state.calls.length):{text:'Nutze die vollständige Kanal-ID.'};},...options.context};
  vm.createContext(ctx);vm.runInContext(section('const aiConversationHistory','const geminiSerialByModel')+section('function aiQuality()', 'function splitDiscordText(')+section('function chatAiErrorMessage(', 'const ticketAiQueues'),ctx);return {ctx,db,state};
}
test('Real chat route restores persisted context after restart instead of starting over',async()=>{
  const f=chatFixture();await f.ctx.askGemini('Mein Gerät ist Android','U','g','u','c');const g=chatFixture({db:f.db});await g.ctx.askGemini('geht nicht','U','g','u','c');assert.ok(g.state.calls[0].contents.some(m=>m.parts[0].text.includes('Android')));assert.equal(f.db.users['g:u'].aiConversations.c.messages.length,4);
});
test('Current questions enable Google grounding and return actual provider source links',async()=>{
  const f=chatFixture({generate:()=>({text:'Der aktuelle Patch hat neue Änderungen.',candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.org/patch',title:'Patch Notes'}},{web:{uri:'javascript:alert(1)',title:'Bad'}}]}}]})});
  const answer=await f.ctx.askGemini('Was steht in den neuesten Patchnotes?','U','g','u','c');assert.deepEqual(f.state.calls[0].config.tools,[{googleSearch:{}}]);assert.match(answer,/https:\/\/example.org\/patch/);assert.equal(answer.includes('javascript:'),false);
});
test('Unavailable search falls back with explicit research limitation and preserves facts',async()=>{
  const f=chatFixture({generate:(r,n)=>{if(n===1)throw {status:400};return {text:'Der aktuelle Shop ist mir nicht bekannt.'};}});await f.ctx.askGemini('Was ist heute im Shop?','U','g','u','c');assert.equal(f.state.calls.length,2);assert.equal(f.state.calls[1].config.tools,undefined);assert.match(f.state.calls[1].config.systemInstruction,/KEINE Websuche/);assert.deepEqual(f.state.calls[0].contents,f.state.calls[1].contents);
});
test('Smalltalk stays on the existing model; configured reasoning model handles complex questions',async()=>{
  const f=chatFixture({env:{GEMINI_REASONING_MODEL:'configured-reasoning',GEMINI_CHAT_SEARCH:'false'}});await f.ctx.askGemini('yo','U','g','u','c');await f.ctx.askGemini('Erkläre diesen Fehler im Code','U','g','u','other');assert.equal(f.state.calls[0].model,'configured');assert.equal(f.state.calls[1].model,'configured-reasoning');assert.equal(f.state.calls[0].config.tools,undefined);
});
test('Server context includes only channels the current user can see',async()=>{
  const member={id:'u'},channels=new Map([['public',{id:'public',name:'chat',permissionsFor:()=>({has:()=>true})}],['staff',{id:'staff',name:'secret',permissionsFor:()=>({has:()=>false})}]]);
  const f=chatFixture({context:{client:{guilds:{cache:new Map([['g',{name:'Server',members:{fetch:async()=>member},channels:{cache:channels}}]])}},guildData:()=>({channels:{chat:'public',logs:'staff'}}),serverSettings:()=>({aiEnabled:true}),PermissionsBitField:require('discord.js').PermissionsBitField}});
  const text=await f.ctx.aiServerContext('g','u');assert.match(text,/public/);assert.equal(text.includes('secret'),false);assert.equal(text.includes('"staff"'),false);assert.match(text,/\/new/);
});
test('Reviewed edits reconstruct the exact previous release and all unrelated modules remain identical',()=>{
  const {previousCharacterRelease,spec}=require('./mega_preservation');for(const [file,entry] of Object.entries(spec)){
    assert.equal(crypto.createHash('sha256').update(previousCharacterRelease(file,fs.readFileSync(path.join(__dirname,'../src',file),'utf8'))).digest('hex'),entry.sha256,file);
  }
});
