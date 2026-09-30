const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const pet = require('../src/pixel_gojo');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function chat(generate) {
  const ctx = {
    Date, Map, Set, JSON, console, AI_NAME: pet.AI_NAME, BOT_NAME: 'Unchanged Bot', GEMINI_MODEL: 'configured-model',
    generateGeminiContent: generate,
    getGuildLearnContext: () => ({ instructions: 'Antworte kurz', knowledge: 'Serverevent am Freitag' }),
    getAiFeedbackText: () => 'Beispiele nennen', geminiStatus: e => e?.status || null
  };
  vm.createContext(ctx);
  vm.runInContext(section('const aiConversationHistory', 'const geminiSerialByModel') +
    section('function aiConversationKey(', 'function splitDiscordText(') +
    section('function chatAiErrorMessage(', 'const ticketAiQueues') + '\nthis.history = aiConversationHistory;', ctx);
  return ctx;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('The bundled original pet is an animated GIF, sent before answer text', async () => {
  const gif = fs.readFileSync(pet.ANIMATION_PATH);
  assert.match(gif.subarray(0, 6).toString(), /^GIF8[79]a$/);
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0')));
  const sent = [];
  await pet.sendAiAnimation(async p => { sent.push(p); });
  sent.push(pet.aiTextPayload('Hier ist deine Antwort.'));
  assert.equal(sent[0].files[0].name, 'pixel-gojo.gif');
  assert.equal(sent[0].embeds[0].title, 'Pixel Gojo');
  assert.match(sent[1].content, /^\*\*Pixel Gojo\*\*/);
  assert.deepEqual(sent[1].allowedMentions.parse, []);
});
test('Missing attachment permission falls back to a name without preventing text', async () => {
  const sent = [];
  await pet.sendAiAnimation(async p => { if (p.files) throw { code: 50013 }; sent.push(p); });
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Pixel Gojo/);
});
test('The actual /ai handler sends the animation before generation and each answer chunk', async () => {
  const events = [];
  const interaction = { guild: { id: 'g' }, channelId: 'c', channel: { id: 'c' }, user: { id: 'u', tag: 'User' },
    options: { getString: () => 'Frage' }, deferReply: async () => { events.push('defer'); },
    editReply: async p => { assert.ok(p.files); events.push('animation'); },
    followUp: async p => { assert.match(p.content, /Pixel Gojo/); events.push('answer'); } };
  const ctx = { interaction, serverSettings: () => ({ aiEnabled: true }), aiCooldownRemaining: () => 0,
    startAiCooldown() {}, sendAiAnimation: pet.sendAiAnimation, aiTextPayload: pet.aiTextPayload,
    askGemini: async (...args) => { assert.equal(args[4], 'c'); events.push('generate'); return 'Antwort'; },
    recordAiReview() {}, splitDiscordText: () => ['Teil eins', 'Teil zwei'], console };
  await vm.runInNewContext('(async () => { switch ("ai") { ' + section('        case "ai": {', '        case "aipulse": {') + ' } })()', ctx);
  assert.deepEqual(events, ['defer', 'animation', 'generate', 'answer', 'answer']);
});
test('Chat retains admin knowledge and follow-ups, isolated by channel and user', async () => {
  const requests = [];
  const ctx = chat(async r => { requests.push(r); return { text: `Antwort ${requests.length}` }; });
  await ctx.askGemini('Wie geht Minecraft?', 'User', 'g', 'u', 'c');
  await ctx.askGemini('Und wieso?', 'User', 'g', 'u', 'c');
  assert.equal(requests[1].contents.length, 3);
  assert.equal(requests[1].contents[0].parts[0].text, 'Wie geht Minecraft?');
  assert.match(requests[1].config.systemInstruction, /Pixel Gojo/);
  assert.match(requests[1].config.systemInstruction, /Serverevent am Freitag/);
  assert.match(requests[1].config.systemInstruction, /Beispiele nennen/);
  await ctx.askGemini('Andere Frage', 'User', 'g', 'u', 'private');
  await ctx.askGemini('Andere Person', 'Other', 'g', 'other', 'c');
  assert.equal(requests[2].contents.length, 1);
  assert.equal(requests[3].contents.length, 1);
});
test('Repeated answers trigger a fresh attempt, failures do not become history', async () => {
  const repeated = 'Eine lange identische Antwort auf eine Frage, die hier nicht einfach wiederholt werden soll.';
  const answers = [repeated, repeated, 'Eine neue konkrete Erklärung mit einem anderen Beispiel.'];
  const ctx = chat(async () => ({ text: answers.shift() }));
  await ctx.askGemini('Frage', 'User', 'g', 'u', 'c');
  const response = await ctx.askGemini('Genauer?', 'User', 'g', 'u', 'c');
  assert.match(response, /neue konkrete/);
  ctx.generateGeminiContent = async () => ({ text: '' });
  await assert.rejects(ctx.askGemini('Weiter?', 'User', 'g', 'u', 'c'), /AI_EMPTY_RESPONSE/);
  assert.equal(ctx.getAiConversation('g', 'u', 'c').length, 4);
});
test('Persistent repetition is reported, and simultaneous requests do not overwrite memory', async () => {
  const repeated = 'Diese längere Antwort wird leider immer wieder unverändert vom Modell zurückgegeben.';
  const ctx = chat(async () => ({ text: repeated }));
  await ctx.askGemini('Frage', 'User', 'g', 'u', 'c');
  await assert.rejects(ctx.askGemini('Mehr?', 'User', 'g', 'u', 'c'), /AI_REPEATED_RESPONSE/);
  assert.equal(ctx.getAiConversation('g', 'u', 'c').length, 2);
  let release;
  ctx.generateGeminiContent = () => new Promise(resolve => { release = resolve; });
  const pending = ctx.askGemini('Andere Frage', 'User', 'g', 'u', 'c');
  await assert.rejects(ctx.askGemini('Noch eine', 'User', 'g', 'u', 'c'), /AI_BUSY/);
  release({ text: 'Neue Antwort.' });
  await pending;
});
test('Chat memory expires and has a size bound', async () => {
  const ctx = chat(async () => ({ text: 'Antwort' }));
  for (let i = 0; i < 305; i++) ctx.rememberAiExchange('g', `u${i}`, 'Frage', 'Antwort', 'c');
  assert.equal(ctx.history.size, 300);
  ctx.history.get(ctx.aiConversationKey('g', 'u304', 'c')).updatedAt = 0;
  assert.equal(ctx.getAiConversation('g', 'u304', 'c').length, 0);
});

