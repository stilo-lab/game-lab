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
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PLAYLIST_URL = process.env.SPOTIFY_PLAYLIST_URL || 'https://open.spotify.com/playlist/3oVDosIUz6bQpEJIgIsEzK';
const DEFAULT_PLAYLIST_ID = extractPlaylistId(DEFAULT_PLAYLIST_URL) || '3oVDosIUz6bQpEJIgIsEzK';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_MARKET = String(process.env.SPOTIFY_MARKET || 'DE').toUpperCase();
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_PATH = path.join(DATA_DIR, 'spotify_auth.json');

function redirectUri() {
  const explicit = String(process.env.SPOTIFY_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return domain ? `https://${domain}/spotify/callback` : '';
}

const SPOTIFY_REDIRECT_URI = redirectUri();
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private'
].join(' ');

const FALLBACK_PLAYLIST = [
  ['MONTAGEM GUERREIRO - Slowed', 'Avenxir, SUNJI', '1:14'],
  ['MONTAGEM RINGO - Slowed', 'SCHWVFTY', '1:24'],
  ['VANITY FUNK - SUPER SLOWED', 'NTRXBRST', '1:56'],
  ['MEOW BOSS - Slowed', 'SLAVYAN13, DJ CHANSEY', '1:44'],
  ['CHOP MAGIA - Ultra Slowed', 'CASAP, CHIEF DORO', '1:27'],
  ['CHOP MAGIA - Slowed', 'CASAP, CHIEF DORO', '1:22'],
  ['MONTAGEM GLORIA - Slowed', 'Rushex, Avenxir, MONTAGEM', '1:31'],
  ['MONTAGEM GLORIA - Ultra Slowed', 'Rushex, Avenxir, MONTAGEM', '1:42'],
  ['JABIK - Slowed', 'DJ VASILY', '1:13'],
  ['pursuit - super slowed', 'isq', '2:04'],
  ['NATI NATI - Ultra Slowed', 'TRVXER, 0ketaminxe', '2:10'],
  ['MONTAGEM KOKORO - SLOWED', 'Dj Samir, Nulteex, R9X', '1:42'],
  ['LAST CHANCE FUNK - Slowed Version', 'TEENWXVE', '1:35'],
  ['FUNK SERENO', 'ICEDMANE, DYSMANE', '2:10'],
  ['FUNK SERENO - SLOWED', 'ICEDMANE, DYSMANE', '2:25'],
  ['MONTAGEM UNKNOWN - Slowed', 'AKXNESHIVA, Avenxir, HamiBeats', '1:20'],
  ['MONTAGEM RITMADA - Super Slowed', 'cape, MXSTERIXD, Tonzão', '1:37'],
  ['MONTAGEM FEARLESS - Ultra Slowed', 'lirvie, DJ eu4oria, DJ FZ DA ZN, Matra!', '2:32'],
  ['TIKI TIKI - Super Slowed', 'QMIIR, SALIMA CHICA', '2:35'],
  ['TIKI TIKI - Slowed', 'QMIIR, SALIMA CHICA', '2:01'],
  ['MONTAGEM ALQUIMIA - SLOWED', 'h6itam, n7san7os, Mc Menor Do Alvorada', '1:53'],
  ['BAD ENDING FUNK', 'Shimuda, SlowlyDying', '1:10'],
  ['SAD! - FUNK', 'MEMPHX, SEKIMANE', '1:22'],
  ['PASSO BEM SOLTO - Slowed', 'ATLXS', '1:56'],
  ['VOCE NA MIRA - Slowed', 'Hwungii, DJ VGK1', '2:50'],
  ['FUNK CRIMINAL - SLOWED', 'ICEDMANE, DYSMANE', '1:32'],
  ['FUNK CRIMINAL - SUPER SLOWED', 'ICEDMANE, DYSMANE', '1:44'],
  ['VAZIO ETERNO - Slowed', 'LUMIX, KXRSED, LXSTFFACE, MC LyC4N', '1:49'],
  ['Dia De Fiesta - Super Slowed', 'qaraqshy, !Nxght, ZNVUTY', '2:00'],
  ['MONTAGEM PERIGOSA - Slowed', 'KVRXD, SEKIMANE, Dj Samir', '1:32'],
  ['MONTAGEM COLASO - SUPER SLOWED', 'Hugomasked, B3ATZ, FVNK.Ltd', '2:00'],
  ['NO BATIDÃO - Slowed', 'ZXKAI, slxughter', '1:47'],
  ['YANI MA - Super Slowed', 'DJ Javi26, MXZI, Mc Staff', '1:14'],
  ['BAILA CONMIGO - Extreme Slowed', "Yb Wasg'ood", '1:59'],
  ['LOUCURA LETAL - Super Slowed', 'Nakama, Nxxkz', '1:42'],
  ['LOUCURA LETAL - Ultra Slowed', 'Nakama, Nxxkz', '1:55'],
  ['MONTAGEM TORMENTA - Slowed', 'qaraqshy, GUSTXV', '2:05'],
  ['LUA MORTE - Ultra Slowed', 'Sayfalse, nulled., RVNGE, Dj Samir', '2:18'],
  ['MONTAGEM SILICONADE - Slowed', 'SICXRIUS', '1:49'],
  ['MONTAGEM PEGADORA - Super Slowed', 'Rubikdice, Chilx, WAA', '1:50'],
  ['MONTAGEM APOLLO - Slowed', 'SCHWVFTY', '1:39'],
  ['MUTILATOR (ULTRA SLOWED)', 'ZMAJOR, Lurk', '2:16'],
  ['MUTILATOR (SLOWED)', 'ZMAJOR, Lurk', '1:49'],
  ['MONTAGEM SETHRON - Ultra Slowed', 'SASORIIXPP, Zhanbxqq, DJ Javi26', '1:52'],
  ['YALA - Slowed', 'QMIIR, DJ Zarek, Irokz', '2:39']
].map(([name, artists, duration]) => {
  const [m, sec] = duration.split(':').map(Number);
  const query = `${name} ${artists}`;
  return {
    id: null,
    name,
    artists,
    durationMs: ((m || 0) * 60 + (sec || 0)) * 1000,
    url: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    explicit: false,
    cover: null,
    fallback: true
  };
});

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

function loadAuthStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(AUTH_PATH)) return { guilds: {} };
    const parsed = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    return parsed;
  } catch {
    return { guilds: {} };
  }
}

function saveAuthStore(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${AUTH_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, AUTH_PATH);
  try { fs.chmodSync(AUTH_PATH, 0o600); } catch {}
}

function buildSpotifyPartyCommands() {
  return [
    new SlashCommandBuilder()
      .setName('spotify')
      .setDescription('Spotify Connect Party mit der festen Community-Playlist.')
      .addSubcommand(s => s.setName('connect').setDescription('Verbindet ein Spotify-Konto mit diesem Server.'))
      .addSubcommand(s => s.setName('status').setDescription('Zeigt Spotify-Verbindung und verfügbare Geräte.'))
      .addSubcommand(s => s.setName('disconnect').setDescription('Trennt das Spotify-Konto dieses Servers.'))
      .addSubcommand(s => s.setName('start').setDescription('Startet die Playlist auf deinem Spotify-Gerät und öffnet die VC-Steuerung.'))
      .addSubcommand(s => s.setName('now').setDescription('Zeigt den aktuell laufenden Spotify-Track.'))
      .addSubcommand(s => s.setName('playlist').setDescription('Zeigt die Titel der Community-Playlist.'))
      .addSubcommand(s => s.setName('play').setDescription('Spielt einen bestimmten Titel der Community-Playlist.')
        .addIntegerOption(o => o.setName('nummer').setDescription('Tracknummer aus /spotify playlist').setMinValue(1).setMaxValue(45).setRequired(true)))
      .addSubcommand(s => s.setName('stop').setDescription('Pausiert Spotify und beendet die VC-Party.'))
  ];
}

