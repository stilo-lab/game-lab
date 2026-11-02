'use strict';
const crypto = require('node:crypto');
const { PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const locale = require('./localization');
const ID = /^\d{17,20}$/;
function createTicketConsent(ctx) {
  const pending = new Map(), now = ctx.now || Date.now;
  function commit(ticket, change) {
    const before = structuredClone(ticket);
    try { change(ticket); ctx.saveDB(); }
    catch (error) { for (const key of Object.keys(ticket)) delete ticket[key]; Object.assign(ticket, before); throw error; }
  }
  function matching(message, channelId) {
    if (message.author?.id !== ctx.client.user?.id) return false;
    return (message.components || []).some(row => (row.components || row.data?.components || []).some(c =>
      [`ticket_ai_yes:${channelId}`, `ticket_ai_no:${channelId}`].includes(c.customId || c.custom_id || c.data?.custom_id)));
  }
  async function run(channel) {
    const ticket = ctx.getTicket(channel.id);
    if (!ticket || ticket.status === 'closed' || ticket.guildId !== channel.guild?.id || ticket.ignoredAsSystemChannel) return null;
    if (ticket.aiConsent?.status === 'decided' || ticket.aiEnabled || ticket.humanRequested) return null;
    if (ticket.supportPromptSent && !['pending', 'uncertain'].includes(ticket.aiConsent?.status)) return null;
    if (!await ctx.enabled(channel.guild) || !ctx.isPrivate(channel)) return null;
    const bot = channel.guild.members.fetchMe ? await channel.guild.members.fetchMe({ force: true }) : channel.guild.members.me;
    if (!bot || bot.id !== ctx.client.user?.id || !channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory])) return null;
    const legacy = ticket.supportPromptSent === undefined, uncertain = ['pending', 'uncertain'].includes(ticket.aiConsent?.status);
    if (legacy || uncertain) {
      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      const prior = messages && [...messages.values()].find(message => matching(message, channel.id));
      if (prior) { commit(ticket, t => { t.supportPromptSent = true; t.aiConsent = { version: 1, status: 'sent', messageId: prior.id, at: now() }; }); return prior; }
      // Old records and uncertain API results must never blindly issue a second question.
      commit(ticket, t => { t.supportPromptSent = true; t.aiConsent = { ...t.aiConsent, version: 1, status: legacy ? 'legacy' : 'uncertain', at: now() }; });
      return null;
    }
    const key = channel.guild.id + ':' + channel.id;
    commit(ticket, t => { t.supportPromptSent = true; t.aiConsent = { version: 1, status: 'pending', at: now() }; });
    const de = (ctx.languageFor?.(channel.guild.id) || locale.languageFor(channel.guild.id)) === 'de';
    const content = de
      ? '**Möchtest du AI-Support in diesem Ticket?**\n**Ja** = AI kann auf deine Nachrichten antworten. **Nein** = nur menschlicher Support.\n\nMit Modellverbindung werden deine Nachrichten und unterstützten Bilder zur Antworterstellung an Google Gemini gesendet. Ohne Modellverbindung gibt es begrenzte lokale Texthilfe; sie kann keine Bilder auswerten oder im Web suchen. Das Team entscheidet bei Moderationsfällen.'
      : '**Would you like AI support in this ticket?**\n**Yes** = AI can respond to your messages. **No** = human support only.\n\nWith a model connection, your messages and supported images are sent to Google Gemini to generate the response. Without one, limited local text help is available; it cannot inspect images or search the web. The team decides moderation cases.';
    try {
      const message = await channel.send({ content,
        nonce: BigInt('0x' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)).toString(), enforceNonce: true,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_ai_yes:' + channel.id).setLabel(de ? 'Ja – AI-Support' : 'Yes – AI support').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket_ai_no:' + channel.id).setLabel(de ? 'Nein – menschlicher Support' : 'No – human support').setStyle(ButtonStyle.Secondary))],
        allowedMentions: { parse: [] } });
      commit(ticket, t => { if (t.aiConsent?.status !== 'decided') t.aiConsent = { version: 1, status: 'sent', messageId: message.id, at: now() }; });
      try { await ctx.makeEditable?.(message); } catch {}
      return message;
    } catch {
      try { commit(ticket, t => { if (t.aiConsent?.status !== 'decided') t.aiConsent = { ...t.aiConsent, status: 'uncertain' }; }); } catch {}
      return null;
    }
  }
  function offer(channel) {
    if (!channel || !ID.test(channel.id)) return Promise.resolve(null);
    if (pending.has(channel.id)) return pending.get(channel.id);
    const task = run(channel).finally(() => pending.delete(channel.id)); pending.set(channel.id, task); return task;
  }
  function choose(ticket, decision, messageId, mutate = () => {}) {
    const old = ticket.aiConsent;
    if (old?.status === 'decided' && (old.decision === decision || decision === true)) return false;
    if (old?.messageId && old.messageId !== messageId && decision !== false) return false;
    commit(ticket, t => {
      t.supportPromptSent = true;
      t.aiConsent = { version: 1, status: 'decided', decision, messageId: old?.messageId || messageId, at: now() };
      mutate(t);
    });
    return true;
  }
  return { offer, choose };
}
module.exports = { createTicketConsent };
