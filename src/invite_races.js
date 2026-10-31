'use strict';
const events=require('./invite_events');

const MAX_PROGRESS=1000000;
function progress(race,userId){const value=race.progress?.[userId];return Number.isSafeInteger(value)?Math.max(0,Math.min(MAX_PROGRESS,value)):0;}
function isRace(reward){return reward?.kind==='race';}
function migrate(program){
  if(!program.rewardHistory||typeof program.rewardHistory!=='object')program.rewardHistory={};
  for(const reward of program.rewards){
    // Old threshold rewards have no reliable first-finisher history. Keep their
    // data and pending claims without inventing a race winner retroactively.
    if(!reward.kind){reward.kind='legacy';reward.status='paused';}
    if(isRace(reward)&&(!reward.progress||typeof reward.progress!=='object'))reward.progress={};
  }
}
function advance(program,userId,amount,{ids=null,eventId='',now=Date.now(),occurredAt=now}={}){
  const credited=events.advance(program,userId,amount,{ids,now,occurredAt});
  for(const race of program.rewards){
    if(!isRace(race)||race.status!=='active'||(ids&&!ids.includes(race.id))||(amount>0&&occurredAt<race.createdAt))continue;
    const previous=progress(race,userId),next=Math.max(0,Math.min(MAX_PROGRESS,previous+amount));
    if(next===previous)continue;
    race.progress[userId]=next;credited.push(race.id);
    if(amount>0&&next>=race.requiredInvites){
      race.status='won';race.winnerId=userId;race.wonAt=now;race.winningEventId=eventId;
      program.claims[userId]||={};
      program.claims[userId][race.id]={status:race.roleId?'granting':'requested',name:race.name,roleId:race.roleId||null,requestedAt:now,raceWinner:true};
    }
  }
  return credited;
}
function leaders(race,limit=10){return Object.keys(race.progress||{}).map(userId=>({userId,invites:progress(race,userId)})).filter(row=>row.invites>0).sort((a,b)=>b.invites-a.invites||a.userId.localeCompare(b.userId)).slice(0,limit);}
module.exports={progress,isRace,migrate,advance,leaders,MAX_PROGRESS};
