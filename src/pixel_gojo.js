const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { CHARACTERS, characterById, ASSET_ROOT } = require("./pixel_characters");
const AI_NAME = "Pixel Gojo";
const ASSET_DIR = path.join(__dirname, "..", "assets", "pixel-gojo");
const EMOJI_STATES = ["laptop", "all", "waiting", "failed"];

// App emojis require no changes to server emojis, permissions or the database.
function createPetDisplay({ logger = console, waitMs = 20_000, characterIds = ["gojo"],
  readyWaitMs = 8000, retryMs = 2000, assetDir = ASSET_DIR, assetRoot = ASSET_ROOT,
  loadBundledGif = (id, state) => require("./pixel_assets").bundledGif(id, state) } = {}) {
  const emojis = new Map();
  const assets = new Map(), stateTasks = new Map(), retryAt = new Map();
  let clientRef, fetchTask, fetched = false, fetchRetryAt = 0, existing = [];
  const warn = error => logger.warn("Pixel Gojo display unavailable:", error?.code || error?.name || "Error");

  const keyFor = (id, state) => id === "gojo" ? state : `${id}:${state}`;
  const validGif = bytes => Buffer.isBuffer(bytes) && bytes.length <= 256 * 1024 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString());
  function asset(id, state) {
    const key = keyFor(id, state);
    if (assets.has(key)) return assets.get(key);
    let bytes;
    try { bytes = fs.readFileSync(path.join(id === "gojo" ? assetDir : path.join(assetRoot, id), `${state}.gif`)); } catch {}
    if (!validGif(bytes)) bytes = loadBundledGif(id, state);
    if (!validGif(bytes)) throw new Error("Invalid emoji asset");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    const name = id === "gojo" ? `pg_${state}_${hash}` : `pc_${id}_${state}_${hash}`;
    const result = { bytes, name }; assets.set(key, result); return result;
  }
  function remember(id, state, emoji) {
    if (/^\d+$/.test(emoji?.id) && emoji.animated && emoji.available !== false) {
      emojis.set(keyFor(id, state), `<a:${emoji.name}:${emoji.id}>`); return true;
    }
    return false;
  }
  function reusable(name) {
    return existing.find(e => (e.name === name || e.name === `${name}_v2`) && e.animated && e.available !== false);
  }
  function discover() {
    if (fetched) return Promise.resolve(true);
    if (fetchTask) return fetchTask;
    if (!clientRef || Date.now() < fetchRetryAt) return Promise.resolve(false);
    fetchTask = Promise.resolve().then(async () => {
      try {
        const manager = clientRef.application?.emojis;
        if (!manager?.fetch || !manager?.create) throw new Error("Application emojis unavailable");
        const result = await manager.fetch();
        existing = Array.from(result?.values?.() || result || []);
        fetched = true;
        for (const id of CHARACTERS.map(c => c.id)) for (const state of EMOJI_STATES) {
          try { const old = reusable(asset(id, state).name); if (old) remember(id, state, old); } catch {}
        }
        return true;
      } catch (error) { fetchRetryAt = Date.now() + retryMs; warn(error); return false; }
    }).finally(() => { fetchTask = null; });
    return fetchTask;
  }
  function ensureState(id, state) {
    const key = keyFor(id, state);
    if (emojis.has(key)) return Promise.resolve();
    if (stateTasks.has(key)) return stateTasks.get(key);
    if (Date.now() < (retryAt.get(key) || 0)) return Promise.resolve();
    const task = (async () => {
      try {
        if (!await discover()) return;
        const { bytes, name: originalName } = asset(id, state);
        const old = reusable(originalName);
        if (old) { remember(id, state, old); return; }
        // Preserve an old static emoji; repair it with a distinct animated name.
        const name = existing.some(e => e.name === originalName) ? `${originalName}_v2` : originalName;
        // Buffers are otherwise encoded as image/jpg by discord.js. GIF MIME is required.
        const emoji = await clientRef.application.emojis.create({ name, attachment: `data:image/gif;base64,${bytes.toString("base64")}` });
        if (!remember(id, state, emoji)) throw new Error("Application did not return an animated emoji");
        existing.push(emoji); retryAt.delete(key);
      } catch (error) { retryAt.set(key, Date.now() + retryMs); warn(error); }
      finally { stateTasks.delete(key); }
    })();
    stateTasks.set(key, task); return task;
  }
  async function boundedReady(work) {
    let timer;
    try { await Promise.race([work, new Promise(resolve => { timer = setTimeout(resolve, readyWaitMs); })]); }
    finally { clearTimeout(timer); }
    return { available: [...emojis.keys()] };
  }
  function initialize(client, { eager = true } = {}) {
    clientRef ||= client;
    return boundedReady((async () => {
      if (!await discover() || !eager) return;
      for (const id of [...new Set(characterIds)].filter(id => CHARACTERS.some(c => c.id === id))) {
        for (const state of EMOJI_STATES) await ensureState(id, state);
      }
    })());
  }
  async function ensureCharacter(characterId = "gojo") {
    if (!clientRef) return { available: [...emojis.keys()] };
    const id = characterById(characterId).id;
    // Prepare the selected figure first; don't put it behind all ten characters.
    const status = await boundedReady(Promise.all([ensureState(id, "laptop"), ensureState(id, "all")]));
    void Promise.all([ensureState(id, "waiting"), ensureState(id, "failed")]).catch(warn);
    return status;
  }

  function aiTextPayload(text, state = "all", characterId = "gojo") {
    const character = characterById(characterId);
    const key = state => character.id === "gojo" ? state : `${character.id}:${state}`;
    const icon = emojis.get(key(state)) || emojis.get(key("all")) || emojis.get(key("laptop")) || (character.id === "gojo" ? "✨" : character.symbol);
    return { content: `${icon} **${character.name}**\n${text}`, allowedMentions: { parse: [], repliedUser: false } };
  }

  // Thinking and the first answer share one message. No large GIF post.
  async function sendAiAnimation(send, { edit, characterId = "gojo" } = {}) {
    await ensureCharacter(characterId);
    let message = null, finished = false, queuedEdit = Promise.resolve();
    try { message = await send(aiTextPayload("Ich denke nach …", "laptop", characterId)); }
    catch (error) { warn(error); }
    const update = edit || (message?.edit ? payload => message.edit(payload) : null);
    const timer = update && message ? setTimeout(() => {
      queuedEdit = queuedEdit.then(async () => {
        if (!finished) await update(aiTextPayload("Ich arbeite noch an deiner Antwort …", "waiting", characterId));
      }).catch(warn);
    }, waitMs) : null;
    timer?.unref?.();

    return {
      async finish(text, state = "all") {
        finished = true;
        clearTimeout(timer);
        await queuedEdit;
        const payload = aiTextPayload(text, state, characterId);
        if (message && update) {
          try { return await update(payload); }
          catch (error) { warn(error); }
        }
        return send(payload);
      },
      async cancel() {
        finished = true;
        clearTimeout(timer);
        await queuedEdit;
        try {
          if (message?.delete) await message.delete();
          else if (update && message) await update(aiTextPayload("Die KI-Antwort wurde angehalten.", "waiting", characterId));
        } catch (error) { warn(error); }
      }
    };
  }
  return { initialize, ensureCharacter, aiTextPayload, sendAiAnimation };
}

const display = createPetDisplay({ characterIds: CHARACTERS.map(c => c.id) });
module.exports = { AI_NAME, ASSET_DIR, EMOJI_STATES, createPetDisplay,
  initializePet: client => display.initialize(client, { eager: false }), ensureCharacter: display.ensureCharacter,
  sendAiAnimation: display.sendAiAnimation, aiTextPayload: display.aiTextPayload };
