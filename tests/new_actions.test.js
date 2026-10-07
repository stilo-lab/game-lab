'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PermissionsBitField,ChannelType}=require('discord.js');
const {createNewAssistant,validatePlan}=require('../src/new_assistant');
const {validateAction}=require('../src/new_actions');
const F=PermissionsBitField.Flags,all=()=>new PermissionsBitField(Object.values(F));
function fixture(actions,{manager=true,owner=false,admin=true}={}){
  const writes=[],outputs=[],roles=new Map(),channels=new Map(),members=new Map(),gd={newJobs:{},channels:{},setupOverrides:{},counting:{current:42}};
  const actor={id:'101',displayName:'Stilo',permissions:admin?all():new PermissionsBitField([F.ViewChannel,...manager?[F.ManageGuild]:[]])};
  const bot={id:'102',permissions:all(),roles:{highest:{position:20}}};
  const recipient={id:'103',displayName:'Mia',permissions:new PermissionsBitField(F.ViewChannel),roles:{highest:{position:2},add:async r=>writes.push(['assign',r.id]),remove:async r=>writes.push(['remove',r.id])},moderatable:true,kickable:true,bannable:true,manageable:true,
    timeout:async(...args)=>writes.push(['timeout',...args]),kick:async(...args)=>writes.push(['kick',...args]),ban:async(...args)=>writes.push(['ban',...args]),setNickname:async(...args)=>writes.push(['nickname',...args])};
  members.set(actor.id,actor);members.set(bot.id,bot);members.set(recipient.id,recipient);
  function makeRole(id,name,permissions=0n,position=1){const r={id,name,managed:false,editable:true,position,permissions:new PermissionsBitField(permissions),
    setPermissions:async flags=>{r.permissions=new PermissionsBitField(flags);writes.push(['rights',id,r.permissions.bitfield]);},
    edit:async data=>{writes.push(['edit_role',id,data]);Object.assign(r,data);},setPosition:async pos=>{writes.push(['move_role',id,pos]);r.position=pos;},delete:async()=>{writes.push(['delete_role',id]);roles.delete(id);}};roles.set(id,r);return r;}
  makeRole('201','VIP',F.ViewChannel|F.AttachFiles);makeRole('200','@everyone');
  const overrides=new Map();
  function makeChannel(id,name,type=ChannelType.GuildText,parentId=null){const c={id,name,type,parentId,permissionsFor:m=>m.permissions,
    permissionOverwrites:{edit:async(subject,patch)=>{const key=typeof subject==='string'?subject:subject.id;overrides.set(key,{...overrides.get(key),...patch});writes.push(['overwrite',id,key,patch]);}},
    setParent:async(parent,options)=>{writes.push(['parent',id,parent,options]);c.parentId=parent;},setPosition:async(...a)=>writes.push(['position',id,...a]),
    setRateLimitPerUser:async seconds=>writes.push(['slowmode',id,seconds]),setNSFW:async enabled=>writes.push(['nsfw',id,enabled]),edit:async data=>writes.push(['voice',id,data]),
    delete:async()=>{writes.push(['delete_channel',id]);channels.delete(id);},bulkDelete:async(n,filter)=>{writes.push(['delete_messages',n,filter]);return new Map([['1',{}],['2',{}]]);},
    createInvite:async data=>{writes.push(['invite',data]);return {url:'https://discord.gg/example'};},
    messages:{fetch:async id=>({pin:async()=>writes.push(['pin',id]),unpin:async()=>writes.push(['unpin',id])})}};channels.set(id,c);return c;}
  makeChannel('301','chat');makeChannel('302','gaming',ChannelType.GuildCategory);makeChannel('303','Lobby',ChannelType.GuildVoice);
  const guild={id:'200',name:'Community',ownerId:owner?actor.id:'999',maximumBitrate:96000,
    members:{cache:members,fetch:async arg=>members.get(typeof arg==='string'?arg:arg.user),fetchMe:async()=>bot,unban:async(...args)=>writes.push(['unban',...args])},
    roles:{fetch:async()=>roles,create:async data=>{writes.push(['create_role',data]);return makeRole('202',data.name);}},
    channels:{fetch:async()=>channels,create:async data=>{writes.push(['create_channel',data]);return makeChannel('304',data.name,data.type,data.parent);}},edit:async data=>writes.push(['guild',data])};
  const ctx={guildData:()=>gd,serverSettings:()=>({aiEnabled:true}),saveDB(){},canManageBotSettings:i=>i.member.permissions.has(F.ManageGuild),isBotOwner:()=>owner,
    generateGeminiContent:async()=>({text:JSON.stringify({summary:'Änderungen',actions})})};
  const assistant=createNewAssistant(ctx);
  const interaction=(extra={})=>({id:'401',guild,user:{id:actor.id},member:actor,channelId:'301',options:{getString:()=> 'Mein Wunsch',getBoolean:()=>false},
    deferReply:async()=>{},deferUpdate:async()=>{},reply:async p=>outputs.push(p),editReply:async p=>outputs.push(p),...extra});
  const apply=async()=>{const id=outputs.findLast(p=>p.components?.length)?.components[0].toJSON().components[0].custom_id;assert.ok(id,'review expected');await assistant.handleInteraction(interaction({customId:id}));};
  return {assistant,interaction,apply,writes,outputs,roles,channels,members,actor,bot,recipient,gd,overrides,ctx,makeRole,makeChannel};
}
test('New can create a role, add requested rights, and assign it in one reviewed job',async()=>{
  const f=fixture([{kind:'role',name:'Helfer'},{kind:'role_permissions',role:'Helfer',grant:['SendMessages','ManageMessages']},{kind:'assign_role',role:'Helfer',member:'<@103>'}]);
  await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);assert.ok(f.outputs.at(-1).content.includes('ManageMessages'));
  await f.apply();assert.deepEqual(f.writes.map(x=>x[0]),['create_role','rights','assign']);assert.ok(f.roles.get('202').permissions.has(F.ManageMessages));assert.equal(f.gd.newJobs['401'].state,'done');assert.equal(f.gd.counting.current,42);
});
test('Permission grants/revocations preserve unrelated existing role rights',async()=>{
  const f=fixture([{kind:'role_permissions',role:'201',grant:['SendMessages'],revoke:['AttachFiles']}]);await f.assistant.handle(f.interaction());await f.apply();
  assert.ok(f.roles.get('201').permissions.has(F.ViewChannel));assert.ok(f.roles.get('201').permissions.has(F.SendMessages));assert.equal(f.roles.get('201').permissions.has(F.AttachFiles),false);
});
test('The bot owner can grant rights without personal Discord management flags',async()=>{
  const f=fixture([{kind:'role_permissions',role:'201',grant:['Administrator']}],{owner:true,admin:false,manager:false});f.ctx.canManageBotSettings=()=>true;
  await f.assistant.handle(f.interaction());await f.apply();assert.ok(f.roles.get('201').permissions.has(F.Administrator,false));
});
test('Ordinary members cannot use new to grant, assign, delete, or overwrite roles and channels',async()=>{
  for(const action of [{kind:'assign_role',role:'201',member:'103'},{kind:'role_permissions',role:'201',grant:['Administrator']},{kind:'channel_permissions',target:'301',subject:'@everyone',deny:['ViewChannel']},{kind:'delete_role',role:'201'}]){
    const f=fixture([action],{manager:false,admin:false});await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);assert.equal(f.gd.newJobs['401'].state,'failed');
  }
});
test('ManageGuild alone cannot escalate itself through Administrator or ManageRoles',async()=>{
  for(const permission of ['Administrator','ManageRoles','ManageGuild']){
    const f=fixture([{kind:'role_permissions',role:'201',grant:[permission]}],{admin:false});await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);assert.match(f.outputs.at(-1).content,/Administrator/);
  }
  const f=fixture([{kind:'assign_role',role:'201',member:'103'}],{admin:false});f.roles.get('201').permissions=new PermissionsBitField(F.Administrator);await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);
});
test('User authority lost after preview prevents granting a role even when the interaction is stale',async()=>{
  const f=fixture([{kind:'assign_role',role:'201',member:'103'}]);await f.assistant.handle(f.interaction());f.actor.permissions=new PermissionsBitField(F.ViewChannel);await f.apply();assert.equal(f.writes.length,0);
});
test('Bot permission loss, managed roles and higher roles reject the complete plan before other effects',async()=>{
  for(const fault of ['permission','managed','higher']){
    const f=fixture([{kind:'text_channel',name:'new'},{kind:'assign_role',role:'201',member:'103'}]);
    if(fault==='permission')f.bot.permissions=new PermissionsBitField([F.ViewChannel,F.ManageChannels]);if(fault==='managed')f.roles.get('201').managed=true;if(fault==='higher')f.roles.get('201').position=21;
    await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);
  }
});
test('Channel overwrites patch only requested flags and preserve all other principal settings',async()=>{
  const f=fixture([{kind:'channel_permissions',target:'301',subject:'201',allow:['ViewChannel'],deny:['SendMessages'],inherit:['AttachFiles']}]);f.overrides.set('201',{ReadMessageHistory:true});
  await f.assistant.handle(f.interaction());await f.apply();assert.deepEqual(f.overrides.get('201'),{ReadMessageHistory:true,ViewChannel:true,SendMessages:false,AttachFiles:null});
  assert.throws(()=>validateAction({kind:'channel_permissions',target:'301',subject:'201',allow:['Administrator']}),/Serverweite/);
});
test('Specific member overwrites resolve to the requested member and refuse blocking Pixel itself',async()=>{
  const f=fixture([{kind:'channel_permissions',target:'301',subject:'member:103',allow:['ViewChannel']}]);await f.assistant.handle(f.interaction());await f.apply();assert.ok(f.overrides.has('103'));
  const blocked=fixture([{kind:'channel_permissions',target:'301',subject:'member:102',deny:['ViewChannel']}]);await blocked.assistant.handle(blocked.interaction());assert.equal(blocked.writes.length,0);
});
test('Moving channels keeps their permissions; voice settings, slowmode and invitation use correct API payloads',async()=>{
  const f=fixture([{kind:'move_channel',target:'301',parent:'302',position:2},{kind:'slowmode',target:'301',seconds:15},{kind:'voice_settings',target:'303',limit:5,bitrate:64000},{kind:'invite',target:'301',seconds:3600,uses:5}]);
  await f.assistant.handle(f.interaction());await f.apply();assert.deepEqual(f.writes[0].slice(1),['301','302',{lockPermissions:false,reason:'/new von 101'}]);assert.equal(f.writes.find(x=>x[0]==='voice')[2].userLimit,5);assert.match(f.outputs.at(-1).content,/discord.gg/);
});
test('Timeout uses milliseconds, seconds zero clears it, and nickname, kick, ban and unban target one member',async()=>{
  const f=fixture([{kind:'timeout',member:'103',seconds:60,reason:'Spam'},{kind:'timeout',member:'103',seconds:0},{kind:'nickname',member:'103',name:'Mia Gaming'},{kind:'kick',member:'103',reason:'Test'},{kind:'ban',member:'103',reason:'Test'},{kind:'unban',member:'103'}]);
  await f.assistant.handle(f.interaction());await f.apply();assert.equal(f.writes[0][1],60000);assert.equal(f.writes[1][1],null);assert.equal(f.writes.find(x=>x[0]==='ban')[1].deleteMessageSeconds,0);assert.equal(f.writes.at(-1)[1],'103');
});
test('Server owner, bot, high-ranking members and admins cannot be timed out or moderated through hierarchy bypass',async()=>{
  for(const fault of ['owner','bot','higher','admin']){
    const f=fixture([{kind:'timeout',member:fault==='bot'?'102':fault==='owner'?'999':'103',seconds:60}]);
    if(fault==='owner')f.members.set('999',{...f.recipient,id:'999'});if(fault==='higher')f.recipient.roles.highest.position=25;if(fault==='admin')f.recipient.permissions=new PermissionsBitField(F.Administrator);
    await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);
  }
});
test('Pinning uses PinMessages and history access; bulk delete skips old messages',async()=>{
  const f=fixture([{kind:'pin_message',target:'301',message:'801'},{kind:'unpin_message',target:'301',message:'801'},{kind:'delete_messages',target:'301',count:10}]);await f.assistant.handle(f.interaction());await f.apply();assert.deepEqual(f.writes.at(-1),['delete_messages',10,true]);
  const blocked=fixture([{kind:'pin_message',target:'301',message:'801'}]);blocked.bot.permissions.remove(F.Administrator,F.PinMessages);await blocked.assistant.handle(blocked.interaction());assert.equal(blocked.writes.length,0);
});
test('Deleting a system or counting channel, or a nonempty category, is rejected before any writes',async()=>{
  for(const mode of ['counting','category','ticket']){
    const f=fixture([{kind:'delete_channel',target:mode==='category'?'302':'301'}]);if(mode==='counting')f.gd.channels.counting='301';if(mode==='ticket')f.channels.get('301').topic='ticket-owner:103';if(mode==='category')f.channels.get('301').parentId='302';
    await f.assistant.handle(f.interaction());assert.equal(f.writes.length,0);
  }
});
test('Role rename, position, deletion and server settings affect only requested objects after review',async()=>{
  const f=fixture([{kind:'edit_role',role:'201',name:'Premium',color:'#cc00ff'},{kind:'move_role',role:'201',position:3},{kind:'guild_settings',name:'Pixel Community'},{kind:'delete_role',role:'201'}]);await f.assistant.handle(f.interaction());await f.apply();assert.equal(f.roles.has('201'),false);assert.deepEqual(f.writes.map(x=>x[0]),['edit_role','move_role','guild','delete_role']);
});
test('New actions reject unknown keys, mixed grants, invalid ranges, ambiguous roles and missing target members',async()=>{
  for(const a of [{kind:'role_permissions',role:'201',grant:['root']},{kind:'role_permissions',role:'201',grant:['ViewChannel'],revoke:['ViewChannel']},{kind:'channel_permissions',target:'301',subject:'201',allow:['ViewChannel'],deny:['ViewChannel']},{kind:'timeout',member:'103',seconds:28*86400+1},{kind:'voice_settings',target:'303',limit:100},{kind:'slowmode',target:'301',seconds:-1},{kind:'delete_role',role:'201',exec:'x'}])assert.throws(()=>validatePlan({summary:'x',actions:[a]}));
  const ambiguous=fixture([{kind:'assign_role',role:'VIP',member:'103'}]);ambiguous.makeRole('205','VIP');await ambiguous.assistant.handle(ambiguous.interaction());assert.equal(ambiguous.writes.length,0);
  const missing=fixture([{kind:'assign_role',role:'201',member:'104'}]);await missing.assistant.handle(missing.interaction());assert.equal(missing.writes.length,0);
  assert.equal(validateAction({kind:'role_permissions',role:'201',revoke:['SendMessages']}).revoke[0],'SendMessages');
});
