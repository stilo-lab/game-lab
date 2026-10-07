'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const discord = require('discord.js');
const root = path.join(__dirname, '..');

// Load definitions only; the voice connection and Spotify HTTP server are never started.
function definitions(file) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, process, __dirname: path.dirname(file),
    require: name => name === '@discordjs/voice' ? {} : require('node:module').createRequire(file)(name) }, { filename: file });
  return module.exports;
}
function commandList() {
  const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  const begin = source.indexOf('const commands = [');
  const end = source.indexOf('].map(c => c.toJSON());', begin) + '].map(c => c.toJSON());'.length;
  const context = { ...discord, ...require('../src/games'), ...require('../src/community'), ...require('../src/staff'), ...require('../src/element_seas'),
    ...definitions(path.join(root, 'src/spotify_party.js')), mimicCommands: require('../src/mimic_party').buildMimicCommands(), youtubeUploadCommands: require('../src/youtube_uploads').buildYouTubeUploadCommands() };
  for (const name of ['LANGUAGE_CHOICES', 'SMART_SETUP_PURPOSES']) {
    const start = source.indexOf(`const ${name} = Object.freeze([`);
    const finish = source.indexOf('\n]);', start) + '\n]);'.length;
    vm.runInNewContext(source.slice(start, finish).replace(`const ${name} =`, `${name} =`), context);
  }
  vm.runInNewContext(source.slice(begin, end).replace('const commands =', 'result ='), context);
  return JSON.parse(JSON.stringify(context.result));
}
test('Existing non-YouTube commands remain unchanged except the reviewed setup permission default', () => {
  const actual = commandList();
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/commands-before.json'), 'utf8'));
  const setup=baseline.find(c=>c.name==='serversetup');assert.equal(setup.default_member_permissions,String(discord.PermissionFlagsBits.Administrator));setup.default_member_permissions=null;
  assert.deepEqual(actual.filter(c => !['youtube', 'uploads', 'pixel', 'new', 'mimic'].includes(c.name)), baseline);
  assert.equal(new Set(actual.map(c => c.name)).size, actual.length);
  assert.ok(actual.length <= 100, `Too many Discord slash commands: ${actual.length}`);
  assert.equal(actual.filter(c => c.name === 'uploads').length, 1);
  assert.equal(actual.filter(c => c.name === 'pixel').length, 1);
  assert.equal(actual.filter(c => c.name === 'new').length, 1);
  assert.equal(actual.filter(c => c.name === 'mimic').length, 1);
});
test('Existing Spotify, community, staff, minigame and game modules are byte-for-byte unchanged', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/module-hashes.json'), 'utf8'));
  for (const [name, hash] of Object.entries(expected)) {
    assert.equal(crypto.createHash('sha256').update(require('./stability_preservation').previousRelease(name, fs.readFileSync(path.join(root, 'src', name), 'utf8'))).digest('hex'), hash, name);
  }
});
test('An unavailable YouTube module leaves the existing command registration usable', () => {
  const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  const from = source.indexOf('let youtubeUploadsModule = null;');
  const to = source.indexOf('const { GAME_CHOICES', from);
  const context = { require() { throw Error('missing module'); }, console: { warn() {} } };
  vm.runInNewContext(source.slice(from, to) + '\nresult = {module: youtubeUploadsModule, count: youtubeUploadCommands.length};', context);
  assert.equal(context.result.module, null); assert.equal(context.result.count, 0);
});
test('Only the new polling engine is wired up; no legacy double-polling', () => {
  const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  assert.ok(!source.includes('require("./youtube_ping")'));
  assert.ok(!source.includes('youtubePing.start()'));
  assert.equal((source.match(/youtubeUploads\?\.start\(\)/g) || []).length, 1);
  assert.ok(source.includes('isMaintenance: () => db.maintenance'));
  assert.ok(source.indexOf('!isGuildApproved(interaction.guild.id)') < source.indexOf('youtubeUploads.handleInteraction(interaction)'));
});
