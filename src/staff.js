const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const STAFF_RETENTION_MS = 90 * DAY_MS;
const INSULT_WINDOW_MS = 10 * 60 * 1000;
const CONFLICT_WINDOW_MS = 8 * 60 * 1000;

function buildStaffCommands() {
  return [
    new SlashCommandBuilder().setName("staffstats").setDescription("Zeigt professionelle Staff-Aktivitätswerte.")
      .addUserOption(o => o.setName("user").setDescription("Staff-Mitglied"))
      .addIntegerOption(o => o.setName("tage").setDescription("Zeitraum in Tagen").setMinValue(1).setMaxValue(90)),
    new SlashCommandBuilder().setName("staffleaderboard").setDescription("Staff-Aktivitätsübersicht ohne Spam-Zählen.")
      .addIntegerOption(o => o.setName("tage").setDescription("Zeitraum in Tagen").setMinValue(1).setMaxValue(90)),
    new SlashCommandBuilder().setName("case").setDescription("Moderationsfälle verwalten.")
      .addSubcommand(s => s.setName("view").setDescription("Zeigt einen Fall.").addStringOption(o => o.setName("id").setDescription("z.B. CASE-00001").setRequired(true)))
      .addSubcommand(s => s.setName("user").setDescription("Zeigt Fälle eines Users.").addUserOption(o => o.setName("user").setDescription("Mitglied").setRequired(true)))
      .addSubcommand(s => s.setName("note").setDescription("Fügt eine Staff-Notiz hinzu.").addStringOption(o => o.setName("id").setDescription("Fall-ID").setRequired(true)).addStringOption(o => o.setName("text").setDescription("Notiz").setRequired(true).setMaxLength(1500)))
      .addSubcommand(s => s.setName("close").setDescription("Schließt einen Fall.").addStringOption(o => o.setName("id").setDescription("Fall-ID").setRequired(true)))
      .addSubcommand(s => s.setName("summarize").setDescription("Erstellt eine AI-Fallzusammenfassung.").addStringOption(o => o.setName("id").setDescription("Fall-ID").setRequired(true))),
    new SlashCommandBuilder().setName("serverhealth").setDescription("Zeigt Server- und Moderationszustand.")
      .addIntegerOption(o => o.setName("tage").setDescription("Zeitraum").setMinValue(1).setMaxValue(30)),
    new SlashCommandBuilder().setName("staffai").setDescription("Interne AI für Regeln, Fälle und Staff-Fragen.")
      .addStringOption(o => o.setName("frage").setDescription("Interne Staff-Frage").setRequired(true).setMaxLength(3000)),
    new SlashCommandBuilder().setName("punishmenthistory").setDescription("Zeigt gespeicherte Moderationshistorie eines Users.")
      .addUserOption(o => o.setName("user").setDescription("Mitglied").setRequired(true)),
    new SlashCommandBuilder().setName("shift").setDescription("Staff-Schicht starten, beenden oder ansehen.")
      .addSubcommand(s => s.setName("start").setDescription("Startet deine Staff-Schicht."))
      .addSubcommand(s => s.setName("end").setDescription("Beendet deine Staff-Schicht."))
      .addSubcommand(s => s.setName("status").setDescription("Zeigt deine aktuelle Schicht.")),
    new SlashCommandBuilder().setName("stafftask").setDescription("Staff-Aufgaben verwalten.")
      .addSubcommand(s => s.setName("create").setDescription("Erstellt eine Staff-Aufgabe.")
        .addUserOption(o => o.setName("user").setDescription("Zuständig").setRequired(true))
        .addStringOption(o => o.setName("aufgabe").setDescription("Aufgabe").setRequired(true).setMaxLength(1200))
        .addStringOption(o => o.setName("deadline").setDescription("Optional z.B. 2h, 1d, 3d")))
      .addSubcommand(s => s.setName("list").setDescription("Zeigt offene Staff-Aufgaben."))
      .addSubcommand(s => s.setName("done").setDescription("Markiert eine Aufgabe als erledigt.").addStringOption(o => o.setName("id").setDescription("Task-ID").setRequired(true))),
    new SlashCommandBuilder().setName("staffapplication").setDescription("AI-Review einer Staff-Bewerbung, ohne Auto-Annahme/Ablehnung.")
      .addStringOption(o => o.setName("text").setDescription("Bewerbungstext").setRequired(true).setMaxLength(4000)),
    new SlashCommandBuilder().setName("staffbrief").setDescription("Erstellt sofort ein AI Staff-Briefing."),
    new SlashCommandBuilder().setName("modassist").setDescription("AI analysiert eine konkrete Nachricht und gibt nur eine Staff-Empfehlung.")
      .addStringOption(o => o.setName("message_id").setDescription("Nachrichten-ID im aktuellen Kanal").setRequired(true))
  ];
}

