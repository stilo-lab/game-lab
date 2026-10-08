'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createScheduler, retryAfterMs, minimumInterval } = require('../src/ai_runtime');
const { createBackgroundTasks } = require('../src/background_tasks');
const quality = require('../src/ai_quality');
const health = require('../src/bot_health');
const { PermissionsBitField, MessageFlags } = require('discord.js');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const localRequire = require('node:module').createRequire(path.join(root, 'src/index.js'));
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function section(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start); return text.slice(from, to);
}
function scheduler(t, options = {}) {
  const result = createScheduler({ queueTimeoutMs: 200, attemptTimeoutMs: 200, executionTimeoutMs: 400, ...options });
  t.after(() => result.close()); return result;
}

test('General update changes only recorded sections of the 30-module tested release', () => {
  const { previousSetupRelease, spec } = require('./general_preservation');
  assert.equal(Object.keys(spec).length, 30);
  for (const [file, item] of Object.entries(spec)) {
    const text = previousSetupRelease(file, fs.readFileSync(path.join(root, 'src', file), 'utf8'));
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), item.sha256, file);
  }
});
test('AI work is FIFO for one model and another model remains usable', async t => {
  const queue = scheduler(t), gate = deferred(), order = [];
  const first = queue.run('chat', async () => { order.push('first'); await gate.promise; return 1; });
  const second = queue.run('chat', () => { order.push('second'); return 2; });
  assert.equal(await queue.run('support', () => 3), 3);
  assert.deepEqual(order, ['first']);
  gate.resolve(); assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(order, ['first', 'second']);
});
test('Full AI queues reject promptly and do not reject a different idle model', async t => {
  const queue = scheduler(t, { maxQueued: 1, maxTotalQueued: 1 }), gate = deferred();
  const first = queue.run('chat', () => gate.promise), second = queue.run('chat', () => 2);
  await assert.rejects(queue.run('chat', () => 3), /AI_QUEUE_FULL/);
  assert.equal(await queue.run('support', () => 'support works'), 'support works');
  assert.equal(queue.snapshot().queued, 1); gate.resolve(1);
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
});
test('The shared AI queue limit applies across busy models', async t => {
  const queue = scheduler(t, { maxQueued: 8, maxTotalQueued: 1 }), gate = deferred();
  const a = queue.run('a', () => gate.promise), b = queue.run('b', () => gate.promise);
  const pending = queue.run('a', () => 'next');
  await assert.rejects(queue.run('b', () => 'too many'), /AI_QUEUE_FULL/);
  gate.resolve('done'); assert.deepEqual(await Promise.all([a, b, pending]), ['done', 'done', 'next']);
});
test('Expired queued requests are removed and never call the AI provider', async t => {
  const queue = scheduler(t, { queueTimeoutMs: 20 }), gate = deferred(); let staleCalls = 0;
  const first = queue.run('chat', () => gate.promise);
  await assert.rejects(queue.run('chat', () => { staleCalls += 1; }), /AI_QUEUE_TIMEOUT/);
  assert.equal(queue.snapshot().queued, 0);
  const fresh = queue.run('chat', () => 'fresh'); gate.resolve(); await first;
  assert.equal(await fresh, 'fresh'); assert.equal(staleCalls, 0);
});
test('A hung request is locally aborted and does not block the next AI answer', async t => {
  const queue = scheduler(t, { attemptTimeoutMs: 20 }); let observedSignal;
  const hung = queue.run('chat', signal => { observedSignal = signal; return new Promise(() => {}); });
  const failed = assert.rejects(hung, /AI_REQUEST_TIMEOUT/);
  const next = queue.run('chat', () => 'recovered');
  await failed; assert.equal(observedSignal.aborted, true); assert.equal(await next, 'recovered');
});
test('Retry-After accepts seconds, HTTP dates and SDK header containers', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  assert.equal(retryAfterMs({ headers: new Headers({ 'Retry-After': '1.5' }) }, now), 1500);
  assert.equal(retryAfterMs({ response: { headers: { 'Retry-After': 'Tue, 06 Oct 2026 12:00:03 GMT' } } }, now), 3000);
  assert.equal(retryAfterMs({ rawResponse: { headers: { 'retry-after': 'nonsense' } } }, now), null);
  assert.equal(retryAfterMs({ headers: { 'retry-after': '' } }, now), null);
});
test('Retryable failures retry within the time budget, with a fresh abort signal', async t => {
  const queue = scheduler(t, { isRetryable: e => e.status === 429 }); const signals = [];
  const value = await queue.run('chat', signal => {
    signals.push(signal); if (signals.length === 1) throw { status: 429, headers: { 'retry-after': '0' } }; return 'ok';
  }, { maxRetries: 1 });
  assert.equal(value, 'ok'); assert.equal(signals.length, 2); assert.notEqual(signals[0], signals[1]);
});
test('Long provider cooldowns are honored without an endless wait or rapid retry', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-06T12:00:00Z') });
  const queue = scheduler(t, { isRetryable: e => e.status === 429, executionTimeoutMs: 40 }); let calls = 0;
  await assert.rejects(queue.run('chat', () => { calls += 1; throw Object.assign(new Error('rate limit'), { status: 429, headers: { 'retry-after': '3600' } }); }), /rate limit/);
  t.mock.timers.tick(300001);
  await assert.rejects(queue.run('chat', () => { calls += 1; }), /AI_QUEUE_TIMEOUT/);
  assert.equal(calls, 1);
});
test('Non-retryable AI errors do not loop or expose error text in diagnostics', async t => {
  const queue = scheduler(t); let calls = 0;
  await assert.rejects(queue.run('chat', () => { calls += 1; throw new Error('private-ticket-and-api-key'); }), /private-ticket/);
  assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(queue.snapshot()), /private|api-key/);
});
test('Shutdown rejects queued requests, aborts active requests and accepts no new work', async t => {
  const queue = scheduler(t); let signal;
  const first = queue.run('chat', value => { signal = value; return new Promise(() => {}); });
  const firstCheck = assert.rejects(first, /AI_SHUTTING_DOWN/);
  const secondCheck = assert.rejects(queue.run('chat', () => 'never'), /AI_SHUTTING_DOWN/);
  await turn(); queue.close(); queue.close(); await Promise.all([firstCheck, secondCheck]);
  assert.equal(signal.aborted, true); await assert.rejects(queue.run('chat', () => 1), /AI_SHUTTING_DOWN/);
});

