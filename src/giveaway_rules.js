'use strict';
const {randomUUID,randomInt}=require('node:crypto');
const {ActionRowBuilder,RoleSelectMenuBuilder,UserSelectMenuBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,PermissionFlagsBits}=require('discord.js');
const l10n=require('./localization');
const MAX_INVITES=1000000;
function text(guildId,en,de){return l10n.languageFor(guildId)==='de'?de:en;}
function rules(g){const r=g?.rules||{};return {bonusRoleIds:[...new Set(Array.isArray(r.bonusRoleIds)?r.bonusRoleIds:[])].slice(0,25),excludedRoleIds:[...new Set(Array.isArray(r.excludedRoleIds)?r.excludedRoleIds:[])].slice(0,25),minInvites:Number.isSafeInteger(r.minInvites)&&r.minInvites>=0?Math.min(MAX_INVITES,r.minInvites):0};}
function eligibility(g,member,inviteCount=0){
  const r=rules(g),has=id=>id===member?.guild?.id||Boolean(member?.roles?.cache?.has(id));
  if(!member||member.user?.bot)return {ok:false,reason:'member',weight:0};
  if(r.excludedRoleIds.some(has))return {ok:false,reason:'role',weight:0};
  if(inviteCount<r.minInvites)return {ok:false,reason:'invites',weight:0,required:r.minInvites,current:inviteCount};
  return {ok:true,weight:r.bonusRoleIds.some(has)?2:1};
}
function weightedDraw(pool,count,random=randomInt){
  const unique=new Map();for(const row of pool||[])if(row?.id)unique.set(row.id,{id:row.id,weight:row.weight===2?2:1});
  const remaining=[...unique.values()],winners=[];
  while(remaining.length&&winners.length<count){let n=random(remaining.reduce((sum,row)=>sum+row.weight,0)),index=0;for(;index<remaining.length-1;index++){n-=remaining[index].weight;if(n<0)break;}winners.push(remaining.splice(index,1)[0].id);}
  return winners;
}
function describe(g,guildId){const r=rules(g),roles=ids=>ids.length?ids.map(id=>`<@&${id}>`).join(', '):text(guildId,'None','Keine');return [
  text(guildId,`**Double tickets:** ${roles(r.bonusRoleIds)}`,`**Doppelte Lose:** ${roles(r.bonusRoleIds)}`),
  text(guildId,`**Excluded roles:** ${roles(r.excludedRoleIds)}`,`**Ausgeschlossene Rollen:** ${roles(r.excludedRoleIds)}`),
  text(guildId,`**Required invites:** ${r.minInvites}`,`**Benötigte Invites:** ${r.minInvites}`),
  text(guildId,'Bonus roles do not stack. Rules are checked when joining and drawing.','Bonusrollen sind nicht stapelbar. Regeln werden beim Beitritt und bei der Ziehung geprüft.')
].join('\n');}
function createGiveawayRules({saveDB,getInviteCount=()=>0,publish,notifyClaim=async()=>{},syncDisplay=async()=>{},OWNER_ID,now=Date.now}={}){
  const drafts=new Map(),entering=new Set(),drawLocks=new Set();
  const owner=i=>Boolean(OWNER_ID)&&i.user?.id===OWNER_ID;
  function fixedIds(g){return g.fixedByOwnerId===OWNER_ID&&OWNER_ID?[...new Set(Array.isArray(g.fixedWinnerIds)?g.fixedWinnerIds:[])].slice(0,Math.min(10,g.winnerCount||1)):[];}
  function selectionDescription(g,gid){const ids=fixedIds(g);return ids.length?text(gid,`Preselected by the bot owner: ${ids.map(id=>`<@${id}>`).join(', ')}. They must enter and meet the rules at the draw. Invalid selections and remaining places use the regular draw.`,`Vom Bot-Owner vorausgewählt: ${ids.map(id=>`<@${id}>`).join(', ')}. Sie müssen teilnehmen und bei der Ziehung die Regeln erfüllen. Ungültige Auswahlen und übrige Plätze werden regulär gezogen.`):'';}
  async function selectionData(i,d){
    const ids=[...new Set(Array.isArray(d.fixedWinnerIds)?d.fixedWinnerIds:[])];
    if(!ids.length)return {};
    if(!owner(i)||d.ownerId!==i.user.id||d.fixedByOwnerId!==OWNER_ID)throw Error(text(i.guild.id,'Only the configured bot owner can preselect giveaway winners.','Nur der konfigurierte Bot-Owner darf Giveaway-Gewinner vorauswählen.'));
    if(ids.length>Math.min(10,d.winnerCount||1)||ids.some(id=>typeof id!=='string'||!/^\d{16,22}$/.test(id)))throw Error('Invalid preselected winners.');
    for(const id of ids){const m=await i.guild.members.fetch({user:id,force:true});if(m.user.bot)throw Error(text(i.guild.id,'Select human server members only.','Wähle nur menschliche Servermitglieder.'));}
    return {fixedWinnerIds:ids,fixedByOwnerId:OWNER_ID,fixedSelectedAt:now()};
  }
  function choose(g,pool,count){
    const eligible=new Set(pool.map(row=>row.id)),fixed=fixedIds(g).filter(id=>eligible.has(id)).slice(0,count);
    return [...fixed,...weightedDraw(pool.filter(row=>!fixed.includes(row.id)),Math.max(0,count-fixed.length))];
  }
  const say=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  async function manager(i){const member=await i.guild.members.fetch({user:i.user.id,force:true});return i.user.id===OWNER_ID||i.user.id===i.guild.ownerId||member.permissions.has(PermissionFlagsBits.ManageGuild);}
  function clean(){for(const [id,d]of drafts)if(d.expiresAt<now()&&!d.busy)drafts.delete(id);}
  function panel(d){const g=d.guildId;const roleRow=(kind,ids,en,de)=>new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`pxgive:${kind}:${d.id}`).setPlaceholder(text(g,en,de)).setMinValues(0).setMaxValues(25).setDefaultRoles(...ids));return {
    content:text(g,'Configure the rules, then publish the giveaway.','Wähle die Regeln und veröffentliche danach das Giveaway.'),
    embeds:[new EmbedBuilder().setTitle(text(g,'🎉 Giveaway preview','🎉 Giveaway-Vorschau')).setDescription(`**${d.prize}**\n${text(g,`Winners: ${d.winnerCount} · Duration: ${Math.round(d.duration/1000)}s · Claim time: ${d.claimInput}`,`Gewinner: ${d.winnerCount} · Dauer: ${Math.round(d.duration/1000)}s · Claim-Zeit: ${d.claimInput}`)}\n\n${describe(d,g)}${fixedIds(d).length?'\n\n'+selectionDescription(d,g):''}`)],
    components:[roleRow('bonus',d.rules.bonusRoleIds,'Roles with two tickets','Rollen mit zwei Losen'),roleRow('exclude',d.rules.excludedRoleIds,'Roles that cannot enter','Rollen ohne Teilnahme'),...(d.ownerId===OWNER_ID&&OWNER_ID?[new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`pxgive:winners:${d.id}`).setPlaceholder(text(g,'Owner only: preselect winners (optional)','Nur Bot-Owner: Gewinner vorauswählen')).setMinValues(0).setMaxValues(Math.min(10,d.winnerCount||1)).setDefaultUsers(...fixedIds(d)))]:[]),new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pxgive:invites:${d.id}`).setLabel(text(g,'Set required invites','Invite-Minimum setzen')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`pxgive:publish:${d.id}`).setLabel(text(g,'Publish giveaway','Giveaway veröffentlichen')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pxgive:cancel:${d.id}`).setLabel(text(g,'Cancel','Abbrechen')).setStyle(ButtonStyle.Danger))],allowedMentions:{parse:[]}};}
  async function begin(i,data){
    if(!i.guild)return say(i,'Use this command in a server.');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(!await manager(i))return i.editReply({content:text(i.guild.id,'Manage Server is required.','Du brauchst Server verwalten.')});
    clean();if(drafts.size>=200)throw Error('Too many open giveaway previews. Try again later.');
    const d={...data,id:randomUUID(),guildId:i.guild.id,channelId:i.channelId||i.channel.id,ownerId:i.user.id,expiresAt:now()+15*60000,rules:rules(data)};
    if(Array.isArray(data.fixedWinnerIds)&&data.fixedWinnerIds.length&&!owner(i))throw Error(text(i.guild.id,'Only the configured bot owner can preselect giveaway winners.','Nur der konfigurierte Bot-Owner darf Giveaway-Gewinner vorauswählen.'));
    d.fixedWinnerIds=[];delete d.fixedByOwnerId;
    drafts.set(d.id,d);return l10n.withProtectedValues([d.prize],()=>i.editReply(panel(d)));
  }
  async function handleInteraction(i){
    if(!String(i.customId||'').startsWith('pxgive:'))return false;
    const [,action,id]=i.customId.split(':'),d=drafts.get(id),g=i.guild?.id;
    if(!d||d.expiresAt<now()){await say(i,text(g,'This preview expired. Start /giveaway again.','Diese Vorschau ist abgelaufen. Starte /giveaway erneut.'));return true;}
    if(d.guildId!==g||d.channelId!==(i.channelId||i.channel?.id)||d.ownerId!==i.user.id){await say(i,text(g,'This preview belongs to another user or channel.','Diese Vorschau gehört zu einem anderen Nutzer oder Kanal.'));return true;}
    if(d.busy){await say(i,text(g,'This preview is being updated.','Diese Vorschau wird gerade aktualisiert.'));return true;}
    if(action==='invites'){
      const input=new TextInputBuilder().setCustomId('minimum').setLabel(text(g,'Minimum invites (0 = none)','Mindestanzahl Invites (0 = keine)')).setStyle(TextInputStyle.Short).setValue(String(d.rules.minInvites)).setRequired(true).setMaxLength(7);
      await i.showModal(new ModalBuilder().setCustomId(`pxgive:minimum:${id}`).setTitle(text(g,'Giveaway invite requirement','Giveaway-Invite-Minimum')).addComponents(new ActionRowBuilder().addComponents(input)));return true;
    }
    d.busy=true;
    try{
      await i.deferUpdate();
      if(!await manager(i))throw Error(text(g,'Manage Server is required.','Du brauchst Server verwalten.'));
      if(action==='cancel'){drafts.delete(id);await i.editReply({content:text(g,'Giveaway cancelled.','Giveaway abgebrochen.'),embeds:[],components:[]});return true;}
      if(action==='minimum'){
        const value=i.fields.getTextInputValue('minimum').trim();
        if(!/^\d{1,7}$/.test(value)||Number(value)>MAX_INVITES)throw Error(text(g,'Enter a whole number from 0 to 1000000.','Gib eine ganze Zahl zwischen 0 und 1000000 ein.'));
        d.rules.minInvites=Number(value);
      }else if(action==='winners'){
        if(!owner(i))throw Error(text(g,'Only the configured bot owner can preselect giveaway winners.','Nur der konfigurierte Bot-Owner darf Giveaway-Gewinner vorauswählen.'));
        const candidate={...d,fixedWinnerIds:i.values||[],fixedByOwnerId:OWNER_ID};
        if(candidate.fixedWinnerIds.length)await selectionData(i,candidate);
        d.fixedWinnerIds=[...new Set(candidate.fixedWinnerIds)];d.fixedByOwnerId=OWNER_ID;
      }else if(['bonus','exclude'].includes(action)){
        const ids=[...new Set(i.values||[])];if(ids.length>25)throw Error('Select at most 25 roles.');
        const roles=await i.guild.roles.fetch();if(ids.some(role=>!roles.has(role)))throw Error(text(g,'A selected role no longer exists.','Eine ausgewählte Rolle existiert nicht mehr.'));
        d.rules[action==='bonus'?'bonusRoleIds':'excludedRoleIds']=ids;
      }else if(action==='publish'){
        await selectionData(i,d);
        const roles=await i.guild.roles.fetch();if([...d.rules.bonusRoleIds,...d.rules.excludedRoleIds].some(role=>!roles.has(role)))throw Error(text(g,'A selected role no longer exists. Update the role selection.','Eine ausgewählte Rolle existiert nicht mehr. Passe die Auswahl an.'));
        await publish(i,d);drafts.delete(id);await i.editReply({content:text(g,'✅ Giveaway published.','✅ Giveaway veröffentlicht.'),embeds:[],components:[]});return true;
      }else throw Error('Unknown giveaway action.');
      await l10n.withProtectedValues([d.prize],()=>i.editReply(panel(d)));return true;
    }catch(error){await i.followUp({content:'❌ '+error.message,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;}
    finally{d.busy=false;}
  }
  async function enter(i,g){
    const guildId=i.guild?.id;
    if(!g||g.guildId!==guildId||g.channelId!==(i.channelId||i.channel?.id)||g.ended||g.endAt<=now())return say(i,text(guildId,'The giveaway has ended.','Das Giveaway ist beendet.'));
    if(g.entries?.includes(i.user.id))return say(i,text(guildId,'You are already entered. Repeated clicks do not add tickets; eligibility is checked again at the draw.','Du nimmst bereits teil. Erneutes Klicken fügt keine Lose hinzu; die Regeln werden bei der Ziehung erneut geprüft.'));
    const key=guildId+':'+g.messageId+':'+i.user.id;
    if(entering.has(key))return say(i,text(guildId,'Your entry is being checked.','Deine Teilnahme wird gerade geprüft.'));
    entering.add(key);
    try {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const member=await i.guild.members.fetch({user:i.user.id,force:true});
    const result=eligibility(g,member,getInviteCount(guildId,i.user.id));
    if(!result.ok){const reason=result.reason==='role'?text(guildId,'One of your roles is excluded from this giveaway.','Eine deiner Rollen ist von diesem Giveaway ausgeschlossen.'):result.reason==='invites'?text(guildId,`You need **${result.required} invites**; you currently have **${result.current}**.`,`Du brauchst **${result.required} Invites**; du hast aktuell **${result.current}**.`):text(guildId,'Only server members can enter.','Nur Servermitglieder können teilnehmen.');return i.editReply({content:'❌ '+reason});}
    // Fetching fresh roles may have crossed the deadline or a draw.
    if(g.ended||g.endAt<=now())return i.editReply({content:text(guildId,'The giveaway has ended.','Das Giveaway ist beendet.')});
    const previous=g.entries;g.entries=[...new Set([...(Array.isArray(previous)?previous:[]),i.user.id])];
    try{saveDB();}catch(error){g.entries=previous;throw error;}
    return i.editReply({content:text(guildId,`🎉 You are entered with **${result.weight} ticket(s)**. Repeated clicks do not add tickets.`,`🎉 Du nimmst mit **${result.weight} Los(en)** teil. Erneutes Klicken fügt keine Lose hinzu.`),allowedMentions:{parse:[]}});
    } finally { entering.delete(key); }
  }
  async function pool(g,guild,excluded=[]){
    const skip=new Set(excluded),ids=[...new Set(Array.isArray(g.entries)?g.entries:[])].filter(id=>!skip.has(id));
    // Old giveaways retain their original one-ticket pool.
    if(!g.rules)return ids.map(id=>({id,weight:1}));
    const out=[];let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];let member;try{member=await guild.members.fetch({user:id,force:true});}catch(error){if(Number(error.code)===10007)continue;throw error;}const result=eligibility(g,member,getInviteCount(g.guildId,id));if(result.ok)out.push({id,weight:result.weight});}}));
    return out;
  }
  async function claim(i,g){
    const gid=i.guild?.id;
    if(!g||!gid||g.guildId!==gid||g.channelId!==(i.channelId||i.channel?.id)||g.messageId!==i.message?.id||!g.ended)return say(i,text(gid,'This giveaway claim button is unavailable or belongs to another message.','Dieser Claim-Button ist nicht verfügbar oder gehört zu einer anderen Nachricht.'));
    if(drawLocks.has(g.messageId))return say(i,text(gid,'This giveaway is being processed. Please try again shortly.','Dieses Giveaway wird gerade bearbeitet. Versuche es gleich erneut.'));
    drawLocks.add(g.messageId);
    try{
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const member=await i.guild.members.fetch({user:i.user.id,force:true});
      if(member.user.bot||!g.winners?.includes(i.user.id))return i.editReply({content:text(gid,'Only a current winner can claim this prize.','Nur ein aktueller Gewinner kann diesen Preis claimen.')});
      if(g.claimedBy?.includes(i.user.id))return i.editReply({content:text(gid,'You have already claimed this prize.','Du hast diesen Preis bereits geclaimt.')});
      if(g.claimDeadlineAt&&now()>=g.claimDeadlineAt)return i.editReply({content:text(gid,'Your claim time has expired. The next giveaway check will process the reroll.','Deine Claim-Zeit ist abgelaufen. Die nächste Giveaway-Prüfung bearbeitet den Reroll.')});
      const previous=structuredClone(g);
      g.claimedBy=[...new Set([...(Array.isArray(g.claimedBy)?g.claimedBy:[]),i.user.id])];g.displayPending=true;g.displayTitle='🏆 GIVEAWAY BEENDET';
      try{saveDB();}catch(error){for(const key of Object.keys(g))delete g[key];Object.assign(g,previous);console.warn('Giveaway claim save failed:',gid,g.messageId,error.code||error.message);return i.editReply({content:text(gid,'Your claim could not be saved. Please try again.','Dein Claim konnte nicht gespeichert werden. Bitte versuche es erneut.')});}
      await i.editReply({content:text(gid,'✅ Your prize claim is saved. Staff will handle prize delivery.','✅ Dein Gewinn-Claim ist gespeichert. Das Team übernimmt die Preisauslieferung.'),allowedMentions:{parse:[]}}).catch(()=>{});
      const results=await Promise.allSettled([Promise.resolve().then(()=>syncDisplay(g)),Promise.resolve().then(()=>notifyClaim(i,g))]);
      for(const result of results)if(result.status==='rejected')console.warn('Giveaway claim follow-up unavailable:',gid,g.messageId,result.reason?.code||result.reason?.message);
    }catch(error){console.warn('Giveaway claim check failed:',gid,g.messageId,error.code||error.message);if(i.deferred)await i.editReply({content:text(gid,'The claim could not be checked. Please try again.','Der Claim konnte nicht geprüft werden. Versuche es erneut.')});else throw error;}
    finally{drawLocks.delete(g.messageId);}
  }
  return {begin,handleInteraction,enter,claim,pool,draw:weightedDraw,choose,fixedIds,selectionData,selectionDescription,describe,drafts,drawLocks};
}
module.exports={createGiveawayRules,rules,eligibility,weightedDraw,describe,MAX_INVITES};
