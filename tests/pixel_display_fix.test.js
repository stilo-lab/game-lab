'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Collection, Client, GatewayIntentBits } = require('discord.js');
const { Routes } = require('discord-api-types/v10');
const { createPetDisplay, EMOJI_STATES, ASSET_DIR } = require('../src/pixel_gojo');
const { CHARACTERS, ASSET_ROOT, createCharacterPicker } = require('../src/pixel_characters');
const { bundledGif } = require('../src/pixel_assets');
const root = path.join(__dirname, '..');
const quiet = { warn() {} };
const settle = () => new Promise(resolve => setImmediate(resolve));
function app({ fetchFail = 0, createFail = 0, hang = false } = {}) {
  const existing = new Collection(), state = { fetches: 0, creates: [], pending: [] };
  return { state, existing, client: { application: { emojis: {
    fetch: async () => { state.fetches += 1; if (fetchFail-- > 0) throw Object.assign(new Error('temporary error'), { code: 503 }); return existing; },
    create: async ({ name, attachment }) => {
      state.creates.push({ name, attachment });
      assert.match(attachment, /^data:image\/gif;base64,/);
      const bytes = Buffer.from(attachment.split(',')[1], 'base64'); assert.match(bytes.subarray(0,6).toString(), /^GIF8[79]a$/);
      assert.ok(bytes.length <= 256 * 1024);
      if (createFail-- > 0) throw { code: 503 };
      const emoji = { name, id: String(100000000000000000n + BigInt(state.creates.length)), animated: true };
      if (hang) await new Promise(resolve => state.pending.push(resolve));
      existing.set(emoji.id, emoji); return emoji;
    }
  } } } };
}
function display(options = {}) { return createPetDisplay({ logger: quiet, characterIds: CHARACTERS.map(c => c.id), retryMs: 0, ...options }); }

