const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { CHARACTERS, characterById, ASSET_ROOT } = require("./pixel_characters");
const AI_NAME = "Pixel Gojo";
const ASSET_DIR = path.join(__dirname, "..", "assets", "pixel-gojo");
const EMOJI_STATES = ["laptop", "all", "waiting", "failed"];

// App emojis require no changes to server emojis, permissions or the database.
function createPetDisplay({ logger = console, waitMs = 20_000, characterIds = ["gojo"] } = {}) {
  const emojis = new Map();
  let initialization;
  const warn = error => logger.warn("Pixel Gojo display unavailable:", error?.code || error?.name || "Error");

  function initialize(client) {
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        const manager = client.application?.emojis;
        if (!manager?.fetch || !manager?.create) throw new Error("Application emojis unavailable");
        const existing = await manager.fetch();
        for (const characterId of [...new Set(characterIds)].filter(id => CHARACTERS.some(c => c.id === id))) {
          const directory = characterId === "gojo" ? ASSET_DIR : path.join(ASSET_ROOT, characterId);
          for (const state of EMOJI_STATES) {
            try {
              const attachment = fs.readFileSync(path.join(directory, `${state}.gif`));
              if (attachment.length > 256 * 1024 || !/^GIF8[79]a$/.test(attachment.subarray(0, 6).toString())) throw new Error("Invalid emoji asset");
              const hash = crypto.createHash("sha256").update(attachment).digest("hex").slice(0, 8);
              const name = characterId === "gojo" ? `pg_${state}_${hash}` : `pc_${characterId}_${state}_${hash}`;
              const emoji = existing.find(e => e.name === name && e.animated) || await manager.create({ name, attachment });
              if (/^\d+$/.test(emoji?.id) && emoji.animated) emojis.set(characterId === "gojo" ? state : `${characterId}:${state}`, `<a:${name}:${emoji.id}>`);
            } catch (error) { warn(error); }
          }
        }
      } catch (error) { warn(error); }
      return { available: [...emojis.keys()] };
    })();
    return initialization;
  }

  function aiTextPayload(text, state = "all", characterId = "gojo") {
    const character = characterById(characterId);
    const key = state => character.id === "gojo" ? state : `${character.id}:${state}`;
    const icon = emojis.get(key(state)) || emojis.get(key("all")) || (character.id === "gojo" ? "✨" : character.symbol);
    return { content: `${icon} **${character.name}**\n${text}`, allowedMentions: { parse: [], repliedUser: false } };
  }

  // Thinking and the first answer share one message. No large GIF post.
  async function sendAiAnimation(send, { edit, characterId = "gojo" } = {}) {
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
  return { initialize, aiTextPayload, sendAiAnimation };
}

const display = createPetDisplay({ characterIds: CHARACTERS.map(c => c.id) });
module.exports = { AI_NAME, ASSET_DIR, EMOJI_STATES, createPetDisplay,
  initializePet: display.initialize, sendAiAnimation: display.sendAiAnimation, aiTextPayload: display.aiTextPayload };