function aiIntegration(sdk) {
  const context = { console: { warn() {} }, require: localRequire, Map, Date, setTimeout,
    GEMINI_API_KEY: 'mock-key', GEMINI_MODEL: 'chat-model', GEMINI_SUPPORT_MODEL: 'support-model',
    GEMINI_FALLBACK_MODEL: 'fallback-model', GEMINI_MIN_INTERVAL_MS: 0, GEMINI_SUPPORT_MIN_INTERVAL_MS: 0,
    geminiClientPromise: Promise.resolve(sdk) };
  vm.createContext(context);
  vm.runInContext(section(source, 'const geminiSerialByModel', 'function aiQuality()'), context);
  return context;
}
test('Actual generateContent integration forwards abort signals, tools, settings and configured fallback models', async t => {
  const calls = [];
  const context = aiIntegration({ models: { generateContent: async request => {
    calls.push(request); if (request.model === 'chat-model') throw { status: 503 }; return { text: 'ok' };
  } } });
  t.after(() => context.getGeminiTaskScheduler().close());
  const request = { contents: 'question', config: { systemInstruction: 'existing style', tools: [{ googleSearch: {} }], httpOptions: { timeout: 12345 } } };
  await context.generateGeminiContent(request, { maxRetries: 0 });
  assert.deepEqual(calls.map(x => x.model), ['chat-model', 'fallback-model']);
  for (const call of calls) {
    assert.ok(call.config.abortSignal instanceof AbortSignal); assert.equal(call.config.httpOptions.timeout, 12345);
    assert.deepEqual(call.config.tools, request.config.tools); assert.equal(call.config.systemInstruction, 'existing style');
  }
  assert.equal(request.config.abortSignal, undefined);
});
test('Actual AI integration does not fall back on bad configuration, queue overflow or shutdown', async t => {
  let calls = 0;
  const context = aiIntegration({ models: { generateContent: async () => { calls += 1; throw { status: 400 }; } } });
  t.after(() => context.getGeminiTaskScheduler().close());
  await assert.rejects(context.generateGeminiContent({ contents: 'x' }), e => e.status === 400);
  assert.equal(calls, 1); context.getGeminiTaskScheduler().close();
  await assert.rejects(context.generateGeminiContent({ contents: 'x' }), /AI_SHUTTING_DOWN/); assert.equal(calls, 1);
});
test('Transient HTTP 408 is retryable and invalid environment intervals retain safe defaults', () => {
  const context = aiIntegration({ models: {} });
  assert.equal(context.isRetryableGeminiError({ status: 408 }), true);
  assert.equal(context.isRetryableGeminiError({ status: 403 }), false);
  assert.equal(minimumInterval('kaputt', 4500, 4000), 4500);
  assert.equal(minimumInterval('', 12500, 10000), 12500);
  assert.equal(minimumInterval('1', 4500, 4000), 4000);
  assert.equal(minimumInterval('15000', 12500, 10000), 15000);
});
test('A new AI topic does not inherit unrelated learned knowledge; short follow-ups retain the recent topic', () => {
  const history = ['Altes Anime-Thema', 'Mein YouTube-Link meldet 404', 'Ich habe den Kanal-Link getestet'].map(text => ({ role: 'user', parts: [{ text }] }));
  assert.equal(quality.knowledgeQuery('Wie funktioniert Counting?', history), 'Wie funktioniert Counting?');
  const followup = quality.knowledgeQuery('geht nd', history);
  assert.match(followup, /YouTube/); assert.doesNotMatch(followup, /Anime/);
  const entries = [{ id: 'yt', topic: 'YouTube', text: 'YouTube: Kanal-ID prüfen' }, { id: 'count', topic: 'Counting', text: 'Counting braucht abwechselnde Mitglieder' }];
  assert.match(quality.selectKnowledge(entries, 'Counting', 5000), /Counting/);
  assert.doesNotMatch(quality.selectKnowledge(entries, 'Counting', 5000), /YouTube/);
  assert.equal(quality.selectKnowledge(entries, 'Turnier morgen', 5000), '');
});

