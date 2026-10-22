'use strict';
const {randomBytes}=require('node:crypto');
const {SlashCommandBuilder,ChannelType,PermissionFlagsBits:P,MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle,escapeMarkdown}=require('discord.js');
const {createSource,input}=require('./music_source');
const {createVoice}=require('./music_voice');
function buildMusicCommands(){
  return [new SlashCommandBuilder().setName('music').setDescription('YouTube-Musik direkt im Discord-Sprachkanal')
    .addSubcommand(s=>s.setName('play').setDescription('YouTube-Titel im eigenen VC abspielen oder einreihen').addStringOption(o=>o.setName('titel').setDescription('YouTube-Link oder Suchbegriff').setRequired(true).setMaxLength(200)))
    .addSubcommand(s=>s.setName('queue').setDescription('Aktuellen Titel und Warteschlange anzeigen'))
    .addSubcommand(s=>s.setName('pause').setDescription('Wiedergabe pausieren'))
    .addSubcommand(s=>s.setName('resume').setDescription('Wiedergabe fortsetzen'))
    .addSubcommand(s=>s.setName('skip').setDescription('Aktuellen Titel überspringen'))
    .addSubcommand(s=>s.setName('stop').setDescription('Musik beenden, Warteschlange leeren und VC verlassen'))
    .addSubcommand(s=>s.setName('volume').setDescription('Lautstärke für den VC ändern').addIntegerOption(o=>o.setName('prozent').setDescription('0 bis 100 Prozent').setRequired(true).setMinValue(0).setMaxValue(100)))
    .addSubcommand(s=>s.setName('diagnose').setDescription('YouTube-Abrufdienst und Audio-Voraussetzungen prüfen'))];
}
const duration=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const fail=message=>Object.assign(Error(message),{code:'MUSIC_USER'});
function createVCMusic({client,isGuildApproved=()=>true,isMaintenance=()=>false,isVoiceBusy=()=>false,source=createSource(),voice=createVoice(),idleMs=30000,emptyMs=30000,timers={setTimeout,clearTimeout}}={}){
  const sessions=new Map(),requests=new Map();let shuttingDown=false;
  const wake=s=>{s.wake?.();s.wake=null;};
  function stop(s){
    if(!s||s.closed)return;s.closed=true;
    timers.clearTimeout(s.idleTimer);timers.clearTimeout(s.emptyTimer);
    s.abort.abort();for(const job of s.queue)job.abort.abort();s.current?.abort.abort();s.queue=[];
    try{s.stream?.close();}catch{}try{s.connection?.close();}catch{}
    wake(s);if(sessions.get(s.guildId)===s)sessions.delete(s.guildId);
  }
  function armIdle(s){
    if(s.closed||s.current||s.queue.length||s.idleTimer)return;
    s.idleTimer=timers.setTimeout(()=>{s.idleTimer=null;if(!s.current&&!s.queue.length)stop(s);},idleMs);s.idleTimer?.unref?.();
  }
  function rows(s){return [new ActionRowBuilder().addComponents(
    ...[['pause','Pause',ButtonStyle.Secondary],['resume','Weiter',ButtonStyle.Success],['skip','Überspringen',ButtonStyle.Primary],['stop','Stopp',ButtonStyle.Danger]].map(([action,label,style])=>new ButtonBuilder().setCustomId(`vc_music:${s.token}:${action}`).setLabel(label).setStyle(style)))];}
  async function announce(s,content,controls=false){
    if(s.closed)return;
    try{await s.textChannel?.send({content,allowedMentions:{parse:[]},components:controls?rows(s):[]});}catch{}
  }
  async function run(s){
    if(s.running)return;s.running=true;
    try{
      while(!s.closed){
        if(!s.queue.length||s.queue[0].status==='loading'){
          armIdle(s);await new Promise(resolve=>{s.wake=resolve;});continue;
        }
        const job=s.queue.shift();s.current=job;timers.clearTimeout(s.idleTimer);s.idleTimer=null;
        try{
          if(!s.connection)s.connection=await voice.connect(s.channel,s.abort.signal);
          if(s.closed){s.connection.close();continue;}
          if(job.abort.signal.aborted)continue;
          s.stream=source.stream(job.track,AbortSignal.any([s.abort.signal,job.abort.signal]));
          await s.connection.play(s.stream.pcm,job.abort.signal,s.volume,()=>{
            s.failures=0;
            void announce(s,`🎵 **Jetzt im VC:** ${escapeMarkdown(job.track.title)} (${duration(job.track.duration)})\n${job.track.url}`,true);
          });
        }catch(error){
          if(!s.closed&&!job.abort.signal.aborted){
            s.failures++;
            await announce(s,`❌ ${publicError(error)}`);
            if(!s.connection||s.connection.closed||s.failures>=3)stop(s);
          }
        }finally{
          try{s.stream?.close();}catch{}s.stream=null;if(s.current===job)s.current=null;s.paused=false;
        }
      }
    }catch{stop(s);}finally{s.running=false;}
  }
  function publicError(error){return /^MUSIC_/.test(error?.code||'')?String(error.message).slice(0,550):'Die Voice-Wiedergabe ist fehlgeschlagen. Prüfe die VC-Rechte des Bots und /music diagnose.';}
  function throttle(userId){
    const now=Date.now();let times=(requests.get(userId)||[]).filter(t=>now-t<10000);
    if(times.length>=3)throw fail('Bitte kurz warten: höchstens drei Musikanfragen in zehn Sekunden.');
    times.push(now);requests.delete(userId);requests.set(userId,times);
    if(requests.size>2000)requests.delete(requests.keys().next().value);
  }
  async function member(i){
    try{return await i.guild.members.fetch({user:i.user.id,force:true});}catch{throw fail('Deine aktuellen Server- und Voice-Rechte konnten nicht geprüft werden.');}
  }
  async function enqueue(i){
    if(shuttingDown||isMaintenance())throw fail('Musik ist während Wartung oder Neustart vorübergehend gesperrt.');
    const query=i.options.getString('titel',true);input(query);throttle(i.user.id);
    const m=await member(i),channel=m.voice?.channel;
    if(!channel||channel.type!==ChannelType.GuildVoice)throw fail('Geh zuerst in einen normalen Sprachkanal und nutze dann /music play.');
    let me;try{me=await i.guild.members.fetchMe({force:true});}catch{throw fail('Die Voice-Rechte des Bots konnten nicht geprüft werden.');}
    if(!channel.permissionsFor(me)?.has([P.ViewChannel,P.Connect,P.Speak])||me.voice?.serverMute)throw fail('Pixel braucht im VC Kanal anzeigen, Verbinden und Sprechen und darf nicht serverweit stummgeschaltet sein.');
    if(shuttingDown||isMaintenance()||!isGuildApproved(i.guild.id))throw fail('Die Musik kann gerade nicht gestartet werden.');
    let s=sessions.get(i.guild.id);
    if(s&&s.channel.id!==channel.id)throw fail('Pixel spielt schon in einem anderen VC. Geh in denselben Sprachkanal oder beende die Musik dort.');
    if(!s){
      if(isVoiceBusy(i.guild.id)||voice.busy(i.guild.id))throw fail('Eine andere Voice-Party läuft. Beende sie zuerst, bevor du Musik startest.');
      if(sessions.size>=5)throw fail('Gerade laufen bereits fünf Musikrunden. Bitte später erneut versuchen.');
      s={guildId:i.guild.id,channel,textChannel:i.channel,hostId:i.user.id,token:randomBytes(12).toString('hex'),abort:new AbortController(),queue:[],current:null,connection:null,stream:null,closed:false,running:false,volume:50,paused:false,failures:0,idleTimer:null,emptyTimer:null};
      sessions.set(s.guildId,s);
    }
    if(s.queue.length+(s.current?1:0)>=20)throw fail('Die Warteschlange ist voll (höchstens 20 Titel einschließlich laufendem Titel).');
    if(s.queue.filter(j=>j.status==='loading').length>=3)throw fail('Drei Titel werden gerade gesucht. Warte kurz auf die Ergebnisse.');
    const job={status:'loading',abort:new AbortController(),track:null};s.queue.push(job);timers.clearTimeout(s.idleTimer);s.idleTimer=null;void run(s);
    try{
      job.track=await source.resolve(query,AbortSignal.any([s.abort.signal,job.abort.signal]));
      if(s.closed||job.abort.signal.aborted)throw fail('Dieser Musikauftrag wurde beendet.');
      job.status='ready';wake(s);
      return `✅ **${escapeMarkdown(job.track.title)}** ist eingereiht. Der Ton läuft direkt im VC, sobald der Titel an der Reihe ist.`;
    }catch(error){
      s.queue=s.queue.filter(j=>j!==job);job.abort.abort();wake(s);
      if(!s.current&&!s.queue.length)stop(s);
      throw error;
    }
  }
  function queueText(s){
    if(!s)return 'Gerade läuft keine VC-Musik. Geh in einen Sprachkanal und nutze /music play.';
    const current=s.current?`${s.paused?'⏸️':'🎵'} ${escapeMarkdown(s.current.track.title)}`:'Noch kein laufender Titel.';
    const entries=s.queue.slice(0,10).map((j,n)=>`${n+1}. ${j.track?escapeMarkdown(j.track.title):'Titel wird gesucht …'}`);
    return `${current}\nLautstärke: ${s.volume}%\n${entries.length?'**Als Nächstes:**\n'+entries.join('\n'):'Warteschlange leer.'}${s.queue.length>10?`\n… und ${s.queue.length-10} weitere Titel.`:''}`.slice(0,1950);
  }
  async function control(i,action,token){
    const m=await member(i),s=sessions.get(i.guild.id);
    if(!s||token&&token!==s.token)throw fail('Diese Musikrunde ist bereits beendet. Starte bei Bedarf /music play.');
    const manager=m.permissions?.has(P.ManageGuild)||m.permissions?.has(P.Administrator);
    if(m.voice?.channelId!==s.channel.id&&!(action==='stop'&&(manager||s.hostId===i.user.id)))throw fail('Du musst zur Steuerung im selben VC wie Pixel sein.');
    if(action==='stop'){stop(s);return '⏹️ Musik beendet, Warteschlange geleert und VC verlassen.';}
    if(action==='skip'){
      if(s.current)s.current.abort.abort();else{const first=s.queue.shift();if(!first)throw fail('Es gibt keinen Titel zum Überspringen.');first.abort.abort();wake(s);}
      return '⏭️ Titel übersprungen.';
    }
    if(!s.current||!s.connection)throw fail('Es wird gerade noch kein Titel abgespielt.');
    if(action==='pause'){if(!s.paused&&!s.connection.pause())throw fail('Der Titel wird gerade noch geladen. Bitte kurz warten.');s.paused=true;return '⏸️ Musik pausiert.';}
    if(action==='resume'){if(s.paused&&!s.connection.resume())throw fail('Die Wiedergabe konnte nicht fortgesetzt werden.');s.paused=false;return '▶️ Musik läuft weiter.';}
    if(action==='volume'){
      const level=i.options.getInteger('prozent',true);if(!Number.isInteger(level)||level<0||level>100)throw fail('Die Lautstärke muss zwischen 0 und 100 liegen.');
      s.volume=level;s.connection.volume(level);return `🔊 Lautstärke: ${level}%.`;
    }
    throw fail('Unbekannte Musiksteuerung.');
  }
  async function handleInteraction(i){
    const command=i.isChatInputCommand?.()&&i.commandName==='music',button=i.isButton?.()&&i.customId?.startsWith('vc_music:');
    if(!command&&!button)return false;
    const reply=async content=>{const payload={content,allowedMentions:{parse:[]}};if(i.deferred||i.replied)return i.editReply(payload);return i.reply({...payload,flags:MessageFlags.Ephemeral});};
    try{
      if(!i.guild||!isGuildApproved(i.guild.id)){await reply('Musik ist auf diesem Server nicht freigeschaltet.');return true;}
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const parts=button?i.customId.split(':'):null,action=button?parts[2]:i.options.getSubcommand();
      if(button&&(!/^[a-f0-9]{24}$/.test(parts[1]||'')||parts.length!==3||!['pause','resume','skip','stop'].includes(action)))throw fail('Dieser Musik-Button ist ungültig.');
      let content;
      if(action==='play')content=await enqueue(i);
      else if(action==='queue')content=queueText(sessions.get(i.guild.id));
      else if(action==='diagnose'){
        const r=source.report();content=`**VC-Musik-Diagnose**\nYouTube-Abrufdienst: ${r.youtubeTool?'bereit':'fehlt – npm run music:setup ausführen'}\nFFmpeg: ${r.ffmpeg?'bereit':'fehlt – ffmpeg-static installieren oder FFMPEG_PATH setzen'}\n${queueText(sessions.get(i.guild.id))}\nYouTube kann Abrufe vom Hosting-Anbieter blockieren. Spotify-Anmeldung ist für /music nicht erforderlich.`;
      }else content=await control(i,action,parts?.[1]);
      await reply(content);
    }catch(error){try{await reply('❌ '+publicError(error));}catch{}}
    return true;
  }
  async function handleVoiceState(oldState,newState){
    const guild=newState.guild||oldState.guild,s=sessions.get(guild?.id);if(!s)return;
    if(newState.id===client.user.id&&oldState.channelId===s.channel.id&&newState.channelId!==s.channel.id){stop(s);return;}
    const channel=guild.channels.cache.get(s.channel.id);
    const empty=()=>!guild.channels.cache.get(s.channel.id)?.members?.some(m=>!m.user.bot);
    if(!channel){stop(s);return;}
    if(!empty()){timers.clearTimeout(s.emptyTimer);s.emptyTimer=null;return;}
    if(!s.emptyTimer){s.emptyTimer=timers.setTimeout(()=>{s.emptyTimer=null;if(empty())stop(s);},emptyMs);s.emptyTimer?.unref?.();}
  }
  return {handleInteraction,handleVoiceState,isActiveOrStarting:guildId=>sessions.has(guildId),onShutdown(){shuttingDown=true;for(const s of sessions.values())stop(s);requests.clear();}};
}
module.exports={buildMusicCommands,createVCMusic};
