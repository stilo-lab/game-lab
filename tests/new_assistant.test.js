'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PermissionsBitField,ChannelType,MessageFlags}=require('discord.js');
const {createNewAssistant,validatePlan}=require('../src/new_assistant');
const F=PermissionsBitField.Flags;
function fixture(plan,opts={}){
  const state={jobs:{},channels:new Map(),roles:new Map(),writes:[],outputs:[],clock:1000,saves:0,modelCalls:0,maintenance:false,failSave:false};
  const all=new PermissionsBitField(Object.values(F));
  const member={id:'u',permissions:opts.userPermissions||all},bot={id:'b',permissions:opts.botPermissions||all};
  const gd={channels:{},counting:{current:78,lastUserId:'old',lastMessageId:'saved'},newJobs:{},setupOverrides:{}};
  const settings={aiEnabled:true,supportAiEnabled:true,autoModEnabled:true};
  function makeChannel(id,name,type=ChannelType.GuildText,parentId=null){
    const c={id,name,type,parentId,permissionsFor:m=>opts.channelPermissions?.[id]?.[m.id]||m.permissions,
      setName:async name=>{state.writes.push(['rename',id]);c.name=name;},setTopic:async text=>{state.writes.push(['topic',id,text]);},
      send:async payload=>{state.writes.push(['send',id,payload]);if(opts.sendError)throw Error('Discord nicht erreichbar');return {id:'msg',url:'https://discord.com/channels/g/c/msg'};}};
    state.channels.set(id,c);return c;
  }
  makeChannel('c','chat');
  const guild={id:'g',name:'Server',members:{fetch:async()=>member,fetchMe:async()=>bot},
    channels:{fetch:async()=>new Map(state.channels),create:async data=>{state.writes.push(['create',data]);return makeChannel('new'+state.channels.size,data.name,data.type,data.parent||null);}},
    roles:{fetch:async()=>state.roles,create:async data=>{state.writes.push(['role',data]);const r={id:'role',name:data.name,managed:false,permissions:new PermissionsBitField(0n)};state.roles.set(r.id,r);return r;}}};
  const locks=new Set();
  const dependencies={now:()=>state.clock,guildData:()=>gd,serverSettings:()=>settings,setupLocks:locks,model:'configured',isMaintenance:()=>state.maintenance,
    saveDB:()=>{if(state.failSave)throw Error('ENOSPC');state.saves++;},resetMemory:(...args)=>state.writes.push(['reset',...args]),
    generateGeminiContent:async r=>{state.modelCalls++;state.request=r;if(opts.generate)return opts.generate(r);return {text:typeof plan==='string'?plan:JSON.stringify(plan)};}};
  const assistant=createNewAssistant(dependencies);
  function interaction(extra={}){const i={id:'request',guild,user:{id:'u'},channelId:'c',customId:'',deferred:false,
    options:{getString:()=>opts.request||'Mein Wunsch',getBoolean:()=>opts.preview||false},
    reply:async p=>state.outputs.push(p),deferReply:async p=>{state.outputs.push(p);i.deferred=true;},deferUpdate:async()=>{i.deferred=true;},editReply:async p=>{state.outputs.push(p);return p;},...extra};return i;}
  const button=()=>state.outputs.findLast(p=>p.components?.length)?.components[0].toJSON().components[0].custom_id;
  const last=()=>state.outputs.at(-1);
  return {state,gd,settings,locks,assistant,dependencies,interaction,button,last,makeChannel,member,bot};
}
const plan=actions=>({summary:'Dein Auftrag',actions});
test('New creates a complete category/text/voice structure and preserves all old data',async()=>{
  const f=fixture(plan([{kind:'category',name:'Gaming'},{kind:'text_channel',name:'gaming-chat',parent:'Gaming'},{kind:'voice_channel',name:'Lobby',parent:'Gaming'}]));
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,3);assert.equal(f.state.writes[1][1].parent,'new1');assert.equal(f.state.writes[2][1].parent,'new1');
  assert.equal(f.gd.counting.current,78);assert.equal(f.gd.newJobs.request.state,'done');assert.match(f.last().content,/erledigt/);assert.equal(f.last().allowedMentions.parse.length,0);
});
test('Entire plan is rejected before any effect when the bot lacks a later permission',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'},{kind:'role',name:'VIP'}]),{botPermissions:new PermissionsBitField([F.ManageChannels,F.ViewChannel,F.SendMessages])});
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.equal(f.gd.newJobs.request.state,'failed');
});
test('Bot missing permissions stops the plan; private channels are excluded from the planner',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'}]),{botPermissions:new PermissionsBitField([F.ViewChannel])});
  const no=new PermissionsBitField(0n);f.makeChannel('private','staff');f.state.channels.get('private').permissionsFor=m=>m.id==='u'?no:m.permissions;
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.equal(JSON.parse(f.state.request.contents[0].parts[0].text).server_context.channels.some(c=>c.id==='private'),false);
});
test('Posting needs review and only the request owner can apply it',async()=>{
  const f=fixture(plan([{kind:'post',target:'c',text:'Hallo @everyone'}]));await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);const id=f.button();
  await f.assistant.handleInteraction(f.interaction({customId:id,user:{id:'other'}}));assert.equal(f.state.writes.length,0);
  await f.assistant.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0][2].allowedMentions.parse,[]);
  await f.assistant.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,1);
});
test('Apply refreshes permissions; rights lost after preview cannot be bypassed',async()=>{
  const f=fixture(plan([{kind:'rename_channel',target:'c',name:'renamed'}]));await f.assistant.handle(f.interaction());const id=f.button();f.member.permissions=new PermissionsBitField(0n);
  await f.assistant.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,0);
});
test('Duplicate apply while acknowledgement is pending runs only once',async()=>{
  const f=fixture(plan([{kind:'post',target:'c',text:'Hi'}]));await f.assistant.handle(f.interaction());let release;const ack=new Promise(r=>release=r),id=f.button();
  const pending=f.assistant.handleInteraction(f.interaction({customId:id,deferUpdate:()=>ack}));await f.assistant.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,0);release();await pending;assert.equal(f.state.writes.length,1);
});
test('Duplicate slash interactions cannot create a second job',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'}]));await f.assistant.handle(f.interaction());await f.assistant.handle(f.interaction());assert.equal(f.state.modelCalls,1);assert.equal(f.state.writes.length,1);
});
test('Persisted preview survives restart and an interrupted running job never replays',async()=>{
  const f=fixture(plan([{kind:'post',target:'c',text:'Hi'}]));await f.assistant.handle(f.interaction());const id=f.button();const restarted=createNewAssistant(f.dependencies);
  await restarted.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,1);f.gd.newJobs.request.state='running';await restarted.handleInteraction(f.interaction({customId:id}));assert.equal(f.state.writes.length,1);
});
test('Counting activation preserves the complete counter and pins its channel',async()=>{
  const f=fixture(plan([{kind:'counting',target:'c'}]));await f.assistant.handle(f.interaction());assert.deepEqual(f.gd.counting,{current:78,lastUserId:'old',lastMessageId:'saved',channelId:'c'});assert.equal(f.gd.setupOverrides.counting,'c');
  const g=fixture(plan([{kind:'counting',target:'c'}]));g.gd.channels.counting='elsewhere';await g.assistant.handle(g.interaction());assert.equal(g.gd.channels.counting,'elsewhere');assert.equal(g.gd.counting.current,78);
});
test('A schema attack, arbitrary code and extra permission fields execute no effects',async()=>{
  for(const a of [{kind:'exec',text:'process.exit()'},{kind:'role',name:'Admin',permissions:['Administrator']},{kind:'feature',feature:'__proto__',enabled:true}]){
    const f=fixture(plan([a]));await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.equal(f.gd.newJobs.request.state,'failed');
  }
  assert.throws(()=>validatePlan(plan([{kind:'answer',text:'hi'},{kind:'text_channel',name:'x'}])));
});
test('Preflight refuses privileged existing roles before creating other channels',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'},{kind:'role',name:'Admin'}]));f.state.roles.set('r',{name:'Admin',permissions:new PermissionsBitField(F.Administrator)});await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);
});
test('Feature changes touch only the named flag and ordinary roles get no privileges',async()=>{
  const f=fixture(plan([{kind:'feature',feature:'welcomeEnabled',enabled:false},{kind:'role',name:'VIP',color:'#ffaa00'}]));await f.assistant.handle(f.interaction());assert.equal(f.settings.welcomeEnabled,false);assert.equal(f.settings.aiEnabled,true);assert.deepEqual(f.state.writes[0][1].permissions,[]);
});
test('A later Discord failure reports partial progress instead of claiming completion',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'},{kind:'post',target:'c',text:'Hi'}]),{sendError:true});await f.assistant.handle(f.interaction());await f.assistant.handleInteraction(f.interaction({customId:f.button()}));assert.equal(f.gd.newJobs.request.results.length,1);assert.match(f.last().content,/Teilweise erledigt/);assert.match(f.last().content,/Prüfe den Zielkanal/);
});
test('Shared setup lock, maintenance and expired previews block effects',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'}]));f.locks.add('g');await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);
  const g=fixture(plan([{kind:'post',target:'c',text:'hi'}]));await g.assistant.handle(g.interaction());g.state.clock+=16*60000;await g.assistant.handleInteraction(g.interaction({customId:g.button()}));assert.equal(g.state.writes.length,0);
  const h=fixture(plan([{kind:'text_channel',name:'new'}]));h.state.maintenance=true;await h.assistant.handle(h.interaction());assert.equal(h.state.modelCalls,0);
});
test('Polls use real Discord poll payloads and require SendPolls',async()=>{
  const f=fixture(plan([{kind:'poll',target:'c',text:'Welches Spiel?',options:['Roblox','Minecraft']} ]));await f.assistant.handle(f.interaction());await f.assistant.handleInteraction(f.interaction({customId:f.button()}));assert.equal(f.state.writes[0][2].poll.duration,24);assert.deepEqual(f.state.writes[0][2].poll.answers,[{text:'Roblox'},{text:'Minecraft'}]);
});
test('New channel and ordinary role creation need only bot rights, including apply after user admin rights are removed',async()=>{
  const f=fixture(plan([{kind:'category',name:'Gaming'},{kind:'text_channel',name:'chat-new',parent:'Gaming'},{kind:'voice_channel',name:'Lounge',parent:'Gaming'},{kind:'role',name:'VIP'}]),{preview:true,userPermissions:new PermissionsBitField(F.ViewChannel)});
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);
  await f.assistant.handleInteraction(f.interaction({customId:f.button()}));assert.equal(f.state.writes.length,4);assert.equal(f.gd.newJobs.request.state,'done');
});
test('New posting, polls and channel edits work when the user can only view the channel',async()=>{
  const f=fixture(plan([{kind:'rename_channel',target:'c',name:'neu'},{kind:'topic',target:'c',text:'Neues Thema'},{kind:'post',target:'c',text:'Hallo'},{kind:'poll',target:'c',text:'Spiel?',options:['A','B']}]),{userPermissions:new PermissionsBitField(F.ViewChannel),botPermissions:new PermissionsBitField([F.ViewChannel,F.ManageChannels,F.SendMessages,F.SendPolls])});
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);await f.assistant.handleInteraction(f.interaction({customId:f.button()}));assert.equal(f.state.writes.length,4);assert.equal(f.gd.newJobs.request.state,'done');
});
test('New respects effective bot permissions, hidden channels and permission loss after preview',async()=>{
  const visible=new PermissionsBitField(F.ViewChannel);
  const f=fixture(plan([{kind:'post',target:'c',text:'Hallo'}]),{userPermissions:visible,channelPermissions:{c:{u:visible,b:visible}}});
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.match(f.last().content,/Bot/);
  const g=fixture(plan([{kind:'post',target:'c',text:'Hallo'}]),{userPermissions:visible});await g.assistant.handle(g.interaction());const button=g.button();g.bot.permissions=visible;await g.assistant.handleInteraction(g.interaction({customId:button}));assert.equal(g.state.writes.length,0);
  const hidden=fixture(plan([{kind:'post',target:'private',text:'Hallo'}]),{userPermissions:visible});hidden.makeChannel('private','staff').permissionsFor=m=>m.id==='u'?new PermissionsBitField(0n):m.permissions;
  await hidden.assistant.handle(hidden.interaction());assert.equal(hidden.state.writes.length,0);assert.match(hidden.last().content,/zugänglich/);
});
test('New can create inside a category with effective bot channel rights without global ManageChannels',async()=>{
  const visible=new PermissionsBitField(F.ViewChannel),parentRights=new PermissionsBitField([F.ViewChannel,F.ManageChannels]);
  const f=fixture(plan([{kind:'text_channel',name:'test',parent:'cat'}]),{userPermissions:visible,botPermissions:visible,channelPermissions:{parent:{u:visible,b:parentRights}}});f.makeChannel('parent','cat',ChannelType.GuildCategory);
  await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0][1].parent,'parent');
});
test('New feature administration still checks bot authority, and the bot owner needs no Discord management flags',async()=>{
  const visible=new PermissionsBitField(F.ViewChannel);
  const blocked=fixture(plan([{kind:'feature',feature:'autoModEnabled',enabled:false}]),{userPermissions:visible});await blocked.assistant.handle(blocked.interaction());assert.equal(blocked.settings.autoModEnabled,true);assert.match(blocked.last().content,/Bot-Verwaltung/);
  const f=fixture(plan([{kind:'feature',feature:'welcomeEnabled',enabled:false}]),{userPermissions:visible});f.dependencies.canManageBotSettings=i=>i.user.id==='u';
  await f.assistant.handle(f.interaction());assert.equal(f.settings.welcomeEnabled,false);assert.equal(f.settings.autoModEnabled,true);
});
test('Ambiguous channel names, invalid parents and unreadable targets execute nothing',async()=>{
  const f=fixture(plan([{kind:'topic',target:'chat',text:'test'}]));f.makeChannel('other','chat');await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);
  const g=fixture(plan([{kind:'text_channel',name:'new',parent:'c'}]));await g.assistant.handle(g.interaction());assert.equal(g.state.writes.length,0);
});
test('Database failure before execution prevents all external changes',async()=>{
  const f=fixture(plan([{kind:'text_channel',name:'new'}]));f.state.failSave=true;await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.equal(f.state.modelCalls,0);
});
test('Long answers and preview contents are delivered completely as an attachment',async()=>{
  const full='Antwort '.repeat(600);const f=fixture(plan([{kind:'answer',text:full}]));await f.assistant.handle(f.interaction());assert.equal(f.last().files[0].attachment.toString(),full.trim());assert.equal(f.state.writes.length,0);
});
test('Cancel, cross-server, unknown component and personal memory reset are isolated',async()=>{
  const f=fixture(plan([{kind:'post',target:'c',text:'Hi'}]));await f.assistant.handle(f.interaction());await f.assistant.handleInteraction(f.interaction({customId:f.button().replace(':apply:',':cancel:')}));assert.equal(f.gd.newJobs.request.state,'cancelled');assert.equal(f.state.writes.length,0);
  const g=fixture(plan([{kind:'reset_memory'}]));await g.assistant.handle(g.interaction());assert.deepEqual(g.state.writes[0],['reset','g','u','c']);assert.equal(await g.assistant.handleInteraction(g.interaction({customId:'unrelated'})),false);
});
test('Protected ticket ownership topics and closed channel permissions cannot be changed',async()=>{
  const f=fixture(plan([{kind:'topic',target:'c',text:'Neue Beschreibung'}]));f.state.channels.get('c').topic='ticket-owner:123';await f.assistant.handle(f.interaction());assert.equal(f.state.writes.length,0);assert.match(f.last().content,/geschützt/);
  const g=fixture(plan([{kind:'post',target:'c',text:'Hallo'}]),{channelPermissions:{c:{u:new PermissionsBitField([F.ViewChannel]),b:new PermissionsBitField([F.ViewChannel,F.SendMessages])}}});await g.assistant.handle(g.interaction());assert.equal(g.state.writes.length,0);
});
test('Disabled server AI prevents ordinary users from bypassing the AI switch with new',async()=>{
  const f=fixture(plan([{kind:'answer',text:'Hallo'}]),{userPermissions:new PermissionsBitField([F.ViewChannel,F.SendMessages])});f.settings.aiEnabled=false;await f.assistant.handle(f.interaction());assert.equal(f.state.modelCalls,0);assert.match(f.last().content,/ausgeschaltet/);
});
test('A malformed planner response gets one repair before any external effect',async()=>{
  let calls=0;const f=fixture(null,{generate:async()=>({text:++calls===1?'invalid JSON':JSON.stringify(plan([{kind:'text_channel',name:'repaired'}]))})});await f.assistant.handle(f.interaction());assert.equal(calls,2);assert.equal(f.state.writes.length,1);assert.equal(f.gd.newJobs.request.state,'done');
});
module.exports={fixture};
