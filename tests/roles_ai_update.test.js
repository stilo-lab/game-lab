'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {Collection,PermissionsBitField,ChannelType}=require('discord.js');
const roles=require('../src/setup_roles'),quality=require('../src/ai_quality');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const localRequire=require('node:module').createRequire(path.join(__dirname,'../src/index.js'));
const P=PermissionsBitField.Flags;
function fixture({allowed=true,failCreateAt=0}={}) {
  const cache=new Collection(),gd={},calls={creates:[],edits:[],saves:0};let next=10;
  const guild={id:'g',roles:{cache,everyone:{id:'everyone'},fetch:async()=>cache},members:{me:{permissions:{has:()=>allowed}}}};
  function add(data) {
    const role={id:String(next++),name:data.name,color:data.color || 0,hoist:Boolean(data.hoist),managed:Boolean(data.managed),editable:data.editable!==false,position:2,permissions:{bitfield:data.permissions ?? 0n},members:new Set(['existing-member']),...data};
    role.permissions={bitfield:data.permissions ?? 0n};
    role.edit=async change=>{calls.edits.push({id:role.id,...change});Object.assign(role,change);return role;};cache.set(role.id,role);return role;
  }
  guild.roles.create=async data=>{calls.creates.push(data);if(calls.creates.length===failCreateAt)throw {code:50013};return add(data);};
  const save=()=>calls.saves++;
  return {guild,gd,calls,add,save};
}
test('All three role designs share stable keys, readable colors, emojis and existing selfrole keys',()=>{
  const styles=['clean','brackets','fancy'].map(s=>roles.definitions(s));
  assert.deepEqual(styles[0].map(r=>r.key),styles[1].map(r=>r.key));
  for(const defs of styles) {
    assert.equal(new Set(defs.map(r=>r.key)).size,defs.length);
    for(const role of defs) {assert.ok(role.name.length<=100);assert.ok(role.color>0 && role.color<=0xffffff);}
    assert.ok(defs.find(r=>r.key==='game_roblox').name.includes('🧱'));
  }
  assert.match(styles[0][0].name,/🎫 │ Support Team/);assert.match(styles[1][0].name,/『🎫』𝐒/);assert.match(styles[2][0].name,/𝕊/);
  assert.deepEqual(Object.keys(roles.COMMUNITY_ROLE_NAMES).filter(k=>k.startsWith('game_')),require('../src/games').GAME_ROLE_KEYS);
});
test('Role preview and cancel perform no Discord writes',async()=>{
  const f=fixture();await roles.prepareRoleOperations(f.guild,f.gd,'brackets');
  assert.equal(f.calls.creates.length,0);assert.equal(f.calls.edits.length,0);assert.equal(f.calls.saves,0);
});
test('Repeated setup and restart reuse every role and preserve member assignments and permissions',async()=>{
  const f=fixture(),old=f.add({name:'Support Team',permissions:P.ManageMessages});f.gd.supportRoleId=old.id;
  const result=await roles.applyRoleOperations(f.guild,f.gd,await roles.prepareRoleOperations(f.guild,f.gd,'brackets'),f.save,'brackets');
  assert.equal(result.failed.length,0);assert.equal(old.permissions.bitfield,P.ManageMessages);assert.deepEqual([...old.members],['existing-member']);
  for(const data of f.calls.creates) {assert.equal(data.permissions,0n);assert.equal(data.mentionable,false);assert.equal(data.position,undefined);}
  for(const data of f.calls.edits) {assert.equal(data.permissions,undefined);assert.equal(data.position,undefined);assert.equal(data.hoist,undefined);}
  const saved=JSON.parse(JSON.stringify(f.gd));const created=f.calls.creates.length;
  const again=await roles.applyRoleOperations(f.guild,saved,roles.buildRoleOperations(f.guild,saved,'brackets'),()=>{},'brackets');
  assert.equal(f.calls.creates.length,created);assert.equal(again.created,0);assert.equal(again.edited,0);assert.equal(saved.supportRoleId,old.id);
  assert.ok(saved.community.roles.game_roblox);assert.ok(saved.community.roles.eventPing);
});
test('Foreign roles, @everyone and roles above the bot keep their name, colors and privileges',async()=>{
  const f=fixture(),foreign=f.add({name:'Private Role',color:111,permissions:P.Administrator}),high=f.add({name:'Community VIP',editable:false,color:22}),managed=f.add({name:'Fortnite',managed:true});
  f.gd.community={roles:{vip:high.id,game_fortnite:managed.id}};
  await roles.applyRoleOperations(f.guild,f.gd,roles.buildRoleOperations(f.guild,f.gd,'clean'),f.save);
  assert.equal(foreign.name,'Private Role');assert.equal(foreign.permissions.bitfield,P.Administrator);assert.equal(high.color,22);assert.equal(managed.name,'Fortnite');
  assert.ok(f.calls.edits.every(e=>![foreign.id,high.id,managed.id,'everyone'].includes(e.id)));
});
test('Style off preserves existing names and colors while adding missing roles',async()=>{
  const f=fixture(),old=f.add({name:'Support Team',color:123});f.gd.supportRoleId=old.id;
  await roles.applyRoleOperations(f.guild,f.gd,roles.buildRoleOperations(f.guild,f.gd,'fancy',false),f.save,'fancy');
  assert.equal(old.name,'Support Team');assert.equal(old.color,123);assert.equal(f.calls.edits.length,0);assert.ok(f.calls.creates.length>0);
});
test('Missing ManageRoles, ambiguous names and full role slots stop role mutations',async()=>{
  const denied=fixture({allowed:false});const r=await roles.applyRoleOperations(denied.guild,denied.gd,roles.buildRoleOperations(denied.guild,denied.gd),denied.save);
  assert.ok(r.failed.length);assert.equal(denied.calls.creates.length,0);
  const ambiguous=fixture();ambiguous.add({name:'Support Team'});ambiguous.add({name:'Support Team'});
  assert.ok((await roles.applyRoleOperations(ambiguous.guild,ambiguous.gd,roles.buildRoleOperations(ambiguous.guild,ambiguous.gd),ambiguous.save)).failed.length);assert.equal(ambiguous.calls.creates.length,0);
  const full=fixture();for(let i=0;i<249;i++)full.add({name:`Other ${i}`});
  assert.ok((await roles.applyRoleOperations(full.guild,full.gd,roles.buildRoleOperations(full.guild,full.gd),full.save)).failed.length);assert.equal(full.calls.creates.length,0);
});
test('Partial API failure is reported and retry reuses roles already saved',async()=>{
  const f=fixture({failCreateAt:2});const first=await roles.applyRoleOperations(f.guild,f.gd,roles.buildRoleOperations(f.guild,f.gd),f.save);
  assert.equal(first.failed.length,1);const existingIds=new Set(f.guild.roles.cache.keys());
  const retry=await roles.applyRoleOperations(f.guild,f.gd,roles.buildRoleOperations(f.guild,f.gd),f.save);
  assert.equal(retry.failed.length,0);assert.equal(retry.created,1);assert.ok([...existingIds].every(id=>f.guild.roles.cache.has(id)));
});
function section(start,end) {const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0 && b>a);return source.slice(a,b);}
test('Existing support and selfrole setup helpers resolve mapped styled roles without duplicates',async()=>{
  const f=fixture();const support=f.add({name:'『🎫』𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐓𝐞𝐚𝐦'}),roblox=f.add({name:'🧱 │ Roblox'});
  f.gd.supportRoleId=support.id;f.gd.community={roles:{game_roblox:roblox.id}};
  const ctx={require:localRequire,guildData:()=>f.gd,cleanName:x=>x,BOT_NAME:'Pixel',console};vm.createContext(ctx);
  vm.runInContext(section('async function findOrCreateRole(', 'function isSupportMember('),ctx);
  assert.equal((await ctx.findOrCreateRole(f.guild,'Support Team')).id,support.id);
  assert.equal((await ctx.findOrCreateRole(f.guild,'Roblox')).id,roblox.id);assert.equal(f.calls.creates.length,0);
});
test('Real /setup invokes roles and channel scanner, creates no channels, and skips roles if scanning failed',async()=>{
  for(const scanFailed of [false,true]) {
    const f=fixture();let reported;
    const ctx={require:localRequire,guildData:()=>f.gd,saveDB:f.save,canUseSmartSetup:()=>true,MessageFlags:{Ephemeral:64},console:{warn(){}},
      prepareSmartSetup:async()=>{if(scanFailed)throw new Error('scan');return {scanned:0,selected:[]};},
      configureFoundSetupChannels:async()=>({configured:[],failed:[]}),setupCheckPayload:(guild,scan,result)=>{reported=result;return {};}};
    vm.createContext(ctx);vm.runInContext(section('async function runSetupCheck(', 'async function runSetupInstall('),ctx);
    await ctx.runSetupCheck({guild:f.guild,deferred:true,editReply:async()=>{}});
    assert.equal(Boolean(reported.roles),!scanFailed);assert.equal(f.calls.creates.length>0,!scanFailed);
  }
});
test('Designer applies role callbacks only after confirmation and refreshes stale role previews',async()=>{
  const {createServerSetupDesigner}=require('../src/server_setup_designs');
  const f=fixture();const channels=new Collection();let next=1000,roleRevision=0,roleWrites=0;
  f.guild.channels={cache:channels,fetch:async()=>channels,setPositions:async()=>{},create:async data=>{const ch={id:String(next++),...data,parentId:data.parent || null,permissionsFor:()=>({has:()=>true})};channels.set(ch.id,ch);return ch;}};
  f.guild.members.me.id='bot';const outputs=[];
  const designer=createServerSetupDesigner({guildData:()=>f.gd,saveDB:f.save,findSupportRole:async()=>null,configure:async()=>({failed:[]}),
    prepareRoles:async()=>[{key:'support',name:'🎫 │ Support Team',color:0x60c6ef,group:'Team',action:'create',existing:null,revision:roleRevision}],
    applyRoles:async()=>{roleWrites++;return {created:1,edited:0,reused:0,failed:[]};}});
  const i=extra=>({guild:f.guild,user:{id:'u'},...extra,reply:async p=>outputs.push(p),editReply:async p=>outputs.push(p),update:async p=>outputs.push(p),deferUpdate:async()=>{}});
  const id=action=>outputs.at(-1).components.flatMap(r=>r.components).map(c=>c.data.custom_id).find(s=>s?.startsWith(`ssd:${action}:`));
  await designer.open(i());await designer.handleInteraction(i({customId:id('choose'),values:['clean']}));
  assert.equal(roleWrites,0);assert.ok(outputs.at(-1).files.some(file=>file.name==='pixel-rollen-vorschau.txt'));
  roleRevision++;await designer.handleInteraction(i({customId:id('apply')}));assert.equal(roleWrites,0);assert.match(outputs.at(-1).content,/inzwischen geändert/);
  await designer.handleInteraction(i({customId:id('apply')}));assert.equal(roleWrites,1);assert.ok(channels.size>0);
});
const pair=(q,a)=>[{role:'user',parts:[{text:q}]},{role:'model',parts:[{text:a}]}];
test('Failed-step slang and link followups retrieve the active topic, while new subjects stand alone',()=>{
  const history=pair('YouTube Fehler 404 auf Android','Bitte starte neu');
  for(const q of ['hat nix gebracht','nope','link pls','was kostet das','klappt nd'])assert.match(quality.knowledgeQuery(q,history),/Android/);
  assert.equal(quality.knowledgeQuery('Erkläre Minecraft Redstone',history),'Erkläre Minecraft Redstone');
  assert.equal(quality.chatGenerationSettings('yo',history).maxOutputTokens,1200);
  assert.equal(quality.chatGenerationSettings('hat nix gebracht',history).maxOutputTokens,2400);
});
test('AI focus preserves constraints and corrections as quoted data, not invented attempts',()=>{
  const result=JSON.parse(quality.conversationSignals([...pair('Nur eine ZIP, ohne Löschen','Lösche den Server'),...pair('Nein, Android. Neustart schon versucht','Prüfe die App')],'nope'));
  assert.ok(result.explicit_constraints.some(s=>s.includes('ohne Löschen')));assert.ok(result.corrections.some(s=>s.includes('Android')));
  assert.equal(result.reported_attempts.length,1);assert.equal(result.previous_suggestion,'Prüfe die App');assert.match(result.context_note,/kein Beleg/);
});
test('Links, purchases, event dates and inherited prices use research; smalltalk and local setup instructions do not',()=>{
  for(const q of ['Link bitte','gib mir links zu Tradingservern','Was kostet PocketDrum?','Wann kommt das Admin Abuse?','Suche aktuelle Tutorials'])assert.equal(quality.needsResearch(q),true,q);
  assert.equal(quality.needsResearch('was kostet das',pair('PocketDrum 2 Max','Okay')),true);
  assert.equal(quality.needsResearch('yo'),false);assert.equal(quality.needsResearch('/new erstelle eine Rolle'),false);
});
test('Every original source module reconstructs exactly from reviewed edits; no source file is removed',()=>{
  const {spec,previousMimicHostRelease}=require('./roles_ai_preservation');assert.equal(Object.keys(spec).length,39);
  assert.equal(Object.values(spec).filter(item=>item.edits.length).length,3);
  for(const [name,item] of Object.entries(spec))assert.equal(crypto.createHash('sha256').update(previousMimicHostRelease(name,fs.readFileSync(path.join(__dirname,'../src',name),'utf8'))).digest('hex'),item.sha256,name);
});
