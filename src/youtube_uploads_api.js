'use strict';

// Public YouTube Data API only. Does not read or modify the bot database.
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CACHE_MS = 300_000;

function createYouTubeApi({ apiKey, fetchImpl = globalThis.fetch, now = Date.now }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('YOUTUBE_API_KEY fehlt in den Bot-Variablen.');
  const channels = new Map(), feeds = new Map(), inFlight = new Map();

  async function request(resource, parameters) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    url.searchParams.set('key', key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    timer.unref?.();
    try {
      let response;
      try {
        response = await fetchImpl(url.href, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/json' } });
      } catch {
        // Never include the URL, API key or raw network error in a Discord reply/log.
        throw new Error('Die YouTube-API konnte nicht erreicht werden. Bitte später erneut versuchen.');
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error('Die YouTube-API hat unerwartet weitergeleitet; der Abruf wurde abgebrochen.');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Die YouTube-API hat keine Daten geliefert.');
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); throw new Error('Die YouTube-API-Antwort ist zu groß.'); }
          chunks.push(Buffer.from(value));
        }
      } catch {
        throw new Error('Die YouTube-API-Antwort konnte nicht vollständig gelesen werden.');
      } finally { reader.releaseLock(); }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new Error(`Die YouTube-API hat ungültige Daten geliefert (HTTP ${response.status}).`); }
      if (!response.ok || data?.error) {
        const reasons = (Array.isArray(data?.error?.errors) ? data.error.errors : []).map(e => e.reason);
        if (reasons.some(r => ['quotaExceeded', 'dailyLimitExceeded'].includes(r))) throw new Error('Das YouTube-API-Tageskontingent ist aufgebraucht. Die Abos bleiben gespeichert.');
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new Error(`YouTube-API-Zugriff abgelehnt (HTTP ${response.status}). YOUTUBE_API_KEY, API-Freischaltung und Schlüsselbeschränkungen prüfen.`);
        }
        if (response.status === 404) throw new Error('Die YouTube-API findet diesen Kanal oder seine Upload-Liste nicht (HTTP 404).');
        throw new Error(`Die YouTube-API meldet HTTP ${response.status}. Bitte später erneut versuchen.`);
      }
      if (!data || !Array.isArray(data.items)) throw new Error('Die YouTube-API-Antwort enthält keine gültige Ergebnisliste.');
      return data.items;
    } finally { clearTimeout(timer); }
  }

  function remember(cache, id, value, ttl) {
    if (cache.size >= 500 && !cache.has(id)) cache.delete(cache.keys().next().value);
    cache.set(id, { value, expires: now() + ttl });
  }
  async function channel(filter) {
    const cacheKey = JSON.stringify(filter);
    const cached = channels.get(cacheKey);
    if (cached?.expires > now()) return cached.value;
    const items = await request('channels', { part: 'snippet,contentDetails', ...filter });
    if (!items.length) throw new Error('Unter diesem Namen wurde kein öffentlicher YouTube-Kanal gefunden. Bitte den @Namen oder die Kanal-ID prüfen.');
    const item = items[0], uploads = item?.contentDetails?.relatedPlaylists?.uploads;
    if (items.length !== 1 || !CHANNEL_ID.test(item?.id) || (filter.id && item.id !== filter.id) || typeof uploads !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(uploads)) {
      throw new Error('Die YouTube-API hat keine eindeutigen Kanal- und Upload-Daten geliefert.');
    }
    const result = { channelId: item.id, title: String(item.snippet?.title || 'YouTube-Kanal').slice(0, 100), uploads };
    remember(channels, cacheKey, result, 6 * 60 * 60 * 1000);
    remember(channels, JSON.stringify({ id: item.id }), result, 6 * 60 * 60 * 1000);
    return result;
  }
  async function uploads(meta) {
    const cached = feeds.get(meta.channelId);
    if (cached?.expires > now()) return structuredClone(cached.value);
    if (inFlight.has(meta.channelId)) return structuredClone(await inFlight.get(meta.channelId));
    const job = (async () => {
      const items = await request('playlistItems', { part: 'snippet,contentDetails,status', playlistId: meta.uploads, maxResults: '50' });
      const videos = [], ids = new Set();
      for (const item of items) {
        if (item?.status?.privacyStatus !== 'public') continue;
        const snippet = item.snippet, details = item.contentDetails;
        const id = details?.videoId, publishedAt = Date.parse(details?.videoPublishedAt);
        if (!VIDEO_ID.test(id) || !Number.isFinite(publishedAt) || snippet?.channelId !== meta.channelId ||
          snippet?.resourceId?.videoId !== id || (snippet.videoOwnerChannelId && snippet.videoOwnerChannelId !== meta.channelId)) {
          throw new Error('Ein Upload in der YouTube-API-Antwort konnte nicht sicher zugeordnet werden.');
        }
        if (ids.has(id)) continue;
        ids.add(id);
        videos.push({ id, title: String(snippet.title || 'Neues Video').slice(0, 256), publishedAt });
      }
      videos.sort((a, b) => a.publishedAt - b.publishedAt || a.id.localeCompare(b.id));
      const result = { channelId: meta.channelId, title: meta.title, videos };
      remember(feeds, meta.channelId, result, CACHE_MS);
      return result;
    })();
    inFlight.set(meta.channelId, job);
    try { return structuredClone(await job); }
    finally { inFlight.delete(meta.channelId); }
  }
  return {
    async readFeed(channelId) {
      if (!CHANNEL_ID.test(channelId)) throw new Error('Ungültige YouTube-Kanal-ID.');
      return uploads(await channel({ id: channelId }));
    },
    async resolve(filter) { return uploads(await channel(filter)); }
  };
}

let configuredKey, configuredClient;
function configuredApi() {
  const key = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) { configuredKey = undefined; configuredClient = undefined; return null; }
  if (configuredKey !== key) {
    configuredClient = createYouTubeApi({ apiKey: key });
    configuredKey = key;
  }
  return configuredClient;
}

module.exports = { createYouTubeApi, configuredApi };
