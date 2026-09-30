const path = require("node:path");

const AI_NAME = "Pixel Gojo";
const ANIMATION_PATH = path.join(__dirname, "..", "assets", "pixel-gojo.gif");

function animationPayload() {
  return {
    embeds: [{ title: AI_NAME, color: 0x9464ff, image: { url: "attachment://pixel-gojo.gif" } }],
    files: [{ attachment: ANIMATION_PATH, name: "pixel-gojo.gif" }],
    allowedMentions: { parse: [], repliedUser: false }
  };
}

// Send first and await Discord, so the animation precedes the answer.
// Missing Attach Files permissions must not prevent the text answer.
async function sendAiAnimation(send) {
  try {
    return await send(animationPayload());
  } catch (error) {
    console.warn("Pixel Gojo animation unavailable:", error?.code || error?.name || "Error");
    return send({ content: `✨ **${AI_NAME}**`, allowedMentions: { parse: [], repliedUser: false } });
  }
}

function aiTextPayload(text) {
  return { content: `**${AI_NAME}**\n${text}`, allowedMentions: { parse: [], repliedUser: false } };
}

module.exports = { AI_NAME, ANIMATION_PATH, animationPayload, sendAiAnimation, aiTextPayload };