function createSpotifyParty({ client, footer, isGuildApproved }) {
  const sessions = new Map();
  const authStore = loadAuthStore();
  const pendingStates = new Map();
  let appTokenCache = { token: null, expiresAt: 0 };
  const resolvedTrackCache = new Map();
  let oauthServer = null;

  function isManager(interaction) {
    return interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild) ||
      interaction.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator);
  }

  function authRecord(guildId) {
    return authStore.guilds[String(guildId)] || null;
  }

  function setAuthRecord(guildId, value) {
    if (value) authStore.guilds[String(guildId)] = value;
    else delete authStore.guilds[String(guildId)];
    saveAuthStore(authStore);
  }

  function oauthConfigured() {
    return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI);
  }

  function oauthUrl(guildId, userId) {
    if (!oauthConfigured()) return null;
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { guildId: String(guildId), userId: String(userId), createdAt: Date.now() });
    const u = new URL('https://accounts.spotify.com/authorize');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    u.searchParams.set('scope', SPOTIFY_SCOPES);
    u.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    u.searchParams.set('state', state);
    u.searchParams.set('show_dialog', 'true');
    return u.toString();
  }

  async function tokenRequest(params) {
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`SPOTIFY_TOKEN_${res.status}:${json.error_description || json.error || 'unknown'}`);
    return json;
  }

  async function exchangeCode(code) {
    return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI });
  }

  async function refreshGuildToken(guildId, force = false) {
    const rec = authRecord(guildId);
    if (!rec?.refreshToken) throw new Error('SPOTIFY_NOT_CONNECTED');
    if (!force && rec.accessToken && Number(rec.expiresAt || 0) > Date.now() + 45_000) return rec.accessToken;
    const json = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rec.refreshToken });
    rec.accessToken = json.access_token;
    rec.expiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
    if (json.refresh_token) rec.refreshToken = json.refresh_token;
    setAuthRecord(guildId, rec);
    return rec.accessToken;
  }

  async function userApi(guildId, endpoint, options = {}, retry = true) {
    const token = await refreshGuildToken(guildId);
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (res.status === 401 && retry) {
      await refreshGuildToken(guildId, true);
      return userApi(guildId, endpoint, options, false);
    }
    if (res.status === 204) return null;
    if (res.status === 429) {
      const wait = Math.max(1, Number(res.headers.get('retry-after') || 2));
      await new Promise(r => setTimeout(r, wait * 1000));
      if (retry) return userApi(guildId, endpoint, options, false);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`SPOTIFY_USER_API_${res.status}:${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function appToken() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) throw new Error('SPOTIFY_NOT_CONFIGURED');
    if (appTokenCache.token && Date.now() < appTokenCache.expiresAt - 30_000) return appTokenCache.token;
    const json = await tokenRequest({ grant_type: 'client_credentials' });
    appTokenCache = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
    return appTokenCache.token;
  }

  async function appGet(url) {
    const token = await appToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`SPOTIFY_APP_API_${res.status}`);
    return res.json();
  }

  async function profileForToken(token) {
    const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json();
  }

  function callbackHtml(ok, text) {
    const title = ok ? 'Spotify verbunden ✅' : 'Spotify Fehler ❌';
    const safe = String(text || '').replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;background:#121212;color:white;padding:40px"><h1>${title}</h1><p>${safe}</p><p>Du kannst dieses Fenster schließen und zu Discord zurückgehen.</p></body></html>`;
  }

  function startOAuthServer() {
    if (oauthServer) return;
    const port = Number(process.env.PORT || 3000);
    let callbackPath = '/spotify/callback';
    try { callbackPath = new URL(SPOTIFY_REDIRECT_URI || 'http://localhost/spotify/callback').pathname || callbackPath; } catch {}
    oauthServer = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (u.pathname === '/health') { res.writeHead(200, { 'Content-Type':'text/plain' }); return res.end('ok'); }
        if (u.pathname !== callbackPath) { res.writeHead(404, { 'Content-Type':'text/plain' }); return res.end('Not found'); }
        const error = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        const state = u.searchParams.get('state');
        const pending = state ? pendingStates.get(state) : null;
        if (state) pendingStates.delete(state);
        if (error) { res.writeHead(400, { 'Content-Type':'text/html; charset=utf-8' }); return res.end(callbackHtml(false, `Spotify: ${error}`)); }
        if (!code || !pending || Date.now() - pending.createdAt > 10 * 60_000) { res.writeHead(400, { 'Content-Type':'text/html; charset=utf-8' }); return res.end(callbackHtml(false, 'Der Login-Link ist abgelaufen. Starte /spotify connect erneut.')); }
        const token = await exchangeCode(code);
        const profile = await profileForToken(token.access_token);
        const previous = authRecord(pending.guildId) || {};
        setAuthRecord(pending.guildId, {
          ...previous,
          userId: pending.userId,
          spotifyUserId: profile?.id || previous.spotifyUserId || null,
          displayName: profile?.display_name || profile?.id || previous.displayName || 'Spotify User',
          product: profile?.product || previous.product || null,
          refreshToken: token.refresh_token || previous.refreshToken,
          accessToken: token.access_token,
          expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
          connectedAt: Date.now()
        });
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
        return res.end(callbackHtml(true, `Verbunden mit ${profile?.display_name || profile?.id || 'Spotify'}.`));
      } catch (err) {
        console.error('Spotify OAuth callback failed:', err);
        res.writeHead(500, { 'Content-Type':'text/html; charset=utf-8' });
        return res.end(callbackHtml(false, 'Die Verbindung konnte nicht gespeichert werden.'));
      }
    });
    oauthServer.listen(port, '0.0.0.0', () => console.log(`Spotify OAuth/health server listening on port ${port}`));
    oauthServer.on('error', err => console.warn('Spotify OAuth server error:', err?.message || err));
  }

  startOAuthServer();

  async function resolveTrack(track) {
    if (!track?.fallback || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return track;
    const key = `${track.name}|${track.artists}`.toLowerCase();
    if (resolvedTrackCache.has(key)) return resolvedTrackCache.get(key);
    try {
      const q = encodeURIComponent(`track:${track.name} artist:${track.artists.split(',')[0].trim()}`);
      const data = await appGet(`https://api.spotify.com/v1/search?type=track&limit=5&q=${q}`);
      const hit = data?.tracks?.items?.[0];
      if (hit?.external_urls?.spotify) {
        const enriched = {
          ...track,
          id: hit.id || null,
          url: hit.external_urls.spotify,
          cover: hit.album?.images?.[0]?.url || track.cover,
          durationMs: Number(hit.duration_ms || track.durationMs),
          explicit: Boolean(hit.explicit),
          fallback: false
        };
        resolvedTrackCache.set(key, enriched);
        return enriched;
      }
    } catch (err) {
      console.warn('Spotify track resolve failed:', err?.message || err);
    }
    resolvedTrackCache.set(key, track);
    return track;
  }

  async function loadPlaylist() {
    let first = null;
    let tracks = [];
    try {
      if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
        first = await appGet(`https://api.spotify.com/v1/playlists/${DEFAULT_PLAYLIST_ID}?market=${encodeURIComponent(SPOTIFY_MARKET)}`);
        const page = first?.items || first?.tracks || null;
        for (const entry of page?.items || []) {
          const t = entry?.item || entry?.track;
          if (!t?.name) continue;
          const artists = (t.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist';
          tracks.push({ id:t.id || null, name:t.name, artists, durationMs:Number(t.duration_ms || 0), url:t.external_urls?.spotify || DEFAULT_PLAYLIST_URL, explicit:Boolean(t.explicit), cover:t.album?.images?.[0]?.url || null, fallback:false });
        }
      }
    } catch (err) {
      console.warn('Spotify playlist metadata unavailable; using fallback:', err?.message || err);
    }
    if (!tracks.length) tracks = FALLBACK_PLAYLIST.map(t => ({ ...t }));
    return {
      id: DEFAULT_PLAYLIST_ID,
      uri: `spotify:playlist:${DEFAULT_PLAYLIST_ID}`,
      name: first?.name || 'BEST PHONK/FUNK 2026🔥',
      owner: first?.owner?.display_name || first?.owner?.id || 'Community Playlist',
      url: first?.external_urls?.spotify || DEFAULT_PLAYLIST_URL,
      image: first?.images?.[0]?.url || null,
      tracks
    };
  }

  async function getDevices(guildId) {
    const data = await userApi(guildId, '/me/player/devices');
    return (data?.devices || []).filter(d => d && !d.is_restricted);
  }

  async function chooseDevice(guildId, preferredId = null) {
    const devices = await getDevices(guildId);
    return devices.find(d => d.id === preferredId) || devices.find(d => d.is_active) || devices[0] || null;
  }

  async function playbackState(guildId) {
    return userApi(guildId, '/me/player');
  }

  async function playPlaylist(guildId, deviceId, position = 0) {
    const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    await userApi(guildId, `/me/player/play${q}`, { method:'PUT', body: { context_uri:`spotify:playlist:${DEFAULT_PLAYLIST_ID}`, offset:{ position:Math.max(0, position) }, position_ms:0 } });
  }

  async function playerAction(guildId, endpoint, method = 'POST', body = null) {
    return userApi(guildId, endpoint, { method, body });
  }

  function spotifyErrorText(err) {
    if (err?.message === 'SPOTIFY_NOT_CONNECTED') return '❌ Spotify ist auf diesem Server noch nicht verbunden. Nutze `/spotify connect`.';
    if (err?.status === 403 || String(err?.message || '').includes('403')) return '❌ Spotify hat die Wiedergabe abgelehnt. Für Spotify Connect brauchst du **Spotify Premium** und ein nicht eingeschränktes Gerät.';
    if (err?.status === 404 || String(err?.message || '').includes('404')) return '❌ Kein aktives Spotify-Gerät gefunden. Öffne Spotify auf PC/Handy, starte kurz einen Song und versuche es nochmal.';
    return `❌ Spotify-Fehler: ${String(err?.message || err).slice(0, 220)}`;
  }

  function liveTrackFromState(state, fallbackTrack = null) {
    const t = state?.item;
    if (!t?.name) return fallbackTrack;
    return {
      id: t.id || null,
      name: t.name,
      artists: (t.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
      durationMs: Number(t.duration_ms || fallbackTrack?.durationMs || 0),
      url: t.external_urls?.spotify || fallbackTrack?.url || DEFAULT_PLAYLIST_URL,
      cover: t.album?.images?.[0]?.url || fallbackTrack?.cover || null
    };
  }

  async function syncSession(session) {
    try {
      const state = await playbackState(session.guildId);
      if (!state) return session;
      session.liveState = state;
      session.isPlaying = Boolean(state.is_playing);
      session.deviceId = state.device?.id || session.deviceId;
      session.deviceName = state.device?.name || session.deviceName;
      session.liveTrack = liveTrackFromState(state, session.playlist.tracks[session.index]);
      session.progressMs = Number(state.progress_ms || 0);
      const liveId = state.item?.id;
      if (liveId) {
        const idx = session.playlist.tracks.findIndex(t => t.id === liveId);
        if (idx >= 0) session.index = idx;
      }
    } catch (err) {
      console.warn('Spotify sync failed:', err?.message || err);
    }
    return session;
  }

  function currentTrack(session) {
    return session.liveTrack || session.playlist?.tracks?.[session.index] || null;
  }

  function partyEmbed(session, note = null) {
    const track = currentTrack(session);
    const elapsed = Number(session.progressMs || 0);
    const voiceMention = session.voiceChannelId ? `<#${session.voiceChannelId}>` : '—';
    const status = session.isPlaying ? '▶️ Läuft auf Spotify' : '⏸️ Pausiert';
    const repeatLabel = session.repeat === 'track' ? '1 Track' : session.repeat === 'context' ? 'Playlist' : 'Aus';
    const embed = footer(new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎧 Spotify Connect Party')
      .setDescription(track ? `**${truncate(track.name, 120)}**\n${truncate(track.artists, 120)}\n\n${progressBar(elapsed, track.durationMs)}\n\`${msToTime(elapsed)} / ${msToTime(track.durationMs)}\`` : 'Keine Wiedergabe gefunden.')
      .addFields(
        { name:'Playlist', value:`[${truncate(session.playlist.name, 90)}](${session.playlist.url})`, inline:false },
        { name:'Party-VC', value:voiceMention, inline:true },
        { name:'Spotify-Gerät', value:session.deviceName || 'unbekannt', inline:true },
        { name:'Status', value:status, inline:true },
        { name:'Shuffle', value:session.shuffle ? '✅ An' : '❌ Aus', inline:true },
        { name:'Repeat', value:repeatLabel, inline:true },
        { name:'Host', value:`<@${session.hostId}>`, inline:true },
        { name:'🔊 Wo hört man die Musik?', value:'Die Musik läuft **wirklich auf dem verbundenen Spotify-Gerät**. Der Discord-Bot rebroadcastet Spotify-Audio nicht in den VC.', inline:false }
      )
      .setTimestamp());
    if (track?.cover) embed.setThumbnail(track.cover);
    if (note) embed.setFooter({ text:`Made with ❤️ by Stilo • ${note}` });
    return embed;
  }

  function partyRows(session) {
    const track = currentTrack(session);
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spotify_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spotify_toggle').setEmoji(session.isPlaying ? '⏸️' : '▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('spotify_next').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spotify_shuffle').setEmoji('🔀').setStyle(session.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('spotify_repeat').setEmoji('🔁').setStyle(session.repeat !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spotify_queue').setLabel('Playlist').setEmoji('📜').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('spotify_sync').setLabel('Sync').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setLabel('Track öffnen').setEmoji('🟢').setStyle(ButtonStyle.Link).setURL(track?.url || session.playlist.url),
        new ButtonBuilder().setLabel('Playlist').setEmoji('🎵').setStyle(ButtonStyle.Link).setURL(session.playlist.url),
        new ButtonBuilder().setCustomId('spotify_stop').setLabel('Stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
      )
    ];
  }

  async function updatePanel(session, note = null) {
    await syncSession(session);
    if (!session.messageId || !session.textChannelId) return;
    const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const msg = await channel.messages.fetch(session.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds:[partyEmbed(session, note)], components:partyRows(session) }).catch(() => {});
  }

  function userCanControl(interaction, session) {
    const memberVoice = interaction.member?.voice?.channelId;
    if (memberVoice && memberVoice === session.voiceChannelId) return true;
    if (interaction.user.id === session.hostId) return true;
    return isManager(interaction);
  }

  async function connectCommand(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content:'❌ Dafür brauchst du **Server verwalten**.', flags:MessageFlags.Ephemeral });
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return interaction.reply({ content:'❌ `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` fehlen in Railway.', flags:MessageFlags.Ephemeral });
    if (!SPOTIFY_REDIRECT_URI) return interaction.reply({ content:'❌ Es fehlt eine öffentliche Callback-Adresse. Aktiviere in Railway eine **Public Domain** oder setze `SPOTIFY_REDIRECT_URI=https://DEINE-DOMAIN/spotify/callback` und trage exakt dieselbe URI im Spotify Developer Dashboard ein.', flags:MessageFlags.Ephemeral });
    const url = oauthUrl(interaction.guild.id, interaction.user.id);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Spotify verbinden').setEmoji('🟢').setURL(url));
    return interaction.reply({ content:`🎧 **Spotify Connect einrichten**\nKlicke auf den Button und melde dich mit dem Spotify-Konto an, das die Musik abspielen soll.\n\nRedirect URI: \`${SPOTIFY_REDIRECT_URI}\``, components:[row], flags:MessageFlags.Ephemeral });
  }

  async function statusCommand(interaction) {
    const rec = authRecord(interaction.guild.id);
    if (!rec?.refreshToken) return interaction.reply({ content:`❌ Noch nicht verbunden. Nutze \`/spotify connect\`.\nRedirect URI: \`${SPOTIFY_REDIRECT_URI || 'nicht konfiguriert'}\``, flags:MessageFlags.Ephemeral });
    try {
      const devices = await getDevices(interaction.guild.id);
      const lines = devices.length ? devices.map((d,i) => `${i+1}. ${d.is_active ? '🟢' : '⚪'} **${d.name}** (${d.type})`).join('\n') : 'Keine Geräte gefunden – Spotify auf PC/Handy öffnen.';
      return interaction.reply({ content:`✅ Verbunden mit **${rec.displayName || 'Spotify'}**${rec.product ? ` • ${rec.product}` : ''}\n\n**Geräte:**\n${lines}\n\nCallback: \`${SPOTIFY_REDIRECT_URI}\``, flags:MessageFlags.Ephemeral });
    } catch (err) {
      return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral });
    }
  }

  async function startParty(interaction) {
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content:'❌ Geh zuerst in einen Voice-Channel und starte dann `/spotify start`.', flags:MessageFlags.Ephemeral });
    if (!authRecord(interaction.guild.id)?.refreshToken) {
      const url = oauthUrl(interaction.guild.id, interaction.user.id);
      const components = url ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Spotify verbinden').setURL(url))] : [];
      return interaction.reply({ content:'❌ Spotify Connect ist noch nicht verbunden. Ein Admin muss zuerst `/spotify connect` benutzen.', components, flags:MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    let playlist;
    try { playlist = await loadPlaylist(); } catch { playlist = { id:DEFAULT_PLAYLIST_ID, uri:`spotify:playlist:${DEFAULT_PLAYLIST_ID}`, name:'BEST PHONK/FUNK 2026🔥', url:DEFAULT_PLAYLIST_URL, tracks:FALLBACK_PLAYLIST.map(t => ({...t})) }; }
    try {
      const device = await chooseDevice(interaction.guild.id);
      if (!device) return interaction.editReply('❌ Kein Spotify-Gerät gefunden. **Öffne Spotify auf PC oder Handy**, starte kurz irgendeinen Song und nutze danach `/spotify start` erneut.');
      await playPlaylist(interaction.guild.id, device.id, 0);
      const old = sessions.get(interaction.guild.id);
      if (old) { try { getVoiceConnection(interaction.guild.id)?.destroy(); } catch {} sessions.delete(interaction.guild.id); }
      let connection;
      try {
        connection = joinVoiceChannel({ channelId:voice.id, guildId:interaction.guild.id, adapterCreator:interaction.guild.voiceAdapterCreator, selfDeaf:true, selfMute:false });
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      } catch (err) { try { connection?.destroy(); } catch {} console.warn('Spotify party VC join failed:', err?.message || err); }
      const session = { guildId:interaction.guild.id, voiceChannelId:voice.id, textChannelId:interaction.channel.id, messageId:null, hostId:interaction.user.id, playlist, index:0, isPlaying:true, shuffle:false, repeat:'context', deviceId:device.id, deviceName:device.name, liveTrack:null, progressMs:0 };
      sessions.set(interaction.guild.id, session);
      await syncSession(session);
      const sent = await interaction.editReply({ embeds:[partyEmbed(session, 'Spotify Connect aktiv')], components:partyRows(session) });
      session.messageId = sent.id;
    } catch (err) {
      console.error('Spotify start failed:', err);
      return interaction.editReply(spotifyErrorText(err));
    }
  }

  async function stopParty(guildId, note = 'Party beendet', pause = true) {
    const session = sessions.get(guildId);
    if (!session) return false;
    if (pause) await playerAction(guildId, '/me/player/pause', 'PUT').catch(() => {});
    session.isPlaying = false;
    await updatePanel(session, note).catch(() => {});
    try { getVoiceConnection(guildId)?.destroy(); } catch {}
    sessions.delete(guildId);
    return true;
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'connect') return connectCommand(interaction);
    if (sub === 'status') return statusCommand(interaction);
    if (sub === 'disconnect') {
      if (!isManager(interaction)) return interaction.reply({ content:'❌ Dafür brauchst du **Server verwalten**.', flags:MessageFlags.Ephemeral });
      await stopParty(interaction.guild.id, 'Spotify getrennt', false).catch(() => {});
      setAuthRecord(interaction.guild.id, null);
      return interaction.reply({ content:'✅ Spotify wurde für diesen Server getrennt.', flags:MessageFlags.Ephemeral });
    }
    if (sub === 'start') return startParty(interaction);
    if (sub === 'playlist') {
      const tracks = FALLBACK_PLAYLIST;
      const lines = tracks.slice(0, 20).map((t,i) => `${i+1}. **${truncate(t.name, 42)}** — ${truncate(t.artists, 32)}`);
      return interaction.reply({ content:`🎵 **BEST PHONK/FUNK 2026🔥**\n${lines.join('\n')}\n… insgesamt **${tracks.length} Tracks**. Nutze \`/spotify play nummer:21\` usw.\n\n${DEFAULT_PLAYLIST_URL}`, flags:MessageFlags.Ephemeral });
    }
    const session = sessions.get(interaction.guild.id);
    if (sub === 'play') {
      if (!session) return interaction.reply({ content:'🎧 Starte zuerst `/spotify start`.', flags:MessageFlags.Ephemeral });
      if (!userCanControl(interaction, session)) return interaction.reply({ content:'❌ Du musst im Party-VC sein oder Server verwalten dürfen.', flags:MessageFlags.Ephemeral });
      const number = interaction.options.getInteger('nummer');
      if (!number || number < 1 || number > 45) return interaction.reply({ content:'❌ Wähle eine Nummer zwischen 1 und 45.', flags:MessageFlags.Ephemeral });
      await interaction.deferReply({ flags:MessageFlags.Ephemeral });
      try {
        const device = await chooseDevice(interaction.guild.id, session.deviceId);
        if (!device) return interaction.editReply('❌ Kein Spotify-Gerät gefunden. Öffne Spotify zuerst.');
        await playPlaylist(interaction.guild.id, device.id, number - 1);
        session.index = number - 1; session.deviceId = device.id; session.deviceName = device.name;
        await new Promise(r => setTimeout(r, 500));
        await updatePanel(session, `Track ${number} gestartet`);
        const t = currentTrack(session);
        return interaction.editReply(`▶️ **${t?.name || `Track ${number}`}** läuft jetzt auf **${session.deviceName}**.`);
      } catch (err) { return interaction.editReply(spotifyErrorText(err)); }
    }
    if (sub === 'now') {
      if (!session) return interaction.reply({ content:'🎧 Auf diesem Server läuft gerade keine Spotify Connect Party.', flags:MessageFlags.Ephemeral });
      await syncSession(session);
      return interaction.reply({ embeds:[partyEmbed(session)], components:partyRows(session), flags:MessageFlags.Ephemeral });
    }
    if (sub === 'stop') {
      if (!session) return interaction.reply({ content:'ℹ️ Es läuft gerade keine Party.', flags:MessageFlags.Ephemeral });
      if (!userCanControl(interaction, session)) return interaction.reply({ content:'❌ Du musst im Party-VC sein oder Server verwalten dürfen.', flags:MessageFlags.Ephemeral });
      await stopParty(interaction.guild.id, `Beendet von ${interaction.user.username}`, true);
      return interaction.reply({ content:'⏹️ Spotify pausiert und Party beendet.', flags:MessageFlags.Ephemeral });
    }
  }

  async function handleButton(interaction) {
    const session = sessions.get(interaction.guild.id);
    if (!session) return interaction.reply({ content:'⌛ Diese Spotify-Party läuft nicht mehr.', flags:MessageFlags.Ephemeral });
    if (!userCanControl(interaction, session)) return interaction.reply({ content:'❌ Geh in den Party-Voice-Channel, um die Wiedergabe zu steuern.', flags:MessageFlags.Ephemeral });

    if (interaction.customId === 'spotify_queue') {
      const lines = FALLBACK_PLAYLIST.slice(0, 15).map((t,i) => `${i+1}. **${truncate(t.name, 48)}** — ${truncate(t.artists, 35)}`);
      return interaction.reply({ content:`📜 **Community Playlist**\n${lines.join('\n')}\n… ${FALLBACK_PLAYLIST.length} Titel insgesamt.`, flags:MessageFlags.Ephemeral });
    }
    if (interaction.customId === 'spotify_sync') {
      try { await syncSession(session); } catch {}
      return interaction.reply({ content:`🎯 **Spotify Sync**\nGerät: **${session.deviceName || 'unbekannt'}**\nTrack: **${currentTrack(session)?.name || 'unbekannt'}**\nStatus: ${session.isPlaying ? '▶️ Läuft' : '⏸️ Pausiert'}`, flags:MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    try {
      if (interaction.customId === 'spotify_prev') await playerAction(session.guildId, '/me/player/previous', 'POST');
      else if (interaction.customId === 'spotify_next') await playerAction(session.guildId, '/me/player/next', 'POST');
      else if (interaction.customId === 'spotify_toggle') {
        await syncSession(session);
        if (session.isPlaying) await playerAction(session.guildId, '/me/player/pause', 'PUT');
        else await playerAction(session.guildId, `/me/player/play${session.deviceId ? `?device_id=${encodeURIComponent(session.deviceId)}` : ''}`, 'PUT');
      } else if (interaction.customId === 'spotify_shuffle') {
        session.shuffle = !session.shuffle;
        await playerAction(session.guildId, `/me/player/shuffle?state=${session.shuffle}${session.deviceId ? `&device_id=${encodeURIComponent(session.deviceId)}` : ''}`, 'PUT');
      } else if (interaction.customId === 'spotify_repeat') {
        session.repeat = session.repeat === 'off' ? 'context' : session.repeat === 'context' ? 'track' : 'off';
        await playerAction(session.guildId, `/me/player/repeat?state=${session.repeat}${session.deviceId ? `&device_id=${encodeURIComponent(session.deviceId)}` : ''}`, 'PUT');
      } else if (interaction.customId === 'spotify_stop') {
        return stopParty(interaction.guild.id, `Beendet von ${interaction.user.username}`, true);
      }
      await new Promise(r => setTimeout(r, 450));
      await updatePanel(session);
    } catch (err) {
      console.warn('Spotify control failed:', err?.message || err);
      await updatePanel(session, 'Spotify-Steuerung fehlgeschlagen').catch(() => {});
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.guild || !isGuildApproved?.(interaction.guild.id)) return false;
    if (interaction.isChatInputCommand() && interaction.commandName === 'spotify') { await handleCommand(interaction); return true; }
    if (interaction.isButton() && interaction.customId.startsWith('spotify_')) { await handleButton(interaction); return true; }
    return false;
  }

  async function handleVoiceState(oldState, newState) {
    const guild = oldState.guild || newState.guild;
    const session = sessions.get(guild?.id);
    if (!session) return;
    const channel = guild.channels.cache.get(session.voiceChannelId);
    if (!channel?.members) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) {
      setTimeout(async () => {
        const fresh = guild.channels.cache.get(session.voiceChannelId);
        const stillEmpty = !fresh?.members?.some(m => !m.user.bot);
        if (stillEmpty && sessions.get(guild.id) === session) await stopParty(guild.id, 'VC leer – Spotify pausiert', true);
      }, 60_000);
    }
  }

  function onShutdown() {
    for (const guildId of sessions.keys()) { try { getVoiceConnection(guildId)?.destroy(); } catch {} }
    sessions.clear();
    try { oauthServer?.close(); } catch {}
  }

  return { handleInteraction, handleVoiceState, onShutdown, defaultPlaylistUrl:DEFAULT_PLAYLIST_URL, redirectUri:SPOTIFY_REDIRECT_URI };
}

module.exports = { buildSpotifyPartyCommands, createSpotifyParty };
