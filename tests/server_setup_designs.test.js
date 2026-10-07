'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection, PermissionsBitField, ChannelType, MessageFlags } = require('discord.js');
const { createServerSetupDesigner, buildPreset, validatePlan, buildOperations, purposeChannelIds, PRIVATE_PURPOSES, PRESETS } = require('../src/server_setup_designs');
const P = PermissionsBitField.Flags;
const clone = x => JSON.parse(JSON.stringify(x));
const compact = () => ({title:'Mein Wunsch',categories:[
  {key:'public-area',name:'🌊 Lounge',channels:[{key:'chat',name:'💬│meer-chat',kind:'text',access:'public',purpose:null}]},
  {key:'team-area',name:'🔒 Team',channels:[{key:'support-logs',name:'🧾│logs',kind:'text',access:'staff',purpose:'support-logs'}]}
]});
function fixture(options = {}) {
  const state = {now:1000,saves:0,creates:[],edits:[],configures:0,ai:[],outputs:[],roles:0,positions:[],deleted:[],history:[]};
  const gd = {channels:{},setupOverrides:{}};
  let next = 100000000000000000n;
  const everyone = {id:'100000000000000001'};
  const me = {id:'100000000000000002',permissions:{has:p => options.botAllowed !== false}};
  const cache = new Collection();
  const guild = {id:'100000000000000003',roles:{everyone},members:{me},channels:{cache,fetch:async () => cache}};
  function add({id=String(++next),name,type=ChannelType.GuildText,parent=null,private:falsePrivate=false,topic='',permissionOverwrites=[]}) {
    const overwrites = new Collection(permissionOverwrites.map(o => [o.id,{id:o.id,allow:new PermissionsBitField(o.allow || []),deny:new PermissionsBitField(o.deny || [])}]));
    const channel = {id,name,type,parentId:parent,topic,private:falsePrivate,permissionOverwrites:{cache:overwrites},
      permissionsFor:target => ({has:p => target.id === everyone.id && p === P.ViewChannel ? !channel.private : true}),
      delete:async () => {
        const failure=options.failDelete?.(channel);
        if (failure) throw {code:typeof failure==='number' ? failure : 50013};
        state.deleted.push(channel.id);state.history.push('delete:'+channel.id);cache.delete(channel.id);return channel;
      },
      edit:async change => {
        if (options.failEdit?.(channel,change)) throw {code:50013};
        state.edits.push({id,change});
        assert.equal(change.permissionOverwrites,undefined,'Never replace existing permissions');
        if (change.parent !== undefined) { assert.equal(change.lockPermissions,false); channel.parentId=change.parent; }
        if (change.name) channel.name=change.name;
        return channel;
      }
    };
    cache.set(id,channel); return channel;
  }
  guild.channels.create = async data => {
    if (options.failCreate?.(data)) throw {code:50013};
    state.creates.push(data);
    state.history.push('create:'+data.name);
    const deny = data.permissionOverwrites?.find(o => o.id === everyone.id)?.deny || [];
    return add({...data,private:deny.includes(P.ViewChannel)});
  };
  guild.channels.setPositions=async entries => {
    if (options.failPositions) throw Error('positions denied');
    state.positions.push(entries);state.history.push('positions');
    for (const entry of entries) cache.get(entry.channel).rawPosition=entry.position;
    return guild;
  };
  const locks = new Set();
  const makeDesigner = () => createServerSetupDesigner({
    guildData:() => gd,saveDB:() => {if(options.failSave?.(state,gd))throw Error('storage unavailable');state.saves++;},model:'configured-model',aiConfigured:() => options.aiConfigured !== false,
    generateGeminiContent:async (request,config) => {
      state.ai.push({request,config});
      return options.generate ? options.generate(request) : {text:JSON.stringify(compact())};
    },
    setupLocks:locks,now:() => state.now,logger:{warn(){}},
    canResetServer:() => options.canReset === true,getResetBlockers:() => options.blockers || [],onResetPrepared:options.onResetPrepared || (async()=>{}),
    findSupportRole:async () => {state.roles++;return {id:'100000000000000004'};},
    configure:async () => {state.configures++;state.history.push('configure');return {failed:options.failConfigure ? [{canonical:'counting'}] : []};},
    upsertPanel:async () => {},isMaintenance:() => Boolean(options.maintenance),
    purposeAliases:[{canonical:'announcements',aliases:['announcements','news']},{canonical:'support-logs',aliases:['support-logs']}]
  });
  let designer=makeDesigner();
  function interaction(extra = {}) {
    const i = {guild,user:{id:'100000000000000005'},member:{permissions:{has:() => options.userAllowed !== false}},...extra};
    for (const method of ['reply','editReply','update','showModal']) i[method] = async payload => {
      for (const component of payload.components || []) component.toJSON();
      for (const embed of payload.embeds || []) embed.toJSON();
      if (method === 'showModal') payload.toJSON();
      state.outputs.push({method,payload}); i.last = payload; i.replied = true; return payload;
    };
    i.deferReply=async () => {i.deferred=true;}; i.deferUpdate=async () => {i.deferred=true;};
    return i;
  }
  const last = () => state.outputs.at(-1)?.payload;
  const cid = (action,payload=last()) => payload.components.flatMap(r => r.components).map(x => x.data.custom_id).find(x => x?.startsWith(`ssd:${action}:`));
  async function act(action,extra = {},payload = last()) {
    const i = interaction({customId:cid(action,payload),...extra}); await designer.handleInteraction(i); return i;
  }
  async function open() {const i=interaction();await designer.open(i);return i;}
  async function custom() {
    await open(); await act('choose',{values:['custom']});
    const modal = last();
    await designer.handleInteraction(interaction({customId:modal.data.custom_id,isModalSubmit:() => true,fields:{getTextInputValue:() => 'Meer-Thema, nur zwei Kanäle und ein privater Team-Bereich'}}));
  }
  return {state,gd,guild,get designer(){return designer;},restart:()=>{designer=makeDesigner();},locks,add,interaction,last,cid,act,open,custom};
}

