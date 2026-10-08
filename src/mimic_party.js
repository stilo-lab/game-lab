'use strict';
const {SlashCommandBuilder,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,PermissionFlagsBits:P,MessageFlags,ChannelType}=require('discord.js');
const {PACKS,createSoundStore}=require('./mimic_sounds');
const {createVoiceAdapter,wait}=require('./mimic_voice');
const {ORIGINALS}=require('./mimic_originals');
const {createNarrator,EVENTS}=require('./mimic_narrator');
const {createQuietLeases}=require('./mimic_quiet');
const {createScorePool}=require('./mimic_workers');
const {createMimicEngine,EFFECTS}=require('./mimic_engine');
const {CATEGORIES,DIFFICULTIES,categoryName,selectionName}=require('./mimic_categories');
const clean=(s,max=60)=>String(s||'Spieler').replace(/[`*_~<>@\r\n]/g,'').slice(0,max);
function buildMimicCommands(){
  return [new SlashCommandBuilder().setName('mimic').setDescription('Mimic Party: Sounds im Voice-Chat nachmachen!').setDMPermission(false)
    .addSubcommand(s=>s.setName('lobby').setDescription('Eine Mimic-Party für 1–5 Spieler eröffnen.')
      .addIntegerOption(o=>o.setName('runden').setDescription('3–15 Runden (Standard: 10)').setMinValue(3).setMaxValue(15))
      .addStringOption(o=>o.setName('pack').setDescription('Welche Sounds wollt ihr nachmachen?').addChoices(...PACKS))
      .addStringOption(o=>o.setName('schwierigkeit').setDescription('Wie schwer sollen die Sounds sein?').addChoices(...DIFFICULTIES))
      .addStringOption(o=>o.setName('modus').setDescription('Mit oder ohne Glücksrad?').addChoices({name:'Chaos mit Sabotagen',value:'chaos'},{name:'Klassisch: nur Nachmachen',value:'classic'}))
      .addBooleanOption(o=>o.setName('replay-ruhe').setDescription('Sprechrechte bei Vorlagen/Replays pausieren (Kanäle verwalten nötig).'))
      .addBooleanOption(o=>o.setName('spielleiter').setDescription('Aufgezeichnete Spielleiter-Ansagen abspielen (Standard: an).')))
    .addSubcommand(s=>s.setName('start').setDescription('Die eigene Lobby starten, sobald alle bereit sind.'))
    .addSubcommand(s=>s.setName('stop').setDescription('Die eigene Party beenden (Host oder Serververwaltung).'))
    .addSubcommand(s=>s.setName('status').setDescription('Aktuelle Lobby und Regeln anzeigen.'))
    .addSubcommand(s=>s.setName('top').setDescription('Mimic-Rangliste dieses Servers anzeigen.'))
    .addSubcommand(s=>s.setName('sounds').setDescription('Sound-Packs und eigene Sound-IDs ansehen.')
      .addStringOption(o=>o.setName('pack').setDescription('Kategorie ansehen; ohne Auswahl eigene Uploads').addChoices(...PACKS))
      .addIntegerOption(o=>o.setName('seite').setDescription('Sound-Liste durchblättern').setMinValue(1).setMaxValue(20)))
    .addSubcommand(s=>s.setName('packs').setDescription('Alle Kategorien mit Sound-Anzahl entdecken.'))
    .addSubcommand(s=>s.setName('originals').setDescription('Kurze Streamer-Originalclips laden und ihre Quellen anzeigen.'))
    .addSubcommand(s=>s.setName('import').setDescription('Einen Originalclip von Myinstants importieren.')
      .addStringOption(o=>o.setName('link').setDescription('Myinstants-Sound-Seite oder deren direkter MP3-Link').setRequired(true).setMaxLength(300))
      .addStringOption(o=>o.setName('name').setDescription('Name des Clips').setMaxLength(60))
      .addStringOption(o=>o.setName('kategorie').setDescription('Clip einsortieren').addChoices(...CATEGORIES.map(({name,value})=>({name,value}))))
      .addStringOption(o=>o.setName('schwierigkeit').setDescription('Schwierigkeit').addChoices(...DIFFICULTIES.filter(d=>d.value!=='mixed')))
      .addNumberOption(o=>o.setName('von').setDescription('Ausschnitt: Start in Sekunden').setMinValue(0).setMaxValue(120))
      .addNumberOption(o=>o.setName('dauer').setDescription('Ausschnitt: 0,4–6 Sekunden, Standard 6').setMinValue(.4).setMaxValue(6)))
    .addSubcommand(s=>s.setName('mic').setDescription('Dein Mikrofon 2,5 Sekunden testen; der Mitschnitt wird sofort gelöscht.'))
    .addSubcommand(s=>s.setName('pause').setDescription('Als Host nach der aktuellen Runde pausieren oder fortsetzen.'))
    .addSubcommand(s=>s.setName('spielleiter').setDescription('Original-Ansagen laden, Status sehen oder vorhören.')
      .addBooleanOption(o=>o.setName('aktiv').setDescription('Spielleiter für diesen Server ein-/ausschalten (Verwaltung).'))
      .addStringOption(o=>o.setName('probe').setDescription('Eine gespeicherte Ansage privat vorhören').addChoices(...EVENTS)))
    .addSubcommand(s=>s.setName('ansage').setDescription('Eigene Originalaufnahme für den Spielleiter hinzufügen (Verwaltung).')
      .addStringOption(o=>o.setName('phase').setDescription('Wann soll die Ansage abgespielt werden?').setRequired(true).addChoices(...EVENTS))
      .addAttachmentOption(o=>o.setName('datei').setDescription('Deine Aufnahme als WAV, MP3 oder OGG bis 2 MB'))
      .addStringOption(o=>o.setName('link').setDescription('Alternativ ein Myinstants-Originalclip').setMaxLength(300))
      .addNumberOption(o=>o.setName('von').setDescription('Ausschnitt: Start in Sekunden').setMinValue(0).setMaxValue(120))
      .addNumberOption(o=>o.setName('dauer').setDescription('Ausschnitt: Länge 0,4–6 Sekunden').setMinValue(.4).setMaxValue(6)))
    .addSubcommand(s=>s.setName('preview').setDescription('Eine Vorlage vorab privat anhören.')
      .addStringOption(o=>o.setName('id').setDescription('Sound-ID aus /mimic sounds').setRequired(true).setMaxLength(40)))
    .addSubcommand(s=>s.setName('upload').setDescription('Eigene Vorlage hinzufügen (Server verwalten nötig).')
      .addAttachmentOption(o=>o.setName('datei').setDescription('WAV, MP3 oder OGG: maximal 2 MB; Vorlage 0,4–6 Sekunden').setRequired(true))
      .addStringOption(o=>o.setName('name').setDescription('Name des Sounds').setRequired(true).setMaxLength(60))
      .addStringOption(o=>o.setName('kategorie').setDescription('Upload in Streamer, Memes, Gaming usw. einsortieren').addChoices(...CATEGORIES.map(({name,value})=>({name,value}))))
      .addStringOption(o=>o.setName('schwierigkeit').setDescription('Wie schwer ist dein Clip?').addChoices(...DIFFICULTIES.filter(d=>d.value!=='mixed')))
      .addNumberOption(o=>o.setName('von').setDescription('Ausschnitt: Start in Sekunden (Standard: 0)').setMinValue(0).setMaxValue(120))
      .addNumberOption(o=>o.setName('dauer').setDescription('Ausschnitt: Länge in Sekunden (0,4–6)').setMinValue(.4).setMaxValue(6)))
    .addSubcommand(s=>s.setName('remove').setDescription('Eigenen Sound entfernen (Server verwalten nötig).')
      .addStringOption(o=>o.setName('id').setDescription('ID aus /mimic sounds').setRequired(true).setMaxLength(24)))
    .addSubcommand(s=>s.setName('diagnose').setDescription('Voice-Abhängigkeiten und offene Sprechrechte prüfen.'))];
}
function panel(s){
  const embed=new EmbedBuilder().setColor(0x8c6cff).setTitle('🎙️ Pixel · Mimic Party')
    .setDescription(clean(s.note,500)).addFields(
      {name:'Voice-Chat',value:`<#${s.voiceChannel.id}>`,inline:true},
      {name:'Runden',value:`${s.round}/${s.rounds} · ${s.mode==='chaos'?'Chaos':'Klassisch'}`,inline:true},
      {name:'Kategorie-Mix',value:selectionName(s.pack),inline:true},
      {name:'Schwierigkeit',value:DIFFICULTIES.find(d=>d.value===(s.difficulty||'mixed'))?.name||'Gemischt',inline:true},
      {name:`Spieler · ${s.players.size}/5`,value:[...s.players.values()].sort((a,b)=>b.total-a.total).map(p=>`${s.phase==='lobby'?(p.ready?'✅':'⌛'):'🎤'} **${clean(p.name)}** · ${p.total} Punkte${p.id===s.host.id?' · Host':''}`).join('\n')||'Keine Spieler'});
  if(s.phase==='lobby')embed.addFields({name:'So geht’s',value:'Mitmachen → **Bereit** → Host startet. Alle hören eine Vorlage und machen sie nach dem Countdown gleichzeitig nach. Ein Versuch pro Runde! Kopfhörer verwenden.'},{name:'Aufnahme',value:'Mit Bereit stimmst du deinem kurzen Mikrofon-Mitschnitt je Runde und dem Replay im Voice-Chat zu. Nur angemeldete Spieler werden im Aufnahmefenster aufgenommen. Die Takes bleiben im RAM und werden nach der Runde gelöscht. Verlassen beendet deine Teilnahme.'},{name:'Replay-Ruhe',value:s.quiet?'Sprechrechte der Spieler werden kurz pausiert. Server-Admins können diese Sperre umgehen.':'Während Vorlagen und Replays bitte ruhig sein.'});
  if(s.phase==='lobby'){
    const votes=new Map();for(const [id,cat]of s.votes||[])if(s.players.has(id))votes.set(cat,(votes.get(cat)||0)+1);
    embed.addFields({name:'🗳️ Wunsch-Kategorien',value:[...votes].sort((a,b)=>b[1]-a[1]).map(([cat,count])=>`${categoryName(cat)} · ${count} Stimme${count===1?'':'n'}`).join('\n')||'Mitspieler stimmen ab; der Host kann die drei beliebtesten Kategorien übernehmen.'});
  }
  if(s.sound&&s.phase!=='lobby')embed.addFields({name:'🎧 Aktuelle Vorlage',value:`${categoryName(s.sound.category||s.sound.pack)} · ${clean(s.sound.name)}${s.sound.difficulty?' · '+(DIFFICULTIES.find(d=>d.value===s.sound.difficulty)?.name||'Normal'):''}`});
  if(s.roundResults.length)embed.addFields({name:`Runde ${s.round}`,value:s.roundResults.map(x=>`**${clean(x.name)}** · ${x.points} Punkte${x.result.status==='no_audio'?' · kein Mikrofon-Signal':` · Melodie ${x.result.melody} / Rhythmus ${x.result.rhythm} / Einsätze ${x.result.attacks}`}`).join('\n').slice(0,1024)});
  if(s.voiceSource==='original')embed.addFields({name:'🎙️ Vorlagen',value:'Originalclips und eigene Uploads. Synthetische Sprachvorlagen sind ausgeschaltet.'});
  if(s.voiceSource==='recordings')embed.addFields({name:'🎙️ Originalaufnahmen',value:'Streamer, Memes, Stimm- und Spielgeräusche aus Aufnahmen. Keine erzeugten Übungstöne oder KI-Sprachvorlagen.'});
  if(s.narration)embed.addFields({name:'🎤 Spielleiter',value:s.narrationStatus?.loaded?`${s.narrationStatus.loaded} gespeicherte Sprachansagen. ${s.narratorError?'Eine Ansage war nicht erreichbar; das Spiel läuft weiter.':'Die gespeicherten Ansagen begleiten die Runden.'}`:'Ansagen noch nicht geladen. /mimic spielleiter laden oder /mimic ansage nutzen; die Runden laufen mit Textansagen.'});
  if(s.pauseRequested&&s.phase!=='paused')embed.addFields({name:'⏸️ Pause vorgemerkt',value:'Die aktuelle Runde läuft zu Ende. Danach bleiben die Mikrofone frei, bis der Host fortsetzt.'});
  if(s.phase==='wheel')embed.addFields({name:'🎡 Glücksrad',value:[...s.cards].map(([id,c])=>`${clean(s.players.get(id)?.name)}: ${c.type==='bonus'?'+15 Punkte':c.type==='double'?'Nächste Runde ×2':c.type==='shield'?'Schild':EFFECTS[c.type]}${EFFECTS[c.type]?' · Ziel über Sabotage wählen':''}`).join('\n').slice(0,1024)});
  embed.setFooter({text:'Pixel Party · lokale Bewertung · ein Versuch pro Runde'});
  const button=(action,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(`mim:${s.token}:${action}`).setLabel(label).setStyle(style);
  const rows=[];
  if(s.phase==='lobby'){
    rows.push(new ActionRowBuilder().addComponents(button('join','Mitmachen',ButtonStyle.Primary),button('ready','Bereit / Zurück'),button('start','Starten',ButtonStyle.Success)));
    const selected=Array.isArray(s.pack)?s.pack:[s.pack];
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mim:${s.token}:packs`).setPlaceholder('Host: 1–5 Kategorien mischen').setMinValues(1).setMaxValues(5)
      .addOptions(...[...CATEGORIES,{name:'📁 Eigene Clips',value:'custom',description:'Alle von deinem Server hochgeladenen Clips.'}].map(c=>({label:c.name,value:c.value,description:c.description,default:selected.includes(c.value)})))));
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mim:${s.token}:difficulty`).setPlaceholder('Host: Schwierigkeit').addOptions(DIFFICULTIES.map(d=>({label:d.name,value:d.value,default:d.value===(s.difficulty||'mixed')})))));
    rows.push(new ActionRowBuilder().addComponents(button('vote','Kategorie wünschen'),button('applyvotes','Stimmen übernehmen'),button('party','Streamer-Meme-Mix',ButtonStyle.Primary),button('catalog','Packs ansehen'),button('originals','Originalclips laden')));
  }
  if(s.phase==='wheel')rows.push(new ActionRowBuilder().addComponents(button('card','Sabotage wählen',ButtonStyle.Primary),button('next','Nächste Runde')));
  if(s.phase!=='ended')rows.push(new ActionRowBuilder().addComponents(button('leave','Verlassen'),button('stop','Beenden',ButtonStyle.Danger),...(s.phase!=='lobby'?[button('pause',s.pauseRequested?'Fortsetzen':'Pause')]:[])));
  else rows.push(new ActionRowBuilder().addComponents(button('rematch','Noch eine Party',ButtonStyle.Success)));
  return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}