function jobsFixture() {
  const timers = [], cleared = [], errors = [];
  const jobs = createBackgroundTasks({ setIntervalFn: fn => { const timer = { fn, unref() {} }; timers.push(timer); return timer; },
    clearIntervalFn: value => cleared.push(value), onError: (name, error) => errors.push([name, error.name]) });
  return { jobs, timers, cleared, errors };
}
test('Periodic jobs never overlap startup, timer ticks or duplicate scheduling', async () => {
  const f = jobsFixture(), gate = deferred(); let calls = 0;
  assert.equal(f.jobs.schedule('giveaway', () => { calls += 1; return gate.promise; }, 30), true);
  assert.equal(f.jobs.schedule('giveaway', () => { calls += 100; }, 30), false);
  const startup = f.jobs.run('giveaway'); f.timers[0].fn(); f.timers[0].fn(); await turn();
  assert.equal(calls, 1); assert.equal(f.jobs.run('giveaway'), startup);
  gate.resolve(); await startup; await f.jobs.stop(); assert.equal(f.cleared.length, 1);
});
test('Failed background jobs can run again and their error does not stop other jobs', async () => {
  const f = jobsFixture(); let fail = true, other = 0;
  f.jobs.schedule('a', () => { if (fail) throw new Error('private data'); return 'ok'; }, 10);
  f.jobs.schedule('b', () => { other += 1; }, 10);
  await assert.rejects(f.jobs.run('a')); await f.jobs.run('b'); fail = false;
  assert.equal(await f.jobs.run('a'), 'ok'); assert.equal(other, 1);
  assert.equal(f.jobs.snapshot().find(x => x.name === 'a').failures, 1);
  assert.doesNotMatch(JSON.stringify(f.jobs.snapshot()), /private data/); await f.jobs.stop();
});
test('Stopping jobs clears timers, waits for bounded draining and cannot be undone by late startup', async () => {
  const f = jobsFixture(); f.jobs.schedule('slow', () => new Promise(() => {}), 10); f.jobs.run('slow');
  const stop = f.jobs.stop({ drainMs: 10 }); assert.equal(f.jobs.stop(), stop); await stop;
  assert.equal(f.cleared.length, 1); assert.equal(f.jobs.schedule('late', () => 1, 10), false);
  f.timers[0].fn(); await f.jobs.run('slow'); assert.equal(f.jobs.snapshot()[0].runs, 1);
});
test('Community startup is idempotent, isolates failed guilds and never posts existing feeds as new uploads', async () => {
  const f = jobsFixture(), seen = [], context = { backgroundTasks: f.jobs, readyPromise: null, firstFeedCheck: true,
    client: { guilds: { cache: new Map([['bad', { id: 'bad' }], ['good', { id: 'good' }], ['pending', { id: 'pending' }]]) } },
    isGuildApproved: id => id !== 'pending', weeklyRollover: async guild => { if (guild.id === 'bad') throw Error('guild failure'); seen.push(['weekly', guild.id]); },
    processBirthdays: async guild => seen.push(['birthday', guild.id]), processEvents: async guild => seen.push(['event', guild.id]),
    checkFortniteFeeds: async (guild, post) => seen.push(['feed', guild.id, post]) };
  const community = fs.readFileSync(path.join(root, 'src/community.js'), 'utf8');
  vm.createContext(context); vm.runInContext(section(community, '  async function scheduler()', '  const fallbackCommunityQuestions'), context);
  const first = context.onReady(); assert.equal(context.onReady(), first); await first;
  assert.ok(seen.some(x => x[0] === 'weekly' && x[1] === 'good'));
  assert.ok(seen.filter(x => x[0] === 'feed').every(x => x[2] === false)); assert.equal(f.timers.length, 2);
  await f.jobs.run('fortnite-feeds'); assert.ok(seen.some(x => x[0] === 'feed' && x[2] === true));
  assert.ok(seen.every(x => x[1] !== 'pending')); await context.onShutdown(); assert.equal(f.cleared.length, 2);
});
test('A hanging Fortnite feed is aborted rather than keeping the community monitor stuck', async () => {
  const community = fs.readFileSync(path.join(root, 'src/community.js'), 'utf8'); let signal, requestedTimeout;
  const context = { apiKey: 'mock-key', AbortSignal: { timeout: ms => { requestedTimeout = ms; return AbortSignal.timeout(15); } },
    fetch: async (url, options) => { signal = options.signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } };
  vm.createContext(context); vm.runInContext(section(community, '  async function fetchFortnite(', '  function getNewsItems('), context);
  // AbortSignal.timeout is unref'd in Node; retain a short test handle while awaiting it.
  const keepAlive = setTimeout(() => {}, 200);
  try { await assert.rejects(context.fetchFortnite('v2/news/br'), error => error.name === 'TimeoutError'); }
  finally { clearTimeout(keepAlive); }
  assert.equal(requestedTimeout, 15000); assert.equal(signal.aborted, true);
});
test('One failed guild binding repair cannot prevent startup checks and monitors for other guilds', async () => {
  const f = jobsFixture(), seen = [], context = { shuttingDownVoice: false, BOT_NAME: 'Pixel',
    client: { user: { tag: 'Pixel', setActivity() {} }, guilds: { cache: new Map([['bad', { id: 'bad' }], ['good', { id: 'good' }]]) }, once: (event, fn) => { context.ready = fn; } },
    console: { log() {}, warn() {}, error() {} }, initializePet: async () => {}, bootstrapGuildApprovals: async () => {},
    mimicParty: { onReady: async () => {} }, youtubeUploads: { start: () => seen.push('uploads') }, registerCommands: async () => {},
    isGuildApproved: () => true, repairGuildBindings: guild => { if (guild.id === 'bad') throw Error('save failed'); seen.push('binding:' + guild.id); },
    snapshotInvites: async guild => seen.push('invites:' + guild.id), scanExistingExternalTickets: async () => null,
    backgroundTasks: f.jobs, processGiveaways: async () => seen.push('giveaways'), checkTicketInactivity: async () => seen.push('tickets'),
    community: { onReady: async () => seen.push('community') }, staff: { scheduledTick: async () => seen.push('staff') } };
  vm.createContext(context); vm.runInContext(section(source, 'client.once("clientReady"', 'client.on("guildCreate"'), context);
  await context.ready(); assert.ok(seen.includes('binding:good')); assert.ok(seen.includes('invites:bad'));
  for (const expected of ['uploads', 'giveaways', 'tickets', 'community', 'staff']) assert.ok(seen.includes(expected), expected);
  assert.equal(f.jobs.snapshot().length, 3); await f.jobs.stop();
});
test('The actual bot shutdown stops jobs and uploads, restores Voice games, saves state and logs out once', async () => {
  const events = [], timers = [], handlers = [];
  const context = { require: name => { assert.equal(name, './background_tasks'); return { createBackgroundTasks: () => ({ stop: async () => events.push('background') }) }; },
    process: { exit: code => events.push('exit:' + code), once: (name, fn) => handlers.push([name, fn]) },
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout: () => {}, console: { warn() {} },
    youtubeUploads: { stop: () => events.push('uploads') }, geminiTaskScheduler: { close: () => events.push('ai') },
    community: { onShutdown: async () => events.push('community') }, mimicParty: { onShutdown: async () => events.push('mimic') },
    spotifyParty: { onShutdown: () => events.push('spotify') }, saveDB: () => events.push('save'), client: { destroy: () => events.push('logout') } };
  vm.createContext(context); vm.runInContext(section(source, 'const backgroundTasks =', 'const youtubeUploads ='), context);
  await Promise.all([context.shutdownVoiceGames(), context.shutdownVoiceGames()]);
  assert.deepEqual(events.filter(x => x === 'exit:0'), ['exit:0']);
  for (const expected of ['uploads', 'ai', 'background', 'community', 'mimic', 'spotify', 'save', 'logout']) assert.equal(events.filter(x => x === expected).length, 1, expected);
  assert.ok(events.indexOf('mimic') < events.indexOf('logout')); assert.ok(events.indexOf('save') < events.indexOf('exit:0'));
  assert.deepEqual(handlers.map(x => x[0]), ['SIGTERM', 'SIGINT']); assert.equal(timers[0].ms, 10000);
});
test('Owner-panel restart uses graceful shutdown and repeated clicks cannot schedule duplicate restarts', async () => {
  const replies = [], timers = [], shutdown = () => {};
  const context = { id: 'owner_restart', restartTimer: null, MessageFlags, shutdownVoiceGames: shutdown,
    interaction: { reply: async value => replies.push(value) }, ownerNotify: async () => {}, client: {},
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; } };
  vm.createContext(context);
  vm.runInContext('async function click(){' + section(source, '        if (id === "owner_restart")', '\n      }\n    }\n  } catch') + '\n}', context);
  await context.click(); await context.click(); assert.equal(timers.length, 1);
  assert.equal(timers[0].fn, shutdown); assert.equal(timers[0].ms, 5 * 60 * 1000); assert.match(replies[1].content, /bereits/);
});
test('A transient Discord fetch error does not permanently end a giveaway before a draw', async () => {
  let fail = true, draws = 0, sent = 0;
  const giveaway = { guildId: 'g', channelId: 'c', messageId: 'm', endAt: 0, entries: ['a', 'b'], winnerCount: 1, prize: 'Test' };
  const channel = { messages: { fetch: async () => { if (fail) throw { status: 503 }; return {}; } }, send: async () => { sent += 1; } };
  const context = { db: { giveaways: { one: giveaway } }, Date, Math, Set, console: { warn() {} }, saveDB() {},
    client: { guilds: { cache: new Map([['g', { channels: { cache: new Map([['c', channel]]) } }]]) }, users: { fetch: async () => null } },
    giveawayDrawAnimation: async () => { draws += 1; }, updateGiveawayEndedMessage: async () => {}, ownerGroupNotify: async () => {}, rerollExpiredGiveaway: async () => assert.fail('unexpected reroll') };
  vm.createContext(context); vm.runInContext(section(source, 'async function processGiveaways()', 'function gameMinigame('), context);
  await context.processGiveaways(); assert.equal(giveaway.ended, undefined); assert.equal(draws, 0);
  fail = false; await context.processGiveaways(); assert.equal(giveaway.ended, true); assert.equal(giveaway.winners.length, 1);
  await context.processGiveaways(); assert.equal(draws, 1); assert.equal(sent, 1);
});

