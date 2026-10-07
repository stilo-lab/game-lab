'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const discord=require('discord.js'),{PermissionsBitField,PermissionFlagsBits:P}=discord;
const botPermissions=require('../src/bot_permissions');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function creatorFixture(){
  const state={allowed:true,fetches:0,scans:0,creates:[],outputs:[]};
  const cache=new discord.Collection(),me={id:'bot',permissions:new PermissionsBitField(P.ManageChannels)};
  const guild={id:'guild',members:{me,fetchMe:async options=>{assert.equal(options.force,true);state.fetches++;me.permissions=new PermissionsBitField(state.allowed?P.ManageChannels:0n);return me;}},channels:{cache},roles:{cache:new discord.Collection(),everyone:{id:'everyone'}}};
  function channel(name,type,parent){const ch={id:'created-'+(state.creates.length+1),name,type,parentId:parent?.id};state.creates.push(ch);cache.set(ch.id,ch);return ch;}
  const ctx={...discord,botPermissions,console:{error(){}},client:{user:{id:'bot'}},setupInProgress:new Set(),
    guildData:()=>({}),prepareSmartSetup:async()=>{state.scans++;return {selected:[]};},missingSetupCanonicals:()=>['counting'],setupPurposeByCanonical:name=>name==='counting'?{}:null,
    SETUP_CHANNEL_INFO:{counting:{purpose:'Counting'}},PRIVATE_SETUP_PURPOSES:new Set(),CREATE_CATEGORY_BY_PURPOSE:{},setupChannelLabel:x=>x,setupCreateChannelName:x=>x,
    configureFoundSetupChannels:async()=>({configured:[],connected:[],failed:[]}),findOrCreateCategory:async(_,name)=>channel(name,discord.ChannelType.GuildCategory),
    findOrCreateText:async(_,name,parent)=>channel(name,discord.ChannelType.GuildText,parent)
  };
  vm.createContext(ctx);vm.runInContext(section('function canUseSmartSetup(','function missingSetupCanonicals(')+section('async function createSelectedSetupChannels(','const setupInProgress = new Set();'),ctx);
  vm.runInContext('async function handleCreateSelection(interaction){'+section('    if (interaction.isStringSelectMenu() && (interaction.customId === "create_missing_channels"','    if (interaction.isButton() && interaction.customId === "setup_check_refresh")')+'}',ctx);
  function interaction(extra={}){
    const i={guild,user:{id:'user'},member:{permissions:new PermissionsBitField(0n)},customId:'create_missing_channels:user',values:['counting'],isStringSelectMenu:()=>true,
      deferReply:async()=>{i.deferred=true;},deferUpdate:async()=>{i.deferred=true;},reply:async p=>{state.outputs.push(p);},editReply:async p=>{state.outputs.push(p);return p;},...extra};return i;
  }
  return {state,ctx,guild,interaction};
}
test('Actual /create opens and creates selected channels when the user has no management flags',async()=>{
  const f=creatorFixture();const i=f.interaction();await f.ctx.runCreate(i);const panel=f.state.outputs.at(-1);
  assert.equal(panel.components[0].toJSON().components[0].custom_id,'create_missing_channels:user');assert.equal(f.state.creates.length,0);
  await f.ctx.handleCreateSelection(f.interaction());assert.equal(f.state.creates.length,2);assert.equal(f.state.creates[1].name,'counting');assert.equal(f.state.fetches,2);assert.equal(f.ctx.setupInProgress.size,0);
});
test('Actual /create reports missing bot rights and rechecks them after selecting a menu',async()=>{
  const f=creatorFixture();f.state.allowed=false;await f.ctx.runCreate(f.interaction());assert.equal(f.state.scans,0);assert.equal(f.state.creates.length,0);assert.match(f.state.outputs.at(-1).content,/Pixel braucht/);
  const g=creatorFixture();await g.ctx.runCreate(g.interaction());g.state.allowed=false;await g.ctx.handleCreateSelection(g.interaction());assert.equal(g.state.creates.length,0);assert.match(g.state.outputs.at(-1).content,/Pixel braucht/);assert.equal(g.ctx.setupInProgress.size,0);
});
test('Create selections belong to their requester, including legacy Discord interaction metadata',async()=>{
  const f=creatorFixture();await f.ctx.handleCreateSelection(f.interaction({user:{id:'other'}}));assert.equal(f.state.creates.length,0);assert.match(f.state.outputs.at(-1).content,/anderen Nutzer/);
  await f.ctx.handleCreateSelection(f.interaction({customId:'create_missing_channels'}));assert.equal(f.state.creates.length,0);
  await f.ctx.handleCreateSelection(f.interaction({customId:'create_missing_channels',message:{interactionMetadata:{user:{id:'user'}}}}));assert.equal(f.state.creates.length,2);
});
test('Creating a private bot channel does not grant an ordinary requester access to staff logs',async()=>{
  const f=creatorFixture();let overwrites;f.ctx.PRIVATE_SETUP_PURPOSES.add('counting');f.ctx.canManageBotSettings=()=>false;
  f.ctx.findOrCreatePrivateText=async(_,name,parent,rules)=>{overwrites=rules;return f.ctx.findOrCreateText(f.guild,name,parent);};
  await f.ctx.handleCreateSelection(f.interaction());assert.equal(f.state.creates.length,2);assert.ok(overwrites.some(x=>x.id==='everyone'&&x.deny.includes(P.ViewChannel)));assert.ok(!overwrites.some(x=>x.id==='user'));
});
test('Existing channel-management staff retain their creator access to new private bot channels',async()=>{
  const f=creatorFixture();let overwrites;f.ctx.PRIVATE_SETUP_PURPOSES.add('counting');f.ctx.canManageBotSettings=()=>false;
  f.ctx.findOrCreatePrivateText=async(_,name,parent,rules)=>{overwrites=rules;return f.ctx.findOrCreateText(f.guild,name,parent);};
  await f.ctx.handleCreateSelection(f.interaction({member:{permissions:new PermissionsBitField(P.ManageChannels)}}));assert.ok(overwrites.some(x=>x.id==='user'&&x.allow.includes(P.ViewChannel)));
});
test('Concurrent create and setup requests share the lock and release it if acknowledgement fails',async()=>{
  const f=creatorFixture();f.ctx.setupInProgress.add(f.guild.id);await f.ctx.handleCreateSelection(f.interaction());assert.equal(f.state.creates.length,0);assert.match(f.state.outputs.at(-1).content,/bereits ein Setup/);
  f.ctx.setupInProgress.clear();await f.ctx.handleCreateSelection(f.interaction({deferUpdate:async()=>{throw Error('Ack failed');}}));assert.equal(f.ctx.setupInProgress.size,0);assert.equal(f.state.creates.length,0);
});
test('Setup checks and setup installation use bot permissions with a user lacking administrator flags',async()=>{
  const f=creatorFixture();f.ctx.setupCheckPayload=()=>({content:'Setup checked'});vm.runInContext(section('async function runSetupCheck(','async function runSetupInstall('),f.ctx);
  await f.ctx.runSetupCheck(f.interaction());assert.ok(f.state.scans>0);assert.equal(f.state.outputs.at(-1).content,'Setup checked');
  f.state.allowed=false;vm.runInContext(section('async function runSetupInstall(','let serverSetupDesigner = null;'),f.ctx);await f.ctx.runSetupInstall(f.interaction());assert.match(f.state.outputs.at(-1).content,/Pixel braucht/);assert.equal(f.state.creates.length,0);
});
test('Serversetup command registration explicitly removes the former Discord administrator default',()=>{
  const block=section('const commands = [','const client = new Client(');
  const context={...discord,LANGUAGE_CHOICES:[['auto','Automatisch']],SMART_SETUP_PURPOSES:[{canonical:'counting'}],GAME_CHOICES:[{name:'Roblox',value:'roblox'}],mimicCommands:[],youtubeUploadCommands:[],buildCommunityCommands:()=>[],buildStaffCommands:()=>[],buildElementSeasCommands:()=>[],buildSpotifyPartyCommands:()=>[]};
  vm.createContext(context);vm.runInContext(block+'globalThis.builtCommands=commands;',context);
  assert.equal(context.builtCommands.find(c=>c.name==='serversetup').default_member_permissions,null);
  for(const name of ['create','setup','new'])assert.ok(context.builtCommands.find(c=>c.name===name).default_member_permissions==null);
  assert.equal(context.builtCommands.find(c=>c.name==='verbesserung').default_member_permissions,String(P.Administrator));
});
test('Only the reviewed permission changes differ from Mimic v1.9.1; all other modules remain identical',()=>{
  const {previousMimicRelease,spec}=require('./permissions_preservation');
  for(const [file,expected]of Object.entries(spec)){
    const current=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');assert.equal(crypto.createHash('sha256').update(previousMimicRelease(file,current)).digest('hex'),expected.sha256,file);
  }
});
