'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const crypto=require('node:crypto');
const discord=require('discord.js');
const {CHARACTERS,ASSET_ROOT,createCharacterPicker,selectedCharacter,hasSelection}=require('../src/pixel_characters');
const {createPetDisplay}=require('../src/pixel_gojo');
const runtime=require('../src/bot_runtime');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
const plain=x=>JSON.parse(JSON.stringify(x));
const quiet={warn(){},error(){}};
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function fixture(options={}){
  const state={clock:1000,outputs:[],saves:0,answers:[],users:{},maintenance:false,aiEnabled:true};
  const getUserRecord=(guildId,userId)=>state.users[`${guildId}:${userId}`] ||= {xp:17,level:2};
  const saveDB=()=>{if(options.failSave)throw Error('ENOSPC');state.saves++;};
  const picker=createCharacterPicker({getUserRecord,saveDB,now:()=>state.clock,ttlMs:100,maxSessions:options.maxSessions||200,
    isMaintenance:()=>state.maintenance,isAiEnabled:()=>state.aiEnabled,previewPath:options.noPreview?'/nonexistent':undefined,
    answerQuestion:async(i,q)=>state.answers.push({id:i.user.id,question:q,selected:picker.getSelected(i.guild.id,i.user.id)}),...options.dependencies});
  function interaction(extra={}){
    const i={guild:{id:'g'},channelId:'c',channel:{id:'c'},user:{id:'u',tag:'U'},isStringSelectMenu:()=>true,
      values:['sukuna'],deferred:false,replied:false,
      reply:async payload=>{i.replied=true;state.outputs.push({kind:'reply',payload});return {id:'message'};},
      deferUpdate:async()=>{i.deferred=true;state.outputs.push({kind:'deferUpdate'});},
      editReply:async payload=>{state.outputs.push({kind:'edit',payload});return {id:'message'};},
      followUp:async payload=>state.outputs.push({kind:'followUp',payload}),...extra};
    return i;
  }
  const last=()=>state.outputs.at(-1)?.payload;
  const id=()=>state.outputs.findLast(x=>x.payload?.components?.length)?.payload.components[0].components[0].data.custom_id;
  async function choose(extra={}){return picker.handleInteraction(interaction({customId:id(),...extra}));}
  return {state,picker,getUserRecord,saveDB,interaction,last,id,choose};
}

