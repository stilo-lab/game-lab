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
    Date, Map, Set, JSON, console, require: require('node:module').createRequire(path.join(__dirname, '../src/index.js')), AI_NAME: pet.AI_NAME, BOT_NAME: 'Unchanged Bot', GEMINI_MODEL: 'configured-model',
    generateGeminiContent: generate,
    getGuildLearnContext: () => ({ instructions: 'Antworte kurz', knowledge: 'Serverevent am Freitag' }),
    getAiFeedbackText: () => 'Beispiele nennen', geminiStatus: e => e?.status || null
  };
  vm.createContext(ctx);
  vm.runInContext(section('const aiConversationHistory', 'const geminiSerialByModel') +
    section('function aiQuality()', 'function splitDiscordText(') +
    section('function chatAiErrorMessage(', 'const ticketAiQueues') + '\nthis.history = aiConversationHistory;', ctx);
  return ctx;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Pet assets are animated, below the emoji size limit and exclude Hollow Purple frames', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pet.ASSET_DIR, 'animations.json')));
  assert.deepEqual(manifest.excluded_source_cells, { row: 7, columns: [2, 3, 4, 5] });
  for (const state of ['laptop', 'idle', 'jumping', 'waiting', 'waving', 'running-left', 'running-right', 'review', 'failed', 'look', 'blue-red', 'all']) {
    const bytes = fs.readFileSync(path.join(pet.ASSET_DIR, state + '.gif'));
    assert.match(bytes.subarray(0, 6).toString(), /^GIF8[79]a$/);
    assert.ok(bytes.length < 256 * 1024);
    assert.ok(manifest.animations[state].frames > 1);
    assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), manifest.animations[state].sha256);
  }
  assert.deepEqual(fs.readFileSync(path.join(pet.ASSET_DIR, '..', 'pixel-gojo.gif')), fs.readFileSync(path.join(pet.ASSET_DIR, 'all.gif')));
});
const quiet = { warn() {} };
function appFixture(existing = []) {
  const state = { existing, creates: 0, fetches: 0 };
  return { state, client: { application: { emojis: {
    fetch: async () => { state.fetches++; return existing; },
    create: async ({ name, attachment }) => {
      assert.ok(Buffer.isBuffer(attachment)); state.creates++;
      const emoji = { name, id: String(100000000000000000n + BigInt(state.creates)), animated: true }; existing.push(emoji); return emoji;
    }
  } } } };
}
test('Application emojis are reused across restarts and concurrent initialization creates no duplicates', async () => {
  const f = appFixture(), display = pet.createPetDisplay({ logger: quiet });
  await Promise.all([display.initialize(f.client), display.initialize(f.client)]);
  assert.equal(f.state.fetches, 1); assert.equal(f.state.creates, 4);
  const restarted = pet.createPetDisplay({ logger: quiet });
  await restarted.initialize(f.client); assert.equal(f.state.creates, 4);
  const payload = restarted.aiTextPayload('x'.repeat(1900));
  assert.match(payload.content, /^<a:pg_all_[a-f0-9]+:[0-9]+> \*\*Pixel Gojo\*\*\n/);
  assert.ok(payload.content.length <= 2000);
  assert.equal(payload.files, undefined); assert.equal(payload.embeds, undefined);
  assert.deepEqual(payload.allowedMentions.parse, []); assert.equal(payload.allowedMentions.repliedUser, false);
});
test('Missing application emoji access falls back to a small symbol and keeps AI replies usable', async () => {
  const display = pet.createPetDisplay({ logger: quiet });
  await display.initialize({ application: { emojis: { fetch: async () => { throw { code: 50013 }; }, create() {} } } });
  assert.match(display.aiTextPayload('Antwort').content, /^✨ \*\*Pixel Gojo/);
});
test('Thinking is replaced by an answer in the same message, without an attachment', async () => {
  const display = pet.createPetDisplay({ logger: quiet });
  const sent = [], edited = [];
  const message = { id: 'm', edit: async p => { edited.push(p); return message; } };
  const pending = await display.sendAiAnimation(async p => { sent.push(p); return message; });
  assert.match(sent[0].content, /Ich denke nach/); assert.equal(sent[0].files, undefined);
  assert.equal(await pending.finish('Hier ist deine Antwort.'), message);
  assert.equal(sent.length, 1); assert.equal(edited.length, 1); assert.match(edited[0].content, /Hier ist deine Antwort/);
});
test('A deleted thinking message does not lose the generated answer', async () => {
  const display = pet.createPetDisplay({ logger: quiet }), sent = [];
  const pending = await display.sendAiAnimation(async p => { sent.push(p); return { edit: async () => { throw { code: 10008 }; } }; });
  await pending.finish('Antwort bleibt erhalten.');
  assert.equal(sent.length, 2); assert.match(sent[1].content, /Antwort bleibt erhalten/);
});
test('A failed initial status send does not prevent the final answer', async () => {
  const display = pet.createPetDisplay({ logger: quiet }); let calls = 0;
  const pending = await display.sendAiAnimation(async p => { if (++calls === 1) throw { code: 50013 }; return p; });
  const final = await pending.finish('Antwort'); assert.match(final.content, /Antwort/); assert.equal(calls, 2);
});
test('Slow requests show waiting once, then final text cannot be overwritten by a late status edit', async () => {
  const display = pet.createPetDisplay({ logger: quiet, waitMs: 1 });
  const edits = []; let release;
  const message = { edit: async p => {
    if (p.content.includes('arbeite noch')) await new Promise(r => { release = r; });
    edits.push(p.content); return message;
  } };
  const pending = await display.sendAiAnimation(async () => message);
  await new Promise(r => setTimeout(r, 10)); assert.ok(release);
  const final = pending.finish('Fertig'); release(); await final;
  assert.match(edits.at(-1), /Fertig/); assert.equal(edits.length, 2);
});
test('Cancellation removes only the response placeholder and stops pending status updates', async () => {
  const display = pet.createPetDisplay({ logger: quiet, waitMs: 5 }); let deletes = 0, edits = 0;
  const pending = await display.sendAiAnimation(async () => ({ edit: async () => { edits++; }, delete: async () => { deletes++; } }));
  await pending.cancel(); await new Promise(r => setTimeout(r, 15));
  assert.equal(deletes, 1); assert.equal(edits, 0);
});
test('The actual /ai handler updates its original reply and only sends extra messages for overflow', async () => {
  const events = [];
  const interaction = { guild: { id: 'g' }, channelId: 'c', channel: { id: 'c' }, user: { id: 'u', tag: 'User' },
    options: { getString: () => 'Frage' }, deferReply: async () => { events.push('defer'); },
    editReply: async p => { assert.equal(p.files, undefined); events.push(p.content.includes('denke nach') ? 'thinking' : 'first answer'); return { id: 'm' }; },
    followUp: async p => { assert.match(p.content, /Pixel Gojo/); events.push('overflow'); } };
  const ctx = { interaction, serverSettings: () => ({ aiEnabled: true }), aiCooldownRemaining: () => 0,
    startAiCooldown() {}, getPixelCharacterPicker:()=>({hasSelection:()=>true}), pixelCharacterId:()=> 'gojo', sendAiAnimation: pet.sendAiAnimation, aiTextPayload: pet.aiTextPayload,
    askGemini: async (...args) => { assert.equal(args[4], 'c'); assert.equal(args[5], 'senz-de'); events.push('generate'); return 'Antwort'; },
    recordAiReview() {}, splitDiscordText: () => ['Teil eins', 'Teil zwei'], console };
  await vm.runInNewContext(section('async function answerPixelQuestion(', 'function aiCooldownRemaining(')+'\n(async () => { switch ("ai") { ' + section('        case "ai": {', '        case "aipulse": {') + ' } })()', ctx);
  assert.deepEqual(events, ['defer', 'thinking', 'generate', 'first answer', 'overflow']);
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
test('/ai keeps the German casual style and the default tone while adding shared reasoning guidance', async () => {
  const requests = [];
  const ctx = chat(async r => { requests.push(r); return { text: 'Antwort' }; });
  await ctx.askGemini('Frage', 'User', 'g', 'u', 'c', 'senz-de');
  await ctx.askGemini('Frage', 'User', 'g', 'u', 'c');
  assert.match(requests[0].config.systemInstruction, /Antworte auf Deutsch, kurz und locker/);
  assert.match(requests[0].config.systemInstruction, /Serverevent am Freitag/);
  assert.match(requests[0].config.systemInstruction, /Beispiele nennen/);
  assert.equal(require('node:crypto').createHash('sha256').update(requests[1].config.systemInstruction.split('\n\nANTWORTQUALITÄT:')[0]).digest('hex'),
    '428ecef8fa4f513b827d894202e86dad7899b4e5f5c1010b2d9de9b51e8a8de1');
});
test('Repeated answers trigger a fresh attempt, failures do not become history', async () => {
  const repeated = 'Eine lange identische Antwort auf eine Frage, die hier nicht einfach wiederholt werden soll.';
  const answers = [repeated, repeated, 'Eine neue konkrete Erklärung mit einem anderen Beispiel.'];
  const ctx = chat(async r => {
    assert.match(r.config.systemInstruction, /Antworte auf Deutsch, kurz und locker/);
    return { text: answers.shift() };
  });
  await ctx.askGemini('Frage', 'User', 'g', 'u', 'c', 'senz-de');
  const response = await ctx.askGemini('Genauer?', 'User', 'g', 'u', 'c', 'senz-de');
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
  const sent = [], replies = [], edits = [], aiEdits = [];
  function aiReply(payload) {
    replies.push(payload);
    const response = { id: `reply-${replies.length}`, edit: async p => { aiEdits.push(p); return response; } };
    return response;
  }
  const guild = { id: 'g', channels: { cache: new Collection() } };
  const channel = { id: 'suggestions', guild, send: async p => {
    sent.push(p);
    return { id: 'suggestion-1', guild, channel, author: { id: 'bot', bot: true }, url: 'https://discord.com/test',
      edit: async p => { edits.push(p); }, reply: async p => aiReply(p) };
  } };
  guild.channels.cache.set(channel.id, channel);
  const community = createCommunity({ client: { user: { id: 'bot' } }, db, saveDB() {}, guildData: () => gd,
    userData: (g, u) => (db.users[`${g}:${u}`] ||= { xp: 0, level: 0, invites: 0 }), footer: x => x,
    cleanName: x => x, generateGeminiContent: generate, GEMINI_MODEL: 'configured-model',
    isAiEnabled: () => enabled, isGuildApproved: () => true, chatAiErrorMessage: () => 'Anfragelimit erreicht.' });
  const interaction = { guild, user: { id: 'user' }, isChatInputCommand: () => true, commandName: 'suggest',
    options: { getString: () => 'Ein gemeinsamer Minecraft-Abend am Freitag.' }, reply: async () => {} };
  const raw = { id: 'raw-1', guild, channel, author: { id: 'user', bot: false }, content: 'Minecraft-Abend am Freitag',
    reply: async p => aiReply(p) };
  return { community, db, gd, sent, replies, edits, aiEdits, interaction, raw, channel };
}
test('/suggest posts voting controls, then animated feedback without deciding status', async () => {
  const f = communityFixture();
  await f.community.handleInteraction(f.interaction);
  await flush();
  assert.equal(f.sent.length, 1);
  assert.equal(f.replies[0].files, undefined); assert.match(f.replies[0].content, /Ich denke nach/);
  assert.match(f.aiEdits[0].content, /Minecraft/);
  assert.equal(f.db.suggestions['suggestion-1'].status, 'Under Review');
  assert.equal(f.db.suggestions['suggestion-1'].up.length, 0);
  assert.equal(f.db.suggestions['suggestion-1'].aiReplyId, 'reply-1');
  assert.equal(f.edits[0].components[0].components.length, 2);
});
test('Suggestion modal uses the same animated feedback path', async () => {
  const f = communityFixture();
  await f.community.handleInteraction({ ...f.interaction, isChatInputCommand: () => false,
    isModalSubmit: () => true, customId: 'suggestion_modal',
    fields: { getTextInputValue: key => key === 'suggestion_title' ? 'Minecraft-Abend' : 'Freitag zusammen spielen' } });
  await flush();
  assert.equal(f.sent.length, 1);
  assert.equal(f.replies[0].files, undefined); assert.match(f.replies[0].content, /Ich denke nach/);
  assert.match(f.aiEdits[0].content, /Pixel Gojo/);
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
  assert.equal(f.replies.length, 1); assert.equal(f.aiEdits.length, 1);
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
  assert.match(fail.aiEdits[0].content, /Anfragelimit/);
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

test('Ticket AI keeps its editable message and continuation chunks; errors update the same reply', async () => {
  for (const failure of [null, 'GEMINI_NOT_CONFIGURED', 'TIMEOUT', 'provider failure']) {
    const sent = [], edits = [], ticket = { ownerId: 'u', aiEnabled: true, status: 'open' };
    const message = { guild: { id: 'g' }, channel: { id: 'c', sendTyping: async () => {} }, author: { id: 'u' }, content: 'Hilfe', attachments: { size: 0 } };
    const ctx = { Date, pixelCharacterId:()=> 'gojo', getTicketRecord: () => ticket, saveDB() {}, shouldAutoEscalate: () => false, findFaqMatch: () => null,
      GEMINI_API_KEY: 'mock', db: { tickets: { c: ticket } }, sendAiAnimation: pet.sendAiAnimation, aiTextPayload: pet.aiTextPayload,
      recordAiReview() {}, console: { error() {} },
      askGeminiSupport: async () => { if (failure) throw Error(failure); return 'Antwort'; },
      splitDiscordText: () => ['Antwort eins', 'Antwort zwei'],
      sendEditableTicketContent: async (channel, payload) => {
        sent.push(payload);
        const response = { id: String(sent.length), components: ['existing-edit-button'], edit: async update => {
          edits.push(update); assert.equal(update.components, undefined); return response;
        } };
        return response;
      }
    };
    vm.createContext(ctx); vm.runInContext(section('async function runTicketAi(', 'function enqueueTicketAi('), ctx);
    await ctx.runTicketAi(message);
    assert.equal(edits.length, 1);
    assert.equal(sent.length, failure ? 1 : 2);
    assert.match(edits[0].content, /Pixel Gojo/);
    if (failure === null) assert.match(edits[0].content, /Antwort eins/);
    else assert.match(edits[0].content, /AI ist noch nicht eingerichtet|zu langsam|technisches Problem/);
  }
});

test('Turning ticket AI off during generation removes the pending indicator and sends no answer', async () => {
  const ticket = { ownerId: 'u', aiEnabled: true, status: 'open' }; let deleted = 0, sent = 0, edits = 0;
  const message = { guild: { id: 'g' }, channel: { id: 'c', sendTyping: async () => {} }, author: { id: 'u' }, content: 'Hilfe', attachments: { size: 0 } };
  const ctx = { Date, pixelCharacterId:()=> 'gojo', getTicketRecord: () => ticket, saveDB() {}, shouldAutoEscalate: () => false, findFaqMatch: () => null,
    GEMINI_API_KEY: 'mock', db: { tickets: { c: ticket } }, sendAiAnimation: pet.sendAiAnimation, aiTextPayload: pet.aiTextPayload,
    recordAiReview() {}, console, askGeminiSupport: async () => { ticket.aiEnabled = false; return 'Antwort'; },
    sendEditableTicketContent: async () => { sent++; return { delete: async () => { deleted++; }, edit: async () => { edits++; } }; }
  };
  vm.createContext(ctx); vm.runInContext(section('async function runTicketAi(', 'function enqueueTicketAi('), ctx);
  await ctx.runTicketAi(message);
  assert.equal(sent, 1); assert.equal(deleted, 1); assert.equal(edits, 0);
});

test('All index/community code outside the pet integration and /ai style is identical to the uploaded ZIP', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/pet-preservation.json')));
  for (const [file, spec] of Object.entries(expected)) {
    let text = require('./stability_preservation').previousRelease(file, fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'));
    for (const line of spec.omitLines) text = text.split('\n').filter(value => !value.includes(line)).join('\n');
    for (const [start, end] of spec.omitSections) {
      const a = text.indexOf(start), b = text.indexOf(end, a);
      assert.ok(a >= 0 && b > a); text = text.slice(0, a) + text.slice(b);
    }
    assert.equal(require('node:crypto').createHash('sha256').update(text).digest('hex'), spec.sha256, file);
  }
});
