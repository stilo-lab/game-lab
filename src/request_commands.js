'use strict';
const {SlashCommandBuilder,MessageFlags,PermissionFlagsBits,ChannelType,ActionRowBuilder,StringSelectMenuBuilder}=require('discord.js');
const locale=require('./localization');
function buildRequestCommands(){
  const request=name=>new SlashCommandBuilder().setName(name).setDescription('Create windows, send reviewed DMs or manage the server in plain language').addStringOption(o=>o.setName('request').setDescription('Example: Create a window with buttons: role VIP | ticket').setRequired(true).setMaxLength(1800)).addBooleanOption(o=>o.setName('preview').setDescription('Review first; enabled by default'));
  return [request('command'),request('befehl'),new SlashCommandBuilder().setName('invite').setDescription('Create a server invite through the checked request planner')
    .addChannelOption(o=>o.setName('channel').setDescription('Target channel; default this channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildVoice,ChannelType.GuildAnnouncement))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Valid minutes, default 60; explicitly use 0 for no expiry').setMinValue(0).setMaxValue(10080))
    .addIntegerOption(o=>o.setName('uses').setDescription('Maximum uses, default 5; explicitly use 0 for unlimited').setMinValue(0).setMaxValue(100))];
}
function buildLanguageCommand(legacyChoices=[]){return new SlashCommandBuilder().setName('language').setDescription('Choose the language for bot messages, AI replies and forms')
  .addStringOption(o=>o.setName('language').setDescription('Server language').addChoices({name:'English',value:'en'},{name:'Deutsch',value:'de'}))
  .addStringOption(o=>o.setName('scope').setDescription('Server messages or your personal message translations').addChoices({name:'Server bot language',value:'server'},{name:'Personal translations',value:'personal'}))
  .addStringOption(o=>o.setName('sprache').setDescription('Legacy personal translation language').addChoices(...legacyChoices.map(([value,name])=>({name,value}))));}
function adapt(i,request,preview=true){
  const options={getString:name=>name==='wunsch'?request:i.options?.getString?.(name),getBoolean:name=>name==='vorschau'?preview:i.options?.getBoolean?.(name)};
  return new Proxy(i,{get(target,key){if(key==='options')return options;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
function createRequestCommands({getAssistant,guildData,userData,saveDB,OWNER_ID,isMaintenance=()=>false,legacyChoices=[]}={}){
  const privileged=async i=>{const member=await i.guild.members.fetch({user:i.user.id,force:true});return i.user.id===OWNER_ID||i.user.id===i.guild.ownerId||member.permissions.has(PermissionFlagsBits.ManageGuild);};
  const reply=(i,content)=>i.reply({content,allowedMentions:{parse:[]},flags:MessageFlags.Ephemeral});
  async function change(i,value,scope){
    if(!['server','personal'].includes(scope))throw Error('Unknown language scope.');
    if(scope==='server'){
      if(!['en','de'].includes(value))throw Error('Server forms support English and German. Other languages remain available for personal translations.');
      if(!await privileged(i))throw Error('Manage Server is required to change the server language.');
      const gd=guildData(i.guild.id),previous=gd.botLanguage;gd.botLanguage=value;try{saveDB();}catch(error){gd.botLanguage=previous;throw error;}
      return value==='de'?'🌐 Neue Bot-Nachrichten, KI-Antworten und Formulare sind jetzt auf **Deutsch**. Bestehende Beiträge wechseln bei ihrer nächsten Bot-Aktualisierung.':'🌐 New bot messages, AI replies and forms now use **English**. Existing posts switch language the next time the bot updates them.';
    }
    const name={en:'English',de:'German'}[value]||value;if(!legacyChoices.some(([v])=>v===name)&&!['English','German','auto'].includes(name))throw Error('Unknown translation language.');
    const u=userData(i.guild.id,i.user.id),previous={language:u.language,languageManual:u.languageManual,languageSource:u.languageSource};u.language=name==='auto'?undefined:name;u.languageManual=name!=='auto';u.languageSource=name==='auto'?'auto':'manual';try{saveDB();}catch(error){Object.assign(u,previous);throw error;}
    return '🌐 Personal message translations: **'+name+'**. Server forms and AI use the server language.';
  }
  async function handleInteraction(i){
    const isLanguageMenu=i.isStringSelectMenu?.()&&String(i.customId).startsWith('pixel_language:');const command=i.isChatInputCommand?.()?i.commandName:null;
    if(!isLanguageMenu&&!['language','command','befehl','invite'].includes(command))return false;
    try{
      if(!i.guild){await reply(i,'Use this command in a server.');return true;}
      if(isLanguageMenu){const [,gid,uid,scope]=i.customId.split(':');if(gid!==i.guild.id||uid!==i.user.id||!['server','personal'].includes(scope))throw Error('This language menu belongs to another user or server.');const message=await change(i,i.values?.[0],scope);await i.update({content:message,components:[],allowedMentions:{parse:[]}});return true;}
      if(command==='language'){
        const legacy=i.options.getString('sprache'),value=i.options.getString('language')||legacy,scope=i.options.getString('scope')||(legacy?'personal':'server');
        if(value){await reply(i,await change(i,value,scope));return true;}
        const actualScope=scope==='server'&&await privileged(i)?'server':'personal';const row=new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`pixel_language:${i.guild.id}:${i.user.id}:${actualScope}`).setPlaceholder('Choose a language').addOptions({label:'English',value:'en'},{label:'Deutsch',value:'de'}));
        await i.reply({content:actualScope==='server'?'Choose the language for bot messages, AI and forms on this server.':'Choose your personal message translation language. A server manager can change the language of AI and forms.',components:[row],flags:MessageFlags.Ephemeral});return true;
      }
      if(isMaintenance(i))throw Error('The bot is currently in maintenance mode.');
      if(command==='invite'){
        const target=i.options.getChannel('channel')||i.channel,minutes=i.options.getInteger('minutes')??60,uses=i.options.getInteger('uses')??5;
        if(target?.guildId!==i.guild.id&&target?.guild?.id!==i.guild.id)throw Error('Choose a channel in this server.');
        if(!Number.isInteger(minutes)||minutes<0||minutes>10080||!Number.isInteger(uses)||uses<0||uses>100)throw Error('Invalid invite duration or maximum uses.');
        await getAssistant().handle(adapt(i,`Erstelle Einladung für <#${target.id}> gültig ${minutes*60} Sekunden mit ${uses} Nutzungen`,true));return true;
      }
      const request=i.options.getString('request',true);if(!request?.trim()||request.length>1800)throw Error('Describe your request in 1–1,800 characters.');await getAssistant().handle(adapt(i,request,i.options.getBoolean('preview')??true));return true;
    }catch(error){try{await reply(i,'❌ '+String(error.message||'Request failed.').slice(0,600));}catch{}return true;}
  }
  return {handleInteraction,change};
}
module.exports={buildRequestCommands,buildLanguageCommand,adapt,createRequestCommands};
