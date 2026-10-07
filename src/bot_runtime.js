'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CORE_ALIASES = {'invite-log':'inviteLog','support-logs':'supportLogs','ticket-transcripts':'ticketTranscripts'};
const COMMUNITY_KEYS = {welcome:'welcome','daily-quests':'quests','coin-shop':'coinShop','choose-roles':'roles',suggestions:'suggestions','best-moments':'starboard','clip-of-the-week':'clips',birthdays:'birthdays','community-fragen':'communityQuestion','fortnite-news':'news','item-shop':'itemShop',events:'events','squad-hub':'squads'};
const STAFF_KEYS = {'staff-audit':'audit','ai-staff-alerts':'alerts','mod-cases':'cases','staff-briefing':'briefing','staff-tasks':'tasks'};
const PRIVATE_PURPOSES = new Set(['support-logs','ticket-transcripts',...Object.keys(STAFF_KEYS)]);
const PURPOSES = ['announcements','invite-log','counting','teamsearch','support','support-logs','ticket-transcripts',...Object.keys(COMMUNITY_KEYS),...Object.keys(STAFF_KEYS)];
const VIEW_CHANNEL = 1024n;
const record = v => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function dataDirectory(sourceDir, env = process.env) {
  return path.resolve(env.BOT_DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || path.join(sourceDir,'..','data'));
}
function migrateDataDirectory(sourceDir, destination) {
  const legacy=path.resolve(sourceDir,'..','data');
  if(legacy===path.resolve(destination)) return;
  fs.mkdirSync(destination,{recursive:true});
  const existingPrimary=fs.existsSync(path.join(destination,'db.json'));
  // Never replace an existing volume file or mix its database with a legacy backup.
  for(const name of ['db.json','db.json.bak','youtube_uploads.json','spotify_auth.json','spotify_track_cache.json']) {
    if(name==='db.json.bak' && existingPrimary)continue;
    const old=path.join(legacy,name), next=path.join(destination,name);
    try {fs.copyFileSync(old,next,fs.constants.COPYFILE_EXCL);fs.chmodSync(next,0o600);}
    catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw error;}
  }
}
function validateDatabase(value) {
  if(!record(value)) throw new Error('DB_INVALID');
  for(const key of ['guilds','users','giveaways','teams','tickets','staff']) {
    if(value[key]!==undefined && !record(value[key]))throw new Error('DB_INVALID');
  }
  return value;
}
function atomicWrite(file,text) {
  const temp=file+'.tmp';
  const fd=fs.openSync(temp,'w',0o600);
  try {fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(temp,file);
  fs.chmodSync(file,0o600);
}
function createDatabaseStore(file, logger = console) {
  const seed=()=>({guilds:{},users:{},giveaways:{},teams:{},tickets:{},maintenance:false});
  function read(filePath) {return validateDatabase(JSON.parse(fs.readFileSync(filePath,'utf8')));}
  function load() {
    let primaryError;
    try {return read(file);} catch(error){primaryError=error;}
    if(primaryError.code && primaryError.code!=='ENOENT')throw primaryError;
    for(const candidate of [file+'.tmp',file+'.bak']) {
      try {
        const recovered=read(candidate);
        if(primaryError.code!=='ENOENT')fs.copyFileSync(file,file+'.corrupt-'+Date.now(),fs.constants.COPYFILE_EXCL);
        fs.mkdirSync(path.dirname(file),{recursive:true});
        atomicWrite(file,JSON.stringify(recovered,null,2));
        logger.warn('Bot database restored from a valid recovery snapshot.');
        return recovered;
      } catch(error) {
        if(error.code && error.code!=='ENOENT')throw error;
        if(!(error instanceof SyntaxError) && error.message!=='DB_INVALID' && error.code!=='ENOENT')throw error;
      }
    }
    if(primaryError.code==='ENOENT' && !fs.existsSync(file+'.tmp') && !fs.existsSync(file+'.bak'))return seed();
    const error=new Error('Die Bot-Daten konnten nicht gelesen werden. db.json und Sicherung prüfen; vorhandene Daten wurden nicht zurückgesetzt.');
    error.code='DB_RECOVERY_REQUIRED';throw error;
  }
  function save(value) {
    validateDatabase(value);
    const text=JSON.stringify(value,null,2);
    // Round-trip validation before touching the current file.
    validateDatabase(JSON.parse(text));
    fs.mkdirSync(path.dirname(file),{recursive:true});
    let previous;
    try {previous=JSON.stringify(read(file),null,2);} catch(error) {
      if(error.code!=='ENOENT')throw error;
    }
    atomicWrite(file+'.bak',previous || text);
    atomicWrite(file,text);
  }
  return {load,save,file};
}

function bindingIds(gd,purpose,staffChannels={}) {
  const designed=[];
  for(const cat of gd.serverDesign?.plan?.categories || [])for(const ch of cat.channels || []) {
    if(ch.purpose===purpose) designed.push(gd.serverDesign?.channels?.[ch.key]);
  }
  return [...new Set([
    gd.setupOverrides?.[purpose],gd.channels?.[purpose],gd.channels?.[CORE_ALIASES[purpose]],
    gd.serverDesign?.channels?.[purpose],...designed,gd.serverStructure?.channels?.[purpose],
    gd.community?.channels?.[COMMUNITY_KEYS[purpose]],staffChannels[STAFF_KEYS[purpose]]
  ].filter(Boolean))];
}
function isPrivate(channel,guild) {
  try {const p=channel.permissionsFor?.(guild.roles.everyone);return Boolean(p && !p.has(VIEW_CHANNEL));}catch{return false;}
}
function validBinding(channel,guild,purpose) {
  return Boolean(channel && [0,5].includes(channel.type) && !String(channel.topic || '').startsWith('ticket-owner:') &&
    (!PRIVATE_PURPOSES.has(purpose) || isPrivate(channel,guild)));
}
function restoreBindings(guild,gd,staffChannels={}) {
  let changed=false;
  const set=(target,key,value)=>{if(key && target[key]!==value){target[key]=value;changed=true;}};
  gd.channels ||= {};
  for(const purpose of PURPOSES) {
    const channel=bindingIds(gd,purpose,staffChannels).map(id=>guild.channels.cache.get(id)).find(ch=>validBinding(ch,guild,purpose));
    if(!channel)continue; // A cache or permission miss is not proof that the mapping was deleted.
    set(gd.channels,purpose,channel.id);
    set(gd.channels,CORE_ALIASES[purpose],channel.id);
    if(COMMUNITY_KEYS[purpose]){gd.community ||= {};gd.community.channels ||= {};set(gd.community.channels,COMMUNITY_KEYS[purpose],channel.id);}
    if(STAFF_KEYS[purpose])set(staffChannels,STAFF_KEYS[purpose],channel.id);
  }
  return changed;
}
function systemChannelIds(gd,staffChannels={}) {
  return new Set([...Object.values(gd.channels || {}),...Object.values(gd.setupOverrides || {}),
    ...Object.values(gd.community?.channels || {}),...Object.values(staffChannels),
    ...Object.values(gd.serverDesign?.channels || {}),...Object.values(gd.serverStructure?.channels || {})].filter(x=>typeof x==='string'));
}
function quarantineSystemTickets(gd,staffChannels,tickets) {
  let changed=false;
  for(const id of systemChannelIds(gd,staffChannels)) {
    const ticket=tickets[id];
    if(!ticket?.external || ticket.ignoredAsSystemChannel)continue;
    ticket.ignoredAsSystemChannel=true;ticket.aiEnabled=false;ticket.previousInteractionId=null;changed=true;
  }
  return changed;
}
function retainSetupAssignments(guild,gd,staffChannels,setup) {
  restoreBindings(guild,gd,staffChannels);
  const selected=[],usedChannels=new Set(),usedPurposes=new Set();
  const add=item=>{
    if(!PURPOSES.includes(item.canonical) || usedPurposes.has(item.canonical) || usedChannels.has(item.channelId))return;
    if(!validBinding(guild.channels.cache.get(item.channelId),guild,item.canonical))return;
    selected.push(item);usedPurposes.add(item.canonical);usedChannels.add(item.channelId);
  };
  for(const item of setup.selected || [])add(item);
  for(const canonical of PURPOSES)for(const channelId of bindingIds(gd,canonical,staffChannels)) {
    if(usedPurposes.has(canonical))break;
    add({canonical,channelId,source:'Saved',score:999});
  }
  setup.selected=selected;setup.reused=selected.length;
  return selected;
}

function advanceCounting(message,gd,save) {
  if(message.author?.bot || gd.channels?.counting!==message.channel?.id || message.mentions?.everyone || /@(?:everyone|here)\b/i.test(String(message.content || '')))return null;
  const old=gd.counting;
  const count={...(record(old)?old:{})};
  if(count.channelId && count.channelId!==message.channel.id){count.current=0;count.lastUserId=null;delete count.lastMessageId;}
  count.channelId=message.channel.id;
  if(!Number.isSafeInteger(count.current) || count.current<0)count.current=0;
  const msgId=String(message.id || '');
  if(msgId && count.lastMessageId && /^\d+$/.test(msgId) && /^\d+$/.test(count.lastMessageId) && BigInt(msgId)<=BigInt(count.lastMessageId))return {duplicate:true};
  if(msgId && msgId===count.lastMessageId)return {duplicate:true};
  const raw=String(message.content || '').trim(),number=/^[0-9]+$/.test(raw)?Number(raw):NaN;
  const valid=Number.isSafeInteger(number) && number===count.current+1 && count.lastUserId!==message.author.id;
  count.current=valid?number:0;count.lastUserId=valid?message.author.id:null;
  if(msgId)count.lastMessageId=msgId;
  gd.counting=count;
  try {save();}catch(error){gd.counting=old;throw error;}
  return {valid,current:count.current};
}

module.exports={dataDirectory,migrateDataDirectory,createDatabaseStore,bindingIds,restoreBindings,systemChannelIds,quarantineSystemTickets,retainSetupAssignments,advanceCounting,validBinding,PRIVATE_PURPOSES};
