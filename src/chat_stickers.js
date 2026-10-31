'use strict';
const {SlashCommandBuilder,MessageFlags,PermissionFlagsBits:P,ChannelType,EmbedBuilder}=require('discord.js');
const crypto=require('node:crypto'),locale=require('./localization');
const ID=/^\d{17,20}$/;
const MOODS=Object.freeze({greet:'Greeting',hype:'Hype / celebration',laugh:'Funny moment',cool:'Cool / chill',thanks:'Thanks'});
const normalize=s=>String(s||'').slice(0,1000).normalize('NFKC').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[_-]+/g,' ').trim();
const WORDS={greet:/\b(?:hi|hey|hello|hallo|moin|yo|wave|welcome|greeting|begru[ss]+ung)\b|👋/,hype:/\b(?:hype|gg|win|winner|victory|congrats|celebrate|party|lets go|gewonnen|sieg|gluckwunsch|feier\w*)\b|🎉|🏆|🔥/,laugh:/\b(?:lol|lmao|haha\w*|funny|laugh\w*|xd|lustig|lachen|meme)\b|😂|🤣/,cool:/\b(?:cool|chill\w*|swag|nice|sigma|vibe\w*|gojo)\b|😎/,thanks:/\b(?:thanks?|thank you|thx|danke|dankeschon|merci|ty)\b|🙏/};
const BLOCK=/\b(?:ban\w*|bann\w*|kick\w*|raid\w*|spam|nsfw|hentai|sex\w*|hate|suicid\w*|self.?harm|depress\w*|death|died|dead|gestorben|traurig|sad|sorry|leid|fehler|error|kaputt|broken|bewerbung\w*|application|passwort|password|token|api.?key|problem\w*)\b/;
function moodFor(question,answer=''){
  const q=normalize(question);if(!q||q.length>220||BLOCK.test(q)||BLOCK.test(normalize(answer))||/\b(?:not|no|nicht|kein\w*|never|failed|dont|don't|didn't)\b/.test(q)||/[;\n]|```|https?:|<#[0-9]+>/.test(question))return null;
  if(/^(?:hi|hey|hello|hallo|moin|yo|servus)(?:\b|[!?. ])/.test(q))return 'greet';
  if(WORDS.thanks.test(q))return 'thanks';if(WORDS.laugh.test(q))return 'laugh';
  if(WORDS.hype.test(q)||/\b(?:just (?:pulled|got)|hab(?:e)? .{0,80}gezogen|lets? go|crazy)\b/.test(q))return 'hype';
  if(WORDS.cool.test(q))return 'cool';return null;
}
function settings(gd){
  const raw=gd?.chatStickers;if(raw===undefined)return {enabled:true,mode:'auto',cooldown:60,mappings:{},attempts:[]};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid saved sticker data.');
  const enabled=raw.enabled??true,mode=raw.mode??'auto',cooldown=raw.cooldown??60,mappings=raw.mappings??{},attempts=raw.attempts??[];
  if(typeof enabled!=='boolean'||!['auto','mapped'].includes(mode)||!Number.isInteger(cooldown)||cooldown<30||cooldown>600||!mappings||typeof mappings!=='object'||Array.isArray(mappings)||Object.entries(mappings).some(([k,v])=>!Object.hasOwn(MOODS,k)||typeof v!=='string'||!ID.test(v))||!Array.isArray(attempts)||attempts.length>100||attempts.some(a=>!a||!ID.test(a.id)||!ID.test(a.userId)||!ID.test(a.stickerId)||!Number.isFinite(a.at)||!['attempting','sent','uncertain'].includes(a.status)))throw Error('Invalid saved sticker data.');
  return {enabled,mode,cooldown,mappings:{...mappings},attempts:attempts.map(a=>({...a}))};
}
function usable(sticker,gid){return Boolean(sticker&&ID.test(sticker.id)&&sticker.type===2&&sticker.guildId===gid&&sticker.available===true&&!BLOCK.test(normalize(sticker.name+' '+(sticker.description||'')+' '+(sticker.tags||''))));}
function select(stickers,config,mood,gid){
  if(!Object.hasOwn(MOODS,mood))return null;
  const available=stickers.filter(s=>usable(s,gid));
  if(config.mappings[mood])return available.find(s=>s.id===config.mappings[mood])||null;
  if(config.mode==='mapped')return null;
  let matching=available.filter(s=>WORDS[mood].test(normalize(s.name+' '+(s.tags||'')+' '+(s.description||''))));
  if(!matching.length&&mood!=='cool')matching=available.filter(s=>WORDS.cool.test(normalize(s.name+' '+(s.tags||''))));
  const last=config.attempts.at(-1)?.stickerId;return matching.find(s=>s.id!==last)||matching[0]||null;
}
function command(){
  const choices=Object.entries(MOODS).map(([value,name])=>({name,value})),mood=o=>o.setName('mood').setDescription('Sticker moment').setRequired(true).addChoices(...choices);
  return new SlashCommandBuilder().setName('stickers').setDescription('Choose cool server stickers for Pixel chat reactions').setDMPermission(false)
    .addSubcommand(s=>s.setName('status').setDescription('Show sticker settings and assigned favorites privately'))
    .addSubcommand(s=>s.setName('list').setDescription('List available server stickers and their IDs privately'))
    .addSubcommand(s=>s.setName('config').setDescription('Manage automatic chat stickers; needs Manage Server')
      .addBooleanOption(o=>o.setName('enabled').setDescription('Enable or disable chat stickers'))
      .addStringOption(o=>o.setName('mode').setDescription('Match server sticker names or use only assigned favorites').addChoices({name:'Automatic matching',value:'auto'},{name:'Assigned favorites only',value:'mapped'}))
      .addIntegerOption(o=>o.setName('cooldown').setDescription('Seconds between stickers on the whole server; default 60').setMinValue(30).setMaxValue(600)))
    .addSubcommand(s=>s.setName('assign').setDescription('Assign a favorite server sticker; needs Manage Server').addStringOption(mood).addStringOption(o=>o.setName('sticker_id').setDescription('Exact sticker ID from /stickers list').setRequired(true).setMinLength(17).setMaxLength(20)))
    .addSubcommand(s=>s.setName('unassign').setDescription('Remove a favorite assignment; needs Manage Server').addStringOption(mood))
    .addSubcommand(s=>s.setName('preview').setDescription('Privately preview a matching sticker without posting it').addStringOption(mood))
    .addSubcommand(s=>s.setName('test').setDescription('Post ONE test sticker HERE publicly; needs Manage Server').addStringOption(mood));
}
function createChatStickers(ctx={}){
  const now=ctx.now||Date.now,busy=new Set(),inventories=new Map(),commands=new Map();
  const lang=i=>ctx.languageFor?.(i.guild?.id)||locale.languageFor(i.guild?.id),t=(i,en,de)=>lang(i)==='de'?de:en;
  const current=gid=>settings(ctx.guildData(gid));
  function allowed(i){return Boolean(i.guild?.id&&ctx.isGuildApproved?.(i.guild.id)&&!ctx.isMaintenance?.(i));}
  function commit(gid,change){const gd=ctx.guildData(gid),had=Object.hasOwn(gd,'chatStickers'),previous=gd.chatStickers;const next=current(gid);change(next);gd.chatStickers=next;try{ctx.saveDB();return next;}catch(e){if(had)gd.chatStickers=previous;else delete gd.chatStickers;throw e;}}
  async function fresh(i,{sending=false,manager=false}={}){
    if(!allowed(i))throw Error(t(i,'Use this in an approved server outside maintenance.','Nutze das auf einem freigegebenen Server außerhalb der Wartung.'));
    const [member,bot,channel]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.channels.fetch(i.channelId,{force:true})]);await i.guild.roles.fetch();
    if(member?.id!==i.user.id||channel?.guildId!==i.guild.id||!channel.permissionsFor(member)?.has(P.ViewChannel))throw Error(t(i,'This channel is unavailable.','Dieser Kanal ist nicht zugänglich.'));
    if(manager&&!(member.permissions.has(P.ManageGuild)||i.guild.ownerId===i.user.id||(ID.test(String(ctx.OWNER_ID))&&i.user.id===ctx.OWNER_ID)))throw Error(t(i,'Manage Server is required.','Server verwalten ist erforderlich.'));
    if(sending){if(![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)||!channel.permissionsFor(bot)?.has([P.ViewChannel,P.SendMessages])||!channel.permissionsFor(member)?.has(P.SendMessages))throw Error(t(i,'Pixel and you need View Channel and Send Messages in a normal server text channel.','Pixel und du brauchen Kanal ansehen und Nachrichten senden in einem normalen Server-Textkanal.'));}
    if(!allowed(i))throw Error('Unavailable');return {member,bot,channel};
  }
  async function inventory(guild,force=false){
    const old=inventories.get(guild.id);if(!force&&old&&now()-old.at<60000)return old.rows;
    const fetched=await guild.stickers.fetch(),rows=[...fetched.values()].slice(0,1000);inventories.set(guild.id,{at:now(),rows});while(inventories.size>1000)inventories.delete(inventories.keys().next().value);return rows;
  }
  async function send(i,mood,{manual=false}={}){
    const gid=i.guild?.id;if(!gid||busy.has(gid))return false;busy.add(gid);
    try{
      if(!ID.test(i.id)||!ID.test(i.user.id)||!allowed(i))return false;
      let config=current(gid);if(!config.enabled||(!manual&&ctx.isAiEnabled?.(gid)===false))return false;
      const recent=config.attempts.filter(a=>now()-a.at<3600000);if(recent.length>=100||recent.some(a=>a.id===i.id)||recent.some(a=>now()-a.at<config.cooldown*1000)||recent.some(a=>a.userId===i.user.id&&now()-a.at<config.cooldown*2000))return false;
      await fresh(i,{sending:true,manager:manual});
      const pool=await inventory(i.guild),picked=select(pool,config,mood,gid);if(!picked)return false;
      const sticker=await i.guild.stickers.fetch(picked.id,{force:true,cache:false});if(!usable(sticker,gid))return false;
      const {channel}=await fresh(i,{sending:true,manager:manual});
      config=current(gid);if(!config.enabled||(!manual&&ctx.isAiEnabled?.(gid)===false)||!allowed(i))return false;
      const latest=config.attempts.filter(a=>now()-a.at<3600000);if(latest.length>=100||latest.some(a=>a.id===i.id)||latest.some(a=>now()-a.at<config.cooldown*1000)||latest.some(a=>a.userId===i.user.id&&now()-a.at<config.cooldown*2000))return false;
      // Settings may have changed while Discord was answering. Re-select before sending.
      if(select(pool.map(s=>s.id===sticker.id?sticker:s),config,mood,gid)?.id!==sticker.id)return false;
      const record={id:i.id,userId:i.user.id,stickerId:sticker.id,at:now(),status:'attempting'};
      commit(gid,c=>{c.attempts=c.attempts.filter(a=>now()-a.at<3600000);if(c.attempts.length>=100||c.attempts.some(a=>a.id===i.id))throw Error('Sticker limit');c.attempts.push(record);});
      const nonce=crypto.createHash('sha256').update(gid+':'+i.id).digest('hex').slice(0,24);
      try{await channel.send({stickers:[sticker.id],allowedMentions:{parse:[],repliedUser:false},nonce,enforceNonce:true});}
      catch{try{commit(gid,c=>{const a=c.attempts.find(a=>a.id===i.id);if(a)a.status='uncertain';});}catch{}return false;}
      try{commit(gid,c=>{const a=c.attempts.find(a=>a.id===i.id);if(a)a.status='sent';});}catch{/* Keep the saved attempt; never replay an uncertain send. */}
      return true;
    }catch{return false;}finally{busy.delete(gid);}
  }
  async function afterAnswer({interaction,message,question,answer}={}){
    try{
      const mood=moodFor(question,answer);if(!mood||!String(answer||'').trim())return false;
      if(interaction){if(interaction.commandName!=='ai'||interaction.ephemeral!==false)return false;return await send(interaction,mood);}
      if(!message?.guild||message.author?.bot!==false||message.webhookId)return false;
      return await send({id:message.id,guild:message.guild,user:message.author,channelId:message.channelId||message.channel?.id},mood);
    }catch{return false;}
  }
  async function handleInteraction(i){
    if(!i.isChatInputCommand?.()||i.commandName!=='stickers')return false;
    const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
    try{
      const sub=i.options.getSubcommand(),manager=['config','assign','unassign','test'].includes(sub);if(!allowed(i)){await reply(t(i,'Use this in an approved server outside maintenance.','Nutze das auf einem freigegebenen Server außerhalb der Wartung.'));return true;}
      const key=i.guild.id+':'+i.user.id,previous=commands.get(key);if(previous!==undefined&&now()-previous<2000){await reply(t(i,'Wait two seconds.','Warte zwei Sekunden.'));return true;}commands.set(key,now());for(const [k,at]of commands)if(now()-at>60000)commands.delete(k);while(commands.size>3000)commands.delete(commands.keys().next().value);
      await i.deferReply({flags:MessageFlags.Ephemeral});await fresh(i,{manager});let config=current(i.guild.id),content,embed;
      const mood=i.options.getString('mood');if(['assign','unassign','preview','test'].includes(sub)&&!Object.hasOwn(MOODS,mood))throw Error('Unknown sticker moment.');
      if(sub==='config'){
        const enabled=i.options.getBoolean('enabled'),mode=i.options.getString('mode'),cooldown=i.options.getInteger('cooldown');
        if(enabled!==null&&typeof enabled!=='boolean'||mode!==null&&!['auto','mapped'].includes(mode)||cooldown!==null&&(!Number.isInteger(cooldown)||cooldown<30||cooldown>600))throw Error('Invalid sticker configuration.');
        config=commit(i.guild.id,c=>{if(enabled!==null)c.enabled=enabled;if(mode!==null)c.mode=mode;if(cooldown!==null)c.cooldown=cooldown;});content=t(i,'Sticker settings saved.','Sticker-Einstellungen gespeichert.');
      }else if(sub==='assign'){
        const id=i.options.getString('sticker_id');if(!ID.test(String(id)))throw Error('Use the exact sticker ID.');const sticker=await i.guild.stickers.fetch(id,{force:true,cache:false});if(!usable(sticker,i.guild.id))throw Error(t(i,'Choose an available, suitable sticker from this server.','Wähle einen verfügbaren, passenden Sticker von diesem Server.'));await fresh(i,{manager:true});commit(i.guild.id,c=>{c.mappings[mood]=id;});inventories.delete(i.guild.id);content=t(i,'Favorite assigned: ','Lieblingssticker zugewiesen: ')+mood+' → '+sticker.name;
      }else if(sub==='unassign'){commit(i.guild.id,c=>{delete c.mappings[mood];});content=t(i,'Favorite assignment removed.','Lieblingssticker-Zuordnung entfernt.');
      }else if(sub==='test'){const sent=await send(i,mood,{manual:true});content=sent?t(i,'One test sticker was posted in this channel.','Ein Test-Sticker wurde in diesem Kanal gesendet.'):t(i,'No sticker posted: check enabled state, favorites, server stickers, permissions and cooldown. An uncertain send is not retried.','Kein Sticker gesendet: prüfe Aktivierung, Lieblingssticker, Server-Sticker, Rechte und Cooldown. Ein unklarer Versand wird nicht wiederholt.');
      }else if(sub==='list'){const all=(await inventory(i.guild,true)).filter(s=>usable(s,i.guild.id));content=all.length?t(i,'Available server stickers (first 20):\n','Verfügbare Server-Sticker (erste 20):\n')+all.slice(0,20).map(s=>'• '+s.name.slice(0,45)+' — `'+s.id+'`').join('\n'):t(i,'No suitable server stickers found. Upload your cool stickers in Server Settings → Stickers, then use /stickers list.','Keine passenden Server-Sticker gefunden. Lade deine coolen Sticker unter Servereinstellungen → Sticker hoch und nutze dann /stickers list.');
      }else if(sub==='preview'){const chosen=select(await inventory(i.guild,true),config,mood,i.guild.id);if(!chosen)content=t(i,'No matching sticker. Assign a favorite with /stickers assign.','Kein passender Sticker. Weise mit /stickers assign einen Lieblingssticker zu.');else{embed=new EmbedBuilder().setColor(0x5865f2).setTitle(chosen.name.slice(0,100)).setDescription(mood+' · `'+chosen.id+'`');if([1,2,4].includes(chosen.format))embed.setImage((chosen.format===4?'https://media.discordapp.net/':'https://cdn.discordapp.com/')+'stickers/'+chosen.id+(chosen.format===4?'.gif':'.png'));content=t(i,'Private preview; nothing posted in the channel.','Private Vorschau; nichts im Kanal gepostet.');}
      }else if(sub==='status'){content=t(i,'🎨 Chat stickers','🎨 Chat-Sticker')+'\n'+t(i,'Enabled: ','Aktiv: ')+config.enabled+' · '+config.mode+' · '+config.cooldown+'s\n'+Object.entries(config.mappings).map(([m,id])=>m+': `'+id+'`').join('\n')+'\n'+t(i,'Uses this server’s existing stickers after suitable public AI replies. Private reviews and serious questions get no sticker. /stickers list → /stickers assign','Nutzt vorhandene Server-Sticker nach passenden öffentlichen KI-Antworten. Private Prüfungen und ernste Fragen bekommen keinen Sticker. /stickers list → /stickers assign');
      }else throw Error('Unknown sticker command.');
      await i.editReply({content:String(content).slice(0,1900),embeds:embed?[embed]:[],allowedMentions:{parse:[]}});
    }catch(e){const content=t(i,'Sticker request failed: ','Sticker-Anfrage fehlgeschlagen: ')+String(e.message||'Unavailable').slice(0,300);if(i.deferred||i.replied)await i.editReply({content,embeds:[],allowedMentions:{parse:[]}}).catch(()=>{});else await reply(content).catch(()=>{});}
    return true;
  }
  return {afterAnswer,handleInteraction};
}
module.exports={MOODS,moodFor,settings,usable,select,command,createChatStickers};