test('First-time picker offers exactly ten real Discord options and a labeled preview',async()=>{
  const f=fixture();await f.picker.open(f.interaction(),{question:'yo wie gehts'});
  const payload=f.last(),menu=payload.components[0].toJSON().components[0];assert.deepEqual(menu.options.map(x=>x.value),['gojo','sukuna','geto','nanami','toji','zelda','link','nova','ember','luna']);
  assert.equal(payload.flags,discord.MessageFlags.Ephemeral);assert.equal(payload.files[0].name,'pixel-auswahl.png');assert.equal(payload.embeds[0].data.image.url,'attachment://pixel-auswahl.png');
  assert.equal(menu.options.some(x=>x.default),false);assert.equal(f.state.saves,0);assert.equal(f.state.answers.length,0);
});
test('Choosing stores only the personal skin and resumes the exact original question once',async()=>{
  const f=fixture();await f.picker.open(f.interaction(),{question:'Was kann ich bei YouTube HTTP 404 machen?'});const id=f.id();
  await f.choose();assert.deepEqual(f.getUserRecord('g','u'),{xp:17,level:2,pixelCharacterId:'sukuna'});assert.equal(f.state.saves,1);
  assert.deepEqual(f.state.answers,[{id:'u',question:'Was kann ich bei YouTube HTTP 404 machen?',selected:'sukuna'}]);
  await f.picker.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.answers.length,1);assert.equal(f.state.saves,1);
});
test('Another user or guild cannot change the owner\'s character or consume its question',async()=>{
  const f=fixture();await f.picker.open(f.interaction(),{question:'Frage'});
  await f.choose({user:{id:'other'}});await f.choose({guild:{id:'other'}});
  assert.equal(f.state.saves,0);assert.equal(f.state.answers.length,0);assert.ok(f.picker.sessions.size);await f.choose();assert.equal(f.state.answers.length,1);
});
test('Unknown choices are rejected, and an expired panel cannot mutate data',async()=>{
  const f=fixture();await f.picker.open(f.interaction());await f.choose({values:['../../secret']});assert.equal(f.state.saves,0);
  f.state.clock+=101;await f.choose();assert.match(f.last().content,/abgelaufen/);assert.equal(f.state.saves,0);
});
test('A failed preference save rolls back and keeps the same panel retryable',async()=>{
  let fail=true;const f=fixture({dependencies:{saveDB:()=>{if(fail)throw Error('ENOSPC');}}});
  await f.picker.open(f.interaction());await f.choose();assert.equal(hasSelection(f.getUserRecord('g','u')),false);assert.match(f.last().content,/nicht gespeichert/);
  fail=false;await f.choose();assert.equal(f.picker.getSelected('g','u'),'sukuna');
});
test('Double clicks while a choice is being acknowledged cannot run two AI requests',async()=>{
  const f=fixture();await f.picker.open(f.interaction(),{question:'Frage'});let release;
  const slow=f.picker.handleInteraction(f.interaction({customId:f.id(),deferUpdate:()=>new Promise(resolve=>release=resolve)}));
  await f.choose();assert.equal(f.state.answers.length,0);assert.match(f.last().content,/gerade gespeichert/);release();await slow;assert.equal(f.state.answers.length,1);
});
test('Maintenance blocks saves, and switching off AI preserves the choice without answering',async()=>{
  const f=fixture();await f.picker.open(f.interaction(),{question:'Frage'});f.state.maintenance=true;await f.choose();assert.equal(f.state.saves,0);
  f.state.maintenance=false;f.state.aiEnabled=false;await f.choose();assert.equal(f.state.saves,1);assert.equal(f.state.answers.length,0);assert.match(f.last().content,/AI.*ausgeschaltet/);
});
test('/pixel can change the skin without generating an AI reply or affecting other users',async()=>{
  const f=fixture();await f.picker.open(f.interaction());await f.choose({values:['nanami']});assert.equal(f.state.answers.length,0);
  assert.equal(f.picker.getSelected('g','u'),'nanami');assert.equal(f.picker.getSelected('g','other'),'gojo');assert.equal(f.picker.getSelected('other','u'),'gojo');
  await f.picker.open(f.interaction());assert.equal(f.last().components[0].toJSON().components[0].options.find(x=>x.default).value,'nanami');
  await f.choose({values:['toji']});assert.equal(f.picker.getSelected('g','u'),'toji');
});
test('Saved choices survive a real database restart without resetting XP or channel mappings',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-choice-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=runtime.createDatabaseStore(path.join(dir,'db.json'));const db=store.load();db.users['g:u']={xp:234,level:8,pixelCharacterId:'geto'};db.guilds.g={channels:{counting:'channel'},counting:{current:51}};store.save(db);
  const restored=runtime.createDatabaseStore(store.file).load();assert.equal(selectedCharacter(restored.users['g:u']),'geto');assert.equal(restored.users['g:u'].xp,234);assert.equal(restored.guilds.g.counting.current,51);assert.equal(restored.guilds.g.channels.counting,'channel');
});
test('Missing previews and failed picker sends keep the existing bot usable',async()=>{
  const f=fixture({noPreview:true});await f.picker.open(f.interaction());assert.equal(f.last().files,undefined);assert.equal(f.last().components[0].toJSON().components[0].options.length,10);
  const before=f.picker.sessions.size;await assert.rejects(f.picker.open(f.interaction({reply:async()=>{throw Error('Discord down');}})),/Discord down/);assert.equal(f.picker.sessions.size,before);
});
test('Session limits expire old panels and unrelated controls are not intercepted',async()=>{
  const f=fixture({maxSessions:1});await f.picker.open(f.interaction());await f.picker.open(f.interaction());assert.match(f.last().content,/viele Auswahlen/);
  assert.equal(await f.picker.handleInteraction(f.interaction({customId:'ticket_yes'})),false);
  f.state.clock+=101;await f.picker.open(f.interaction());assert.equal(f.picker.sessions.size,1);assert.ok(f.last().components);
});
test('A mention can open the same user-locked picker and preserve the original question',async()=>{
  const f=fixture();let payload;
  await f.picker.openFromMessage({guild:{id:'g'},author:{id:'u'},reply:async p=>{payload=p;f.state.outputs.push({payload:p});}},{question:'Wie geht Minecraft?'});
  assert.equal(payload.flags,undefined);assert.deepEqual(payload.allowedMentions.parse,[]);await f.choose({values:['geto']});assert.equal(f.state.answers[0].question,'Wie geht Minecraft?');
});
test('Actual /ai entry shows onboarding, then the ordinary handler answers with the selected skin',async()=>{
  const f=fixture();const display=createPetDisplay({logger:quiet});const questions=[];const db={users:f.state.users};
  const ctx={...discord,console:quiet,require:localRequire,db,userData:f.getUserRecord,saveDB:f.saveDB,OWNER_ID:'owner',
    serverSettings:()=>({aiEnabled:true}),aiCooldownRemaining:()=>0,startAiCooldown(){},sendAiAnimation:display.sendAiAnimation,aiTextPayload:display.aiTextPayload,
    askGemini:async(question,...args)=>{questions.push([question,...args]);return 'Antwort';},recordAiReview(){},splitDiscordText:()=>['Antwort','Fortsetzung']};
  vm.createContext(ctx);vm.runInContext(section('function pixelCharacterId(', 'function aiConversationKey(')+section('let pixelCharacterPicker = null;','function aiCooldownRemaining(')+'async function slash(interaction){switch("ai"){'+section('        case "ai": {','        case "aipulse": {')+'}}',ctx);
  const i=f.interaction({options:{getString:()=> 'Was tun bei HTTP 404?'}});await ctx.slash(i);assert.equal(questions.length,0);
  const picker=ctx.getPixelCharacterPicker();const select=f.interaction({customId:f.id(),values:['nanami']});await picker.handleInteraction(select);
  assert.equal(questions.length,1);assert.equal(questions[0][0],'Was tun bei HTTP 404?');assert.equal(questions[0].at(-1),'senz-de');
  assert.ok(f.state.outputs.filter(x=>x.payload?.content?.includes('Antwort')).every(x=>x.payload.content.includes('Pixel Nanami')));
  assert.match(f.state.outputs.findLast(x=>x.kind==='followUp').payload.content,/Pixel Nanami/);assert.equal(select.deferred,true);
});
function app(){const existing=[],state={creates:0,fetches:0};return {state,client:{application:{emojis:{fetch:async()=>{state.fetches++;return existing;},create:async data=>{state.creates++;const emoji={name:data.name,id:String(100000000000000000n+BigInt(state.creates)),animated:true};existing.push(emoji);return emoji;}}}}};}
test('Forty application emojis initialize once and are reused across restarts',async()=>{
  const f=app();const ids=CHARACTERS.map(c=>c.id);const display=createPetDisplay({logger:quiet,characterIds:ids});await Promise.all([display.initialize(f.client),display.initialize(f.client)]);
  assert.equal(f.state.fetches,1);assert.equal(f.state.creates,40);const restarted=createPetDisplay({logger:quiet,characterIds:ids});await restarted.initialize(f.client);assert.equal(f.state.creates,40);
  for(const character of CHARACTERS){const payload=restarted.aiTextPayload('Text','all',character.id);assert.match(payload.content,/^<a:/);assert.ok(payload.content.includes(character.name));assert.ok(payload.content.length<2000);assert.equal(payload.files,undefined);assert.deepEqual(payload.allowedMentions.parse,[]);}
});
test('Concurrent replies keep their own character through waiting, errors and final edits',async()=>{
  const display=createPetDisplay({logger:quiet,waitMs:1}),a=[],b=[];
  const pendingA=await display.sendAiAnimation(async p=>{a.push(p.content);return {edit:async p=>a.push(p.content)};},{characterId:'sukuna'});
  const pendingB=await display.sendAiAnimation(async p=>{b.push(p.content);return {edit:async p=>b.push(p.content)};},{characterId:'toji'});
  await new Promise(resolve=>setTimeout(resolve,8));await pendingA.finish('Fertig');await pendingB.finish('Fehler','failed');
  assert.ok(a.length>=3&&b.length>=3);assert.ok(a.every(x=>x.includes('Pixel Sukuna')&&!x.includes('Toji')));assert.ok(b.every(x=>x.includes('Pixel Toji')&&!x.includes('Sukuna')));
});
test('Missing emoji access still displays the chosen character and gives a usable answer',async()=>{
  const display=createPetDisplay({logger:quiet,characterIds:['geto']});await display.initialize({application:{emojis:{fetch:async()=>{throw {code:50013};},create(){}}}});
  const payload=display.aiTextPayload('Antwort','all','geto');assert.match(payload.content,/🟣 \*\*Pixel Geto\*\*/);assert.equal(display.aiTextPayload('Antwort','all','invalid').content.includes('Pixel Gojo'),true);
});
test('The chat prompt uses the selected name while preserving the existing German style',async()=>{
  let request;const ctx={require:localRequire,db:{users:{'g:u':{pixelCharacterId:'geto'}}},AI_NAME:'Pixel Gojo',BOT_NAME:'Pixel',GEMINI_MODEL:'existing',Date,Map,Set,JSON,console:quiet,
    getGuildLearnContext:()=>({instructions:'',knowledge:''}),getAiFeedbackText:()=>'',geminiStatus:()=>null,generateGeminiContent:async r=>{request=r;return {text:'Antwort'};}};
  vm.createContext(ctx);vm.runInContext(section('const aiConversationHistory','const geminiSerialByModel')+section('function aiQuality()', 'function splitDiscordText(')+section('function chatAiErrorMessage(', 'const ticketAiQueues'),ctx);
  await ctx.askGemini('yo','U','g','u','c','senz-de');assert.match(request.config.systemInstruction,/Du heißt Pixel Geto/);assert.match(request.config.systemInstruction,/Antworte auf Deutsch, kurz und locker/);
});
test('Ticket replies and continuation chunks use every selected skin, including error replies',async()=>{
  for(const character of CHARACTERS){
    const ticket={ownerId:'u',aiEnabled:true,status:'open'},sent=[],edits=[],display=createPetDisplay({logger:quiet});
    const message={guild:{id:'g'},channel:{id:'c',sendTyping:async()=>{}},author:{id:'u'},content:'Hilfe',attachments:{size:0}};
    const ctx={require:localRequire,db:{users:{'g:u':{pixelCharacterId:character.id}},tickets:{c:ticket}},Date,console:quiet,
      getTicketRecord:()=>ticket,saveDB(){},shouldAutoEscalate:()=>false,findFaqMatch:()=>null,GEMINI_API_KEY:'mock',
      sendAiAnimation:display.sendAiAnimation,aiTextPayload:display.aiTextPayload,recordAiReview(){},
      askGeminiSupport:async()=>{if(character.id==='toji')throw Error('TIMEOUT');return 'Antwort';},splitDiscordText:()=>['Antwort eins','Antwort zwei'],
      sendEditableTicketContent:async(channel,payload)=>{sent.push(payload);return {edit:async update=>{edits.push(update);}};}};
    vm.createContext(ctx);vm.runInContext(section('function pixelCharacterId(', 'function aiConversationKey(')+section('async function runTicketAi(', 'function enqueueTicketAi('),ctx);
    await ctx.runTicketAi(message);assert.equal(edits.length,1);assert.ok(edits[0].content.includes(character.name));
    assert.ok(sent.every(payload=>payload.content.includes(character.name)));assert.equal(sent.length,character.id==='toji'?1:2);
  }
});

