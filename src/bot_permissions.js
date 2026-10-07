'use strict';
const {PermissionFlagsBits:P}=require('discord.js');
const isGuildRequest=i=>Boolean(i?.guild?.id&&i?.user?.id);
async function requireBotChannels(guild){
  if(!guild?.id)throw Error('Nutze diesen Befehl auf einem Server.');
  const me=guild.members.fetchMe?await guild.members.fetchMe({force:true}):guild.members.me;
  if(!me?.permissions?.has(P.ManageChannels))throw Error('Pixel braucht „Kanäle verwalten“. Deine eigenen Verwaltungsrechte sind dafür nicht nötig.');
  return me;
}
function createMenuOwner(i){
  const encoded=String(i.customId||'').split(':')[1];
  return encoded||i.message?.interactionMetadata?.user?.id||i.message?.interaction?.user?.id||null;
}
module.exports={isGuildRequest,requireBotChannels,createMenuOwner};
