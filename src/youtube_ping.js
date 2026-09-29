const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  MessageFlags
} = require('discord.js');

const POLL_MS = Math.max(60_000, Number(process.env.YOUTUBE_POLL_SECONDS || 120) * 1000);
const MAX_SEEN = 80;
const MAX_CATCHUP = 5;

function youtubeCommands() {
  return [
    new SlashCommandBuilder()
      .setName('youtube')
      .setDescription('YouTube Upload-Pings für Videos und Shorts.')
      .addSubcommand(sc => sc
        .setName('add')
        .setDescription('Überwacht einen YouTube-Kanal und postet neue Uploads.')
        .addStringOption(o => o.setName('link').setDescription('YouTube-Kanal-Link, z. B. https://youtube.com/@name').setRequired(true))
        .addChannelOption(o => o.setName('kanal').setDescription('Discord-Kanal für Benachrichtigungen').setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addRoleOption(o => o.setName('ping').setDescription('Optional: Rolle, die bei neuen Uploads gepingt wird')))
      .addSubcommand(sc => sc.setName('list').setDescription('Zeigt alle überwachten YouTube-Kanäle.'))
      .addSubcommand(sc => sc
        .setName('remove')
        .setDescription('Entfernt eine YouTube-Überwachung.')
        .addStringOption(o => o.setName('id').setDescription('ID aus /youtube list').setRequired(true)))
      .addSubcommand(sc => sc
        .setName('test')
        .setDescription('Sendet den letzten Upload als Test in den Zielkanal.')
        .addStringOption(o => o.setName('id').setDescription('ID aus /youtube list').setRequired(true)))
      .addSubcommand(sc => sc.setName('check').setDescription('Prüft jetzt sofort auf neue Uploads.'))
  ];
}

function decodeXml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function stripCdata(text = '') {
  return String(text).replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function truncate(value, max = 240) {
  const s = String(value || '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function cleanYoutubeUrl(raw = '') {
  let input = String(raw || '').trim();
  if (!input) return '';
  if (!/^https?:\/\//i.test(input) && !input.startsWith('UC')) input = `https://${input}`;
  return input;
}

function directChannelId(value = '') {
  const s = String(value || '').trim();
  if (/^UC[\w-]{20,}$/i.test(s)) return s;
  const m = s.match(/(?:youtube\.com|youtu\.be)\/channel\/(UC[\w-]{20,})/i);
  return m?.[1] || null;
}

async function fetchText(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; StiloDiscordBot/1.0; +https://discord.com)',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.7'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveChannelId(input) {
  const direct = directChannelId(input);
  if (direct) return direct;
  const url = cleanYoutubeUrl(input);
  if (!url || !/youtube\.com/i.test(url)) throw new Error('Bitte gib einen gültigen YouTube-Kanal-Link an.');
  const html = await fetchText(url);
  const patterns = [
    /<meta\s+itemprop=["']channelId["']\s+content=["'](UC[\w-]+)["']/i,
    /<meta\s+content=["'](UC[\w-]+)["']\s+itemprop=["']channelId["']/i,
    /["']channelId["']\s*:\s*["'](UC[\w-]+)["']/i,
    /["']externalId["']\s*:\s*["'](UC[\w-]+)["']/i,
    /youtube\.com\/channel\/(UC[\w-]+)/i
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return match[1];
  }
  throw new Error('Channel-ID konnte aus diesem Link nicht ermittelt werden. Nutze den normalen Kanal-Link oder @Handle-Link.');
}

function parseFeed(xml = '') {
  const channelTitle = decodeXml(stripCdata(xml.match(/<feed[\s\S]*?<title>([\s\S]*?)<\/title>/i)?.[1] || 'YouTube'));
  const entries = [];
  const chunks = String(xml).match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  for (const chunk of chunks) {
    const videoId = chunk.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1]?.trim();
    if (!videoId) continue;
    const title = decodeXml(stripCdata(chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Neuer Upload'));
    const author = decodeXml(stripCdata(chunk.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i)?.[1] || channelTitle));
    const published = chunk.match(/<published>([^<]+)<\/published>/i)?.[1] || null;
    const updated = chunk.match(/<updated>([^<]+)<\/updated>/i)?.[1] || null;
    const description = decodeXml(stripCdata(chunk.match(/<media:description>([\s\S]*?)<\/media:description>/i)?.[1] || ''));
    entries.push({
      videoId,
      title,
      author,
      published,
      updated,
      description,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    });
  }
  return { channelTitle, entries };
}

async function fetchChannelFeed(channelId) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const parsed = parseFeed(xml);
  if (!parsed.entries.length) throw new Error('YouTube-RSS hat aktuell keine Uploads geliefert.');
  return parsed;
}

function canManage(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function ensureStore(db) {
  if (!db.youtubePing || typeof db.youtubePing !== 'object') db.youtubePing = { counter: 0, guilds: {} };
  if (!Number.isInteger(db.youtubePing.counter)) db.youtubePing.counter = 0;
  if (!db.youtubePing.guilds || typeof db.youtubePing.guilds !== 'object') db.youtubePing.guilds = {};
  return db.youtubePing;
}

function guildSubs(db, guildId) {
  const store = ensureStore(db);
  if (!Array.isArray(store.guilds[guildId])) store.guilds[guildId] = [];
  return store.guilds[guildId];
}

function createYouTubePing({ client, db, saveDB, footer, isGuildApproved }) {
  let timer = null;
  let checking = false;

  function nextId() {
    const store = ensureStore(db);
    store.counter += 1;
    return `YT-${store.counter}`;
  }

  async function postUpload(sub, entry, { test = false } = {}) {
    const guild = client.guilds.cache.get(sub.guildId);
    if (!guild || !isGuildApproved?.(guild.id)) return { ok: false, reason: 'guild_missing' };
    const channel = guild.channels.cache.get(sub.discordChannelId) || await guild.channels.fetch(sub.discordChannelId).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return { ok: false, reason: 'channel_missing' };

    const me = guild.members.me;
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages)) {
      return { ok: false, reason: 'no_send_permission' };
    }

    const publishedTs = entry.published ? Math.floor(new Date(entry.published).getTime() / 1000) : null;
    const embed = footer(new EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: `YouTube • ${entry.author || sub.youtubeName || 'Neuer Upload'}` })
      .setTitle(`🎬 ${truncate(entry.title, 240)}`)
      .setURL(entry.url)
      .setDescription(test
        ? '🧪 **Test-Benachrichtigung** – so sieht ein neuer Upload/Short aus.'
        : '🔥 **Neues Video / Short ist online!**')
      .setImage(entry.thumbnail)
      .addFields(
        { name: 'Kanal', value: truncate(entry.author || sub.youtubeName || sub.youtubeChannelId, 100), inline: true },
        { name: 'Veröffentlicht', value: publishedTs ? `<t:${publishedTs}:R>` : 'gerade eben', inline: true }
      ));

    if (entry.description) embed.addFields({ name: 'Beschreibung', value: truncate(entry.description.replace(/\s+/g, ' ').trim(), 500) });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('▶️ Auf YouTube ansehen').setURL(entry.url)
    );
    const content = sub.pingRoleId ? `<@&${sub.pingRoleId}>` : undefined;
    await channel.send({ content, embeds: [embed], components: [row], allowedMentions: sub.pingRoleId ? { roles: [sub.pingRoleId] } : { parse: [] } });
    return { ok: true };
  }

  async function checkSubscription(sub, { manual = false } = {}) {
    try {
      const feed = await fetchChannelFeed(sub.youtubeChannelId);
      sub.youtubeName = feed.channelTitle || sub.youtubeName;
      sub.lastCheckedAt = Date.now();
      sub.lastError = null;
      const seen = new Set(Array.isArray(sub.seenVideoIds) ? sub.seenVideoIds : []);

      // New subscription: seed current feed and do not spam old uploads.
      if (!sub.initialized) {
        sub.seenVideoIds = feed.entries.map(e => e.videoId).slice(0, MAX_SEEN);
        sub.initialized = true;
        sub.lastVideoId = feed.entries[0]?.videoId || null;
        saveDB();
        return { newCount: 0, seeded: true };
      }

      const unseen = feed.entries.filter(e => !seen.has(e.videoId));
      const deliver = unseen.slice(0, MAX_CATCHUP).reverse(); // oldest first
      let sent = 0;
      for (const entry of deliver) {
        const result = await postUpload(sub, entry);
        if (result.ok) sent += 1;
        // Mark as seen even if posting failed to avoid repeat-spam; error is kept on subscription.
        seen.add(entry.videoId);
      }
      for (const entry of feed.entries) seen.add(entry.videoId);
      sub.seenVideoIds = Array.from(seen).slice(-MAX_SEEN);
      sub.lastVideoId = feed.entries[0]?.videoId || sub.lastVideoId || null;
      sub.lastSuccessAt = Date.now();
      saveDB();
      return { newCount: sent, found: unseen.length };
    } catch (err) {
      sub.lastCheckedAt = Date.now();
      sub.lastError = String(err?.message || err).slice(0, 500);
      saveDB();
      if (manual) throw err;
      console.warn(`YouTube Ping ${sub.id} failed:`, sub.lastError);
      return { newCount: 0, error: sub.lastError };
    }
  }

  async function checkAll() {
    if (checking) return;
    checking = true;
    try {
      const store = ensureStore(db);
      for (const [guildId, subs] of Object.entries(store.guilds)) {
        if (!isGuildApproved?.(guildId) || !Array.isArray(subs)) continue;
        for (const sub of subs) await checkSubscription(sub).catch(() => {});
      }
    } finally {
      checking = false;
    }
  }

  function start() {
    ensureStore(db);
    if (timer) clearInterval(timer);
    setTimeout(() => checkAll().catch(() => {}), 8_000);
    timer = setInterval(() => checkAll().catch(() => {}), POLL_MS);
    timer.unref?.();
    console.log(`YouTube Ping System aktiv – Prüfung alle ${Math.round(POLL_MS / 1000)}s.`);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function addSubscription(interaction) {
    if (!canManage(interaction)) return interaction.reply({ content: '❌ Dafür brauchst du **Server verwalten** oder **Kanäle verwalten**.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rawLink = interaction.options.getString('link', true);
    const target = interaction.options.getChannel('kanal', true);
    const pingRole = interaction.options.getRole('ping');
    const me = interaction.guild.members.me;
    const perms = target.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel) || !perms?.has(PermissionsBitField.Flags.SendMessages) || !perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
      return interaction.editReply('❌ Ich brauche im ausgewählten Kanal **Kanal ansehen**, **Nachrichten senden** und **Links einbetten**.');
    }
    try {
      const channelId = await resolveChannelId(rawLink);
      const feed = await fetchChannelFeed(channelId);
      const subs = guildSubs(db, interaction.guild.id);
      const existing = subs.find(s => s.youtubeChannelId === channelId && s.discordChannelId === target.id);
      if (existing) {
        existing.pingRoleId = pingRole?.id || null;
        existing.sourceUrl = rawLink;
        existing.youtubeName = feed.channelTitle || existing.youtubeName;
        existing.seenVideoIds = feed.entries.map(e => e.videoId).slice(0, MAX_SEEN);
        existing.initialized = true;
        existing.lastVideoId = feed.entries[0]?.videoId || null;
        existing.updatedAt = Date.now();
        saveDB();
        return interaction.editReply(`✅ **${existing.youtubeName}** wird bereits in ${target} überwacht. Einstellungen wurden aktualisiert.\nNeue Videos und Shorts werden ab jetzt dort gepostet.`);
      }
      const sub = {
        id: nextId(),
        guildId: interaction.guild.id,
        youtubeChannelId: channelId,
        youtubeName: feed.channelTitle || 'YouTube Kanal',
        sourceUrl: rawLink,
        discordChannelId: target.id,
        pingRoleId: pingRole?.id || null,
        seenVideoIds: feed.entries.map(e => e.videoId).slice(0, MAX_SEEN),
        lastVideoId: feed.entries[0]?.videoId || null,
        initialized: true,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
        lastCheckedAt: Date.now(),
        lastSuccessAt: Date.now(),
        lastError: null
      };
      subs.push(sub);
      saveDB();
      return interaction.editReply(`✅ **YouTube Ping eingerichtet!**\n\n📺 Kanal: **${sub.youtubeName}**\n🔗 Channel-ID: \`${channelId}\`\n📣 Discord: ${target}\n${pingRole ? `🔔 Ping: ${pingRole}\n` : ''}🆔 ID: \`${sub.id}\`\n\nAlte Uploads werden **nicht** gepingt. Ab dem nächsten neuen Video oder Short kommt automatisch eine Benachrichtigung.`);
    } catch (err) {
      return interaction.editReply(`❌ YouTube-Kanal konnte nicht eingerichtet werden.\n${String(err?.message || err).slice(0, 1200)}`);
    }
  }

  async function listSubscriptions(interaction) {
    const subs = guildSubs(db, interaction.guild.id);
    if (!subs.length) return interaction.reply({ content: '📺 Auf diesem Server wird noch kein YouTube-Kanal überwacht.\nNutze `/youtube add`.', flags: MessageFlags.Ephemeral });
    const lines = subs.map((s, i) => {
      const dest = interaction.guild.channels.cache.get(s.discordChannelId);
      const role = s.pingRoleId ? interaction.guild.roles.cache.get(s.pingRoleId) : null;
      const status = s.lastError ? `⚠️ ${truncate(s.lastError, 80)}` : '✅ aktiv';
      return `${i + 1}. **${s.youtubeName || s.youtubeChannelId}** • \`${s.id}\`\n   → ${dest || `#${s.discordChannelId}`} ${role ? `• Ping ${role}` : ''} • ${status}`;
    });
    return interaction.reply({ content: `📺 **YouTube Upload Pings (${subs.length})**\n\n${lines.join('\n\n')}`, flags: MessageFlags.Ephemeral });
  }

  async function removeSubscription(interaction) {
    if (!canManage(interaction)) return interaction.reply({ content: '❌ Dafür brauchst du **Server verwalten** oder **Kanäle verwalten**.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('id', true).trim().toUpperCase();
    const subs = guildSubs(db, interaction.guild.id);
    const index = subs.findIndex(s => String(s.id).toUpperCase() === id);
    if (index < 0) return interaction.reply({ content: `❌ Keine Überwachung mit ID \`${id}\` gefunden.`, flags: MessageFlags.Ephemeral });
    const [removed] = subs.splice(index, 1);
    saveDB();
    return interaction.reply({ content: `🗑️ **${removed.youtubeName || removed.youtubeChannelId}** wurde aus dem YouTube-Ping-System entfernt.`, flags: MessageFlags.Ephemeral });
  }

  async function testSubscription(interaction) {
    if (!canManage(interaction)) return interaction.reply({ content: '❌ Dafür brauchst du **Server verwalten** oder **Kanäle verwalten**.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('id', true).trim().toUpperCase();
    const sub = guildSubs(db, interaction.guild.id).find(s => String(s.id).toUpperCase() === id);
    if (!sub) return interaction.editReply(`❌ Keine Überwachung mit ID \`${id}\` gefunden.`);
    try {
      const feed = await fetchChannelFeed(sub.youtubeChannelId);
      const latest = feed.entries[0];
      if (!latest) return interaction.editReply('❌ Kein Upload zum Testen gefunden.');
      const result = await postUpload(sub, latest, { test: true });
      if (!result.ok) return interaction.editReply(`❌ Test konnte nicht gesendet werden: ${result.reason}`);
      return interaction.editReply(`✅ Test für **${feed.channelTitle}** wurde in <#${sub.discordChannelId}> gesendet.`);
    } catch (err) {
      return interaction.editReply(`❌ Test fehlgeschlagen: ${String(err?.message || err).slice(0, 1000)}`);
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.guild || !isGuildApproved?.(interaction.guild.id)) return false;
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'youtube') return false;
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') await addSubscription(interaction);
    else if (sub === 'list') await listSubscriptions(interaction);
    else if (sub === 'remove') await removeSubscription(interaction);
    else if (sub === 'test') await testSubscription(interaction);
    else if (sub === 'check') {
      if (!canManage(interaction)) await interaction.reply({ content: '❌ Dafür brauchst du **Server verwalten** oder **Kanäle verwalten**.', flags: MessageFlags.Ephemeral });
      else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const subs = guildSubs(db, interaction.guild.id);
        let found = 0;
        let errors = 0;
        for (const s of subs) {
          try { const r = await checkSubscription(s, { manual: true }); found += r.newCount || 0; } catch { errors += 1; }
        }
        await interaction.editReply(`🔄 Prüfung fertig. **${found}** neue Upload(s) gepostet.${errors ? ` ⚠️ ${errors} Fehler.` : ''}`);
      }
    }
    return true;
  }

  return { handleInteraction, start, stop, checkAll };
}

module.exports = { buildYouTubePingCommands: youtubeCommands, createYouTubePing };