function gifFrames(bytes){
  assert.match(bytes.subarray(0,6).toString(),/^GIF8[79]a$/);let at=13,count=0;const packed=bytes[10];if(packed&128)at+=3*(2**((packed&7)+1));
  function blocks(){while(bytes[at]){const size=bytes[at++];at+=size;assert.ok(at<bytes.length);}at++;}
  let disposal=0;
  while(at<bytes.length){const marker=bytes[at++];if(marker===0x3b)break;
    if(marker===0x21){const type=bytes[at++];if(type===0xf9){assert.equal(bytes[at],4);disposal=(bytes[at+1]>>2)&7;assert.equal(bytes[at+1]&1,1);}blocks();}
    else if(marker===0x2c){const flags=bytes[at+8];at+=9;if(flags&128)at+=3*(2**((flags&7)+1));at++;blocks();assert.equal(disposal,2);count++;}
    else assert.fail(`Invalid GIF marker ${marker}`);
  }
  return count;
}
test('All nine additional characters ship complete transparent looping GIFs under Discord\'s size limit',()=>{
  const manifest=require('../assets/pixel-characters/animations.json');assert.equal(Object.keys(manifest.animations).length,63);
  for(const [file,spec] of Object.entries(manifest.animations)){
    const bytes=fs.readFileSync(path.join(ASSET_ROOT,file));assert.ok(bytes.length<256*1024,file);assert.equal(bytes.readUInt16LE(6),128);assert.equal(bytes.readUInt16LE(8),128);assert.equal(gifFrames(bytes),spec.frames);assert.ok(spec.frames>1);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),spec.sha256);
  }
  assert.deepEqual(manifest.characters,['sukuna','geto','nanami','toji','zelda','link','nova','ember','luna']);
});
test('Every source region outside the reviewed character changes matches the stability release',()=>{
  const {previousStabilityRelease,spec}=require('./character_preservation');for(const [file,expected] of Object.entries(spec))assert.equal(crypto.createHash('sha256').update(previousStabilityRelease(file,fs.readFileSync(path.join(__dirname,'../src',file),'utf8'))).digest('hex'),expected.sha256,file);
});