function communityFixture({ enabled = true, generate = async () => ({ text: 'Ein gemeinsamer Minecraft-Abend hilft neuen Mitgliedern. Testet zuerst einen festen Termin.' }) } = {}) {
  const { createCommunity } = require('../src/community');
  const { Collection } = require('discord.js');
  const gd = { community: { channels: { suggestions: 'suggestions' } } }, db = { users: {} };
  const sent = [], replies = [], edits = [];
  const guild = { id: 'g', channels: { cache: new Collection() } };
  const channel = { id: 'suggestions', guild, send: async p => {
    sent.push(p);
    return { id: 'suggestion-1', guild, channel, author: { id: 'bot', bot: true }, url: 'https://discord.com/test',
      edit: async p => { edits.push(p); }, reply: async p => { replies.push(p); return { id: `reply-${replies.length}` }; } };
  } };
  guild.channels.cache.set(channel.id, channel);
  const community = createCommunity({ client: { user: { id: 'bot' } }, db, saveDB() {}, guildData: () => gd,
    userData: (g, u) => (db.users[`${g}:${u}`] ||= { xp: 0, level: 0, invites: 0 }), footer: x => x,
    cleanName: x => x, generateGeminiContent: generate, GEMINI_MODEL: 'configured-model',
    isAiEnabled: () => enabled, isGuildApproved: () => true, chatAiErrorMessage: () => 'Anfragelimit erreicht.' });
  const interaction = { guild, user: { id: 'user' }, isChatInputCommand: () => true, commandName: 'suggest',
    options: { getString: () => 'Ein gemeinsamer Minecraft-Abend am Freitag.' }, reply: async () => {} };
  const raw = { id: 'raw-1', guild, channel, author: { id: 'user', bot: false }, content: 'Minecraft-Abend am Freitag',
    reply: async p => { replies.push(p); return { id: `raw-reply-${replies.length}` }; } };
  return { community, db, gd, sent, replies, edits, interaction, raw, channel };
}
test('/suggest posts voting controls, then animated feedback without deciding status', async () => {
  const f = communityFixture();
  await f.community.handleInteraction(f.interaction);
  await flush();
  assert.equal(f.sent.length, 1);
  assert.ok(f.replies[0].files);
  assert.match(f.replies[1].content, /Minecraft/);
  assert.equal(f.db.suggestions['suggestion-1'].status, 'Under Review');
  assert.equal(f.db.suggestions['suggestion-1'].up.length, 0);
  assert.equal(f.db.suggestions['suggestion-1'].aiReplyId, 'reply-2');
  assert.equal(f.edits[0].components[0].components.length, 2);
});
test('Suggestion modal uses the same animated feedback path', async () => {
  const f = communityFixture();
  await f.community.handleInteraction({ ...f.interaction, isChatInputCommand: () => false,
    isModalSubmit: () => true, customId: 'suggestion_modal',
    fields: { getTextInputValue: key => key === 'suggestion_title' ? 'Minecraft-Abend' : 'Freitag zusammen spielen' } });
  await flush();
  assert.equal(f.sent.length, 1);
  assert.ok(f.replies[0].files);
  assert.match(f.replies[1].content, /Pixel Gojo/);
});
test('Direct suggestions receive one response; bots and discussion replies do not', async () => {
  const f = communityFixture();
  await f.community.onMessage(f.raw);
  await flush();
  await f.community.onMessage(f.raw);
  await f.community.onMessage({ ...f.raw, id: 'bot-post', author: { id: 'bot', bot: true } });
  await f.community.onMessage({ ...f.raw, id: 'discussion', reference: { messageId: 'raw-1' } });
  await f.community.onMessage({ ...f.raw, id: 'other-channel', channel: { id: 'general' } });
  await flush();
  assert.equal(f.replies.length, 2);
});
test('AI disabled preserves suggestions without AI calls, and provider failure preserves votes', async () => {
  const off = communityFixture({ enabled: false, generate: () => { throw Error('must not call'); } });
  await off.community.handleInteraction(off.interaction);
  await flush();
  assert.equal(off.sent.length, 1);
  assert.equal(off.replies.length, 0);
  const fail = communityFixture({ generate: async () => { throw { status: 429 }; } });
  await fail.community.handleInteraction(fail.interaction);
  await flush();
  assert.match(fail.replies[1].content, /Anfragelimit/);
  assert.equal(fail.db.suggestions['suggestion-1'].status, 'Under Review');
});
test('Setup updates an existing panel; access errors do not create duplicates', async () => {
  let edits = 0, sends = 0;
  const gd = { setupPanels: { support: 'old' } };
  const ctx = { guildData: () => gd, client: { user: { id: 'bot' } }, saveDB() {} };
  vm.createContext(ctx);
  vm.runInContext(section('async function upsertSetupPanel(', 'const SETUP_CHANNEL_INFO'), ctx);
  const channel = { messages: { fetch: async () => ({ id: 'old', author: { id: 'bot' }, edit: async () => { edits++; } }) },
    send: async () => { sends++; return { id: 'new' }; } };
  await ctx.upsertSetupPanel(channel, 'g', 'support', {});
  assert.equal(edits, 1); assert.equal(sends, 0);
  channel.messages.fetch = async () => { throw { code: 50013 }; };
  await assert.rejects(ctx.upsertSetupPanel(channel, 'g', 'support', {}));
  assert.equal(sends, 0);
});
test('Setup locks concurrent runs and releases the lock after failure', async () => {
  let release, runs = 0, refusals = 0;
  const ctx = { Set, MessageFlags: { Ephemeral: 64 }, runSetupCheck: async () => { runs++; await new Promise(r => { release = r; }); throw Error('test failure'); } };
  vm.createContext(ctx);
  vm.runInContext(section('const setupInProgress', 'async function runSetupCheck('), ctx);
  const interaction = { guild: { id: 'g' }, reply: async () => { refusals++; } };
  const first = ctx.runSetup(interaction);
  await ctx.runSetup(interaction);
  assert.equal(runs, 1); assert.equal(refusals, 1);
  release(); await assert.rejects(first, /test failure/);
  ctx.runSetupCheck = async () => { runs++; };
  await ctx.runSetup(interaction);
  assert.equal(runs, 2);
});
