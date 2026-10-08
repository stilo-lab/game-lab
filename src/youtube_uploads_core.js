'use strict';

// Independent YouTube feed, storage and delivery code. Never touches data/db.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { configuredApi } = require('./youtube_uploads_api');

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const MAX_PER_GUILD = 20;
const MAX_SEEN = 500;

function decodeXml(text = '') {
  return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, key) => {
    const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (names[key.toLowerCase()]) return names[key.toLowerCase()];
    const number = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : whole;
  });
}

function textTag(xml, tag) {
  return decodeXml(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '').trim();
}

function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) result[m[1].toLowerCase()] = decodeXml(m[3]);
  return result;
}

function parseFeed(xml, expectedChannelId) {
  if (!CHANNEL_ID.test(expectedChannelId) || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<feed\b/i.test(xml) || !/<\/feed>\s*$/i.test(xml.trim())) {
    throw new Error('YouTube hat keinen gültigen Video-Feed geliefert.');
  }
  const header = xml.split(/<entry\b/i)[0];
  const channelId = textTag(header, 'yt:channelId');
  if (channelId !== expectedChannelId) throw new Error('Die Kanal-ID im YouTube-Feed stimmt nicht überein.');
  const videos = [];
  const ids = new Set();
  const entries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  if ((xml.match(/<entry\b/gi) || []).length !== entries.length) throw new Error('Der YouTube-Feed ist unvollständig.');
  for (const [, entry] of entries) {
    const id = textTag(entry, 'yt:videoId');
    const publishedAt = Date.parse(textTag(entry, 'published'));
    if (!VIDEO_ID.test(id) || !Number.isFinite(publishedAt) || textTag(entry, 'yt:channelId') !== expectedChannelId) {
      throw new Error('Ein Video im YouTube-Feed konnte nicht sicher gelesen werden.');
    }
    if (ids.has(id)) continue;
    ids.add(id);
    videos.push({ id, title: (textTag(entry, 'title') || 'Neues Video').slice(0, 256), publishedAt });
  }
  videos.sort((a, b) => a.publishedAt - b.publishedAt || a.id.localeCompare(b.id));
  return { channelId, title: (textTag(header, 'title') || 'YouTube-Kanal').slice(0, 100), videos };
}

function safeYoutubeUrl(input) {
  const u = new URL(input);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || u.port || u.username || u.password) {
    throw new Error('Bitte einen YouTube-Kanal-Link verwenden.');
  }
  return u;
}

