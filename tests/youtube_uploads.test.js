'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UploadStore, createUploadMonitor, parseFeed, channelInput, channelIdFromPage, fetchYoutubeText, resolveChannel } = require('../src/youtube_uploads_core');
const { createYouTubeUploads, buildYouTubeUploadCommands } = require('../src/youtube_uploads');
const { PermissionsBitField, Collection, EmbedBuilder } = require('discord.js');
const CHANNEL = 'UC' + 'a'.repeat(22);
const OTHER = 'UC' + 'b'.repeat(22);
const TIME = 1_700_000_000_000;
const vid = (n, at = TIME + n * 1000) => ({ id: String(n).padStart(11, '0'), title: `Video ${n}`, publishedAt: at });
const feed = videos => ({ channelId: CHANNEL, title: 'Testkanal', videos });
const logger = { warn() {} };
function fileFor(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stilo-youtube-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'youtube_uploads.json');
}
function monitorFor(t) {
  const state = { current: feed([vid(0, TIME - 1000)]), now: TIME, enabled: true, sent: [], failure: false };
  const file = fileFor(t), store = new UploadStore(file);
  const options = { store, now: () => state.now, canRun: () => state.enabled, logger,
    fetchFeed: async () => state.current, deliver: async (s, v) => { if (state.failure) throw Error('Cannot send'); state.sent.push({ target: s.targetId, id: v.id }); } };
  const monitor = createUploadMonitor(options);
  const sub = monitor.add('1', '10', state.current);
  return { state, file, store, monitor, sub, options };
}
const xml = (videos, title = 'A &amp; B') => `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${CHANNEL}</yt:channelId><title>${title}</title>${videos.map(v => `<entry><yt:videoId>${v.id}</yt:videoId><yt:channelId>${CHANNEL}</yt:channelId><title>${v.title}</title><published>${new Date(v.publishedAt).toISOString()}</published><updated>2026-09-29T00:00:00Z</updated></entry>`).join('')}</feed>`;

