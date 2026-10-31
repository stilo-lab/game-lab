'use strict';
const {SlashCommandBuilder,EmbedBuilder,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
const guides=require('./bot_guides'),locale=require('./localization');
function buildCommands(){return [new SlashCommandBuilder().setName('help').setDescription('Browse bot commands, offline examples and troubleshooting').setDMPermission(false)
  .addStringOption(o=>o.setName('topic').setDescription('Choose a help topic').addChoices(...Object.entries(guides.TOPICS).map(([value,r])=>({name:r.en,value}))))
  .addStringOption(o=>o.setName('query').setDescription('Search examples: giveaway, invites, roles or music').setMaxLength(100))];}
function createHelpCenter({now=Date.now}={}){
  const recent=new Map();
  function page(gid,uid,id='overview',query=''){
    const lang=locale.languageFor(gid),de=lang==='de',data=guides.content(id,lang),results=query?guides.search(query):[],e=new EmbedBuilder().setColor(0x5865f2).setTitle(data.title).setDescription(data.text).setFooter({text:de?'Pixel-Hilfe · Nur für dich · EN/DE mit /language':'Pixel help · Only you can use this menu · EN/DE with /language'});
    if(query)e.addFields({name:de?'Suche':'Search',value:results.length?results.map(key=>guides.content(key,lang).title).join('\n'):(de?'Kein passendes Thema gefunden. Wähle ein Thema unten.':'No matching topic. Choose a topic below.')});
    const menu=new StringSelectMenuBuilder().setCustomId(`pxhelp:topic:${gid}:${uid}`).setPlaceholder(de?'Thema auswählen':'Choose a topic').addOptions(...Object.entries(guides.TOPICS).map(([value,row])=>({label:de?row.de:row.en,value,emoji:row.icon,default:value===data.id})));
    const buttons=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pxhelp:home:${gid}:${uid}`).setLabel(de?'Übersicht':'Overview').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`pxhelp:close:${gid}:${uid}`).setLabel(de?'Schließen':'Close').setStyle(ButtonStyle.Secondary));
    return {embeds:[e],components:[new ActionRowBuilder().addComponents(menu),buttons],allowedMentions:{parse:[]}};
  }
  async function handleInteraction(i){
    const command=i.isChatInputCommand?.()&&i.commandName==='help',component=String(i.customId||'').startsWith('pxhelp:');if(!command&&!component)return false;
    const gid=i.guild?.id,de=locale.languageFor(gid)==='de';
    const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
    if(!gid){await reply(de?'Nutze /help auf einem Server.':'Use /help in a server.');return true;}
    if(component){
      const [,action,boundGuild,boundUser,...extra]=i.customId.split(':');
      if(extra.length||gid!==boundGuild||i.user.id!==boundUser){await reply(de?'Öffne dein eigenes Hilfemenü mit /help.':'Open your own help menu with /help.');return true;}
      const id=action==='topic'?i.values?.[0]:'overview';if(!['topic','home','close'].includes(action)||(action==='topic'&&!Object.hasOwn(guides.TOPICS,id))){await reply(de?'Unbekanntes Hilfethema.':'Unknown help topic.');return true;}
      const key=gid+':'+i.user.id,previous=recent.get(key);if(previous!==undefined&&now()-previous<1000){await reply(de?'Warte bitte eine Sekunde.':'Please wait one second.');return true;}recent.set(key,now());if(recent.size>2000)recent.delete(recent.keys().next().value);
      await i.update(action==='close'?{content:de?'Hilfe geschlossen. Mit /help erneut öffnen.':'Help closed. Use /help to open it again.',embeds:[],components:[],allowedMentions:{parse:[]}}:page(gid,i.user.id,id));return true;
    }
    const query=i.options.getString('query')||'',topic=i.options.getString('topic'),id=topic||guides.search(query)[0]||'overview';
    if(topic&&!Object.hasOwn(guides.TOPICS,topic)){await reply(de?'Unbekanntes Hilfethema.':'Unknown help topic.');return true;}
    await i.reply({...page(gid,i.user.id,id,query),flags:MessageFlags.Ephemeral});return true;
  }
  return {handleInteraction,page};
}
module.exports={buildCommands,createHelpCenter};