function healthFixture() {
  const F = PermissionsBitField.Flags, everyone = { id: 'everyone' };
  const all = new PermissionsBitField(Object.values(F));
  const member = { permissions: all };
  const channels = new Map();
  const guild = { roles: { everyone }, channels: { cache: channels }, members: { me: member } };
  function channel(id, privateChannel = false, permissions = all) {
    const result = { id, name: 'private-server-name-' + id, type: 0, topic: '', permissionsFor: who => who === everyone
      ? new PermissionsBitField(privateChannel ? [] : [F.ViewChannel]) : permissions };
    channels.set(id, result); return result;
  }
  const chat = channel('chat'), counting = channel('secret-counting'), logs = channel('secret-logs', true);
  const data = { channels: { counting: counting.id, supportLogs: logs.id }, counting: { current: 987, lastUserId: 'secret-user' }, settings: { aiEnabled: true } };
  return { guild, chat, member, data, channel, channels, options: { guild, channel: chat, member, data, purposes: ['counting', 'support-logs'], aiConfigured: true, channelsComplete: true, systems: { mimicAvailable: true, uploadsAvailable: true } } };
}
test('Diagnosis is read-only and hides private channel names, IDs, counting users and secrets', () => {
  const f = healthFixture(), before = JSON.stringify(f.data);
  const result = health.buildReport(f.options).toJSON(); const text = JSON.stringify(result);
  assert.match(text, /2\/2 nutzbar/); assert.match(text, /Counting/);
  assert.doesNotMatch(text, /private-server-name|secret-counting|secret-logs|secret-user|987/);
  assert.equal(JSON.stringify(f.data), before); assert.ok(result.fields.length <= 25);
});
test('Diagnosis gives actionable bot permission fixes without requiring user Manage Channels or Administrator', () => {
  const f = healthFixture(), F = PermissionsBitField.Flags;
  f.member.permissions = new PermissionsBitField([]);
  f.options.channel = { permissionsFor: () => new PermissionsBitField([F.ViewChannel]) };
  const text = JSON.stringify(health.buildReport(f.options).toJSON());
  assert.match(text, /Kanäle verwalten/); assert.match(text, /Dateien anhängen/);
  assert.doesNotMatch(text, /Administrator-Rechte|Du brauchst|Server verwalten/);
});
test('Missing counting reactions are detected even when the channel is otherwise usable', () => {
  const f = healthFixture(), F = PermissionsBitField.Flags;
  f.channel('secret-counting', false, new PermissionsBitField([F.ViewChannel, F.SendMessages, F.ReadMessageHistory]));
  const report = health.buildReport(f.options).toJSON();
  assert.match(JSON.stringify(report), /Reaktionen hinzufügen/); assert.equal(report.color, 0xF5B041);
});
test('A cache miss without a successful Discord refresh is reported as unknown rather than deleted', () => {
  const f = healthFixture(); f.channels.delete('secret-counting');
  const report = health.buildReport({ ...f.options, channelsComplete: false }).toJSON();
  assert.match(JSON.stringify(report), /1 ungeprüft/); assert.match(JSON.stringify(report), /nicht bestätigt/);
  assert.doesNotMatch(JSON.stringify(report), /gelöscht/);
});
test('Fresh diagnosis ignores stale cached channels which are absent from the REST channel snapshot', () => {
  const f = healthFixture(); const snapshot = new Map([['secret-logs', f.channels.get('secret-logs')], ['chat', f.chat]]);
  const report = health.buildReport({ ...f.options, channelSnapshot: snapshot }).toJSON();
  assert.match(JSON.stringify(report), /1 nicht gefunden oder ungeeignet/); assert.match(JSON.stringify(report), /setupmap set/);
  assert.equal(f.channels.has('secret-counting'), true);
});
test('Diagnosis handles unavailable bot membership and configuration without throwing or leaking errors', () => {
  const f = healthFixture(); const text = JSON.stringify(health.buildReport({ ...f.options, member: null, aiConfigured: false, maintenance: true, systems: {} }).toJSON());
  assert.match(text, /nicht geprüft/); assert.match(text, /GEMINI_API_KEY/); assert.match(text, /Wartungsmodus/);
});
test('Actual diagnosis defers privately, refreshes Discord data and never mutates database or channels', async () => {
  const f = healthFixture(), replies = [], operations = [];
  f.guild.members.fetchMe = async () => { operations.push('member'); return f.member; };
  f.guild.channels.fetch = async () => { operations.push('channels'); return f.channels; };
  const dataBefore = JSON.stringify(f.data);
  const interaction = { guild: f.guild, channel: f.chat, deferReply: async payload => replies.push(payload), editReply: async payload => replies.push(payload) };
  await health.diagnose(interaction, f.options);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral); assert.equal(replies[1].embeds.length, 1);
  assert.deepEqual(replies[1].allowedMentions, { parse: [] }); assert.deepEqual(operations.sort(), ['channels', 'member']);
  assert.equal(JSON.stringify(f.data), dataBefore);
});
test('Discord failures produce a partial diagnostic report; DMs receive a private server-only explanation', async () => {
  const f = healthFixture(); let last;
  f.guild.members.fetchMe = async () => { throw Error('private-secret'); };
  f.guild.channels.fetch = async () => { throw Error('private-secret'); };
  await health.diagnose({ guild: f.guild, channel: f.chat, deferReply: async () => {}, editReply: async value => { last = value; } }, f.options);
  const text = JSON.stringify(last); assert.match(text, /nicht aktuell geprüft/); assert.doesNotMatch(text, /private-secret/);
  await health.diagnose({ reply: async value => { last = value; } }); assert.equal(last.flags, MessageFlags.Ephemeral); assert.match(last.content, /Server/);
});
