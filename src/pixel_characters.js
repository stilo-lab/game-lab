'use strict';
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {ActionRowBuilder,StringSelectMenuBuilder,EmbedBuilder,MessageFlags}=require('discord.js');
const ASSET_ROOT=path.join(__dirname,'..','assets','pixel-characters');
const CHARACTERS=Object.freeze([
  Object.freeze({id:'gojo',name:'Pixel Gojo',label:'Gojo',symbol:'🔵',description:'Weißes Haar, Augenbinde und dein bisheriger Gojo.'}),
  Object.freeze({id:'sukuna',name:'Pixel Sukuna',label:'Sukuna',symbol:'🔴',description:'Rosa Haare, Tattoos und ein freches Grinsen.'}),
  Object.freeze({id:'geto',name:'Pixel Geto',label:'Geto',symbol:'🟣',description:'Lange schwarze Haare und ein entspannter Look.'}),
  Object.freeze({id:'nanami',name:'Pixel Nanami',label:'Nanami',symbol:'🟡',description:'Blond, mit Brille und schickem Anzug.'}),
  Object.freeze({id:'toji',name:'Pixel Toji',label:'Toji',symbol:'🟢',description:'Schwarze Haare, schwarzes Shirt und lässiger Stil.'}),
  Object.freeze({id:'zelda',name:'Pixel Zelda',label:'Zelda',symbol:'👑',description:'Runen lesen, Harfe spielen und goldenes Licht.'}),
  Object.freeze({id:'link',name:'Pixel Link',label:'Link',symbol:'🍃',description:'Karten lesen, angeln und Schatztruhen öffnen.'}),
  Object.freeze({id:'nova',name:'Pixel Nova',label:'Nova',symbol:'🤖',description:'Eigener Roboter: Hologramme, Aufladen und Funken.'}),
  Object.freeze({id:'ember',name:'Pixel Ember',label:'Ember',symbol:'🦊',description:'Eigener Fuchs: Briefe stempeln, schlafen, Blätter fangen.'}),
  Object.freeze({id:'luna',name:'Pixel Luna',label:'Luna',symbol:'🌙',description:'Eigene Sternmagierin: Tränke, Teleskop und Sternsprung.'})
]);
const characterById=id=>CHARACTERS.find(c=>c.id===id)||CHARACTERS[0];
const validCharacter=id=>CHARACTERS.some(c=>c.id===id);
const selectedCharacter=record=>characterById(record?.pixelCharacterId).id;
const hasSelection=record=>validCharacter(record?.pixelCharacterId);