test('Pixel display repair preserves all 33 previous modules outside documented changes', () => {
  const { previousGeneralRelease, spec } = require('./pixel_fix_preservation');
  assert.equal(Object.keys(spec).length, 33);
  for (const [name, item] of Object.entries(spec)) {
    const source = previousGeneralRelease(name, fs.readFileSync(path.join(root, 'src', name), 'utf8'));
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'), item.sha256, name);
  }
});
test('All 40 portable GIFs match the actual approved existing source bytes and emoji limits', () => {
  for (const character of CHARACTERS) for (const state of EMOJI_STATES) {
    const directory = character.id === 'gojo' ? ASSET_DIR : path.join(ASSET_ROOT, character.id);
    const gif = bundledGif(character.id, state);
    assert.deepEqual(gif, fs.readFileSync(path.join(directory, state + '.gif')), character.id + ':' + state);
    assert.ok(gif.length <= 256 * 1024);
  }
  assert.equal(bundledGif('wrong', 'all'), null); assert.equal(bundledGif('gojo', 'hollow-purple'), null);
});
test('The actual discord.js ApplicationEmojiManager sends a GIF MIME data URI to the API', async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ClientApplication = require(path.join(path.dirname(require.resolve('discord.js')), 'structures/ClientApplication.js'));
  const application = new ClientApplication(client, { id: '123456789012345678', name: 'Pixel', icon: null });
  const requests = [];
  client.rest.get = async route => { assert.equal(route, Routes.applicationEmojis(application.id)); return { items: [] }; };
  client.rest.post = async (route, { body }) => {
    requests.push({ route, body }); assert.match(body.image, /^data:image\/gif;base64,/);
    return { id: String(100000000000000000n + BigInt(requests.length)), name: body.name, animated: true, available: true };
  };
  const pet = display({ characterIds: ['sukuna'] });
  await pet.initialize({ application });
  assert.equal(requests.length, 4); assert.match(pet.aiTextPayload('jo', 'all', 'sukuna').content, /^<a:pc_sukuna_all_/);
  await client.destroy();
});
test('A temporary startup fetch failure recovers for the next AI response without a restart', async () => {
  const f = app({ fetchFail: 1 }), pet = display();
  await pet.initialize(f.client, { eager: false });
  const sent = [], pending = await pet.sendAiAnimation(async p => { sent.push(p); return { edit: async p => { sent.push(p); } }; }, { characterId: 'ember' });
  await pending.finish('moin'); await settle();
  assert.equal(f.state.fetches, 2); assert.match(sent[0].content, /^<a:pc_ember_laptop_/); assert.match(sent[1].content, /^<a:pc_ember_all_/);
});
test('Application not ready initially can be retried after the manager becomes available', async () => {
  const f = app(), pet = display(), client = {};
  await pet.initialize(client, { eager: false }); client.application = f.client.application;
  await pet.ensureCharacter('sukuna'); assert.match(pet.aiTextPayload('jo', 'all', 'sukuna').content, /^<a:/);
});
test('Startup discovers existing emojis without putting a selected figure behind forty uploads', async () => {
  const f = app(), pet = display(); await pet.initialize(f.client, { eager: false });
  assert.equal(f.state.creates.length, 0); await pet.ensureCharacter('ember'); await settle();
  assert.equal(f.state.creates.length, 4); assert.ok(f.state.creates.every(x => x.name.startsWith('pc_ember_')));
});
test('Missing character directories use embedded GIFs and still show every selected Pixel', async () => {
  const f = app(), pet = display({ assetDir: '/not-a-real-folder', assetRoot: '/not-a-real-folder' });
  await pet.initialize(f.client, { eager: false });
  for (const character of CHARACTERS) {
    await pet.ensureCharacter(character.id);
    const payload = pet.aiTextPayload('Antwort', 'all', character.id);
    assert.match(payload.content, /^<a:/); assert.ok(payload.content.includes(character.name)); assert.equal(payload.files, undefined);
  }
});
test('Invalid on-disk images fall back to approved GIFs, while a valid custom Gojo file remains preferred', async () => {
  const os = require('node:os'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-display-'));
  try {
    fs.mkdirSync(path.join(directory, 'sukuna'));
    fs.writeFileSync(path.join(directory, 'sukuna', 'all.gif'), 'bad PNG bytes');
    // A valid alternative approved GIF proves disk preference without altering any image.
    const localGif = bundledGif('gojo', 'laptop'); fs.writeFileSync(path.join(directory, 'all.gif'), localGif);
    const f = app(), pet = display({ assetDir: directory, assetRoot: directory });
    await pet.initialize(f.client, { eager: false }); await pet.ensureCharacter('sukuna'); await pet.ensureCharacter('gojo');
    const sukuna = f.state.creates.find(x => x.name.startsWith('pc_sukuna_all_'));
    const gojo = f.state.creates.find(x => x.name.startsWith('pg_all_'));
    assert.deepEqual(Buffer.from(sukuna.attachment.split(',')[1], 'base64'), bundledGif('sukuna', 'all'));
    assert.deepEqual(Buffer.from(gojo.attachment.split(',')[1], 'base64'), localGif);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('A temporary upload error is retried without deleting unrelated or static emojis', async () => {
  const f = app({ createFail: 1 }), pet = display();
  await pet.initialize(f.client, { eager: false }); await pet.ensureCharacter('sukuna'); await settle();
  await pet.ensureCharacter('sukuna'); await settle();
  assert.match(pet.aiTextPayload('jo', 'laptop', 'sukuna').content, /^<a:pc_sukuna_laptop_/);
  assert.equal(f.state.creates.filter(x => x.name.startsWith('pc_sukuna_laptop_')).length, 2);
});
test('A static emoji from the old upload is preserved and repaired with a distinct animated name', async () => {
  const f = app(), pet = display();
  const hash = crypto.createHash('sha256').update(bundledGif('sukuna', 'all')).digest('hex').slice(0,8);
  const oldName = 'pc_sukuna_all_' + hash;
  f.existing.set('999', { id: '999', name: oldName, animated: false });
  await pet.initialize(f.client, { eager: false }); await pet.ensureCharacter('sukuna');
  assert.ok(f.existing.has('999')); assert.match(pet.aiTextPayload('jo', 'all', 'sukuna').content, new RegExp('^<a:' + oldName + '_v2:'));
});
test('Concurrent selected-character requests reuse in-flight uploads rather than creating duplicate emojis', async () => {
  const f = app(), pet = display(); await pet.initialize(f.client, { eager: false });
  await Promise.all(Array.from({ length: 12 }, () => pet.ensureCharacter('ember'))); await settle();
  assert.equal(f.state.fetches, 1); assert.equal(f.state.creates.length, 4);
});
test('A slow emoji upload cannot hang AI display indefinitely or trigger duplicate attempts', async () => {
  const f = app({ hang: true }), pet = display({ readyWaitMs: 10 }); await pet.initialize(f.client, { eager: false });
  await pet.ensureCharacter('ember'); await pet.ensureCharacter('ember');
  assert.ok(f.state.creates.length <= 4);
  for (const release of f.state.pending) release(); await settle();
  assert.match(pet.aiTextPayload('Antwort', 'all', 'ember').content, /^<a:/);
});
test('Unavailable Discord emoji access keeps the AI answer readable, with no attachment or permission changes', async () => {
  const f = app({ fetchFail: 100 }), pet = display(); await pet.initialize(f.client, { eager: false });
  const sent = [], pending = await pet.sendAiAnimation(async payload => { sent.push(payload); return { edit: async payload => sent.push(payload) }; }, { characterId: 'sukuna' });
  await pending.finish('Antwort'); assert.match(sent.at(-1).content, /Antwort/); assert.equal(sent.at(-1).files, undefined);
  assert.equal(f.state.creates.length, 0);
});
test('Real /pixel confirmation uses the animated selected character after deferring and saving', async () => {
  const f = app(), pet = display(); await pet.initialize(f.client, { eager: false });
  const record = {}, events = [], replies = [];
  const picker = createCharacterPicker({ getUserRecord: () => record, saveDB: () => events.push('save'), getDisplay: () => pet, previewPath: '/missing' });
  const i = { guild: { id: 'g' }, user: { id: 'u' }, reply: async p => replies.push(p) };
  await picker.open(i);
  const id = replies[0].components[0].components[0].data.custom_id;
  await picker.handleInteraction({ ...i, customId: id, values: ['ember'], isStringSelectMenu: () => true,
    deferUpdate: async () => events.push('defer'), editReply: async p => { events.push('edit'); replies.push(p); } });
  const result = replies.at(-1); assert.match(result.content, /^<a:pc_ember_all_/); assert.match(result.content, /begleitet dich jetzt/);
  assert.deepEqual(events, ['defer', 'save', 'edit']); assert.equal(record.pixelCharacterId, 'ember');
  assert.deepEqual(result.attachments, []); assert.deepEqual(result.components, []); assert.deepEqual(result.allowedMentions.parse, []);
});
test('A renderer failure during selection cannot undo the saved user choice or block its original question', async () => {
  const record = {}, replies = [], questions = [];
  const picker = createCharacterPicker({ getUserRecord: () => record, saveDB() {}, previewPath: '/missing',
    getDisplay: () => { throw Error('module missing'); }, answerQuestion: async (i, q) => questions.push(q) });
  const i = { guild: { id: 'g' }, user: { id: 'u' }, reply: async p => replies.push(p) };
  await picker.open(i, { question: 'YouTube meldet 404' }); const id = replies[0].components[0].components[0].data.custom_id;
  await picker.handleInteraction({ ...i, customId: id, values: ['sukuna'], isStringSelectMenu: () => true, deferUpdate: async () => {}, editReply: async p => replies.push(p) });
  assert.equal(record.pixelCharacterId, 'sukuna'); assert.deepEqual(questions, ['YouTube meldet 404']);
});
test('Old correct application emojis are reused for the selected figure without a fresh upload', async () => {
  const f = app(), initial = display(); await initial.initialize(f.client); const count = f.state.creates.length;
  const pet = display(); await pet.initialize(f.client, { eager: false }); await pet.ensureCharacter('sukuna');
  assert.equal(f.state.creates.length, count); assert.match(pet.aiTextPayload('Text', 'all', 'sukuna').content, /^<a:pc_sukuna_all_/);
});
