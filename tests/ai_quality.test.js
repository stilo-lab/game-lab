'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const quality=require('../src/ai_quality');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
function section(start,end) {const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0 && b>a,start);return source.slice(a,b);}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Older relevant server knowledge outranks recent unrelated notes within a strict budget',()=>{
  const entries=[{id:'youtube-fix',topic:'YouTube 404',text:'Handle-Link über den Kanal-Identifier auflösen.',createdAt:1},
    ...Array.from({length:100},(_,i)=>({id:`new-${i}`,topic:'Turnier',text:'Turnierplan '.repeat(50),createdAt:i+10}))];
  const result=quality.selectKnowledge(entries,'yt meldet 404',800);
  assert.match(result,/^\[youtube-fix\]/);assert.ok(result.length<=800);
  assert.equal((quality.selectKnowledge([entries[0],entries[0]],'youtube').match(/youtube-fix/g)||[]).length,1);
});

test('Learn and feedback retrieval remain isolated by guild and AI target',()=>{
  const gd={aiKnowledge:[
    {id:'ai-only',kind:'knowledge',target:'ai',topic:'YouTube',text:'Nur normale AI',createdAt:1},
    {id:'support-only',kind:'knowledge',target:'support',topic:'YouTube',text:'Support-Zuordnung',createdAt:2}
  ],aiFeedback:[{sourceType:'ai',question:'YouTube',improvement:'AI-Ton'},{sourceType:'support',question:'YouTube',improvement:'Fehlercode prüfen'}]};
  const ctx={aiQuality:()=>quality,guildData:id=>id==='g'?gd:{aiKnowledge:[],aiFeedback:[]},db:{globalAiKnowledge:[]},looksLikeLearnInstruction:()=>false};
  vm.createContext(ctx);
  vm.runInContext(section('function normalizedLearnEntry(', 'function learnUnderstanding(')+section('function getGuildLearnContext(', 'function recordAiReview(')+section('function getAiFeedbackText(', 'function isAiReviewAdmin('),ctx);
  const result=ctx.getGuildLearnContext('g','support',4000,5000,'YouTube');
  assert.match(result.knowledge,/Support-Zuordnung/);assert.doesNotMatch(result.knowledge,/Nur normale AI/);
  assert.equal(ctx.getGuildLearnContext('other','support',4000,5000,'YouTube').knowledge,'');
  const feedback=ctx.getAiFeedbackText('g','support',4500,'YouTube');
  assert.match(feedback,/Fehlercode prüfen/);assert.doesNotMatch(feedback,/AI-Ton/);
});

test('Chat retains twelve complete exchanges, with a separate character budget',()=>{
  const messages=Array.from({length:20},(_,i)=>[{role:'user',parts:[{text:`Frage ${i}`}]},{role:'model',parts:[{text:`Antwort ${i}`}]}]).flat();
  const result=quality.trimConversation(messages);
  assert.equal(result.length,24);assert.equal(result[0].parts[0].text,'Frage 8');
  const limited=quality.trimConversation(messages.map(m=>({...m,parts:[{text:'x'.repeat(5000)}]})));
  assert.ok(limited.reduce((n,m)=>n+m.parts[0].text.length,0)<=32000);
  for(let i=0;i<limited.length;i+=2){assert.equal(limited[i].role,'user');assert.equal(limited[i+1].role,'model');}
});