test('Three distinct screenshot styles preserve every existing bot purpose and private logs', () => {
  const styles = PRESETS.map(p => buildPreset(p.id));
  for (const plan of styles) {
    const channels=plan.categories.flatMap(c => c.channels);
    assert.equal(channels.length,39);
    assert.equal(channels.filter(c => c.purpose).length,25);
    assert.ok(channels.filter(c => c.purpose?.includes('staff') || c.purpose==='support-logs').every(c => c.access==='staff'));
  }
  const names=styles.map(p => p.categories.flatMap(c=>c.channels).find(c=>c.key==='chat').name);
  assert.match(names[0],/^『💬』𝐂/); assert.equal(names[1],'💬│chat'); assert.match(names[2],/^💬ℂ/);
});
module.exports={fixture,compact};
test('Opening, choosing, changing pages and cancelling only show a private preview', async () => {
  const f=fixture(); await f.open();
  assert.equal(f.last().flags,MessageFlags.Ephemeral);
  assert.equal(f.last().components[0].components[0].options.length,4);
  await f.act('choose',{values:['brackets']});
  await f.act('next'); assert.match(f.last().embeds[0].data.footer.text,/2\/4/);
  await f.act('restyle'); assert.match(f.last().components[1].components.at(-1).data.label,/AUS/);
  await f.act('cancel');
  assert.equal(f.state.creates.length,0); assert.equal(f.state.edits.length,0); assert.equal(f.state.saves,0);
});
test('Custom wishes use the existing Gemini configuration; refined wishes include the previous draft', async () => {
  const f=fixture(); await f.custom();
  assert.equal(f.state.ai.length,1); assert.equal(f.state.ai[0].request.model,'configured-model');
  assert.equal(f.state.ai[0].request.config.responseMimeType,'application/json');
  assert.equal(f.state.creates.length,0);
  await f.act('custom'); const modal=f.last();
  await f.designer.handleInteraction(f.interaction({customId:modal.data.custom_id,isModalSubmit:() => true,fields:{getTextInputValue:()=>'Mach die Namen jetzt rot und kurz'}}));
  assert.deepEqual(JSON.parse(f.state.ai[1].request.contents).aktuellerEntwurf,compact());
  assert.equal(f.state.creates.length,0);
});
test('Only the creator in the same guild can apply a setup preview', async () => {
  const f=fixture(); await f.custom(); const token=f.cid('apply');
  for (const extra of [{user:{id:'someone-else'}},{guild:{...f.guild,id:'other-guild'}}]) {
    const i=f.interaction({customId:token,...extra}); await f.designer.handleInteraction(i);
    assert.match(i.last.content,/anderen Nutzer/);
  }
  assert.equal(f.state.creates.length,0);
});
test('Server setup opens and applies without user administrator or channel-management rights',async()=>{
  const f=fixture({userAllowed:false});await f.custom();await f.act('apply');assert.ok(f.state.creates.length>0);assert.equal(f.state.configures,1);assert.match(f.last().content,/fertig|erstellt/);
});
test('Server setup refreshes bot rights before applying and stops if the bot lost them',async()=>{
  const f=fixture({userAllowed:false});await f.custom();let refreshed=0;f.guild.members.fetchMe=async options=>{assert.equal(options.force,true);refreshed++;f.guild.members.me.permissions={has:()=>false};return f.guild.members.me;};
  await f.act('apply');assert.equal(refreshed,1);assert.equal(f.state.creates.length,0);assert.match(f.last().content,/Bot braucht/);assert.equal(f.locks.size,0);
});
test('Missing AI configuration keeps the built-in styles usable', async () => {
  const f=fixture({aiConfigured:false}); await f.open(); const original=f.last();
  await f.act('choose',{values:['custom']}); assert.match(f.last().content,/GEMINI_API_KEY/);
  await f.act('choose',{values:['clean']},original);
  assert.ok(f.cid('apply')); assert.equal(f.state.ai.length,0);
});
test('Invalid AI data, unknown purposes, duplicates, excessive sizes and executable fields are rejected', () => {
  for (const mutate of [
    p=>{p.execute='delete all'},p=>{p.categories[0].channels[0].purpose='ban'},
    p=>{p.categories[0].channels[0].name='@everyone'},p=>{p.categories[0].channels[0].name='x'.repeat(101)},
    p=>{p.categories[1].key=p.categories[0].key},p=>{p.categories[0].channels[0].permissionOverwrites=[]},
    p=>{p.categories[0].channels[0].kind='webhook'},p=>{p.categories[0].channels=Array(26).fill(p.categories[0].channels[0])}
  ]) { const p=compact();mutate(p);assert.throws(()=>validatePlan(p)); }
  const p=compact(); p.categories[1].channels[0].access='public';
  assert.equal(validatePlan(p).categories[1].channels[0].access,'staff');
});
test('Provider failures expose no upstream keys and leave a usable template menu', async () => {
  const f=fixture({generate:async () => {throw Error('URL contains API_KEY=private-secret')}});
  await f.custom(); assert.match(f.last().content,/KI konnte/);
  assert.doesNotMatch(JSON.stringify(f.last()),/private-secret/);
  assert.ok(f.cid('choose')); assert.equal(f.state.creates.length,0);
});
test('Apply creates private team areas, records canonical IDs and never creates duplicates on retry/restart', async () => {
  const f=fixture(); await f.custom(); const preview=f.last(), applyId=f.cid('apply');
  await f.act('apply',{},preview);
  assert.equal(f.state.creates.length,4); assert.equal(f.state.configures,1);
  const staffCreates=f.state.creates.filter(c=>c.name.includes('Team')||c.name.includes('logs'));
  assert.equal(staffCreates.length,2);
  for(const c of staffCreates) assert.ok(c.permissionOverwrites.find(o=>o.id===f.guild.roles.everyone.id).deny.includes(P.ViewChannel));
  assert.equal(f.gd.channels['support-logs'],f.gd.setupOverrides['support-logs']);
  await f.designer.handleInteraction(f.interaction({customId:applyId}));
  assert.equal(f.state.creates.length,4);
  const replan=buildOperations(compact(),f.guild,f.gd,true);
  assert.equal([...replan.categories,...replan.channels].filter(x=>x.action==='create').length,0);
  assert.equal(f.locks.size,0);
});
test('Existing channels are renamed/moved without replacing messages or permission overwrites', async () => {
  const f=fixture();
  const old=f.add({id:'old-chat',name:'chat',parent:'old-parent',permissionOverwrites:[{id:'custom-role',deny:[P.SendMessages]}]});
  const perms=old.permissionOverwrites;
  await f.custom(); assert.match(f.last().embeds[0].data.description,/vorher: chat/);
  await f.act('apply');
  assert.equal(old.name,'💬│meer-chat'); assert.equal(old.permissionOverwrites,perms);
  assert.equal(f.gd.serverDesign.channels.chat,'old-chat');
  assert.equal(f.state.creates.filter(c=>c.type===ChannelType.GuildText).length,1);
});
test('Turning existing-channel styling off retains name and parent', async () => {
  const f=fixture(); const old=f.add({id:'old-chat',name:'chat',parent:'original-category'});
  await f.custom(); await f.act('restyle'); await f.act('apply');
  assert.equal(old.name,'chat'); assert.equal(old.parentId,'original-category');
  assert.equal(f.state.edits.length,0);
});
test('Legacy community and staff mappings reuse channels even when they have unrelated names', () => {
  const f=fixture();
  f.add({id:'legacy-quests',name:'old-missions'});
  f.add({id:'legacy-audit',name:'old-internal-actions',private:true});
  f.gd.community={channels:{quests:'legacy-quests'}};
  f.gd.setupOverrides['daily-quests']='deleted-id';
  const ops=buildOperations(buildPreset('clean'),f.guild,f.gd,true,[],{audit:'legacy-audit'});
  assert.equal(ops.channels.find(c=>c.purpose==='daily-quests').existing.id,'legacy-quests');
  assert.equal(ops.channels.find(c=>c.purpose==='staff-audit').existing.id,'legacy-audit');
});
test('Actual index integration carries previous module assignments into configuration for small custom designs', async () => {
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
  const f=fixture();
  f.add({id:'quests-channel',name:'missions'});
  f.add({id:'audit-channel',name:'internal',private:true});
  f.add({id:'support-channel',name:'helpdesk'});
  f.gd.community={channels:{quests:'quests-channel'}};
  f.gd.channels.support='support-channel';
  f.gd.setupOverrides.support='deleted-channel';
  let dependencies,selected;
  const ctx={
    require:()=>({purposeChannelIds,createServerSetupDesigner:config=>(dependencies=config,{})}),
    guildData:()=>f.gd,saveDB(){},generateGeminiContent(){},GEMINI_MODEL:'model',GEMINI_API_KEY:'configured',
    SMART_SETUP_PURPOSES:['support','daily-quests','staff-audit'].map(canonical=>({canonical})),
    PRIVATE_SETUP_PURPOSES:PRIVATE_PURPOSES,setupInProgress:new Set(),
    upsertSetupPanel(){},ChannelType,db:{staff:{[f.guild.id]:{channels:{audit:'audit-channel'}}}},
    channelIsPrivateForEveryone:ch=>ch.private,
    configureFoundSetupChannels:async (guild,plan)=>{selected=plan.selected;return {failed:[]};}
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('let serverSetupDesigner = null;'),source.indexOf('async function startTicketWizard('))+'\ngetServerSetupDesigner();',ctx);
  assert.equal(dependencies.getStaffChannels(f.guild.id).audit,'audit-channel');
  await dependencies.configure(f.guild);
  assert.deepEqual(Object.fromEntries(selected.map(x=>[x.canonical,x.channelId])),{
    support:'support-channel','daily-quests':'quests-channel','staff-audit':'audit-channel'
  });
});
test('A server change since preview requires a refreshed confirmation before any writes', async () => {
  const f=fixture(); const old=f.add({id:'old-chat',name:'chat'});
  await f.custom(); const preview=f.last(); old.name='renamed-by-admin';
  await f.act('apply',{},preview);
  assert.match(f.last().content,/inzwischen geändert/); assert.equal(f.state.creates.length,0);
  assert.equal(f.state.edits.length,0); assert.equal(f.locks.size,0);
});
test('Active tickets and public lookalikes of staff logs are never reused', () => {
  const f=fixture();
  f.add({id:'ticket',name:'chat',topic:'ticket-owner:123'});
  f.add({id:'public-log',name:'support-logs'});
  f.gd.channels['support-logs']='public-log';
  const ops=buildOperations(compact(),f.guild,f.gd,true);
  assert.ok(ops.channels.every(x=>x.action==='create'));
});
test('Failures preserve completed IDs so a new preview resumes without duplicate channels', async () => {
  let blocked=true;
  const f=fixture({failCreate:data=>blocked && data.name.includes('logs')});
  await f.custom(); await f.act('apply');
  assert.match(f.last().content,/teilweise/); assert.equal(f.state.creates.length,3);
  blocked=false; await f.custom(); await f.act('apply');
  assert.equal(f.state.creates.length,4); assert.match(f.last().content,/fertig/);
});
test('Concurrent setup locks, expired sessions and removed bot permissions block mutations', async () => {
  const locked=fixture(); await locked.custom(); locked.locks.add(locked.guild.id); await locked.act('apply');
  assert.match(locked.last().content,/bereits ein Setup/); assert.equal(locked.state.creates.length,0);
  const expired=fixture(); await expired.custom(); const token=expired.cid('apply'); expired.state.now+=21*60000;
  await expired.designer.handleInteraction(expired.interaction({customId:token})); assert.match(expired.last().content,/abgelaufen/);
  const denied=fixture({botAllowed:false}); await denied.custom(); await denied.act('apply');
  assert.equal(denied.state.creates.length,0); assert.equal(denied.locks.size,0);
});
test('Old buttons cannot apply a newly selected design and maintenance blocks all setup writes', async () => {
  const f=fixture(); await f.custom(); const old=f.cid('apply'); await f.act('choose',{values:['fancy']});
  await f.designer.handleInteraction(f.interaction({customId:old}));
  assert.match(f.last().content,/bereits geändert/); assert.equal(f.state.creates.length,0);
  const maintained=fixture({maintenance:true}); await maintained.open(); assert.match(maintained.last().content,/Wartungsmodus/);
});
test('All non-setup source code matches the AI-style update used as baseline', () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
  const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/server-setup-preservation.json'),'utf8'));
  let normalized=require('./stability_preservation').previousRelease('index.js',source);
  for(const [start,end] of spec.sections){const a=normalized.indexOf(start),b=normalized.indexOf(end,a);assert.ok(a>=0&&b>a);normalized=normalized.slice(0,a)+normalized.slice(b);}
  assert.equal(require('node:crypto').createHash('sha256').update(normalized).digest('hex'),spec.sha256);
});
