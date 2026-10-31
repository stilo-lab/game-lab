'use strict';
const { EmbedBuilder, MessageFlags, PermissionsBitField, GatewayIntentBits } = require('discord.js');
const runtime = require('./bot_runtime'), locale = require('./localization');
const F = PermissionsBitField.Flags;
function missingPermissions(permissions, checks) { return checks.filter(([flag]) => !permissions?.has?.(flag)).map(([, label]) => label); }
function buildReport({ guild, channel, member, data = {}, staffChannels = {}, purposes = [], aiConfigured = false,
  aiStatus = {}, maintenance = false, systems = {}, channelsComplete = false, channelSnapshot = null, partial = false,
  details = null, language = locale.languageFor(guild?.id) }) {
  const de = language === 'de', t = (en, german) => de ? german : en, fields = [], issues = [];
  const channels = channelSnapshot || guild.channels.cache, here = member ? channel?.permissionsFor?.(member) : null;
  const checks = [[F.ViewChannel,t('View Channel','Kanal ansehen')],[F.SendMessages,t('Send Messages','Nachrichten senden')],
    [F.EmbedLinks,t('Embed Links','Links einbetten')],[F.AttachFiles,t('Attach Files','Dateien anhängen')],[F.ReadMessageHistory,t('Read Message History','Nachrichtenverlauf lesen')]];
  const missingHere = missingPermissions(here, checks);
  fields.push({name:t('💬 This channel','💬 Rechte in diesem Kanal'),value:!member || !here ? t('⚠️ Bot permissions could not be checked.','⚠️ Bot-Rechte konnten nicht geprüft werden.') : missingHere.length
    ? t('⚠️ Missing: ','⚠️ Fehlt: ')+missingHere.join(', ') : t('✅ Messages, embeds, files and history available.','✅ Nachrichten, Bilder und Verlauf verfügbar.')});
  if(here && missingHere.length) issues.push(t('Allow these permissions for Pixel in this channel: ','Erlaube der Pixel-Rolle in diesem Kanal: ')+missingHere.join(', ')+'.');
  const setupMissing=missingPermissions(member?.permissions,[[F.ManageChannels,t('Manage Channels','Kanäle verwalten')],[F.ManageRoles,t('Manage Roles','Rollen verwalten')]]);
  fields.push({name:t('🛠️ Server setup','🛠️ Server-Setup'),value:!member?t('⚠️ Permissions unknown.','⚠️ Rechte unbekannt.'):setupMissing.length
    ?t('⚠️ Pixel needs: ','⚠️ Der Bot braucht: ')+setupMissing.join(', ')+t('. Target roles must also be below Pixel.','. Rollen müssen außerdem unter seiner höchsten Rolle liegen.')
    :t('✅ Channel/role permissions present. Target hierarchy is checked for each action.','✅ Bot-Rechte für Kanäle und Rollen vorhanden. Die Rollen-Hierarchie wird beim Auftrag geprüft.')});
  if(member && setupMissing.length) issues.push(t('Allow the required bot permissions: ','Erlaube der Pixel-Rolle ')+setupMissing.join(t(' and ',' und '))+'.');
  let configured=0,valid=0,missing=0,inaccessible=0,unknown=0;
  const countingIds=runtime.bindingIds(data,'counting',staffChannels);
  for(const purpose of purposes){const ids=runtime.bindingIds(data,purpose,staffChannels);if(!ids.length)continue;configured++;
    const found=ids.map(id=>channels.get(id)).filter(Boolean),target=found.find(ch=>runtime.validBinding(ch,guild,purpose));
    if(target){const permissions=member&&target.permissionsFor?.(member);if(!permissions)unknown++;else if(permissions.has(F.ViewChannel)&&permissions.has(F.SendMessages))valid++;else inaccessible++;}
    else if(found.length||channelsComplete)missing++;else unknown++;
  }
  fields.push({name:t('📁 Saved channel mappings','📁 Gespeicherte Kanal-Zuordnungen'),value:configured
    ?t(`${valid}/${configured} usable · ${missing} missing or unsuitable · ${inaccessible} inaccessible · ${unknown} unchecked.`,`${valid}/${configured} nutzbar · ${missing} nicht gefunden oder ungeeignet · ${inaccessible} ohne Bot-Zugriff · ${unknown} ungeprüft.`)
    :t('No mappings saved. Use /setup or /serversetup.','Noch keine Zuordnungen gespeichert. Nutze /setup oder /serversetup.')});
  if(missing||inaccessible)issues.push(t('Use /setup to check mappings, or /setupmap set for a specific function.','Nutze /setup zum Prüfen der Zuordnungen oder /setupmap set für eine einzelne Funktion.'));
  const counting=countingIds.map(id=>channels.get(id)).find(ch=>runtime.validBinding(ch,guild,'counting'));
  if(!countingIds.length)fields.push({name:'🔢 Counting',value:t('Not configured. Select a counting channel with /setup.','Noch nicht eingerichtet. Mit /setup einen Counting-Kanal zuordnen.')});
  else if(!counting)fields.push({name:'🔢 Counting',value:channelsComplete?t('⚠️ Saved channel missing or unsuitable. Check /setupmap set.','⚠️ Gespeicherter Kanal nicht gefunden oder ungeeignet. Prüfe /setupmap set.'):t('⚠️ Channel could not be confirmed. Check /setup.','⚠️ Kanal konnte nicht bestätigt werden. Prüfe /setup.')});
  else {const permissions=member&&counting.permissionsFor?.(member),needed=missingPermissions(permissions,[[F.ViewChannel,t('View Channel','Kanal ansehen')],[F.SendMessages,t('Send Messages','Nachrichten senden')],[F.AddReactions,t('Add Reactions','Reaktionen hinzufügen')],[F.ReadMessageHistory,t('Read Message History','Nachrichtenverlauf lesen')]]);
    fields.push({name:'🔢 Counting',value:!permissions?t('⚠️ Counting permissions unknown.','⚠️ Bot-Rechte im Counting-Kanal unbekannt.'):needed.length?t('⚠️ Missing: ','⚠️ Fehlt: ')+needed.join(', '):t('✅ Mapped and permissions present. The count is stored persistently.','✅ Zugeordnet und Bot-Rechte vorhanden. Der Zähler wird dauerhaft gespeichert.')});
    if(permissions&&needed.length)issues.push(t('Allow these permissions in the counting channel: ','Erlaube der Pixel-Rolle im Counting-Kanal: ')+needed.join(', ')+'.');}
  fields.push({name:t('🤖 AI and support','🤖 AI und Support'),value:!aiConfigured
    ?t('🧩 Local offline help is available without a model connection. It supports bot guides, saved knowledge, calculations and supported action previews. GEMINI_API_KEY is optional for broader model answers. No live model test was made.','🧩 Lokale Offline-Hilfe ist ohne Modellverbindung verfügbar: Bot-Anleitungen, gespeichertes Wissen, Rechnungen und unterstützte Aktionsvorschauen. GEMINI_API_KEY ist optional für freie Modellantworten. Kein Live-Modelltest ausgeführt.')
    :aiStatus.closed?t('⏳ The AI scheduler is shutting down.','⏳ Die AI-Warteschlange beendet gerade ihre Arbeit.')
    :t('✅ Model connection configured; availability/quotas were not tested.','✅ Modellverbindung eingerichtet; Erreichbarkeit/Limits wurden nicht getestet.')+(aiStatus.active||aiStatus.queued?t(' Requests are being processed.',' Anfragen werden verarbeitet.'):'')});
  fields.push({name:t('⚙️ AI switches','⚙️ AI-Schalter'),value:t('Chat: ','Chat: ')+(data.settings?.aiEnabled===false?t('off','aus'):t('on','an'))+' · '+t('Ticket AI: ','Ticket-AI: ')+(data.settings?.supportAiEnabled===false?t('off','aus'):t('on','an'))+t('. Local help still has limits; no live prices or unseen channel contents.','. Lokale Hilfe hat Grenzen; keine Live-Preise oder ungelesenen Kanalinhalte.')});
  fields.push({name:t('🎙️ Voice and uploads','🎙️ Voice und Uploads'),value:[systems.mimicAvailable?t('Mimic loaded.','Mimic geladen.'):t('Mimic module not loaded.','Mimic-Modul nicht geladen.'),
    systems.musicAvailable===undefined?'':systems.musicAvailable?t('Voice music loaded.','Voice-Musik geladen.'):t('Voice music not loaded.','Voice-Musik nicht geladen.'),
    systems.uploadsAvailable?t('YouTube monitor loaded.','YouTube-Monitor geladen.'):t('YouTube monitor not loaded.','YouTube-Monitor nicht geladen.'),
    t('For sound use /music diagnose or /mimic diagnose. Loading a module does not verify its external source. Spotify Connect controls Spotify playback.','Für Ton: /music diagnose oder /mimic diagnose. Geladene Module bestätigen keine externe Erreichbarkeit. Spotify Connect steuert Spotify-Wiedergabe.')].filter(Boolean).join('\n')});
  if(systems.voiceChannel&&member){const needed=missingPermissions(systems.voiceChannel.permissionsFor?.(member),[[F.ViewChannel,t('View Channel','Kanal ansehen')],[F.Connect,t('Connect','Verbinden')],[F.Speak,t('Speak','Sprechen')]]);if(needed.length)issues.push(t('In your Voice channel Pixel needs: ','In deinem Voice-Kanal fehlen Pixel: ')+needed.join(', ')+'.');}
  if(details){
    if(details.security){const s=details.security;fields.push({name:t('🛡️ Effective protection','🛡️ Wirksamer Schutz'),value:t(`People: ${s.humanEnabled?'on':'off'} · ${s.humanLimit}/${s.humanWindow}s. Bots: ${s.botEnabled?'on':'off'} · ${s.botLimit}/${s.botWindow}s.`, `Menschen: ${s.humanEnabled?'an':'aus'} · ${s.humanLimit}/${s.humanWindow}s. Bots: ${s.botEnabled?'an':'aus'} · ${s.botLimit}/${s.botWindow}s.`)+t(' Owner/admin/trust exceptions and hierarchy still apply.',' Owner-/Admin-/Vertrauensausnahmen und Hierarchie gelten weiterhin.')});if(!s.humanEnabled||!s.botEnabled)issues.push(t('At least one protection switch is off. Review /security status, /botsecurity status and /settings.','Mindestens ein Schutzschalter ist aus. Prüfe /security status, /botsecurity status und /settings.'));}
    if(details.intents)fields.push({name:t('🔌 Requested intents','🔌 Angeforderte Intents'),value:t(`Members: ${details.intents.members?'requested':'not requested'} · Message Content: ${details.intents.content?'requested':'not requested'}. The Developer Portal allowance is not verified here.`,`Mitglieder: ${details.intents.members?'angefordert':'nicht angefordert'} · Nachrichteninhalt: ${details.intents.content?'angefordert':'nicht angefordert'}. Die Freigabe im Developer Portal wurde hier nicht geprüft.`)});
    if(details.workflows)fields.push({name:t('🎫 Community workflows','🎫 Community-Abläufe'),value:t(`Open tickets: ${details.workflows.tickets} · active giveaways: ${details.workflows.giveaways} · pending giveaway displays: ${details.workflows.displays}.`,`Offene Tickets: ${details.workflows.tickets} · aktive Giveaways: ${details.workflows.giveaways} · offene Giveaway-Anzeigen: ${details.workflows.displays}.`)});
    if(details.jobs)fields.push({name:t('⏱️ Background jobs','⏱️ Hintergrundaufgaben'),value:t(`${details.jobs.running}/${details.jobs.total} currently running · ${details.jobs.failures} failures recorded since startup. Inspect host logs if failures persist.`,`${details.jobs.running}/${details.jobs.total} laufen gerade · ${details.jobs.failures} Fehler seit Start aufgezeichnet. Bei wiederholten Fehlern Host-Logs prüfen.`)});
    if(details.errors)fields.push({name:t('🧾 Recent command errors','🧾 Letzte Befehlsfehler'),value:t(`${details.errors.count} retained errors in the last 24 hours since this process started. Reference: ${details.errors.lastReference||'none'}. No message text is stored in this summary.`,`${details.errors.count} gespeicherte Fehler der letzten 24 Stunden seit diesem Prozessstart. Referenz: ${details.errors.lastReference||'keine'}. Diese Übersicht speichert keine Nachrichtentexte.`)});
    if(details.backups){const b=details.backups;fields.push({name:t('💾 Owner recovery status','💾 Owner-Wiederherstellungsstatus'),value:b.unavailable?t('⚠️ Backup journal could not be read. Preserve files and inspect /backup status.','⚠️ Backup-Journal konnte nicht gelesen werden. Dateien aufbewahren und /backup status prüfen.'):
      t(`Retained snapshots: ${b.count}. Automatic: ${b.auto?'on':'off'}. Restore: ${b.restore}. Recovery invitations: ${b.invites}.`,`Snapshots: ${b.count}. Automatik: ${b.auto?'an':'aus'}. Restore: ${b.restore}. Wiederherstellungs-Einladungen: ${b.invites}.`)
      +(b.overdue?t(' Latest automatic snapshot is overdue or none is saved yet.',' Letztes automatisches Backup überfällig oder noch keines gespeichert.'):'')
      +t(' A persistent host volume is required; this report cannot prove persistence.',' Ein dauerhaftes Host-Volume ist nötig; diese Prüfung bestätigt keine Dauerhaftigkeit.')});if(b.unavailable||b.pending||b.overdue)issues.push(t('Review /backup status before starting another restoration or delivery.','Prüfe /backup status vor einer weiteren Wiederherstellung oder Zustellung.'));}
  }
  if(maintenance)issues.unshift(t('Maintenance is active. The bot owner can end it in the owner panel.','Der Wartungsmodus ist aktiv. Der Bot-Owner kann ihn im Owner-Panel beenden.'));
  if(unknown||partial)issues.push(t('Some Discord data could not be checked freshly. Run /diagnose again later.','Ein Teil der Discord-Daten konnte nicht aktuell geprüft werden. Starte /diagnose später erneut.'));
  fields.push({name:t('➡️ Next step','➡️ Nächster Schritt'),value:issues.length?issues.slice(0,4).map(x=>'• '+x).join('\n'):t('No issue found in these checks. For a failing action, share its command, error reference and observed result.','Keine Auffälligkeit in diesen Prüfungen. Nenne bei einer fehlgeschlagenen Aktion Befehl, Fehlerreferenz und beobachtetes Ergebnis.')});
  // Keep both per-field and total embed limits, even for many bad mappings.
  let budget=5200;const bounded=[];for(const f of fields.slice(0,24)){const name=f.name.slice(0,200);if(budget<=name.length)break;const value=f.value.slice(0,Math.min(900,budget-name.length));budget-=name.length+value.length;bounded.push({name,value});}
  return new EmbedBuilder().setTitle(t('🩺 Pixel • Diagnosis','🩺 Pixel • Diagnose')).setColor(issues.length||missing||inaccessible||!member?0xF5B041:0x58D68D)
    .setDescription(t('Private, read-only checks. Permissions, channels and settings are not changed. Advanced details are limited to current managers; backup details to the configured bot owner.','Private Prüfung ohne Änderungen an Rechten, Kanälen oder Einstellungen. Erweiterte Angaben nur für aktuelle Verwalter; Backup-Angaben nur für den konfigurierten Bot-Owner.')).addFields(bounded).setTimestamp();
}
async function within(promise, ms=8000){let timer;try{return await Promise.race([Promise.resolve(promise),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]);}catch{return null;}finally{clearTimeout(timer);}}
async function diagnose(interaction,options={}){
  const language=options.language||locale.languageFor(interaction.guild?.id);
  if(!interaction.guild)return interaction.reply({content:language==='de'?'Nutze /diagnose bitte auf deinem Server.':'Use /diagnose in your server.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});const guild=interaction.guild;
  const [freshMember,freshChannels,freshRoles,actor]=await Promise.all([
    within(Promise.resolve().then(()=>guild.members.fetchMe({force:true}))),within(Promise.resolve().then(()=>guild.channels.fetch())),
    guild.roles?.fetch?within(Promise.resolve().then(()=>guild.roles.fetch())):Promise.resolve(null),
    options.readDetails&&interaction.user?.id?within(Promise.resolve().then(()=>guild.members.fetch({user:interaction.user.id,force:true}))):Promise.resolve(null)]);
  let details=null;
  const detailsAllowed=Boolean(actor&&options.readDetails&&actor.id===interaction.user?.id&&freshRoles&&(actor.id===options.ownerId||actor.permissions?.has?.(F.ManageGuild)));
  if(detailsAllowed){
    details=await within(Promise.resolve().then(()=>options.readDetails({owner:actor.id===options.ownerId,actor})));}
  const currentChannel=freshChannels?.get?freshChannels.get(interaction.channelId||interaction.channel?.id):interaction.channel;
  const embed=buildReport({...options,language,details,guild,channel:currentChannel,member:freshMember||guild.members.me,
    channelsComplete:Boolean(freshChannels?.get),channelSnapshot:freshChannels?.get?freshChannels:null,partial:!freshMember||!freshChannels?.get||Boolean(options.readDetails&&(!freshRoles||!actor||detailsAllowed&&!details))});
  return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
}
function operationalDetails({guild,data={},tickets={},giveaways={},jobs=[],errors=null,backups=null,owner=false,now=Date.now()}){
  const human=require('./security_guard').settings(data),bot=require('./bot_security').settings(data);
  const result={security:{humanEnabled:human.enabled&&data.settings?.autoModEnabled!==false,humanLimit:human.messageLimit,humanWindow:human.windowSeconds,botEnabled:bot.enabled,botLimit:bot.messageLimit,botWindow:bot.windowSeconds},
    intents:{members:Boolean(guild.client?.options?.intents?.has(GatewayIntentBits.GuildMembers)),content:Boolean(guild.client?.options?.intents?.has(GatewayIntentBits.MessageContent))},
    workflows:{tickets:Object.values(tickets).filter(v=>v.guildId===guild.id&&v.status!=='closed').length,giveaways:Object.values(giveaways).filter(v=>v.guildId===guild.id&&!v.ended).length,displays:Object.values(giveaways).filter(v=>v.guildId===guild.id&&v.displayPending).length}};
  if(owner){result.jobs={total:jobs.length,running:jobs.filter(v=>v.running).length,failures:jobs.reduce((n,v)=>n+(Number(v.failures)||0),0)};result.errors=errors;
    try{const service=backups(),m=service.store.metadata(guild.id),j=service.store.job(guild.id),q=service.invitations.store.load(guild.id);result.backups={count:m.files.length,auto:m.auto,overdue:m.auto&&(!m.lastSuccess||now-m.lastSuccess>7*3600000),restore:j?.status||'none',pending:Boolean(j?.pending),invites:q.job?.status||'none'};}catch{result.backups={unavailable:true};}}
  return result;
}
module.exports={buildReport,diagnose,missingPermissions,operationalDetails};
