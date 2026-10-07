'use strict';
const {PermissionFlagsBits:P}=require('discord.js');
// Durable Speak-only leases. Existing moderator mutes and unrelated overwrites are untouched.
function createQuietLeases({client,db,saveDB}){
  const leases=()=>{db.mimic??={};return db.mimic.quietLeases??={};};
  async function restore(guildId,channelId){
    const entries=Object.entries(leases()).filter(([,x])=>(!guildId||x.guildId===guildId)&&(!channelId||x.channelId===channelId));
    for(const [key,entry] of entries){
      try{
        const guild=client.guilds.cache.get(entry.guildId);
        if(!guild)continue;
        let channel;try{channel=await guild.channels.fetch(entry.channelId,{force:true});}catch(error){if(error.code===10003){delete leases()[key];saveDB();continue;}throw error;}
        if(!channel){delete leases()[key];saveDB();continue;}
        const current=channel.permissionOverwrites.cache.get(entry.userId);
        if(current?.deny.has(P.Speak)&&!current.allow.has(P.Speak)){
          const other=(current.allow.bitfield|current.deny.bitfield)&~P.Speak;
          if(entry.absent&&other===0n)await channel.permissionOverwrites.delete(entry.userId,'Mimic: Sprechrecht wiederherstellen');
          else await channel.permissionOverwrites.edit(entry.userId,{Speak:entry.speak},{type:1,reason:'Mimic: Sprechrecht wiederherstellen'});
        }
        delete leases()[key];saveDB();
      }catch(error){console.warn('Mimic Sprechrecht-Wiederherstellung:',error?.code||error?.message);}
    }
    return Object.values(leases()).filter(x=>(!guildId||x.guildId===guildId)&&(!channelId||x.channelId===channelId)).length;
  }
  async function lock(channel,ids){
    if(await restore(channel.guild.id,channel.id))throw Error('Sprechrechte konnten nicht wiederhergestellt werden. Bitte /mimic diagnose verwenden.');
    try{
      for(const userId of ids){
        const current=channel.permissionOverwrites.cache.get(userId);
        if(current?.deny.has(P.Speak))continue;
        const key=`${channel.guild.id}:${channel.id}:${userId}`;
        leases()[key]={guildId:channel.guild.id,channelId:channel.id,userId,absent:!current,speak:current?.allow.has(P.Speak)?true:null};
        saveDB(); // journal BEFORE changing a permission
        await channel.permissionOverwrites.edit(userId,{Speak:false},{type:1,reason:'Mimic: Replay-Ruhe'});
      }
    }catch(error){await restore(channel.guild.id,channel.id);throw error;}
  }
  return {lock,restore};
}
module.exports={createQuietLeases};
