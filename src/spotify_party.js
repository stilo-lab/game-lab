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

const DEFAULT_PLAYLIST_URL = 'https://open.spotify.com/playlist/0j5WfIigrPdHMGu9TKZ860';
const DEFAULT_PLAYLIST_ID = '0j5WfIigrPdHMGu9TKZ860';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_MARKET = String(process.env.SPOTIFY_MARKET || 'DE').toUpperCase();
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_PATH = path.join(DATA_DIR, 'spotify_auth.json');
const TRACK_CACHE_PATH = path.join(DATA_DIR, 'spotify_track_cache.json');
const PLAYLIST_CACHE_PATH = path.join(DATA_DIR, 'spotify_playlist_cache.json');
const PLAYLIST_REFRESH_MS = Math.max(30_000, Number(process.env.SPOTIFY_PLAYLIST_REFRESH_MS || 60_000));

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
  'user-read-private',
  'playlist-read-private'
].join(' ');

// Playlist-Titel werden live von Spotify geladen und lokal als Last-Known-Good-Cache gespeichert.

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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}

function safeJsonWrite(file, value) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function normalizeSearchText(value='') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function similarityScore(track, hit) {
  const wantedName = normalizeSearchText(track.name);
  const wantedArtist = normalizeSearchText(String(track.artists || '').split(',')[0]);
  const gotName = normalizeSearchText(hit?.name || '');
  const gotArtists = normalizeSearchText((hit?.artists || []).map(a => a.name).join(' '));
  let score = 0;
  if (gotName === wantedName) score += 70;
  else if (gotName.includes(wantedName) || wantedName.includes(gotName)) score += 45;
  else {
    const words = wantedName.split(' ').filter(x => x.length > 2);
    score += Math.min(35, words.filter(w => gotName.includes(w)).length * 7);
  }
  if (wantedArtist && gotArtists.includes(wantedArtist)) score += 30;
  return score;
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
      .setDescription('Spotify Connect Party – Player, Geräte, Playlist und Diagnose.')
      .addSubcommand(s => s.setName('connect').setDescription('Verbindet ein Spotify-Premium-Konto mit diesem Server.'))
      .addSubcommand(s => s.setName('status').setDescription('Zeigt Verbindung, Gerät und aktuellen Player-Status.'))
      .addSubcommand(s => s.setName('diagnose').setDescription('Prüft Spotify-Konfiguration, Login, Premium und Geräte.'))
      .addSubcommand(s => s.setName('devices').setDescription('Zeigt alle verfügbaren Spotify-Geräte.'))
      .addSubcommand(s => s.setName('device').setDescription('Wählt das bevorzugte Spotify-Gerät.')
        .addIntegerOption(o => o.setName('nummer').setDescription('Nummer aus /spotify devices').setMinValue(1).setMaxValue(20).setRequired(true)))
      .addSubcommand(s => s.setName('disconnect').setDescription('Trennt das Spotify-Konto dieses Servers.'))
      .addSubcommand(s => s.setName('start').setDescription('Startet die feste Playlist und öffnet den Party-Player.'))
      .addSubcommand(s => s.setName('now').setDescription('Zeigt den aktuell laufenden Spotify-Track.'))
      .addSubcommand(s => s.setName('playlist').setDescription('Zeigt die Titel der festen Community-Playlist.')
        .addIntegerOption(o => o.setName('seite').setDescription('Playlist-Seite').setMinValue(1).setMaxValue(50)))
      .addSubcommand(s => s.setName('play').setDescription('Spielt einen bestimmten Titel der Community-Playlist.')
        .addIntegerOption(o => o.setName('nummer').setDescription('Tracknummer aus /spotify playlist').setMinValue(1).setMaxValue(1000).setRequired(true)))
      .addSubcommand(s => s.setName('refresh').setDescription('Lädt die aktuelle Spotify-Playlist sofort neu.'))
      .addSubcommand(s => s.setName('pause').setDescription('Pausiert Spotify.'))
      .addSubcommand(s => s.setName('resume').setDescription('Setzt Spotify fort.'))
      .addSubcommand(s => s.setName('next').setDescription('Springt zum nächsten Track.'))
      .addSubcommand(s => s.setName('previous').setDescription('Springt zum vorherigen Track.'))
      .addSubcommand(s => s.setName('volume').setDescription('Setzt die Spotify-Lautstärke.')
        .addIntegerOption(o => o.setName('prozent').setDescription('0-100').setMinValue(0).setMaxValue(100).setRequired(true)))
      .addSubcommand(s => s.setName('seek').setDescription('Springt im aktuellen Track zu einer Position.')
        .addIntegerOption(o => o.setName('sekunden').setDescription('Position in Sekunden').setMinValue(0).setMaxValue(3600).setRequired(true)))
      .addSubcommand(s => s.setName('shuffle').setDescription('Schaltet Shuffle um.'))
      .addSubcommand(s => s.setName('repeat').setDescription('Setzt den Repeat-Modus.')
        .addStringOption(o => o.setName('modus').setDescription('Repeat-Modus').setRequired(true)
          .addChoices({name:'Aus',value:'off'},{name:'Playlist',value:'context'},{name:'Ein Track',value:'track'})))
      .addSubcommand(s => s.setName('stop').setDescription('Pausiert Spotify und beendet die Party.'))
  ];
}