test('Real chat integration retains context beyond five exchanges and isolates other users/channels',async()=>{
  const requests=[];
  const ctx={Date,Map,Set,JSON,console,require:localRequire,AI_NAME:'Pixel Gojo',BOT_NAME:'Pixel',GEMINI_MODEL:'existing-model',
    getGuildLearnContext:()=>({instructions:'',knowledge:''}),getAiFeedbackText:()=>'',geminiStatus:()=>null,
    generateGeminiContent:async request=>{requests.push(request);return {text:'Antwort'};}};
  vm.createContext(ctx);
  vm.runInContext(section('const aiConversationHistory','const geminiSerialByModel')+section('function aiQuality()', 'function splitDiscordText(')+section('function chatAiErrorMessage(', 'const ticketAiQueues')+'\nthis.history=aiConversationHistory;',ctx);
  for(let i=0;i<10;i++) await ctx.askGemini(`Frage ${i}`,'U','g','u','c','senz-de');
  assert.equal(requests.at(-1).contents.length,19);assert.equal(requests.at(-1).contents[0].parts[0].text,'Frage 0');
  const key=ctx.aiConversationKey('g','u','c');ctx.history.get(key).updatedAt=Date.now()-60*60000;
  assert.equal(ctx.getAiConversation('g','u','c').length,20);
  ctx.history.get(key).updatedAt=Date.now()-121*60000;assert.equal(ctx.getAiConversation('g','u','c').length,0);
  await ctx.askGemini('yo','Other','g','other','c','senz-de');assert.equal(requests.at(-1).contents.length,1);
  assert.match(requests.at(-1).config.systemInstruction,/Antworte auf Deutsch, kurz und locker/);
  assert.match(requests.at(-1).config.systemInstruction,/keine Websuche angeschlossen/);
});

test('Troubleshooting allows more output with lower randomness; greetings keep casual settings',()=>{
  const greeting=quality.chatGenerationSettings('yo');const problem=quality.chatGenerationSettings('Warum kommt der Fehler 404?');
  assert.ok(problem.maxOutputTokens>greeting.maxOutputTokens);assert.ok(problem.temperature<greeting.temperature);
  assert.equal(quality.chatGenerationSettings('geht nd',[{role:'user',parts:[{text:'Fehler 404'}]}]).maxOutputTokens,problem.maxOutputTokens);
});

function supportFixture(options={}) {
  const calls={primary:[],fallback:[],saved:0};
  const ticket={category:'other',priority:'normal',aiEnabled:true,status:'open',previousInteractionId:options.previousId || null};
  const message={id:'100',createdTimestamp:100,guild:{id:'g'},channel:{id:'c'},author:{id:'u'},content:'Neustart gemacht, derselbe Fehler 404.',attachments:new Map()};
  const messages=[
    {id:'10',createdTimestamp:10,channelId:'c',guildId:'g',author:{id:'u',tag:'User'},content:'Railway: YouTube-Link meldet 404.'},
    {id:'20',createdTimestamp:20,channelId:'c',guildId:'g',author:{id:'bot',bot:true},content:'✨ **Pixel Gojo**\nStarte den Bot einmal neu und prüfe den Kanal-Link.'},
    message
  ];
  const image={type:'image',data:Buffer.from('mock-image').toString('base64'),mime_type:'image/png'};
  const ctx={aiQuality:()=>quality,client:{user:{id:'bot'}},console:{warn(){}},
    getGeminiClient:async()=>({interactions:{create:async request=>{
      calls.primary.push(plain(request));return options.primary?options.primary(request,calls.primary.length,ticket):{id:'next-id',output_text:'Prüfe jetzt die Kanal-ID statt erneut neu zu starten.'};
    }}}),
    fetchTicketMessages:async()=>messages,discordImageParts:async()=>options.images?[image]:[],
    withTimeout:async p=>p,runGeminiTask:async fn=>fn(),geminiStatus:e=>e.status,
    findFaqMatch:()=>({question:'YouTube',answer:'FAQ: Kanal-Link prüfen'}),
    getGuildLearnContext:()=>({instructions:'Support ruhig erklären',knowledge:'Server nutzt Kanal 123'}),
    getAiFeedbackText:()=> 'Erst den genauen Fehler prüfen',ticketCategoryLabel:x=>x,ticketPriorityLabel:x=>x,
    AI_NAME:'Pixel Gojo',BOT_NAME:'Pixel',GEMINI_SUPPORT_MODEL:'existing-support',GEMINI_SUPPORT_MIN_INTERVAL_MS:0,
    GEMINI_MODEL:'existing-chat',GEMINI_FALLBACK_MODEL:'fallback',saveDB:()=>{calls.saved++;},
    generateGeminiContent:async request=>{calls.fallback.push(plain(request));return options.fallback?options.fallback(request,ticket):{text:'Nächster Prüfschritt ohne Live-Recherche.'};}
  };
  vm.createContext(ctx);
  vm.runInContext(section('function extractInteractionSources(', 'async function withTimeout(')+section('function formatSupportAnswer(', 'const aiPulseCache')+section('async function askGeminiSupport(', 'async function runTicketAi('),ctx);
  return {ctx,calls,ticket,message,messages,image};
}

