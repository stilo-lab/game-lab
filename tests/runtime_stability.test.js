'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const crypto=require('node:crypto');
const discord=require('discord.js');
const runtime=require('../src/bot_runtime');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
function section(start,end,text=source){const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a,start);return text.slice(a,b);}
function context(code,extra={}){const ctx={...discord,botRuntime:runtime,console:{warn(){},error(){}},Date,...extra};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;}
function fixture(gd={channels:{counting:'c'},counting:{current:0,lastUserId:null}}){
  const cache=new discord.Collection();const everyone={id:'everyone'};const me={id:'bot'};
  const guild={id:'g',roles:{everyone},members:{me},channels:{cache,fetch:async id=>id?cache.get(id):cache}};
  function add(id,name='channel',privateChannel=false){const ch={id,name,type:0,guild,viewable:true,topic:'',parentId:'cat',parent:{name:'Support'},permissionsFor:who=>({has:flag=>who.id===everyone.id&&flag===1024n?!privateChannel:true}),messages:{fetch:async()=>new discord.Collection()},send:async()=>({id:'sent'}),delete:async()=>{cache.delete(id);}};cache.set(id,ch);return ch;}
  const channel=add('c','counting');let saves=[];
  const db={tickets:{},guilds:{g:gd},staff:{g:{channels:{}}}};
  function saveDB(){saves.push(clone(gd));}
  function message(content,user,id){return {id:String(id),guild,channel,content,author:{id:user,bot:false},mentions:{everyone:false},react:async()=>{},reply:async()=>{}};}
  return {gd,guild,cache,add,channel,db,saveDB,saves,message};
}
function indexContext(f,code,extra={}){return context(code,{db:f.db,guildData:()=>f.gd,saveDB:f.saveDB,...extra});}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pixel-runtime-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('Real message handler commits consecutive numbers before slow reactions or moderation',async()=>{
  const f=fixture();let handler,release;const firstReaction=new Promise(resolve=>release=resolve);const reactions=[];let moderation=0;
  const ctx=indexContext(f,section('function repairGuildBindings(', 'function rememberSetupAssignments(')+section('client.on("messageCreate",','async function upsertSetupPanel('),{
    client:{on:(name,fn)=>{handler=fn;}},isGuildApproved:()=>true,hasMassMention:()=>false,serverSettings:()=>({autoModEnabled:true}),
    staff:{onMessage:async()=>{moderation++;return false;}}
  });
  const one=f.message('1','u1',101);one.react=emoji=>{reactions.push(emoji);return firstReaction;};
  const two=f.message('2','u2',102);two.react=async emoji=>{reactions.push(emoji);throw Error('Discord unavailable');};
  const first=handler(one);assert.equal(f.gd.counting.current,1);assert.equal(f.saves.at(-1).counting.current,1);assert.equal(moderation,0);
  await handler(two);assert.equal(f.gd.counting.current,2);assert.deepEqual(reactions,['✅','✅']);assert.equal(f.saves.at(-1).counting.current,2);
  release();await first;assert.equal(f.gd.counting.current,2);assert.equal(moderation,2);
});
test('Replay or late delivery cannot reset an already counted number',()=>{
  const f=fixture();runtime.advanceCounting(f.message('1','u1',101),f.gd,f.saveDB);runtime.advanceCounting(f.message('2','u2',102),f.gd,f.saveDB);
  assert.equal(runtime.advanceCounting(f.message('1','u1',101),f.gd,f.saveDB).duplicate,true);assert.equal(f.gd.counting.current,2);assert.equal(f.saves.length,2);
});
test('Counting alternates users and persists reset before any Discord operation',()=>{
  const f=fixture();runtime.advanceCounting(f.message('1','u1',101),f.gd,f.saveDB);
  assert.equal(runtime.advanceCounting(f.message('2','u1',102),f.gd,f.saveDB).valid,false);assert.equal(f.saves.at(-1).counting.current,0);
  assert.equal(runtime.advanceCounting(f.message('1','u2',103),f.gd,f.saveDB).valid,true);
});
test('Invalid numeric notation and unsafe integers cannot advance counting',()=>{
  for(const text of ['1e0','0x1','1.0','+1','Infinity','9007199254740993','']){
    const f=fixture();assert.equal(runtime.advanceCounting(f.message(text,'u1',101),f.gd,f.saveDB).valid,false,text);
  }
});
test('A failed disk write rolls back counting and the message stays retryable',()=>{
  const f=fixture();const old=f.gd.counting;
  assert.throws(()=>runtime.advanceCounting(f.message('1','u1',101),f.gd,()=>{throw Error('ENOSPC');}),/ENOSPC/);assert.equal(f.gd.counting,old);
  assert.equal(runtime.advanceCounting(f.message('1','u1',101),f.gd,f.saveDB).valid,true);
});
test('Bot messages, other channels and mass mentions never touch counting',()=>{
  const f=fixture();for(const msg of [{...f.message('1','u',101),author:{id:'u',bot:true}},{...f.message('1','u',101),channel:{id:'other'}},f.message('@here 1','u',101)])assert.equal(runtime.advanceCounting(msg,f.gd,f.saveDB),null);
  assert.equal(f.saves.length,0);
});
test('Changing the counting channel starts its own sequence and guilds remain separate',()=>{
  const f=fixture();f.gd.counting={current:9,lastUserId:'u',channelId:'old',lastMessageId:'999'};
  assert.equal(runtime.advanceCounting(f.message('1','other',101),f.gd,f.saveDB).valid,true);
  const second=fixture();assert.equal(second.gd.counting.current,0);
});
test('Setup with an incomplete scan retains core, community and staff assignments',()=>{
  const f=fixture();f.gd.channels.support='support';f.gd.channels.ticketCategory='parent';f.gd.suggestionChannelIds=['hidden'];f.gd.community={channels:{quests:'q'}};f.db.staff.g.channels.audit='a';
  f.add('q','My fancy missions');f.add('a','Internal journal',true);
  const ctx=indexContext(f,section('function rememberSetupAssignments(', 'const SETUP_PANEL_TITLE_PURPOSES'));
  const setup={selected:[],suggestionChannelIds:[]};ctx.rememberSetupAssignments(f.guild,setup);
  assert.equal(f.gd.channels.counting,'c');assert.equal(f.gd.channels.support,'support');assert.equal(f.gd.channels.ticketCategory,'parent');assert.equal(f.gd.channels['daily-quests'],'q');assert.equal(f.gd.channels['staff-audit'],'a');assert.deepEqual(clone(f.gd.suggestionChannelIds),['hidden']);
  assert.deepEqual(setup.selected.map(x=>x.canonical),['counting','daily-quests','staff-audit']);
});
test('Saved custom names win over guessed counting channels and missing overrides survive',async()=>{
  const f=fixture();f.channel.name='⌛│unsere-zahlen';f.gd.setupOverrides={welcome:'not-cached'};const other=f.add('other','counting');
  const snapshots=[{id:other.id,name:'counting',private:false}];
  const ctx=indexContext(f,section('const SMART_SETUP_PURPOSES =','const PRIVATE_SETUP_PURPOSES =')+section('async function prepareSmartSetup(', 'function looksLikeLearnInstruction('),{
    collectSetupChannelSnapshots:async()=>snapshots,heuristicSetupAssignments:()=>[],aiSetupAssignments:async()=>[],PRIVATE_SETUP_PURPOSES:runtime.PRIVATE_PURPOSES,
    SETUP_NEVER_AUTOMAP:[],cleanName:x=>x,setupAliasEvidence:(snap,p)=>({exactName:snap.name===p.canonical,lexicalScore:0}),setupPurposeByCanonical:canonical=>({canonical}),smartSetupHints:new Map(),GEMINI_API_KEY:''
  });
  const setup=await ctx.prepareSmartSetup(f.guild);assert.equal(setup.selected.find(x=>x.canonical==='counting').channelId,'c');assert.equal(f.gd.setupOverrides.welcome,'not-cached');
});
test('A failed channel scan skips configuration and never deletes saved assignments',async()=>{
  const f=fixture();const ctx=indexContext(f,section('async function configureFoundSetupChannels(', 'function setupCheckPayload('));
  const result=await ctx.configureFoundSetupChannels(f.guild,{selected:[],scanFailed:true});assert.equal(result.failed.length,1);assert.equal(f.gd.channels.counting,'c');assert.equal(f.saves.length,0);
});
test('Community and staff setup retain IDs when their channels are missing from cache',async()=>{
  for(const [file,key,end] of [['community.js','quests','  async function setup(guild)'],['staff.js','audit','  async function setup(guild)']]){
    const f=fixture();f.cache.clear();const state={channels:{[key]:'hidden'},roles:{}};const text=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
    const ctx=indexContext(f,section('  async function setupExistingOnly(guild)',end,text),{ensureGuild:()=>state});
    await ctx.setupExistingOnly(f.guild);assert.equal(state.channels[key],'hidden',file);
  }
});
test('Unsafe public staff assignments are not restored as private logs',()=>{
  const f=fixture();f.gd.community={channels:{quests:'q'}};f.add('q');f.add('a','staff-audit',false);f.db.staff.g.channels.audit='a';
  runtime.restoreBindings(f.guild,f.gd,f.db.staff.g.channels);assert.equal(f.gd.channels['daily-quests'],'q');assert.equal(f.gd.channels['staff-audit'],undefined);
});
test('Refresh and slash setup share a lock and release it after a failure',async()=>{
  const block=section('    if (interaction.isButton() && interaction.customId === "setup_check_refresh")','    if (interaction.isStringSelectMenu() && interaction.customId === "setup_missing_info")');
  const locks=new Set(['g']);let runs=0,replies=0;
  const ctx=context('async function refresh(interaction){'+block+'}',{setupInProgress:locks,canUseSmartSetup:()=>true,runSetupCheck:async()=>{runs++;throw Error('fail');}});
  const interaction={guild:{id:'g'},isButton:()=>true,customId:'setup_check_refresh',reply:async()=>{replies++;},deferUpdate:async()=>{}};
  await ctx.refresh(interaction);assert.equal(runs,0);assert.equal(replies,1);locks.clear();await assert.rejects(ctx.refresh(interaction),/fail/);assert.equal(locks.size,0);
});
test('Manual /counting pins the channel so later setup scans cannot replace it',async()=>{
  const f=fixture();f.channel.name='mein-spiel';let response;
  const code=section('        case "counting": {','        case "giveaway":');
  const ctx=indexContext(f,'async function command(interaction){switch("counting"){'+code+'}}');
  await ctx.command({guild:f.guild,channel:f.channel,member:{permissions:{has:()=>true}},reply:async x=>response=x});
  assert.equal(f.gd.setupOverrides.counting,'c');assert.equal(f.gd.counting.channelId,'c');assert.match(response,/Counting/);
});
function ticketContext(f){return indexContext(f,section('function isSupportedTicketChannelType(', 'async function inferExternalTicketOwner(')+section('async function ensureExternalTicketRecord(', 'async function scanExistingExternalTickets(')+section('function getTicketRecord(', 'async function discordImageParts('),{
  client:{user:{id:'bot'}},cleanName:x=>String(x).toLowerCase(),inferExternalTicketOwner:async()=>{throw Error('Should not adopt system channel');},ticketOwnerId:()=>null
});}
test('Every registered community/staff channel is protected from forced ticket adoption',async()=>{
  const f=fixture();f.channel.permissionsFor=()=>({has:()=>false});f.channel.name='support counting';f.db.staff.g.channels.audit='audit';f.gd.community={channels:{quests:'quests'}};
  const ctx=ticketContext(f);
  for(const id of ['c','audit','quests']){
    const ch=f.add(id,'Support',true);assert.equal(ctx.looksLikeExternalTicketChannel(ch),false);assert.equal(await ctx.ensureExternalTicketRecord(ch,null,{force:true}),null);
  }
  assert.equal(Object.keys(f.db.tickets).length,0);
});
test('Own bot panels never trigger external ticket detection',()=>{
  const f=fixture();const ctx=ticketContext(f);const ch=f.add('unknown','ticket-private',true);
  assert.equal(ctx.looksLikeTicketBotMessage({guild:f.guild,channel:ch,author:{bot:true,id:'bot'},content:'Support Ticket'}),false);
  assert.equal(ctx.looksLikeTicketBotMessage({guild:f.guild,channel:ch,author:{bot:true,id:'other-bot'},content:'Support Ticket'}),true);
});
test('Misidentified old system tickets are quarantined without deleting their records',()=>{
  const f=fixture();f.db.tickets.c={external:true,aiEnabled:true,previousInteractionId:'remote'};
  assert.equal(runtime.quarantineSystemTickets(f.gd,{},f.db.tickets),true);assert.equal(f.db.tickets.c.aiEnabled,false);assert.equal(f.db.tickets.c.previousInteractionId,null);assert.equal(ticketContext(f).getTicketRecord(f.channel),null);
});
function inactivity(f){return indexContext(f,section('async function checkTicketInactivity(', 'async function createSupportTicket('),{client:{guilds:{cache:new Map([['g',f.guild]])}},CLOSED_TICKET_RETENTION_MS:100,TICKET_AUTOCLOSE_AFTER_MS:200,TICKET_WARNING_AFTER_MS:100,finalizeCloseTicket:async()=>{}});}
test('Closed external and quarantined tickets never enter the delete lifecycle',async()=>{
  const f=fixture();let deletes=0;f.channel.delete=async()=>{deletes++;};f.db.tickets.c={guildId:'g',external:true,status:'closed',closedAt:1};
  await inactivity(f).checkTicketInactivity();assert.equal(deletes,0);assert.ok(f.db.tickets.c);
  f.db.tickets.c={guildId:'g',ignoredAsSystemChannel:true,status:'closed',closedAt:1};await inactivity(f).checkTicketInactivity();assert.equal(deletes,0);
});
test('Transient ticket cache or permission misses retain state; confirmed deletion removes it',async()=>{
  const f=fixture();f.db.tickets.ticket={guildId:'g',status:'open'};
  for(const code of [50001,50013,'ECONNRESET']){f.guild.channels.fetch=async()=>{throw {code};};await inactivity(f).checkTicketInactivity();assert.ok(f.db.tickets.ticket,String(code));}
  f.guild.channels.fetch=async()=>{throw {code:10003};};await inactivity(f).checkTicketInactivity();assert.equal(f.db.tickets.ticket,undefined);
});
test('Ticket deletion failures keep the record for retry; fetched valid channels still work',async()=>{
  const f=fixture();const ticket=f.add('ticket','ticket-old',true);f.cache.delete('ticket');let deletes=0;
  f.guild.channels.fetch=async()=>ticket;ticket.delete=async()=>{deletes++;throw {code:50013};};f.db.tickets.ticket={guildId:'g',status:'closed',closedAt:1};
  await inactivity(f).checkTicketInactivity();assert.equal(deletes,1);assert.ok(f.db.tickets.ticket);
  ticket.delete=async()=>{deletes++;};await inactivity(f).checkTicketInactivity();assert.equal(deletes,2);assert.equal(f.db.tickets.ticket,undefined);
});
test('One failed inactivity warning does not stop checking other tickets',async()=>{
  const f=fixture();const now=Date.now();let sent=0;const bad=f.add('bad'),good=f.add('good');bad.send=async()=>{throw Error('permission');};good.send=async()=>{sent++;};
  for(const id of ['bad','good'])f.db.tickets[id]={guildId:'g',status:'open',firstUserMessageAt:now-150,lastActivityAt:now-150};
  await inactivity(f).checkTicketInactivity();assert.equal(sent,1);assert.equal(f.db.tickets.bad.inactivityWarnedAt,undefined);assert.ok(f.db.tickets.good.inactivityWarnedAt);
});
test('A restart restores counting, channel assignments and unrelated user data',t=>{
  const file=path.join(temp(t),'db.json');const first=runtime.createDatabaseStore(file);const db=first.load();const f=fixture();db.guilds.g=f.gd;db.users.saved={coins:17};first.save(db);
  runtime.advanceCounting(f.message('1','u1',101),f.gd,()=>first.save(db));
  const restarted=runtime.createDatabaseStore(file).load();assert.equal(restarted.guilds.g.counting.current,1);assert.equal(restarted.guilds.g.channels.counting,'c');assert.equal(restarted.users.saved.coins,17);
  assert.equal(runtime.advanceCounting(f.message('2','u2',102),restarted.guilds.g,()=>{}).valid,true);
});
test('A corrupt database recovers its valid backup and preserves the corrupt original',t=>{
  const dir=temp(t),file=path.join(dir,'db.json');const store=runtime.createDatabaseStore(file,{warn(){}});store.save({guilds:{g:{channels:{counting:'c'}}},users:{u:{coins:3}}});
  fs.writeFileSync(file,'broken {');const recovered=store.load();assert.equal(recovered.guilds.g.channels.counting,'c');assert.equal(recovered.users.u.coins,3);
  assert.ok(fs.readdirSync(dir).some(name=>name.startsWith('db.json.corrupt-')));assert.doesNotThrow(()=>JSON.parse(fs.readFileSync(file)));
});
test('An interrupted atomic write can recover a valid temporary snapshot',t=>{
  const file=path.join(temp(t),'db.json');fs.writeFileSync(file,'broken');fs.writeFileSync(file+'.tmp',JSON.stringify({guilds:{g:{counting:{current:25}}}}));
  assert.equal(runtime.createDatabaseStore(file,{warn(){}}).load().guilds.g.counting.current,25);
});
test('Unrecoverable corruption and filesystem errors never silently seed an empty database',t=>{
  const dir=temp(t),file=path.join(dir,'db.json');fs.writeFileSync(file,'broken');
  assert.throws(()=>runtime.createDatabaseStore(file).load(),{code:'DB_RECOVERY_REQUIRED'});assert.equal(fs.readFileSync(file,'utf8'),'broken');
  assert.throws(()=>runtime.createDatabaseStore(dir).load(),{code:'EISDIR'});
  fs.unlinkSync(file);fs.writeFileSync(file+'.bak','broken');assert.throws(()=>runtime.createDatabaseStore(file).load(),{code:'DB_RECOVERY_REQUIRED'});
});
test('Persistent volume migration copies legacy data once and never overwrites existing volume data',t=>{
  const dir=temp(t),src=path.join(dir,'app','src'),legacy=path.join(dir,'app','data'),volume=path.join(dir,'volume');fs.mkdirSync(src,{recursive:true});fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'db.json'),'legacy');fs.writeFileSync(path.join(legacy,'db.json.bak'),'legacy-backup');
  assert.equal(runtime.dataDirectory(src,{RAILWAY_VOLUME_MOUNT_PATH:volume}),volume);assert.equal(runtime.dataDirectory(src,{BOT_DATA_DIR:dir,RAILWAY_VOLUME_MOUNT_PATH:volume}),dir);
  runtime.migrateDataDirectory(src,volume);assert.equal(fs.readFileSync(path.join(volume,'db.json'),'utf8'),'legacy');fs.writeFileSync(path.join(volume,'db.json'),'new');fs.unlinkSync(path.join(volume,'db.json.bak'));runtime.migrateDataDirectory(src,volume);
  assert.equal(fs.readFileSync(path.join(volume,'db.json'),'utf8'),'new');assert.equal(fs.existsSync(path.join(volume,'db.json.bak')),false);
});
test('Main DB, YouTube and Spotify share the persistent data directory',()=>{
  assert.match(source,/dataFile: path\.join\(BOT_DATA_DIR, "youtube_uploads\.json"\)/);
  assert.match(fs.readFileSync(path.join(__dirname,'../src/spotify_party.js'),'utf8'),/require\('\.\/bot_runtime'\)\.dataDirectory\(__dirname\)/);
});
test('All changes outside the reviewed stability edits match the previous AI/support release',()=>{
  const {previousRelease,spec}=require('./stability_preservation');
  for(const [file,expected] of Object.entries(spec)){
    const restored=previousRelease(file,fs.readFileSync(path.join(__dirname,'../src',file),'utf8'));
    assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),expected.sha256,file);
  }
});
