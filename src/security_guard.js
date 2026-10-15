'use strict';
const {createHash}=require('node:crypto');
const {PermissionsBitField,SlashCommandBuilder,MessageFlags}=require('discord.js');
const P=PermissionsBitField.Flags;
const DEFAULTS=Object.freeze({enabled:true,messageLimit:10,windowSeconds:8,repeatLimit:4,pingLimit:8,linkLimit:6,timeoutMinutes:5});
const RANGES={messageLimit:[6,30],windowSeconds:[5,30],repeatLimit:[3,10],pingLimit:[5,30],linkLimit:[4,20],timeoutMinutes:[1,15]};
function settings(gd) {
  const out={...DEFAULTS};
  for(const [key,[min,max]] of Object.entries(RANGES))if(Number.isInteger(gd?.securitySettings?.[key]))out[key]=Math.max(min,Math.min(max,gd.securitySettings[key]));
  if(typeof gd?.securitySettings?.enabled==='boolean')out.enabled=gd.securitySettings.enabled;
  return out;
}
function canonical(text) {return String(text || '').normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g,'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,2000);}
function createGuard({guildData,saveDB=()=>{},recordPunishment=async()=>{},alert=async()=>{},ownerId,now=Date.now,maxUsers=10000}={}) {
  maxUsers=Math.max(1,Math.min(10000,Number(maxUsers)||10000));
  const users=new Map(),lastAlerts=new Map(),commands=new Map();let checks=0;
  function prune() {
    if(++checks%100!==0 && users.size<maxUsers)return;
    for(const [key,value]of users)if(now()-value.at>10*60000)users.delete(key);
    for(const [key,at]of lastAlerts)if(now()-at>10*60000)lastAlerts.delete(key);
    for(const [key,row]of commands)if(now()-row.at>60000)commands.delete(key);
    while(users.size>=maxUsers)users.delete(users.keys().next().value);
  }
  function commandGate(interaction) {
    if(!interaction.guild?.id || !interaction.user?.id || !['ai','new','serversetup','setup','create','staffai','aipulse','learn','staffapplication'].includes(interaction.commandName))return true;
    const gd=guildData(interaction.guild.id);if(!settings(gd).enabled || gd.settings?.autoModEnabled===false)return true;
    prune();const key=interaction.guild.id+':'+interaction.user.id,at=now(),row=commands.get(key)||{at,times:[]};
    row.times=row.times.filter(t=>at-t<20000);row.at=at;
    const limit=interaction.user.id===ownerId || interaction.member?.permissions?.has?.(P.Administrator)?20:6;
    if(row.times.length>=limit)return false;row.times.push(at);commands.set(key,row);
    while(commands.size>maxUsers)commands.delete(commands.keys().next().value);
    return true;
  }
  function observe(message) {
    if(!message?.guild?.id || !message.author?.id || message.author.bot || message.webhookId)return null;
    if(message.author.id===ownerId || message.author.id===message.guild.ownerId || message.member?.permissions?.has?.(P.Administrator))return null;
    const gd=guildData(message.guild.id),config=settings(gd);
    if(!config.enabled || gd.settings?.autoModEnabled===false)return null;
    prune();const at=now(),key=message.guild.id+':'+message.author.id;
    const state=users.get(key)||{at,times:[],duplicates:[],busy:false,until:0,seen:[]};
    if(state.seen.includes(message.id))return null;
    state.seen=[...state.seen.slice(-29),message.id];state.at=at;users.set(key,state);
    if(state.busy || state.until>at)return {kind:'blocked',key,state};
    const text=canonical(message.content),hash=text.length>=8?createHash('sha256').update(text).digest('hex'):null;
    state.times=state.times.filter(t=>at-t<config.windowSeconds*1000);state.times.push(at);
    state.duplicates=state.duplicates.filter(r=>at-r.at<20000);if(hash)state.duplicates.push({at,hash});state.duplicates=state.duplicates.slice(-40);
    const duplicates=hash?state.duplicates.filter(r=>r.hash===hash).length:0;
    const pings=(message.mentions?.users?.size || 0)+(message.mentions?.roles?.size || 0);
    const links=(String(message.content || '').match(/https?:\/\/[^\s<>]+/gi)||[]).length;
    const reason=state.times.length>=config.messageLimit?'Nachrichten-Flut':duplicates>=config.repeatLimit?'Wiederholter gleicher Text':pings>=config.pingLimit?'Zu viele Nutzer-/Rollen-Pings':links>=config.linkLimit?'Link-Flut':null;
    if(!reason)return null;
    // Reserve immediately, before any asynchronous Discord call.
    state.busy=true;state.until=at+10000;state.times=[];state.duplicates=[];
    return {kind:'offense',key,state,reason,config,at};
  }
  async function enforce(message,decision) {
    if(!decision)return false;
    if(decision.kind==='blocked')return true;
    const {state,config,reason,at}=decision,gd=guildData(message.guild.id);
    let action='warn',minutes=0;
    try {
      gd.securityState ||= {};
      for(const [id,row]of Object.entries(gd.securityState))if(at-Number(row?.at || 0)>24*3600000)delete gd.securityState[id];
      const old=gd.securityState[message.author.id];
      const count=old && at-old.at<30*60000?Math.min(4,old.count+1):1;
      gd.securityState[message.author.id]={count,at};
      // Keep persistent state bounded, without erasing current user history.
      const entries=Object.entries(gd.securityState).sort((a,b)=>b[1].at-a[1].at);
      for(const [id]of entries.slice(500))delete gd.securityState[id];
      saveDB();
      const bot=message.guild.members?.me,member=message.member;
      if(message.deletable && message.delete && message.channel?.permissionsFor?.(bot)?.has(P.ManageMessages))await message.delete().catch(()=>{});
      if(count>=2 && member && member.moderatable!==false && bot?.permissions?.has(P.ModerateMembers) && typeof member.timeout==='function') {
        minutes=Math.min(15,config.timeoutMinutes*(count-1));
        await member.timeout(minutes*60000,'Pixel Security: '+reason);action='timeout';
        await recordPunishment(message.guild,message.author.id,null,'timeout',minutes*60000,reason,'security-guard').catch(()=>{});
      }
      const payload={content:action==='timeout'?`🛡️ Wiederholter Spam erkannt: ${minutes} Minuten Timeout.`:`🛡️ Bitte stoppe den Spam (${reason}). Beim nächsten Verstoß kann ein kurzer Timeout folgen.`,allowedMentions:{parse:[],repliedUser:false}};
      await message.channel?.send?.(payload).catch(()=>{});
      const alertKey=message.guild.id+':'+message.author.id,last=lastAlerts.get(alertKey);
      if(last===undefined || at-last>=60000) {
        lastAlerts.set(alertKey,at);
        while(lastAlerts.size>maxUsers)lastAlerts.delete(lastAlerts.keys().next().value);
        await alert(message.guild,`${reason} · User ${message.author.id} · Kanal ${message.channel.id} · ${action}${minutes?' '+minutes+' Min.':''}`).catch(()=>{});
      }
    } catch {
      // Fail closed for this message; never claim a punishment that failed.
      await alert(message.guild,`Security-Prüfung für User ${message.author.id} konnte nicht abgeschlossen werden. Bot-Rechte und Datenspeicherung prüfen.`).catch(()=>{});
    } finally {state.busy=false;}
    return true;
  }
  return {observe,enforce,commandGate,size:()=>users.size};
}
function command() {
  return new SlashCommandBuilder().setName('security').setDescription('Anti-Spam anzeigen und sicher einstellen.')
    .addSubcommand(s=>s.setName('status').setDescription('Zeigt die aktuellen Schutz-Einstellungen.'))
    .addSubcommand(s=>s.setName('config').setDescription('Anti-Spam konfigurieren; nur Serververwaltung.')
      .addBooleanOption(o=>o.setName('aktiv').setDescription('Anti-Spam an/aus'))
      .addIntegerOption(o=>o.setName('nachrichten').setDescription('Nachrichten pro Zeitfenster').setMinValue(6).setMaxValue(30))
      .addIntegerOption(o=>o.setName('sekunden').setDescription('Zeitfenster in Sekunden').setMinValue(5).setMaxValue(30))
      .addIntegerOption(o=>o.setName('wiederholungen').setDescription('Gleicher Text innerhalb von 20 Sekunden').setMinValue(3).setMaxValue(10))
      .addIntegerOption(o=>o.setName('pings').setDescription('Nutzer-/Rollen-Pings pro Nachricht').setMinValue(5).setMaxValue(30))
      .addIntegerOption(o=>o.setName('links').setDescription('Links pro Nachricht').setMinValue(4).setMaxValue(20))
      .addIntegerOption(o=>o.setName('timeout').setDescription('Timeout nach wiederholtem Spam in Minuten').setMinValue(1).setMaxValue(15)));
}
async function handle(interaction,{guildData,saveDB,canManage}={}) {
  if(!interaction.guild?.id)return interaction.reply({content:'Nutze /security auf einem Server.',flags:MessageFlags.Ephemeral});
  const gd=guildData(interaction.guild.id);
  if(interaction.options.getSubcommand()==='config') {
    let current=interaction;
    if(interaction.guild.members?.fetch) {
      try{const member=await interaction.guild.members.fetch({user:interaction.user.id,force:true});current={...interaction,member,memberPermissions:member.permissions};}
      catch{return interaction.reply({content:'Die aktuellen Rechte konnten nicht geprüft werden. Die Einstellungen bleiben erhalten.',flags:MessageFlags.Ephemeral});}
    }
    if(!canManage(current))return interaction.reply({content:'Nur die Serververwaltung darf den Schutz ändern.',flags:MessageFlags.Ephemeral});
    const config=settings(gd),map={nachrichten:'messageLimit',sekunden:'windowSeconds',wiederholungen:'repeatLimit',pings:'pingLimit',links:'linkLimit',timeout:'timeoutMinutes'};
    const active=interaction.options.getBoolean('aktiv');if(active!==null && active!==undefined)config.enabled=active;
    for(const [option,key]of Object.entries(map)){const value=interaction.options.getInteger(option);if(value!==null && value!==undefined){const [min,max]=RANGES[key];if(!Number.isInteger(value)||value<min||value>max)return interaction.reply({content:'Ungültige Schwelle.',flags:MessageFlags.Ephemeral});config[key]=value;}}
    const previous=gd.securitySettings;gd.securitySettings=config;
    try{saveDB();}catch{gd.securitySettings=previous;return interaction.reply({content:'Die Einstellungen konnten nicht gespeichert werden. Der bisherige Schutz bleibt erhalten.',flags:MessageFlags.Ephemeral});}
  }
  const c=settings(gd);
  return interaction.reply({content:`🛡️ Anti-Spam: **${c.enabled && gd.settings?.autoModEnabled!==false?'AN':'AUS'}**\n${c.messageLimit} Nachrichten / ${c.windowSeconds}s · ${c.repeatLimit} gleiche Texte / 20s\n${c.pingLimit} Nutzer-/Rollen-Pings oder ${c.linkLimit} Links pro Nachricht\nErster Verstoß: Warnung. Danach kurze Timeouts bis maximal 15 Minuten.\nDer globale AutoMod-Schalter in /settings gilt weiterhin.`,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
}
module.exports={DEFAULTS,settings,createGuard,command,handle};