test('Support primary receives actual previous solutions, current failure, server facts and screenshots',async()=>{
  const f=supportFixture({images:true,previousId:'prior'});const answer=await f.ctx.askGeminiSupport(f.message,f.ticket);
  const request=f.calls.primary[0],data=JSON.parse(request.input[0].text);
  assert.equal(request.previous_interaction_id,'prior');assert.equal(request.model,'existing-support');
  assert.match(data.current_request,/derselbe Fehler/);assert.ok(data.recent_ticket_conversation.some(x=>x.role==='assistant' && /Starte den Bot/.test(x.text)));
  assert.equal(data.recent_ticket_conversation.length,2);assert.deepEqual(request.input[1],f.image);
  for(const text of ['Server nutzt Kanal 123','Erst den genauen Fehler prüfen','FAQ: Kanal-Link prüfen','gescheiterte Schritte nicht']) assert.ok(request.system_instruction.includes(text));
  assert.match(answer,/Kanal-ID/);assert.equal(f.ticket.previousInteractionId,'next-id');
});

test('Fallback uses generateContent with the same dialogue, images, FAQ, learned knowledge and feedback',async()=>{
  const f=supportFixture({images:true,previousId:'prior',primary:()=>{throw {status:503};}});
  await f.ctx.askGeminiSupport(f.message,f.ticket);
  assert.equal(f.calls.primary.length,1);assert.equal(f.calls.fallback.length,1);
  const fallback=f.calls.fallback[0];
  assert.equal(fallback.contents[0].parts[0].text,f.calls.primary[0].input[0].text);
  assert.deepEqual(fallback.contents[0].parts[1],{inlineData:{data:f.image.data,mimeType:'image/png'}});
  assert.equal(fallback.config.tools,undefined);assert.match(fallback.config.systemInstruction,/KEINE Websuche/);
  for(const text of ['Server nutzt Kanal 123','Erst den genauen Fehler prüfen','Support ruhig erklären']) assert.ok(fallback.config.systemInstruction.includes(text));
  assert.equal(f.ticket.previousInteractionId,null);
});

test('An expired interaction is retried without its ID and rebuilt from this ticket only',async()=>{
  const f=supportFixture({previousId:'expired',primary:(request,n)=>{if(n===1)throw {status:404};return {id:'fresh-id',output_text:'Weiter mit dem vorhandenen Verlauf.'};}});
  await f.ctx.askGeminiSupport(f.message,f.ticket);
  assert.equal(f.calls.primary.length,2);assert.equal(f.calls.primary[1].previous_interaction_id,undefined);
  assert.deepEqual(f.calls.primary[0].input,f.calls.primary[1].input);
  assert.equal(f.calls.fallback.length,0);assert.equal(f.ticket.previousInteractionId,'fresh-id');
});

test('Empty provider replies are errors, not fake successful answers or saved remote history',async()=>{
  const f=supportFixture({primary:()=>({id:'empty',output_text:''}),fallback:()=>({text:''})});
  await assert.rejects(f.ctx.askGeminiSupport(f.message,f.ticket),/AI_EMPTY_RESPONSE/);
  assert.equal(f.calls.saved,0);assert.equal(f.ticket.previousInteractionId,null);
});