async function fetchYoutubeText(url, { fetchImpl = globalThis.fetch, maxBytes = 5_000_000 } = {}) {
  let current = safeYoutubeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  timer.unref?.();
  try {
    for (let redirect = 0; redirect <= 3; redirect++) {
      const response = await fetchImpl(current.href, {
        signal: controller.signal, redirect: 'manual',
        headers: { 'User-Agent': 'StiloUploadNotifier/1.0', Accept: 'application/atom+xml,text/html;q=0.9' }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('YouTube-Weiterleitung ohne Ziel.');
        const next = new URL(location, current);
        if (next.hostname === 'consent.youtube.com' || next.hostname === 'accounts.google.com') {
          throw new Error('YouTube verlangt eine Browser-Bestätigung. Für den Bot YOUTUBE_API_KEY einrichten; der Kanal-Link ist dadurch nicht automatisch falsch.');
        }
        current = safeYoutubeUrl(next.href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404 && current.pathname === '/feeds/videos.xml') {
          throw new Error('YouTubes Upload-Feed liefert HTTP 404. Das beweist nicht, dass der Kanal fehlt. YOUTUBE_API_KEY einrichten oder später erneut versuchen.');
        }
        throw new Error(`Die angefragte YouTube-Seite liefert HTTP ${response.status}. Kanal-Link prüfen oder YOUTUBE_API_KEY einrichten.`);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new Error('Die YouTube-Antwort ist zu groß.');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('YouTube hat keine Daten geliefert.');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); throw new Error('Die YouTube-Antwort ist zu groß.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error('Zu viele YouTube-Weiterleitungen. Bitte den direkten Kanal-Link verwenden.');
  } catch (err) {
    if (controller.signal.aborted) throw new Error('YouTube antwortet gerade zu langsam. Bitte erneut versuchen.');
    throw err;
  } finally { clearTimeout(timer); }
}

function channelInput(input) {
  let raw = String(input || '').trim().replace(/^<|>$/g, '');
  if (CHANNEL_ID.test(raw)) return { id: raw };
  if (raw.startsWith('@')) raw = `https://www.youtube.com/${raw}`;
  if (/^(?:www\.|m\.)?youtube\.com\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = safeYoutubeUrl(raw); } catch { throw new Error('Nutze einen Kanal-Link wie https://www.youtube.com/@Name oder https://www.youtube.com/channel/UC…'); }
  const parts = u.pathname.split('/').filter(Boolean);
  const tabs = new Set(['videos', 'shorts', 'streams', 'featured', 'about', 'playlists', 'community']);
  if (parts[0] === 'channel' && CHANNEL_ID.test(parts[1]) && (parts.length === 2 || (parts.length === 3 && tabs.has(parts[2])))) return { id: parts[1] };
  const isHandle = parts[0]?.startsWith('@') && parts[0].length > 1;
  const isLegacy = ['c', 'user'].includes(parts[0]) && parts[1];
  const count = isHandle ? 1 : 2;
  if ((!isHandle && !isLegacy) || parts.length > count + 1 || (parts.length === count + 1 && !tabs.has(parts[count]))) {
    throw new Error('Das ist kein Kanal-Link. Bitte keinen einzelnen Video-, Shorts- oder Playlist-Link eintragen.');
  }
  return { page: `https://www.youtube.com/${parts.slice(0, count).join('/')}` };
}

function channelIdFromPage(html) {
  // Only channel-specific metadata, never arbitrary IDs from recommended videos.
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    try {
      const u = safeYoutubeUrl(new URL(a.href, 'https://www.youtube.com').href);
      if (a.type === 'application/rss+xml' && u.pathname === '/feeds/videos.xml' && CHANNEL_ID.test(u.searchParams.get('channel_id'))) return u.searchParams.get('channel_id');
      if (a.rel === 'canonical' && /^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/.test(u.pathname)) return u.pathname.split('/')[2];
    } catch {}
  }
  const metadata = html.match(/"channelMetadataRenderer"\s*:\s*\{([^{}]{0,30000})\}/)?.[1];
  const id = metadata?.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/)?.[1];
  if (id) return id;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (a.itemprop === 'channelId' && CHANNEL_ID.test(a.content)) return a.content;
  }
  throw new Error('Den Kanal konnte YouTube gerade nicht auflösen. Nutze den direkten Link https://www.youtube.com/channel/UC… oder versuche es später erneut.');
}

async function readFeed(channelId, options = {}) {
  if (!CHANNEL_ID.test(channelId)) throw new Error('Ungültige YouTube-Kanal-ID.');
  const api = options.apiClient === undefined ? configuredApi() : options.apiClient;
  if (api) return api.readFeed(channelId);
  const xml = await fetchYoutubeText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { ...options, maxBytes: 1_000_000 });
  return parseFeed(xml, channelId);
}

async function resolveChannel(input, options = {}) {
  const parsed = channelInput(input);
  const api = options.apiClient === undefined ? configuredApi() : options.apiClient;
  if (api) {
    if (parsed.id) return api.resolve({ id: parsed.id });
    const parts = new URL(parsed.page).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0].startsWith('@')) return api.resolve({ forHandle: parts[0] });
    if (parts[0] === 'user') return api.resolve({ forUsername: parts[1] });
    // Older /c/ names have no API filter. Never guess a different channel by search.
    const id = channelIdFromPage(await fetchYoutubeText(parsed.page, options));
    return api.resolve({ id });
  }
  const channelId = parsed.id || channelIdFromPage(await fetchYoutubeText(parsed.page, options));
  return readFeed(channelId, options);
}

function validSubscription(s) {
  return s && /^[a-f0-9]{16}$/.test(s.id) && /^\d{1,25}$/.test(s.guildId) && /^\d{1,25}$/.test(s.targetId) &&
    CHANNEL_ID.test(s.channelId) && typeof s.title === 'string' && Number.isFinite(s.sinceAt) &&
    typeof s.paused === 'boolean' && Array.isArray(s.seenIds) && s.seenIds.every(id => VIDEO_ID.test(id)) &&
    Array.isArray(s.pending) && s.pending.every(v => VIDEO_ID.test(v.id) && typeof v.title === 'string' && Number.isFinite(v.publishedAt));
}

