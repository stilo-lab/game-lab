'use strict';
const {SlashCommandBuilder,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const locale=require('./localization');
const MAX_PROGRESS=1000000;
const t=(gid,en,de)=>locale.languageFor(gid)==='de'?de:en;
function isEvent(r){return r?.kind==='timed-event';}
function duration(input){const m=String(input||'').trim().match(/^(\d{1,7})(s|m|h|d)$/i);if(!m)return null;const ms=Number(m[1])*({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]);return ms>=60000&&ms<=30*86400000?ms:null;}
function progress(r,uid){const n=r.progress?.[uid];return Number.isSafeInteger(n)?Math.max(0,Math.min(MAX_PROGRESS,n)):0;}
function leaders(r,limit=10){return Object.keys(r.progress||{}).map(userId=>({userId,invites:progress(r,userId),reachedAt:Number(r.reachedAt?.[userId])||r.createdAt})).filter(x=>x.invites>0).sort((a,b)=>b.invites-a.invites||a.reachedAt-b.reachedAt||a.userId.localeCompare(b.userId)).slice(0,limit);}
function advance(program,uid,amount,{ids=null,now=Date.now(),occurredAt=now}={}){
  const credited=[];
  for(const r of program.rewards){
    if(!isEvent(r)||r.status!=='active'||now>=r.endAt||occurredAt<r.createdAt||occurredAt>=r.endAt||(ids&&!ids.includes(r.id)))continue;
    const previous=progress(r,uid),next=Math.max(0,Math.min(MAX_PROGRESS,previous+amount));if(previous===next)continue;
    r.progress[uid]=next;r.reachedAt||={};r.reachedAt[uid]=now;credited.push(r.id);
  }
  return credited;
}
function buildCommand(){return new SlashCommandBuilder().setName('inviteevent').setDescription('Timed invite contests: most new invites when time runs out wins').setDMPermission(false)
  .addSubcommand(s=>s.setName('start').setDescription('Staff: start an invite event; everyone begins at zero')
    .addStringOption(o=>o.setName('duration').setDescription('Time limit: 1d, 12h, 30m; 1 minute to 30 days').setRequired(true).setMaxLength(10))
    .addStringOption(o=>o.setName('prize').setDescription('Prize for the member with the most new invites').setRequired(true).setMinLength(1).setMaxLength(80))
    .addRoleOption(o=>o.setName('role').setDescription('Optional automatic winner role')))
  .addSubcommand(s=>s.setName('list').setDescription('Show invite events and their saved results'))
  .addSubcommand(s=>s.setName('leaderboard').setDescription('Show an event leaderboard and deadline').addStringOption(o=>o.setName('event_id').setDescription('Event ID, for example E1').setRequired(true).setMaxLength(20)))
  .addSubcommand(s=>s.setName('cancel').setDescription('Staff: cancel a running event without awarding its prize').addStringOption(o=>o.setName('event_id').setDescription('Event ID').setRequired(true).setMaxLength(20)));}
function embed(gid,r,at=Date.now()){
  const de=locale.languageFor(gid)==='de',status=r.status==='active'?(at>=r.endAt?t(gid,'Awaiting result','Auswertung ausstehend'):t(gid,'Active','Läuft')):r.status==='cancelled'?t(gid,'Cancelled','Abgebrochen'):t(gid,'Finished','Beendet');
  const e=new EmbedBuilder().setTitle(`⏳ ${r.id} · ${r.name}`.slice(0,256)).setDescription(t(gid,`**Prize:** ${r.name}\n**End:** <t:${Math.floor(r.endAt/1000)}:F> (<t:${Math.floor(r.endAt/1000)}:R>)\n**Status:** ${status}\nMost new invites wins. Earlier invites do not count. Ties: first to reach the final score. Manual invite credits count; tracked leavers before the deadline reduce the score.`,`**Preis:** ${r.name}\n**Ende:** <t:${Math.floor(r.endAt/1000)}:F> (<t:${Math.floor(r.endAt/1000)}:R>)\n**Status:** ${status}\nDie meisten neuen Invites gewinnen. Frühere Invites zählen nicht. Gleichstand: Wer den Endstand zuerst erreicht, gewinnt. Manuelle Invites zählen; getrackte Austritte vor Ende senken den Stand.`));
  if(r.winnerId)e.addFields({name:de?'Gewinner':'Winner',value:`<@${r.winnerId}> · **${r.winningScore}**`});
  else if(r.status==='finished')e.addFields({name:de?'Ergebnis':'Result',value:t(gid,'No eligible member with a positive score. No prize awarded.','Kein teilnahmeberechtigtes Mitglied mit positivem Stand. Kein Preis vergeben.')});
  e.addFields({name:de?'Rangliste':'Leaderboard',value:leaders(r).map((x,i)=>`${i+1}. <@${x.userId}> · **${x.invites}**`).join('\n')||t(gid,'No new invites yet.','Noch keine neuen Invites.')});
  return e;
}
function createController({state,commit,audit,manager,safeRole,applyRoles,now=Date.now}={}){
  const viewers=new Map();
  function rows(gid,r){return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pxevent:board:${r.id}`).setLabel(t(gid,'Leaderboard / my score','Rangliste / mein Stand')).setEmoji('🏆').setStyle(ButtonStyle.Primary))];}
  async function refreshPost(guild,r){
    if(!r.displayPending||!r.messageId)return;
    const channel=guild.channels.cache.get(r.channelId);if(!channel?.messages?.fetch)return;
    try{const msg=await channel.messages.fetch(r.messageId);await locale.withProtectedValues([r.name],()=>msg.edit({embeds:[embed(guild.id,r,now())],components:rows(guild.id,r),allowedMentions:{parse:[]}}));
      commit(guild.id,()=>{r.displayPending=false;});
    }catch(error){console.warn('Invite event display pending:',guild.id,r.id,error.code||error.message);}
  }
  function find(gid,id){const p=state(gid),key=String(id||'').trim().toUpperCase();const r=p.rewards.find(x=>x.id===key)||p.rewardHistory[key];return isEvent(r)?r:null;}
  async function announce(guild,r){
    if(!isEvent(r)||!['won','finished'].includes(r.status)||r.noticeAttempted)return;
    const channel=guild.channels.cache.get(r.channelId);if(!channel?.send)return;
    commit(guild.id,()=>{r.noticeAttempted=true;});
    try{const msg=await locale.withProtectedValues([r.name],()=>channel.send({embeds:[embed(guild.id,r,now())],allowedMentions:{parse:[]}}));commit(guild.id,()=>{r.winnerMessageId=msg.id;});}
    catch(error){console.warn('Invite event announcement unavailable:',guild.id,r.id,error.code||error.message);}
  }
  async function finish(guild){
    for(const r of state(guild.id).rewards)if(isEvent(r)&&['won','finished','cancelled'].includes(r.status)&&r.displayPending===undefined)commit(guild.id,()=>{r.displayPending=true;});
    for(const r of state(guild.id).rewards.filter(x=>isEvent(x)&&x.status==='active'&&x.endAt<=now())){
      let winner=null;
      for(const row of leaders(r,Infinity)){
        let member;try{member=await guild.members.fetch({user:row.userId,force:true});}catch(error){if(Number(error.code)===10007)continue;throw error;}
        if(!member.user.bot){winner=row;break;}
      }
      commit(guild.id,p=>{
        r.status=winner?'won':'finished';r.finishedAt=now();r.displayPending=true;
        if(winner){r.winnerId=winner.userId;r.winningScore=winner.invites;r.wonAt=now();p.claims[winner.userId]||={};p.claims[winner.userId][r.id]={status:r.roleId?'granting':'requested',name:r.name,roleId:r.roleId||null,requestedAt:now(),eventWinner:true};}
        audit(p,{type:'event-finish',rewardId:r.id,userId:winner?.userId||null,score:winner?.invites||0});
      });
      await announce(guild,r);if(winner)await applyRoles(guild,winner.userId);
    }
    // Retry notices after a missing channel/cache, including empty contests.
    for(const r of state(guild.id).rewards)if(isEvent(r)&&['won','finished'].includes(r.status))await announce(guild,r);
    for(const r of state(guild.id).rewards)if(isEvent(r)&&r.displayPending)await refreshPost(guild,r);
  }
  async function component(i){
    const [,action,id,...extra]=String(i.customId||'').split(':'),r=find(i.guild.id,id);
    if(extra.length||action!=='board'||!r||r.channelId!==(i.channelId||i.channel?.id)||r.messageId!==i.message?.id)throw Error(t(i.guild.id,'This event button is unavailable or belongs to another message.','Dieser Event-Button ist nicht verfügbar oder gehört zu einer anderen Nachricht.'));
    const key=i.guild.id+':'+i.user.id,last=viewers.get(key);if(last!==undefined&&now()-last<5000)throw Error(t(i.guild.id,'Please wait five seconds before refreshing standings.','Warte bitte fünf Sekunden vor der nächsten Rangliste.'));
    viewers.set(key,now());if(viewers.size>2000)viewers.delete(viewers.keys().next().value);
    await i.guild.members.fetch({user:i.user.id,force:true});await finish(i.guild);
    const e=embed(i.guild.id,r,now()).addFields({name:t(i.guild.id,'Your event score','Dein Event-Stand'),value:String(progress(r,i.user.id))});
    await locale.withProtectedValues([r.name],()=>i.editReply({embeds:[e],allowedMentions:{parse:[]}}));
  }
  async function handle(i){
    const gid=i.guild.id,sub=i.options.getSubcommand();await finish(i.guild);
    if(sub==='list'){
      const rows=state(gid).rewards.filter(isEvent),e=new EmbedBuilder().setTitle(t(gid,'⏳ Invite events','⏳ Invite-Events'));
      e.setDescription(rows.length?rows.map(r=>`**${r.id} · ${r.name}** — ${r.winnerId?`🏆 <@${r.winnerId}> · ${r.winningScore}`:r.status==='active'?`<t:${Math.floor(r.endAt/1000)}:R>`:r.status}`).join('\n').slice(0,4096):t(gid,'No invite events. Staff can use /inviteevent start.','Keine Invite-Events. Das Team startet mit /inviteevent start.'));
      return locale.withProtectedValues(rows.map(r=>r.name),()=>i.editReply({embeds:[e],allowedMentions:{parse:[]}}));
    }
    if(sub==='leaderboard'){const r=find(gid,i.options.getString('event_id'));if(!r)throw Error(t(gid,'Invite event not found.','Invite-Event nicht gefunden.'));return locale.withProtectedValues([r.name],()=>i.editReply({embeds:[embed(gid,r,now())],allowedMentions:{parse:[]}}));}
    const actor=await manager(i);
    if(sub==='start'){
      const ms=duration(i.options.getString('duration')),name=i.options.getString('prize')?.trim(),role=i.options.getRole('role');
      if(!ms||!name||name.length>80)throw Error(t(gid,'Choose a prize and a duration from 1m to 30d, for example 1d.','Wähle einen Preis und eine Dauer von 1m bis 30d, etwa 1d.'));
      let r=state(gid).rewards.find(x=>isEvent(x)&&x.creationEventId===i.id);
      if(!r){if(state(gid).rewards.length>=25)throw Error(t(gid,'At most 25 rewards/events per server.','Höchstens 25 Belohnungen/Events pro Server.'));if(role)await safeRole(i.guild,role.id,actor);
        commit(gid,p=>{if(!Number.isSafeInteger(p.nextEventId)||p.nextEventId<1)p.nextEventId=1;r={id:'E'+p.nextEventId++,kind:'timed-event',name,roleId:role?.id||null,status:'active',progress:{},reachedAt:{},createdAt:now(),endAt:now()+ms,createdBy:i.user.id,creationEventId:i.id,channelId:i.channelId||i.channel.id};p.rewards.push(r);audit(p,{type:'event-start',rewardId:r.id,actorId:i.user.id});});
      }
      if(!r.startNoticeAttempted){commit(gid,()=>{r.startNoticeAttempted=true;});try{const msg=await locale.withProtectedValues([r.name],()=>i.channel.send({embeds:[embed(gid,r,now())],components:rows(gid,r),allowedMentions:{parse:[]}}));commit(gid,()=>{r.messageId=msg.id;});}catch(error){console.warn('Invite event post unavailable:',gid,r.id,error.code||error.message);}}
      return i.editReply({content:t(gid,`✅ Invite event **${r.id}**: most new invites by <t:${Math.floor(r.endAt/1000)}:F> wins **${r.name}**. Everyone starts at zero.`,`✅ Invite-Event **${r.id}**: Wer bis <t:${Math.floor(r.endAt/1000)}:F> die meisten neuen Invites hat, gewinnt **${r.name}**. Alle starten bei null.`),allowedMentions:{parse:[]}});
    }
    if(sub==='cancel'){
      const r=find(gid,i.options.getString('event_id'));if(!r)throw Error(t(gid,'Invite event not found.','Invite-Event nicht gefunden.'));if(r.status!=='active')throw Error(t(gid,'Only a running event can be cancelled. Saved results are retained.','Nur ein laufendes Event kann abgebrochen werden. Ergebnisse bleiben erhalten.'));
      commit(gid,p=>{r.status='cancelled';r.cancelledBy=i.user.id;r.cancelledAt=now();r.displayPending=true;audit(p,{type:'event-cancel',rewardId:r.id,actorId:i.user.id});});
      await refreshPost(i.guild,r);
      return i.editReply({content:t(gid,`✅ Invite event ${r.id} cancelled; no prize awarded.`,`✅ Invite-Event ${r.id} abgebrochen; kein Preis vergeben.`),allowedMentions:{parse:[]}});
    }
    throw Error('Unknown invite event command.');
  }
  return {handle,finish,announce,find,component};
}
module.exports={isEvent,duration,progress,leaders,advance,buildCommand,embed,createController};
