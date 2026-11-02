'use strict';
const {createHash}=require('node:crypto');
const {PermissionFlagsBits:P}=require('discord.js');
const runtime=require('./bot_runtime'),locale=require('./localization');
async function within(promise,ms=8000){let timer;try{return await Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Join check timed out'),{code:'JOIN_TIMEOUT'})),ms);})]);}finally{clearTimeout(timer);}}
async function resolveChannel(guild,data,purpose){
  // An explicit selection must never silently fall back to an old destination.
  const forced=data.setupOverrides?.[purpose],ids=forced?[forced]:runtime.bindingIds(data,purpose);
  if(!ids.length)return {status:'unconfigured'};
  for(const id of ids){
    let channel;
    try{channel=guild.channels.fetch?await within(guild.channels.fetch(id,{force:true})):guild.channels.cache.get(id);}
    catch(error){if(!forced&&Number(error.code)===10003)continue;return {status:'channel-unavailable'};}
    if(channel&&(channel.guildId||channel.guild?.id)===guild.id&&runtime.validBinding(channel,guild,purpose))return {status:'ready',channel};
    if(forced)return {status:'channel-unsuitable'};
  }
  return {status:'channel-missing'};
}
async function sendInviteLog({client,member,data,inviterId=null,count=0,reason='unknown'}={}){
  const guild=member.guild,result=await resolveChannel(guild,data,'invite-log');
  if(!result.channel)return result;
  const channel=result.channel;
  try{
    const me=await within(guild.members.fetchMe({force:true}));
    if(!me||client?.user?.id&&me.id!==client.user.id||!channel.permissionsFor?.(me)?.has([P.ViewChannel,P.SendMessages]))return {status:'missing-send-permissions'};
    const de=locale.languageFor(guild.id)==='de';
    let content=inviterId?(de?`📨 <@${member.id}> ist über die Einladung von <@${inviterId}> beigetreten. **${count} Invites**.`:`📨 <@${member.id}> joined using <@${inviterId}>'s invite. **${count} invites**.`):
      (de?`📨 <@${member.id}> ist beigetreten. **Einladender nicht ermittelbar** – keine Invite-Gutschrift.`:`📨 <@${member.id}> joined. **Inviter could not be determined** – no invite credit.`);
    if(!inviterId&&reason==='unavailable')content+=de?' Die Invite-Abfrage ist derzeit nicht verfügbar; prüfe „Server verwalten“.':' Invite tracking is currently unavailable; check Manage Server.';
    if(!inviterId&&reason==='baseline')content+=de?' Der Invite-Vergleich wurde gerade initialisiert.':' The invite baseline was just initialized.';
    if(!inviterId&&reason==='bot')content+=de?' Bot-Beitritte zählen nicht als Invite-Guthaben.':' Bot joins do not count toward invite balances.';
    const key=JSON.stringify(['pixel-invite-log',guild.id,member.id,member.joinedTimestamp||0]);
    const sent=await within(channel.send({content,allowedMentions:{parse:[]},nonce:createHash('sha256').update(key).digest('hex').slice(0,24),enforceNonce:true}));
    return {status:'sent',messageId:sent?.id};
  }catch{return {status:'send-unavailable'};}
}
module.exports={within,resolveChannel,sendInviteLog};
