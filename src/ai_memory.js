'use strict';
const {trimConversation}=require('./ai_quality');
const TTL=2*60*60*1000;
function createMemory({getRecord,save,now=Date.now,logger=console}={}){
  function channels(record){
    const rows=record?.aiConversations;
    if(!rows||typeof rows!=='object'||Array.isArray(rows))return {};
    return Object.fromEntries(Object.entries(rows).filter(([id,v])=>/^[\w-]{1,100}$/.test(id)&&v&&Number.isFinite(v.updatedAt)&&now()-v.updatedAt<TTL&&v.updatedAt<=now()+60000)
      .sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,3));
  }
  function read(guildId,userId,channelId){
    if(!guildId||!userId||!channelId)return [];
    const value=channels(getRecord(guildId,userId,false))[channelId];
    return value&&Array.isArray(value.messages)?trimConversation(value.messages):[];
  }
  function write(guildId,userId,channelId,messages){
    if(!guildId||!userId||!channelId)return;
    const record=getRecord(guildId,userId,true);
    if(!record)return;
    const previous=record.aiConversations;
    const rows=channels(record);rows[channelId]={updatedAt:now(),messages:trimConversation(messages)};
    record.aiConversations=channels({aiConversations:rows});
    try{save();}catch(error){if(previous===undefined)delete record.aiConversations;else record.aiConversations=previous;logger.warn?.('[AI memory] Speichern fehlgeschlagen.');}
  }
  function clear(guildId,userId,channelId){
    const record=getRecord(guildId,userId,false);if(!record?.aiConversations)return;
    const previous=record.aiConversations;record.aiConversations={...previous};delete record.aiConversations[channelId];
    try{save();}catch(error){record.aiConversations=previous;throw error;}
  }
  return {read,write,clear};
}
module.exports={createMemory,TTL};
