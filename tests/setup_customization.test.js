'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ChannelType,PermissionsBitField}=require('discord.js');
const {fixture,compact}=require('./server_setup_designs.test');
const reset=require('../src/server_setup_reset');
const {buildOperations,buildPreset,validatePlan}=require('../src/server_setup_designs');
const {applySelectedStyle}=require('../src/server_setup_customization');
async function form(f,modal,text) {
  const i=f.interaction({customId:modal.data.custom_id,isModalSubmit:()=>true,fields:{getTextInputValue:()=>text}});
  await f.designer.handleInteraction(i);return i;
}
async function confirm(f,text=reset.CONFIRMATION) {await f.act('apply');return form(f,f.last(),text);}
async function preview(options={}) {
  const f=fixture({canReset:true,...options});
  const category=f.add({id:'old-category',name:'Vorher',type:ChannelType.GuildCategory});
  const chat=f.add({id:'old-chat',name:'chat',parent:category.id,topic:'Alter Verlauf'});
  f.gd.channels.counting=chat.id;f.gd.counting={current:42,lastUserId:'existing-user',channelId:chat.id};
  await f.custom();await f.act('mode');return {f,category,chat};
}
test('Additional wishes preserve each selected preset and carry its exact draft and style into the planner',async()=>{
  for (const style of ['brackets','clean','fancy']) {
    const f=fixture();await f.open();await f.act('choose',{values:[style]});await f.act('custom');
    await form(f,f.last(),'Voice über Blabla, behalte meinen gewählten Stil');
    const context=JSON.parse(f.state.ai[0].request.contents);
    assert.equal(context.gewaehltesDesign,style);assert.deepEqual(context.aktuellerEntwurf,buildPreset(style));
    assert.match(f.state.ai[0].request.config.systemInstruction,/bindend/);
    const names=f.last().embeds[0].data.description;
    assert.match(names,style==='brackets' ? /『💬』𝐦𝐞𝐞𝐫/ : style==='clean' ? /💬│meer-chat/ : /💬𝕞𝕖𝕖𝕣/);
    assert.equal(f.state.creates.length,0);
  }
});
test('A deliberately selected custom design releases the preset style while a normal refinement retains it',async()=>{
  const f=fixture();await f.open();await f.act('choose',{values:['brackets']});await f.act('choose',{values:['custom']});
  await form(f,f.last(),'Eigene normale Schrift');assert.equal(JSON.parse(f.state.ai[0].request.contents).gewaehltesDesign,'custom');
  assert.match(f.last().embeds[0].data.description,/💬│meer-chat/);
});
test('Style enforcement is idempotent and keeps emojis, channel types, purposes, keys and requested order',()=>{
  for (const style of ['brackets','clean','fancy']) {
    const first=validatePlan(applySelectedStyle(buildPreset(style),style,buildPreset(style)));
    assert.deepEqual(first,buildPreset(style));
    assert.deepEqual(applySelectedStyle(first,style,first),first);
  }
});
test('Voice-above-text requests use ordered categories and persist the desired voice order with the Discord API',async()=>{
  const plan={title:'Voice über Blabla',categories:[
    {key:'voice-area',name:'🔊 Voice',channels:[{key:'gaming',name:'🎮 Gaming',kind:'voice',access:'public',purpose:null},{key:'chill',name:'😌 Chill',kind:'voice',access:'public',purpose:null}]},
    {key:'chat-area',name:'💬 Blabla',channels:[{key:'chat',name:'💬 Chat',kind:'text',access:'public',purpose:null}]}
  ]};
  const f=fixture({generate:()=>({text:JSON.stringify(plan)})});await f.custom();await f.act('apply');
  const positions=f.state.positions[0],r=f.gd.serverDesign;
  assert.equal(positions.find(x=>x.channel===r.categories['voice-area']).position,0);
  assert.equal(positions.find(x=>x.channel===r.categories['chat-area']).position,1);
  assert.equal(positions.find(x=>x.channel===r.channels.gaming).position,0);
  assert.equal(positions.find(x=>x.channel===r.channels.chill).position,1);
  assert.ok(positions.every(x=>x.parent===undefined && x.lockPermissions===undefined));
});
test('Keeping old channels is the default and a cancelled reset preview changes no channels or database',async()=>{
  const f=fixture({canReset:true});const old=f.add({id:'old-chat',name:'chat'});await f.custom();
  assert.match(f.last().content,/Alte Kanäle behalten/);await f.act('apply');assert.ok(f.guild.channels.cache.has(old.id));assert.deepEqual(f.state.deleted,[]);
  const other=await preview();assert.match(other.f.last().content,/2 alte Kanäle/);assert.equal(other.f.last().files.length,2);
  await other.f.act('cancel');assert.equal(other.f.state.saves,0);assert.equal(other.f.state.creates.length,0);assert.equal(other.f.state.deleted.length,0);
});
test('Ordinary users need no channel permissions to keep/setup but cannot enable a full reset',async()=>{
  const f=fixture({userAllowed:false});f.add({id:'old-chat',name:'chat'});await f.custom();const p=f.last();
  await f.act('mode');assert.match(f.last().content,/Owner.*Bot-Verwaltung/);assert.equal(f.state.saves,0);
  await f.act('apply',{},p);assert.ok(f.state.creates.length);assert.deepEqual(f.state.deleted,[]);
});
test('Deletion requires the exact typed phrase; wrong users, wrong guilds and wrong input perform no writes',async()=>{
  const {f}=await preview();const p=f.last();await f.act('apply');const modal=f.last();
  assert.match(modal.data.title,/endgültig/);
  for(const extra of [{user:{id:'intruder'}},{guild:{...f.guild,id:'different-server'}}]) {
    const i=f.interaction({customId:modal.data.custom_id,isModalSubmit:()=>true,fields:{getTextInputValue:()=>reset.CONFIRMATION},...extra});
    await f.designer.handleInteraction(i);assert.match(i.last.content,/anderen Nutzer/);
  }
  await form(f,modal,'ja');assert.match(f.last().content,/stimmt nicht/);assert.equal(f.state.saves,0);assert.equal(f.state.creates.length,0);assert.equal(f.state.deleted.length,0);
  await f.act('mode',{},p);assert.match(f.last().content,/Alte Kanäle behalten/);
});
test('Confirmed reset creates and configures replacements before deleting only reviewed old IDs, children before categories',async()=>{
  const {f,category,chat}=await preview({userAllowed:false});const backup=JSON.parse(f.last().files[0].attachment.toString());
  assert.equal(backup.channels.length,2);assert.match(backup.notice,/keine Nachrichten/);assert.equal(backup.bindings.channels.counting,chat.id);
  await confirm(f);
  assert.equal(f.gd.serverDesign.reset.status,'complete');assert.deepEqual(f.state.deleted,[chat.id,category.id]);
  assert.equal(f.state.creates.length,4);assert.equal(f.state.configures,1);
  const firstDelete=f.state.history.findIndex(x=>x.startsWith('delete:'));
  assert.ok(firstDelete>f.state.history.indexOf('configure'));assert.ok(firstDelete>f.state.history.indexOf('positions'));
  assert.ok(Object.values(f.gd.serverDesign.channels).every(id=>f.guild.channels.cache.has(id)));
  assert.equal(f.gd.channels.counting,undefined);assert.equal(f.gd.counting.current,42);
  assert.match(f.last().content,/2 alte Kanäle\/Kategorien gelöscht · 0 verblieben/);
  await f.open();assert.equal(f.last().files.length,1,'Last structural backup is downloadable after completion');
});
test('A change between the preview and typed confirmation requires another reviewed preview before mutations',async()=>{
  const {f,chat}=await preview();await f.act('apply');const modal=f.last();chat.name='changed-by-someone';await form(f,modal,reset.CONFIRMATION);
  assert.match(f.last().content,/inzwischen geändert/);assert.equal(f.state.creates.length,0);assert.equal(f.state.deleted.length,0);
  await form(f,modal,reset.CONFIRMATION);assert.match(f.last().content,/bereits geändert/);
});
test('Failed creation, positions, panel configuration or storage never begin deletion',async()=>{
  for(const options of [{failCreate:data=>data.name.includes('logs')},{failPositions:true},{failConfigure:true},{failSave:()=>true}]) {
    const {f,chat}=await preview(options);await confirm(f);
    assert.deepEqual(f.state.deleted,[]);assert.ok(f.guild.channels.cache.has(chat.id));assert.equal(f.locks.size,0);
  }
});
test('Partial creation resumes from the durable replacement IDs without creating duplicates',async()=>{
  let fail=true;const {f}=await preview({failCreate:data=>fail && data.name.includes('logs')});await confirm(f);
  assert.equal(f.state.creates.length,3);assert.equal(f.gd.serverDesign.reset.status,'building');assert.equal(f.state.deleted.length,0);
  fail=false;await f.open();assert.match(f.last().content,/unterbrochen/);await confirm(f);
  assert.equal(f.state.creates.length,4);assert.equal(f.gd.serverDesign.reset.status,'complete');assert.equal(f.state.deleted.length,2);
});
test('A interrupted delete survives a restart and only the original remaining IDs are eligible for retry',async()=>{
  let fail=true;const {f}=await preview({failDelete:ch=>ch.type===ChannelType.GuildCategory && fail});await confirm(f);
  assert.equal(f.state.deleted.length,1);assert.equal(f.gd.serverDesign.reset.status,'partial');const ids=JSON.stringify(f.gd.serverDesign.reset.oldChannels.map(ch=>ch.id));
  // Reconstruct the designer with the same database/cache, rather than relying on its former in-memory session.
  f.restart();fail=false;await f.open();await confirm(f);
  assert.equal(JSON.stringify(f.gd.serverDesign.reset.oldChannels.map(ch=>ch.id)),ids);assert.equal(f.state.creates.length,4);assert.equal(f.gd.serverDesign.reset.status,'complete');
});
test('New or changed channels during replacement construction stop deletion and an explicit stop retains all remaining channels',async()=>{
  let f;
  const p=await preview({onResetPrepared:async()=>{f.add({id:'new-by-admin',name:'later'});}});f=p.f;
  await confirm(f);assert.equal(f.state.deleted.length,0);assert.equal(f.gd.serverDesign.reset.status,'partial');
  await f.open();const scoped=f.gd.serverDesign.reset.oldChannels.map(ch=>ch.id);assert.ok(!scoped.includes('new-by-admin'));
  await f.act('abandon');assert.equal(f.gd.serverDesign.reset.status,'abandoned');assert.ok(f.guild.channels.cache.has(p.chat.id));assert.ok(f.guild.channels.cache.has('new-by-admin'));
  await f.open();assert.ok(f.cid('choose'));
});
test('Active games/tickets and removed bot/controller rights stop a reset before creation',async()=>{
  const options={canReset:true,blockers:['aktive Mimic Party','offene Tickets']};const {f}=await preview(options);await confirm(f);
  assert.match(f.last().content,/Beende zuerst/);assert.equal(f.state.creates.length,0);assert.equal(f.state.deleted.length,0);
  const denied=await preview();denied.f.guild.members.me.permissions={has:()=>false};await confirm(denied.f);assert.equal(denied.f.state.creates.length,0);
});
test('API failures during deletion stop further deletes, including categories with remaining children',async()=>{
  const {f,category,chat}=await preview({failDelete:ch=>ch.id==='old-chat'});await confirm(f);
  assert.equal(f.gd.serverDesign.reset.status,'partial');assert.ok(f.guild.channels.cache.has(category.id));assert.ok(f.guild.channels.cache.has(chat.id));assert.deepEqual(f.state.deleted,[]);
});
test('An old channel already removed in Discord is acknowledged as gone and never retried as a new ID',async()=>{
  const {f}=await preview({failDelete:ch=>ch.id==='old-chat' ? 10003 : false});await confirm(f);
  assert.equal(f.gd.serverDesign.reset.status,'complete');assert.equal(f.gd.serverDesign.reset.deleted.length,2);assert.ok(!f.guild.channels.cache.has('old-chat'));assert.equal(f.state.creates.length,4);
});
test('Community/system references require bot Server verwalten and move to replacements before old channels disappear',async()=>{
  const {f,chat}=await preview();f.guild.rulesChannelId=chat.id;f.guild.publicUpdatesChannelId=chat.id;
  f.guild.edit=async values=>{f.state.history.push('references');for(const [key,value] of Object.entries(values))if(key!=='reason')f.guild[key+'Id']=value;};
  // Setting references changes the reviewed fingerprint, so review the refreshed reset preview first.
  await confirm(f);assert.match(f.last().content,/inzwischen geändert/);await confirm(f);
  assert.equal(f.gd.serverDesign.reset.status,'complete');assert.ok(f.guild.channels.cache.has(f.guild.rulesChannelId));assert.ok(f.guild.channels.cache.has(f.guild.publicUpdatesChannelId));
  assert.ok(f.state.history.indexOf('references')<f.state.history.findIndex(x=>x.startsWith('delete:')));
  const denied=await preview();denied.f.guild.systemChannelId=denied.chat.id;denied.f.guild.members.me.permissions={has:p=>p!==PermissionsBitField.Flags.ManageGuild};
  await confirm(denied.f);assert.match(denied.f.last().content,/Bot braucht.*Server verwalten/);assert.equal(denied.f.state.creates.length,0);
});
test('Reset capacity checks require space for both structures and preserve everything at the channel limit',()=>{
  const f=fixture();for(let n=0;n<498;n++)f.add({id:'existing-'+n,name:'old-'+n});
  assert.throws(()=>buildOperations(compact(),f.guild,f.gd,true,[],{},{}),/gleichzeitig existieren/);assert.equal(f.state.deleted.length,0);
});
function actualIntegration() {
  const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
  const f=fixture(),rows=[],state={mimic:false,spotify:false,edits:[]};let config;
  const context={serverSetupDesigner:null,require:()=>({createServerSetupDesigner:c=>(config=c,{}),purposeChannelIds(){}}),
    guildData:()=>f.gd,saveDB(){},generateGeminiContent(){},GEMINI_MODEL:'model',GEMINI_API_KEY:'key',SMART_SETUP_PURPOSES:[],setupInProgress:new Set(),upsertSetupPanel(){},OWNER_ID:'bot-owner',canManageBotSettings:i=>i.member?.manager===true,
    db:{tickets:{},teams:{},staff:{}},mimicParty:{hasSession:()=>state.mimic},spotifyParty:{isActiveOrStarting:()=>state.spotify},ChannelType,
    channelIsPrivateForEveryone:ch=>ch.private,
    youtubeUploads:{monitor:{list:gid=>rows.filter(row=>row.guildId===gid),edit:async(id,gid,changes)=>{const row=rows.find(r=>r.id===id && r.guildId===gid);state.edits.push({id,changes});Object.assign(row,changes);}}}
  };
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function getServerSetupDesigner()'),source.indexOf('async function runServerSetup('))+'\ngetServerSetupDesigner();',context);
  return {f,config,context,rows,state};
}
test('Actual index authorizes the bot/server owner without channel flags and guards active voice parties, tickets and teams',()=>{
  const {f,config,context,state}=actualIntegration();f.guild.ownerId='server-owner';
  assert.equal(config.canResetServer({guild:f.guild,user:{id:'server-owner'},member:{}}),true);
  assert.equal(config.canResetServer({guild:f.guild,user:{id:'bot-owner'},member:{}}),true);
  assert.equal(config.canResetServer({guild:f.guild,user:{id:'ordinary'},member:{}}),false);
  f.add({id:'ticket',name:'open-ticket'});f.add({id:'team',name:'team'});
  context.db.tickets.ticket={guildId:f.guild.id,channelId:'ticket',status:'open'};context.db.teams.team={guildId:f.guild.id,channelId:'team',open:true};
  state.mimic=state.spotify=true;assert.equal(config.getResetBlockers(f.guild).length,4);
  context.db.tickets.ticket.status='closed';context.db.teams.team.open=false;state.mimic=state.spotify=false;assert.equal(config.getResetBlockers(f.guild).length,0);
});
test('Actual index retargets upload subscriptions before reset without losing seen uploads, pending deliveries or ping roles',async()=>{
  const {f,config,rows,state}=actualIntegration();const old=f.add({id:'old-youtube',name:'old-uploads'});const next=f.add({id:'new-youtube',name:'new-uploads'});
  const sub={id:'sub',guildId:f.guild.id,targetId:old.id,channelId:'youtube-source',seenIds:['already-announced'],pending:[{id:'next-upload'}],pingRoleId:'my-role'};
  rows.push(sub,{id:'other-guild',guildId:'elsewhere',targetId:old.id,channelId:'youtube-source'});
  await config.onResetPrepared(f.guild,{oldChannels:[{id:old.id}],replacements:{channels:{youtube:next.id}}});
  assert.equal(sub.targetId,next.id);assert.deepEqual(sub.seenIds,['already-announced']);assert.deepEqual(sub.pending,[{id:'next-upload'}]);assert.equal(sub.pingRoleId,'my-role');assert.equal(rows[1].targetId,old.id);assert.equal(state.edits.length,1);
});
test('Upload target migration rejects missing/private mismatches and duplicate subscriptions before modifying any subscription',async()=>{
  for(const mode of ['missing','private','duplicate']) {
    const {f,config,rows,state}=actualIntegration();f.add({id:'old-youtube',name:'old-uploads'});if(mode!=='missing')f.add({id:'new-youtube',name:'new-uploads',private:mode==='private'});
    rows.push({id:'first',guildId:f.guild.id,targetId:'old-youtube',channelId:'same-source'});
    if(mode==='duplicate')rows.push({id:'second',guildId:f.guild.id,targetId:'old-youtube',channelId:'same-source'});
    await assert.rejects(()=>config.onResetPrepared(f.guild,{oldChannels:[{id:'old-youtube'}],replacements:{channels:{youtube:'new-youtube'}}}));
    assert.equal(state.edits.length,0);assert.ok(rows.every(row=>row.targetId==='old-youtube'));
  }
});
test('A reset explicitly ended from a second session cannot be resumed by an earlier confirmation',async()=>{
  const {f}=await preview({failPositions:true});await confirm(f);await f.open();await f.act('apply');const stale=f.last();
  await f.open();await f.act('abandon');await form(f,stale,reset.CONFIRMATION);
  assert.match(f.last().content,/beendet oder ersetzt/);assert.equal(f.state.deleted.length,0);assert.equal(f.gd.serverDesign.reset.status,'abandoned');
});
test('Only the reviewed server-setup changes differ from v1.9.2; every prior module retains its other source',()=>{
  const {previousPermissionsRelease,spec}=require('./setup_customization_preservation');
  for(const [file,expected] of Object.entries(spec)) {
    const current=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
    assert.equal(crypto.createHash('sha256').update(previousPermissionsRelease(file,current)).digest('hex'),expected.sha256,file);
  }
});