function createMimicParty({client,db,saveDB,dataDirectory,isGuildApproved,isMaintenance=()=>false,isVoiceBusy=()=>false,OWNER_ID,voiceFactory=createVoiceAdapter,voiceSource='recordings',soundStoreFactory=createSoundStore,narratorFactory=createNarrator,micDelay=wait}){
  const sounds=soundStoreFactory({db,saveDB,dataDirectory}),quiet=createQuietLeases({client,db,saveDB}),pool=createScorePool(),rematches=new Map(),micTests=new Map();
  const narrator=narratorFactory({db,saveDB,dataDirectory});
  const manager=i=>i.user.id===OWNER_ID||i.memberPermissions?.has(P.ManageGuild);
  const allowed=id=>isGuildApproved(id)&&!isMaintenance();
  const engine=createMimicEngine({sounds,narrator,scorePool:pool,voiceFactory,quietLeases:quiet,db,saveDB,isAllowed:allowed,isExternalBusy:gid=>isVoiceBusy(gid)||micTests.has(gid),onUpdate:async s=>{
    if(s.phase==='ended'){
      for(const [id,entry]of rematches)if(Date.now()-entry.at>15*60000)rematches.delete(id);
      if(rematches.size>=100)rematches.delete(rematches.keys().next().value);
      rematches.set(s.guildId,{at:Date.now(),token:s.token,players:[...s.players.keys()],options:{guildId:s.guildId,voiceChannel:s.voiceChannel,host:s.host,rounds:s.rounds,pack:s.pack,difficulty:s.difficulty,mode:s.mode,quiet:s.quiet,voiceSource:s.voiceSource,narration:s.narration,narrationStatus:s.narrationStatus}});
    }
    if(s.message)await s.message.edit(panel(s));
  }});
  const reply=(i,content)=>i.deferred||i.replied?i.editReply({content,embeds:[],components:[],allowedMentions:{parse:[]}}):i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  function session(i){const s=engine.status(i.guild.id);if(!s)throw Error('Keine Lobby aktiv. Erstelle eine mit /mimic lobby.');return s;}
  function packOverview(gid){
    return '🎉 **Pixel-Soundpacks**\n'+CATEGORIES.map(c=>`${c.name} · **${sounds.list(gid,c.value,'mixed',voiceSource).length}** Sounds\n${c.description}`).join('\n\n')+
      `\n\n📁 Eigene Clips: **${sounds.list(gid,'custom').length}/30**.\n🔥 Streamer-Meme-Mix: Streamer, Memes und Gaming.\n/mimic originals lädt die verlinkten Community-Clips. /mimic upload und /mimic import ergänzen deinen Mix.\nNur Originalaufnahmen und Uploads: keine erzeugten Übungstöne oder KI-Sprachvorlagen.\n/mimic spielleiter lädt die gesprochenen Spielansagen.`;
  }
  async function member(i){return i.guild.members.fetch(i.user.id);}
  async function requireInside(i,s){const m=await member(i);if(m.user.bot||m.voice.channelId!==s.voiceChannel.id)throw Error('Geh zuerst in den Voice-Chat der Lobby.');return m;}
  async function originals(i){
    if(engine.hasSession(i.guild.id)&&engine.status(i.guild.id).phase!=='lobby')throw Error('Clips bitte vor dem Spiel laden.');
    const result=await sounds.prepareOriginals(i.guild.id);
    const rows=result.loaded.map(x=>`✅ **${clean(x.name)}** · \`${x.id}\``),failures=result.failed.map(x=>`⚠️ ${clean(x.name)}: ${clean(x.message,150)}`);
    return reply(i,`🎙️ **Originalclips**\n${rows.join('\n')||'Noch kein Clip geladen.'}\n${failures.join('\n')}\n\nVorhören: /mimic preview id:…\nQuellen: ${ORIGINALS.map(c=>`[${clean(c.name)}](${c.page})`).join(' · ')}\nCommunity-Aufnahmen; die Streamer sind nicht mit Pixel verbunden.`);
  }
  async function narratorCommand(i){
    const gid=i.guild.id,active=i.options.getBoolean('aktiv');
    if(active!==null){if(!manager(i))throw Error('Du brauchst Server verwalten.');narrator.enable(gid,active);}
    const probe=i.options.getString('probe');
    if(engine.hasSession(gid)&&engine.status(gid).phase!=='lobby')throw Error('Ansagen bitte vor der Party laden oder vorhören.');
    const result=await narrator.prepare(gid),state=narrator.status(gid);
    if(probe){const data=await narrator.load(gid,probe);if(!data)throw Error('Für diese Phase fehlt eine Ansage. /mimic ansage hinzufügen.');try{return await i.editReply({content:'🎤 Aufgezeichnete Spielleiter-Ansage',files:[{attachment:require('./mimic_audio').wavEncode(data),name:'spielleiter-'+probe+'.wav'}],allowedMentions:{parse:[]}});}finally{data.fill(0);}}
    return reply(i,`🎤 **Spielleiter ${state.enabled?'an':'aus'}**\n${Object.values(state.clips).map(x=>`✅ ${EVENTS.find(e=>e.value===x.event)?.name}: ${clean(x.name||x.event)}`).join('\n')||'Noch keine Ansage geladen.'}\n${result.failed.map(x=>`⚠️ ${clean(x.name)}: ${clean(x.message,120)}`).join('\n')}\n\nDie Standardstimme sagt Ready, Start, Finish und Congratulations. Eigene deutsche Originalansagen: /mimic ansage phase:… datei:…\nVorhören: /mimic spielleiter probe:…`);
  }
  async function mic(i){
    const gid=i.guild.id;if(engine.hasSession(gid)||micTests.has(gid)||isVoiceBusy(gid))throw Error('Der Mikrofontest braucht einen freien Voice-Platz. Beende die laufende Party zuerst.');
    const m=await member(i),vc=m.voice.channel;if(!vc||vc.type!==ChannelType.GuildVoice)throw Error('Geh zuerst in einen normalen Voice-Chat.');
    if(m.voice.selfMute||m.voice.serverMute||m.voice.selfDeaf||m.voice.serverDeaf||!vc.permissionsFor(m)?.has(P.Speak))throw Error('Aktiviere Mikrofon und Kopfhörer und prüfe deine Sprechrechte zuerst.');
    const me=await i.guild.members.fetchMe({force:true});if(!vc.permissionsFor(me)?.has([P.ViewChannel,P.Connect,P.Speak]))throw Error('Pixel braucht Kanal sehen, Verbinden und Sprechen.');
    const adapter=voiceFactory();if(adapter.busy(gid))throw Error('Der Voice-Platz ist belegt.');
    const entry={abort:new AbortController(),userId:i.user.id,channelId:vc.id,task:null};micTests.set(gid,entry);
    entry.task=(async()=>{
      let connection,takes;const timeout=setTimeout(()=>entry.abort.abort(),15000);timeout.unref?.();
      try{
        await i.editReply({content:'🎤 Mikrofontest: Sag gleich etwas. Pixel nimmt nur dich 2,5 Sekunden auf, zeigt den Pegel und löscht den Mitschnitt sofort.',allowedMentions:{parse:[]}});
        connection=await adapter.connect(vc,entry.abort.signal);await micDelay(2000,entry.abort.signal);
        takes=await connection.capture([i.user.id],2.5);const samples=takes.get(i.user.id)||new Float32Array();let peak=0,total=0;
        for(const x of samples){peak=Math.max(peak,Math.abs(x));total+=x*x;}const rms=Math.sqrt(total/Math.max(1,samples.length));
        const verdict=peak<.005?'Kein Signal. Prüfe Eingabegerät, Stummschaltung und Sprechrechte.':rms<.015?'Sehr leise. Stelle dein Mikrofon etwas lauter.':peak>.97?'Sehr laut. Reduziere den Mikrofonpegel etwas.':'Signal sieht gut aus. Du bist bereit für Mimic Party!';
        return reply(i,`🎤 **Mikrofontest**\n${verdict}\nPegel: ${Math.round(peak*100)}% · durchschnittlich ${Math.round(rms*100)}%.\nDer Mitschnitt wird sofort gelöscht.`);
      }finally{clearTimeout(timeout);entry.abort.abort();for(const data of takes?.values?.()||[])data.fill(0);connection?.close();if(micTests.get(gid)===entry)micTests.delete(gid);}
    })();return entry.task;
  }
  async function start(i,s){
    if(i.user.id!==s.host.id)throw Error('Nur der Host kann starten.');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    for(const p of s.players.values()){
      const m=await i.guild.members.fetch(p.id);
      if(m.voice.channelId!==s.voiceChannel.id)throw Error(`${clean(p.name)} ist nicht mehr im Voice-Chat.`);
      if(m.voice.serverMute||m.voice.selfMute||m.voice.serverDeaf||m.voice.selfDeaf||!s.voiceChannel.permissionsFor(m)?.has(P.Speak))throw Error(`${clean(p.name)} muss Mikrofon und Kopfhörer aktivieren und sprechen dürfen.`);
    }
    const me=await i.guild.members.fetchMe();
    if(!s.voiceChannel.permissionsFor(me)?.has([P.ViewChannel,P.Connect,P.Speak]))throw Error('Pixel braucht Kanal sehen, Verbinden und Sprechen im Voice-Chat.');
    // Test dependencies and reserve Discord’s single connection before starting a round.
    const adapter=voiceFactory();if(adapter.busy(s.guildId)||isVoiceBusy(s.guildId))throw Error('Eine andere Voice-Verbindung läuft. Beende sie zuerst.');
    const task=engine.start(s,i.user.id);void task.catch(error=>console.warn('Mimic Spiel:',error?.message));
    await reply(i,'🎙️ Party startet. Die Aufnahmen beginnen erst nach dem Countdown.');
  }
  async function command(i){
    const sub=i.options.getSubcommand(),gid=i.guild.id;
    if(sub==='lobby'){
      await i.deferReply();
      if(engine.hasSession(gid)||micTests.has(gid)||isVoiceBusy(gid))throw Error('Hier läuft schon eine Voice-Party oder ein Mikrofontest. Beende sie zuerst.');
      const m=await member(i),vc=m.voice.channel;
      if(!vc||vc.type!==ChannelType.GuildVoice)throw Error('Geh zuerst in einen normalen Voice-Chat (kein Stage-Kanal).');
      const quietChoice=i.options.getBoolean('replay-ruhe');
      const me=await i.guild.members.fetchMe({force:true});
      const useQuiet=quietChoice??Boolean(vc.permissionsFor(me)?.has(P.ManageChannels));
      if(useQuiet&&!vc.permissionsFor(me)?.has(P.ManageChannels))throw Error('Pixel braucht Kanäle verwalten für Replay-Ruhe. Deine eigenen Verwaltungsrechte sind dafür nicht nötig.');
      if(Object.values(db.mimic?.quietLeases||{}).some(x=>x.guildId===gid))throw Error('Noch offene Sprechrechte: Ein Admin muss zuerst /mimic diagnose ausführen.');
      const pack=i.options.getString('pack')||'mixed';let loaded,narrationStatus;
      if(['original','recordings'].includes(voiceSource)&&pack!=='custom'){
        await i.editReply({content:'🎙️ Originalclips werden vorbereitet …',allowedMentions:{parse:[]}});loaded=await sounds.prepareOriginals(gid);
      }
      const useNarration=voiceSource!=='all'&&(i.options.getBoolean('spielleiter')??true)&&narrator.status(gid).enabled;
      if(useNarration){await i.editReply({content:'🎤 Spielleiter-Ansagen werden vorbereitet …',allowedMentions:{parse:[]}});const result=await narrator.prepare(gid);narrationStatus={loaded:Object.keys(narrator.status(gid).clips).length,failed:result.failed.length};}
      const s=engine.create({guildId:gid,voiceChannel:vc,host:{id:i.user.id,name:clean(m.displayName)},rounds:i.options.getInteger('runden')||10,pack,difficulty:i.options.getString('schwierigkeit')||'mixed',mode:i.options.getString('modus')||'chaos',quiet:useQuiet,voiceSource,narration:useNarration,narrationStatus});
      if(loaded)s.note=loaded.failed.length?`${loaded.loaded.length} Originalclips geladen; ${loaded.failed.length} Quellen momentan nicht erreichbar. /mimic originals versucht es erneut.`:`${loaded.loaded.length} Originalclips geladen. Bereit zum Mitmachen!`;
      try{s.message=await i.editReply(panel(s));}catch(error){await engine.stop(gid,'Lobby konnte nicht angezeigt werden.');throw error;}return;
    }
    if(sub==='start')return start(i,session(i));
    if(sub==='pause'){const s=session(i);await i.deferReply({flags:MessageFlags.Ephemeral});const paused=engine.pause(s,i.user.id);await reply(i,paused?'Pause nach der aktuellen Runde vorgemerkt.':'Party wird fortgesetzt.');await s.message.edit(panel(s));return;}
    if(sub==='mic'){await i.deferReply({flags:MessageFlags.Ephemeral});return mic(i);}
    if(sub==='originals'){await i.deferReply({flags:MessageFlags.Ephemeral});return originals(i);}
    if(sub==='spielleiter'){await i.deferReply({flags:MessageFlags.Ephemeral});return narratorCommand(i);}
    if(sub==='ansage'){
      if(!manager(i))throw Error('Du brauchst Server verwalten.');
      if(engine.hasSession(gid)&&engine.status(gid).phase!=='lobby')throw Error('Ansagen bitte vor der Party ändern.');
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const clip=await narrator.install(gid,i.options.getString('phase'),{link:i.options.getString('link'),attachment:i.options.getAttachment('datei'),start:i.options.getNumber('von')||0,duration:i.options.getNumber('dauer')??6});
      return reply(i,`✅ Originalansage für **${EVENTS.find(x=>x.value===clip.event)?.name}** gespeichert. /mimic spielleiter probe:${clip.event} zum Vorhören.`);
    }
    if(sub==='import'){
      if(!manager(i))throw Error('Clip-Imports darf nur die Serververwaltung oder der Owner hinzufügen.');if(engine.hasSession(gid)&&engine.status(gid).phase!=='lobby')throw Error('Clips bitte vor dem Spiel importieren.');
      await i.deferReply({flags:MessageFlags.Ephemeral});const sound=await sounds.importOriginal(gid,i.options.getString('name')||'Original-Clip',i.options.getString('link'),{category:i.options.getString('kategorie')||'streamers',difficulty:i.options.getString('schwierigkeit')||'normal',start:i.options.getNumber('von')||0,duration:i.options.getNumber('dauer')??6});
      return reply(i,`✅ **${clean(sound.name)}** importiert. ID: \`${sound.id}\`\nVorhören: /mimic preview id:${sound.id}\nQuelle: ${sound.sourcePage}`);
    }
    if(sub==='stop'){const s=session(i);if(i.user.id!==s.host.id&&!manager(i))throw Error('Nur Host oder Serververwaltung können beenden.');await i.deferReply({flags:MessageFlags.Ephemeral});await engine.stop(gid);return reply(i,'Party beendet; Aufnahmen gelöscht.');}
    if(sub==='status')return i.reply({...panel(session(i)),flags:MessageFlags.Ephemeral});
    if(sub==='top'){
      const players=Object.values(db.mimic?.stats?.[gid]?.players||{}).sort((a,b)=>b.wins-a.wins||b.points-a.points).slice(0,15);
      return reply(i,`🏆 **Mimic-Rangliste**\n${players.map((p,n)=>`${n+1}. **${clean(p.name)}** · ${p.wins} Siege · ${p.games} Spiele · ${p.points} Punkte`).join('\n')||'Noch keine abgeschlossene Party.'}`);
    }
    if(sub==='packs')return reply(i,packOverview(gid));
    if(sub==='sounds'){
      const page=i.options.getInteger('seite')||1,pack=i.options.getString('pack')||'custom',list=sounds.list(gid,pack,'mixed',voiceSource),pages=Math.max(1,Math.ceil(list.length/10));
      return reply(i,`🎧 **${selectionName(pack)}** · ${list.length} Sounds · Seite ${page}/${pages}\n${list.slice((page-1)*10,page*10).map(x=>`\`${x.id}\` · **${clean(x.name)}** · ${Number(x.seconds).toFixed(1)}s · ${x.difficulty||'normal'}`).join('\n')||'Keine Sounds auf dieser Seite.'}\n\nVorhören: /mimic preview id:…\nEigene Clips: /mimic upload kategorie:…`);
    }
    if(sub==='preview'){
      const s=engine.status(gid);if(s&&s.phase!=='lobby')throw Error('Vorhören ist während einer laufenden Party gesperrt.');
      const id=i.options.getString('id'),sound=[...sounds.list(gid,'mixed','mixed',voiceSource),...sounds.list(gid,'custom','mixed',voiceSource)].find(x=>x.id===id);if(!sound)throw Error('Sound-ID nicht gefunden. /mimic sounds zeigt verfügbare IDs.');
      await i.deferReply({flags:MessageFlags.Ephemeral});const data=await sounds.load(gid,sound);
      try{const bytes=require('./mimic_audio').wavEncode(data);return await i.editReply({content:`🎧 **${clean(sound.name)}** · ${categoryName(sound.category||sound.pack)}\n${sound.source==='original-clip'?'Community-Originalclip · Quelle: '+sound.sourcePage:sound.source==='upload'?'Dein Server-Upload':'Eigene Klangvorlage'}`,files:[{attachment:bytes,name:`mimic-${sound.id}.wav`}],allowedMentions:{parse:[]}});}finally{data.fill(0);}
    }
    if(sub==='upload'||sub==='remove'){
      if(!manager(i))throw Error('Du brauchst Server verwalten.');await i.deferReply({flags:MessageFlags.Ephemeral});
      if(sub==='upload'){const sound=await sounds.upload(gid,i.options.getString('name'),i.options.getAttachment('datei'),{category:i.options.getString('kategorie')||'custom',difficulty:i.options.getString('schwierigkeit')||'normal',start:i.options.getNumber('von')||0,duration:i.options.getNumber('dauer')??undefined});return reply(i,`✅ **${clean(sound.name)}** gespeichert in ${categoryName(sound.category)}. Sound-ID: \`${sound.id}\`\nDein Clip erscheint auch in der entsprechenden Kategorie.`);}
      if(engine.hasSession(gid))throw Error('Beende die Party, bevor du einen Sound entfernst.');await sounds.remove(gid,i.options.getString('id'));return reply(i,'Sound entfernt.');
    }
    if(sub==='diagnose'){
      if(!manager(i))throw Error('Du brauchst Server verwalten.');await i.deferReply({flags:MessageFlags.Ephemeral});
      const remaining=engine.hasSession(gid)?Object.values(db.mimic?.quietLeases||{}).filter(x=>x.guildId===gid).length:await quiet.restore(gid);
      let report;try{report=voiceFactory().report();}catch(error){report=error.message;}
      return reply(i,`🩺 **Mimic Voice-Diagnose**\n\`\`\`\n${report.slice(0,1400)}\n\`\`\`\nOffene Sprechrechte: ${remaining}${engine.hasSession(gid)?' (aktive Party)':''}.\nDer Host muss einen normalen Voice-Kanal benutzen. Pixel braucht Verbinden und Sprechen; der Server muss UDP-Verbindungen zulassen.`);
    }
  }
  async function component(i){
    const [prefix,token,action,round]=i.customId.split(':');
    if(action==='rematch'){
      const prior=rematches.get(i.guild.id);if(!prior||prior.token!==token||Date.now()-prior.at>15*60000)throw Error('Diese neue Runde ist abgelaufen. Nutze /mimic lobby.');
      if(!prior.players.includes(i.user.id)&&!manager(i))throw Error('Die nächste Party können Mitspieler oder die Serververwaltung öffnen.');
      const m=await requireInside(i,prior.options);await i.deferReply();
      const next=engine.create({...prior.options,host:{id:i.user.id,name:clean(m.displayName)}});try{next.message=await i.editReply(panel(next));rematches.delete(i.guild.id);}catch(error){await engine.stop(i.guild.id,'Neue Lobby konnte nicht angezeigt werden.');throw error;}return;
    }
    const s=session(i);
    if(prefix!=='mim'||token!==s.token)throw Error('Diese Lobby ist abgelaufen. /mimic status zeigt die aktuelle.');
    if(action==='start')return start(i,s);
    if(action==='stop'){if(i.user.id!==s.host.id&&!manager(i))throw Error('Nur Host oder Serververwaltung können beenden.');await i.deferReply({flags:MessageFlags.Ephemeral});await engine.stop(s.guildId);return reply(i,'Party beendet; Aufnahmen gelöscht.');}
    if(action==='leave'){if(!s.players.has(i.user.id))throw Error('Du bist nicht in der Lobby.');await i.deferReply({flags:MessageFlags.Ephemeral});await engine.leave(s,i.user.id);return reply(i,'Du bist raus. Dein Mitschnitt wird nicht mehr abgespielt.');}
    if(action==='target')await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
    const m=await requireInside(i,s);
    if(action==='pause'){const paused=engine.pause(s,i.user.id);await reply(i,paused?'Pause nach der aktuellen Runde vorgemerkt.':'Party wird fortgesetzt.');await s.message.edit(panel(s));return;}
    if(action==='originals'){await originals(i);await s.message.edit(panel(s));return;}
    if(action==='packs'||action==='difficulty'||action==='party'||action==='applyvotes'){
      if(action==='packs')engine.configure(s,i.user.id,{pack:i.values});
      if(action==='difficulty')engine.configure(s,i.user.id,{difficulty:i.values[0]});
      if(action==='party')engine.configure(s,i.user.id,{pack:'party',difficulty:'mixed'});
      if(action==='applyvotes')engine.applyVotes(s,i.user.id);
      await reply(i,'✅ Mix angepasst. Alle Mitspieler bitte erneut Bereit drücken.');await s.message.edit(panel(s));return;
    }
    if(action==='catalog')return reply(i,packOverview(s.guildId));
    if(action==='vote'){
      if(s.phase!=='lobby'||!s.players.has(i.user.id))throw Error('Tritt zuerst der Lobby bei.');
      return i.editReply({content:'🗳️ Welche Kategorie möchtest du spielen? Eine Stimme pro Mitspieler; du kannst sie ändern.',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mim:${s.token}:ballot`).setPlaceholder('Wunsch-Kategorie').addOptions(CATEGORIES.map(c=>({label:c.name,value:c.value}))))],allowedMentions:{parse:[]}});
    }
    if(action==='ballot'){engine.vote(s,i.user.id,i.values[0]);await reply(i,`Stimme gespeichert: ${categoryName(i.values[0])}`);await s.message.edit(panel(s));return;}
    if(action==='join'){engine.join(s,{id:i.user.id,name:clean(m.displayName)});await reply(i,'Du bist dabei. Lies die Aufnahme-Info und drücke Bereit, um zuzustimmen.');await s.message.edit(panel(s));return;}
    if(action==='ready'){engine.ready(s,i.user.id);await reply(i,s.players.get(i.user.id).ready?'✅ Bereit: kurze Runden-Aufnahme und Replay im Voice-Chat bestätigt.':'Bereit zurückgenommen.');await s.message.edit(panel(s));return;}
    if(action==='next'){engine.next(s,i.user.id);return reply(i,'Nächste Runde!');}
    if(action==='card'){
      const card=s.cards.get(i.user.id);if(s.phase!=='wheel'||!card||card.used||!EFFECTS[card.type])throw Error('Du hast gerade keine offene Sabotage-Karte.');
      const targets=[...s.players.values()].filter(p=>p.id!==i.user.id&&!s.pending.has(p.id));if(!targets.length)throw Error('Kein freies Ziel: Sabotage verfällt diese Runde.');
      return i.editReply({content:`${EFFECTS[card.type]}: Wähle das Ziel für die nächste Aufnahme.`,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mim:${s.token}:target:${s.round}`).setPlaceholder('Ziel auswählen').addOptions(targets.map(p=>({label:clean(p.name),value:p.id}))))],allowedMentions:{parse:[]}});
    }
    if(action==='target'){engine.attack(s,i.user.id,i.values[0],Number(round));return i.editReply({content:'Sabotage gesetzt! Beim Replay wird aufgedeckt, wer dahintersteckt.',components:[]});}
    throw Error('Unbekannte Spielaktion.');
  }
  async function handleInteraction(i){
    if(!(i.isChatInputCommand?.()&&i.commandName==='mimic')&&!i.customId?.startsWith('mim:'))return false;
    try{
      if(!i.guild||!isGuildApproved(i.guild.id))throw Error('Mimic ist hier nicht freigeschaltet.');
      // Leaving/stopping remain possible during maintenance, so consent can always be revoked.
      const safe=i.commandName==='mimic'&&['stop','diagnose'].includes(i.options?.getSubcommand?.())||['leave','stop'].includes(i.customId?.split(':')[2]);
      if(isMaintenance()&&!safe)throw Error('Pixel ist gerade im Wartungsmodus.');
      if(i.isChatInputCommand?.())await command(i);else await component(i);
    }catch(error){await reply(i,`❌ ${clean(error.message,250)}`).catch(()=>{});}
    return true;
  }
  async function handleVoiceState(oldState,newState){
    const gid=newState.guild?.id||oldState.guild?.id,test=micTests.get(gid),s=engine.status(gid);
    if(test&&(newState.id===test.userId||newState.id===client.user?.id)&&oldState.channelId===test.channelId&&newState.channelId!==test.channelId)test.abort.abort();
    if(!s)return;
    if(newState.id===client.user?.id&&oldState.channelId===s.voiceChannel.id&&newState.channelId!==s.voiceChannel.id)return engine.stop(gid,'Pixel wurde aus dem Voice-Chat getrennt.');
    if(s.players.has(newState.id)&&oldState.channelId===s.voiceChannel.id&&newState.channelId!==s.voiceChannel.id)await engine.leave(s,newState.id);
  }
  async function shutdown(){for(const test of micTests.values())test.abort.abort();await Promise.allSettled([...micTests.values()].map(t=>t.task));rematches.clear();await engine.shutdown();}
  return {handleInteraction,handleVoiceState,hasSession:id=>engine.hasSession(id)||micTests.has(id),onReady:()=>quiet.restore(),onShutdown:shutdown};
}
module.exports={buildMimicCommands,createMimicParty,panel};