class UploadStore {
  constructor(file) {
    this.file = file;
    this.fault = null;
    this.state = { version: 1, subscriptions: [] };
    try {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.subscriptions) || !state.subscriptions.every(validSubscription) || new Set(state.subscriptions.map(s => s.id)).size !== state.subscriptions.length) throw new Error('Invalid schema');
      this.state = state;
    } catch (err) {
      if (err.code !== 'ENOENT') this.fault = 'Die YouTube-Speicherdatei kann nicht gelesen werden. Sie wurde nicht überschrieben; bitte data/youtube_uploads.json prüfen.';
    }
  }
  list(guildId) {
    if (this.fault) throw new Error(this.fault);
    return structuredClone(this.state.subscriptions.filter(s => !guildId || s.guildId === guildId));
  }
  get(id) { return this.list().find(s => s.id === id) || null; }
  importLegacy(guilds, now = Date.now()) {
    if (this.fault || this.state.legacyImported) return;
    const imported = [];
    for (const [guildId, rows] of Object.entries(guilds || {})) {
      if (!Array.isArray(rows)) throw new Error('Die bisherigen YouTube-Abos sind beschädigt; der Import wurde gestoppt.');
      for (const old of rows) {
        const seenIds = (old.seenVideoIds || []).filter(id => VIDEO_ID.test(id)).slice(-MAX_SEEN);
        const row = { id: crypto.createHash('sha256').update(`${guildId}:${old.id}`).digest('hex').slice(0, 16),
          legacyId: String(old.id), guildId, targetId: old.discordChannelId, channelId: old.youtubeChannelId,
          title: old.youtubeName || 'YouTube-Kanal', pingRoleId: old.pingRoleId || null,
          sinceAt: Number.isFinite(old.createdAt) ? old.createdAt : now, paused: false, seenIds, pending: [],
          seedOnNextCheck: !old.initialized || !seenIds.length, lastCheckedAt: old.lastCheckedAt || null, lastSentAt: null, lastError: null };
        if (!validSubscription(row)) throw new Error('Ein bisheriges YouTube-Abo ist ungültig. Es wurde nichts überschrieben.');
        imported.push(row);
      }
    }
    this.commit((rows, next) => {
      for (const row of imported) if (!rows.some(s => s.id === row.id || (s.guildId === row.guildId && s.channelId === row.channelId && s.targetId === row.targetId))) rows.push(row);
      next.legacyImported = true;
    });
  }
  commit(change) {
    if (this.fault) throw new Error(this.fault);
    const next = structuredClone(this.state);
    change(next.subscriptions, next);
    const temporary = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } catch {
      throw new Error('YouTube-Einstellungen konnten nicht gespeichert werden. Bitte Schreibrechte und Speicherplatz prüfen.');
    }
    this.state = next;
  }
  patch(id, update) {
    this.commit(rows => { const row = rows.find(s => s.id === id); if (!row) throw new Error('Dieses YouTube-Abo wurde bereits entfernt.'); update(row); });
  }
}

function deliveryNonce(subscriptionId, videoId) {
  return crypto.createHash('sha256').update(`youtube:${subscriptionId}:${videoId}`).digest('hex').slice(0, 24);
}