function createSpotifyParty({ client, footer, isGuildApproved }) {
  const sessions = new Map();
  const authStore = loadAuthStore();
  const pendingStates = new Map();
  let appTokenCache = { token: null, expiresAt: 0 };
  const resolvedTrackCache = new Map(Object.entries(safeJsonRead(TRACK_CACHE_PATH, {})));
  const playlistCacheStore = safeJsonRead(PLAYLIST_CACHE_PATH, { playlists: {} });
  if (!playlistCacheStore.playlists || typeof playlistCacheStore.playlists !== 'object') playlistCacheStore.playlists = {};
  const livePlaylistCache = new Map();
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

  async function userApi(guildId, endpoint, options = {}) {
    let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await refreshGuildToken(guildId, refreshed);
      const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      if (res.status === 401 && !refreshed) { refreshed = true; continue; }
      if (res.status === 429) {
        const wait = Math.max(1, Number(res.headers.get('retry-after') || (attempt + 1) * 2));
        if (attempt < 3) { await sleep(wait * 1000); continue; }
      }
      if (res.status >= 500 && res.status <= 599 && attempt < 3) { await sleep((attempt + 1) * 1200); continue; }
      if (res.status === 204) return null;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let message = body;
        try { const j = JSON.parse(body); message = j?.error?.message || j?.error_description || j?.error || body; } catch {}
        const err = new Error(`SPOTIFY_USER_API_${res.status}:${String(message || 'unknown').slice(0, 500)}`);
        err.status = res.status;
        err.retryAfter = Number(res.headers.get('retry-after') || 0);
        throw err;
      }
      return res.json();
    }
    throw new Error('SPOTIFY_USER_API_RETRY_EXHAUSTED');
  }


  async function appToken() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) throw new Error('SPOTIFY_NOT_CONFIGURED');
    if (appTokenCache.token && Date.now() < appTokenCache.expiresAt - 30_000) return appTokenCache.token;
    const json = await tokenRequest({ grant_type: 'client_credentials' });
    appTokenCache = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
    return appTokenCache.token;
  }

  async function appGet(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await appToken();
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt < 3) { appTokenCache = { token:null, expiresAt:0 }; continue; }
      if (res.status === 429 && attempt < 3) { await sleep(Math.max(1, Number(res.headers.get('retry-after') || 2)) * 1000); continue; }
      if (res.status >= 500 && res.status <= 599 && attempt < 3) { await sleep((attempt + 1) * 1000); continue; }
      if (!res.ok) throw new Error(`SPOTIFY_APP_API_${res.status}`);
      return res.json();
    }
    throw new Error('SPOTIFY_APP_API_RETRY_EXHAUSTED');
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
    if (!track) return track;
    const key = `${track.name}|${track.artists}`.toLowerCase();
    const cached = resolvedTrackCache.get(key);
    if (cached?.id) return { ...track, ...cached, fallback:false };
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return track;
    try {
      const firstArtist = String(track.artists || '').split(',')[0].trim();
      const queries = [
        `track:${track.name} artist:${firstArtist}`,
        `${track.name} ${firstArtist}`
      ];
      let best = null;
      let bestScore = -1;
      for (const query of queries) {
        const data = await appGet(`https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(query)}`);
        for (const hit of data?.tracks?.items || []) {
          const score = similarityScore(track, hit);
          if (score > bestScore) { best = hit; bestScore = score; }
        }
        if (bestScore >= 90) break;
      }
      if (best?.external_urls?.spotify && bestScore >= 45) {
        const enriched = {
          id: best.id || null,
          uri: best.uri || (best.id ? `spotify:track:${best.id}` : null),
          url: best.external_urls.spotify,
          cover: best.album?.images?.[0]?.url || track.cover,
          durationMs: Number(best.duration_ms || track.durationMs),
          explicit: Boolean(best.explicit)
        };
        resolvedTrackCache.set(key, enriched);
        safeJsonWrite(TRACK_CACHE_PATH, Object.fromEntries(resolvedTrackCache));
        return { ...track, ...enriched, fallback:false };
      }
    } catch (err) {
      console.warn('Spotify track resolve failed:', err?.message || err);
    }
    return track;
  }


  function playlistCacheKey(guildId) {
    return `${guildId || 'global'}:${DEFAULT_PLAYLIST_ID}`;
  }

  function playlistFromDisk(guildId) {
    const exact = playlistCacheStore.playlists?.[playlistCacheKey(guildId)];
    const any = exact || playlistCacheStore.playlists?.[`global:${DEFAULT_PLAYLIST_ID}`] || null;
    if (!any || !Array.isArray(any.tracks)) return null;
    return { ...any, tracks:any.tracks.map(t => ({...t})), stale:true };
  }

  function persistPlaylist(guildId, playlist) {
    const clean = {
      id:playlist.id,
      uri:playlist.uri,
      name:playlist.name,
      owner:playlist.owner,
      url:playlist.url,
      image:playlist.image,
      snapshotId:playlist.snapshotId || null,
      total:Number(playlist.total || playlist.tracks?.length || 0),
      fetchedAt:Date.now(),
      tracks:(playlist.tracks || []).map(t => ({...t}))
    };
    playlistCacheStore.playlists[playlistCacheKey(guildId)] = clean;
    playlistCacheStore.playlists[`global:${DEFAULT_PLAYLIST_ID}`] = clean;
    safeJsonWrite(PLAYLIST_CACHE_PATH, playlistCacheStore);
  }

  function spotifyTrackFromPlaylistItem(entry) {
    const t = entry?.item || entry?.track || null;
    if (!t || t.type === 'episode' || !t.name) return null;
    const artists = (t.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist';
    return {
      id:t.id || null,
      uri:t.uri || (t.id ? `spotify:track:${t.id}` : null),
      name:t.name,
      artists,
      durationMs:Number(t.duration_ms || 0),
      url:t.external_urls?.spotify || DEFAULT_PLAYLIST_URL,
      explicit:Boolean(t.explicit),
      cover:t.album?.images?.[0]?.url || null,
      addedAt:entry?.added_at || null,
      fallback:false
    };
  }

  async function fetchLivePlaylist(guildId) {
    const meta = await userApi(guildId, `/playlists/${DEFAULT_PLAYLIST_ID}?market=${encodeURIComponent(SPOTIFY_MARKET)}`);
    const tracks = [];
    let offset = 0;
    let total = Number(meta?.items?.total || meta?.tracks?.total || 0);
    let pages = 0;
    do {
      const page = await userApi(guildId, `/playlists/${DEFAULT_PLAYLIST_ID}/items?market=${encodeURIComponent(SPOTIFY_MARKET)}&limit=50&offset=${offset}`);
      const items = Array.isArray(page?.items) ? page.items : [];
      for (const entry of items) {
        const t = spotifyTrackFromPlaylistItem(entry);
        if (t) tracks.push(t);
      }
      total = Number(page?.total ?? total ?? tracks.length);
      offset += items.length || 50;
      pages += 1;
      if (!page?.next || items.length === 0) break;
    } while (offset < total && pages < 100);

    if (!tracks.length && total > 0) throw new Error('SPOTIFY_PLAYLIST_ITEMS_EMPTY');
    const playlist = {
      id:DEFAULT_PLAYLIST_ID,
      uri:`spotify:playlist:${DEFAULT_PLAYLIST_ID}`,
      name:meta?.name || 'DJ AND GAMING SONGS',
      owner:meta?.owner?.display_name || meta?.owner?.id || 'Community Playlist',
      url:meta?.external_urls?.spotify || DEFAULT_PLAYLIST_URL,
      image:meta?.images?.[0]?.url || null,
      snapshotId:meta?.snapshot_id || null,
      total:tracks.length,
      fetchedAt:Date.now(),
      tracks
    };
    persistPlaylist(guildId, playlist);
    return playlist;
  }

  async function loadPlaylist(guildId, { force = false } = {}) {
    const key = playlistCacheKey(guildId);
    const cached = livePlaylistCache.get(key);
    if (!force && cached && Date.now() - Number(cached.fetchedAt || 0) < 30_000) return cached;
    try {
      const live = await fetchLivePlaylist(guildId);
      livePlaylistCache.set(key, live);
      return live;
    } catch (err) {
      const disk = playlistFromDisk(guildId);
      if (disk?.tracks?.length) {
        console.warn('Spotify live playlist refresh failed; using last-known-good cache:', err?.message || err);
        livePlaylistCache.set(key, disk);
        return disk;
      }
      throw err;
    }
  }

  async function refreshSessionPlaylist(session, force = true) {
    const old = session.playlist;
    const fresh = await loadPlaylist(session.guildId, { force });
    const oldSnapshot = old?.snapshotId || null;
    const changed = oldSnapshot && fresh.snapshotId ? oldSnapshot !== fresh.snapshotId : (old?.tracks?.length || 0) !== (fresh?.tracks?.length || 0);
    session.playlist = fresh;
    if (fresh.tracks.length) session.index = Math.max(0, Math.min(session.index, fresh.tracks.length - 1));
    return { fresh, changed };
  }

  async function getDevices(guildId) {
    const data = await userApi(guildId, '/me/player/devices');
    return (data?.devices || []).filter(d => d && !d.is_restricted);
  }

  async function chooseDevice(guildId, preferredId = null) {
    const devices = await getDevices(guildId);
    const stored = authRecord(guildId)?.preferredDeviceId || null;
    return devices.find(d => d.id === preferredId) || devices.find(d => d.id === stored) || devices.find(d => d.is_active) || devices[0] || null;
  }

  async function transferPlayback(guildId, deviceId, play = false) {
    if (!deviceId) return;
    await userApi(guildId, '/me/player', { method:'PUT', body:{ device_ids:[deviceId], play:Boolean(play) } });
    await sleep(700);
  }

  async function playbackState(guildId) {
    return userApi(guildId, '/me/player');
  }

  async function playPlaylist(guildId, deviceId, position = 0, playlist = null) {
    if (deviceId) await transferPlayback(guildId, deviceId, false).catch(() => {});
    const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    try {
      await userApi(guildId, `/me/player/play${q}`, { method:'PUT', body: { context_uri:`spotify:playlist:${DEFAULT_PLAYLIST_ID}`, offset:{ position:Math.max(0, position) }, position_ms:0 } });
      return { mode:'context', track:playlist?.tracks?.[position] || null };
    } catch (err) {
      const current = playlist || await loadPlaylist(guildId, { force:false }).catch(() => null);
      const track = current?.tracks?.[Math.max(0, position)] || null;
      if (!track?.id) throw err;
      await userApi(guildId, `/me/player/play${q}`, { method:'PUT', body:{ uris:[track.uri || `spotify:track:${track.id}`], position_ms:0 } });
      return { mode:'single', track };
    }
  }

  async function playerAction(guildId, endpoint, method = 'POST', body = null) {
    return userApi(guildId, endpoint, { method, body });
  }

  function spotifyErrorText(err) {
    const raw = String(err?.message || err || '');
    if (raw === 'SPOTIFY_NOT_CONNECTED') return '❌ Spotify ist auf diesem Server noch nicht verbunden. Nutze `/spotify connect`.';
    if (err?.status === 429 || raw.includes('429')) return `⏳ Spotify bremst die Anfragen gerade. Warte ${err?.retryAfter || 'ein paar'} Sekunden und versuche es erneut.`;
    if (err?.status === 403 || raw.includes('403')) return '❌ Spotify hat die Aktion abgelehnt. Prüfe: **Premium**, Spotify-App-Zugriff/Development-Mode und ob das verbundene Konto Zugriff auf die App hat.';
    if (err?.status === 404 || raw.includes('404')) return '❌ Spotify findet gerade kein steuerbares Gerät. Öffne Spotify auf PC/Handy, starte dort kurz einen Song und nutze `/spotify devices`.';
    if (raw.includes('SPOTIFY_PLAYLIST_ITEMS_EMPTY')) return '❌ Die Playlist konnte gerade nicht live gelesen werden. Prüfe, ob das verbundene Spotify-Konto Besitzer oder Mitbearbeiter dieser Playlist ist.';
    if (raw.includes('PREMIUM_REQUIRED')) return '❌ Für die Player-Steuerung wird Spotify Premium benötigt.';
    return `❌ Spotify-Fehler: ${raw.slice(0, 260)}`;
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
      const state = await playbackState(interaction.guild.id).catch(() => null);
      const lines = devices.length ? devices.map((d,i) => `${i+1}. ${d.id === rec.preferredDeviceId ? '⭐' : d.is_active ? '🟢' : '⚪'} **${d.name}** (${d.type})${d.volume_percent != null ? ` • ${d.volume_percent}%` : ''}`).join('\n') : 'Keine Geräte gefunden – Spotify auf PC/Handy öffnen.';
      const now = state?.item?.name ? `\n\n**Jetzt:** ${state.is_playing ? '▶️' : '⏸️'} **${state.item.name}** — ${(state.item.artists || []).map(a=>a.name).join(', ')}` : '';
      return interaction.reply({ content:`✅ Verbunden mit **${rec.displayName || 'Spotify'}**${rec.product ? ` • ${rec.product}` : ''}\n\n**Geräte:**\n${lines}${now}\n\nCallback: \`${SPOTIFY_REDIRECT_URI}\``, flags:MessageFlags.Ephemeral });
    } catch (err) {
      return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral });
    }
  }

  async function devicesCommand(interaction) {
    try {
      const rec = authRecord(interaction.guild.id);
      if (!rec?.refreshToken) return interaction.reply({ content:'❌ Erst `/spotify connect` benutzen.', flags:MessageFlags.Ephemeral });
      const devices = await getDevices(interaction.guild.id);
      if (!devices.length) return interaction.reply({ content:'❌ Keine Spotify-Geräte gefunden. Öffne Spotify auf PC/Handy und spiele dort kurz etwas ab.', flags:MessageFlags.Ephemeral });
      const lines = devices.map((d,i) => `${i+1}. ${d.id === rec.preferredDeviceId ? '⭐ Bevorzugt' : d.is_active ? '🟢 Aktiv' : '⚪'} **${d.name}** • ${d.type}${d.volume_percent != null ? ` • ${d.volume_percent}%` : ''}`).join('\n');
      return interaction.reply({ content:`🎧 **Spotify-Geräte**\n${lines}\n\nMit \`/spotify device nummer:X\` auswählen.`, flags:MessageFlags.Ephemeral });
    } catch (err) { return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral }); }
  }

  async function deviceCommand(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content:'❌ Dafür brauchst du **Server verwalten**.', flags:MessageFlags.Ephemeral });
    try {
      const devices = await getDevices(interaction.guild.id);
      const number = interaction.options.getInteger('nummer');
      const device = devices[number - 1];
      if (!device) return interaction.reply({ content:'❌ Diese Gerätenummer gibt es nicht. Nutze zuerst `/spotify devices`.', flags:MessageFlags.Ephemeral });
      const rec = authRecord(interaction.guild.id) || {};
      rec.preferredDeviceId = device.id;
      rec.preferredDeviceName = device.name;
      setAuthRecord(interaction.guild.id, rec);
      await transferPlayback(interaction.guild.id, device.id, false).catch(() => {});
      return interaction.reply({ content:`⭐ **${device.name}** ist jetzt das bevorzugte Spotify-Gerät.`, flags:MessageFlags.Ephemeral });
    } catch (err) { return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral }); }
  }

  async function diagnoseCommand(interaction) {
    await interaction.deferReply({ flags:MessageFlags.Ephemeral });
    const rows = [];
    rows.push(`${SPOTIFY_CLIENT_ID ? '✅' : '❌'} Client ID`);
    rows.push(`${SPOTIFY_CLIENT_SECRET ? '✅' : '❌'} Client Secret`);
    rows.push(`${SPOTIFY_REDIRECT_URI ? '✅' : '❌'} Redirect URI${SPOTIFY_REDIRECT_URI ? ` — \`${SPOTIFY_REDIRECT_URI}\`` : ''}`);
    const rec = authRecord(interaction.guild.id);
    rows.push(`${rec?.refreshToken ? '✅' : '❌'} Spotify-Konto verbunden`);
    if (rec?.refreshToken) {
      try {
        const token = await refreshGuildToken(interaction.guild.id, true);
        rows.push(token ? '✅ Access-Token erneuert' : '❌ Access-Token');
        const profile = await profileForToken(token);
        rows.push(`${profile?.product === 'premium' ? '✅' : '⚠️'} Konto: **${profile?.display_name || profile?.id || rec.displayName || 'unbekannt'}** • ${profile?.product || 'Produkt unbekannt'}`);
        const devices = await getDevices(interaction.guild.id);
        rows.push(`${devices.length ? '✅' : '⚠️'} Geräte: **${devices.length}**${devices.length ? ` — ${devices.map(d=>d.name).join(', ')}` : ' (Spotify-App öffnen)'}`);
        const state = await playbackState(interaction.guild.id).catch(() => null);
        rows.push(`${state?.device ? '✅' : '⚠️'} Aktiver Player${state?.device ? `: **${state.device.name}**` : ': keiner'}`);
      } catch (err) { rows.push(`❌ API-Test: ${spotifyErrorText(err).replace(/^❌\s*/, '')}`); }
    }
    if (rec?.refreshToken) {
      try {
        const playlist = await loadPlaylist(interaction.guild.id, { force:true });
        rows.push(`✅ Live-Playlist: **${playlist.name}** • **${playlist.tracks.length} Titel**${playlist.stale ? ' • ⚠️ Cache' : ''}`);
        rows.push(`✅ Auto-Sync: alle **${Math.round(PLAYLIST_REFRESH_MS/1000)} Sekunden** bei laufender Party`);
      } catch (err) {
        rows.push(`❌ Playlist-Live-Sync: ${spotifyErrorText(err).replace(/^❌\s*/, '')}`);
      }
    }
    rows.push('ℹ️ Spotify-Ton läuft auf dem ausgewählten **Spotify Connect Gerät**, nicht als rebroadcastetes Audio im Discord-VC.');
    return interaction.editReply(`🩺 **Spotify Diagnose**\n\n${rows.join('\n')}`);
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
    try { playlist = await loadPlaylist(interaction.guild.id, { force:true }); } catch (err) {
      console.warn('Spotify live playlist unavailable at start:', err?.message || err);
      playlist = { id:DEFAULT_PLAYLIST_ID, uri:`spotify:playlist:${DEFAULT_PLAYLIST_ID}`, name:'DJ AND GAMING SONGS', url:DEFAULT_PLAYLIST_URL, tracks:[] };
    }
    try {
      const device = await chooseDevice(interaction.guild.id);
      if (!device) return interaction.editReply('❌ Kein Spotify-Gerät gefunden. **Öffne Spotify auf PC oder Handy**, starte kurz irgendeinen Song und nutze danach `/spotify start` erneut.');
      const playResult = await playPlaylist(interaction.guild.id, device.id, 0, playlist);
      const old = sessions.get(interaction.guild.id);
      if (old) { try { getVoiceConnection(interaction.guild.id)?.destroy(); } catch {} sessions.delete(interaction.guild.id); }
      let connection;
      try {
        connection = joinVoiceChannel({ channelId:voice.id, guildId:interaction.guild.id, adapterCreator:interaction.guild.voiceAdapterCreator, selfDeaf:true, selfMute:false });
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      } catch (err) { try { connection?.destroy(); } catch {} console.warn('Spotify party VC join failed:', err?.message || err); }
      const session = { guildId:interaction.guild.id, voiceChannelId:voice.id, textChannelId:interaction.channel.id, messageId:null, hostId:interaction.user.id, playlist, index:0, isPlaying:true, shuffle:false, repeat:'context', deviceId:device.id, deviceName:device.name, liveTrack:playResult?.track || null, progressMs:0, playMode:playResult?.mode || 'context' };
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
    if (sub === 'diagnose') return diagnoseCommand(interaction);
    if (sub === 'devices') return devicesCommand(interaction);
    if (sub === 'device') return deviceCommand(interaction);
    if (sub === 'disconnect') {
      if (!isManager(interaction)) return interaction.reply({ content:'❌ Dafür brauchst du **Server verwalten**.', flags:MessageFlags.Ephemeral });
      await stopParty(interaction.guild.id, 'Spotify getrennt', false).catch(() => {});
      setAuthRecord(interaction.guild.id, null);
      return interaction.reply({ content:'✅ Spotify wurde für diesen Server getrennt.', flags:MessageFlags.Ephemeral });
    }
    if (sub === 'start') return startParty(interaction);

    const rec = authRecord(interaction.guild.id);
    if (!rec?.refreshToken) return interaction.reply({ content:'❌ Spotify ist noch nicht verbunden. Ein Admin muss zuerst `/spotify connect` benutzen.', flags:MessageFlags.Ephemeral });
    const session = sessions.get(interaction.guild.id);

    if (sub === 'playlist') {
      await interaction.deferReply({ flags:MessageFlags.Ephemeral });
      try {
        const playlist = await loadPlaylist(interaction.guild.id, { force:true });
        const page = interaction.options.getInteger('seite') || 1;
        const perPage = 15;
        const totalPages = Math.max(1, Math.ceil(playlist.tracks.length / perPage));
        if (page > totalPages) return interaction.editReply(`❌ Diese Seite gibt es nicht. Die Playlist hat **${totalPages}** Seite(n).`);
        const startIndex = (page - 1) * perPage;
        const tracks = playlist.tracks.slice(startIndex, startIndex + perPage);
        const lines = tracks.map((t,i) => `${startIndex+i+1}. **${truncate(t.name, 44)}** — ${truncate(t.artists, 35)}`);
        return interaction.editReply(`🎵 **${playlist.name} — Seite ${page}/${totalPages}**
${lines.join('\n') || 'Noch keine Titel gefunden.'}

**${playlist.tracks.length} Titel** • live von Spotify synchronisiert
Nutze \`/spotify play nummer:X\`.
${playlist.url}`);
      } catch (err) { return interaction.editReply(spotifyErrorText(err)); }
    }

    if (sub === 'refresh') {
      await interaction.deferReply({ flags:MessageFlags.Ephemeral });
      try {
        const fresh = await loadPlaylist(interaction.guild.id, { force:true });
        if (session) {
          session.playlist = fresh;
          session.index = Math.max(0, Math.min(session.index, Math.max(0, fresh.tracks.length - 1)));
          await updatePanel(session, `Playlist aktualisiert • ${fresh.tracks.length} Titel`).catch(() => {});
        }
        return interaction.editReply(`🔄 **Playlist aktualisiert:** ${fresh.tracks.length} Titel geladen.
${fresh.url}`);
      } catch (err) { return interaction.editReply(spotifyErrorText(err)); }
    }

    if (sub === 'play') {
      const number = interaction.options.getInteger('nummer');
      await interaction.deferReply({ flags:MessageFlags.Ephemeral });
      try {
        const playlist = await loadPlaylist(interaction.guild.id, { force:true });
        if (number < 1 || number > playlist.tracks.length) return interaction.editReply(`❌ Track **${number}** gibt es nicht. Die Playlist hat aktuell **${playlist.tracks.length} Titel**.`);
        const device = await chooseDevice(interaction.guild.id, session?.deviceId);
        if (!device) return interaction.editReply('❌ Kein Spotify-Gerät gefunden. Öffne Spotify und nutze `/spotify devices`.');
        const result = await playPlaylist(interaction.guild.id, device.id, number - 1, playlist);
        if (session) {
          session.playlist = playlist;
          session.index = number - 1;
          session.deviceId = device.id;
          session.deviceName = device.name;
          session.liveTrack = result.track || playlist.tracks[number - 1] || null;
          session.playMode = result.mode || 'context';
          await sleep(600);
          await updatePanel(session, `Track ${number} gestartet`);
        }
        const track = playlist.tracks[number - 1];
        return interaction.editReply(`▶️ **${track?.name || `Track ${number}`}** läuft jetzt auf **${device.name}**.`);
      } catch (err) { return interaction.editReply(spotifyErrorText(err)); }
    }

    if (sub === 'now') {
      try {
        const state = await playbackState(interaction.guild.id);
        if (!state?.item) return interaction.reply({ content:'ℹ️ Spotify spielt gerade nichts ab.', flags:MessageFlags.Ephemeral });
        const t = liveTrackFromState(state, null);
        const e = footer(new EmbedBuilder().setColor(0x1DB954).setTitle(`${state.is_playing ? '▶️' : '⏸️'} Jetzt auf Spotify`).setDescription(`**${t.name}**\n${t.artists}\n\n${progressBar(Number(state.progress_ms||0),t.durationMs)}\n\`${msToTime(Number(state.progress_ms||0))} / ${msToTime(t.durationMs)}\``).addFields({name:'Gerät',value:state.device?.name || 'unbekannt',inline:true},{name:'Lautstärke',value:state.device?.volume_percent != null ? `${state.device.volume_percent}%` : '—',inline:true}));
        if (t.cover) e.setThumbnail(t.cover);
        return interaction.reply({ embeds:[e], flags:MessageFlags.Ephemeral });
      } catch (err) { return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral }); }
    }

    const controlAllowed = !session || userCanControl(interaction, session) || isManager(interaction);
    if (!controlAllowed) return interaction.reply({ content:'❌ Du musst im Party-VC sein oder Server verwalten dürfen.', flags:MessageFlags.Ephemeral });
    try {
      const device = await chooseDevice(interaction.guild.id, session?.deviceId);
      const deviceQ = device?.id ? `?device_id=${encodeURIComponent(device.id)}` : '';
      if (sub === 'pause') await playerAction(interaction.guild.id, `/me/player/pause${deviceQ}`, 'PUT');
      else if (sub === 'resume') { if (device?.id) await transferPlayback(interaction.guild.id, device.id, false).catch(()=>{}); await playerAction(interaction.guild.id, `/me/player/play${deviceQ}`, 'PUT'); }
      else if (sub === 'next') {
        if (session?.playMode === 'single') { const len = Math.max(1, session.playlist?.tracks?.length || 0); const idx = (session.index + 1) % len; const r = await playPlaylist(interaction.guild.id, device?.id, idx, session.playlist); session.index = idx; session.playMode = r.mode; session.liveTrack = r.track || null; }
        else await playerAction(interaction.guild.id, `/me/player/next${deviceQ}`, 'POST');
      }
      else if (sub === 'previous') {
        if (session?.playMode === 'single') { const len = Math.max(1, session.playlist?.tracks?.length || 0); const idx = (session.index - 1 + len) % len; const r = await playPlaylist(interaction.guild.id, device?.id, idx, session.playlist); session.index = idx; session.playMode = r.mode; session.liveTrack = r.track || null; }
        else await playerAction(interaction.guild.id, `/me/player/previous${deviceQ}`, 'POST');
      }
      else if (sub === 'volume') {
        const percent = interaction.options.getInteger('prozent');
        await playerAction(interaction.guild.id, `/me/player/volume?volume_percent=${percent}${device?.id ? `&device_id=${encodeURIComponent(device.id)}` : ''}`, 'PUT');
      } else if (sub === 'seek') {
        const seconds = interaction.options.getInteger('sekunden');
        await playerAction(interaction.guild.id, `/me/player/seek?position_ms=${seconds*1000}${device?.id ? `&device_id=${encodeURIComponent(device.id)}` : ''}`, 'PUT');
      } else if (sub === 'shuffle') {
        const state = await playbackState(interaction.guild.id).catch(()=>null);
        const next = !Boolean(state?.shuffle_state);
        await playerAction(interaction.guild.id, `/me/player/shuffle?state=${next}${device?.id ? `&device_id=${encodeURIComponent(device.id)}` : ''}`, 'PUT');
      } else if (sub === 'repeat') {
        const mode = interaction.options.getString('modus');
        await playerAction(interaction.guild.id, `/me/player/repeat?state=${encodeURIComponent(mode)}${device?.id ? `&device_id=${encodeURIComponent(device.id)}` : ''}`, 'PUT');
      } else if (sub === 'stop') {
        await playerAction(interaction.guild.id, `/me/player/pause${deviceQ}`, 'PUT').catch(()=>{});
        if (session) await stopParty(interaction.guild.id, `Beendet von ${interaction.user.username}`, false);
        return interaction.reply({ content:'⏹️ Spotify pausiert und Party beendet.', flags:MessageFlags.Ephemeral });
      } else return;
      if (session) { await sleep(450); await updatePanel(session).catch(()=>{}); }
      const labels = {pause:'⏸️ Pausiert',resume:'▶️ Fortgesetzt',next:'⏭️ Nächster Track',previous:'⏮️ Vorheriger Track',volume:'🔊 Lautstärke geändert',seek:'⏩ Position geändert',shuffle:'🔀 Shuffle umgeschaltet',repeat:'🔁 Repeat geändert'};
      return interaction.reply({ content:`✅ ${labels[sub] || 'Spotify aktualisiert'}.`, flags:MessageFlags.Ephemeral });
    } catch (err) { return interaction.reply({ content:spotifyErrorText(err), flags:MessageFlags.Ephemeral }); }
  }


  async function handleButton(interaction) {
    const session = sessions.get(interaction.guild.id);
    if (!session) return interaction.reply({ content:'⌛ Diese Spotify-Party läuft nicht mehr.', flags:MessageFlags.Ephemeral });
    if (!userCanControl(interaction, session)) return interaction.reply({ content:'❌ Geh in den Party-Voice-Channel, um die Wiedergabe zu steuern.', flags:MessageFlags.Ephemeral });

    if (interaction.customId === 'spotify_queue') {
      try { await refreshSessionPlaylist(session, false); } catch {}
      const tracks = session.playlist?.tracks || [];
      const lines = tracks.slice(0, 15).map((t,i) => `${i+1}. **${truncate(t.name, 48)}** — ${truncate(t.artists, 35)}`);
      return interaction.reply({ content:`📜 **${session.playlist?.name || 'Community Playlist'}**
${lines.join('\n') || 'Keine Titel geladen.'}
… ${tracks.length} Titel insgesamt.`, flags:MessageFlags.Ephemeral });
    }
    if (interaction.customId === 'spotify_sync') {
      try { await syncSession(session); } catch {}
      return interaction.reply({ content:`🎯 **Spotify Sync**\nGerät: **${session.deviceName || 'unbekannt'}**\nTrack: **${currentTrack(session)?.name || 'unbekannt'}**\nStatus: ${session.isPlaying ? '▶️ Läuft' : '⏸️ Pausiert'}`, flags:MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    try {
      if (interaction.customId === 'spotify_prev') {
        if (session.playMode === 'single') { const len = Math.max(1, session.playlist?.tracks?.length || 0); const idx = (session.index - 1 + len) % len; const r = await playPlaylist(session.guildId, session.deviceId, idx, session.playlist); session.index = idx; session.playMode = r.mode; session.liveTrack = r.track || null; }
        else await playerAction(session.guildId, '/me/player/previous', 'POST');
      }
      else if (interaction.customId === 'spotify_next') {
        if (session.playMode === 'single') { const len = Math.max(1, session.playlist?.tracks?.length || 0); const idx = (session.index + 1) % len; const r = await playPlaylist(session.guildId, session.deviceId, idx, session.playlist); session.index = idx; session.playMode = r.mode; session.liveTrack = r.track || null; }
        else await playerAction(session.guildId, '/me/player/next', 'POST');
      }
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


  const playlistRefreshTimer = setInterval(async () => {
    for (const session of sessions.values()) {
      try {
        const { fresh, changed } = await refreshSessionPlaylist(session, true);
        if (changed) await updatePanel(session, `🔄 Playlist automatisch aktualisiert • ${fresh.tracks.length} Titel`).catch(() => {});
      } catch (err) {
        console.warn('Spotify automatic playlist refresh failed:', err?.message || err);
      }
    }
  }, PLAYLIST_REFRESH_MS);
  playlistRefreshTimer.unref?.();

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
    try { clearInterval(playlistRefreshTimer); } catch {}
    try { oauthServer?.close(); } catch {}
  }

  return { handleInteraction, handleVoiceState, onShutdown, defaultPlaylistUrl:DEFAULT_PLAYLIST_URL, redirectUri:SPOTIFY_REDIRECT_URI };
}

module.exports = { buildSpotifyPartyCommands, createSpotifyParty };
