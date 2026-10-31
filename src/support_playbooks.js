'use strict';
// Small local troubleshooting plans. They describe tests; they never read a
// channel, alter settings, execute a command or call an external model.
const context = require('./assistant_context');
const n = context.norm;
const PROBLEM = /\b(?:not working|doesn'?t work|cannot|can'?t|failed|error|broken|no sound|no audio|missing permissions|stuck|nicht|nd|kaputt|fehler|kein ton|kein sound|geht net|klappt net|funktioniert net|spinnt|hangt)\b/;
const ACTION = /^(?:(?:please|bitte)\s+)?(?:create|make|give|grant|assign|remove|delete|rename|send|write|post|ban|kick|reset|restore|erstelle|erstell|mache|mach|gib|gebe|entferne|losche|sende|schreibe|poste|banne|kicke|setze|stell)\b/;
function topic(text) {
  const s = n(text);
  if (/backup|serverbackup|sicherung|wiederherstell|reinvite|invite-status|invite-resume/.test(s)) return /reinvite|invite-status|invite-resume|einlad|invites?|\bdm\b/.test(s) ? 'reinvite' : 'backup';
  if (/giveaways?|givaways?|gewinnspiel|verlosung|\bgw\b/.test(s)) return 'giveaway';
  if (/tickets?|bewerbung|application|ticketform/.test(s)) return 'ticket';
  if (/missing permissions|50013|50001|berechtigung|rollen?\b|roles?\b/.test(s)) return 'permissions';
  if (/antispam|anti.?spam|anti.?raid|botsecurity|automod|security/.test(s)) return 'security';
  if (/musik|music|\bvc\b|voice|kein ton|no sound|no audio/.test(s)) return 'music';
  if (/youtube|\byt\b|uploads?/.test(s)) return 'youtube';
  return null;
}
// A step counts as tried only when the USER says so. Earlier bot suggestions
// and quoted/copied text are not evidence of a completed check.
function confirmed(text) {
  return /\b(?:checked|tested|tried|enabled|allowed|restarted|gepruft|getestet|versucht|probiert|erlaubt|aktiviert|neu gestartet)\b/.test(n(text))
    && !/\b(?:will|going to|plan to|werde|mochte|not yet|haven'?t|didn'?t|have not|has not|did not|not checked|not tested|not tried|nicht|noch nicht|nicht gepruft|nicht getestet)\b/.test(n(text));
}
const STEP = (key, match, en, de) => ({ key, match, en, de });
const PLANS = {
  music: { en: 'Voice music', de: 'Musik im Sprachkanal', steps: [
    STEP('voice', /connect|speak|verbinden|sprechen|server.?mut/, 'Join a Voice channel. Check Connect, Speak and whether Pixel is server-muted.', 'Betritt einen Sprachkanal. Prüfe Verbinden, Sprechen und ob Pixel serverseitig stumm ist.'),
    STEP('source', /public|offentlich|zweiten link|second link|anderen link|another link/, 'Test /music play with a second public YouTube link. If only one link fails, the source is the useful distinction.', 'Teste /music play mit einem zweiten öffentlichen YouTube-Link. Scheitert nur einer, grenzt das die Quelle ein.'),
    STEP('diagnose', /music diagnose|ffmpeg|yt-dlp/, 'Run /music diagnose and copy its exact error. Check the listed extractor/FFmpeg issue with the host owner.', 'Nutze /music diagnose und kopiere den genauen Fehler. Prüfe dort genannte Extractor-/FFmpeg-Probleme mit dem Host-Owner.') ], enAsk: 'What does /music diagnose show?', deAsk: 'Was zeigt /music diagnose?' },
  youtube: { en: 'YouTube system', de: 'YouTube-System', steps: [
    STEP('kind', /upload|meldung|notification|musik|music|voice|\bvc\b/, 'Choose the affected system: upload notifications use /youtube and /uploads; Voice audio uses /music play.', 'Grenze das System ein: Upload-Meldungen nutzen /youtube und /uploads; Voice-Audio nutzt /music play.'),
    STEP('access', /embed|send messages|nachrichten senden|kanalrechte/, 'For missing upload notifications, check the configured destination channel and Pixel’s View, Send and Embed permissions there.', 'Bei fehlenden Upload-Meldungen prüfe Zielkanal und dort Pixels Rechte für Ansehen, Senden und Einbetten.'),
    STEP('source', /channel id|kanal.?id|uploads status|youtube status/, 'Check the saved YouTube channel and the status in the /youtube or /uploads menu. A loaded module alone does not prove source availability.', 'Prüfe den gespeicherten YouTube-Kanal und den Status im /youtube- oder /uploads-Menü. Ein geladenes Modul bestätigt keine Erreichbarkeit der Quelle.') ], enAsk: 'Are upload notifications missing, or is Voice music silent?', deAsk: 'Fehlen Upload-Meldungen oder bleibt die Voice-Musik stumm?' },
  permissions: { en: 'Role and permission checks', de: 'Rollen und Berechtigungen', steps: [
    STEP('rights', /manage roles|rollen verwalten|50013/, 'Check Manage Roles for Pixel and the channel-specific permission overrides with /diagnose.', 'Prüfe Rollen verwalten für Pixel und die kanalspezifischen Rechte mit /diagnose.'),
    STEP('order', /hierarchy|role order|above|rollenreihenfolge|rollen.?hierarchie|hoher|oberhalb/, 'Place Pixel’s highest role above the target role. Managed roles and the server owner have additional Discord restrictions.', 'Setze Pixels höchste Rolle über die Zielrolle. Verwaltete Rollen und der Server-Owner unterliegen zusätzlichen Discord-Grenzen.'),
    STEP('target', /mention|erwahnung|target id|rollen.?id/, 'Select the exact member and role again using mentions or IDs; do not grant Administrator as a blanket workaround.', 'Wähle Mitglied und Rolle erneut eindeutig per Erwähnung oder ID; vergebe Administrator nicht pauschal als Ausweichlösung.') ], enAsk: 'Which command and exact error appear?', deAsk: 'Welcher Befehl und welcher genaue Fehler erscheinen?' },
  ticket: { en: 'Ticket forms and support', de: 'Ticket-Formulare und Support', steps: [
    STEP('status', /ticketform status|ticketform config/, 'Run /ticketform status. Check that automatic forms are enabled and the ticket is private and still open.', 'Nutze /ticketform status. Prüfe, ob automatische Formulare aktiv und das Ticket privat und noch offen sind.'),
    STEP('owner', /ticket owner|ticket.?ersteller|ersteller|support team/, 'The ticket owner submits the form; support staff can offer it. Check the saved owner and the team’s access.', 'Der Ticket-Ersteller füllt das Formular aus; das Support-Team kann es anbieten. Prüfe gespeicherten Ersteller und Team-Zugriff.'),
    STEP('offer', /ticketform offer|application|mod.*formular/, 'For a moderator application, offer the supported application form with /ticketform offer type:application. This does not approve the applicant.', 'Biete für eine Mod-Bewerbung das passende Formular mit /ticketform offer type:application an. Das nimmt den Bewerber nicht automatisch an.') ], enAsk: 'What message appears when the ticket owner opens the form?', deAsk: 'Welche Meldung erscheint, wenn der Ticket-Ersteller das Formular öffnet?' },
  giveaway: { en: 'Giveaway entry', de: 'Giveaway-Teilnahme', steps: [
    STEP('open', /deadline|ended|endzeit|abgelaufen|beendet/, 'Check whether this exact giveaway is still open and use its current entry button.', 'Prüfe, ob genau dieses Giveaway noch offen ist, und nutze seinen aktuellen Teilnahmebutton.'),
    STEP('rules', /excluded|ausschluss|blocked role|invite.*gepruft|invites.*checked/, 'Check excluded roles and the required current invite balance. A bonus role gives at most two tickets and does not bypass an exclusion.', 'Prüfe Ausschlussrollen und das benötigte aktuelle Invite-Guthaben. Eine Bonusrolle gibt höchstens zwei Lose und übergeht keinen Ausschluss.'),
    STEP('member', /membership|mitgliedschaft|rejoined|neu beigetreten/, 'Confirm that the member is currently in the server. Join and draw checks use current membership and roles.', 'Prüfe, ob das Mitglied aktuell auf dem Server ist. Teilnahme und Ziehung verwenden aktuelle Mitgliedschaft und Rollen.') ], enAsk: 'What exact message appears after clicking Join?', deAsk: 'Welche genaue Meldung erscheint nach dem Teilnahme-Klick?' },
  backup: { en: 'Backup and restoration', de: 'Backup und Wiederherstellung', steps: [
    STEP('status', /backup status|backup list/, 'As the configured bot owner, inspect /backup status and /backup list in the original server.', 'Prüfe als konfigurierter Bot-Owner /backup status und /backup list im ursprünglichen Server.'),
    STEP('storage', /volume|persistent|dauerhaft|bot_data_dir|bot_backup_dir/, 'Check persistent host storage. A fresh empty volume does not contain earlier backups; preserve existing data before changing paths.', 'Prüfe dauerhaften Host-Speicher. Ein neues leeres Volume enthält keine früheren Backups; sichere vorhandene Daten vor einem Pfadwechsel.'),
    STEP('restore', /pending|journal|restore.json|serverbackup/, 'If a restoration has a pending or uncertain step, review its journal and safety snapshot with the owner. Do not blindly repeat the restore.', 'Prüfe bei einem offenen oder unklaren Restore-Schritt Journal und Sicherheitskopie mit dem Owner. Wiederhole den Restore nicht blind.') ], enAsk: 'Does /backup status report missing snapshots, missing permissions or a pending step?', deAsk: 'Zeigt /backup status fehlende Snapshots, fehlende Rechte oder einen offenen Schritt?' },
  reinvite: { en: 'Recovery invitations', de: 'Wiederherstellungs-Einladungen', steps: [
    STEP('status', /invite-status/, 'As the bot owner, open /backup invite-status. Sent, failed, skipped and uncertain mean different delivery results.', 'Öffne als Bot-Owner /backup invite-status. Gesendet, fehlgeschlagen, übersprungen und unklar unterscheiden verschiedene Zustellergebnisse.'),
    STEP('eligible', /already present|banned|bot account|bereits da|gebannt|bot.?account/, 'Present members, bots, banned accounts, opt-outs and earlier attempts are skipped. Closed DMs can fail; no automatic retry is performed.', 'Anwesende Mitglieder, Bots, gebannte Accounts, Abmeldungen und frühere Versuche werden übersprungen. Geschlossene DMs können scheitern; es gibt keinen automatischen Neuversuch.'),
    STEP('quota', /20|100|limit|quota|warteschlange/, 'The queue attempts at most 1/minute, 20/hour and 100/day across recovery queues. Resume only the unattempted remainder with /backup invite-resume after checking a pause.', 'Die Warteschlange versucht höchstens 1/Minute, 20/Stunde und 100/Tag über alle Wiederherstellungs-Warteschlangen. Nach Prüfung einer Pause setzt /backup invite-resume nur den unversuchten Rest fort.') ], enAsk: 'Which status and count does /backup invite-status show?', deAsk: 'Welchen Status und welche Anzahl zeigt /backup invite-status?' },
  security: { en: 'Spam and raid protection', de: 'Spam- und Raid-Schutz', steps: [
    STEP('mode', /botsecurity status|security status|automod/, 'Check /security status for people, /botsecurity status for other bots, and the AutoMod switch in /settings.', 'Prüfe /security status für Menschen, /botsecurity status für andere Bots und den AutoMod-Schalter in /settings.'),
    STEP('exempt', /trusted|trust|admin|owner|vertrauen/, 'Check whether the test account is an owner/admin or explicitly trusted bot. Exempt accounts can produce a different result.', 'Prüfe, ob der Testaccount Owner/Admin oder ein ausdrücklich vertrauenswürdiger Bot ist. Ausnahmen können ein anderes Ergebnis erklären.'),
    STEP('rights', /ban|kick|hierarchy|rollenreihenfolge/, 'Pixel needs the selected kick/ban permission and a higher role than the target bot. Use /raid test for a private simulation rather than flooding channels.', 'Pixel braucht das gewählte Kick-/Bannrecht und eine höhere Rolle als der Zielbot. Nutze /raid test für eine private Simulation, statt Kanäle zu fluten.') ], enAsk: 'Is the missed case a person, another bot, or a webhook?', deAsk: 'Betrifft der nicht erkannte Fall einen Menschen, anderen Bot oder Webhook?' }
};
function answer(question, { history = [], language = 'en' } = {}) {
  const raw = String(question || '').slice(0, 1800), q = n(raw);
  if (!q || ACTION.test(q) || /```|\n|(?:question|frage|text|source|quelle)\s*:/i.test(raw)) return null;
  const rows = (Array.isArray(history) ? history : []).slice(-16).filter(row => row?.role === 'user')
    .map(context.messageText).map(text => text.slice(0, 1800));
  if (n(rows.at(-1)) === q) rows.pop();
  const follow = /^(?:still|again|immer noch|geht|klappt|hat nichts|hat nix|already|bereits|habe|hab|i (?:have|tried|checked)|tested)/.test(q);
  let key = topic(q), relevant = [];
  if (follow || PROBLEM.test(q)) {
    for (const text of [...rows].reverse()) {
      const candidate = topic(text);
      if (candidate) {
        if (!key) key = candidate;
        if (candidate !== key) break;
        relevant.unshift(text);
        if (!confirmed(text) && !context.isFollowup(text)) break;
      } else if (confirmed(text) || context.isFollowup(text) || /^(?:i|ich|habe|hab)\b.{0,500}\b(?:checked|tested|tried|gepruft|getestet|versucht)\b/.test(n(text))) relevant.unshift(text);
      else break;
      if (relevant.length >= 4) break;
    }
  }
  if (!key || !PLANS[key] || !PROBLEM.test(q) && !follow) return null;
  const plan = PLANS[key], de = language === 'de';
  const tried = [...relevant, raw].filter(confirmed), pending = plan.steps.filter(step => !tried.some(text => step.match.test(n(text))));
  const chosen = pending.slice(0, 2);
  return '🧩 ' + (de ? 'Lokale Prüfhilfe: ' + plan.de : 'Local troubleshooting: ' + plan.en) + '\n'
    + (chosen.length ? chosen.map((step, i) => `${i + 1}. ${de ? step.de : step.en}`).join('\n')
      : de ? 'Die hinterlegten Prüfungen hast du bereits als versucht beschrieben. Das Team braucht jetzt den genauen Fehler und das Ergebnis jeder Prüfung.' : 'You have reported trying the saved checks. The team now needs the exact error and the result of each check.')
    + '\n\n' + (de ? plan.deAsk : plan.enAsk)
    + '\n' + (de ? 'Keine Live-Prüfung oder Änderung ausgeführt.' : 'No live check or change has been performed.');
}
module.exports = { PLANS, topic, confirmed, answer };
