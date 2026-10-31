'use strict';
const crypto = require('node:crypto');
const { MessageFlags } = require('discord.js');
const locale = require('./localization');

// Never retain request text, modal answers, URLs, credentials, API bodies or
// stacks. This bounded, in-memory list is diagnostic metadata, not a replay log.
function classify(error) {
  const code = String(error?.code || ''), status = Number(error?.status || error?.statusCode);
  if (['10062', '40060'].includes(code)) return 'expired';
  if (code === '50013') return 'permissions';
  if (code === '50001') return 'access';
  if (['10003', '10007', '10011', '10008'].includes(code)) return 'missing';
  if (code === '50007') return 'dm';
  if (code === '50035') return 'input';
  if (status === 429 || ['20028', '20029', '40003'].includes(code)) return 'rate';
  if (['ENOSPC', 'EROFS', 'EACCES', 'DB_RECOVERY_REQUIRED'].includes(code)) return 'storage';
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)
    || ['AbortError', 'TimeoutError'].includes(error?.name) || status >= 500) return 'network';
  return 'unknown';
}
const TEXT = {
  permissions: ['Pixel is missing a required permission, or the target role is above Pixel. Check the channel permissions and role order with /diagnose.', 'Pixel fehlt eine nötige Berechtigung, oder die Zielrolle liegt über Pixel. Prüfe Kanalrechte und Rollenreihenfolge mit /diagnose.'],
  access: ['Pixel cannot access this channel or resource. Check channel visibility and private-thread membership with /diagnose.', 'Pixel kann auf diesen Kanal oder diese Ressource nicht zugreifen. Prüfe Kanalzugriff und Mitgliedschaft im privaten Thread mit /diagnose.'],
  missing: ['The selected channel, member, role or message is no longer available. Open the command again and select a current target.', 'Der gewählte Kanal, Nutzer, die Rolle oder Nachricht ist nicht mehr verfügbar. Öffne den Befehl neu und wähle ein aktuelles Ziel.'],
  dm: ['Discord could not deliver the DM. The recipient may have closed DMs or blocked the bot. Check the saved delivery status.', 'Discord konnte die DM nicht zustellen. Der Empfänger hat möglicherweise DMs geschlossen oder den Bot blockiert. Prüfe den gespeicherten Versandstatus.'],
  input: ['Discord rejected a value in this request. Check the selected options, text length and required fields, then open a fresh preview.', 'Discord hat einen Wert dieser Anfrage abgelehnt. Prüfe Auswahl, Textlänge und Pflichtfelder und öffne eine neue Vorschau.'],
  rate: ['A service limit was reached. Wait before another request and check the current result first.', 'Ein Dienstlimit wurde erreicht. Warte vor einer weiteren Anfrage und prüfe zuerst den aktuellen Stand.'],
  storage: ['Pixel could not safely read or save its data. Ask the bot owner to check the host volume and available space. Keep existing data and journals.', 'Pixel konnte seine Daten nicht sicher lesen oder speichern. Der Bot-Owner muss Host-Volume und freien Speicher prüfen. Vorhandene Daten und Journale aufbewahren.'],
  network: ['A connection failed or timed out. An earlier action may already have completed; check its status before repeating the request.', 'Eine Verbindung ist fehlgeschlagen oder abgelaufen. Eine vorherige Aktion kann bereits erfolgt sein; prüfe ihren Status vor einer Wiederholung.'],
  expired: ['This interaction has expired. Open a fresh command or menu.', 'Diese Interaktion ist abgelaufen. Öffne einen neuen Befehl oder ein neues Menü.'],
  unknown: ['This request could not be completed. Check its current result before repeating it; /diagnose and /help can guide the next step.', 'Diese Anfrage konnte nicht abgeschlossen werden. Prüfe vor einer Wiederholung den aktuellen Stand; /diagnose und /help helfen beim nächsten Schritt.']
};
function createInteractionReliability({ now = Date.now, logger = console } = {}) {
  const rows = [], seen = new WeakSet(), active = new WeakSet(), dispatched = new Map();
  function snapshot(guildId) {
    const recent = rows.filter(row => row.guildId === guildId && now() - row.at < 86400000);
    return { count: recent.length, categories: [...new Set(recent.map(row => row.category))],
      lastReference: recent.at(-1)?.reference || null, retained: rows.length };
  }
  async function report(i, error) {
    if (!i || seen.has(i)) return;
    seen.add(i);
    const category = classify(error), reference = 'PX-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    rows.push({ guildId: i.guild?.id || null, at: now(), category, reference });
    while (rows.length > 300 || rows.length && now() - rows[0].at >= 86400000) rows.shift();
    try { logger.warn('Pixel interaction:', { reference, category }); } catch {}
    try {
      if (i.isAutocomplete?.()) { if (!i.responded) await i.respond([]); return; }
      if (!i.isRepliable?.() && typeof i.reply !== 'function') return;
      if (category === 'expired') return; // Discord has already rejected this token/acknowledgement.
      const de = locale.languageFor(i.guild?.id) === 'de';
      const content = '❌ ' + TEXT[category][de ? 1 : 0] + '\n' + (de ? 'Referenz: ' : 'Reference: ') + reference;
      const value = { content, allowedMentions: { parse: [] } };
      // A deferred component update points at the existing panel. Never replace
      // that panel with an error. Deferred replies may finish their own message.
      const component = i.isMessageComponent?.() || i.isButton?.() || i.isStringSelectMenu?.();
      if (i.deferred && !i.replied && (!component || i.ephemeral === true)) {
        await i.editReply({ ...value, components: [], embeds: [] });
      } else if (i.replied || i.deferred) await i.followUp({ ...value, flags: MessageFlags.Ephemeral });
      else await i.reply({ ...value, flags: MessageFlags.Ephemeral });
    } catch { /* Feedback failure must not retry the original action or leak its error. */ }
  }
  async function unhandled(i) {
    if (seen.has(i) || i.replied || i.deferred || i.responded) return;
    seen.add(i);
    try {
      if (i.isAutocomplete?.()) { await i.respond([]); return; }
      if (!i.isRepliable?.() && typeof i.reply !== 'function') return;
      const de = locale.languageFor(i.guild?.id) === 'de';
      await i.reply({ content: de
        ? 'Dieses Menü oder dieser Befehl ist hier nicht mehr verfügbar. Öffne den ursprünglichen Befehl neu; /help zeigt die aktuellen Funktionen.'
        : 'This menu or command is no longer available here. Open the original command again; /help lists the current features.',
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    } catch {}
  }
  function wrap(handler) {
    return async i => {
      if (!i || active.has(i) || seen.has(i)) return;
      if (/^\d{17,20}$/.test(String(i.id || ''))) {
        for (const [id, at] of dispatched) if (now() - at >= 600000) dispatched.delete(id);
        if (dispatched.has(i.id)) return;
        dispatched.set(i.id, now());
        while (dispatched.size > 2000) dispatched.delete(dispatched.keys().next().value);
      }
      active.add(i);
      try { await handler(i); await unhandled(i); }
      catch (error) { await report(i, error); }
      finally { active.delete(i); seen.add(i); }
    };
  }
  return { wrap, report, snapshot };
}
module.exports = { classify, createInteractionReliability };
