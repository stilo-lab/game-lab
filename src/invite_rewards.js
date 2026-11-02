'use strict';
const {SlashCommandBuilder,PermissionFlagsBits:P,MessageFlags,EmbedBuilder,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const l10n=require('./localization');
const races=require('./invite_races');
const events=require('./invite_events');
const delivery=require('./join_delivery');
const isCompetition=r=>races.isRace(r)||events.isEvent(r);
const {randomUUID}=require('node:crypto');
const MAX_COUNT=1000000;
const DANGEROUS=['Administrator','ManageGuild','ManageRoles','ManageChannels','ManageWebhooks','BanMembers','KickMembers','ModerateMembers','ManageMessages','ManageThreads','MentionEveryone','ViewAuditLog','ManageEvents','ManageNicknames','MoveMembers','MuteMembers','DeafenMembers'].reduce((bits,key)=>bits|(P[key]||0n),0n);
const t=(gid,en,de)=>l10n.languageFor(gid)==='de'?de:en;
function buildInviteRewardCommands(){return [
  new SlashCommandBuilder().setName('addinvites').setDescription('Staff: add or correct a member\'s invite balance').setDMPermission(false).setDefaultMemberPermissions(P.ManageGuild)
    .addUserOption(o=>o.setName('user').setDescription('Server member').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Invites to add; use a negative number to correct a balance').setRequired(true).setMinValue(-100000).setMaxValue(100000))
    .addStringOption(o=>o.setName('reason').setDescription('Reason recorded in the invite audit').setMaxLength(200)),
  new SlashCommandBuilder().setName('rewards').setDescription('Invite races: first to the target wins the prize').setDMPermission(false)
    .addSubcommand(s=>s.setName('list').setDescription('Show invite races, progress and winners'))
    .addSubcommand(s=>s.setName('claim').setDescription('Race winner: check or retry your prize delivery').addStringOption(o=>o.setName('reward_id').setDescription('Reward ID, for example R1').setRequired(true).setMaxLength(20)))
    .addSubcommand(s=>s.setName('add').setDescription('Staff: start a race with one winner; only new invites count')
      .addIntegerOption(o=>o.setName('invites').setDescription('First member to reach this many new invites wins').setRequired(true).setMinValue(1).setMaxValue(MAX_COUNT))
      .addStringOption(o=>o.setName('name').setDescription('Prize for the first member to reach the target').setRequired(true).setMinLength(1).setMaxLength(80))
      .addRoleOption(o=>o.setName('role').setDescription('Optional winner role; leave empty for a prize delivered by staff')))
    .addSubcommand(s=>s.setName('remove').setDescription('Staff: remove a reward; already granted roles stay')
      .addStringOption(o=>o.setName('reward_id').setDescription('Reward ID').setRequired(true).setMaxLength(20)))
    .addSubcommand(s=>s.setName('leaderboard').setDescription('Show the race standings and its saved winner').addStringOption(o=>o.setName('reward_id').setDescription('Reward ID').setRequired(true).setMaxLength(20)))
    .addSubcommand(s=>s.setName('requests').setDescription('Staff: view pending custom reward requests'))
    .addSubcommand(s=>s.setName('resolve').setDescription('Staff: mark a custom reward request as fulfilled')
      .addUserOption(o=>o.setName('user').setDescription('Member who requested the reward').setRequired(true))
      .addStringOption(o=>o.setName('reward_id').setDescription('Reward ID').setRequired(true).setMaxLength(20))),
  new SlashCommandBuilder().setName('resetinvites').setDescription('Staff: reset current invites; keep lifetime totals and race results').setDMPermission(false).setDefaultMemberPermissions(P.ManageGuild)
    .addUserOption(o=>o.setName('user').setDescription('One member; leave empty to reset the whole server after confirmation')),
  events.buildCommand()
];}
function createInviteRewards({client,db,guildData,userData,saveDB,OWNER_ID,isGuildApproved=()=>true,now=Date.now}={}){
  const queues=new Map(),tickOffsets=new Map(),menuCooldowns=new Map(),resetPreviews=new Map();
  const eventController=events.createController({state,commit,audit,manager,safeRole,applyRoles,now});
  function serial(gid,fn){const previous=queues.get(gid)||Promise.resolve();const next=previous.catch(()=>{}).then(fn);queues.set(gid,next);return next.finally(()=>{if(queues.get(gid)===next)queues.delete(gid);});}
  function rawCount(gid,uid){const n=Number(db.users?.[`${gid}:${uid}`]?.invites||0);return Number.isSafeInteger(n)?Math.max(0,Math.min(MAX_COUNT,n)):0;}
  function state(gid){
    const gd=guildData(gid);if(!gd.inviteProgram||typeof gd.inviteProgram!=='object')gd.inviteProgram={};const p=gd.inviteProgram;
    if(!Array.isArray(p.rewards))p.rewards=[];if(!p.claims||typeof p.claims!=='object')p.claims={};if(!p.members||typeof p.members!=='object')p.members={};if(!Array.isArray(p.audit))p.audit=[];if(!Array.isArray(p.pending))p.pending=[];if(!Number.isSafeInteger(p.nextRewardId)||p.nextRewardId<1)p.nextRewardId=1;
    if(!Array.isArray(p.joinNotices))p.joinNotices=[];
    races.migrate(p);
    if(p.countersVersion!==2){
      const known={};for(const row of Object.values(p.members))if(row?.inviterId)known[row.inviterId]=(known[row.inviterId]||0)+1;
      for(const [key,u]of Object.entries(db.users||{}))if(key.startsWith(gid+':')&&!Number.isSafeInteger(u.inviteTotal)){const uid=key.slice(gid.length+1);u.inviteTotal=Math.max(rawCount(gid,uid),known[uid]||0);}
      p.countersVersion=2;
    }
    return p;
  }
  function count(gid,uid){return rawCount(gid,uid);}
  function total(gid,uid){state(gid);const n=Number(db.users?.[`${gid}:${uid}`]?.inviteTotal);return Math.max(count(gid,uid),Number.isSafeInteger(n)&&n>=0?n:0);}
  function ensureTotal(gid,uid){const u=userData(gid,uid);u.inviteTotal=total(gid,uid);return u;}
  function commit(gid,fn,users=[]){
    const gd=guildData(gid),previous=structuredClone(state(gid)),oldInvites=gd.invites,oldUsers=[...new Set(users)].map(uid=>{const record=userData(gid,uid);return {record,value:record.invites,total:record.inviteTotal,hasTotal:Object.hasOwn(record,'inviteTotal')};});
    try{const result=fn(state(gid));saveDB();return result;}catch(error){gd.inviteProgram=previous;gd.invites=oldInvites;for(const row of oldUsers){row.record.invites=row.value;if(row.hasTotal)row.record.inviteTotal=row.total;else delete row.record.inviteTotal;}throw error;}
  }
  function balancePayload(gid,uid){return {content:t(gid,`📨 <@${uid}>\n**Current invites:** ${count(gid,uid)}\n**Lifetime invites:** ${total(gid,uid)}`,`📨 <@${uid}>\n**Aktuelle Invites:** ${count(gid,uid)}\n**Invites insgesamt:** ${total(gid,uid)}`),allowedMentions:{parse:[]}};}
  function audit(p,row){p.audit.push({...row,at:now()});p.audit=p.audit.slice(-500);}
  async function manager(i){const member=await i.guild.members.fetch({user:i.user.id,force:true});if(i.user.id!==OWNER_ID&&i.user.id!==i.guild.ownerId&&!member.permissions.has(P.ManageGuild))throw Error(t(i.guild.id,'Manage Server is required.','Du brauchst Server verwalten.'));return member;}
  async function safeRole(guild,roleId,actor=null){
    const role=await guild.roles.fetch(roleId);const me=await guild.members.fetchMe({force:true});
    if(!role||role.id===guild.id||role.managed||!me.permissions.has(P.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)throw Error(t(guild.id,'The reward role must be below the bot and assignable with Manage Roles.','Die Belohnungsrolle muss unter dem Bot stehen und mit Rollen verwalten vergebbar sein.'));
    if((BigInt(role.permissions.bitfield)&DANGEROUS)!==0n)throw Error(t(guild.id,'Staff or moderation permissions cannot be used as invite rewards.','Rollen mit Team- oder Moderationsrechten sind als Invite-Belohnung nicht erlaubt.'));
    if(actor&&actor.id!==guild.ownerId&&actor.id!==OWNER_ID&&actor.roles.highest.comparePositionTo(role)<=0)throw Error(t(guild.id,'The reward role must be below your highest role.','Die Belohnungsrolle muss unter deiner höchsten Rolle stehen.'));
    return role;
  }
  function reward(gid,id){return state(gid).rewards.find(r=>r.id===String(id||'').trim().toUpperCase());}
  function archivedReward(gid,id){const history=state(gid).rewardHistory,key=String(id||'').trim().toUpperCase();return Object.hasOwn(history,key)?history[key]:null;}
  async function grantRole(guild,uid,r){
    const gid=guild.id,p=state(gid),record=p.claims[uid]?.[r.id];
    if(record?.status==='claimed')return 'claimed';
    if(!isCompetition(r)||r.status!=='won'||r.winnerId!==uid)throw Error(t(gid,'Only the saved race winner can receive this prize.','Nur der gespeicherte Gewinner des Rennens erhält diesen Preis.'));
    const member=await guild.members.fetch({user:uid,force:true});if(member.user.bot)throw Error('Bots cannot claim invite rewards.');
    await safeRole(guild,r.roleId);
    if(!record)commit(gid,s=>{s.claims[uid]||={};s.claims[uid][r.id]={status:'granting',requestedAt:now(),roleId:r.roleId,name:r.name};});
    // Assigning the same role again is idempotent after an interrupted request.
    if(!member.roles.cache.has(r.roleId))await member.roles.add(r.roleId,events.isEvent(r)?`Invite event ${r.id}: ${r.winningScore} new invites`:`Invite reward ${r.id}: ${r.requiredInvites} invites`);
    commit(gid,s=>{s.claims[uid]||={};s.claims[uid][r.id]={...s.claims[uid][r.id],status:'claimed',claimedAt:now()};});return 'granted';
  }
  async function announceWinner(guild,r){
    if(events.isEvent(r))return eventController.announce(guild,r);
    if(!races.isRace(r)||r.status!=='won'||r.noticeAttempted)return;
    const channel=guild.channels.cache.get(r.channelId);if(!channel?.send)return;
    // Reserve the notification before sending. Winner selection never depends
    // on a Discord send, and a retried task cannot publish a second winner.
    commit(guild.id,()=>{r.noticeAttempted=true;});
    try{const msg=await channel.send({content:t(guild.id,`🏁 <@${r.winnerId}> won invite race **${r.id}**: **${r.name}**! Target: **${r.requiredInvites} new invites**.`,`🏁 <@${r.winnerId}> hat Invite-Rennen **${r.id}** gewonnen: **${r.name}**! Ziel: **${r.requiredInvites} neue Invites**.`),allowedMentions:{parse:[]}});commit(guild.id,()=>{r.winnerMessageId=msg.id;});}
    catch(error){console.warn('Invite race announcement unavailable:',guild.id,r.id,error.code||error.message);}
  }
  async function applyRoles(guild,uid){
    const p=state(guild.id),all=[...p.rewards,...Object.values(p.rewardHistory)];
    for(const r of all){if(!isCompetition(r)||r.status!=='won'||r.winnerId!==uid)continue;await announceWinner(guild,r);if(r.roleId&&state(guild.id).claims[uid]?.[r.id]?.status!=='claimed')try{await grantRole(guild,uid,r);}catch(error){console.warn('Invite reward not granted:',guild.id,r.id,error.code||error.message);}}
  }
  async function snapshot(guild){return serial(guild.id,async()=>{const invites=await delivery.within(guild.invites.fetch());commit(guild.id,p=>{guildData(guild.id).invites=Object.fromEntries([...invites].map(([code,inv])=>[code,inv.uses||0]));p.initialized=true;p.trackingGap=false;p.snapshotAt=now();p.pending=[];});});}
  async function inviteCreated(inv){if(!inv.guild||!isGuildApproved(inv.guild.id))return;return serial(inv.guild.id,()=>{commit(inv.guild.id,()=>{guildData(inv.guild.id).invites={...guildData(inv.guild.id).invites,[inv.code]:inv.uses||0};});});}
  async function memberJoined(member){const guild=member.guild,gid=guild.id;if(!isGuildApproved(gid))return;
    return serial(gid,async()=>{
      const p=state(gid),old=p.members[member.id];
      if(old?.active&&old.joinedAt===member.joinedTimestamp)return;
      const noticeKey=member.id+':'+(member.joinedTimestamp||0);
      if(p.joinNotices.some(row=>row.key===noticeKey))return;
      const reserve=s=>{s.joinNotices.push({key:noticeKey,at:now(),status:'pending'});s.joinNotices=s.joinNotices.slice(-1000);};
      const notify=async info=>{
        const result=await delivery.sendInviteLog({client,member,data:guildData(gid),...info});
        commit(gid,s=>{const record=s.joinNotices.find(row=>row.key===noticeKey);if(record)Object.assign(record,{status:result.status,messageId:result.messageId||null});});
        if(result.status!=='sent')console.warn('Invite log delivery unavailable:',result.status);
      };
      let invites;
      try{invites=await delivery.within(guild.invites.fetch());}
      catch{commit(gid,s=>{s.trackingGap=true;s.pending=[];reserve(s);});await notify({reason:'unavailable'});return;}
      const baseline=!p.initialized||p.trackingGap,before=guildData(gid).invites||{},pending=baseline?[]:p.pending.filter(row=>row.expiresAt>now());
      const changes=[];if(!baseline)for(const [code,inv]of invites){if(Object.hasOwn(before,code)){const delta=(inv.uses||0)-before[code];if(Number.isInteger(delta)&&delta>0&&delta<=100)for(let i=0;i<delta;i++)changes.push({inviterId:inv.inviterId||inv.inviter?.id,expiresAt:now()+30000});}}
      pending.push(...changes);const inviters=new Set(pending.map(row=>row.inviterId).filter(Boolean));
      // Multiple different invite increases cannot safely be attributed to one member.
      const ticket=inviters.size===1?pending.shift():null;if(inviters.size!==1)pending.length=0;
      const inviterId=ticket?.inviterId;
      let valid=inviterId&&inviterId!==member.id&&!member.user.bot&&!old?.active&&(!old||old.inviterId===inviterId),reason=member.user.bot?'bot':baseline?'baseline':'unknown';
      let racer=null;
      if(valid)try{racer=await delivery.within(guild.members.fetch({user:inviterId,force:true}));}catch(error){if(Number(error.code)!==10007){valid=false;reason='unavailable';}}
      commit(gid,s=>{
        guildData(gid).invites=Object.fromEntries([...invites].map(([code,inv])=>[code,inv.uses||0]));s.initialized=true;s.trackingGap=false;s.snapshotAt=now();s.pending=pending;reserve(s);
        if(valid){
          const u=ensureTotal(gid,inviterId);u.invites=Math.min(MAX_COUNT,count(gid,inviterId)+1);
          if(!old)u.inviteTotal=Math.min(Number.MAX_SAFE_INTEGER,u.inviteTotal+1);else u.inviteTotal=Math.max(u.inviteTotal,u.invites);
          const ids=racer&&!racer.user.bot?(old?(old.raceCredits||[]):null):[];
          const raceCredits=races.advance(s,inviterId,1,{ids,eventId:'join:'+member.id+':'+member.joinedTimestamp,now:now(),occurredAt:Number.isFinite(member.joinedTimestamp)?member.joinedTimestamp:0});
          s.members[member.id]={...old,inviterId,active:true,currentCredit:true,raceCredits:[...new Set([...(old?.raceCredits||[]),...raceCredits])],firstSeenAt:old?.firstSeenAt||old?.joinedAt||now(),joinedAt:member.joinedTimestamp||now()};
          audit(s,{type:'join',userId:inviterId,memberId:member.id,amount:1});
        }
      },valid?[inviterId]:[]);
      await notify(valid?{inviterId,count:count(gid,inviterId)}:{reason});
      if(valid)await applyRoles(guild,inviterId);
    });
  }
  async function memberLeft(member){const gid=member.guild.id;if(!isGuildApproved(gid))return;return serial(gid,()=>{
    const record=state(gid).members[member.id];if(!record?.active)return;
    commit(gid,p=>{
      const u=ensureTotal(gid,record.inviterId);p.members[member.id].active=false;p.members[member.id].leftAt=now();
      if(record.currentCredit!==false)u.invites=Math.max(0,count(gid,record.inviterId)-1);
      races.advance(p,record.inviterId,-1,{ids:record.raceCredits||[],now:now()});
      audit(p,{type:'leave',userId:record.inviterId,memberId:member.id,amount:record.currentCredit===false?0:-1});
    },[record.inviterId]);
  });}
  function raceEmbed(gid,r,uid=null,leaderboard=false){
    if(events.isEvent(r))return events.embed(gid,r,now());
    const de=l10n.languageFor(gid)==='de',status=r.status==='won'?(de?'Beendet':'Finished'):r.status==='active'?(de?'Läuft':'Active'):r.status==='cancelled'?(de?'Abgebrochen':'Cancelled'):(de?'Frühere Belohnung · pausiert':'Earlier reward · paused');
    const embed=new EmbedBuilder().setTitle(`🏁 ${r.id} · ${r.name}`.slice(0,256)).setDescription(t(gid,`**Prize:** ${r.name}\n**Target:** ${r.requiredInvites} new invites\n**Status:** ${status}\nThe first member to reach the target wins. Invites before the race do not count.`,`**Preis:** ${r.name}\n**Ziel:** ${r.requiredInvites} neue Invites\n**Status:** ${status}\nWer zuerst das Ziel erreicht, gewinnt. Invites vor dem Rennen zählen nicht.`));
    if(r.winnerId)embed.addFields({name:de?'Gewinner':'Winner',value:`<@${r.winnerId}>`});
    else if(uid&&races.isRace(r))embed.addFields({name:de?'Dein Fortschritt':'Your progress',value:`${races.progress(r,uid)} / ${r.requiredInvites}`});
    if(leaderboard)embed.addFields({name:de?'Rangliste':'Leaderboard',value:races.leaders(r).map((row,i)=>`${i+1}. <@${row.userId}> · **${row.invites}/${r.requiredInvites}**`).join('\n')||(de?'Noch keine neuen Invites.':'No new invites yet.')});
    if(!races.isRace(r))embed.addFields({name:de?'Frühere Konfiguration':'Earlier configuration',value:de?'Es gibt keinen verlässlichen ersten Gewinner. Starte mit /rewards add ein neues Rennen.':'There is no reliable first-finisher history. Start a new race with /rewards add.'});
    return embed;
  }
  function listPayload(gid,uid){
    const p=state(gid),embed=new EmbedBuilder().setTitle(t(gid,'🏁 Invite races','🏁 Invite-Rennen')).setDescription(t(gid,`**Current:** ${count(gid,uid)} · **Lifetime:** ${total(gid,uid)}\nEach race starts at zero and has one winner. /rewards leaderboard shows the standings.`,`**Aktuell:** ${count(gid,uid)} · **Insgesamt:** ${total(gid,uid)}\nJedes Rennen startet bei null und hat einen Gewinner. /rewards leaderboard zeigt die Rangliste.`));
    const options=[];
    for(const r of p.rewards){const value=events.isEvent(r)?t(gid,`Timed event · ${events.progress(r,uid)} new invites · ${r.winnerId?'Winner: <@'+r.winnerId+'>':r.status==='active'?'<t:'+Math.floor(r.endAt/1000)+':R>':r.status}`,`Zeit-Event · ${events.progress(r,uid)} neue Invites · ${r.winnerId?'Gewinner: <@'+r.winnerId+'>':r.status==='active'?'<t:'+Math.floor(r.endAt/1000)+':R>':r.status}`):r.status==='won'?t(gid,`🏆 Winner: <@${r.winnerId}>`,`🏆 Gewinner: <@${r.winnerId}>`):races.isRace(r)?t(gid,`Your progress: ${races.progress(r,uid)}/${r.requiredInvites} new invites`,`Dein Fortschritt: ${races.progress(r,uid)}/${r.requiredInvites} neue Invites`):t(gid,'Earlier threshold reward · paused','Frühere Schwellen-Belohnung · pausiert');embed.addFields({name:`${r.id} · ${r.name}`.slice(0,256),value});if(r.winnerId===uid&&p.claims[uid]?.[r.id]?.status==='granting')options.push({label:`${r.id} · ${r.name}`.slice(0,100),value:r.id,description:t(gid,'Retry your winner role','Gewinnerrolle erneut versuchen')});}
    if(!p.rewards.length)embed.addFields({name:t(gid,'No races configured','Keine Rennen eingerichtet'),value:t(gid,'Staff can start one with /rewards add.','Das Team startet mit /rewards add ein Rennen.')});
    return {embeds:[embed],components:options.length?[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`pxreward:claim:${uid}`).setPlaceholder(t(gid,'Retry prize delivery','Preisvergabe erneut versuchen')).addOptions(options))]:[],allowedMentions:{parse:[]}};
  }
  async function claim(guild,uid,id){
    const gid=guild.id,r=reward(gid,id)||archivedReward(gid,id);if(!r)throw Error(t(gid,'Reward not found.','Belohnung nicht gefunden.'));
    if(!isCompetition(r)||r.status!=='won'||r.winnerId!==uid)throw Error(t(gid,'Only the saved race winner can receive this prize.','Nur der gespeicherte Gewinner des Rennens erhält diesen Preis.'));
    const member=await guild.members.fetch({user:uid,force:true});if(member.user.bot)throw Error('Bots cannot claim invite rewards.');
    const old=state(gid).claims[uid]?.[r.id];if(old?.status==='claimed')return t(gid,'You already received this prize.','Du hast diesen Preis bereits erhalten.');
    if(r.roleId){await grantRole(guild,uid,r);return t(gid,`✅ Winner role for ${r.id} granted: <@&${r.roleId}>.`,`✅ Gewinnerrolle für ${r.id} vergeben: <@&${r.roleId}>.`);}
    return t(gid,'🏆 You won. Your prize request is already saved for staff in /rewards requests.','🏆 Du hast gewonnen. Deine Preisanfrage ist bereits für das Team unter /rewards requests gespeichert.');
  }
  async function resetPreview(i){
    await manager(i);const uid=i.options.getUser('user')?.id||null;for(const [key,p]of resetPreviews)if(p.expiresAt<now())resetPreviews.delete(key);if(resetPreviews.size>=200)throw Error('Too many open reset previews. Try again later.');
    const id=randomUUID(),gid=i.guild.id;resetPreviews.set(id,{guildId:gid,channelId:i.channelId||i.channel.id,ownerId:i.user.id,userId:uid,expiresAt:now()+2*60000});
    return i.editReply({content:t(gid,`Reset current invites for ${uid?'<@'+uid+'>':'the entire server'}? Lifetime totals, race progress and saved winners stay.`,`Aktuelle Invites für ${uid?'<@'+uid+'>':'den gesamten Server'} zurücksetzen? Gesamtzahlen, Rennfortschritte und gespeicherte Gewinner bleiben erhalten.`),components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pxinvite:reset:'+id).setLabel(t(gid,'Reset current invites','Aktuelle Invites zurücksetzen')).setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('pxinvite:cancel:'+id).setLabel(t(gid,'Cancel','Abbrechen')).setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}});
  }
  async function resetInteraction(i){
    const [,action,id]=i.customId.split(':'),p=resetPreviews.get(id),gid=i.guild?.id;
    if(!p||p.expiresAt<now()||p.guildId!==gid||p.ownerId!==i.user.id||p.channelId!==(i.channelId||i.channel?.id)){await i.reply({content:t(gid,'This reset preview expired or belongs to another user/channel.','Diese Reset-Vorschau ist abgelaufen oder gehört einem anderen Nutzer/Kanal.'),flags:MessageFlags.Ephemeral});return true;}
    await i.deferUpdate();
    try{await serial(gid,async()=>{
      // Recheck the token after waiting for other joins or manual adjustments.
      if(resetPreviews.get(id)!==p||p.expiresAt<now())throw Error(t(gid,'This reset was already handled or expired.','Dieser Reset wurde bereits bearbeitet oder ist abgelaufen.'));
      await manager(i);if(action==='cancel'){resetPreviews.delete(id);await i.editReply({content:t(gid,'Reset cancelled.','Reset abgebrochen.'),components:[]});return;}
      if(action!=='reset')throw Error('Unknown reset action.');
      const users=p.userId?[p.userId]:Object.keys(db.users||{}).filter(key=>key.startsWith(gid+':')).map(key=>key.slice(gid.length+1));const targets=new Set(users);
      commit(gid,s=>{for(const uid of users){const u=ensureTotal(gid,uid);u.invites=0;}for(const row of Object.values(s.members))if(targets.has(row.inviterId))row.currentCredit=false;audit(s,{type:'reset-current',actorId:i.user.id,userId:p.userId,users:users.length,eventId:i.id});},users);
      resetPreviews.delete(id);await i.editReply({content:t(gid,`✅ Current invites reset for ${p.userId?'<@'+p.userId+'>':'the server'}. Lifetime totals and race results are preserved.`,`✅ Aktuelle Invites für ${p.userId?'<@'+p.userId+'>':'den Server'} zurückgesetzt. Gesamtzahlen und Rennergebnisse bleiben erhalten.`),components:[],allowedMentions:{parse:[]}});
    });}catch(error){await i.followUp({content:'❌ '+String(error.message||error).slice(0,1500),flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});}return true;
  }
  async function handleInteraction(i){
    if(String(i.customId||'').startsWith('pxevent:')){
      if(!i.guild){await i.reply({content:'Use this button in its server.',flags:MessageFlags.Ephemeral});return true;}
      await i.deferReply({flags:MessageFlags.Ephemeral});
      try{await serial(i.guild.id,()=>eventController.component(i));}catch(error){await i.editReply({content:'❌ '+String(error.message||error).slice(0,1000),allowedMentions:{parse:[]}});}return true;
    }
    if(String(i.customId||'').startsWith('pxinvite:'))return resetInteraction(i);const menu=i.isStringSelectMenu?.()&&String(i.customId).startsWith('pxreward:claim:'),command=i.isChatInputCommand?.()&&['addinvites','rewards','resetinvites','inviteevent'].includes(i.commandName);if(!menu&&!command)return false;
    const gid=i.guild?.id;if(!gid){await i.reply({content:'Use this command in a server.',flags:MessageFlags.Ephemeral});return true;}
    if(menu&&i.customId!==`pxreward:claim:${i.user.id}`){await i.reply({content:t(gid,'Open your own /rewards list.','Öffne deine eigene /rewards list.'),flags:MessageFlags.Ephemeral});return true;}
    if(menu){const key=gid+':'+i.user.id,last=menuCooldowns.get(key);if(last!==undefined&&now()-last<2000){await i.reply({content:t(gid,'Please wait two seconds before claiming again.','Warte bitte zwei Sekunden vor der nächsten Abholung.'),flags:MessageFlags.Ephemeral});return true;}menuCooldowns.set(key,now());if(menuCooldowns.size>10000)menuCooldowns.delete(menuCooldowns.keys().next().value);}
    await i.deferReply({flags:MessageFlags.Ephemeral});
    try{await serial(gid,async()=>{
      if(i.commandName==='inviteevent'){await eventController.handle(i);return;}
      if(i.commandName==='resetinvites'){await resetPreview(i);return;}
      if(menu){const content=await claim(i.guild,i.user.id,i.values?.[0]);await i.editReply({content,allowedMentions:{parse:[]}});return;}
      if(i.commandName==='addinvites'){
        await manager(i);const user=i.options.getUser('user'),amount=i.options.getInteger('amount'),reason=i.options.getString('reason')||'';
        const member=await i.guild.members.fetch({user:user.id,force:true});if(member.user.bot)throw Error(t(gid,'Invite balances are for human members.','Invite-Guthaben ist für menschliche Mitglieder.'));
        if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>100000)throw Error('Amount must be a non-zero integer from -100000 to 100000.');
        const previous=state(gid).audit.find(row=>row.eventId===i.id&&row.type==='manual');
        if(!previous){const next=count(gid,user.id)+amount;if(next<0||next>MAX_COUNT)throw Error(t(gid,'The resulting balance must be between 0 and 1000000.','Das neue Guthaben muss zwischen 0 und 1000000 liegen.'));
          commit(gid,p=>{const u=ensureTotal(gid,user.id);u.invites=next;if(amount>0)u.inviteTotal=Math.min(Number.MAX_SAFE_INTEGER,u.inviteTotal+amount);races.advance(p,user.id,amount,{eventId:i.id,now:now()});audit(p,{type:'manual',eventId:i.id,actorId:i.user.id,userId:user.id,amount,reason:reason.slice(0,200)});},[user.id]);}
        await applyRoles(i.guild,user.id);await i.editReply({content:t(gid,`✅ <@${user.id}> now has **${count(gid,user.id)} invites**.`,`✅ <@${user.id}> hat jetzt **${count(gid,user.id)} Invites**.`),allowedMentions:{parse:[]}});return;
      }
      const sub=i.options.getSubcommand();
      if(sub==='list'){await l10n.withProtectedValues(state(gid).rewards.map(r=>r.name),()=>i.editReply(listPayload(gid,i.user.id)));return;}
      if(sub==='claim'){const content=await claim(i.guild,i.user.id,i.options.getString('reward_id'));await i.editReply({content,allowedMentions:{parse:[]}});return;}
      if(sub==='leaderboard'){const id=String(i.options.getString('reward_id')||'').trim().toUpperCase(),r=reward(gid,id)||archivedReward(gid,id);if(!r)throw Error(t(gid,'Reward not found.','Belohnung nicht gefunden.'));await l10n.withProtectedValues([r.name],()=>i.editReply({embeds:[raceEmbed(gid,r,i.user.id,true)],allowedMentions:{parse:[]}}));return;}
      const actor=await manager(i);
      if(sub==='add'){
        const n=i.options.getInteger('invites'),name=i.options.getString('name')?.trim(),role=i.options.getRole('role');if(!Number.isInteger(n)||n<1||n>MAX_COUNT||!name||name.length>80)throw Error('Invalid reward name or invite requirement.');
        if(state(gid).rewards.length>=25)throw Error(t(gid,'At most 25 rewards per server.','Höchstens 25 Belohnungen pro Server.'));if(role)await safeRole(i.guild,role.id,actor);
        const existing=state(gid).rewards.find(r=>r.creationEventId===i.id);
        let id=existing?.id;if(!existing)commit(gid,p=>{id='R'+p.nextRewardId++;p.rewards.push({id,name,kind:'race',status:'active',progress:{},requiredInvites:n,roleId:role?.id||null,channelId:i.channelId||i.channel.id,creationEventId:i.id,createdBy:i.user.id,createdAt:now()});audit(p,{type:'reward-add',rewardId:id,actorId:i.user.id});});
        const r=reward(gid,id);if(!r.startNoticeAttempted){commit(gid,()=>{r.startNoticeAttempted=true;});try{const msg=await i.channel.send({embeds:[raceEmbed(gid,r)],allowedMentions:{parse:[]}});commit(gid,()=>{r.messageId=msg.id;});}catch(error){console.warn('Invite race post unavailable:',gid,id,error.code||error.message);}}
        await i.editReply({content:t(gid,`✅ Race **${id}** created: first to **${n} new invites** wins **${name}**. Everyone starts at zero.`,`✅ Rennen **${id}** erstellt: Wer zuerst **${n} neue Invites** erreicht, gewinnt **${name}**. Alle starten bei null.`),allowedMentions:{parse:[]}});return;
      }
      if(sub==='requests'){
        const lines=[];for(const [uid,claims]of Object.entries(state(gid).claims))for(const [id,row]of Object.entries(claims))if(row.status==='requested')lines.push({uid,id,...row});
        lines.sort((a,b)=>a.requestedAt-b.requestedAt);const desc=lines.slice(0,25).map(r=>`**${r.id}** · <@${r.uid}> · ${String(r.name).slice(0,80)}`).join('\n')||t(gid,'No pending requests.','Keine offenen Anfragen.');
        await i.editReply({embeds:[new EmbedBuilder().setTitle(t(gid,'Pending reward requests','Offene Belohnungsanfragen')).setDescription(desc).setFooter({text:t(gid,`${lines.length} pending; showing the oldest 25. Use /rewards resolve after delivery.`,`${lines.length} offen; die ältesten 25 werden angezeigt. Nach Auslieferung /rewards resolve nutzen.`)})],allowedMentions:{parse:[]}});return;
      }
      if(sub==='remove'){
        const r=reward(gid,i.options.getString('reward_id'));if(!r)throw Error(t(gid,'Reward not found.','Belohnung nicht gefunden.'));
        commit(gid,p=>{p.rewardHistory[r.id]={...r,status:r.status==='active'?'cancelled':r.status};p.rewards=p.rewards.filter(row=>row.id!==r.id);audit(p,{type:'reward-remove',rewardId:r.id,actorId:i.user.id});});
        await i.editReply({content:t(gid,`✅ Reward ${r.id} removed. Existing roles and pending requests are retained.`,`✅ Belohnung ${r.id} entfernt. Bereits vergebene Rollen und offene Anfragen bleiben erhalten.`)});return;
      }
      if(sub==='resolve'){
        const uid=i.options.getUser('user').id,id=String(i.options.getString('reward_id')||'').trim().toUpperCase();if(state(gid).claims[uid]?.[id]?.status!=='requested')throw Error(t(gid,'No pending request found.','Keine offene Anfrage gefunden.'));
        commit(gid,p=>{Object.assign(p.claims[uid][id],{status:'claimed',claimedAt:now(),resolvedBy:i.user.id});audit(p,{type:'reward-resolve',rewardId:id,userId:uid,actorId:i.user.id});});
        await i.editReply({content:t(gid,'✅ Request marked as fulfilled.','✅ Anfrage als erfüllt markiert.')});return;
      }
      throw Error('Unknown rewards command.');
    });}catch(error){await i.editReply({content:'❌ '+String(error.message||error).slice(0,1500),allowedMentions:{parse:[]}});}
    return true;
  }
  async function tick(){for(const guild of client.guilds.cache.values()){if(!isGuildApproved(guild.id))continue;await serial(guild.id,async()=>{
    await eventController.finish(guild);
    const p=state(guild.id),winners=[...new Set([...p.rewards,...Object.values(p.rewardHistory)].filter(r=>isCompetition(r)&&r.status==='won').map(r=>r.winnerId))];
    if(!winners.length)return;const offset=(tickOffsets.get(guild.id)||0)%winners.length;for(let n=0;n<Math.min(25,winners.length);n++)await applyRoles(guild,winners[(offset+n)%winners.length]);tickOffsets.set(guild.id,offset+25);
  }).catch(error=>console.warn('Invite reward tick failed:',guild.id,error.code||error.message));}}
  async function finishEvents(){for(const guild of client.guilds.cache.values())if(isGuildApproved(guild.id))await serial(guild.id,()=>eventController.finish(guild)).catch(error=>console.warn('Invite event finish failed:',guild.id,error.code||error.message));}
  return {finishEvents,count,total,balancePayload,snapshot,inviteCreated,memberJoined,memberLeft,handleInteraction,tick,state,claim:(guild,uid,id)=>serial(guild.id,()=>claim(guild,uid,id)),applyRoles:(guild,uid)=>serial(guild.id,()=>applyRoles(guild,uid)),queues};
}
module.exports={buildInviteRewardCommands,createInviteRewards,MAX_COUNT,DANGEROUS};