function createCharacterPicker({getUserRecord,saveDB,answerQuestion,isAiEnabled=()=>true,isMaintenance=()=>false,now=Date.now,ttlMs=15*60000,maxSessions=200,previewPath=path.join(ASSET_ROOT,'auswahl.png')}={}){
  if(typeof getUserRecord!=='function'||typeof saveDB!=='function')throw Error('Character storage missing');
  const sessions=new Map();
  function cleanup(){for(const [token,s] of sessions)if(now()-s.createdAt>ttlMs)sessions.delete(token);}
  function createSession(guildId,userId,question){
    cleanup();
    if(sessions.size>=maxSessions)return null;
    const token=crypto.randomBytes(12).toString('hex');
    sessions.set(token,{guildId,userId,question:question?String(question).slice(0,6000):null,createdAt:now(),busy:false});return token;
  }
  function payload(token,guildId,userId,hasQuestion){
    const current=selectedCharacter(getUserRecord(guildId,userId));
    const embed=new EmbedBuilder().setTitle('Wähle deinen Pixel ✨').setColor(0x5865F2)
      .setDescription(CHARACTERS.map(c=>c.label).join(', ')+' – wer begleitet dich?\n\nJeder Pixel hat eigene Animationen. Deine Auswahl wird für dich auf diesem Server gespeichert. Mit **/pixel** kannst du später wechseln.'+(hasQuestion?'\nNach der Auswahl beantworte ich direkt deine Frage.':''));
    const menu=new StringSelectMenuBuilder().setCustomId('pxc:'+token).setPlaceholder(`Wähle einen der ${CHARACTERS.length} Pixel-Charaktere`)
      .addOptions(CHARACTERS.map(c=>({label:c.label,value:c.id,description:c.description,emoji:{name:c.symbol},default:hasSelection(getUserRecord(guildId,userId))&&current===c.id})));
    const result={content:'',embeds:[embed],components:[new ActionRowBuilder().addComponents(menu)],allowedMentions:{parse:[],repliedUser:false}};
    if(fs.existsSync(previewPath)){embed.setImage('attachment://pixel-auswahl.png');result.files=[{attachment:previewPath,name:'pixel-auswahl.png'}];}
    return result;
  }
  async function open(interaction,{question=null}={}){
    if(!interaction.guild?.id)return interaction.reply({content:'Nutze /pixel bitte auf einem Server.',flags:MessageFlags.Ephemeral});
    const token=createSession(interaction.guild.id,interaction.user.id,question);
    if(!token)return interaction.reply({content:'⏳ Gerade sind viele Auswahlen offen. Bitte gleich erneut versuchen.',flags:MessageFlags.Ephemeral});
    try{return await interaction.reply({...payload(token,interaction.guild.id,interaction.user.id,Boolean(question)),flags:MessageFlags.Ephemeral});}
    catch(error){sessions.delete(token);throw error;}
  }
  async function openFromMessage(message,{question=null}={}){
    const token=createSession(message.guild.id,message.author.id,question);
    if(!token)return message.reply({content:'⏳ Gerade sind viele Auswahlen offen. Bitte gleich erneut versuchen.',allowedMentions:{repliedUser:false}});
    try{return await message.reply(payload(token,message.guild.id,message.author.id,Boolean(question)));}
    catch(error){sessions.delete(token);throw error;}
  }
  async function handleInteraction(interaction){
    if(!interaction.isStringSelectMenu?.()||!String(interaction.customId||'').startsWith('pxc:'))return false;
    const token=interaction.customId.slice(4),session=sessions.get(token);
    const fail=content=>interaction.reply({content,flags:MessageFlags.Ephemeral});
    if(!session||now()-session.createdAt>ttlMs){sessions.delete(token);await fail('⌛ Diese Auswahl ist abgelaufen. Nutze /pixel oder stelle deine Frage mit /ai erneut.');return true;}
    if(interaction.user.id!==session.userId||interaction.guild?.id!==session.guildId){await fail('🔒 Diese Auswahl gehört einem anderen Nutzer. Öffne deine eigene mit /pixel.');return true;}
    if(isMaintenance(interaction)){await fail('🔧 Der Bot ist gerade im Wartungsmodus.');return true;}
    if(session.busy){await fail('⏳ Diese Auswahl wird gerade gespeichert.');return true;}
    const id=interaction.values?.[0];
    if(!validCharacter(id)){await fail('❌ Dieser Pixel-Charakter ist nicht verfügbar.');return true;}
    session.busy=true;
    try{
      await interaction.deferUpdate();
      const record=getUserRecord(session.guildId,session.userId),had=Object.hasOwn(record,'pixelCharacterId'),previous=record.pixelCharacterId;
      record.pixelCharacterId=id;
      try{saveDB();}catch(error){if(had)record.pixelCharacterId=previous;else delete record.pixelCharacterId;session.busy=false;await interaction.followUp({content:'⚠️ Deine Auswahl konnte nicht gespeichert werden. Bitte erneut versuchen.',flags:MessageFlags.Ephemeral});return true;}
      sessions.delete(token);
      const character=characterById(id);
      if(session.question&&isAiEnabled(session.guildId)&&answerQuestion){
        // Remove the picker and its attachment before starting the ordinary AI handler.
        await interaction.editReply({content:`${character.symbol} **${character.name}** ist ausgewählt.`,embeds:[],components:[],attachments:[]});
        await answerQuestion(interaction,session.question);return true;
      }
      await interaction.editReply({content:`${character.symbol} **${character.name}** begleitet dich jetzt. Du kannst mit /pixel wechseln.`+(session.question?'\nDie AI wurde inzwischen ausgeschaltet. Deine Auswahl ist trotzdem gespeichert.':''),embeds:[],components:[],attachments:[],allowedMentions:{parse:[]}});
      return true;
    }catch(error){if(sessions.has(token))session.busy=false;throw error;}
  }
  return {open,openFromMessage,handleInteraction,hasSelection:(guildId,userId)=>hasSelection(getUserRecord(guildId,userId)),getSelected:(guildId,userId)=>selectedCharacter(getUserRecord(guildId,userId)),sessions};
}
module.exports={ASSET_ROOT,CHARACTERS,characterById,validCharacter,selectedCharacter,hasSelection,createCharacterPicker};