test('Handoff during generation does not restore AI state or overwrite reset history',async()=>{
  const f=supportFixture({previousId:'old',primary:(request,n,ticket)=>{ticket.aiEnabled=false;ticket.previousInteractionId=null;return {id:'late',output_text:'Late response'};}});
  await f.ctx.askGeminiSupport(f.message,f.ticket);
  assert.equal(f.ticket.previousInteractionId,null);assert.equal(f.calls.saved,0);
});

test('Ticket transcript excludes other channels, unrelated bots, future messages and thinking placeholders',()=>{
  const f=supportFixture();
  const messages=[...f.messages,
    {id:'30',createdTimestamp:30,channelId:'secret',author:{id:'x'},content:'other channel secret'},
    {id:'31',createdTimestamp:31,channelId:'c',author:{id:'otherbot',bot:true},content:'bot panel'},
    {id:'40',createdTimestamp:40,channelId:'c',author:{id:'bot',bot:true},content:'✨ **Pixel Gojo**\nIch denke nach …'},
    {id:'110',createdTimestamp:110,channelId:'c',author:{id:'u'},content:'future request'}];
  const rows=quality.ticketContext(messages,f.message,'bot');
  assert.equal(rows.length,2);assert.doesNotMatch(JSON.stringify(rows),/secret|panel|denke nach|future/);
});

test('Unreadable old attachments remain labels, while actual response blocks omit thought content',()=>{
  const current={id:'now',channel:{id:'c'}};
  const rows=quality.ticketContext([{id:'old',author:{id:'u'},content:'Siehe Bild',attachments:new Map([['a',{name:'fehler.png'}]])}],current,'bot');
  assert.match(rows[0].attachmentNote,/keine Bilddaten/);
  const response={steps:[{type:'model_output',content:[{type:'thought',text:'private reasoning'},{type:'text',text:'Nächster Schritt.'}]}]};
  assert.equal(quality.interactionText(response),'Nächster Schritt.');
});

test('Only actual HTTP source annotations are returned, deduplicated and bounded',()=>{
  const response={steps:[{type:'model_output',content:[{type:'text',text:'Antwort',annotations:[
    {uri:'https://example.com/docs',title:'Docs'},{uri:'https://example.com/docs',title:'Docs'},
    {uri:'javascript:alert(1)'},{uri:'https://secret:password@example.com/'},...Array.from({length:8},(_,i)=>({uri:`https://example.org/${i}`}))
  ]}]}]};
  const sources=quality.interactionSources(response);
  assert.equal(sources.length,4);assert.equal(sources[0].url,'https://example.com/docs');
  assert.doesNotMatch(JSON.stringify(sources),/password|javascript/);
});

test('A provider refusal is not retried through another model',async()=>{
  const f=supportFixture({primary:()=>({steps:[{type:'model_output',content:[{type:'refusal',text:'Refused'}]}]})});
  await assert.rejects(f.ctx.askGeminiSupport(f.message,f.ticket),/AI_BLOCKED_RESPONSE/);
  assert.equal(f.calls.fallback.length,0);
});

test('Human handoff summary includes both tried AI steps and user results within embed size',async()=>{
  const f=supportFixture();f.messages.push({id:'99',createdTimestamp:99,author:{id:'u',tag:'User'},content:'Habe neu gestartet, gleicher Fehler.'});
  vm.runInContext(section('async function localTicketSummary(', 'async function summarizeTicketForHuman('),f.ctx);
  const summary=await f.ctx.localTicketSummary({...f.message.channel,guild:f.message.guild},f.ticket);
  assert.match(summary,/KI: Starte den Bot/);assert.match(summary,/gleicher Fehler/);assert.ok(summary.length<3900);
});

test('All code outside authorized AI regions is byte-identical to the preceding setup release',()=>{
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ai-quality-preservation.json'),'utf8'));
  let text=source;
  for(const [start,end] of spec.sections){const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0 && b>a,start);text=text.slice(0,a)+text.slice(b);}
  assert.equal(require('node:crypto').createHash('sha256').update(text).digest('hex'),spec.sha256);
});
