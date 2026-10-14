'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const runtime=require('../src/ai_runtime'),youtube=require('../src/youtube_uploads_core');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0 && b>a);return source.slice(a,b);}
test('The recorded /ai null-guild crash returns a clear reply before touching server settings or selection',async()=>{
  for(const guild of [null,undefined,{}]) {
    let reply;const ctx={MessageFlags:{Ephemeral:64},serverSettings:()=>{throw Error('Must not read absent server');},getPixelCharacterPicker:()=>{throw Error('Must not open picker');}};
    vm.createContext(ctx);vm.runInContext('this.handle=async function(interaction){switch(interaction.commandName){'+section('        case "ai": {','        case "aipulse": {')+'}}',ctx);
    await ctx.handle({commandName:'ai',guild,reply:async p=>{reply=p;}});assert.match(reply.content,/Server-Textkanal/);assert.equal(reply.flags,64);
  }
});
test('Existing server AI and disabled-server behavior are preserved',async()=>{
  for(const enabled of [false,true]) {
    let answered=0,reply;const ctx={MessageFlags:{Ephemeral:64},serverSettings:()=>({aiEnabled:enabled}),getPixelCharacterPicker:()=>({hasSelection:()=>true}),answerPixelQuestion:async()=>{answered++;}};
    vm.createContext(ctx);vm.runInContext('this.handle=async function(interaction){switch(interaction.commandName){'+section('        case "ai": {','        case "aipulse": {')+'}}',ctx);
    await ctx.handle({commandName:'ai',guild:{id:'g'},user:{id:'u'},options:{getString:()=> 'yo'},reply:async p=>{reply=p;}});assert.equal(answered,enabled?1:0);if(!enabled)assert.match(reply.content,/ausgeschaltet/);
  }
});
test('Gemini SDK RetryInfo and embedded retry delays are honored without exposing errors',()=>{
  assert.equal(runtime.retryAfterMs({details:[{retryDelay:'39.163s'}]}),39163);
  assert.equal(runtime.retryAfterMs({error:{details:[{retryDelay:'12s'}]}}),12000);
  assert.equal(runtime.retryAfterMs({message:'{"error":{"details":[{"retryDelay":"44.25s"}]}}'}),44250);
  assert.equal(runtime.retryAfterMs({message:'Please retry in 39.163s.'}),39163);
});
test('A no-retry 429 still installs a cooldown, suppresses repeat requests, and permits recovery later',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const q=runtime.createScheduler({isRetryable:e=>e.status===429});t.after(()=>q.close());let calls=0;
  await assert.rejects(q.run('model',()=>{calls++;throw {status:429};},{maxRetries:0}),e=>e.status===429);
  await assert.rejects(q.run('model',()=>{calls++;return 'wrong';}),e=>e.status===429);assert.equal(calls,1);
  assert.equal(await q.run('other-model',()=> 'other works'),'other works');
  t.mock.timers.tick(60001);assert.equal(await q.run('model',()=>{calls++;return 'recovered';}),'recovered');assert.equal(calls,2);
});
test('A long quota delay ends the current request without spending the whole execution budget retrying',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});const q=runtime.createScheduler({isRetryable:e=>e.status===429});t.after(()=>q.close());let calls=0;
  await assert.rejects(q.run('model',()=>{calls++;throw {status:429,details:[{retryDelay:'61s'}]};},{maxRetries:3}),e=>e.status===429);assert.equal(calls,1);
});
test('The Gemini gateway does not start a second model request on exhausted quota',async t=>{
  const calls=[];const ctx={require:localRequire,console:{warn(){}},Map,Date,setTimeout,GEMINI_API_KEY:'mock-key',GEMINI_MODEL:'chat',GEMINI_SUPPORT_MODEL:'support',GEMINI_FALLBACK_MODEL:'fallback',GEMINI_MIN_INTERVAL_MS:0,GEMINI_SUPPORT_MIN_INTERVAL_MS:0,
    geminiClientPromise:Promise.resolve({models:{generateContent:async r=>{calls.push(r.model);throw {status:429};}}})};
  vm.createContext(ctx);vm.runInContext(section('const geminiSerialByModel','function aiQuality()'),ctx);t.after(()=>ctx.getGeminiTaskScheduler().close());
  await assert.rejects(ctx.generateGeminiContent({contents:'test'},{maxRetries:0}),e=>e.status===429);assert.deepEqual(calls,['chat']);
});
const CHANNEL='UC'+'A'.repeat(22),OTHER='UC'+'B'.repeat(22),VIDEO='a'.repeat(11);
const entry=id=>`<entry><yt:videoId>${VIDEO}</yt:videoId><yt:channelId>${id}</yt:channelId><title>Upload</title><published>2026-10-13T00:00:00Z</published></entry>`;
const feed=(header,entries=entry(CHANNEL))=>`<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">${header}${entries}</feed>`;
test('Official YouTube Atom format without a top-level channel ID is accepted through its verified self link',()=>{
  const parsed=youtube.parseFeed(feed(`<link rel="self" href="https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL}"/><title>Channel</title>`),CHANNEL);
  assert.equal(parsed.channelId,CHANNEL);assert.equal(parsed.videos.length,1);
  assert.equal(youtube.parseFeed(feed(`<id>yt:channel:${CHANNEL}</id>`),CHANNEL).videos.length,1);
});
test('Conflicting feed metadata, foreign videos and missing feed identity remain rejected',()=>{
  for(const text of [feed(`<yt:channelId>${OTHER}</yt:channelId><link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}"/>`),
    feed(`<link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=${OTHER}"/>`),
    feed(`<id>yt:channel:${CHANNEL}</id>`,entry(OTHER)),feed(''),feed('<link rel="self" href="https://evil.example/feed"/>')])assert.throws(()=>youtube.parseFeed(text,CHANNEL));
});
test('The video fixes reverse exactly to the tested AI-boost source',()=>{
  const {spec,previousAiBoostRelease}=require('./video_fixes_preservation');assert.equal(Object.keys(spec).length,3);
  for(const[name,item]of Object.entries(spec))assert.equal(crypto.createHash('sha256').update(previousAiBoostRelease(name,fs.readFileSync(path.join(__dirname,'../src',name),'utf8'))).digest('hex'),item.sha256,name);
});
