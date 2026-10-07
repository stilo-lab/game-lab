'use strict';

const {createHash,randomBytes} = require('node:crypto');
const {ChannelType,PermissionsBitField} = require('discord.js');
const P = PermissionsBitField.Flags;
const CONFIRMATION = 'ALTE KANÄLE LÖSCHEN';
const REFERENCES = {rulesChannel:'rulesChannelId',publicUpdatesChannel:'publicUpdatesChannelId',safetyAlertsChannel:'safetyAlertsChannelId',systemChannel:'systemChannelId',afkChannel:'afkChannelId'};
const clone = value => JSON.parse(JSON.stringify(value));
function channelSnapshot(ch) {
  return {id:ch.id,name:ch.name,type:ch.type,parentId:ch.parentId || null,topic:ch.topic || '',
    position:ch.rawPosition ?? ch.position ?? 0,nsfw:Boolean(ch.nsfw),rateLimitPerUser:ch.rateLimitPerUser || 0,
    bitrate:ch.bitrate || null,userLimit:ch.userLimit || 0,rtcRegion:ch.rtcRegion || null,
    overwrites:[...(ch.permissionOverwrites?.cache?.values() || [])].map(o => ({id:o.id,type:o.type ?? 0,allow:String(o.allow?.bitfield ?? 0),deny:String(o.deny?.bitfield ?? 0)})).sort((a,b) => a.id.localeCompare(b.id))};
}
function channelIdentity(ch) {const value=channelSnapshot(ch);delete value.position;return value;}
function guildReferences(guild) {return Object.fromEntries(Object.values(REFERENCES).map(key => [key,guild[key] || null]));}
function captureOldChannels(guild) {return [...guild.channels.cache.values()].filter(ch => ch && !ch.isThread?.()).map(channelSnapshot).sort((a,b) => a.id.localeCompare(b.id));}
function pendingReset(gd) {const state=gd.serverDesign?.reset;return state && !['complete','abandoned'].includes(state.status) ? state : null;}
function backupPayload(guild,channels,gd,staffChannels={}) {
  return {format:'pixel-server-structure-v1',guildId:guild.id,capturedAt:new Date().toISOString(),
    notice:'Struktursicherung: keine Nachrichten, Thread-Inhalte, Dateien oder Webhooks. Gelöschte Nachrichten lassen sich damit nicht wiederherstellen.',
    guildReferences:guildReferences(guild),channels:clone(channels),bindings:clone({channels:gd.channels || {},setupOverrides:gd.setupOverrides || {},community:gd.community?.channels || {},staff:staffChannels,serverStructure:gd.serverStructure?.channels || {},serverDesign:{categories:gd.serverDesign?.categories || {},channels:gd.serverDesign?.channels || {}}})};
}
function startReset(guild,gd,session,staffChannels,save) {
  const existing=pendingReset(gd);
  if (existing) return existing;
  const backup=backupPayload(guild,session.operations.deletions,gd,staffChannels);
  const state={id:randomBytes(8).toString('hex'),ownerId:session.ownerId,status:'building',createdAt:Date.now(),plan:clone(session.plan),style:session.style || 'custom',backup,
    oldChannels:clone(session.operations.deletions),replacements:{categories:{},channels:{}},deleted:[],failed:[]};
  gd.serverDesign ||= {categories:{},channels:{}};gd.serverDesign.reset=state;
  save(); // A durable record must exist before any channel is created/deleted.
  return state;
}
function removeDeletedBindings(gd,staff,deleted) {
  const ids=new Set(deleted);
  for (const map of [gd.channels,gd.setupOverrides,gd.community?.channels,staff,gd.serverStructure?.channels,gd.serverDesign?.categories,gd.serverDesign?.channels]) {
    if (!map) continue;
    for (const [key,value] of Object.entries(map)) if (ids.has(value)) delete map[key];
  }
  if (gd.suggestionChannelIds) gd.suggestionChannelIds=gd.suggestionChannelIds.filter(id => !ids.has(id));
}
function assertOldChannelsUnchanged(guild,state) {
  const deleted=new Set(state.deleted), replacements=new Set([...Object.values(state.replacements.categories),...Object.values(state.replacements.channels)]);
  const oldIds=new Set(state.oldChannels.map(ch => ch.id));
  for (const ch of guild.channels.cache.values()) {
    if (!ch || ch.isThread?.() || replacements.has(ch.id)) continue;
    if (!oldIds.has(ch.id)) throw new Error('Während des Neustarts wurde ein weiterer Kanal angelegt. Es wird nichts weiter gelöscht. Prüfe den Server und die Neustart-Vorschau.');
  }
  for (const before of state.oldChannels) {
    const current=guild.channels.cache.get(before.id);
    if (!current || deleted.has(before.id)) continue;
    const identity={...before};delete identity.position;
    if (JSON.stringify(channelIdentity(current)) !== JSON.stringify(identity)) throw new Error(`Der alte Kanal „${before.name}“ wurde inzwischen geändert. Es wird nichts weiter gelöscht.`);
  }
}
function referenceChanges(guild,state) {
  const oldIds=new Set(state.oldChannels.map(ch => ch.id));
  const channels=state.plan.categories.flatMap(cat => cat.channels);
  const find=(key,condition) => {
    const preferred=channels.find(ch => ch.key===key && condition(ch));
    const candidate=preferred || channels.find(condition);
    return candidate && state.replacements.channels[candidate.key];
  };
  const publicText=ch => ch.kind==='text' && ch.access!=='staff';
  const changes={};
  for (const [field,key] of Object.entries(REFERENCES)) {
    if (!oldIds.has(guild[key])) continue;
    const target=field==='afkChannel' ? find('voice-afk',ch => ch.kind==='voice' && ch.access!=='staff') :
      field==='rulesChannel' ? find('rules',publicText) :
      ['publicUpdatesChannel','safetyAlertsChannel'].includes(field) ? find('staff-chat',ch => ch.kind==='text' && ch.access==='staff') : find('welcome',publicText);
    if (!target && ['rulesChannel','publicUpdatesChannel','safetyAlertsChannel'].includes(field)) throw new Error('Für die bisherigen Community-Regeln und Discord-Teamhinweise braucht der neue Entwurf einen öffentlichen Regelkanal und einen privaten Team-Textkanal.');
    changes[field]=target || null;
  }
  return changes;
}
async function migrateGuildReferences(guild,state) {
  const changes=referenceChanges(guild,state);
  if (!Object.keys(changes).length) return;
  if (!guild.members.me?.permissions?.has(P.ManageGuild)) throw new Error('Der Bot braucht zusätzlich „Server verwalten“, um alte Community-, System- oder AFK-Kanäle auf den neuen Aufbau umzustellen.');
  await guild.edit({...changes,reason:'Pixel Server-Setup: Systemkanäle vor bestätigtem Neustart umstellen'});
}
async function deleteOldChannels({guild,gd,state,save,staffChannels={},currentChannelId,checkAllowed=()=>{},onProgress=async()=>{}}) {
  state.status='deleting';state.failed=[];save();
  await guild.channels.fetch();
  assertOldChannelsUnchanged(guild,state);
  const category=ChannelType.GuildCategory;
  const order=[...state.oldChannels].sort((a,b) => (a.type===category)-(b.type===category) || (a.id===currentChannelId)-(b.id===currentChannelId) || a.id.localeCompare(b.id));
  for (const before of order) {
    if (state.deleted.includes(before.id)) continue;
    try {
      await checkAllowed();
      assertOldChannelsUnchanged(guild,state);
      const channel=guild.channels.cache.get(before.id);
      if (channel) {
        if (channel.type===category && [...guild.channels.cache.values()].some(ch => ch.parentId===channel.id && !ch.isThread?.())) throw new Error('Die alte Kategorie enthält noch Kanäle; sie bleibt erhalten.');
        try {await channel.delete('Pixel Server-Setup: ALTE KANÄLE LÖSCHEN ausdrücklich bestätigt');}
        catch(error) {if (Number(error.code) !== 10003) throw error;} // Discord confirms that an already removed old ID is gone.
        guild.channels.cache.delete(before.id);
      }
      state.deleted.push(before.id);
      removeDeletedBindings(gd,staffChannels,[before.id]);
      save();
      await onProgress();
    } catch (error) {
      state.failed.push({name:before.name,code:String(error.code || error.message || 'API/Rechte').slice(0,200)});
      state.status='partial';save();return state;
    }
  }
  state.status='complete';state.completedAt=Date.now();save();return state;
}
function backupHash(backup) {return createHash('sha256').update(JSON.stringify(backup)).digest('hex');}
module.exports={CONFIRMATION,captureOldChannels,guildReferences,pendingReset,backupPayload,startReset,removeDeletedBindings,assertOldChannelsUnchanged,referenceChanges,migrateGuildReferences,deleteOldChannels,backupHash};
