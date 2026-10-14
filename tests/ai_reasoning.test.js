'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const brain=require('../src/ai_reasoning');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
const pair=(q,a)=>[{role:'user',parts:[{text:q}]},{role:'model',parts:[{text:a}]}];
const request={model:'gemini-3.8-flash',contents:[{role:'user',parts:[{text:'Berechne 7 + 8 * 2'}]}],config:{systemInstruction:'Deutsch; nichts löschen.',maxOutputTokens:2400,tools:[{googleSearch:{}}]}};
const plan=brain.taskPlan('Berechne 7 + 8 * 2');
test('Task routing distinguishes smalltalk, code, arithmetic and failed-step followups',()=>{
  assert.equal(brain.taskPlan('yo').detailed,false);assert.equal(brain.taskPlan('yo').review,false);
  assert.equal(brain.taskPlan('Erstelle ein JavaScript Script für Discord').review,true);
  assert.equal(plan.kind,'math');assert.equal(plan.review,true);
  const history=[...pair('YouTube Fehler 404','Prüfe den Link'),...pair('hat nix gebracht','Starte neu')];
  assert.equal(brain.taskPlan('nope',history).failed_reports,2);assert.equal(brain.taskPlan('nope',history).review,true);
  assert.equal(brain.taskPlan('yo',history).review,false);assert.equal(brain.taskPlan('yo',history).failed_reports,0);
});
test('Gemini 3 receives supported thinking levels and enough room for thinking plus an answer',()=>{
  const config=brain.modelConfig('gemini-3.8-flash',plan,request.config);
  assert.equal(config.thinkingConfig.thinkingLevel,'HIGH');assert.equal(config.thinkingConfig.includeThoughts,false);assert.equal(config.maxOutputTokens,12000);
  const casual=brain.modelConfig('models/gemini-3.1-flash-lite',{detailed:false,deep:false},{maxOutputTokens:1200});assert.equal(casual.thinkingConfig.thinkingLevel,'LOW');
  assert.deepEqual(config.tools,request.config.tools);assert.equal(request.config.thinkingConfig,undefined);
});
test('Gemini 2.5 uses a budget instead of levels; unknown and image models keep compatible settings',()=>{
  const config=brain.modelConfig('gemini-2.5-flash',plan,{maxOutputTokens:1200});assert.equal(config.thinkingConfig.thinkingBudget,4096);assert.equal(config.thinkingConfig.thinkingLevel,undefined);assert.ok(config.maxOutputTokens>4096);
  for(const model of ['custom-model','gemini-3.1-flash-lite-image','gemini-2.5-flash-live'])assert.deepEqual(brain.modelConfig(model,plan,{maxOutputTokens:1200}),{maxOutputTokens:1200});
});
test('Unsupported thinking or unavailable reasoning model retries once on the original configured model',async()=>{
  for(const status of [400,404]) {
    const calls=[];const result=await brain.generateAnswer(request,{plan,fallbackModel:'configured-chat',generate:async(r)=>{calls.push(r);if(calls.length===1)throw {status};return {text:'compatible'};}});
    assert.equal(result.text,'compatible');assert.equal(calls.length,2);assert.equal(calls[1].model,'configured-chat');assert.equal(calls[1].config.thinkingConfig,undefined);assert.deepEqual(calls[1].config.tools,request.config.tools);
  }
});
test('Permission, queue and rate-limit failures are not disguised as compatibility errors',async()=>{
  for(const error of [{status:401},{status:429},new Error('AI_SHUTTING_DOWN')]) {
    let calls=0;await assert.rejects(brain.generateAnswer(request,{plan,fallbackModel:'configured',generate:async()=>{calls++;throw error;}}));assert.equal(calls,1);
  }
});
test('Truncated answers get one bounded repair with more room and reduced reasoning level',async()=>{
  const calls=[];const result=await brain.generateAnswer(request,{plan,generate:async r=>{calls.push(r);return calls.length===1?{text:'incomplete',candidates:[{finishReason:'MAX_TOKENS'}]}:{text:'complete',candidates:[{finishReason:'STOP'}]};}});
  assert.equal(result.text,'complete');assert.equal(calls.length,2);assert.equal(calls[1].config.thinkingConfig.thinkingLevel,'MEDIUM');assert.equal(calls[1].config.maxOutputTokens,24000);
});
test('Persistent truncation is reported instead of delivering an unfinished result',async()=>{
  let calls=0;await assert.rejects(brain.generateAnswer(request,{plan,generate:async()=>{calls++;return {text:'incomplete',candidates:[{finishReason:'MAX_TOKENS'}]};}}),/AI_TRUNCATED_RESPONSE/);assert.equal(calls,2);
});
test('A checked correction keeps the original request, style, constraints and grounding metadata',async()=>{
  const draft={text:'7 + 8 * 2 = 30',candidates:[{groundingMetadata:{groundingChunks:[]}}]};let actual;
  const corrected=await brain.reviewAnswer(request,draft,{plan,generate:async r=>{actual=r;return {text:JSON.stringify({verdict:'revise',answer:'7 + 8 × 2 = 23.'})};}});
  assert.equal(corrected.text,'7 + 8 × 2 = 23.');assert.equal(corrected.candidates,draft.candidates);
  assert.equal(actual.contents[0],request.contents[0]);assert.match(actual.config.systemInstruction,/Deutsch; nichts löschen/);assert.match(actual.config.systemInstruction,/keine Websuche/);assert.equal(actual.config.tools,undefined);
  assert.equal(actual.config.responseMimeType,'application/json');assert.equal(actual.contents.at(-2).parts[0].text,draft.text);
});
test('Malformed, empty, extra-field, truncated and failed checks preserve a complete original answer',async()=>{
  const draft={text:'complete'};
  for(const output of ['not json','{"verdict":"revise","answer":""}','{"verdict":"revise","answer":"wrong","extra":1}','{"verdict":"keep","answer":"ignored"}'])assert.equal(await brain.reviewAnswer(request,draft,{plan,generate:async()=>({text:output})}),draft);
  assert.equal(await brain.reviewAnswer(request,draft,{plan,generate:async()=>{throw {status:429};}}),draft);
  assert.equal(await brain.reviewAnswer(request,draft,{plan,generate:async()=>({text:'{"verdict":"revise","answer":"cut"}',candidates:[{finishReason:'MAX_TOKENS'}]})}),draft);
});
test('Simple chat and the review-off switch do not make an extra API request',async()=>{
  const draft={text:'yo'},generate=async()=>{throw new Error('Unexpected review');};
  assert.equal(await brain.reviewAnswer(request,draft,{plan:brain.taskPlan('yo'),generate}),draft);
  assert.equal(await brain.reviewAnswer(request,draft,{plan,enabled:false,generate}),draft);
});
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function fixture({env={},answer,history=[]}={}) {
  const calls=[],db={users:{}};
  const ctx={Date,Map,Set,JSON,console:{warn(){}},require:localRequire,process:{env},db,AI_NAME:'Pixel Gojo',BOT_NAME:'Pixel',GEMINI_MODEL:'gemini-3.1-flash-lite',GEMINI_SUPPORT_MODEL:'gemini-3.8-flash',saveDB:()=>{},
    getGuildLearnContext:()=>({knowledge:'',instructions:''}),getAiFeedbackText:()=>'',geminiStatus:e=>e.status,
    generateGeminiContent:async(r,options)=>{calls.push({request:r,options});return answer?answer(r,options,calls.length):{text:'complete'};}};
  vm.createContext(ctx);vm.runInContext(section('const aiConversationHistory','const geminiSerialByModel')+section('function aiQuality()', 'function splitDiscordText(')+section('function chatAiErrorMessage(', 'const ticketAiQueues'),ctx);
  if(history.length)ctx.getAiMemory().write('g','u','c',history);
  return {ctx,calls,db};
}
test('Actual chat switches hard tasks to the stronger configured model and saves only the checked result',async()=>{
  const f=fixture({answer:(r,o)=>o.label==='slash_ai_review'?{text:'{"verdict":"revise","answer":"Das Ergebnis ist 23."}'}:{text:'Das Ergebnis ist 30.'}});
  const result=await f.ctx.askGemini('Berechne 7 + 8 * 2','U','g','u','c','senz-de');
  assert.equal(result,'Das Ergebnis ist 23.');assert.equal(f.calls[0].request.model,'gemini-3.8-flash');assert.equal(f.calls[0].request.config.thinkingConfig.thinkingLevel,'HIGH');assert.equal(f.calls.length,2);
  const saved=f.db.users['g:u'].aiConversations.c.messages;assert.equal(saved.length,2);assert.equal(saved[1].parts[0].text,result);assert.match(f.calls[1].request.config.systemInstruction,/Antworte auf Deutsch, kurz und locker/);
});
test('Configured reasoning overrides and review-off remain supported; greetings keep the lightweight model',async()=>{
  const f=fixture({env:{GEMINI_REASONING_MODEL:'gemini-2.5-pro',GEMINI_ANSWER_REVIEW:'false'}});
  await f.ctx.askGemini('Erstelle JavaScript Code','U','g','u','c');assert.equal(f.calls.length,1);assert.equal(f.calls[0].request.model,'gemini-2.5-pro');assert.equal(f.calls[0].request.config.thinkingConfig.thinkingBudget,4096);
  await f.ctx.askGemini('yo','U','g','u','c');assert.equal(f.calls.at(-1).request.model,'gemini-3.1-flash-lite');assert.equal(f.calls.length,2);
});
test('Failed draft checks preserve the final response and do not erase existing conversation context',async()=>{
  const f=fixture({history:pair('Android, nichts löschen','Okay'),answer:(r,o)=>{if(o.label==='slash_ai_review')throw {status:503};return {text:'Erstelle die Datei ohne deine vorhandenen Dateien zu löschen.'};}});
  const result=await f.ctx.askGemini('Erstelle ein JavaScript Script','U','g','u','c');assert.match(result,/ohne/);assert.equal(f.db.users['g:u'].aiConversations.c.messages.length,4);
});
test('Every source from the role update is preserved outside the exact documented AI changes',()=>{
  const {spec,previousRolesRelease}=require('./ai_boost_preservation');assert.equal(Object.keys(spec).length,40);assert.equal(Object.values(spec).filter(x=>x.edits.length).length,1);
  for(const [name,item]of Object.entries(spec))assert.equal(crypto.createHash('sha256').update(previousRolesRelease(name,fs.readFileSync(path.join(__dirname,'../src',name),'utf8'))).digest('hex'),item.sha256,name);
});