test('Atom feed: video/Short IDs, XML entities and published ordering', () => {
  const result = parseFeed(xml([vid(2), vid(1), vid(1)]), CHANNEL);
  assert.equal(result.title, 'A & B');
  assert.deepEqual(result.videos.map(v => v.id), [vid(1).id, vid(2).id]);
  assert.equal(parseFeed(xml([]), CHANNEL).videos.length, 0);
});
test('Malformed, foreign-channel, DTD and incomplete feeds fail closed', () => {
  for (const value of ['<html>error</html>', xml([vid(1)]).replace('</entry>', ''), '<!DOCTYPE feed>' + xml([]), xml([vid(1)]).replace(vid(1).id, 'bad')]) assert.throws(() => parseFeed(value, CHANNEL));
  assert.throws(() => parseFeed(xml([]), OTHER));
});
test('Accepts channel/handle URLs, rejects lookalikes and single videos', () => {
  assert.equal(channelInput(`https://www.youtube.com/channel/${CHANNEL}/videos?x=1`).id, CHANNEL);
  assert.equal(channelInput('@Stilo').page, 'https://www.youtube.com/@Stilo');
  assert.equal(channelInput('youtube.com/@Stilo/shorts').page, 'https://www.youtube.com/@Stilo');
  for (const value of ['https://youtube.com.evil.test/@x', 'https://evil.test/?youtube.com', 'http://127.0.0.1', 'https://www.youtube.com:999/@x', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk']) assert.throws(() => channelInput(value));
});
test('Channel resolution uses channel metadata, not recommended-video IDs', async () => {
  const html = `<script>{"channelId":"${OTHER}"}</script><link type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}" rel="alternate">`;
  assert.equal(channelIdFromPage(html), CHANNEL);
  assert.throws(() => channelIdFromPage(`<script>{"channelId":"${OTHER}"}</script>`));
  let count = 0;
  const result = await resolveChannel('@Stilo', { fetchImpl: async () => new Response(count++ === 0 ? html : xml([vid(1)])) });
  assert.equal(result.channelId, CHANNEL); assert.equal(count, 2);
});
test('Network helper rejects external redirects and oversized responses', async () => {
  let calls = 0;
  await assert.rejects(fetchYoutubeText('https://www.youtube.com/@x', { fetchImpl: async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); } }));
  assert.equal(calls, 1);
  await assert.rejects(fetchYoutubeText('https://www.youtube.com/@x', { maxBytes: 5, fetchImpl: async () => new Response('0123456789') }));
});
test('Initial setup never announces old videos; new uploads send once across restarts', async t => {
  const h = monitorFor(t);
  await h.monitor.tick(); assert.equal(h.state.sent.length, 0);
  h.state.current = feed([vid(0, TIME - 1000), vid(1)]);
  await h.monitor.tick(); await h.monitor.tick();
  const restarted = createUploadMonitor({ ...h.options, store: new UploadStore(h.file) });
  await restarted.tick();
  assert.deepEqual(h.state.sent, [{ target: '10', id: vid(1).id }]);
});
test('Failed Discord sends remain queued, survive restart and outlive the RSS window', async t => {
  const h = monitorFor(t); h.state.failure = true; h.state.current = feed([vid(1)]);
  await h.monitor.tick(); assert.equal(h.store.get(h.sub.id).pending.length, 1);
  h.state.failure = false; h.state.current = feed([]);
  const restarted = createUploadMonitor({ ...h.options, store: new UploadStore(h.file) });
  await restarted.tick(); assert.equal(h.state.sent.length, 1); assert.equal(restarted.get(h.sub.id, '1').pending.length, 0);
});
test('Catch-up throttling queues all uploads instead of dropping overflow', async t => {
  const h = monitorFor(t); h.state.current = feed(Array.from({ length: 12 }, (_, i) => vid(i + 1)));
  await h.monitor.tick(); assert.equal(h.state.sent.length, 5); assert.equal(h.store.get(h.sub.id).pending.length, 7);
  await h.monitor.tick(); await h.monitor.tick(); assert.equal(h.state.sent.length, 12);
  assert.deepEqual(h.state.sent.map(s => s.id), h.state.current.videos.map(v => v.id));
});
test('Pause/maintenance prevent sending; channel changes route queued/new uploads', async t => {
  const h = monitorFor(t); h.state.current = feed([vid(1)]);
  await h.monitor.edit(h.sub.id, '1', { paused: true }); await h.monitor.tick(); assert.equal(h.state.sent.length, 0);
  await h.monitor.edit(h.sub.id, '1', { paused: false, targetId: '11' }); h.state.enabled = false;
  await h.monitor.tick(); assert.equal(h.state.sent.length, 0);
  h.state.enabled = true; await h.monitor.tick(); assert.equal(h.state.sent[0].target, '11');
});
test('Duplicate subscription, foreign-server mutations and removed subscriptions are rejected', async t => {
  const h = monitorFor(t);
  assert.throws(() => h.monitor.add('1', '10', h.state.current));
  await assert.rejects(h.monitor.edit(h.sub.id, '2', { paused: true }));
  await assert.rejects(h.monitor.remove(h.sub.id, '2'));
  await h.monitor.remove(h.sub.id, '1'); h.state.current = feed([vid(1)]); await h.monitor.tick();
  assert.equal(h.state.sent.length, 0); assert.equal(h.monitor.list('1').length, 0);
});
test('Overlapping polls send only once and share one feed fetch per channel', async t => {
  const h = monitorFor(t); h.monitor.add('1', '11', h.state.current); let reads = 0, sends = 0;
  const monitor = createUploadMonitor({ ...h.options, fetchFeed: async () => { reads++; await new Promise(resolve => setImmediate(resolve)); return feed([vid(1)]); }, deliver: async () => { sends++; } });
  await Promise.all([monitor.tick(), monitor.tick()]); assert.equal(reads, 1); assert.equal(sends, 2);
});
test('One bad feed does not block other subscriptions; backoff limits repeated failures', async t => {
  const h = monitorFor(t); h.monitor.add('1', '11', { ...h.state.current, channelId: OTHER }); let fails = 0;
  const monitor = createUploadMonitor({ ...h.options, fetchFeed: async id => { if (id === CHANNEL) { fails++; throw Error('HTTP 503'); } return { ...feed([vid(1)]), channelId: OTHER }; } });
  await monitor.tick(); await monitor.tick(); assert.equal(fails, 1); assert.equal(h.state.sent.length, 1);
});
test('Corrupt storage is not reset or overwritten', async t => {
  const file = fileFor(t); fs.writeFileSync(file, 'BROKEN');
  const store = new UploadStore(file); assert.throws(() => store.list()); assert.throws(() => store.commit(() => {}));
  assert.equal(fs.readFileSync(file, 'utf8'), 'BROKEN');
});
test('Legacy import preserves subscription, role and seen videos without changing the main database', async t => {
  const file = fileFor(t), store = new UploadStore(file);
  const legacy = { '1': [{ id: 'YT-1', discordChannelId: '10', youtubeChannelId: CHANNEL, youtubeName: 'Legacy', pingRoleId: '99', createdAt: TIME, initialized: true, seenVideoIds: [vid(0).id] }] };
  const before = JSON.stringify(legacy); store.importLegacy(legacy, TIME);
  const monitor = createUploadMonitor({ store, canRun: () => false, deliver() {}, logger });
  const sub = monitor.get('YT-1', '1'); assert.equal(sub.pingRoleId, '99'); assert.equal(JSON.stringify(legacy), before);
  await monitor.remove('YT-1', '1'); const restarted = new UploadStore(file); restarted.importLegacy(legacy, TIME);
  assert.equal(restarted.list().length, 0, 'Removed legacy subscriptions must never reappear');
});