function createStaffSystem(ctx) {
  const {
    client, db, saveDB, guildData, footer, findOrCreateCategory, findOrCreateText,
    OWNER_ID, BOT_NAME, getGeminiClient, generateGeminiContent, GEMINI_MODEL, ownerNotify,
    getGuildKnowledgeText
  } = ctx;

  const isGuildApproved = typeof ctx.isGuildApproved === "function" ? ctx.isGuildApproved : (() => true);
  const timezone = process.env.COMMUNITY_TIMEZONE || "Europe/Berlin";
  const insultTimeoutMin = Math.max(1, Number(process.env.AI_INSULT_TIMEOUT_MIN || 20));
  const disputeDeclineTimeoutMin = Math.max(1, Number(process.env.DISPUTE_DECLINE_TIMEOUT_MIN || 30));
  const disputeFailedTimeoutMin = Math.max(1, Number(process.env.DISPUTE_FAILED_TIMEOUT_MIN || 30));
  const disputeResolvedTimeoutMin = Math.max(1, Number(process.env.DISPUTE_RESOLVED_TIMEOUT_MIN || 10));

  if (!db.staff) db.staff = {};
  const messageSignals = new Map();
  const conflictSignals = new Map();
  const joinSignals = new Map();
  const duplicateSignals = new Map();
  const recentModeratorPunishments = new Map();
  const moderationClassifyCooldowns = new Map();

  function nowDay(ts = Date.now()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  }

  function localParts(ts = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false
    }).formatToParts(new Date(ts)).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday, hour: Number(parts.hour) };
  }

  function parseDuration(input) {
    const m = /^(\d+)(m|h|d)$/i.exec(String(input || "").trim());
    if (!m) return null;
    return Number(m[1]) * ({ m: 60000, h: 3600000, d: DAY_MS }[m[2].toLowerCase()]);
  }

  function ensureGuild(guildId) {
    if (!db.staff[guildId]) db.staff[guildId] = {};
    const s = db.staff[guildId];
    if (!s.channels) s.channels = {};
    if (!s.activity) s.activity = {};
    if (!s.cases) s.cases = {};
    if (!s.caseCounter) s.caseCounter = 0;
    if (!s.punishments) s.punishments = [];
    if (!s.disputes) s.disputes = {};
    if (!s.tasks) s.tasks = {};
    if (!s.taskCounter) s.taskCounter = 0;
    if (!s.health) s.health = { daily: {} };
    if (!s.health.daily) s.health.daily = {};
    if (!s.scheduled) s.scheduled = { dailyBriefKey: null, weeklyReportKey: null };
    if (!s.shifts) s.shifts = {};
    if (!s.inactivityNotified) s.inactivityNotified = {};
    return s;
  }

  function isStaff(member) {
    if (!member) return false;
    if (member.id === OWNER_ID) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ManageMessages)) return true;
    const roleId = guildData(member.guild.id).supportRoleId;
    return Boolean(roleId && member.roles?.cache?.has(roleId));
  }

  function dailyBucket(guildId, ts = Date.now()) {
    const s = ensureGuild(guildId);
    const key = nowDay(ts);
    if (!s.health.daily[key]) s.health.daily[key] = { messages: 0, joins: 0, leaves: 0, punishments: 0, disputes: 0, tickets: 0, activeUsers: {} };
    const b = s.health.daily[key];
    if (!b.activeUsers) b.activeUsers = {};
    for (const oldKey of Object.keys(s.health.daily)) {
      if (Date.now() - new Date(`${oldKey}T00:00:00Z`).getTime() > 40 * DAY_MS) delete s.health.daily[oldKey];
    }
    return b;
  }

  function ensureActivity(guildId, userId) {
    const s = ensureGuild(guildId);
    if (!s.activity[userId]) s.activity[userId] = { actions: [], activeDays: {}, shifts: [] };
    const a = s.activity[userId];
    if (!Array.isArray(a.actions)) a.actions = [];
    if (!a.activeDays) a.activeDays = {};
    if (!Array.isArray(a.shifts)) a.shifts = [];
    a.actions = a.actions.filter(x => Date.now() - x.at < STAFF_RETENTION_MS);
    return a;
  }

  function recordAction(guildId, userId, type, meta = {}) {
    if (!guildId || !userId) return;
    const a = ensureActivity(guildId, userId);
    const at = Date.now();
    a.actions.push({ at, type, meta });
    a.activeDays[nowDay(at)] = true;
    const shift = ensureGuild(guildId).shifts[userId];
    if (shift?.active) shift.actions = (shift.actions || 0) + 1;
    saveDB();
  }

  function nextCaseId(guildId) {
    const s = ensureGuild(guildId);
    s.caseCounter += 1;
    return `CASE-${String(s.caseCounter).padStart(5, "0")}`;
  }

  async function staffLog(guild, title, description, kind = "audit") {
    const s = ensureGuild(guild.id);
    const channelId = kind === "alerts" ? s.channels.alerts : kind === "briefing" ? s.channels.briefing : kind === "cases" ? s.channels.cases : s.channels.audit;
    const ch = channelId && guild.channels.cache.get(channelId);
    if (!ch) return;
    await ch.send({ embeds: [footer(new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp())] }).catch(() => {});
  }

  async function alertStaff(guild, title, description, ownerDm = false) {
    await staffLog(guild, title, description, "alerts");
    if (ownerDm) await ownerNotify(client, `${title}\n${description}`);
  }

  function createCase(guild, data = {}) {
    const s = ensureGuild(guild.id);
    const id = nextCaseId(guild.id);
    s.cases[id] = {
      id,
      createdAt: Date.now(),
      status: "open",
      notes: [],
      evidence: [],
      ...data
    };
    saveDB();
    return s.cases[id];
  }

  async function recordPunishment(guild, userId, moderatorId, type, durationMs, reason, source = "manual", extra = {}) {
    const s = ensureGuild(guild.id);
    const item = { at: Date.now(), userId, moderatorId, type, durationMs: durationMs || 0, reason: reason || "No reason", source, ...extra };
    s.punishments.push(item);
    s.punishments = s.punishments.filter(x => Date.now() - x.at < STAFF_RETENTION_MS);
    dailyBucket(guild.id).punishments += 1;
    if (moderatorId) recordAction(guild.id, moderatorId, type === "ban" ? "ban" : "timeout", { userId, durationMs, reason, source });
    const c = createCase(guild, { userId, moderatorId, type: "punishment", punishment: item, summary: `${type.toUpperCase()}: ${reason}` });
    await staffLog(guild, `⚖️ Punishment recorded`, `User: <@${userId}>\nModerator: ${moderatorId ? `<@${moderatorId}>` : "Bot / AI"}\nAction: **${type}**${durationMs ? ` • ${Math.round(durationMs/60000)} min` : ""}\nReason: **${reason}**\nSource: **${source}**`);
    await staffLog(guild, `⚖️ ${c.id} • ${type}`, `<@${userId}> • Moderator: ${moderatorId ? `<@${moderatorId}>` : "AI moderation"}\nReason: **${reason}**\nSource: **${source}**`, "cases");

    if (moderatorId) {
      const key = `${guild.id}:${moderatorId}`;
      const arr = (recentModeratorPunishments.get(key) || []).filter(t => Date.now() - t < 10 * 60 * 1000);
      arr.push(Date.now());
      recentModeratorPunishments.set(key, arr);
      if (arr.length >= 5) {
        await alertStaff(guild, "🚩 Unusual staff activity", `<@${moderatorId}> recorded **${arr.length} punishments in 10 minutes**. Please review the audit log.`, true);
      }
    }
    saveDB();
    return c;
  }

  async function setupExistingOnly(guild) {
    const s = ensureGuild(guild.id);
    const gd = guildData(guild.id);
    const map = {
      "staff-audit": "audit",
      "ai-staff-alerts": "alerts",
      "mod-cases": "cases",
      "staff-briefing": "briefing",
      "staff-tasks": "tasks"
    };
    for (const [canonical, key] of Object.entries(map)) {
      const id = gd.channels?.[canonical];
      if (id && guild.channels.cache.get(id)) s.channels[key] = id;
    }
    saveDB();
    if (s.channels.audit) {
      await staffLog(guild, "🧠 Staff-System verbunden", "Gefundene Staff-Kanäle wurden mit dem Bot verbunden. Fehlende Staff-Kanäle wurden nicht erstellt.").catch(() => {});
    }
    return s;
  }

  async function setup(guild) {
    const s = ensureGuild(guild.id);
    const roleId = guildData(guild.id).supportRoleId;
    const cat = await findOrCreateCategory(guild, "STAFF • MANAGEMENT");
    const mediationCat = await findOrCreateCategory(guild, "AI • MEDIATION");
    const privatePerms = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      ...(roleId ? [{ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : []),
      { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] }
    ];
    const audit = await findOrCreateText(guild, "staff-audit", cat, privatePerms);
    const alerts = await findOrCreateText(guild, "ai-staff-alerts", cat, privatePerms);
    const cases = await findOrCreateText(guild, "mod-cases", cat, privatePerms);
    const briefing = await findOrCreateText(guild, "staff-briefing", cat, privatePerms);
    const tasks = await findOrCreateText(guild, "staff-tasks", cat, privatePerms);
    s.channels = { ...s.channels, audit: audit.id, alerts: alerts.id, cases: cases.id, briefing: briefing.id, tasks: tasks.id, mediationCategory: mediationCat.id };
    saveDB();
    await staffLog(guild, "🧠 Professional Staff System ready", "Activity checks, AI moderation assistant, case system, audit log, server health, staff shifts/tasks, AI briefings and dispute mediation are enabled.");
    return s;
  }

  function suspiciousLocally(message) {
    const text = String(message.content || "").toLowerCase();
    if (!text) return false;
    const insult = /(idiot|hurensohn|huso|bastard|spast|opfer|missgeburt|arschloch|fick dich|fuck you|retard|dumbass|stfu|halt die fresse|loser|noob|clown)/i;
    const scam = /(free nitro|steam gift|discord gift|verdoppl|double your|give me.*password|token|verification.*link|kostenlos.*nitro|wallet|crypto.*send)/i;
    const argument = /(lügner|scammer|gescammt|betrogen|du hast|deine schuld|hör auf|lass mich|beleidigt|reported|reportet)/i;
    const mentions = message.mentions?.users?.size || 0;
    return insult.test(text) || scam.test(text) || argument.test(text) || mentions >= 6;
  }

  async function recentContext(channel, limit = 10) {
    const batch = await channel.messages.fetch({ limit }).catch(() => null);
    if (!batch) return [];
    return [...batch.values()].reverse().filter(m => !m.author.bot).map(m => ({
      id: m.id,
      userId: m.author.id,
      tag: m.author.tag,
      content: String(m.content || "").slice(0, 900),
      replyTo: m.reference?.messageId || null
    }));
  }

  function parseJson(text) {
    const raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(raw); } catch {}
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }

  async function classifyModeration(message) {
    const ai = await getGeminiClient();
    if (!ai) return null;
    const context = await recentContext(message.channel, 12);
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: `Analyze this Discord conversation for moderation. The newest message is ${message.id} by user ${message.author.id}.\n\nConversation:\n${JSON.stringify(context)}`,
      config: {
        systemInstruction: `You are a conservative Discord moderation classifier. Return ONLY valid JSON with keys: insult:boolean, severity:0|1|2|3, targetUserId:string|null, mutualConflict:boolean, counterpartUserId:string|null, scam:boolean, threat:boolean, confidence:number from 0 to 1, reason:string.\nDo not punish or decide guilt. Distinguish joking/friendly banter from targeted abuse. A mutualConflict means both sides are actively escalating, not merely one victim replying defensively. Use exact user IDs from the provided context. Be conservative when context is ambiguous.`,
        temperature: 0,
        maxOutputTokens: 500
      }
    });
    return parseJson(response.text);
  }

  function signalFor(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const state = messageSignals.get(key) || { flags: [] };
    state.flags = state.flags.filter(x => Date.now() - x.at < INSULT_WINDOW_MS);
    messageSignals.set(key, state);
    return state;
  }

  function pairKey(guildId, a, b) {
    const ids = [String(a), String(b)].sort();
    return `${guildId}:${ids[0]}:${ids[1]}`;
  }

  function activeDisputeForPair(guildId, a, b) {
    const s = ensureGuild(guildId);
    return Object.values(s.disputes).find(d => d.status !== "closed" && d.participants?.includes(a) && d.participants?.includes(b));
  }

  async function offerMediation(guild, channel, userA, userB, reason) {
    if (!userA || !userB || userA === userB) return null;
    if (activeDisputeForPair(guild.id, userA, userB)) return null;
    const s = ensureGuild(guild.id);
    const id = `DISPUTE-${Date.now().toString(36).toUpperCase()}`;
    const caseRec = createCase(guild, { userId: userA, relatedUsers: [userB], type: "dispute", summary: String(reason || "Possible mutual argument").slice(0, 800) });
    s.disputes[id] = {
      id, guildId: guild.id, originChannelId: channel.id, participants: [userA, userB], votes: {}, status: "offered",
      createdAt: Date.now(), reason: String(reason || "Possible argument").slice(0, 800), resolutionVotes: {}, closeVotes: {}, history: [], caseId: caseRec.id
    };
    caseRec.disputeId = id;
    dailyBucket(guild.id).disputes += 1;
    saveDB();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mediation_yes:${id}`).setLabel("Ja – AI-Schlichtung").setEmoji("🤝").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mediation_no:${id}`).setLabel("Nein").setStyle(ButtonStyle.Danger)
    );
    await channel.send({
      content: `<@${userA}> <@${userB}>`,
      embeds: [footer(new EmbedBuilder().setTitle("🤝 Streit erkannt – AI-Schlichtung").setDescription("Der Bot hat eine mögliche gegenseitige Eskalation erkannt. **Eine einzelne Beleidigung führt nicht sofort zu einem Timeout.**\n\nMöchtet ihr den Streit mit der AI schlichten? Sobald mindestens eine Person **Ja** wählt, wird ein privater Schlichtungs-Channel erstellt. Wenn **beide Nein** wählen, werden beide wegen fortgesetzter Eskalation getimeoutet."))],
      components: [row],
      allowedMentions: { users: [userA, userB] }
    }).catch(() => {});
    await alertStaff(guild, "🤝 AI mediation offered", `<@${userA}> and <@${userB}> in ${channel}.\nReason: ${reason}`, false);
    return s.disputes[id];
  }

  async function timeoutUser(guild, userId, minutes, reason, source, moderatorId = null) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !member.moderatable) return false;
    try { await member.timeout(minutes * 60000, reason); } catch { return false; }
    await recordPunishment(guild, userId, moderatorId, "timeout", minutes * 60000, reason, source);
    return true;
  }

  async function timeoutBothForDispute(guild, dispute, minutes, reason) {
    const results = [];
    for (const userId of dispute.participants) results.push(await timeoutUser(guild, userId, minutes, reason, "ai-dispute", null));
    await ownerNotify(client, `🤝 Streit-Fall **${dispute.id}** auf **${guild.name}**: ${reason}. Timeout: ${minutes} Minuten für beide Beteiligten.`);
    return results;
  }

  async function createMediationChannel(guild, dispute) {
    if (dispute.channelId) return guild.channels.cache.get(dispute.channelId) || null;
    const s = ensureGuild(guild.id);
    const parent = guild.channels.cache.get(s.channels.mediationCategory);
    const staffRoleId = guildData(guild.id).supportRoleId;
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      ...dispute.participants.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] })),
      ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : []),
      { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] }
    ];
    const ch = await guild.channels.create({ name: `mediation-${dispute.id.toLowerCase().replace(/[^a-z0-9-]/g, "")}`.slice(0, 90), type: ChannelType.GuildText, parent: parent?.id, permissionOverwrites: overwrites, topic: `ai-mediation:${dispute.id}` });
    dispute.channelId = ch.id;
    dispute.status = "active";
    saveDB();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mediation_resolved:${dispute.id}`).setLabel("Streit gelöst").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mediation_close:${dispute.id}`).setLabel("Close – ungelöst").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );
    await ch.send({
      content: dispute.participants.map(id => `<@${id}>`).join(" "),
      embeds: [footer(new EmbedBuilder().setTitle("🤖 Private AI-Schlichtung").setDescription(`Ich helfe euch neutral dabei, den Streit zu klären. Schreibt nacheinander:\n\n1. **Was ist dein Anliegen?**\n2. **Was hat die andere Person getan?** (z.B. beleidigt, gescammt, bedroht)\n3. **Was wünschst du dir als Lösung?**\n4. **Hast du Beweise?** Du kannst Screenshots/Fotos anhängen.\n\nIch antworte auf eure Nachrichten und versuche, Missverständnisse und konkrete nächste Schritte herauszuarbeiten. Ich entscheide nicht automatisch, wer „recht“ hat.\n\nWenn ihr euch einigt, drücken **beide** „Streit gelöst“. Dann folgt eine **10-Minuten-Cooldown-Auszeit**. Wenn die Schlichtung scheitert und **beide** „Close – ungelöst“ drücken, folgt ein längerer Timeout.`))],
      components: [row],
      allowedMentions: { users: dispute.participants }
    });
    await staffLog(guild, "🤝 Private mediation started", `${dispute.id} • ${ch} • ${dispute.participants.map(id => `<@${id}>`).join(" / ")}`, "cases");
    return ch;
  }

  async function imagePartsForGemini(message) {
    const parts = [];
    const imgs = [...message.attachments.values()].filter(a => (a.contentType || "").startsWith("image/")).slice(0, 3);
    for (const a of imgs) {
      try {
        if (a.size && a.size > 8 * 1024 * 1024) continue;
        const r = await fetch(a.url);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 8 * 1024 * 1024) continue;
        parts.push({ inlineData: { data: buf.toString("base64"), mimeType: a.contentType || "image/jpeg" } });
      } catch {}
    }
    return parts;
  }

  async function answerMediation(message, dispute) {
    const ai = await getGeminiClient();
    if (!ai) {
      await message.reply({ content: "⚙️ Die AI-Schlichtung braucht `GEMINI_API_KEY`. Der private Channel bleibt offen, damit ihr und das Staff-Team den Fall trotzdem klären könnt.", allowedMentions: { repliedUser: false } });
      return;
    }
    const history = (dispute.history || []).slice(-14).map(h => `${h.userId}: ${h.text}`).join("\n");
    const imageParts = await imagePartsForGemini(message);
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: `Dispute ${dispute.id}. Participant ${message.author.id} says: ${message.content || "[image/evidence attached]"}\n\nRecent mediation history:\n${history}` }, ...imageParts] }],
      config: {
        systemInstruction: `You are a neutral Discord dispute mediator for ${BOT_NAME}. Only the two participants are in this private process. Respond in the language they use. Help de-escalate, summarize each side accurately, ask one useful follow-up at a time, and propose concrete fair next steps such as apology, repayment evidence, stopping contact, clarifying a misunderstanding, or handing unresolved fraud/threat claims to human staff. If images are provided, describe only what is clearly visible and do not invent details. Never decide guilt, never threaten users, never reveal secrets, and never tell them to retaliate. If someone reports scamming, threats, doxxing, sexual exploitation, or serious safety issues, say human staff should review the evidence. Keep responses under about 1200 characters.`,
        maxOutputTokens: 700
      }
    });
    const text = String(response.text || "Ich konnte gerade keine Antwort erzeugen.").slice(0, 1800);
    await message.reply({ content: text, allowedMentions: { repliedUser: false } });
  }

  async function handleMediationMessage(message) {
    if (!message.guild || message.author.bot) return false;
    const s = ensureGuild(message.guild.id);
    const dispute = Object.values(s.disputes).find(d => d.channelId === message.channel.id && d.status === "active");
    if (!dispute || !dispute.participants.includes(message.author.id)) return false;
    dispute.history = dispute.history || [];
    dispute.history.push({ at: Date.now(), userId: message.author.id, text: String(message.content || "[attachment]").slice(0, 1200), attachments: [...message.attachments.values()].map(a => a.url).slice(0, 4) });
    dispute.history = dispute.history.slice(-50);
    saveDB();
    await answerMediation(message, dispute).catch(() => {});
    return true;
  }

  async function maybeAutoModerate(message) {
    if (!message.guild || message.author.bot || !message.member) return;
    if (isStaff(message.member)) return;
    if (!suspiciousLocally(message)) return;

    // Verhindert, dass Spam direkt mehrere Gemini-Anfragen gleichzeitig auslöst.
    // Die AI schaut weiterhin Kontext an, aber pro User höchstens etwa alle 8 Sekunden.
    const classifyKey = `${message.guild.id}:${message.author.id}`;
    const lastClassify = moderationClassifyCooldowns.get(classifyKey) || 0;
    if (Date.now() - lastClassify < 8000) return;
    moderationClassifyCooldowns.set(classifyKey, Date.now());

    let result;
    try { result = await classifyModeration(message); } catch { return; }
    if (!result || Number(result.confidence || 0) < 0.72) return;

    const counterpart = result.counterpartUserId || result.targetUserId || null;
    if (result.mutualConflict && counterpart && counterpart !== message.author.id) {
      const member = await message.guild.members.fetch(counterpart).catch(() => null);
      if (member && !member.user.bot) {
        const pk = pairKey(message.guild.id, message.author.id, counterpart);
        const c = conflictSignals.get(pk) || { at: Date.now(), users: {} };
        c.at = Date.now(); c.users[message.author.id] = true;
        conflictSignals.set(pk, c);
        if (Object.keys(c.users).length >= 2 || Number(result.severity || 0) >= 2) {
          await offerMediation(message.guild, message.channel, message.author.id, counterpart, result.reason || "Possible mutual argument");
          return;
        }
      }
    }

    if (!(result.insult || result.scam || result.threat) || Number(result.severity || 0) < 2) return;
    const state = signalFor(message.guild.id, message.author.id);
    state.flags.push({ at: Date.now(), severity: Number(result.severity || 0), reason: result.reason || "AI moderation signal" });
    messageSignals.set(`${message.guild.id}:${message.author.id}`, state);

    // Wichtig: NIEMALS auf dem ersten AI-Signal sofort timeouten.
    if (state.flags.length < 2) {
      await staffLog(message.guild, "👀 AI is observing", `<@${message.author.id}> produced a first high-confidence moderation signal in ${message.channel}. No punishment was applied yet.\nReason: ${result.reason || "—"}`, "alerts");
      return;
    }

    const reason = result.scam ? "Repeated suspected scam behavior" : result.threat ? "Repeated threatening behavior" : "Repeated targeted insults / harassment";
    const ok = await timeoutUser(message.guild, message.author.id, insultTimeoutMin, reason, "ai-observed-abuse", null);
    if (ok) {
      state.flags = [];
      await message.channel.send(`🛡️ <@${message.author.id}> wurde nach **mehreren** erkannten Eskalationen für **${insultTimeoutMin} Minuten** getimeoutet. Eine einzelne Nachricht allein hat die Strafe nicht ausgelöst.`).catch(() => {});
      await ownerNotify(client, `🛡️ AI-Moderation auf **${message.guild.name}**: ${message.author.tag} wurde nach wiederholter erkannter Beleidigung/Eskalation für ${insultTimeoutMin} Minuten getimeoutet. Grund: ${result.reason || reason}`);
    }
  }

  async function detectRaidAndScam(message) {
    if (!message.guild || message.author.bot) return;
    const text = String(message.content || "").trim();
    if ((message.mentions?.users?.size || 0) >= 8) {
      await alertStaff(message.guild, "🚨 Mass mention detected", `${message.author} mentioned **${message.mentions.users.size} users** in ${message.channel}.`, true);
    }
    const normalized = text.toLowerCase().replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").trim();
    if (normalized.length >= 12) {
      const key = `${message.guild.id}:${normalized.slice(0, 120)}`;
      const rec = duplicateSignals.get(key) || [];
      const fresh = rec.filter(x => Date.now() - x.at < 60000 && x.userId !== message.author.id);
      fresh.push({ at: Date.now(), userId: message.author.id, channelId: message.channel.id });
      duplicateSignals.set(key, fresh);
      if (new Set(fresh.map(x => x.userId)).size >= 4) {
        await alertStaff(message.guild, "🚨 Coordinated duplicate spam", `The same/similar message was posted by **${new Set(fresh.map(x => x.userId)).size} different accounts** within 60 seconds.`, true);
        duplicateSignals.set(key, []);
      }
    }
  }

  async function onMessage(message) {
    if (!message.guild || message.author.bot) return false;
    const b = dailyBucket(message.guild.id);
    b.messages += 1;
    b.activeUsers[message.author.id] = true;
    saveDB();
    if (await handleMediationMessage(message)) return true;
    await detectRaidAndScam(message).catch(() => {});
    await maybeAutoModerate(message).catch(() => {});
    return false;
  }

  async function onMemberAdd(member) {
    dailyBucket(member.guild.id).joins += 1;
    const key = member.guild.id;
    const arr = (joinSignals.get(key) || []).filter(t => Date.now() - t < 60000);
    arr.push(Date.now());
    joinSignals.set(key, arr);
    saveDB();
    if (arr.length >= 8) {
      await alertStaff(member.guild, "🚨 Possible join raid", `**${arr.length} accounts joined within 60 seconds.** No automatic bans were issued. Staff should review recent joins.`, true);
      joinSignals.set(key, []);
    }
  }

  async function onMemberRemove(member) {
    dailyBucket(member.guild.id).leaves += 1;
    saveDB();
  }

  async function onMessageDelete(message) {
    if (!message.guild) return;
    const who = message.author ? `${message.author.tag} (<@${message.author.id}>)` : "Unknown author";
    await staffLog(message.guild, "🗑️ Message deleted", `${who}\nChannel: ${message.channel}\nContent: ${String(message.content || "[not cached / no text]").slice(0, 1200)}`);
  }

  function statsFor(guildId, userId, days) {
    const since = Date.now() - days * DAY_MS;
    const a = ensureActivity(guildId, userId);
    const actions = a.actions.filter(x => x.at >= since);
    const count = type => actions.filter(x => x.type === type).length;
    const responseSamples = actions.filter(x => x.type === "ticket_claim" && Number.isFinite(x.meta?.responseMs)).map(x => x.meta.responseMs);
    return {
      actions: actions.length,
      ticketsClaimed: count("ticket_claim"),
      ticketsClosed: count("ticket_close"),
      timeouts: count("timeout"),
      bans: count("ban"),
      cases: count("case"),
      tasks: count("task_done"),
      activeDays: Object.keys(a.activeDays || {}).filter(d => new Date(`${d}T00:00:00Z`).getTime() >= since - DAY_MS).length,
      avgResponseMs: responseSamples.length ? Math.round(responseSamples.reduce((x, y) => x + y, 0) / responseSamples.length) : null
    };
  }

  function staffScore(st) {
    return st.ticketsClosed * 4 + st.ticketsClaimed * 2 + st.cases * 3 + st.timeouts * 2 + st.bans * 3 + st.tasks * 2 + st.activeDays;
  }

  async function generateBrief(guild, days = 1, title = "AI Staff Briefing") {
    const s = ensureGuild(guild.id);
    const since = Date.now() - days * DAY_MS;
    const punishments = s.punishments.filter(x => x.at >= since);
    const openCases = Object.values(s.cases).filter(c => c.status !== "closed");
    const openTasks = Object.values(s.tasks).filter(t => !t.done);
    const activeDisputes = Object.values(s.disputes).filter(d => d.status !== "closed");
    const staffRows = Object.keys(s.activity).map(uid => ({ uid, st: statsFor(guild.id, uid, days) })).filter(x => x.st.actions > 0);
    const base = {
      days,
      punishments: punishments.length,
      openCases: openCases.length,
      openTasks: openTasks.length,
      activeDisputes: activeDisputes.length,
      staff: staffRows.map(x => ({ userId: x.uid, ...x.st }))
    };
    let summary = `**${days}-day overview**\n• Punishments: **${base.punishments}**\n• Open cases: **${base.openCases}**\n• Open staff tasks: **${base.openTasks}**\n• Active disputes: **${base.activeDisputes}**`;
    try {
      const ai = await getGeminiClient();
      if (ai) {
        const r = await generateGeminiContent({
          model: GEMINI_MODEL,
          contents: JSON.stringify(base),
          config: {
            systemInstruction: `Create a concise professional Discord staff briefing in German from these metrics. Mention workload, response bottlenecks, unusual moderation volume, open work and concrete follow-ups. Do not rank moderators as good/bad, do not infer motives, and do not make punishment decisions. Use Discord-friendly bullets.`,
            maxOutputTokens: 900
          }
        });
        summary = String(r.text || summary).slice(0, 3800);
      }
    } catch {}
    return footer(new EmbedBuilder().setTitle(`🧠 ${title}`).setDescription(summary).setTimestamp());
  }

  async function scheduledTick() {
    for (const guild of client.guilds.cache.values()) {
      if (!isGuildApproved(guild.id)) continue;
      const s = ensureGuild(guild.id);
      const p = localParts();
      if (p.hour >= 9 && s.scheduled.dailyBriefKey !== p.dayKey) {
        s.scheduled.dailyBriefKey = p.dayKey;
        saveDB();
        const embed = await generateBrief(guild, 1, "Daily Staff Brief");
        const ch = guild.channels.cache.get(s.channels.briefing);
        if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      }
      if (p.weekday === "Sun" && p.hour >= 19 && s.scheduled.weeklyReportKey !== p.dayKey) {
        s.scheduled.weeklyReportKey = p.dayKey;
        saveDB();
        const embed = await generateBrief(guild, 7, "Weekly AI Staff Report");
        const ch = guild.channels.cache.get(s.channels.briefing);
        if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      }
      for (const task of Object.values(s.tasks)) {
        if (task.done || !task.dueAt || task.reminded || task.dueAt - Date.now() > 30 * 60 * 1000) continue;
        task.reminded = true;
        saveDB();
        const ch = guild.channels.cache.get(s.channels.tasks);
        if (ch) await ch.send(`⏰ <@${task.assigneeId}> Aufgabe **${task.id}** ist bald fällig: ${task.text}`).catch(() => {});
      }

      // Automatic mod activity check: only once per day and never based on chat-message spam.
      const roleId = guildData(guild.id).supportRoleId;
      const role = roleId && guild.roles.cache.get(roleId);
      if (role) {
        for (const member of role.members.values()) {
          if (member.user.bot || member.id === OWNER_ID) continue;
          const a = s.activity[member.id];
          const lastAction = a?.actions?.length ? Math.max(...a.actions.map(x => x.at)) : (member.joinedTimestamp || Date.now());
          if (Date.now() - lastAction < 14 * DAY_MS) continue;
          if (Date.now() - Number(s.inactivityNotified[member.id] || 0) < 7 * DAY_MS) continue;
          s.inactivityNotified[member.id] = Date.now();
          saveDB();
          await alertStaff(guild, "📉 Staff inactivity check", `<@${member.id}> has had no recorded staff action for **14+ days**. This is an activity signal only, not an automatic judgment.`, true);
        }
      }
    }
  }

  async function askStaffAI(guild, question) {
    const ai = await getGeminiClient();
    if (!ai) throw new Error("GEMINI_NOT_CONFIGURED");
    const s = ensureGuild(guild.id);
    const openCases = Object.values(s.cases).filter(c => c.status !== "closed").slice(-20).map(c => ({ id: c.id, userId: c.userId, type: c.type, summary: c.summary, status: c.status }));
    let knowledge = [];
    try { knowledge = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "data", "staff_knowledge.json"), "utf8")); } catch {}
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: `${question}\n\nServer staff knowledge base:\n${JSON.stringify(knowledge).slice(0, 8000)}\n\nOpen case context:\n${JSON.stringify(openCases)}`,
      config: {
        systemInstruction: `You are the internal staff assistant for ${BOT_NAME}. Answer practical questions about Discord moderation workflow, support consistency, cases and server operations. You may summarize evidence and suggest what a moderator should check next, but do not independently decide guilt, bans, appeals, or staff discipline. Be concise, neutral and in the user's language. Never reveal tokens or secrets.`,
        maxOutputTokens: 1200
      }
    });
    return String(response.text || "No answer");
  }

  async function handleInteraction(interaction) {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (!id.startsWith("mediation_")) return false;
      const [, action, disputeId] = id.match(/^mediation_(yes|no|resolved|close):(.+)$/) || [];
      if (!action || !disputeId) return false;
      const s = ensureGuild(interaction.guild.id);
      const dispute = s.disputes[disputeId];
      if (!dispute || !dispute.participants.includes(interaction.user.id)) {
        await interaction.reply({ content: "❌ Dieser Schlichtungsfall gehört nicht zu dir.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      if (dispute.status === "closed") {
        await interaction.reply({ content: "ℹ️ Dieser Schlichtungsfall ist bereits beendet.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      if (action === "yes" || action === "no") {
        dispute.votes[interaction.user.id] = action;
        saveDB();
        if (action === "yes") {
          await createMediationChannel(interaction.guild, dispute);
          await interaction.reply({ content: `✅ Private AI-Schlichtung gestartet: <#${dispute.channelId}>`, flags: MessageFlags.Ephemeral });
          return true;
        }
        const votes = dispute.participants.map(uid => dispute.votes[uid]);
        if (votes.every(v => v === "no")) {
          dispute.status = "closed"; dispute.closedAt = Date.now(); dispute.outcome = "both-declined";
          saveDB();
          await interaction.reply({ content: `⚠️ Beide haben die Schlichtung abgelehnt. Nach der Regel dieses Bots folgt für beide ein **${disputeDeclineTimeoutMin}-Minuten-Timeout**.`, flags: MessageFlags.Ephemeral });
          await timeoutBothForDispute(interaction.guild, dispute, disputeDeclineTimeoutMin, "AI mediation declined by both sides after detected mutual escalation");
          return true;
        }
        await interaction.reply({ content: "ℹ️ Deine Antwort wurde gespeichert. Wenn die andere Person **Ja** wählt, startet trotzdem die private Schlichtung.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (action === "resolved") {
        dispute.resolutionVotes[interaction.user.id] = true;
        delete dispute.closeVotes[interaction.user.id];
        saveDB();
        const all = dispute.participants.every(uid => dispute.resolutionVotes[uid]);
        if (!all) {
          await interaction.reply({ content: "✅ Du hast 'Streit gelöst' gewählt. Die andere Person muss ebenfalls bestätigen.", flags: MessageFlags.Ephemeral });
          return true;
        }
        dispute.status = "closed"; dispute.closedAt = Date.now(); dispute.outcome = "resolved";
        saveDB();
        await interaction.reply({ content: `✅ Beide bestätigen die Lösung. Wie festgelegt bekommen beide jetzt **${disputeResolvedTimeoutMin} Minuten Cooldown-Timeout**.`, flags: MessageFlags.Ephemeral });
        await timeoutBothForDispute(interaction.guild, dispute, disputeResolvedTimeoutMin, "Dispute resolved – cooling-off timeout");
        setTimeout(() => interaction.channel.delete("Resolved AI mediation").catch(() => {}), 5000);
        return true;
      }
      if (action === "close") {
        dispute.closeVotes[interaction.user.id] = true;
        delete dispute.resolutionVotes[interaction.user.id];
        saveDB();
        const all = dispute.participants.every(uid => dispute.closeVotes[uid]);
        if (!all) {
          await interaction.reply({ content: "❌ Du hast 'Close – ungelöst' gewählt. Die andere Person muss ebenfalls bestätigen.", flags: MessageFlags.Ephemeral });
          return true;
        }
        dispute.status = "closed"; dispute.closedAt = Date.now(); dispute.outcome = "failed";
        saveDB();
        await interaction.reply({ content: `❌ Beide schließen den Streit als ungelöst. Beide bekommen **${disputeFailedTimeoutMin} Minuten Timeout**.`, flags: MessageFlags.Ephemeral });
        await timeoutBothForDispute(interaction.guild, dispute, disputeFailedTimeoutMin, "AI mediation closed unresolved by both sides");
        setTimeout(() => interaction.channel.delete("Unresolved AI mediation closed").catch(() => {}), 5000);
        return true;
      }
      return true;
    }

    if (!interaction.isChatInputCommand()) return false;
    const managed = ["staffstats", "staffleaderboard", "case", "serverhealth", "staffai", "punishmenthistory", "shift", "stafftask", "staffapplication", "staffbrief", "modassist"];
    if (!managed.includes(interaction.commandName)) return false;
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "❌ Nur für Staff/Moderation.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const guild = interaction.guild;
    const s = ensureGuild(guild.id);

    if (interaction.commandName === "staffstats") {
      const user = interaction.options.getUser("user") || interaction.user;
      const days = interaction.options.getInteger("tage") || 30;
      const st = statsFor(guild.id, user.id, days);
      const embed = footer(new EmbedBuilder().setTitle(`📊 Staff Activity • ${user.username}`).setDescription(`Zeitraum: **${days} Tage**\nEs werden echte Staff-Aktionen gezählt, nicht einfach Chat-Spam.`).addFields(
        { name: "Tickets", value: `Claimed: **${st.ticketsClaimed}**\nClosed: **${st.ticketsClosed}**`, inline: true },
        { name: "Moderation", value: `Timeouts: **${st.timeouts}**\nBans: **${st.bans}**\nCases: **${st.cases}**`, inline: true },
        { name: "Aktivität", value: `Aktive Tage: **${st.activeDays}**\nTasks erledigt: **${st.tasks}**`, inline: true },
        { name: "Ø Ticket-Reaktion", value: st.avgResponseMs == null ? "—" : `**${Math.round(st.avgResponseMs / 60000)} min**`, inline: true }
      ));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.commandName === "staffleaderboard") {
      const days = interaction.options.getInteger("tage") || 30;
      const rows = Object.keys(s.activity).map(uid => ({ uid, st: statsFor(guild.id, uid, days) })).filter(x => x.st.actions > 0).sort((a,b) => staffScore(b.st) - staffScore(a.st)).slice(0, 15);
      const text = rows.length ? rows.map((x, i) => `${i + 1}. <@${x.uid}> — **${x.st.actions} Staff-Aktionen**, ${x.st.activeDays} aktive Tage, ${x.st.ticketsClosed} Tickets geschlossen`).join("\n") : "Noch keine Staff-Aktivität erfasst.";
      await interaction.reply({ embeds: [footer(new EmbedBuilder().setTitle("📈 Staff Activity Overview").setDescription(text + "\n\n*Die Sortierung ist nur nach protokollierter Arbeit, nicht nach persönlicher Qualität.*"))], flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.commandName === "case") {
      const sub = interaction.options.getSubcommand();
      if (sub === "view") {
        const id = interaction.options.getString("id").toUpperCase(); const c = s.cases[id];
        if (!c) { await interaction.reply({ content: "❌ Fall nicht gefunden.", flags: MessageFlags.Ephemeral }); return true; }
        const notes = (c.notes || []).slice(-8).map(n => `• <@${n.by}>: ${n.text}`).join("\n") || "—";
        await interaction.reply({ embeds: [footer(new EmbedBuilder().setTitle(`📁 ${id}`).setDescription(c.summary || "Moderationsfall").addFields(
          { name: "User", value: c.userId ? `<@${c.userId}>` : "—", inline: true }, { name: "Status", value: c.status || "open", inline: true }, { name: "Type", value: c.type || "case", inline: true }, { name: "Notizen", value: notes.slice(0, 1024) }
        ))], flags: MessageFlags.Ephemeral });
        return true;
      }
      if (sub === "user") {
        const user = interaction.options.getUser("user");
        const rows = Object.values(s.cases).filter(c => c.userId === user.id).slice(-20).reverse();
        await interaction.reply({ content: rows.length ? rows.map(c => `**${c.id}** • ${c.status} • ${c.summary || c.type}`).join("\n") : "Keine gespeicherten Fälle.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (sub === "note") {
        const id = interaction.options.getString("id").toUpperCase(); const c = s.cases[id];
        if (!c) { await interaction.reply({ content: "❌ Fall nicht gefunden.", flags: MessageFlags.Ephemeral }); return true; }
        c.notes.push({ at: Date.now(), by: interaction.user.id, text: interaction.options.getString("text") });
        recordAction(guild.id, interaction.user.id, "case", { caseId: id, action: "note" });
        saveDB();
        await interaction.reply({ content: `✅ Notiz zu **${id}** gespeichert.`, flags: MessageFlags.Ephemeral });
        return true;
      }
      if (sub === "summarize") {
        const id = interaction.options.getString("id").toUpperCase(); const c = s.cases[id];
        if (!c) { await interaction.reply({ content: "❌ Fall nicht gefunden.", flags: MessageFlags.Ephemeral }); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const ai = await getGeminiClient(); if (!ai) throw new Error("GEMINI_NOT_CONFIGURED");
          const dispute = c.disputeId ? s.disputes[c.disputeId] : null;
          const material = { case: c, disputeHistory: dispute?.history?.slice(-30) || [] };
          const r = await generateGeminiContent({ model: GEMINI_MODEL, contents: JSON.stringify(material), config: { systemInstruction: "Summarize this Discord moderation case for human staff in German. Include what happened, claims from each side, available evidence, actions already taken, unresolved questions, and what staff should verify next. Do not decide guilt or recommend an automatic punishment.", maxOutputTokens: 1200 } });
          await interaction.editReply(String(r.text || "Keine Zusammenfassung.").slice(0, 1900));
        } catch(e) { await interaction.editReply(e?.message === "GEMINI_NOT_CONFIGURED" ? "⚙️ `GEMINI_API_KEY` fehlt." : "❌ AI-Zusammenfassung fehlgeschlagen."); }
        return true;
      }
      if (sub === "close") {
        const id = interaction.options.getString("id").toUpperCase(); const c = s.cases[id];
        if (!c) { await interaction.reply({ content: "❌ Fall nicht gefunden.", flags: MessageFlags.Ephemeral }); return true; }
        c.status = "closed"; c.closedAt = Date.now(); c.closedBy = interaction.user.id;
        recordAction(guild.id, interaction.user.id, "case", { caseId: id, action: "close" }); saveDB();
        await interaction.reply({ content: `✅ **${id}** geschlossen.`, flags: MessageFlags.Ephemeral });
        return true;
      }
    }

    if (interaction.commandName === "serverhealth") {
      const days = interaction.options.getInteger("tage") || 7;
      const keys = Object.keys(s.health.daily).sort().slice(-days);
      const totals = keys.reduce((acc, k) => { const b = s.health.daily[k]; for (const f of ["messages","joins","leaves","punishments","disputes","tickets"]) acc[f] += Number(b[f] || 0); Object.keys(b.activeUsers || {}).forEach(id => acc.active.add(id)); return acc; }, { messages:0, joins:0, leaves:0, punishments:0, disputes:0, tickets:0, active:new Set() });
      const openCases = Object.values(s.cases).filter(c => c.status !== "closed").length;
      const openTasks = Object.values(s.tasks).filter(t => !t.done).length;
      await interaction.reply({ embeds: [footer(new EmbedBuilder().setTitle("🩺 Server Health").setDescription(`Zeitraum: **${days} Tage**`).addFields(
        { name: "Community", value: `Messages: **${totals.messages}**\nAktive User: **${totals.active.size}**\nJoins/Leaves: **${totals.joins}/${totals.leaves}**`, inline: true },
        { name: "Moderation", value: `Punishments: **${totals.punishments}**\nAI-Streitfälle: **${totals.disputes}**\nOpen cases: **${openCases}**`, inline: true },
        { name: "Operations", value: `Open tasks: **${openTasks}**\nTracked staff: **${Object.keys(s.activity).length}**`, inline: true }
      ))], flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.commandName === "staffai") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try { await interaction.editReply((await askStaffAI(guild, interaction.options.getString("frage"))).slice(0, 1900)); }
      catch (e) { await interaction.editReply(e?.message === "GEMINI_NOT_CONFIGURED" ? "⚙️ `GEMINI_API_KEY` fehlt." : "❌ Staff-AI konnte gerade nicht antworten."); }
      return true;
    }

    if (interaction.commandName === "punishmenthistory") {
      const user = interaction.options.getUser("user");
      const rows = s.punishments.filter(p => p.userId === user.id).slice(-15).reverse();
      const text = rows.length ? rows.map(p => `<t:${Math.floor(p.at/1000)}:R> • **${p.type}** ${p.durationMs ? `(${Math.round(p.durationMs/60000)}m)` : ""} • ${p.reason}`).join("\n") : "Keine gespeicherten Strafen durch diesen Bot.";
      await interaction.reply({ embeds: [footer(new EmbedBuilder().setTitle(`⚖️ Punishment History • ${user.username}`).setDescription(text))], flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.commandName === "shift") {
      const sub = interaction.options.getSubcommand(); const current = s.shifts[interaction.user.id];
      if (sub === "start") {
        if (current?.active) { await interaction.reply({ content: "ℹ️ Deine Schicht läuft bereits.", flags: MessageFlags.Ephemeral }); return true; }
        s.shifts[interaction.user.id] = { active: true, startedAt: Date.now(), actions: 0 }; saveDB();
        await interaction.reply({ content: "🟢 Staff-Schicht gestartet.", flags: MessageFlags.Ephemeral }); return true;
      }
      if (sub === "status") {
        if (!current?.active) { await interaction.reply({ content: "⚪ Keine aktive Schicht.", flags: MessageFlags.Ephemeral }); return true; }
        await interaction.reply({ content: `🟢 Aktiv seit <t:${Math.floor(current.startedAt/1000)}:R> • **${current.actions || 0}** Staff-Aktionen.`, flags: MessageFlags.Ephemeral }); return true;
      }
      if (sub === "end") {
        if (!current?.active) { await interaction.reply({ content: "⚪ Keine aktive Schicht.", flags: MessageFlags.Ephemeral }); return true; }
        const duration = Date.now() - current.startedAt; current.active = false; current.endedAt = Date.now();
        ensureActivity(guild.id, interaction.user.id).shifts.push({ startedAt: current.startedAt, endedAt: current.endedAt, actions: current.actions || 0 }); saveDB();
        await interaction.reply({ content: `🔴 Schicht beendet • **${Math.round(duration/60000)} min** • **${current.actions || 0} Staff-Aktionen**.`, flags: MessageFlags.Ephemeral }); return true;
      }
    }

    if (interaction.commandName === "stafftask") {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") {
        if (!(interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) || interaction.user.id === OWNER_ID)) { await interaction.reply({ content: "❌ Nur Admin/Owner kann Tasks erstellen.", flags: MessageFlags.Ephemeral }); return true; }
        s.taskCounter += 1; const id = `TASK-${String(s.taskCounter).padStart(4,"0")}`; const dur = parseDuration(interaction.options.getString("deadline"));
        s.tasks[id] = { id, text: interaction.options.getString("aufgabe"), assigneeId: interaction.options.getUser("user").id, createdBy: interaction.user.id, createdAt: Date.now(), dueAt: dur ? Date.now()+dur : null, done: false, reminded: false }; saveDB();
        const ch = guild.channels.cache.get(s.channels.tasks); if (ch) await ch.send(`📋 **${id}** • <@${s.tasks[id].assigneeId}>\n${s.tasks[id].text}${s.tasks[id].dueAt ? `\nDeadline: <t:${Math.floor(s.tasks[id].dueAt/1000)}:R>` : ""}`).catch(() => {});
        await interaction.reply({ content: `✅ ${id} erstellt.`, flags: MessageFlags.Ephemeral }); return true;
      }
      if (sub === "list") {
        const rows = Object.values(s.tasks).filter(t => !t.done).slice(-25);
        await interaction.reply({ content: rows.length ? rows.map(t => `**${t.id}** • <@${t.assigneeId}> • ${t.text}${t.dueAt ? ` • <t:${Math.floor(t.dueAt/1000)}:R>` : ""}`).join("\n") : "Keine offenen Staff-Tasks.", flags: MessageFlags.Ephemeral }); return true;
      }
      if (sub === "done") {
        const id = interaction.options.getString("id").toUpperCase(); const t = s.tasks[id];
        if (!t) { await interaction.reply({ content: "❌ Task nicht gefunden.", flags: MessageFlags.Ephemeral }); return true; }
        if (t.assigneeId !== interaction.user.id && !(interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) || interaction.user.id === OWNER_ID)) { await interaction.reply({ content: "❌ Nicht dein Task.", flags: MessageFlags.Ephemeral }); return true; }
        t.done = true; t.doneAt = Date.now(); t.doneBy = interaction.user.id; recordAction(guild.id, interaction.user.id, "task_done", { taskId:id }); saveDB();
        await interaction.reply({ content: `✅ ${id} erledigt.`, flags: MessageFlags.Ephemeral }); return true;
      }
    }

    if (interaction.commandName === "staffapplication") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const text = interaction.options.getString("text");
      try {
        const ai = await getGeminiClient(); if (!ai) throw new Error("GEMINI_NOT_CONFIGURED");
        const r = await generateGeminiContent({ model:GEMINI_MODEL, contents:text, config:{ systemInstruction:"Review this Discord staff application neutrally. Do NOT accept/reject, rank, score, or infer personality. Summarize relevant experience, identify missing/unclear information, flag obvious contradictions or copied/generic phrasing only when supported by the text, and propose 5 interview questions. Answer in German.", maxOutputTokens:1200 } });
        await interaction.editReply(String(r.text || "Keine Analyse.").slice(0,1900));
      } catch(e) { await interaction.editReply(e?.message === "GEMINI_NOT_CONFIGURED" ? "⚙️ `GEMINI_API_KEY` fehlt." : "❌ Review fehlgeschlagen."); }
      return true;
    }

    if (interaction.commandName === "staffbrief") {
      await interaction.reply({ embeds: [await generateBrief(guild, 1, "On-demand Staff Brief")], flags: MessageFlags.Ephemeral }); return true;
    }

    if (interaction.commandName === "modassist") {
      const id = interaction.options.getString("message_id");
      const msg = await interaction.channel.messages.fetch(id).catch(() => null);
      if (!msg) { await interaction.reply({ content:"❌ Nachricht nicht gefunden.", flags:MessageFlags.Ephemeral }); return true; }
      await interaction.deferReply({ flags:MessageFlags.Ephemeral });
      try {
        const result = await classifyModeration(msg);
        await interaction.editReply(result ? `🧠 **AI Moderation Assistant**\n\n${JSON.stringify(result, null, 2).slice(0,1700)}\n\n*Das ist eine Empfehlung/Analyse, keine automatische Schuld- oder Strafentscheidung.*` : "Keine AI-Analyse verfügbar.");
      } catch { await interaction.editReply("❌ Analyse fehlgeschlagen."); }
      return true;
    }

    return false;
  }

  function recordTicketOpened(guildId) {
    dailyBucket(guildId).tickets += 1;
    saveDB();
  }

  return {
    setup,
    setupExistingOnly,
    onMessage,
    onMemberAdd,
    onMemberRemove,
    onMessageDelete,
    handleInteraction,
    recordAction,
    recordPunishment,
    recordTicketOpened,
    auditLog: staffLog,
    createCase,
    scheduledTick,
    generateBrief,
    isStaff
  };
}

module.exports = { buildStaffCommands, createStaffSystem };
