'use strict';
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const locale = require('./localization');
const HUB = '1562906673549541427', ID = /^\d{17,20}$/, DAY = 86400000;
const BASIC = new Set(['profile', 'balance', 'quests', 'leaderboard']);
const FREE = new Set(['help', 'diagnose', 'access']);
const CLEANUP = /^(?:ticket_(?:ai_no|human|close|close_modal|close_reason|rate|editmsg|editmsg_modal):|feedback_|giveaway_claim:|pxreward:claim:|pxreinvite:optout:)/;
function command() { return new SlashCommandBuilder().setName('access').setDescription('Check server-owner membership and unlock this server').setDMPermission(false); }
function basic(i) {
  if (i.isChatInputCommand?.()) return BASIC.has(i.commandName) ? i.commandName : FREE.has(i.commandName) ? 'free' : null;
  const id = String(i.customId || '');
  if (id.startsWith('pxhelp:') || id.startsWith('pxaccess:')) return 'free';
  if (id === 'welcome_quests' || id.startsWith('quest_claim:')) return 'quests';
  return null;
}
function validInvite(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
    && (u.hostname === 'discord.gg' && /^\/[\w-]{2,100}$/.test(u.pathname) || ['discord.com', 'www.discord.com'].includes(u.hostname) && /^\/invite\/[\w-]{2,100}$/.test(u.pathname)); } catch { return false; }
}
function createFeatureAccess(ctx) {
  const now = ctx.now || Date.now, cache = new Map(), flights = new Map(), notices = new Map(), checks = new Map();
  let revision = 0, inviteFlight = null, inviteCache = null;
  const t = (gid, en, de) => (ctx.languageFor?.(gid) || locale.languageFor(gid)) === 'de' ? de : en;
  const root = uid => ID.test(String(ctx.OWNER_ID)) && uid === ctx.OWNER_ID;
  function data() {
    const d = ctx.db.featureAccess;
    if (d === undefined) return { version: 1, usage: {}, invite: null, inviteAttemptAt: 0 };
    if (!d || d.version !== 1 || !d.usage || typeof d.usage !== 'object' || Array.isArray(d.usage) || !Number.isFinite(d.inviteAttemptAt)) throw Error('Invalid feature-access data. Preserve the database.');
    return d;
  }
  function save(d) { const old = ctx.db.featureAccess; ctx.db.featureAccess = d; try { ctx.saveDB(); } catch (e) { if (old === undefined) delete ctx.db.featureAccess; else ctx.db.featureAccess = old; throw e; } }
  function usage(gid, uid, consume = false) {
    if (!ID.test(gid) || !ID.test(uid)) throw Error('Invalid usage identity.');
    const d = data(), old = d.usage[gid]?.[uid];
    if (d.usage[gid] !== undefined && (!d.usage[gid] || typeof d.usage[gid] !== 'object' || Array.isArray(d.usage[gid]))) throw Error('Invalid server quota data.');
    if (old && (!Number.isInteger(old.used) || old.used < 0 || old.used > 5 || !Number.isFinite(old.since))) throw Error('Invalid basic-command quota.');
    const row = old && now() - old.since < DAY ? old : { since: now(), used: 0 };
    if (!consume || row.used >= 5) return { remaining: Math.max(0, 5 - row.used), resetAt: row.since + DAY, accepted: false };
    const users = Object.fromEntries(Object.entries(d.usage[gid] || {}).filter(([, v]) => v && Number.isFinite(v.since) && now() - v.since < DAY));
    if (!Object.hasOwn(users, uid) && Object.keys(users).length >= 10000) throw Error('Basic-command capacity is busy.');
    users[uid] = { ...row, used: row.used + 1 };
    save({ ...d, usage: { ...d.usage, [gid]: users } });
    return { remaining: 4 - row.used, resetAt: row.since + DAY, accepted: true };
  }
  function invalidateMember(member) {
    if (member?.guild?.id !== HUB) return;
    revision++;
    for (const [gid, row] of cache) if (row.ownerId === member.id) cache.delete(gid);
  }
  function invalidateGuild(guild) { if (guild?.id) { revision++; cache.delete(guild.id); } }
  async function query(guild) {
    const start = revision;
    try {
      if (ctx.isRejected?.(guild.id)) return { full: false, reason: 'rejected' };
      const fresh = await ctx.client.guilds.fetch({ guild: guild.id, force: true });
      if (!fresh || fresh.id !== guild.id || !ID.test(fresh.ownerId)) throw Error('Owner unknown');
      const ownerId = fresh.ownerId;
      const home = ctx.client.guilds.cache.get(HUB) || await ctx.client.guilds.fetch({ guild: HUB, force: true });
      if (!home || home.id !== HUB) return { full: false, reason: 'unavailable', ownerId };
      let member;
      try { member = await home.members.fetch({ user: ownerId, force: true, cache: false }); }
      catch (e) { if (Number(e.code) === 10007) return { full: false, reason: 'join', ownerId }; throw e; }
      if (!member || member.id !== ownerId || member.user?.bot) throw Error('Member identity unknown');
      if (start !== revision) return { full: false, reason: 'unavailable', ownerId };
      if (member.pending) return { full: false, reason: 'pending', ownerId };
      if (ctx.isRejected?.(guild.id)) return { full: false, reason: 'rejected', ownerId };
      await ctx.approveFromMembership?.(guild.id, ownerId);
      if (start !== revision) return { full: false, reason: 'unavailable', ownerId };
      if (ctx.isRejected?.(guild.id)) return { full: false, reason: 'rejected', ownerId };
      return { full: true, reason: 'member', ownerId };
    } catch { return { full: false, reason: 'unavailable' }; }
  }
  function status(guild, force = false) {
    if (!guild || !ID.test(guild.id)) return Promise.resolve({ full: false, reason: 'server' });
    if (ctx.isRejected?.(guild.id)) return Promise.resolve({ full: false, reason: 'rejected' });
    const stored = cache.get(guild.id);
    if (!force && stored && now() < stored.until) return Promise.resolve(stored);
    if (flights.has(guild.id)) return flights.get(guild.id);
    if (flights.size >= 16) return Promise.resolve({ full: false, reason: 'unavailable' });
    const task = query(guild).then(row => {
      const saved = { ...row, until: now() + (row.full ? 60000 : row.reason === 'unavailable' ? 5000 : 15000) };
      cache.set(guild.id, saved); while (cache.size > 2000) cache.delete(cache.keys().next().value);
      return saved;
    }).finally(() => flights.delete(guild.id));
    flights.set(guild.id, task); return task;
  }
  async function joinLink() {
    if (inviteCache && inviteCache.until > now()) return inviteCache.url;
    if (inviteFlight) return inviteFlight;
    inviteFlight = (async () => {
      try {
        const configured = ctx.inviteUrl || process.env.COMMUNITY_INVITE_URL;
        const stored = data().invite;
        const candidate = configured || stored && stored.expiresAt > now() + 60000 && stored.url;
        if (candidate && validInvite(candidate)) {
          try { const found = await ctx.client.fetchInvite(candidate); if (found.guild?.id === HUB) {
            inviteCache = { url: candidate, until: now() + 600000 }; return candidate;
          } } catch {}
        }
        const d = data();
        if (d.inviteAttemptAt && now() - d.inviteAttemptAt < 600000) return null;
        const home = ctx.client.guilds.cache.get(HUB);
        if (!home) return null;
        const [channels, bot] = await Promise.all([home.channels.fetch(), home.members.fetchMe({ force: true }), home.roles.fetch()]);
        const candidates = [...channels.values()].filter(ch => ch && [0, 5].includes(ch.type)
          && ch.permissionsFor(home.roles.everyone)?.has(P.ViewChannel)
          && ch.permissionsFor(bot)?.has([P.ViewChannel, P.CreateInstantInvite]));
        candidates.sort((a, b) => Number(b.id === home.systemChannelId) - Number(a.id === home.systemChannelId));
        if (!candidates.length) return null;
        save({ ...data(), inviteAttemptAt: now() }); // Reserve before creating an external invite.
        const made = await candidates[0].createInvite({ maxAge: 86400, maxUses: 0, unique: false, reason: 'Pixel server-owner feature access' });
        if (made.guild?.id !== HUB || !/^[\w-]{2,100}$/.test(made.code)) return null;
        const url = 'https://discord.gg/' + made.code;
        save({ ...data(), invite: { url, expiresAt: now() + 86400000 } });
        inviteCache = { url, until: now() + 600000 }; return url;
      } catch { return null; }
    })().finally(() => { inviteFlight = null; });
    return inviteFlight;
  }
  async function info(guild, uid, row, remaining = null, generateLink = true) {
    const gid = guild?.id, reason = row.reason;
    let content = row.full ? t(gid, '✅ Full command access for this server: its server owner is a verified member of the Pixel community.', '✅ Alle Befehle sind für diesen Server freigeschaltet: Sein Server-Owner ist bestätigtes Mitglied der Pixel-Community.')
      : reason === 'rejected' ? t(gid, 'This server was explicitly rejected by the bot owner. Membership does not override that decision.', 'Dieser Server wurde vom Bot-Owner ausdrücklich abgelehnt. Ein Beitritt übergeht diese Entscheidung nicht.')
      : reason === 'unavailable' ? t(gid, 'Owner membership could not be verified. The bot must be in the community server and able to fetch its members; no full access was assumed.', 'Die Owner-Mitgliedschaft konnte nicht geprüft werden. Der Bot muss im Community-Server sein und Mitglieder abrufen können; es wurde keine volle Freischaltung angenommen.')
      : reason === 'pending' ? t(gid, 'The server owner joined but must finish the community rules/onboarding.', 'Der Server-Owner ist beigetreten, muss aber noch die Community-Regeln/das Onboarding abschließen.')
      : t(gid, '🔓 The actual server owner must join the Pixel community to unlock all commands for every member of this server.', '🔓 Der tatsächliche Server-Owner muss der Pixel-Community beitreten, damit alle Mitglieder dieses Servers alle Befehle nutzen können.');
    content += '\n' + t(gid, `Community server: ${HUB}. Joining is required for the server owner, not for each member.`, `Community-Server: ${HUB}. Beitreten muss der Server-Owner, nicht jedes Mitglied.`);
    if (!row.full) content += '\n' + t(gid, 'Basic: /profile, /balance, /quests, /leaderboard — 5 shared uses per person/server per 24 hours. /help, /diagnose and /access remain available.', 'Basis: /profile, /balance, /quests, /leaderboard — zusammen 5 Aufrufe je Person/Server pro 24 Stunden. /help, /diagnose und /access bleiben verfügbar.');
    if (remaining !== null) content += '\n' + t(gid, `Basic uses remaining: ${remaining}/5.`, `Verbleibende Basis-Aufrufe: ${remaining}/5.`);
    content += '\n' + t(gid, 'Safety limits, permissions and role hierarchy still apply after unlocking.', 'Sicherheitslimits, Berechtigungen und Rollen-Hierarchie gelten auch nach der Freischaltung.');
    const buttons = [];
    const url = row.full || reason === 'rejected' ? null : generateLink ? await joinLink() : inviteCache && inviteCache.until > now() ? inviteCache.url : null;
    if (url) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(t(gid, 'Join the community', 'Community beitreten')));
    if (ID.test(gid) && ID.test(uid)) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId(`pxaccess:check:${gid}:${uid}`).setLabel(t(gid, 'Check again', 'Erneut prüfen')));
    if (!url && !row.full && reason !== 'rejected') content += '\n' + t(gid, 'No verified invite is available yet. Ask the bot owner to set COMMUNITY_INVITE_URL or allow Pixel to create an invite in a public community channel.', 'Noch kein bestätigter Einladungslink verfügbar. Der Bot-Owner kann COMMUNITY_INVITE_URL setzen oder Pixel Einladungen in einem öffentlichen Community-Kanal erlauben.');
    return { content, components: buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [], allowedMentions: { parse: [] } };
  }
  async function handleInteraction(i) {
    const component = String(i.customId || '').startsWith('pxaccess:');
    if (!component && !(i.isChatInputCommand?.() && i.commandName === 'access')) return false;
    if (!i.guild) { await i.reply({ content: 'Use /access in the server you want to unlock.', flags: MessageFlags.Ephemeral }); return true; }
    if (component && i.customId !== `pxaccess:check:${i.guild.id}:${i.user.id}`) {
      await i.reply({ content: 'Open your own /access menu.', flags: MessageFlags.Ephemeral }); return true;
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const key = i.guild.id, prior = checks.get(key), force = prior === undefined || now() - prior >= 15000;
    if (force) checks.set(key, now()); while (checks.size > 2000) checks.delete(checks.keys().next().value);
    const row = await status(i.guild, force);
    let left = null; try { left = usage(i.guild.id, i.user.id).remaining; } catch {}
    await i.editReply(await info(i.guild, i.user.id, row, row.full ? null : left)); return true;
  }
  async function allowInteraction(i) {
    if (root(i.user?.id)) return true;
    if (i.isAutocomplete?.()) return true;
    const custom = String(i.customId || '');
    // Let existing handlers finish human support, privacy opt-outs and won prizes.
    if (CLEANUP.test(custom)) return true;
    if (i.isChatInputCommand?.() && ['music', 'mimic'].includes(i.commandName) && i.options?.getSubcommand?.(false) === 'stop') return true;
    const kind = basic(i);
    if (!i.guild) {
      if (kind === 'free') return true;
      await i.reply({ content: 'Use this in a server so Pixel can verify its owner’s community membership.', flags: MessageFlags.Ephemeral }); return false;
    }
    if (kind === 'free' && !ctx.isRejected?.(i.guild.id)) return true;
    // Leave the initial acknowledgement to the real handler (some open modals).
    // A short deadline denies this attempt while a slow check finishes in cache.
    let timer;
    const row = await Promise.race([status(i.guild), new Promise(resolve => { timer = setTimeout(() => resolve({ full: false, reason: 'unavailable' }), 1400); })]).finally(() => clearTimeout(timer));
    if (row.full) return true;
    if (row.reason !== 'rejected' && BASIC.has(kind)) {
      try { const quota = usage(i.guild.id, i.user.id, true); if (quota.accepted) {
        // Notices are sent only on explicit commands, privately, after their normal response.
        i.__pixelBasicAccess = { remaining: quota.remaining, row }; return true;
      } } catch {
        await i.reply({ content: 'The usage limit could not be safely saved. Ask the bot owner to check storage.', flags: MessageFlags.Ephemeral }); return false;
      }
    }
    let left = null; try { left = usage(i.guild.id, i.user.id).remaining; } catch {}
    const p = await info(i.guild, i.user.id, row, left, false);
    p.content += '\n' + t(i.guild.id, 'Use /access for the join link and a fresh check.', 'Nutze /access für den Beitrittslink und eine neue Prüfung.');
    await i.reply({ ...p, flags: MessageFlags.Ephemeral }); return false;
  }
  async function afterInteraction(i) {
    if (!i.__pixelBasicAccess || !i.replied && !i.deferred) return;
    const { remaining, row } = i.__pixelBasicAccess; delete i.__pixelBasicAccess;
    await i.followUp({ ...(await info(i.guild, i.user.id, row, remaining)), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  async function hasFull(guild, uid = null) { return root(uid) || (await status(guild)).full; }
  async function messageNotice(message) {
    const key = message.guild.id + ':' + message.author.id, prior = notices.get(key);
    if (prior !== undefined && now() - prior < 60000) return;
    notices.set(key, now()); while (notices.size > 2000) notices.delete(notices.keys().next().value);
    const p = await info(message.guild, message.author.id, await status(message.guild));
    // Avoid posting repeated promotional panels into ticket history.
    await message.reply({ content: p.content, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
  return { handleInteraction, allowInteraction, afterInteraction, status, hasFull, usage, joinLink, invalidateMember, invalidateGuild, messageNotice, basic };
}
module.exports = { HUB, BASIC, FREE, command, basic, validInvite, createFeatureAccess };