function createUploadMonitor({ store, canRun, deliver, fetchFeed = readFeed, now = Date.now, logger = console }) {
  let running = false;
  const locks = new Map();
  const backoff = new Map();
  const withLock = (id, job) => {
    const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(job);
    locks.set(id, next);
    return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
  };
  const assertOwned = (id, guildId) => {
    const sub = store.list(guildId).find(s => s.id === id || (s.legacyId && s.legacyId.toUpperCase() === String(id).toUpperCase()));
    if (!sub || sub.guildId !== guildId) throw new Error('Dieses YouTube-Abo gehört nicht zu diesem Server oder wurde entfernt.');
    return sub;
  };
  function add(guildId, targetId, feed, sinceAt = now(), pingRoleId = null) {
    const id = crypto.randomBytes(8).toString('hex');
    store.commit(rows => {
      const own = rows.filter(s => s.guildId === guildId);
      if (own.some(s => s.channelId === feed.channelId && s.targetId === targetId)) throw new Error('Dieser YouTube-Kanal ist für diesen Discord-Kanal bereits eingerichtet.');
      if (own.length >= MAX_PER_GUILD) throw new Error(`Maximal ${MAX_PER_GUILD} YouTube-Abos pro Server.`);
      const row = { id, guildId, targetId, channelId: feed.channelId, title: feed.title, sinceAt, pingRoleId,
        paused: false, seenIds: feed.videos.map(v => v.id).slice(-MAX_SEEN), pending: [], lastCheckedAt: now(), lastSentAt: null, lastError: null };
      if (!validSubscription(row)) throw new Error('Die YouTube-Einstellungen sind ungültig.');
      rows.push(row);
    });
    return store.get(id);
  }
  async function edit(id, guildId, changes) {
    const actual = assertOwned(id, guildId).id;
    return withLock(actual, () => {
      const old = assertOwned(actual, guildId);
      store.patch(old.id, row => {
        if (typeof changes.paused === 'boolean') row.paused = changes.paused;
        if (Object.hasOwn(changes, 'pingRoleId')) row.pingRoleId = changes.pingRoleId;
        if (changes.targetId) {
          if (!/^\d{1,25}$/.test(changes.targetId)) throw new Error('Ungültiger Discord-Kanal.');
          if (store.list(guildId).some(s => s.id !== old.id && s.channelId === old.channelId && s.targetId === changes.targetId)) throw new Error('Dieses Abo existiert für den Zielkanal bereits.');
          row.targetId = changes.targetId;
        }
        row.lastError = null;
      });
      return store.get(old.id);
    });
  }
  async function remove(id, guildId) {
    const actual = assertOwned(id, guildId).id;
    return withLock(actual, () => { assertOwned(actual, guildId); store.commit(rows => rows.splice(rows.findIndex(s => s.id === actual), 1)); });
  }
  async function processSub(snapshot, feeds) {
    if (!canRun(snapshot.guildId) || snapshot.paused) return;
    let feed = null, feedError = null;
    if (!feeds.has(snapshot.channelId)) {
      feeds.set(snapshot.channelId, (async () => {
        const wait = backoff.get(snapshot.channelId);
        if (wait && wait.until > now()) throw new Error(wait.message);
        try { const result = await fetchFeed(snapshot.channelId); backoff.delete(snapshot.channelId); return result; }
        catch (err) {
          const count = Math.min(6, (wait?.count || 0) + 1);
          backoff.set(snapshot.channelId, { count, until: now() + Math.min(30 * 60_000, 60_000 * 2 ** (count - 1)), message: String(err.message || err).slice(0, 250) });
          throw err;
        }
      })());
    }
    try { feed = await feeds.get(snapshot.channelId); } catch (err) { feedError = String(err.message || err).slice(0, 250); }
    await withLock(snapshot.id, async () => {
      let sub = store.get(snapshot.id);
      if (!sub || sub.paused || !canRun(sub.guildId)) return;
      store.patch(sub.id, row => {
        row.lastCheckedAt = now(); row.lastError = feedError;
        if (!feed) return;
        const seen = new Set(row.seenIds);
        const queued = new Set(row.pending.map(v => v.id));
        for (const video of feed.videos) {
          if (!row.seedOnNextCheck && !seen.has(video.id) && !queued.has(video.id) && video.publishedAt >= row.sinceAt) row.pending.push(video);
          seen.add(video.id);
        }
        row.seenIds = [...seen].slice(-MAX_SEEN);
        row.seedOnNextCheck = false;
        row.pending.sort((a, b) => a.publishedAt - b.publishedAt || a.id.localeCompare(b.id));
        row.title = feed.title;
      });
      // Durable outbox: a failed send keeps the video for the next check/restart.
      for (let sent = 0; sent < 5; sent++) {
        sub = store.get(snapshot.id);
        const video = sub?.pending[0];
        if (!video || sub.paused || !canRun(sub.guildId)) break;
        try {
          await deliver(sub, video, deliveryNonce(sub.id, video.id));
          store.patch(sub.id, row => { row.pending = row.pending.filter(v => v.id !== video.id); row.lastSentAt = now(); });
        } catch (err) {
          store.patch(sub.id, row => { row.lastError = String(err.message || err).slice(0, 250); });
          break;
        }
      }
    });
  }
  async function tick(guildId = null) {
    if (running) return false;
    running = true;
    try {
      const queue = store.list(guildId);
      const feeds = new Map();
      let index = 0;
      const worker = async () => {
        while (index < queue.length) {
          const sub = queue[index++];
          try { await processSub(sub, feeds); }
          catch (err) { logger.warn('[YouTube uploads] Check failed:', String(err.message || err)); }
        }
      };
      await Promise.all([worker(), worker()]);
      return true;
    } catch (err) { logger.warn('[YouTube uploads] Isolated error:', String(err.message || err)); return false; }
    finally { running = false; }
  }
  return { add, edit, remove, tick, list: guildId => store.list(guildId), get: assertOwned };
}

module.exports = { CHANNEL_ID, MAX_PER_GUILD, UploadStore, parseFeed, channelInput, channelIdFromPage,
  fetchYoutubeText, readFeed, resolveChannel, createUploadMonitor, deliveryNonce };
