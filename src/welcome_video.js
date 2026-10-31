'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PermissionFlagsBits: P } = require('discord.js');

const DEFAULT_FILE = path.join(__dirname, '..', 'assets', 'welcome', 'welcome.mp4');
const MAX_BYTES = 8 * 1024 * 1024; // Conservative local budget, not a claim about Discord's current limit.
const ID = /^\d{17,20}$/;
const nonce = key => BigInt('0x' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)).toString();

function createWelcomeVideo({ client, file = DEFAULT_FILE, enabled = () => true, now = Date.now, logger = console } = {}) {
  const queues = new Map(), seen = new Map(), rates = new Map(), warnings = new Map(), waiting = [];
  let pending = 0, uploading = 0, cached = null;
  function warn(gid, code) {
    const key = gid + ':' + code, prior = warnings.get(key);
    if (prior !== undefined && now() - prior < 60000) return;
    warnings.set(key, now());
    while (warnings.size > 1000) warnings.delete(warnings.keys().next().value);
    try { logger.warn('Welcome video:', { guildId: gid, code }); } catch {}
  }
  function allowed(gid) { try { return Boolean(enabled(gid)); } catch { return false; } }
  async function media() {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 12 || stat.size > MAX_BYTES) throw Error('Invalid welcome video asset.');
    if (!cached || cached.size !== stat.size || cached.mtime !== stat.mtimeMs) {
      const bytes = await fs.readFile(file);
      if (bytes.length !== stat.size || bytes.length > MAX_BYTES || bytes.toString('ascii', 4, 8) !== 'ftyp') throw Error('Invalid MP4 asset.');
      cached = { size: stat.size, mtime: stat.mtimeMs, bytes };
    }
    return cached.bytes;
  }
  async function acquire() {
    if (uploading < 2) { uploading++; return; }
    await new Promise(resolve => waiting.push(resolve));
  }
  function release() { const next = waiting.shift(); if (next) next(); else uploading--; }
  function claim(gid) {
    for (const [id, times] of rates) if (!times.some(at => now() - at < 60000)) rates.delete(id);
    const recent = (rates.get(gid) || []).filter(at => now() - at < 60000);
    if (recent.length >= 12) return false;
    recent.push(now()); rates.set(gid, recent);
    while (rates.size > 1000) rates.delete(rates.keys().next().value);
    return true;
  }
  async function text(channel, payload, key, uid) {
    return channel.send({ ...payload, nonce: nonce(key + ':welcome'), enforceNonce: true,
      allowedMentions: { parse: [], users: [uid], roles: [], repliedUser: false } });
  }
  async function run(member, channel, payload, key, queuedAt, video = true) {
    const gid = member.guild.id;
    if (!allowed(gid)) return { status: 'disabled' };
    let welcome;
    try { welcome = await text(channel, payload, key, member.id); }
    catch { warn(gid, 'welcome-send-failed'); return { status: 'welcome-failed' }; }
    if (!video) return { status: 'text-only' };
    if (!ID.test(welcome?.id)) { warn(gid, 'welcome-not-confirmed'); return { status: 'text-only' }; }
    await acquire();
    try {
      if (!allowed(gid) || now() - queuedAt > 120000) return { status: 'text-only' };
      const me = member.guild.members.fetchMe ? await member.guild.members.fetchMe({ force: true }) : member.guild.members.me;
      if (!me || me.id !== client?.user?.id || !channel.permissionsFor?.(me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles])) {
        warn(gid, 'missing-attachment-permissions'); return { status: 'text-only' };
      }
      const bytes = await media();
      if (!allowed(gid)) return { status: 'text-only' };
      if (!claim(gid)) { warn(gid, 'join-wave-video-limit'); return { status: 'text-only' }; }
      await channel.send({ files: [{ attachment: bytes, name: 'welcome.mp4', description: 'Welcome video' }],
        nonce: nonce(key + ':video'), enforceNonce: true, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
      return { status: 'sent', welcomeId: welcome.id };
    } catch { warn(gid, 'video-unavailable-or-upload-failed'); return { status: 'text-only' }; }
    finally { release(); }
  }
  function send(member, channel, payload) {
    const gid = member?.guild?.id, uid = member?.id;
    if (!ID.test(gid) || !ID.test(uid) || channel?.guildId !== gid || ![0, 5].includes(channel.type)) return Promise.resolve({ status: 'unavailable' });
    const joined = Number(member.joinedTimestamp), key = gid + ':' + uid + ':' + (Number.isFinite(joined) && joined > 0 ? joined : 'unknown');
    for (const [id, at] of seen) if (now() - at >= 600000) seen.delete(id);
    if (seen.has(key)) return Promise.resolve({ status: 'duplicate' });
    seen.set(key, now()); while (seen.size > 5000) seen.delete(seen.keys().next().value);
    const q = queues.get(gid) || { tail: Promise.resolve(), count: 0 };
    if (q.count >= 25 || pending >= 100) {
      warn(gid, 'queue-full-video-skipped'); return run(member, channel, payload, key, now(), false);
    }
    queues.set(gid, q); q.count++; pending++;
    const queuedAt = now(), task = q.tail.then(() => run(member, channel, payload, key, queuedAt));
    const done = () => { q.count--; pending--; if (!q.count && queues.get(gid) === q) queues.delete(gid); };
    q.tail = task.catch(() => {});
    return task.then(result => { done(); return result; }, () => { done(); warn(gid, 'delivery-failed'); return { status: 'text-only' }; });
  }
  return { send };
}
module.exports = { DEFAULT_FILE, MAX_BYTES, createWelcomeVideo };
