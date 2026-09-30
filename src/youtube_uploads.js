'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
  PermissionsBitField, MessageFlags, escapeMarkdown } = require('discord.js');
const { UploadStore, createUploadMonitor, resolveChannel, readFeed, MAX_PER_GUILD } = require('./youtube_uploads_core');

const PREFIX = 'yt_uploads:';
const EPHEMERAL = MessageFlags.Ephemeral;
const NEED = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ReadMessageHistory];
const channelUrl = id => `https://www.youtube.com/channel/${id}`;
const clean = (value, max = 100) => escapeMarkdown(String(value).replace(/@/g, '@\u200b').slice(0, max));
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(PREFIX + id).setLabel(label).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);

function buildYouTubeUploadCommands() {
  return [new SlashCommandBuilder().setName('uploads').setDescription('YouTube-Kanäle hinzufügen und neue Uploads automatisch melden.').setDMPermission(false)
    .addStringOption(o => o.setName('link').setDescription('Optional: YouTube-Kanal-Link oder @Handle.').setMaxLength(500))
    .addChannelOption(o => o.setName('kanal').setDescription('Optional: Discord-Kanal für neue Uploads.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addRoleOption(o => o.setName('ping').setDescription('Optional: Rolle für Upload-Benachrichtigungen.')),
    new SlashCommandBuilder().setName('youtube').setDescription('YouTube-Uploads und Shorts verwalten.').setDMPermission(false)
      .addSubcommand(s => s.setName('add').setDescription('YouTube-Kanal hinzufügen.')
        .addStringOption(o => o.setName('link').setDescription('YouTube-Kanal-Link oder @Handle.').setRequired(true).setMaxLength(500))
        .addChannelOption(o => o.setName('kanal').setDescription('Discord-Kanal für Uploads.').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addRoleOption(o => o.setName('ping').setDescription('Optionale Ping-Rolle.')))
      .addSubcommand(s => s.setName('list').setDescription('YouTube-Abos anzeigen und verwalten.'))
      .addSubcommand(s => s.setName('remove').setDescription('YouTube-Abo entfernen.').addStringOption(o => o.setName('id').setDescription('Abo-ID aus der Übersicht.').setRequired(true)))
      .addSubcommand(s => s.setName('test').setDescription('Letzten Upload als Testmeldung senden.').addStringOption(o => o.setName('id').setDescription('Abo-ID aus der Übersicht.').setRequired(true)))
      .addSubcommand(s => s.setName('check').setDescription('Neue Uploads dieses Servers jetzt prüfen.'))];
}

function createYouTubeUploads({ client, OWNER_ID, isGuildApproved, isMaintenance = () => false,
  dataFile = path.join(__dirname, '..', 'data', 'youtube_uploads.json'),
  resolveFeed = resolveChannel, fetchFeed = readFeed, now = Date.now, logger = console, legacySubscriptions }) {
  const store = new UploadStore(dataFile);
  try { store.importLegacy(legacySubscriptions, now()); } catch (err) { store.fault = String(err.message || err); }
  const pending = new Map();
  const actionTimes = new Map();
  let timer = null, startupTimer = null;
  const configured = Number(process.env.YOUTUBE_UPLOAD_POLL_SECONDS || process.env.YOUTUBE_POLL_SECONDS || 120);
  const pollMs = (Number.isFinite(configured) ? Math.max(60, Math.min(1800, configured)) : 180) * 1000;
  const enabled = guildId => Boolean(client.isReady() && client.guilds.cache.has(guildId) && isGuildApproved(guildId) && !isMaintenance());

  function canManage(i) {
    return i.user.id === OWNER_ID || i.guild?.ownerId === i.user.id ||
      Boolean(i.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || i.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels));
  }
  async function targetChannel(guildId, targetId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Der Bot ist nicht auf diesem Server.');
    const target = await guild.channels.fetch(targetId);
    if (!target || target.guildId !== guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(target.type)) {
      throw new Error('Bitte einen Text- oder Ankündigungskanal dieses Servers auswählen.');
    }
    const me = guild.members.me || await guild.members.fetchMe();
    if (!target.permissionsFor(me)?.has(NEED)) {
      throw new Error('Im Zielkanal fehlen Bot-Rechte: Kanal ansehen, Nachrichten senden, Links einbetten oder Nachrichtenverlauf anzeigen.');
    }
    return target;
  }
  async function validateTarget(i, targetId) {
    const target = await targetChannel(i.guild.id, targetId);
    if (!target.permissionsFor(i.member)?.has(PermissionsBitField.Flags.ViewChannel)) throw new Error('Du kannst diesen Discord-Kanal nicht sehen.');
    return target;
  }
  async function validateRole(guildId, targetId, roleId) {
    if (!roleId) return null;
    const guild = client.guilds.cache.get(guildId);
    const role = await guild.roles.fetch(roleId);
    if (!role || role.id === guildId) throw new Error('Bitte eine vorhandene Rolle auswählen; @everyone ist nicht erlaubt.');
    const target = await targetChannel(guildId, targetId);
    if (!role.mentionable && !target.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.MentionEveryone)) {
      throw new Error('Diese Rolle darf der Bot nicht erwähnen. Mache die Rolle erwähnbar oder wähle eine andere Rolle.');
    }
    return role.id;
  }
  async function deliver(sub, video, nonce, test = false) {
    if (!enabled(sub.guildId)) throw new Error('Upload-Meldungen sind gerade angehalten.');
    const target = await targetChannel(sub.guildId, sub.targetId);
    const marker = `YouTube:${sub.id}:${video.id}`;
    if (!test) {
      // Recovers the send-before-save crash window, in addition to Discord's nonce.
      const recent = await target.messages.fetch({ limit: 100 });
      if (recent.some(m => m.author?.id === client.user.id && m.embeds?.some(e => e.footer?.text?.endsWith(marker)))) return;
    }
    if (!enabled(sub.guildId)) throw new Error('Upload-Meldungen sind gerade angehalten.');
    const roleId = !test && sub.pingRoleId ? await validateRole(sub.guildId, sub.targetId, sub.pingRoleId) : null;
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    const payload = {
      content: `${roleId ? `<@&${roleId}>\n` : ''}${test ? '🧪 **Testmeldung**' : '🔴 **Neues YouTube-Video / Short!**'}\n**${clean(sub.title)}**${test ? ' – so sehen neue Uploads aus:' : ' hat einen neuen Upload:'}\n${url}`,
      allowedMentions: { parse: [], roles: roleId ? [roleId] : [] },
      embeds: [{ color: 0xff0000, title: clean(video.title, 220), url,
        author: { name: sub.title.slice(0, 100), url: channelUrl(sub.channelId) },
        image: { url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` },
        timestamp: new Date(video.publishedAt).toISOString(),
        footer: { text: `Made with ❤️ by Stilo • ${test ? 'YouTube-Test' : marker}` } }],
      components: [row(new ButtonBuilder().setLabel('▶ Video ansehen').setURL(url).setStyle(ButtonStyle.Link))]
    };
    if (!test) { payload.nonce = nonce; payload.enforceNonce = true; }
    await target.send(payload);
  }
  const monitor = createUploadMonitor({ store, canRun: enabled, deliver, fetchFeed, now, logger });

  function overview(guildId, notice = '', requestedPage = 0) {
    const subs = monitor.list(guildId);
    const page = Math.max(0, Math.min(Math.floor(Number(requestedPage) || 0), Math.max(0, Math.ceil(subs.length / 20) - 1)));
    const visible = subs.slice(page * 20, (page + 1) * 20);
    const list = visible.map(s => `${s.paused ? '⏸️' : s.lastError ? '⚠️' : '✅'} **${clean(s.title, 35)}** → <#${s.targetId}>\nID: \`${s.legacyId || s.id}\``).join('\n');
    const components = [row(button('add', 'YouTube-Kanal hinzufügen', ButtonStyle.Primary), button('home', 'Aktualisieren'))];
    if (subs.length) components.push(row(new StringSelectMenuBuilder().setCustomId(PREFIX + 'manage')
      .setPlaceholder('YouTube-Abo verwalten').addOptions(visible.map(s => ({
        label: s.title.slice(0, 80) || 'YouTube-Kanal', value: s.id,
        description: `${s.paused ? 'Pausiert' : 'Aktiv'} • #${client.guilds.cache.get(guildId)?.channels.cache.get(s.targetId)?.name || s.targetId}`.slice(0, 100)
      })))));
    if (subs.length > 20) components.push(row(button(`home:${Math.max(0, page - 1)}`, 'Vorherige Seite'), button(`home:${page + 1}`, 'Nächste Seite')));
    return { content: notice || null, embeds: [{ title: '🔴 YouTube Uploads', color: 0xff0000,
      description: `YouTube-Link eintragen und den Discord-Kanal für neue Videos auswählen.\n\n${list || 'Noch keine YouTube-Kanäle eingerichtet.'}`,
      footer: { text: `${subs.length}/${MAX_PER_GUILD} Abos • Prüfung alle ${Math.round(pollMs / 60_000)} Minuten • Made with ❤️ by Stilo` } }], components, allowedMentions: { parse: [] } };
  }
  function detail(sub, notice = '') {
    const time = value => value ? `<t:${Math.floor(value / 1000)}:R>` : 'Noch keine';
    return { content: notice || null, embeds: [{ title: `🔴 ${sub.title.slice(0, 100)}`, url: channelUrl(sub.channelId), color: sub.paused ? 0x808080 : 0xff0000,
      description: `**Status:** ${sub.paused ? 'Pausiert' : 'Aktiv'}\n**Discord-Kanal:** <#${sub.targetId}>\n**Ping-Rolle:** ${sub.pingRoleId ? `<@&${sub.pingRoleId}>` : 'Kein Ping'}\n**ID:** \`${sub.legacyId || sub.id}\`\n**Letzte Prüfung:** ${time(sub.lastCheckedAt)}\n**Letzte Meldung:** ${time(sub.lastSentAt)}\n**Wartende Videos:** ${sub.pending.length}${sub.lastError ? `\n\n⚠️ ${clean(sub.lastError, 250)}` : ''}`,
      footer: { text: 'Made with ❤️ by Stilo' } }], components: [
        row(button(`pause:${sub.id}`, sub.paused ? 'Fortsetzen' : 'Pausieren'), button(`target:${sub.id}`, 'Discord-Kanal ändern'), button(`test:${sub.id}`, 'Testmeldung senden')),
        row(button('home', 'Zur Übersicht'), button(`role:${sub.id}`, 'Ping-Rolle ändern'), button(`remove:${sub.id}`, 'Abo entfernen', ButtonStyle.Danger))
      ], allowedMentions: { parse: [] } };
  }
  function chooseChannel(token, title) {
    return { content: `📺 **${clean(title)}**\nWähle den Discord-Kanal für neue Uploads:`, embeds: [], components: [
      row(new ChannelSelectMenuBuilder().setCustomId(PREFIX + `destination:${token}`).setPlaceholder('Discord-Kanal auswählen')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)), row(button('home', 'Abbrechen'))
    ], allowedMentions: { parse: [] } };
  }
  function makePending(i, data) {
    for (const [key, value] of pending) if (value.expires < now() || (value.userId === i.user.id && value.guildId === i.guild.id)) pending.delete(key);
    if (pending.size >= 200) throw new Error('Gerade sind viele Einrichtungen offen. Bitte später erneut versuchen.');
    const token = crypto.randomBytes(10).toString('hex');
    pending.set(token, { ...data, userId: i.user.id, guildId: i.guild.id, expires: now() + 10 * 60_000 });
    return token;
  }
  function rateLimit(key, duration) {
    const stamp = now();
    for (const [k, t] of actionTimes) if (stamp - t > 60_000) actionTimes.delete(k);
    if (actionTimes.has(key) && stamp - actionTimes.get(key) < duration) throw new Error('Bitte kurz warten und danach erneut versuchen.');
    actionTimes.set(key, stamp);
  }
  async function beginAdd(i, input, targetId, pingRoleId = null) {
    rateLimit(`add:${i.guild.id}:${i.user.id}`, 5000);
    const sinceAt = now();
    const feed = await resolveFeed(input);
    if (targetId) {
      await validateTarget(i, targetId);
      await validateRole(i.guild.id, targetId, pingRoleId);
      const sub = monitor.add(i.guild.id, targetId, feed, sinceAt, pingRoleId);
      return i.editReply(detail(sub, '✅ Eingerichtet! Ab jetzt melde ich neue Uploads. Vorhandene Videos werden nicht nachträglich gepostet.'));
    }
    const token = makePending(i, { feed, sinceAt, pingRoleId });
    return i.editReply(chooseChannel(token, feed.title));
  }
  async function handleInteraction(i) {
    const isCommand = i.isChatInputCommand?.() && ['uploads', 'youtube'].includes(i.commandName);
    if (!isCommand && !String(i.customId || '').startsWith(PREFIX)) return false;
    try {
      if (!i.guild || !isGuildApproved(i.guild.id)) throw new Error('Uploads sind nur auf freigegebenen Discord-Servern verfügbar.');
      if (!canManage(i)) throw new Error('Dafür brauchst du „Server verwalten“, „Kanäle verwalten“ oder musst Server-/Bot-Owner sein.');
      if (isMaintenance()) throw new Error('Der Bot ist im Wartungsmodus. Upload-Meldungen sind angehalten.');
      if (store.fault) throw new Error(store.fault);
      if (isCommand) {
        if (i.commandName === 'youtube') {
          await i.deferReply({ flags: EPHEMERAL });
          const action = i.options.getSubcommand();
          if (action === 'add') await beginAdd(i, i.options.getString('link', true), i.options.getChannel('kanal', true).id, i.options.getRole('ping')?.id);
          else if (action === 'list') await i.editReply(overview(i.guild.id));
          else if (action === 'check') {
            rateLimit(`check:${i.guild.id}`, 60_000);
            const checked = await monitor.tick(i.guild.id);
            await i.editReply(overview(i.guild.id, checked ? '✅ Prüfung abgeschlossen. Fehler stehen beim jeweiligen Abo.' : 'Eine Prüfung läuft bereits oder konnte nicht beendet werden.'));
          } else {
            const sub = monitor.get(i.options.getString('id', true).trim(), i.guild.id);
            if (action === 'remove') { await monitor.remove(sub.id, i.guild.id); await i.editReply(overview(i.guild.id, '✅ Abo entfernt.')); }
            else if (action === 'test') {
              await sendTest(sub);
              await i.editReply(detail(sub, '🧪 Testmeldung gesendet.'));
            }
          }
          return true;
        }
        const link = i.options.getString('link');
        const channel = i.options.getChannel('kanal');
        if (channel && !link) throw new Error('Gib auch den YouTube-Link an oder öffne /uploads ohne Optionen.');
        await i.deferReply({ flags: EPHEMERAL });
        if (link) await beginAdd(i, link, channel?.id, i.options.getRole('ping')?.id);
        else await i.editReply(overview(i.guild.id));
        return true;
      }
      const [action, id] = i.customId.slice(PREFIX.length).split(':');
      if (action === 'add') {
        const input = new TextInputBuilder().setCustomId('link').setLabel('YouTube-Kanal-Link oder @Handle').setStyle(TextInputStyle.Short)
          .setPlaceholder('https://www.youtube.com/@DeinKanal').setRequired(true).setMaxLength(500);
        await i.showModal(new ModalBuilder().setCustomId(PREFIX + 'submit').setTitle('YouTube-Kanal hinzufügen').addComponents(row(input)));
        return true;
      }
      if (action === 'submit') {
        await i.deferReply({ flags: EPHEMERAL });
        await beginAdd(i, i.fields.getTextInputValue('link'));
        return true;
      }
      await i.deferUpdate();
      if (action === 'home') await i.editReply(overview(i.guild.id, '', id));
      else if (action === 'manage') await i.editReply(detail(monitor.get(i.values[0], i.guild.id)));
      else if (action === 'destination') {
        const draft = pending.get(id);
        if (!draft || draft.expires < now() || draft.userId !== i.user.id || draft.guildId !== i.guild.id) throw new Error('Diese Auswahl ist abgelaufen. Bitte /uploads erneut öffnen.');
        if (draft.busy) throw new Error('Diese Auswahl wird gerade gespeichert.');
        draft.busy = true;
        try {
          await validateTarget(i, i.values[0]);
          const pingRoleId = draft.subId ? monitor.get(draft.subId, i.guild.id).pingRoleId : draft.pingRoleId;
          await validateRole(i.guild.id, i.values[0], pingRoleId);
          const sub = draft.subId ? await monitor.edit(draft.subId, i.guild.id, { targetId: i.values[0] }) : monitor.add(i.guild.id, i.values[0], draft.feed, draft.sinceAt, pingRoleId);
          pending.delete(id);
          await i.editReply(detail(sub, '✅ Gespeichert! Neue Uploads werden in diesem Discord-Kanal gemeldet.'));
        } finally { draft.busy = false; }
      } else {
        let sub = monitor.get(id, i.guild.id);
        if (action === 'pause') { sub = await monitor.edit(id, i.guild.id, { paused: !sub.paused }); await i.editReply(detail(sub)); }
        else if (action === 'target') { const token = makePending(i, { subId: sub.id }); await i.editReply(chooseChannel(token, sub.title)); }
        else if (action === 'remove') { await monitor.remove(id, i.guild.id); await i.editReply(overview(i.guild.id, '✅ YouTube-Abo entfernt.')); }
        else if (action === 'role') {
          await i.editReply({ content: 'Wähle eine Ping-Rolle. Ohne Auswahl werden Pings deaktiviert.', embeds: [], components: [
            row(new RoleSelectMenuBuilder().setCustomId(PREFIX + `setrole:${id}`).setPlaceholder('Ping-Rolle oder keine Rolle').setMinValues(0).setMaxValues(1)), row(button('home', 'Abbrechen'))
          ] });
        } else if (action === 'setrole') {
          const pingRoleId = await validateRole(i.guild.id, sub.targetId, i.values[0] || null);
          sub = await monitor.edit(id, i.guild.id, { pingRoleId });
          await i.editReply(detail(sub, '✅ Ping-Einstellung gespeichert.'));
        }
        else if (action === 'test') {
          await sendTest(sub);
          await i.editReply(detail(sub, '🧪 Testmeldung gesendet. Die automatische Erkennung bleibt unverändert.'));
        } else throw new Error('Unbekannte Auswahl. Bitte /uploads erneut öffnen.');
      }
    } catch (err) {
      logger.warn('[YouTube uploads] Interaction:', String(err.message || err));
      const message = { content: `❌ ${String(err.message || err).slice(0, 1600)}`, allowedMentions: { parse: [] } };
      if (i.deferred || i.replied) await i.editReply({ ...message, embeds: [], components: [] }).catch(() => {});
      else await i.reply({ ...message, flags: EPHEMERAL }).catch(() => {});
    }
    return true;
  }
  async function sendTest(sub) {
    rateLimit(`test:${sub.id}`, 60_000);
    const feed = await fetchFeed(sub.channelId);
    const video = feed.videos.at(-1);
    if (!video) throw new Error('Dieser Kanal hat noch kein öffentliches Video im Feed.');
    await deliver(sub, video, null, true);
  }
  function start() {
    if (timer || store.fault) { if (store.fault) logger.warn('[YouTube uploads]', store.fault); return; }
    timer = setInterval(() => { void monitor.tick(); }, pollMs);
    startupTimer = setTimeout(() => { void monitor.tick(); }, 10_000);
    timer.unref?.(); startupTimer.unref?.();
  }
  function stop() { clearInterval(timer); clearTimeout(startupTimer); timer = null; startupTimer = null; }
  return { handleInteraction, start, stop, monitor };
}

module.exports = { buildYouTubeUploadCommands, createYouTubeUploads };
