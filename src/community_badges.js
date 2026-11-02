'use strict';
const {createHash}=require('node:crypto');
const {languageFor}=require('./localization');
// Reserve an award on disk before posting it. An uncertain send is never replayed.
function createBadgeAwards({getRecord,save,now=Date.now}={}){
  return async function awardBadge(guildId,userId,badge,channel=null){
    const c=getRecord(guildId,userId);
    if(!Array.isArray(c.badges)||typeof badge!=='string'||!badge||badge.length>80)return false;
    if(c.badgeAwards!==undefined&&(!c.badgeAwards||typeof c.badgeAwards!=='object'||Array.isArray(c.badgeAwards)))return false;
    const oldBadges=c.badges,oldAwards=c.badgeAwards;
    const known=Object.hasOwn(c.badgeAwards||{},badge),owned=c.badges.includes(badge);
    if(known&&owned)return false;
    const silent=known||owned||!channel||badge==='First Steps'&&c.messages>1;
    c.badges=owned?c.badges:[...c.badges,badge];
    c.badgeAwards={...c.badgeAwards,[badge]:known?c.badgeAwards[badge]:{at:now(),status:silent?'silent':'pending'}};
    try{save();}catch(error){c.badges=oldBadges;if(oldAwards===undefined)delete c.badgeAwards;else c.badgeAwards=oldAwards;throw error;}
    if(silent)return !owned;
    const record=c.badgeAwards[badge];
    const nonce=createHash('sha256').update(JSON.stringify(['pixel-badge',guildId,userId,badge])).digest('hex').slice(0,24);
    try{
      const content=languageFor(guildId)==='de'?`🏅 <@${userId}> hat das Badge **${badge}** freigeschaltet!`:`🏅 <@${userId}> unlocked the **${badge}** badge!`;
      const sent=await channel.send({content,allowedMentions:{parse:[]},nonce,enforceNonce:true});
      record.status='sent';if(sent?.id)record.messageId=sent.id;
    }catch{record.status='uncertain';}
    // The pending reservation still prevents duplicates if this second write fails.
    try{save();}catch{}
    return true;
  };
}
module.exports={createBadgeAwards};
