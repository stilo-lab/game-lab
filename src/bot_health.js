'use strict';
const { EmbedBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
const runtime = require('./bot_runtime');
const F = PermissionsBitField.Flags;

function missingPermissions(permissions, checks) {
  return checks.filter(([flag]) => !permissions?.has?.(flag)).map(([, label]) => label);
}
function buildReport({ guild, channel, member, data = {}, staffChannels = {}, purposes = [],
  aiConfigured = false, aiStatus = {}, maintenance = false, systems = {}, channelsComplete = false, channelSnapshot = null, partial = false }) {
  const fields = [], issues = [];
  const channels = channelSnapshot || guild.channels.cache;
  const here = member ? channel?.permissionsFor?.(member) : null;
  const missingHere = missingPermissions(here, [[F.ViewChannel, 'Kanal ansehen'], [F.SendMessages, 'Nachrichten senden'],
    [F.EmbedLinks, 'Links einbetten'], [F.AttachFiles, 'Dateien anhängen'], [F.ReadMessageHistory, 'Nachrichtenverlauf lesen']]);
  if (!member || !here) fields.push({ name: '💬 Rechte in diesem Kanal', value: '⚠️ Bot-Rechte konnten nicht geprüft werden.' });
  else if (missingHere.length) {
    issues.push('Öffne die Kanal-Berechtigungen für die Pixel-Rolle und erlaube: ' + missingHere.join(', ') + '.');
    fields.push({ name: '💬 Rechte in diesem Kanal', value: '⚠️ Fehlt: ' + missingHere.join(', ') });
  } else fields.push({ name: '💬 Rechte in diesem Kanal', value: '✅ Nachrichten, Bilder und Verlauf verfügbar.' });

  const setupMissing = missingPermissions(member?.permissions, [[F.ManageChannels, 'Kanäle verwalten'], [F.ManageRoles, 'Rollen verwalten']]);
  fields.push({ name: '🛠️ Server-Setup', value: !member ? '⚠️ Rechte unbekannt.' : setupMissing.length
    ? '⚠️ Der Bot braucht: ' + setupMissing.join(', ') + '. Rollen müssen außerdem unter seiner höchsten Rolle liegen.'
    : '✅ Bot-Rechte für Kanäle und Rollen vorhanden. Die Rollen-Hierarchie wird beim Auftrag geprüft.' });
  if (member && setupMissing.length) issues.push('Erlaube der Pixel-Rolle ' + setupMissing.join(' und ') + ', wenn Pixel diese Aufgaben übernehmen soll.');

  let configured = 0, valid = 0, missing = 0, inaccessible = 0, unknown = 0;
  const countingIds = runtime.bindingIds(data, 'counting', staffChannels);
  for (const purpose of purposes) {
    const ids = runtime.bindingIds(data, purpose, staffChannels);
    if (!ids.length) continue;
    configured += 1;
    const found = ids.map(id => channels.get(id)).filter(Boolean);
    const target = found.find(ch => runtime.validBinding(ch, guild, purpose));
    if (target) {
      const permissions = member && target.permissionsFor?.(member);
      if (!permissions) unknown += 1;
      else if (permissions.has(F.ViewChannel) && permissions.has(F.SendMessages)) valid += 1;
      else inaccessible += 1;
    } else if (found.length || channelsComplete) missing += 1;
    else unknown += 1;
  }
  fields.push({ name: '📁 Gespeicherte Kanal-Zuordnungen', value: configured
    ? `${valid}/${configured} nutzbar · ${missing} nicht gefunden oder ungeeignet · ${inaccessible} ohne Bot-Zugriff · ${unknown} ungeprüft.`
    : 'Noch keine Zuordnungen gespeichert. Nutze `/setup` oder `/serversetup`.' });
  if (missing || inaccessible) issues.push('Nutze `/setup`, um vorhandene Kanäle neu zu prüfen, oder `/setupmap set`, um eine Funktion gezielt zuzuordnen.');
  const counting = countingIds.map(id => channels.get(id)).find(ch => runtime.validBinding(ch, guild, 'counting'));
  if (!countingIds.length) fields.push({ name: '🔢 Counting', value: 'Noch nicht eingerichtet. Mit `/setup` einen Counting-Kanal zuordnen.' });
  else if (!counting) fields.push({ name: '🔢 Counting', value: channelsComplete ? '⚠️ Gespeicherter Kanal nicht gefunden oder ungeeignet. Prüfe `/setupmap set`.' : '⚠️ Kanal konnte nicht bestätigt werden. Prüfe `/setup`.' });
  else {
    const permissions = member && counting.permissionsFor?.(member);
    const missingCounting = missingPermissions(permissions, [[F.ViewChannel, 'Kanal ansehen'], [F.SendMessages, 'Nachrichten senden'], [F.AddReactions, 'Reaktionen hinzufügen'], [F.ReadMessageHistory, 'Nachrichtenverlauf lesen']]);
    if (permissions && missingCounting.length) issues.push('Erlaube der Pixel-Rolle im Counting-Kanal: ' + missingCounting.join(', ') + '.');
    fields.push({ name: '🔢 Counting', value: !permissions ? '⚠️ Bot-Rechte im Counting-Kanal unbekannt.' : missingCounting.length
      ? '⚠️ Der Bot braucht im Counting-Kanal: ' + missingCounting.join(', ') + '.' : '✅ Zugeordnet und Bot-Rechte vorhanden. Der Zähler wird dauerhaft gespeichert.' });
  }
  fields.push({ name: '🤖 AI und Support', value: !aiConfigured ? '⚙️ AI-Key fehlt. Der Owner muss `GEMINI_API_KEY` setzen.'
    : aiStatus.closed ? '⏳ Pixel beendet gerade seine Arbeit.'
    : `✅ AI eingerichtet${aiStatus.active || aiStatus.queued ? ' · verarbeitet gerade Anfragen' : ''}. ${data.settings?.aiEnabled === false ? 'Chat-AI ist hier deaktiviert.' : 'Chat-AI ist hier aktiviert.'}\nDas ist kein bezahlter AI-Test; API-Limits oder Modellzugriff werden dabei nicht geprüft.` });
  fields.push({ name: '🎙️ Voice und Uploads', value: [
    systems.mimicAvailable ? (systems.mimicActive ? 'Mimic Party läuft.' : 'Mimic Party verfügbar.') : 'Mimic-Modul fehlt.',
    systems.spotifyActive ? 'Spotify-Party läuft.' : 'Spotify-Party ruht.',
    systems.uploadsAvailable ? 'YouTube-Monitor geladen.' : 'YouTube-Monitor nicht geladen.',
    'Bei Voice-Problemen: `/mimic diagnose`. YouTube-Erreichbarkeit wurde hier nicht live geprüft.'
  ].join('\n') });
  const voice = systems.voiceChannel;
  if (voice && member) {
    const needed = missingPermissions(voice.permissionsFor?.(member), [[F.ViewChannel, 'Kanal ansehen'], [F.Connect, 'Verbinden'], [F.Speak, 'Sprechen']]);
    if (needed.length) issues.push('In deinem Voice-Kanal fehlen Pixel: ' + needed.join(', ') + '.');
  }
  if (maintenance) issues.unshift('Der Wartungsmodus ist aktiv. Der Bot-Owner kann ihn im Owner-Panel beenden.');
  if (unknown || partial) issues.push('Ein Teil der Discord-Daten konnte nicht aktuell geprüft werden. Starte `/diagnose` später erneut.');
  fields.push({ name: '➡️ Nächster Schritt', value: (issues.length ? issues.slice(0, 4).map(x => '• ' + x).join('\n') : 'Keine Auffälligkeit in diesen Prüfungen. Bei einem Fehler nenne der Support-AI den Befehl und die genaue Fehlermeldung.').slice(0, 1024) });
  return new EmbedBuilder().setTitle('🩺 Pixel • Diagnose').setColor(issues.length || missing || inaccessible || !member ? 0xF5B041 : 0x58D68D)
    .setDescription('Nur du siehst diese Prüfung. Sie verändert keine Kanäle, Rechte oder Einstellungen.').addFields(fields).setTimestamp();
}
async function within(promise, ms = 8000) {
  let timer;
  try { return await Promise.race([Promise.resolve(promise), new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]); }
  catch { return null; } finally { clearTimeout(timer); }
}
async function diagnose(interaction, options = {}) {
  if (!interaction.guild) return interaction.reply({ content: 'Nutze `/diagnose` bitte auf deinem Server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const [freshMember, freshChannels] = await Promise.all([
    within(Promise.resolve().then(() => guild.members.fetchMe())),
    within(Promise.resolve().then(() => guild.channels.fetch()))
  ]);
  const embed = buildReport({ ...options, guild, channel: interaction.channel,
    member: freshMember || guild.members.me, channelsComplete: Boolean(freshChannels?.get),
    channelSnapshot: freshChannels?.get ? freshChannels : null, partial: !freshMember || !freshChannels?.get });
  return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}
module.exports = { buildReport, diagnose, missingPermissions };
