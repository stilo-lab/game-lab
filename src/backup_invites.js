'use strict';

// Recovery invitations are separate from restoring server structure. Every DM
// needs an owner-confirmed snapshot audience and a durable, one-attempt record.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PermissionFlagsBits: P, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const locale = require('./localization');
const ID = /^\d{17,20}$/, TOKEN = /^[a-f0-9]{32}$/, BID = /^B-[a-f0-9]{6,20}-[a-f0-9]{12}$/;
const MINUTE = 60000, HOUR = 3600000, DAY = 86400000, MAX = 16 * 1024 * 1024;
const SUBS = ['reinvite', 'invite-status', 'invite-stop', 'invite-resume'];
const terminal = ['sent', 'failed', 'uncertain', 'skipped'];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const random = () => crypto.randomBytes(16).toString('hex');
const clean = text => String(text || '').replace(/[@*_`~|<>\\\r\n]/g, '').slice(0, 100);

function atomic(file, value) {
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes) > MAX) throw Error('Invitation journal is full; preserve it before maintenance.');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp-' + random(), fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}
function read(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX) throw Error('Invalid invitation journal.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function validate(state, gid) {
  if (!state || state.version !== 1 || state.guildId !== gid || !ID.test(gid)
    || !Array.isArray(state.attempts) || state.attempts.length > 50000
    || !Array.isArray(state.optOut) || state.optOut.length > 50000
    || state.optOut.some(id => !ID.test(id))) throw Error('Invalid invitation journal; do not reset it.');
  const users = new Set();
  for (const row of state.attempts) {
    if (!row || !ID.test(row.userId) || users.has(row.userId) || !TOKEN.test(row.token)
      || !TOKEN.test(row.jobId) || !Number.isFinite(row.at) || !['pending', ...terminal].includes(row.status)) throw Error('Invalid invitation attempt.');
    users.add(row.userId);
  }
  const job = state.job;
  if (job !== null) {
    if (!job || !TOKEN.test(job.id) || !BID.test(job.backupId) || !ID.test(job.ownerId) || !ID.test(job.channelId)
      || !['queued', 'paused', 'cancelled', 'complete'].includes(job.status) || !['en', 'de'].includes(job.language)
      || typeof job.guildName !== 'string' || job.guildName.length > 100 || !Number.isFinite(job.createdAt)
      || !Array.isArray(job.members) || job.members.length > 10000) throw Error('Invalid invitation queue.');
    const queued = new Set();
    for (const row of job.members) {
      if (!ID.test(row.id) || queued.has(row.id) || !['queued', ...terminal].includes(row.status)) throw Error('Invalid invitation recipient.');
      queued.add(row.id);
    }
  }
  return state;
}
function createInvitationStore(root) {
  root = path.resolve(root);
  function file(gid) { if (!ID.test(gid)) throw Error('Invalid server ID.'); return path.join(root, gid, 'invites.json'); }
  function controlFile(gid) { return path.join(path.dirname(file(gid)), 'invite-control.json'); }
  function control(gid) {
    const value = read(controlFile(gid)) || { version: 1, stopped: false, optOut: [] };
    if (value.version !== 1 || typeof value.stopped !== 'boolean' || !Array.isArray(value.optOut)
      || value.optOut.length > 50000 || value.optOut.some(id => !ID.test(id))) throw Error('Invalid invitation control journal.');
    return value;
  }
  return {
    load(gid) {
      const state = validate(read(file(gid)) || { version: 1, guildId: gid, attempts: [], optOut: [], job: null }, gid);
      state.optOut = [...new Set([...state.optOut, ...control(gid).optOut])];
      return validate(state, gid);
    },
    save(gid, state) { atomic(file(gid), validate(state, gid)); },
    stopped(gid) { return control(gid).stopped; },
    setStopped(gid, stopped) { atomic(controlFile(gid), { ...control(gid), stopped }); },
    optedOut(gid, uid) { return control(gid).optOut.includes(uid); },
    optOut(gid, uid) {
      if (!ID.test(uid)) throw Error('Invalid opt-out recipient.');
      const value = control(gid);
      if (!value.optOut.includes(uid)) value.optOut.push(uid);
      if (value.optOut.length > 50000) throw Error('Opt-out journal is full.');
      atomic(controlFile(gid), value);
    },
    rates() {
      const value = read(path.join(root, 'invite-rate.json')) || { version: 1, times: [] };
      if (value.version !== 1 || !Array.isArray(value.times) || value.times.length > 100 || value.times.some(at => !Number.isFinite(at))) throw Error('Invalid invitation rate journal.');
      return value;
    },
    claim(at) {
      const times = this.rates().times.filter(t => at - t < DAY);
      if (times.length >= 100 || times.filter(t => at - t < HOUR).length >= 20 || times.some(t => at - t < MINUTE)) return false;
      atomic(path.join(root, 'invite-rate.json'), { version: 1, times: [...times, at] });
      return true;
    },
    capacity(at) {
      const times = this.rates().times.filter(t => at - t < DAY);
      return times.length < 100 && times.filter(t => at - t < HOUR).length < 20 && !times.some(t => at - t < MINUTE);
    }
  };
}
function addCommands(command) {
  return command
    .addSubcommand(s => s.setName('reinvite').setDescription('Preview invitations to missing former members from a saved backup')
      .addStringOption(o => o.setName('id').setDescription('Backup ID from /backup list').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Public text channel for the return invitation').addChannelTypes(0).setRequired(true)))
    .addSubcommand(s => s.setName('invite-status').setDescription('Private progress of the recovery invitation queue'))
    .addSubcommand(s => s.setName('invite-stop').setDescription('Stop remaining recovery invitations; an in-flight DM may finish'))
    .addSubcommand(s => s.setName('invite-resume').setDescription('Resume the remaining unattempted recovery invitations'));
}
function invitationText(job, gid, link) {
  return job.language === 'de'
    ? `Du warst laut einem gespeicherten Mitglieder-Backup auf **${clean(job.guildName)}** (Server-ID: ${gid}).\nDer Bot-Owner (ID: ${job.ownerId}) lädt dich einmalig zurück ein:\n${link}\n\nBeitreten ist freiwillig. Der Link gilt 24 Stunden und kann einmal verwendet werden. Er ist nicht an dein Konto gebunden. Über den Button kannst du weitere Wiederherstellungs-Einladungen dieses Servers ablehnen.`
    : `A saved member backup lists you as a former member of **${clean(job.guildName)}** (server ID: ${gid}).\nThe bot owner (ID: ${job.ownerId}) requested this one-time invitation to return:\n${link}\n\nJoining is optional. This link expires in 24 hours and can be used once. It is not bound to your account. Use the button to opt out of further recovery invitations from this server.`;
}
function createBackupInvites(ctx) {
  const now = ctx.now || Date.now, store = ctx.invitationStore || createInvitationStore(ctx.store.root);
  const previews = new Map(), locks = new Set(), stops = new Set(), retryAt = new Map();
  let running = null, cursor = 0;
  const owner = i => ID.test(String(ctx.OWNER_ID)) && i.user?.id === ctx.OWNER_ID;
  const language = gid => (ctx.languageFor?.(gid) || locale.languageFor(gid)) === 'de' ? 'de' : 'en';
  const t = (gid, en, de) => language(gid) === 'de' ? de : en;
  const payload = content => ({ content, allowedMentions: { parse: [] } });
  const stopped = gid => stops.has(gid) || store.stopped(gid);
  function permitted(guild) {
    if (!guild || !ctx.isGuildApproved?.(guild.id) || ctx.isMaintenance?.() || ctx.isBusy?.(guild.id)) throw Error('Use an approved server outside maintenance, setup or restoration.');
  }
  async function access(guild, actor = ctx.OWNER_ID) {
    permitted(guild);
    if (!ID.test(String(ctx.OWNER_ID)) || actor !== ctx.OWNER_ID) throw Error('Only the configured bot owner can invite former members.');
    const member = await guild.members.fetch({ user: actor, force: true });
    if (member.id !== actor || member.user?.bot) throw Error('Bot owner must still be a member of this server.');
    const bot = await guild.members.fetchMe({ force: true });
    if (!bot.permissions.has(P.BanMembers)) throw Error('Pixel needs Ban Members to verify that recipients are not banned.');
    return bot;
  }
  async function channel(guild, channelId, bot) {
    await guild.roles.fetch();
    const c = await guild.channels.fetch(channelId, { force: true });
    if (!c || c.guildId !== guild.id || c.type !== 0
      || !c.permissionsFor(bot)?.has([P.ViewChannel, P.CreateInstantInvite])
      || !c.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)) throw Error('Choose a public text channel where Pixel can view and create invitations.');
    return c;
  }
  async function allBans(guild) {
    const ids = new Set(); let after;
    for (let page = 0; page < 51; page++) {
      const rows = await guild.bans.fetch({ limit: 1000, after, cache: false });
      for (const [id] of rows) { if (!ID.test(id) || ids.has(id)) throw Error('Ban list could not be verified completely.'); ids.add(id); }
      if (rows.size < 1000) return ids;
      after = [...rows.keys()].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1).at(-1);
    }
    throw Error('Ban list exceeds the recovery invitation limit.');
  }
  function audience(snapshot, present, banned, state) {
    const prior = new Set(state.attempts.map(row => row.userId)), optOut = new Set(state.optOut);
    return snapshot.members.filter(m => !m.bot && !present.has(m.id) && !banned.has(m.id) && !prior.has(m.id) && !optOut.has(m.id)).map(m => m.id);
  }
  function recover(state) {
    let changed = false;
    for (const row of state.attempts) if (row.status === 'pending') { row.status = 'uncertain'; changed = true; }
    const attempts = new Map(state.attempts.map(row => [row.userId, row]));
    if (state.job) for (const row of state.job.members) {
      const attempt = attempts.get(row.id);
      if (row.status === 'queued' && attempt) { row.status = attempt.status; changed = true; }
    }
    return changed;
  }
  async function preview(i) {
    const gid = i.guild?.id, bot = await access(i.guild, i.user.id);
    const state = store.load(gid);
    if (state.job && ['queued', 'paused'].includes(state.job.status)) throw Error('An invitation queue already exists. Inspect /backup invite-status or stop it first.');
    const snapshot = ctx.store.get(gid, i.options.getString('id', true));
    const c = await channel(i.guild, i.options.getChannel('channel', true).id, bot);
    const [present, banned] = await Promise.all([i.guild.members.fetch(), allBans(i.guild)]);
    const ids = audience(snapshot, present, banned, state);
    if (!ids.length) throw Error('No eligible missing former members. Present members, bots, banned users, opt-outs and previous attempts are skipped.');
    if (state.attempts.length + ids.length > 50000) throw Error('The permanent invitation journal is full. Do not erase it to repeat invitations.');
    const p = { token: random(), uid: i.user.id, gid, channelId: i.channelId, destination: c.id, backupId: snapshot.id,
      hash: digest(snapshot), at: now(), ids, language: language(gid), guildName: clean(i.guild.name) };
    for (const [key, value] of previews) if (now() - value.at >= 300000) previews.delete(key);
    if (previews.size >= 100) throw Error('Too many invitation previews.');
    previews.set(p.token, p);
    const sample = invitationText({ ...p, ownerId: p.uid }, gid, 'https://discord.gg/<single-use-code>');
    try {
      const msg = await i.editReply({ ...payload(t(gid,
        `Invite **${ids.length}** missing former members from **${snapshot.id}**?\nOnly this server; each person is attempted once across all backups.\nAt most 1 attempt/minute, 20/hour and 100/day across Pixel recovery queues. Closed DMs can fail. Joining is voluntary.\n\n**DM preview:**\n${sample}\n\nThe attached private list contains every planned recipient ID. Confirmation expires in five minutes.`,
        `**${ids.length}** fehlende ehemalige Mitglieder aus **${snapshot.id}** einladen?\nNur dieser Server; je Person ein Versuch über alle Backups hinweg.\nHöchstens 1 Versuch/Minute, 20/Stunde und 100/Tag über Pixels Wiederherstellungs-Warteschlangen. Geschlossene DMs können fehlschlagen. Beitreten ist freiwillig.\n\n**DM-Vorschau:**\n${sample}\n\nDie private Anlage enthält alle geplanten Empfänger-IDs. Bestätigung fünf Minuten gültig.`)),
        files: [{ attachment: Buffer.from('user_id\n' + ids.join('\n') + '\n'), name: 'recovery-invitation-recipients.csv' }],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pxreinvite:confirm:' + p.token).setLabel(t(gid, 'Confirm invitations', 'Einladungen bestätigen')).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('pxreinvite:cancel:' + p.token).setLabel(t(gid, 'Cancel', 'Abbrechen')).setStyle(ButtonStyle.Secondary))] });
      p.messageId = msg?.id || (await i.fetchReply?.())?.id;
      if (!ID.test(p.messageId)) throw Error('Could not bind the invitation preview to its message.');
    } catch (error) { previews.delete(p.token); throw error; }
  }
  async function confirm(i, p) {
    await access(i.guild, i.user.id);
    const snapshot = ctx.store.get(p.gid, p.backupId);
    if (digest(snapshot) !== p.hash) throw Error('Backup changed; request a new invitation preview.');
    const state = store.load(p.gid);
    if (state.job && ['queued', 'paused'].includes(state.job.status)) throw Error('An invitation queue already exists.');
    const attempted = new Set(state.attempts.map(row => row.userId)), optedOut = new Set(state.optOut);
    state.job = { id: random(), backupId: p.backupId, ownerId: p.uid, channelId: p.destination, createdAt: now(),
      guildName: p.guildName, language: p.language, status: 'queued', failures: 0,
      members: p.ids.filter(id => !attempted.has(id) && !optedOut.has(id)).map(id => ({ id, status: 'queued' })) };
    if (state.attempts.length + state.job.members.length > 50000) throw Error('Invitation journal capacity changed.');
    store.save(p.gid, state);
    store.setStopped(p.gid, false);
    stops.delete(p.gid);
    await i.editReply({ ...payload(t(p.gid, `Queued ${state.job.members.length} recovery invitations. Progress: /backup invite-status. Stop: /backup invite-stop.`, `${state.job.members.length} Wiederherstellungs-Einladungen vorgemerkt. Fortschritt: /backup invite-status. Stoppen: /backup invite-stop.`)), components: [], attachments: [] });
  }
  function status(state) {
    const j = state.job;
    if (!j) return t(state.guildId, 'No recovery invitation queue. /backup reinvite id:BACKUP_ID channel:#channel', 'Keine Wiederherstellungs-Einladungen vorgemerkt. /backup reinvite id:BACKUP_ID channel:#kanal');
    const counts = {};
    for (const row of j.members) counts[row.status] = (counts[row.status] || 0) + 1;
    return t(state.guildId,
      `Recovery invitations: ${j.status}\nBackup: ${j.backupId}\nSent: ${counts.sent || 0} · queued: ${counts.queued || 0} · skipped: ${counts.skipped || 0}\nFailed: ${counts.failed || 0} · uncertain (never retried): ${counts.uncertain || 0}\n${j.note || ''}\nLimits: 1/minute, 20/hour, 100/day across recovery queues. Each user is attempted once per server.\nPersistent host storage is required.`,
      `Wiederherstellungs-Einladungen: ${j.status}\nBackup: ${j.backupId}\nGesendet: ${counts.sent || 0} · vorgemerkt: ${counts.queued || 0} · übersprungen: ${counts.skipped || 0}\nFehlgeschlagen: ${counts.failed || 0} · unklar (keine Wiederholung): ${counts.uncertain || 0}\n${j.note || ''}\nGrenzen: 1/Minute, 20/Stunde, 100/Tag über alle Wiederherstellungs-Warteschlangen. Ein Versuch je Nutzer und Server.\nDauerhafter Host-Speicher ist erforderlich.`);
  }
  async function optOut(i, gid, token) {
    if (!ID.test(gid) || !TOKEN.test(token) || !ID.test(i.user?.id)) throw Error('Invalid opt-out button.');
    const state = store.load(gid), attempt = state.attempts.find(row => row.token === token && row.userId === i.user.id);
    if (!attempt) throw Error('This opt-out button belongs to a different recipient.');
    // Control writes are independent of the in-flight delivery journal, so a
    // recipient can opt out without overwriting a concurrent delivery result.
    store.optOut(gid, i.user.id);
    await i.reply({ ...payload(t(gid, 'You will not receive further recovery invitations from this server.', 'Du erhältst keine weiteren Wiederherstellungs-Einladungen dieses Servers.')), ...(i.guild ? { flags: MessageFlags.Ephemeral } : {}) });
  }
  async function handleInteraction(i) {
    const component = String(i.customId || '').startsWith('pxreinvite:');
    const cmd = i.isChatInputCommand?.() && i.commandName === 'backup' && SUBS.includes(i.options.getSubcommand());
    if (!component && !cmd) return false;
    try {
      if (component && i.customId.startsWith('pxreinvite:optout:')) {
        const parts = i.customId.split(':');
        if (parts.length !== 4) throw Error('Invalid opt-out button.');
        await optOut(i, parts[2], parts[3]);
        return true;
      }
      if (!owner(i)) throw Error('Only the configured bot owner can invite former members.');
      if (component) {
        const [, action, token] = i.customId.split(':'), p = previews.get(token);
        if (!p || !['confirm', 'cancel'].includes(action) || i.customId.split(':').length !== 3
          || p.uid !== i.user.id || p.gid !== i.guild?.id || p.channelId !== i.channelId
          || p.messageId !== i.message?.id || now() - p.at >= 300000) throw Error('Invitation preview expired or belongs to another context.');
        await i.deferUpdate();
        if (locks.has(p.gid)) throw Error('Invitation queue is busy; try again shortly.');
        locks.add(p.gid);
        try {
          previews.delete(token);
          if (action === 'cancel') await i.editReply({ ...payload('Cancelled.'), components: [], attachments: [] });
          else await confirm(i, p);
        } finally { locks.delete(p.gid); }
        return true;
      }
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const sub = i.options.getSubcommand(), gid = i.guild?.id;
      if (!ID.test(gid)) throw Error('Use this command in the original server.');
      if (sub === 'invite-stop') {
        store.setStopped(gid, true);
        stops.add(gid);
        if (locks.has(gid)) { await i.editReply(payload('Stop requested. An in-flight DM may finish. Check /backup invite-status.')); return true; }
        const state = store.load(gid);
        if (state.job && state.job.status !== 'complete') { state.job.status = 'cancelled'; store.save(gid, state); }
        await i.editReply(payload('Remaining recovery invitations stopped. An in-flight DM may finish.'));
        return true;
      }
      if (locks.has(gid)) throw Error('Invitation queue is busy; try again shortly.');
      locks.add(gid);
      try {
        if (sub === 'reinvite') await preview(i);
        else {
          const state = store.load(gid);
          if (recover(state)) store.save(gid, state);
          if (sub === 'invite-resume') {
            const bot = await access(i.guild, i.user.id);
            if (!state.job || !['paused', 'cancelled'].includes(state.job.status)) throw Error('No paused or cancelled queue to resume.');
            await channel(i.guild, state.job.channelId, bot);
            state.job.status = 'queued'; state.job.failures = 0; state.job.note = '';
            store.save(gid, state); stops.delete(gid); retryAt.delete(gid);
            store.setStopped(gid, false);
          }
          await i.editReply(payload(status(state)));
        }
      } finally { locks.delete(gid); }
    } catch (error) {
      const p = payload('❌ ' + String(error.message || error).slice(0, 1000));
      if (i.deferred || i.replied) await i.editReply(p).catch(() => {});
      else await i.reply({ ...p, ...(i.guild ? { flags: MessageFlags.Ephemeral } : {}) }).catch(() => {});
    }
    return true;
  }
  async function missing(guild, id) {
    try { await guild.members.fetch({ user: id, force: true, cache: false }); return false; }
    catch (error) { if (Number(error.code) === 10007) return true; throw error; }
  }
  async function banned(guild, id) {
    try { await guild.bans.fetch({ user: id, force: true, cache: false }); return true; }
    catch (error) { if (Number(error.code) === 10026) return false; throw error; }
  }
  async function deliver(guild) {
    const gid = guild.id;
    if (locks.has(gid) || (retryAt.get(gid) || 0) > now()) return;
    locks.add(gid);
    let state;
    try {
      state = store.load(gid);
      if (recover(state)) store.save(gid, state);
      const job = state.job;
      if (!job || job.status !== 'queued') return;
      if (stopped(gid)) { job.status = 'cancelled'; store.save(gid, state); return; }
      if (!job.members.some(r => r.status === 'queued')) { job.status = 'complete'; store.save(gid, state); return; }
      if (!ctx.isGuildApproved?.(gid) || ctx.isMaintenance?.() || ctx.isBusy?.(gid)) return;
      permitted(guild);
      if (!store.capacity(now())) return;
      if (job.ownerId !== ctx.OWNER_ID) throw Error('Configured bot owner changed. Stop and review this queue.');
      const bot = await access(guild, job.ownerId), c = await channel(guild, job.channelId, bot);
      // Re-read membership and bans immediately before each effect; backup data
      // is not authority to bypass a later ban or current server membership.
      let row, user;
      for (const candidate of job.members.filter(r => r.status === 'queued').slice(0, 20)) {
        if (stopped(gid)) { job.status = 'cancelled'; store.save(gid, state); return; }
        row = candidate;
        let reason;
        if (state.optOut.includes(row.id) || store.optedOut(gid, row.id)) reason = 'opt-out';
        else if (!await missing(guild, row.id)) reason = 'already-present';
        else if (await banned(guild, row.id)) reason = 'banned';
        else {
          try { user = await ctx.client.users.fetch(row.id, { force: true, cache: false }); }
          catch (error) { if (Number(error.code) === 10013) reason = 'deleted-account'; else throw error; }
          if (user?.bot) reason = 'bot';
          if (user && user.id !== row.id) throw Error('Recipient identity could not be verified.');
        }
        if (reason) { row.status = 'skipped'; row.reason = reason; store.save(gid, state); row = null; continue; }
        break;
      }
      if (!row) return;
      permitted(guild);
      if (stopped(gid)) { job.status = 'cancelled'; store.save(gid, state); return; }
      const attempt = { userId: row.id, token: random(), jobId: job.id, at: now(), status: 'pending' };
      state.attempts.push(attempt);
      store.save(gid, state); // No invite or DM before both durable records exist.
      if (!store.claim(attempt.at)) { attempt.status = 'uncertain'; row.status = 'uncertain'; store.save(gid, state); return; }
      try {
        const invite = await c.createInvite({ maxAge: 86400, maxUses: 1, temporary: false, unique: true, reason: 'Owner-confirmed backup recovery invitation ' + job.id });
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(invite.code) || invite.guild?.id !== gid) throw Error('Discord returned an invalid server invitation.');
        attempt.inviteCode = invite.code;
        store.save(gid, state);
        permitted(guild);
        if (stopped(gid)) throw Error('Queue stopped before DM delivery.');
        await access(guild, job.ownerId);
        // A ban/join may have occurred while creating the link. Never send that
        // link if the fresh membership or moderation check cannot be completed.
        if (!await missing(guild, row.id) || await banned(guild, row.id) || store.optedOut(gid, row.id)) {
          attempt.status = 'skipped'; row.status = 'skipped'; row.reason = 'membership-or-ban-changed';
        } else {
          permitted(guild);
          if (stopped(gid)) throw Error('Queue stopped before DM delivery.');
          const content = invitationText(job, gid, 'https://discord.gg/' + invite.code);
          const label = job.language === 'de' ? 'Keine weiteren Einladungen' : 'No further invitations';
          const sent = await locale.withLiteralUI([label], () => locale.withProtectedValues([content], () => user.send({ ...payload(content),
            nonce: BigInt('0x' + digest([gid, row.id]).slice(0, 16)).toString(), enforceNonce: true,
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
              .setCustomId(`pxreinvite:optout:${gid}:${attempt.token}`)
              .setLabel(label).setStyle(ButtonStyle.Secondary))] })));
          attempt.status = 'sent'; row.status = 'sent'; attempt.messageId = sent.id; job.failures = 0;
        }
      } catch (error) {
        if (attempt.status === 'sent') throw error;
        const definite = [50007, 10013].includes(Number(error.code));
        attempt.status = definite ? 'failed' : 'uncertain'; row.status = attempt.status;
        row.reason = definite ? 'dm-unavailable' : 'delivery-not-confirmed';
        job.failures = (job.failures || 0) + 1;
        if (!definite || job.failures >= 5) { job.status = 'paused'; job.note = 'Delivery paused after errors. Previous attempts are never replayed. Inspect rights/DM availability, then /backup invite-resume.'; }
      }
      if (stopped(gid)) job.status = 'cancelled';
      else if (!job.members.some(r => r.status === 'queued')) job.status = 'complete';
      store.save(gid, state);
    } catch (error) {
      retryAt.set(gid, now() + 300000);
      if (state?.job?.status === 'queued') {
        state.job.status = 'paused'; state.job.note = String(error.message || error).slice(0, 300);
        try { store.save(gid, state); } catch { /* Durable pending entries prevent a replay after restart. */ }
      }
      try { await ctx.alert?.(guild, 'Recovery invitations paused: ' + String(error.message || error).slice(0, 250)); } catch {}
    } finally { locks.delete(gid); }
  }
  async function run() {
    const guilds = [...ctx.client.guilds.cache.values()];
    if (!guilds.length) return;
    const start = cursor++ % guilds.length;
    for (let n = 0; n < guilds.length; n++) await deliver(guilds[(start + n) % guilds.length]);
  }
  function tick() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }
  return { handleInteraction, tick, store };
}
module.exports = { addCommands, invitationText, validate, createInvitationStore, createBackupInvites };