function uiFor(t, legacySubscriptions) {
  const state = { current: feed([vid(0, TIME - 1000)]), now: TIME, allowed: true, maintenance: false, approved: true, history: new Collection(), sent: [] };
  const botMember = { id: 'bot' };
  const channel = { id: '10', guildId: '1', name: 'uploads', type: 0,
    permissionsFor: () => new PermissionsBitField(state.allowed ? PermissionsBitField.All : 0n),
    messages: { fetch: async () => state.history }, send: async payload => {
      for (const e of payload.embeds || []) new EmbedBuilder(e).toJSON();
      for (const r of payload.components || []) r.toJSON();
      state.sent.push(payload); state.history.set(String(state.sent.length), { author: { id: 'bot' }, embeds: payload.embeds });
    } };
  const guild = { id: '1', ownerId: 'owner', members: { me: botMember },
    channels: { cache: new Collection([['10', channel]]), fetch: async id => id === '10' ? channel : null },
    roles: { fetch: async id => ({ id, mentionable: true }) } };
  const client = { isReady: () => true, user: { id: 'bot' }, guilds: { cache: new Collection([['1', guild]]) } };
  const mod = createYouTubeUploads({ client, OWNER_ID: 'owner', isGuildApproved: () => state.approved,
    isMaintenance: () => state.maintenance, dataFile: fileFor(t), now: () => state.now, logger, legacySubscriptions,
    resolveFeed: async () => state.current, fetchFeed: async () => state.current });
  t.after(() => mod.stop());
  const interaction = (options = {}) => {
    const i = { guild, user: { id: 'admin' }, member: { id: 'admin' }, memberPermissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild),
      commandName: 'uploads', options: { getString: () => null, getChannel: () => null, getRole: () => null },
      isChatInputCommand() { return !this.customId; }, ...options };
    const validate = payload => { for (const r of payload.components || []) r.toJSON(); for (const e of payload.embeds || []) new EmbedBuilder(e).toJSON(); i.payload = payload; };
    i.deferReply = async () => { i.deferred = true; };
    i.deferUpdate = async () => { i.deferred = true; };
    i.reply = async p => { i.replied = true; validate(p); };
    i.editReply = async p => validate(p);
    i.showModal = async m => { i.modal = m.toJSON(); };
    return i;
  };
  return { state, mod, interaction, channel };
}
test('Real Discord builders validate both commands and the complete setup/menu flow', async t => {
  assert.deepEqual(buildYouTubeUploadCommands().map(c => c.toJSON().name), ['uploads', 'youtube']);
  const h = uiFor(t); const home = h.interaction(); await h.mod.handleInteraction(home); assert.match(home.payload.embeds[0].title, /YouTube/);
  const add = h.interaction({ customId: 'yt_uploads:add' }); await h.mod.handleInteraction(add); assert.equal(add.modal.custom_id, 'yt_uploads:submit');
  const submit = h.interaction({ customId: 'yt_uploads:submit', fields: { getTextInputValue: () => '@Stilo' } }); await h.mod.handleInteraction(submit);
  const id = submit.payload.components[0].toJSON().components[0].custom_id;
  assert.match(id, /^yt_uploads:destination:/);
  const select = h.interaction({ customId: id, values: ['10'] }); await h.mod.handleInteraction(select);
  assert.match(select.payload.content, /Gespeichert/); assert.equal(h.mod.monitor.list('1').length, 1);
  assert.equal(h.state.sent.length, 0);
});
test('No permission or wrong setup owner cannot configure uploads', async t => {
  const h = uiFor(t); const denied = h.interaction({ memberPermissions: new PermissionsBitField(0n) });
  await h.mod.handleInteraction(denied); assert.match(denied.payload.content, /Server verwalten/);
  const submit = h.interaction({ customId: 'yt_uploads:submit', fields: { getTextInputValue: () => '@Stilo' } }); await h.mod.handleInteraction(submit);
  const customId = submit.payload.components[0].toJSON().components[0].custom_id;
  const intruder = h.interaction({ customId, values: ['10'], user: { id: 'other-admin' } });
  await h.mod.handleInteraction(intruder); assert.match(intruder.payload.content, /abgelaufen/); assert.equal(h.mod.monitor.list('1').length, 0);
});
test('Missing bot permissions keep uploads queued; recovery delivers with thumbnail/button', async t => {
  const h = uiFor(t); const sub = h.mod.monitor.add('1', '10', h.state.current, TIME);
  h.state.current = feed([vid(1)]); h.state.allowed = false; await h.mod.monitor.tick();
  assert.equal(h.state.sent.length, 0); assert.equal(h.mod.monitor.get(sub.id, '1').pending.length, 1);
  h.state.allowed = true; await h.mod.monitor.tick();
  assert.equal(h.state.sent.length, 1); assert.match(h.state.sent[0].embeds[0].image.url, /hqdefault/);
  assert.equal(h.state.sent[0].enforceNonce, true);
});
test('Crash-window recovery checks recent Discord history before resending', async t => {
  const h = uiFor(t); const sub = h.mod.monitor.add('1', '10', h.state.current, TIME);
  h.state.current = feed([vid(1)]);
  h.state.history.set('sent-before-crash', { author: { id: 'bot' }, embeds: [{ footer: { text: `Made with ❤️ by Stilo • YouTube:${sub.id}:${vid(1).id}` } }] });
  await h.mod.monitor.tick(); assert.equal(h.state.sent.length, 0); assert.equal(h.mod.monitor.get(sub.id, '1').pending.length, 0);
});
test('Role mention is opt-in, restricted to the chosen role; tests never ping', async t => {
  const h = uiFor(t); const sub = h.mod.monitor.add('1', '10', h.state.current, TIME, '99');
  h.state.current = feed([vid(1)]); await h.mod.monitor.tick();
  assert.deepEqual(h.state.sent[0].allowedMentions, { parse: [], roles: ['99'] });
  const i = h.interaction({ customId: `yt_uploads:test:${sub.id}` }); await h.mod.handleInteraction(i);
  assert.deepEqual(h.state.sent[1].allowedMentions, { parse: [], roles: [] });
});
test('Settings, pause/remove UI, legacy commands and unrelated interactions remain isolated', async t => {
  const h = uiFor(t); const sub = h.mod.monitor.add('1', '10', h.state.current);
  assert.equal(await h.mod.handleInteraction(h.interaction({ commandName: 'spotify' })), false);
  assert.equal(await h.mod.handleInteraction(h.interaction({ customId: 'ticket_close' })), false);
  const role = h.interaction({ customId: `yt_uploads:role:${sub.id}` }); await h.mod.handleInteraction(role);
  assert.equal(role.payload.components[0].toJSON().components[0].type, 6);
  const pause = h.interaction({ customId: `yt_uploads:pause:${sub.id}` }); await h.mod.handleInteraction(pause);
  assert.equal(h.mod.monitor.get(sub.id, '1').paused, true);
  const list = h.interaction({ commandName: 'youtube', options: { getSubcommand: () => 'list' } }); await h.mod.handleInteraction(list);
  assert.match(list.payload.embeds[0].description, /Testkanal/);
  const remove = h.interaction({ customId: `yt_uploads:remove:${sub.id}` }); await h.mod.handleInteraction(remove);
  assert.equal(h.mod.monitor.list('1').length, 0);
});
test('Corrupt YouTube data disables only YouTube and returns an actionable error', async t => {
  const h = uiFor(t); h.mod.stop(); const file = fileFor(t); fs.writeFileSync(file, 'invalid');
  const mod = createYouTubeUploads({ client: {}, OWNER_ID: 'owner', isGuildApproved: () => true, dataFile: file, logger });
  mod.start(); const i = h.interaction(); await mod.handleInteraction(i);
  assert.match(i.payload.content, /Speicherdatei/); assert.equal(await mod.handleInteraction(h.interaction({ commandName: 'ai' })), false);
});
