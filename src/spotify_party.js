const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField
} = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');

const DEFAULT_PLAYLIST_URL = process.env.SPOTIFY_PLAYLIST_URL || 'https://open.spotify.com/playlist/3oVDosIUz6bQpEJIgIsEzK';
const DEFAULT_PLAYLIST_ID = extractPlaylistId(DEFAULT_PLAYLIST_URL) || '3oVDosIUz6bQpEJIgIsEzK';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_MARKET = String(process.env.SPOTIFY_MARKET || 'DE').toUpperCase();

function extractPlaylistId(url = '') {
  const match = String(url).match(/playlist\/([A-Za-z0-9]+)/i);
  return match?.[1] || null;
}

function msToTime(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function progressBar(current, total, width = 16) {
  if (!total || total <= 0) return '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
  const ratio = Math.max(0, Math.min(1, current / total));
  const pos = Math.min(width - 1, Math.floor(ratio * width));
  return Array.from({ length: width }, (_, i) => i === pos ? '🔘' : '▬').join('');
}

function truncate(text, n = 100) {
  const s = String(text || '');
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}

function buildSpotifyPartyCommands() {
  return [
    new SlashCommandBuilder()
      .setName('spotify')
      .setDescription('Spotify Listening Party mit der festen Community-Playlist.')
      .addSubcommand(s => s.setName('start').setDescription('Startet die Spotify Listening Party in deinem Voice-Channel.'))
      .addSubcommand(s => s.setName('now').setDescription('Zeigt den aktuellen Party-Track.'))
      .addSubcommand(s => s.setName('playlist').setDescription('Zeigt die geladenen Tracks der Community-Playlist.'))
      .addSubcommand(s => s.setName('stop').setDescription('Beendet die Spotify Listening Party.'))
  ];
}

function createSpotifyParty({ client, footer, isGuildApproved }) {
  const sessions = new Map();
  let tokenCache = { token: null, expiresAt: 0 };

  async function spotifyToken() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      const err = new Error('SPOTIFY_NOT_CONFIGURED');
      err.code = 'SPOTIFY_NOT_CONFIGURED';
      throw err;
    }
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.token;

    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    if (!res.ok) throw new Error(`SPOTIFY_TOKEN_${res.status}`);
    const json = await res.json();
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + Math.max(60, Number(json.expires_in || 3600)) * 1000
    };
    return tokenCache.token;
  }

  async function spotifyGet(url) {
    const token = await spotifyToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 429) {
      const retry = Math.max(1, Number(res.headers.get('retry-after') || 2));
      await new Promise(r => setTimeout(r, retry * 1000));
      return spotifyGet(url);
    }
    if (!res.ok) throw new Error(`SPOTIFY_API_${res.status}`);
    return res.json();
  }

  async function loadPlaylist() {
    const id = DEFAULT_PLAYLIST_ID;
    const first = await spotifyGet(`https://api.spotify.com/v1/playlists/${id}?market=${encodeURIComponent(SPOTIFY_MARKET)}`);
    const tracks = [];
    let page = first.tracks;
    while (page && tracks.length < 300) {
      for (const item of page.items || []) {
        const t = item?.track || item?.item;
        if (!t || !t.name || !t.external_urls?.spotify) continue;
        tracks.push({
          id: t.id || null,
          name: t.name,
          artists: (t.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
          durationMs: Number(t.duration_ms || 0),
          url: t.external_urls.spotify,
          explicit: Boolean(t.explicit),
          cover: t.album?.images?.[0]?.url || null
        });
      }
      if (!page.next || tracks.length >= 300) break;
      page = await spotifyGet(page.next);
    }
    return {
      id,
      name: first.name || 'Community Spotify Playlist',
      owner: first.owner?.display_name || first.owner?.id || 'Spotify',
      url: first.external_urls?.spotify || DEFAULT_PLAYLIST_URL,
      image: first.images?.[0]?.url || null,
      tracks
    };
  }

  function currentTrack(session) {
    return session.playlist?.tracks?.[session.index] || null;
  }

  function sessionElapsed(session) {
    if (!session.isPlaying) return session.elapsedMs || 0;
    return Math.max(0, (session.elapsedMs || 0) + (Date.now() - session.startedAt));
  }

  function saveElapsed(session) {
    session.elapsedMs = sessionElapsed(session);
    session.startedAt = Date.now();
  }

  function clearTimer(session) {
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
  }

  function scheduleAdvance(session) {
    clearTimer(session);
    if (!session.isPlaying) return;
    const track = currentTrack(session);
    if (!track?.durationMs) return;
    const remaining = Math.max(500, track.durationMs - sessionElapsed(session));
    session.timer = setTimeout(async () => {
      await nextTrack(session, true).catch(() => {});
    }, remaining);
  }

  function pickNextIndex(session) {
    const count = session.playlist.tracks.length;
    if (!count) return 0;
    if (session.repeat === 'one') return session.index;
    if (session.shuffle && count > 1) {
      let next = session.index;
      for (let i = 0; i < 8 && next === session.index; i++) next = Math.floor(Math.random() * count);
      return next;
    }
    const next = session.index + 1;
    if (next >= count) return session.repeat === 'all' ? 0 : -1;
    return next;
  }

  async function nextTrack(session, automatic = false) {
    const next = pickNextIndex(session);
    if (next < 0) {
      session.isPlaying = false;
      session.elapsedMs = 0;
      clearTimer(session);
      await updatePanel(session, automatic ? '🏁 Playlist beendet.' : null);
      return;
    }
    session.index = next;
    session.elapsedMs = 0;
    session.startedAt = Date.now();
    session.isPlaying = true;
    scheduleAdvance(session);
    await updatePanel(session);
  }

  async function previousTrack(session) {
    const count = session.playlist.tracks.length;
    if (!count) return;
    session.index = (session.index - 1 + count) % count;
    session.elapsedMs = 0;
    session.startedAt = Date.now();
    session.isPlaying = true;
    scheduleAdvance(session);
    await updatePanel(session);
  }

  function partyEmbed(session, note = null) {
    const track = currentTrack(session);
    const elapsed = Math.min(sessionElapsed(session), track?.durationMs || 0);
    const voiceMention = session.voiceChannelId ? `<#${session.voiceChannelId}>` : '—';
    const status = session.isPlaying ? '▶️ Läuft' : '⏸️ Pausiert';
    const repeatLabel = session.repeat === 'one' ? '1 Track' : session.repeat === 'all' ? 'Alle' : 'Aus';

    const embed = footer(new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎧 Spotify Listening Party')
      .setDescription(track
        ? `**${truncate(track.name, 120)}**\n${truncate(track.artists, 120)}\n\n${progressBar(elapsed, track.durationMs)}\n\`${msToTime(elapsed)} / ${msToTime(track.durationMs)}\``
        : 'Keine Tracks geladen.')
      .addFields(
        { name: 'Playlist', value: `[${truncate(session.playlist.name, 90)}](${session.playlist.url})`, inline: false },
        { name: 'Voice', value: voiceMention, inline: true },
        { name: 'Status', value: status, inline: true },
        { name: 'Track', value: `${session.index + 1}/${session.playlist.tracks.length}`, inline: true },
        { name: 'Shuffle', value: session.shuffle ? '✅ An' : '❌ Aus', inline: true },
        { name: 'Repeat', value: repeatLabel, inline: true },
        { name: 'Host', value: `<@${session.hostId}>`, inline: true }
      )
      .setTimestamp());
    if (track?.cover) embed.setThumbnail(track.cover);
    if (note) embed.setFooter({ text: `Made with ❤️ by Stilo • ${note}` });
    return embed;
  }

  function partyRows(session) {
    const track = currentTrack(session);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('spotify_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('spotify_toggle').setEmoji(session.isPlaying ? '⏸️' : '▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('spotify_next').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('spotify_shuffle').setEmoji('🔀').setStyle(session.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('spotify_repeat').setEmoji('🔁').setStyle(session.repeat !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('spotify_queue').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('spotify_sync').setLabel('Sync').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('Track öffnen').setEmoji('🟢').setStyle(ButtonStyle.Link).setURL(track?.url || session.playlist.url),
      new ButtonBuilder().setLabel('Playlist').setEmoji('🎵').setStyle(ButtonStyle.Link).setURL(session.playlist.url),
      new ButtonBuilder().setCustomId('spotify_stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
    );
    return [row1, row2];
  }

  async function updatePanel(session, note = null) {
    if (!session.messageId || !session.textChannelId) return;
    const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const msg = await channel.messages.fetch(session.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [partyEmbed(session, note)], components: partyRows(session) }).catch(() => {});
  }

  function userCanControl(interaction, session) {
    const memberVoice = interaction.member?.voice?.channelId;
    if (memberVoice && memberVoice === session.voiceChannelId) return true;
    if (interaction.user.id === session.hostId) return true;
    return interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild) || false;
  }

  async function startParty(interaction) {
    const voice = interaction.member?.voice?.channel;
    if (!voice) {
      return interaction.reply({ content: '❌ Geh zuerst in einen Voice-Channel und starte dann `/spotify start`.', flags: MessageFlags.Ephemeral });
    }
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      return interaction.reply({
        content: '⚙️ Spotify ist noch nicht eingerichtet. Setze in Railway `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET`.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();
    let playlist;
    try {
      playlist = await loadPlaylist();
    } catch (err) {
      console.error('Spotify playlist load failed:', err);
      return interaction.editReply('❌ Die Spotify-Playlist konnte gerade nicht geladen werden. Prüfe Client-ID/Secret und versuche es erneut.');
    }
    if (!playlist.tracks.length) return interaction.editReply('❌ Spotify hat für diese Playlist keine Tracks geliefert.');

    const old = sessions.get(interaction.guild.id);
    if (old) {
      clearTimer(old);
      try { getVoiceConnection(interaction.guild.id)?.destroy(); } catch {}
      sessions.delete(interaction.guild.id);
    }

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voice.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (err) {
      try { connection?.destroy(); } catch {}
      console.error('Spotify party voice join failed:', err);
      return interaction.editReply('❌ Ich konnte dem Voice-Channel nicht beitreten. Prüfe **Verbinden** und **Sprechen** für den Bot.');
    }

    const session = {
      guildId: interaction.guild.id,
      voiceChannelId: voice.id,
      textChannelId: interaction.channel.id,
      messageId: null,
      hostId: interaction.user.id,
      playlist,
      index: 0,
      isPlaying: true,
      shuffle: false,
      repeat: 'all',
      elapsedMs: 0,
      startedAt: Date.now(),
      timer: null
    };
    sessions.set(interaction.guild.id, session);

    const sent = await interaction.editReply({ embeds: [partyEmbed(session)], components: partyRows(session) });
    session.messageId = sent.id;
    scheduleAdvance(session);
    return;
  }

  async function stopParty(guildId, note = 'Party beendet') {
    const session = sessions.get(guildId);
    if (!session) return false;
    clearTimer(session);
    session.isPlaying = false;
    await updatePanel(session, note).catch(() => {});
    try { getVoiceConnection(guildId)?.destroy(); } catch {}
    sessions.delete(guildId);
    return true;
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'start') return startParty(interaction);

    const session = sessions.get(interaction.guild.id);
    if (sub === 'now') {
      if (!session) return interaction.reply({ content: '🎧 Auf diesem Server läuft gerade keine Spotify Listening Party.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [partyEmbed(session)], components: partyRows(session), flags: MessageFlags.Ephemeral });
    }
    if (sub === 'playlist') {
      if (!session) {
        return interaction.reply({ content: `🎵 Vorgefertigte Playlist:\n${DEFAULT_PLAYLIST_URL}\n\nStarte sie mit **/spotify start**.`, flags: MessageFlags.Ephemeral });
      }
      const lines = session.playlist.tracks.slice(0, 25).map((t, i) => `${i + 1}. **${truncate(t.name, 55)}** — ${truncate(t.artists, 55)}`);
      const extra = session.playlist.tracks.length > 25 ? `\n… und ${session.playlist.tracks.length - 25} weitere.` : '';
      return interaction.reply({
        content: `🎵 **${session.playlist.name}**\n${lines.join('\n')}${extra}\n\n${session.playlist.url}`,
        flags: MessageFlags.Ephemeral
      });
    }
    if (sub === 'stop') {
      if (!session) return interaction.reply({ content: 'ℹ️ Es läuft gerade keine Party.', flags: MessageFlags.Ephemeral });
      if (!userCanControl(interaction, session)) return interaction.reply({ content: '❌ Du musst im Party-VC sein oder Server verwalten dürfen.', flags: MessageFlags.Ephemeral });
      await stopParty(interaction.guild.id, `Beendet von ${interaction.user.username}`);
      return interaction.reply({ content: '⏹️ Spotify Listening Party beendet.', flags: MessageFlags.Ephemeral });
    }
  }

  async function handleButton(interaction) {
    const session = sessions.get(interaction.guild.id);
    if (!session) return interaction.reply({ content: '⌛ Diese Spotify-Party läuft nicht mehr.', flags: MessageFlags.Ephemeral });
    if (!userCanControl(interaction, session)) {
      return interaction.reply({ content: '❌ Geh in den Party-Voice-Channel, um die Wiedergabe zu steuern.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'spotify_queue') {
      const upcoming = [];
      for (let n = 0; n < Math.min(12, session.playlist.tracks.length); n++) {
        const idx = (session.index + n) % session.playlist.tracks.length;
        const t = session.playlist.tracks[idx];
        upcoming.push(`${n === 0 ? '▶️' : `${n + 1}.`} **${truncate(t.name, 60)}** — ${truncate(t.artists, 45)}`);
      }
      return interaction.reply({ content: `📜 **Party Queue**\n${upcoming.join('\n')}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'spotify_sync') {
      const t = currentTrack(session);
      const elapsed = sessionElapsed(session);
      return interaction.reply({
        content: `🎯 **Sync**\nÖffne **${t.name} – ${t.artists}** auf Spotify und springe ungefähr auf **${msToTime(elapsed)}**.\n${t.url}`,
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferUpdate();
    if (interaction.customId === 'spotify_prev') return previousTrack(session);
    if (interaction.customId === 'spotify_next') return nextTrack(session, false);
    if (interaction.customId === 'spotify_toggle') {
      if (session.isPlaying) {
        saveElapsed(session);
        session.isPlaying = false;
        clearTimer(session);
      } else {
        const t = currentTrack(session);
        if (t?.durationMs && session.elapsedMs >= t.durationMs) session.elapsedMs = 0;
        session.startedAt = Date.now();
        session.isPlaying = true;
        scheduleAdvance(session);
      }
      return updatePanel(session);
    }
    if (interaction.customId === 'spotify_shuffle') {
      session.shuffle = !session.shuffle;
      return updatePanel(session);
    }
    if (interaction.customId === 'spotify_repeat') {
      session.repeat = session.repeat === 'off' ? 'all' : session.repeat === 'all' ? 'one' : 'off';
      return updatePanel(session);
    }
    if (interaction.customId === 'spotify_stop') {
      return stopParty(interaction.guild.id, `Beendet von ${interaction.user.username}`);
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.guild || !isGuildApproved?.(interaction.guild.id)) return false;
    if (interaction.isChatInputCommand() && interaction.commandName === 'spotify') {
      await handleCommand(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith('spotify_')) {
      await handleButton(interaction);
      return true;
    }
    return false;
  }

  async function handleVoiceState(oldState, newState) {
    const session = sessions.get(oldState.guild.id || newState.guild.id);
    if (!session) return;
    const guild = oldState.guild || newState.guild;
    const channel = guild.channels.cache.get(session.voiceChannelId);
    if (!channel?.members) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) {
      setTimeout(async () => {
        const fresh = guild.channels.cache.get(session.voiceChannelId);
        const stillEmpty = !fresh?.members?.some(m => !m.user.bot);
        if (stillEmpty && sessions.get(guild.id) === session) await stopParty(guild.id, 'VC leer – Party automatisch beendet');
      }, 60_000);
    }
  }

  function onShutdown() {
    for (const session of sessions.values()) clearTimer(session);
    sessions.clear();
  }

  return {
    handleInteraction,
    handleVoiceState,
    onShutdown,
    defaultPlaylistUrl: DEFAULT_PLAYLIST_URL
  };
}

module.exports = {
  buildSpotifyPartyCommands,
  createSpotifyParty
};
