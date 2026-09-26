const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const { GAME_CHOICES, GAME_ROLE_OPTIONS, GAME_ROLE_NAMES, GAME_ROLE_KEYS, gameName } = require("./games");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildCommunityCommands() {
  return [
    new SlashCommandBuilder().setName("profile").setDescription("Zeigt dein Community-Profil.")
      .addUserOption(o => o.setName("user").setDescription("Optional: anderes Mitglied")),
    new SlashCommandBuilder().setName("balance").setDescription("Zeigt deine Community Coins."),
    new SlashCommandBuilder().setName("coinshop").setDescription("Öffnet den Community Coin Shop."),
    new SlashCommandBuilder().setName("quests").setDescription("Zeigt deine Daily Quests."),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Zeigt ein Community-Leaderboard.")
      .addStringOption(o => o.setName("typ").setDescription("Leaderboard").setRequired(true).addChoices(
        { name: "Coins", value: "coins" }, { name: "Level", value: "level" }, { name: "Season XP", value: "season" },
        { name: "Invites", value: "invites" }, { name: "Event Wins", value: "eventwins" }
      )),
    new SlashCommandBuilder().setName("squad").setDescription("Squads / Clans verwalten.")
      .addSubcommand(s => s.setName("create").setDescription("Erstellt ein Squad.").addStringOption(o => o.setName("name").setDescription("Squad-Name").setRequired(true).setMinLength(2).setMaxLength(24)))
      .addSubcommand(s => s.setName("invite").setDescription("Lädt jemanden in dein Squad ein.").addUserOption(o => o.setName("user").setDescription("Mitglied").setRequired(true)))
      .addSubcommand(s => s.setName("join").setDescription("Tritt mit einem Code bei.").addStringOption(o => o.setName("code").setDescription("Squad-Code").setRequired(true)))
      .addSubcommand(s => s.setName("leave").setDescription("Verlässt dein Squad."))
      .addSubcommand(s => s.setName("info").setDescription("Zeigt dein Squad."))
      .addSubcommand(s => s.setName("leaderboard").setDescription("Zeigt die besten Squads.")),
    new SlashCommandBuilder().setName("event").setDescription("Community Events verwalten.")
      .addSubcommand(s => s.setName("create").setDescription("Erstellt ein Community Event.")
        .addStringOption(o => o.setName("name").setDescription("Event-Name").setRequired(true).setMaxLength(60))
        .addStringOption(o => o.setName("spiel").setDescription("Spiel / Multi-Game").setRequired(true).addChoices(...GAME_CHOICES))
        .addStringOption(o => o.setName("typ").setDescription("Event-Typ").setRequired(true).addChoices(
          { name: "Game Night", value: "Game Night" }, { name: "Ranked / Competitive", value: "Ranked / Competitive" },
          { name: "Casual / Chill", value: "Casual / Chill" }, { name: "Hide & Seek", value: "Hide & Seek" },
          { name: "1v1 / Duell", value: "1v1 / Duell" }, { name: "Challenge", value: "Challenge" },
          { name: "Zero Build Night", value: "Zero Build Night" }, { name: "Build Night", value: "Build Night" },
          { name: "Creative Night", value: "Creative Night" }, { name: "Other", value: "Other" }
        ))
        .addIntegerOption(o => o.setName("start_in").setDescription("Start in Minuten").setRequired(true).setMinValue(5).setMaxValue(10080)))
      .addSubcommand(s => s.setName("winner").setDescription("Setzt den Gewinner eines Events.")
        .addStringOption(o => o.setName("id").setDescription("Event-ID").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("Gewinner").setRequired(true)))
      .addSubcommand(s => s.setName("end").setDescription("Beendet ein Event.").addStringOption(o => o.setName("id").setDescription("Event-ID").setRequired(true))),
    new SlashCommandBuilder().setName("events").setDescription("Zeigt den Event-Kalender."),
    new SlashCommandBuilder().setName("poll").setDescription("Erstellt eine Community-Umfrage.")
      .addStringOption(o => o.setName("frage").setDescription("Frage").setRequired(true).setMaxLength(180))
      .addStringOption(o => o.setName("option1").setDescription("Option 1").setRequired(true).setMaxLength(60))
      .addStringOption(o => o.setName("option2").setDescription("Option 2").setRequired(true).setMaxLength(60))
      .addStringOption(o => o.setName("option3").setDescription("Option 3").setMaxLength(60))
      .addStringOption(o => o.setName("option4").setDescription("Option 4").setMaxLength(60)),
    new SlashCommandBuilder().setName("suggest").setDescription("Sendet einen Community-Vorschlag.")
      .addStringOption(o => o.setName("text").setDescription("Dein Vorschlag").setRequired(true).setMaxLength(1000)),
    new SlashCommandBuilder().setName("suggeststatus").setDescription("Ändert den Status eines Vorschlags.")
      .addStringOption(o => o.setName("message_id").setDescription("Discord Nachrichten-ID").setRequired(true))
      .addStringOption(o => o.setName("status").setDescription("Status").setRequired(true).addChoices(
        {name:"Accepted",value:"Accepted"},{name:"Planned",value:"Planned"},{name:"Denied",value:"Denied"},{name:"Review",value:"Under Review"}
      )),
    new SlashCommandBuilder().setName("clip").setDescription("Reicht einen Clip für Clip of the Week ein.")
      .addStringOption(o => o.setName("url").setDescription("Link zum Clip").setRequired(true).setMaxLength(500))
      .addStringOption(o => o.setName("beschreibung").setDescription("Kurze Beschreibung").setMaxLength(300)),
    new SlashCommandBuilder().setName("birthday").setDescription("Geburtstagssystem.")
      .addSubcommand(s => s.setName("set").setDescription("Speichert Monat und Tag, kein Geburtsjahr.")
        .addIntegerOption(o => o.setName("monat").setDescription("1-12").setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption(o => o.setName("tag").setDescription("1-31").setRequired(true).setMinValue(1).setMaxValue(31)))
      .addSubcommand(s => s.setName("remove").setDescription("Entfernt deinen Geburtstag.")),
    new SlashCommandBuilder().setName("roles").setDescription("Öffnet die Self-Role-Auswahl."),
    new SlashCommandBuilder().setName("season").setDescription("Zeigt die aktuelle Community-Season."),
    new SlashCommandBuilder().setName("seasonstart").setDescription("Startet eine neue Community-Season.")
      .addStringOption(o => o.setName("name").setDescription("Season-Name").setRequired(true).setMaxLength(50))
      .addIntegerOption(o => o.setName("tage").setDescription("Dauer in Tagen").setRequired(true).setMinValue(7).setMaxValue(180)),
    new SlashCommandBuilder().setName("fortnite").setDescription("Fortnite News, Shop und Favoriten.")
      .addSubcommand(s => s.setName("news").setDescription("Zeigt aktuelle Fortnite-News."))
      .addSubcommand(s => s.setName("shop").setDescription("Zeigt eine Zusammenfassung des aktuellen Shops."))
      .addSubcommand(s => s.setName("favorite-add").setDescription("Merkt sich einen Skin/Cosmetic-Namen.").addStringOption(o => o.setName("name").setDescription("Cosmetic-Name").setRequired(true).setMaxLength(80)))
      .addSubcommand(s => s.setName("favorite-remove").setDescription("Entfernt einen Favoriten.").addStringOption(o => o.setName("name").setDescription("Cosmetic-Name").setRequired(true).setMaxLength(80)))
      .addSubcommand(s => s.setName("favorites").setDescription("Zeigt deine Shop-Favoriten."))
  ];
}

function createCommunity(ctx) {
  const { client, db, saveDB, guildData, userData, footer, cleanName, findOrCreateCategory, findOrCreateText, findOrCreateRole } = ctx;
  const apiKey = process.env.FORTNITE_API_KEY || "";
  const timezone = process.env.COMMUNITY_TIMEZONE || "Europe/Berlin";

  if (!db.squads) db.squads = {};
  if (!db.events) db.events = {};
  if (!db.polls) db.polls = {};
  if (!db.suggestions) db.suggestions = {};
  if (!db.clips) db.clips = {};

  function ensureGuild(guildId) {
    const gd = guildData(guildId);
    if (!gd.community) gd.community = {};
    const c = gd.community;
    if (!c.channels) c.channels = {};
    if (!c.roles) c.roles = {};
    if (!c.panels) c.panels = {};
    if (!c.starboard) c.starboard = {};
    if (!c.tempVoices) c.tempVoices = [];
    if (!c.settings) c.settings = { starThreshold: 3, newsEnabled: true, shopEnabled: true };
    if (!c.newsState) c.newsState = { hash: null };
    if (!c.shopState) c.shopState = { hash: null };
    if (!c.season) c.season = { number: 1, name: "Community Season 1", startedAt: Date.now(), endsAt: Date.now() + 90 * DAY_MS };
    if (!c.seasonHistory) c.seasonHistory = [];
    if (!c.weekKey) c.weekKey = weekKey();
    return c;
  }

  function ensureUser(guildId, userId) {
    const u = userData(guildId, userId);
    if (!u.community) u.community = {};
    const c = u.community;
    if (typeof c.coins !== "number") c.coins = 0;
    if (typeof c.seasonXp !== "number") c.seasonXp = 0;
    if (typeof c.messages !== "number") c.messages = 0;
    if (typeof c.weeklyActivity !== "number") c.weeklyActivity = 0;
    if (typeof c.eventWins !== "number") c.eventWins = 0;
    if (typeof c.teamsearchCount !== "number") c.teamsearchCount = 0;
    if (!Array.isArray(c.badges)) c.badges = [];
    if (!Array.isArray(c.favorites)) c.favorites = [];
    if (!c.daily) c.daily = { date: dateKey(), progress: {}, claimed: {} };
    if (!c.daily.progress) c.daily.progress = {};
    if (!c.daily.claimed) c.daily.claimed = {};
    return c;
  }

  function dateParts() {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
  }
  function dateKey() { const p = dateParts(); return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`; }
  function weekKey(now = Date.now()) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - sinceMonday);
    return d.toISOString().slice(0, 10);
  }
  function shortId(prefix) { return `${prefix}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2,5)}`.toUpperCase(); }
  function norm(s) { return String(s || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").trim(); }
  function mentionList(ids) { return ids.map(id => `<@${id}>`).join(", ") || "—"; }
  function isManager(member) { return member?.permissions?.has(PermissionsBitField.Flags.ManageGuild) || member?.permissions?.has(PermissionsBitField.Flags.Administrator); }

  function resetDailyIfNeeded(guildId, userId) {
    const c = ensureUser(guildId, userId);
    const today = dateKey();
    if (c.daily.date !== today) c.daily = { date: today, progress: {}, claimed: {} };
    return c;
  }

  const questDefs = [
    { id: "chat5", title: "Community aktiv", text: "Schreibe 5 sinnvolle Nachrichten im Server.", type: "chat", target: 5, coins: 50, seasonXp: 100 },
    { id: "team1", title: "Find a Team", text: "Erstelle 1 Multi-Game-Teamsearch.", type: "teamsearch", target: 1, coins: 75, seasonXp: 150 },
    { id: "party1", title: "Gaming Together", text: "Spiele mindestens 1 Runde/Match mit einem Community-Mitglied. Selbstbestätigung.", type: "self-party", target: 1, coins: 100, seasonXp: 200 }
  ];

  function questProgress(guildId, userId, type, amount = 1) {
    const c = resetDailyIfNeeded(guildId, userId);
    for (const q of questDefs.filter(q => q.type === type)) {
      c.daily.progress[q.id] = Math.min(q.target, (c.daily.progress[q.id] || 0) + amount);
    }
    saveDB();
  }

  async function awardBadge(guildId, userId, badge, channel = null) {
    const c = ensureUser(guildId, userId);
    if (c.badges.includes(badge)) return false;
    c.badges.push(badge);
    saveDB();
    if (channel) await channel.send(`🏅 <@${userId}> hat das Badge **${badge}** freigeschaltet!`).catch(() => {});
    return true;
  }

  async function checkAchievements(messageOrGuild, userId, channel = null) {
    const guildId = messageOrGuild.id || messageOrGuild.guild?.id;
    if (!guildId) return;
    const c = ensureUser(guildId, userId);
    if (c.messages >= 1) await awardBadge(guildId, userId, "First Steps", channel);
    if (c.messages >= 50) await awardBadge(guildId, userId, "Chat Starter", channel);
    if (c.messages >= 250) await awardBadge(guildId, userId, "Community Regular", channel);
    if (c.teamsearchCount >= 5) await awardBadge(guildId, userId, "Squad Finder", channel);
    if (c.teamsearchCount >= 25) await awardBadge(guildId, userId, "Teamsearch Legend", channel);
    if (c.coins >= 1000) await awardBadge(guildId, userId, "Coin Collector", channel);
    if (c.eventWins >= 1) await awardBadge(guildId, userId, "Event Winner", channel);
  }

  async function findOrCreateVoice(guild, name, parent, permissionOverwrites) {
    let c = guild.channels.cache.find(ch => ch.type === ChannelType.GuildVoice && cleanName(ch.name) === cleanName(name));
    if (!c) c = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parent?.id, permissionOverwrites });
    return c;
  }

  async function upsertPanel(channel, c, key, payload) {
    const oldId = c.panels[key];
    if (oldId) {
      const old = await channel.messages.fetch(oldId).catch(() => null);
      if (old) { await old.edit(payload).catch(() => {}); return old; }
    }
    const msg = await channel.send(payload);
    c.panels[key] = msg.id;
    saveDB();
    return msg;
  }

  async function setup(guild) {
    const c = ensureGuild(guild.id);
    const communityCat = await findOrCreateCategory(guild, "GAMING • COMMUNITY");
    const eventCat = await findOrCreateCategory(guild, "GAMING • EVENTS");
    const squadCat = await findOrCreateCategory(guild, "GAMING • SQUADS");
    const voiceCat = await findOrCreateCategory(guild, "GAMING • VOICE");

    const channelSpecs = [
      ["welcome", "welcome", communityCat], ["quests", "daily-quests", communityCat], ["coinShop", "coin-shop", communityCat],
      ["roles", "choose-roles", communityCat], ["suggestions", "suggestions", communityCat], ["starboard", "best-moments", communityCat],
      ["clips", "clip-of-the-week", communityCat], ["birthdays", "birthdays", communityCat], ["news", "fortnite-news", communityCat],
      ["itemShop", "item-shop", communityCat], ["events", "events", eventCat],
      ["squads", "squad-hub", squadCat]
    ];
    for (const [key, name, parent] of channelSpecs) c.channels[key] = (await findOrCreateText(guild, name, parent)).id;

    const roleNames = {
      ...GAME_ROLE_NAMES,
      build: "Build Mode", zeroBuild: "Zero Build", casual: "Casual", competitive: "Competitive", ranked: "Ranked", chill: "Chill", roleplay: "Roleplay", creative: "Creative",
      pc: "PC", playstation: "PlayStation", xbox: "Xbox", switch: "Switch", mobile: "Mobile", eu: "EU", nae: "NA East",
      nac: "NA Central", naw: "NA West", oce: "OCE", asia: "Asia", middleeast: "Middle East", brazil: "Brazil",
      eventPing: "Event Pings", newsPing: "Fortnite News", shopPing: "Fortnite Item Shop", birthday: "Birthday",
      memberWeek: "Member of the Week", vip: "Community VIP"
    };
    for (const [key, name] of Object.entries(roleNames)) {
      const r = await findOrCreateRole(guild, name); if (r) c.roles[key] = r.id;
    }

    const createVoice = await findOrCreateVoice(guild, "➕ Create Squad", voiceCat);
    c.channels.createVoice = createVoice.id;
    c.channels.voiceCategory = voiceCat.id;

    const questsCh = guild.channels.cache.get(c.channels.quests);
    await upsertPanel(questsCh, c, "quests", { embeds: [footer(new EmbedBuilder().setTitle("🎯 Daily Quests").setDescription("Verdiene **Community Coins** und **Season XP**. Nutze `/quests`, um deinen Fortschritt und Claim-Buttons zu sehen.\n\n• 5 sinnvolle Nachrichten\n• 1 Multi-Game-Teamsearch erstellen\n• 1 Runde/Match mit einem Community-Mitglied (Selbstbestätigung)"))] });

    const shopCh = guild.channels.cache.get(c.channels.coinShop);
    await upsertPanel(shopCh, c, "coinShop", { embeds: [footer(new EmbedBuilder().setTitle("🪙 Community Coin Shop").setDescription("Coins bekommst du durch Aktivität, Quests, Teamsearch und Events. Nutze `/coinshop` zum Kaufen.\n\nBelohnungen sind kosmetisch und geben keine Moderationsrechte oder Spielvorteile."))] });

    const rolesCh = guild.channels.cache.get(c.channels.roles);
    await upsertPanel(rolesCh, c, "roles", { embeds: [footer(new EmbedBuilder().setTitle("🎭 Self Roles").setDescription("Nutze `/roles` und wähle deine Games, Plattform, Spielstil, Region und Benachrichtigungen."))] });

    const squadsCh = guild.channels.cache.get(c.channels.squads);
    await upsertPanel(squadsCh, c, "squads", { embeds: [footer(new EmbedBuilder().setTitle("🛡️ Squads / Clans").setDescription("Erstelle dein eigenes Squad mit `/squad create`. Lade Mitglieder ein, sammle Punkte durch Community-Erfolge und steige im Squad-Leaderboard."))] });

    const eventsCh = guild.channels.cache.get(c.channels.events);
    await upsertPanel(eventsCh, c, "events", { embeds: [footer(new EmbedBuilder().setTitle("📅 Community Events").setDescription("Game Nights, Roblox-/Brawl-/GTA-/Fortnite-Events und andere Challenges erscheinen hier. Nutze `/events` für den Kalender."))] });

    saveDB();
    return c;
  }

  async function onMessage(message) {
    if (!message.guild || message.author.bot) return;
    if (message.channel?.topic?.startsWith("ticket-owner:")) return;
    const c = ensureUser(message.guild.id, message.author.id);
    const now = Date.now();
    c.messages += 1;
    if (!c.lastCoinAt || now - c.lastCoinAt >= 60_000) {
      c.lastCoinAt = now;
      c.coins += 2;
      c.seasonXp += 2;
      c.weeklyActivity += 1;
      questProgress(message.guild.id, message.author.id, "chat", 1);
    }
    await checkAchievements(message.guild, message.author.id, message.channel);
    saveDB();
  }

  async function onMemberAdd(member) {
    const c = ensureGuild(member.guild.id);
    const ch = member.guild.channels.cache.get(c.channels.welcome);
    if (!ch) return;
    const embed = footer(new EmbedBuilder().setTitle(`👋 Willkommen, ${member.user.username}!`).setDescription(`Schön, dass du da bist, ${member}.\n\n🎮 Mitspieler: \`/teamsearch\`\n🎯 Daily Quests: \`/quests\`\n🪙 Coins: \`/balance\`\n🏅 Profil: \`/profile\`\n🎭 Rollen: \`/roles\`\n🎫 Hilfe: im Support-Kanal`));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("welcome_roles").setLabel("Choose Roles").setEmoji("🎭").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("welcome_quests").setLabel("Daily Quests").setEmoji("🎯").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("welcome_support").setLabel("Support").setEmoji("🎫").setStyle(ButtonStyle.Secondary)
    );
    await ch.send({ content: `${member}`, embeds: [embed], components: [row] }).catch(() => {});
  }

  async function onVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const c = ensureGuild(guild.id);
    if (newState.channelId && newState.channelId === c.channels.createVoice && newState.member) {
      const parent = guild.channels.cache.get(c.channels.voiceCategory);
      const voice = await guild.channels.create({ name: `🔊 ${newState.member.user.username}'s Squad`, type: ChannelType.GuildVoice, parent: parent?.id });
      c.tempVoices.push(voice.id); saveDB();
      await newState.setChannel(voice).catch(() => {});
    }
    if (oldState.channelId && c.tempVoices.includes(oldState.channelId)) {
      const old = guild.channels.cache.get(oldState.channelId);
      if (old && old.members.size === 0) {
        c.tempVoices = c.tempVoices.filter(id => id !== old.id); saveDB();
        await old.delete("Temporary squad voice empty").catch(() => {});
      }
    }
  }

  async function onReactionAdd(reaction, user) {
    if (user.bot) return;
    try { if (reaction.partial) await reaction.fetch(); } catch { return; }
    const msg = reaction.message;
    if (!msg.guild || reaction.emoji.name !== "⭐") return;
    const c = ensureGuild(msg.guild.id);
    if ((reaction.count || 0) < (c.settings.starThreshold || 3)) return;
    const starCh = msg.guild.channels.cache.get(c.channels.starboard);
    if (!starCh || msg.channel.id === starCh.id) return;
    const embed = footer(new EmbedBuilder().setTitle("⭐ Best Moment").setDescription(msg.content?.slice(0, 3500) || "*(Anhang / Embed)*").addFields({name:"Von",value:`${msg.author}`,inline:true},{name:"Stars",value:String(reaction.count),inline:true},{name:"Original",value:`[Zur Nachricht](${msg.url})`}).setTimestamp(msg.createdAt));
    const image = [...msg.attachments.values()].find(a => (a.contentType || "").startsWith("image/"));
    if (image) embed.setImage(image.url);
    const oldId = c.starboard[msg.id];
    if (oldId) {
      const old = await starCh.messages.fetch(oldId).catch(() => null); if (old) return old.edit({embeds:[embed]}).catch(() => {});
    }
    const star = await starCh.send({embeds:[embed]}); c.starboard[msg.id] = star.id; saveDB();
  }

  function profileEmbed(guild, user) {
    const base = userData(guild.id, user.id); const c = ensureUser(guild.id, user.id);
    const squad = c.squadId && db.squads[c.squadId];
    const season = ensureGuild(guild.id).season;
    const badges = c.badges.slice(-12).join(" • ") || "Noch keine";
    return footer(new EmbedBuilder().setTitle(`🏅 ${user.username} — Community Profile`).setThumbnail(user.displayAvatarURL()).addFields(
      {name:"Level",value:String(base.level || 0),inline:true},{name:"XP",value:String(base.xp || 0),inline:true},{name:"🪙 Coins",value:String(c.coins),inline:true},
      {name:`🌟 ${season.name} XP`,value:String(c.seasonXp),inline:true},{name:"🎉 Event Wins",value:String(c.eventWins),inline:true},
      {name:"🎮 Teamsearches",value:String(c.teamsearchCount),inline:true},{name:"📨 Invites",value:String(base.invites || 0),inline:true},{name:"🛡️ Squad",value:squad ? squad.name : "Keins",inline:true},
      {name:"Badges",value:badges}
    ));
  }

  function questEmbed(guildId, userId) {
    const c = resetDailyIfNeeded(guildId, userId);
    const lines = questDefs.map(q => {
      const p = c.daily.progress[q.id] || 0; const claimed = !!c.daily.claimed[q.id];
      return `${claimed ? "✅" : p >= q.target ? "🟡" : "⬜"} **${q.title}** — ${Math.min(p,q.target)}/${q.target}\n${q.text}\nReward: **${q.coins} Coins + ${q.seasonXp} Season XP**`;
    });
    return footer(new EmbedBuilder().setTitle(`🎯 Daily Quests — ${c.daily.date}`).setDescription(lines.join("\n\n")));
  }

  function questButtons(guildId, userId) {
    const c = resetDailyIfNeeded(guildId, userId);
    const buttons = [];
    for (const q of questDefs) {
      const p = c.daily.progress[q.id] || 0; const done = p >= q.target;
      if (q.type === "self-party" && !done) buttons.push(new ButtonBuilder().setCustomId(`quest_self:${q.id}`).setLabel("Gaming Together bestätigen").setEmoji("🎮").setStyle(ButtonStyle.Primary));
      else if (done && !c.daily.claimed[q.id]) buttons.push(new ButtonBuilder().setCustomId(`quest_claim:${q.id}`).setLabel(`${q.title} claimen`).setEmoji("🎁").setStyle(ButtonStyle.Success));
    }
    return buttons.length ? [new ActionRowBuilder().addComponents(buttons.slice(0,5))] : [];
  }

  async function claimQuest(interaction, qid) {
    const q = questDefs.find(x => x.id === qid); if (!q) return interaction.reply({content:"Quest nicht gefunden.",ephemeral:true});
    const c = resetDailyIfNeeded(interaction.guild.id, interaction.user.id);
    if ((c.daily.progress[q.id] || 0) < q.target) return interaction.reply({content:"❌ Diese Quest ist noch nicht fertig.",ephemeral:true});
    if (c.daily.claimed[q.id]) return interaction.reply({content:"✅ Schon abgeholt.",ephemeral:true});
    c.daily.claimed[q.id] = true; c.coins += q.coins; c.seasonXp += q.seasonXp; saveDB();
    await checkAchievements(interaction.guild, interaction.user.id, interaction.channel);
    return interaction.update({embeds:[questEmbed(interaction.guild.id,interaction.user.id)],components:questButtons(interaction.guild.id,interaction.user.id)});
  }

  const shopItems = {
    "badge-crown": { name:"Victory Crown Badge", price:500, badge:"Victory Crown" },
    "badge-storm": { name:"Storm Survivor Badge", price:800, badge:"Storm Survivor" },
    "badge-squad": { name:"Squad Legend Badge", price:1200, badge:"Squad Legend" },
    "badge-clutch": { name:"Clutch Master Badge", price:500, badge:"Clutch Master" },
    "badge-grinder": { name:"Game Grinder Badge", price:800, badge:"Game Grinder" },
    "vip-role": { name:"Community VIP Role", price:2000, role:"vip" }
  };

  function coinShopEmbed() {
    return footer(new EmbedBuilder().setTitle("🪙 Community Coin Shop").setDescription(Object.entries(shopItems).map(([id,x]) => `**${x.name}** — ${x.price} Coins`).join("\n") + "\n\nNur kosmetische Community-Belohnungen."));
  }
  function coinShopRows() {
    const buttons = Object.entries(shopItems).map(([id,x]) => new ButtonBuilder().setCustomId(`coinbuy:${id}`).setLabel(`${x.name} • ${x.price}`).setStyle(ButtonStyle.Primary));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
  }

  async function buyItem(interaction, id) {
    const item = shopItems[id]; if (!item) return interaction.reply({content:"Item nicht gefunden.",ephemeral:true});
    const c = ensureUser(interaction.guild.id, interaction.user.id);
    if (c.coins < item.price) return interaction.reply({content:`❌ Du brauchst ${item.price} Coins, hast aber ${c.coins}.`,ephemeral:true});
    if (item.badge && c.badges.includes(item.badge)) return interaction.reply({content:"✅ Dieses Badge besitzt du schon.",ephemeral:true});
    if (item.role) {
      const rid = ensureGuild(interaction.guild.id).roles[item.role];
      if (rid && interaction.member.roles.cache.has(rid)) return interaction.reply({content:"✅ Diese Rolle besitzt du schon.",ephemeral:true});
      if (rid) await interaction.member.roles.add(rid).catch(() => {});
    }
    if (item.badge) c.badges.push(item.badge);
    c.coins -= item.price; saveDB();
    return interaction.reply({content:`✅ Gekauft: **${item.name}**. Neuer Kontostand: **${c.coins} Coins**.`,ephemeral:true});
  }

  function squadOf(guildId,userId) { const c = ensureUser(guildId,userId); return c.squadId ? db.squads[c.squadId] : null; }
  function squadByCode(guildId, code) { return Object.values(db.squads).find(s => s.guildId===guildId && s.code===String(code).toUpperCase()); }
  function makeSquadCode() { return Math.random().toString(36).slice(2,8).toUpperCase(); }
  async function handleSquad(interaction) {
    const sub = interaction.options.getSubcommand(); const gid = interaction.guild.id; const uc = ensureUser(gid,interaction.user.id);
    if (sub === "create") {
      if (uc.squadId && db.squads[uc.squadId]) return interaction.reply({content:"❌ Du bist bereits in einem Squad.",ephemeral:true});
      const name = interaction.options.getString("name").trim();
      if (Object.values(db.squads).some(s => s.guildId===gid && norm(s.name)===norm(name))) return interaction.reply({content:"❌ Dieser Squad-Name existiert schon.",ephemeral:true});
      const id = shortId("S"); const squad = {id,guildId:gid,name,ownerId:interaction.user.id,code:makeSquadCode(),members:[interaction.user.id],points:0,wins:0,createdAt:Date.now()};
      db.squads[id]=squad; uc.squadId=id; saveDB();
      return interaction.reply(`🛡️ Squad **${name}** erstellt. Join-Code: **${squad.code}**`);
    }
    const squad = squadOf(gid,interaction.user.id);
    if (sub === "join") {
      if (squad) return interaction.reply({content:"❌ Verlasse zuerst dein aktuelles Squad.",ephemeral:true});
      const target=squadByCode(gid,interaction.options.getString("code")); if(!target) return interaction.reply({content:"❌ Code nicht gefunden.",ephemeral:true});
      if(target.members.length>=20) return interaction.reply({content:"❌ Squad ist voll.",ephemeral:true});
      target.members.push(interaction.user.id); uc.squadId=target.id; saveDB(); return interaction.reply(`✅ Du bist **${target.name}** beigetreten.`);
    }
    if (sub === "leaderboard") {
      const rows=Object.values(db.squads).filter(s=>s.guildId===gid).sort((a,b)=>b.points-a.points).slice(0,10).map((s,i)=>`${i+1}. **${s.name}** — ${s.points} Punkte • ${s.members.length} Member`).join("\n")||"Noch keine Squads.";
      return interaction.reply({embeds:[footer(new EmbedBuilder().setTitle("🛡️ Squad Leaderboard").setDescription(rows))]});
    }
    if (!squad) return interaction.reply({content:"❌ Du bist in keinem Squad.",ephemeral:true});
    if (sub === "invite") {
      if(squad.ownerId!==interaction.user.id) return interaction.reply({content:"❌ Nur der Squad-Owner kann einladen.",ephemeral:true});
      const user=interaction.options.getUser("user");
      await user.send(`🛡️ Du wurdest in **${squad.name}** auf **${interaction.guild.name}** eingeladen. Nutze \`/squad join code:${squad.code}\`.`).catch(()=>{});
      return interaction.reply({content:`✅ Einladung an ${user} gesendet. Code: **${squad.code}**`,ephemeral:true});
    }
    if (sub === "leave") {
      squad.members=squad.members.filter(id=>id!==interaction.user.id); uc.squadId=null;
      if(!squad.members.length) delete db.squads[squad.id]; else if(squad.ownerId===interaction.user.id) squad.ownerId=squad.members[0];
      saveDB(); return interaction.reply("↩️ Du hast dein Squad verlassen.");
    }
    if (sub === "info") return interaction.reply({embeds:[footer(new EmbedBuilder().setTitle(`🛡️ ${squad.name}`).addFields({name:"Owner",value:`<@${squad.ownerId}>`,inline:true},{name:"Punkte",value:String(squad.points),inline:true},{name:"Wins",value:String(squad.wins),inline:true},{name:"Member",value:mentionList(squad.members)},{name:"Join-Code",value:squad.ownerId===interaction.user.id?`||${squad.code}||`:"Nur für Owner"}))],ephemeral:true});
  }

  function eventEmbed(e) { return footer(new EmbedBuilder().setTitle(`🎉 ${e.name}`).setDescription(`**Spiel:** ${e.game || "Community / Multi-Game"}\n**Typ:** ${e.type}\n**Start:** <t:${Math.floor(e.startAt/1000)}:F> (<t:${Math.floor(e.startAt/1000)}:R>)\n**Teilnehmer:** ${e.participants.length}\n**Event-ID:** \`${e.id}\``)); }
  function eventRows(e) { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`event_join:${e.id}`).setLabel("Join").setEmoji("✅").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`event_leave:${e.id}`).setLabel("Leave").setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`event_remind:${e.id}`).setLabel("Remind me").setEmoji("⏰").setStyle(ButtonStyle.Primary))]; }
  async function handleEvent(interaction) {
    const sub=interaction.options.getSubcommand(); const gid=interaction.guild.id; const c=ensureGuild(gid);
    if(!isManager(interaction.member)) return interaction.reply({content:"❌ Dafür brauchst du Server verwalten.",ephemeral:true});
    if(sub==="create"){
      const id=shortId("E"); const gameKey=interaction.options.getString("spiel"); const e={id,guildId:gid,name:interaction.options.getString("name"),gameKey,game:gameName(gameKey),type:interaction.options.getString("typ"),startAt:Date.now()+interaction.options.getInteger("start_in")*60000,participants:[],rewarded:[],winners:[],reminders:[],reminded:false,started:false,ended:false,hostId:interaction.user.id}; db.events[id]=e; saveDB();
      const ch=interaction.guild.channels.cache.get(c.channels.events)||interaction.channel; const m=await ch.send({embeds:[eventEmbed(e)],components:eventRows(e)}); e.messageId=m.id;e.channelId=ch.id;saveDB();return interaction.reply({content:`✅ Event **${e.name}** erstellt: ${ch}`,ephemeral:true});
    }
    const id=interaction.options.getString("id"); const e=db.events[id]; if(!e||e.guildId!==gid) return interaction.reply({content:"❌ Event nicht gefunden.",ephemeral:true});
    if(sub==="winner"){
      const user=interaction.options.getUser("user"); e.winners=e.winners||[]; if(e.winners.includes(user.id)) return interaction.reply({content:"❌ Dieser Nutzer wurde für dieses Event bereits als Gewinner belohnt.",ephemeral:true}); e.winners.push(user.id); const uc=ensureUser(gid,user.id); uc.eventWins+=1; uc.coins+=200; uc.seasonXp+=300; const sq=squadOf(gid,user.id); if(sq){sq.points+=10;sq.wins+=1;} saveDB(); await awardBadge(gid,user.id,"Event Winner",interaction.channel); return interaction.reply(`🏆 ${user} gewinnt **${e.name}** und erhält **200 Coins + 300 Season XP**.`);
    }
    if(sub==="end"){e.ended=true;saveDB();return interaction.reply(`⛔ Event **${e.name}** beendet.`);}
  }

  async function handlePoll(interaction){
    const opts=[1,2,3,4].map(i=>interaction.options.getString(`option${i}`)).filter(Boolean);const embed=footer(new EmbedBuilder().setTitle("📊 Community Poll").setDescription(`**${interaction.options.getString("frage")}**\n\n${opts.map((x,i)=>`${i+1}. ${x} — **0**`).join("\n")}`));
    const row=new ActionRowBuilder().addComponents(opts.map((x,i)=>new ButtonBuilder().setCustomId(`poll_vote:PENDING:${i}`).setLabel(String(i+1)).setStyle(ButtonStyle.Primary)));
    const m=await interaction.channel.send({embeds:[embed],components:[row]});db.polls[m.id]={guildId:interaction.guild.id,channelId:m.channel.id,messageId:m.id,question:interaction.options.getString("frage"),options:opts,votes:{}};saveDB();const fixed=new ActionRowBuilder().addComponents(opts.map((x,i)=>new ButtonBuilder().setCustomId(`poll_vote:${m.id}:${i}`).setLabel(String(i+1)).setStyle(ButtonStyle.Primary)));await m.edit({components:[fixed]});return interaction.reply({content:"✅ Poll erstellt.",ephemeral:true});
  }
  async function updatePoll(interaction,id,index){const p=db.polls[id];if(!p)return interaction.reply({content:"Poll nicht gefunden.",ephemeral:true});p.votes[interaction.user.id]=Number(index);const counts=p.options.map((_,i)=>Object.values(p.votes).filter(v=>v===i).length);saveDB();const embed=footer(new EmbedBuilder().setTitle("📊 Community Poll").setDescription(`**${p.question}**\n\n${p.options.map((x,i)=>`${i+1}. ${x} — **${counts[i]}**`).join("\n")}\n\n${Object.keys(p.votes).length} Votes`));await interaction.message.edit({embeds:[embed]});return interaction.reply({content:`✅ Stimme für **${p.options[index]}** gespeichert.`,ephemeral:true});}

  async function handleSuggestion(interaction){const c=ensureGuild(interaction.guild.id),ch=interaction.guild.channels.cache.get(c.channels.suggestions)||interaction.channel;const s={guildId:interaction.guild.id,userId:interaction.user.id,text:interaction.options.getString("text"),up:[],down:[],status:"Under Review"};const embed=footer(new EmbedBuilder().setTitle("💡 Community Suggestion").setDescription(s.text).addFields({name:"Von",value:`${interaction.user}`,inline:true},{name:"Status",value:s.status,inline:true},{name:"Votes",value:"👍 0 • 👎 0",inline:true}));const m=await ch.send({embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("sug_up:PENDING").setLabel("👍 0").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("sug_down:PENDING").setLabel("👎 0").setStyle(ButtonStyle.Danger))]});s.messageId=m.id;s.channelId=ch.id;db.suggestions[m.id]=s;saveDB();await m.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sug_up:${m.id}`).setLabel("👍 0").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`sug_down:${m.id}`).setLabel("👎 0").setStyle(ButtonStyle.Danger))]});return interaction.reply({content:`✅ Vorschlag gepostet: ${m.url}`,ephemeral:true});}
  async function refreshSuggestion(s,guild){const ch=guild.channels.cache.get(s.channelId),m=ch&&await ch.messages.fetch(s.messageId).catch(()=>null);if(!m)return;const embed=footer(new EmbedBuilder().setTitle("💡 Community Suggestion").setDescription(s.text).addFields({name:"Von",value:`<@${s.userId}>`,inline:true},{name:"Status",value:s.status,inline:true},{name:"Votes",value:`👍 ${s.up.length} • 👎 ${s.down.length}`,inline:true}));const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sug_up:${s.messageId}`).setLabel(`👍 ${s.up.length}`).setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`sug_down:${s.messageId}`).setLabel(`👎 ${s.down.length}`).setStyle(ButtonStyle.Danger));await m.edit({embeds:[embed],components:[row]});}

  async function handleClip(interaction){const c=ensureGuild(interaction.guild.id),ch=interaction.guild.channels.cache.get(c.channels.clips)||interaction.channel;const clip={guildId:interaction.guild.id,userId:interaction.user.id,url:interaction.options.getString("url"),description:interaction.options.getString("beschreibung")||"",votes:[],week:weekKey(),createdAt:Date.now()};const m=await ch.send({embeds:[footer(new EmbedBuilder().setTitle("🎬 Clip of the Week Entry").setDescription(`${clip.description||"Community Clip"}\n\n${clip.url}`).addFields({name:"Von",value:`${interaction.user}`,inline:true},{name:"Votes",value:"0",inline:true}))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("clip_vote:PENDING").setLabel("Vote").setEmoji("🔥").setStyle(ButtonStyle.Primary))]});clip.messageId=m.id;clip.channelId=ch.id;db.clips[m.id]=clip;saveDB();await m.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`clip_vote:${m.id}`).setLabel("Vote • 0").setEmoji("🔥").setStyle(ButtonStyle.Primary))]});return interaction.reply({content:`✅ Clip eingereicht: ${m.url}`,ephemeral:true});}

  function selfRoleRows(guildId){ensureGuild(guildId);return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("roles_games").setPlaceholder("Deine Games").setMinValues(1).setMaxValues(Math.min(10,GAME_ROLE_OPTIONS.length)).addOptions(GAME_ROLE_OPTIONS)),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("roles_platform").setPlaceholder("Plattform").setMinValues(1).setMaxValues(3).addOptions([{label:"PC",value:"pc"},{label:"PlayStation",value:"playstation"},{label:"Xbox",value:"xbox"},{label:"Switch",value:"switch"},{label:"Mobile",value:"mobile"}])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("roles_mode").setPlaceholder("Modus / Spielstil").setMinValues(1).setMaxValues(4).addOptions([{label:"Build Mode",value:"build"},{label:"Zero Build",value:"zeroBuild"},{label:"Casual",value:"casual"},{label:"Competitive",value:"competitive"},{label:"Ranked",value:"ranked"},{label:"Chill",value:"chill"},{label:"Roleplay",value:"roleplay"},{label:"Creative",value:"creative"}])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("roles_region").setPlaceholder("Region").addOptions([{label:"EU",value:"eu"},{label:"NA East",value:"nae"},{label:"NA Central",value:"nac"},{label:"NA West",value:"naw"},{label:"OCE",value:"oce"},{label:"Asia",value:"asia"},{label:"Middle East",value:"middleeast"},{label:"Brazil",value:"brazil"}])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("roles_pings").setPlaceholder("Benachrichtigungen").setMinValues(1).setMaxValues(3).addOptions([{label:"No Pings",value:"none"},{label:"Event Pings",value:"eventPing"},{label:"Fortnite News",value:"newsPing"},{label:"Fortnite Item Shop",value:"shopPing"}]))
  ];}
  async function applyRoles(interaction,group,values){const c=ensureGuild(interaction.guild.id);const groups={games:GAME_ROLE_KEYS,platform:["pc","playstation","xbox","switch","mobile"],mode:["build","zeroBuild","casual","competitive","ranked","chill","roleplay","creative"],region:["eu","nae","nac","naw","oce","asia","middleeast","brazil"],pings:["eventPing","newsPing","shopPing"]};const keys=groups[group]||[];const remove=keys.map(k=>c.roles[k]).filter(Boolean);if(remove.length)await interaction.member.roles.remove(remove).catch(()=>{});const add=values.map(k=>c.roles[k]).filter(Boolean);if(add.length)await interaction.member.roles.add(add).catch(()=>{});return interaction.reply({content:"✅ Rollen aktualisiert.",ephemeral:true});}

  function leaderboardRows(guildId,type){const items=Object.entries(db.users).filter(([k])=>k.startsWith(`${guildId}:`)).map(([k,u])=>({id:k.split(":")[1],u,c:ensureUser(guildId,k.split(":")[1])}));const val=x=>({coins:x.c.coins,level:x.u.level||0,season:x.c.seasonXp,invites:x.u.invites||0,eventwins:x.c.eventWins})[type]||0;return items.sort((a,b)=>val(b)-val(a)).slice(0,10).map((x,i)=>`${i+1}. <@${x.id}> — **${val(x)}**`).join("\n")||"Noch keine Daten.";}

  async function handleBirthday(interaction){const sub=interaction.options.getSubcommand(),c=ensureUser(interaction.guild.id,interaction.user.id);if(sub==="remove"){c.birthday=null;saveDB();return interaction.reply({content:"✅ Geburtstag entfernt.",ephemeral:true});}const month=interaction.options.getInteger("monat"),day=interaction.options.getInteger("tag");const test=new Date(2024,month-1,day);if(test.getMonth()!==month-1||test.getDate()!==day)return interaction.reply({content:"❌ Dieses Datum gibt es nicht.",ephemeral:true});c.birthday={month,day};saveDB();return interaction.reply({content:`🎂 Gespeichert: **${day}.${month}.** (ohne Geburtsjahr).`,ephemeral:true});}

  async function processBirthdays(guild){const c=ensureGuild(guild.id),today=dateKey();if(c.lastBirthdayDate===today)return;c.lastBirthdayDate=today;const roleId=c.roles.birthday;try{if(roleId){await guild.members.fetch();for(const m of guild.members.cache.values())if(m.roles.cache.has(roleId))await m.roles.remove(roleId).catch(()=>{});}}catch{}const p=dateParts();const ids=Object.keys(db.users).filter(k=>k.startsWith(`${guild.id}:`)).map(k=>k.split(":")[1]).filter(id=>{const b=ensureUser(guild.id,id).birthday;return b&&b.month===p.month&&b.day===p.day;});const ch=guild.channels.cache.get(c.channels.birthdays);for(const id of ids){const m=await guild.members.fetch(id).catch(()=>null);if(m&&roleId)await m.roles.add(roleId).catch(()=>{});if(ch)await ch.send(`🎂 Happy Birthday <@${id}>! Die Community wünscht dir einen richtig guten Tag! 🥳`).catch(()=>{});}saveDB();}

  async function weeklyRollover(guild){const c=ensureGuild(guild.id),wk=weekKey();if(c.weekKey===wk)return;const old=c.weekKey;c.weekKey=wk;
    const members=Object.keys(db.users).filter(k=>k.startsWith(`${guild.id}:`)).map(k=>({id:k.split(":")[1],c:ensureUser(guild.id,k.split(":")[1])}));const winner=members.sort((a,b)=>b.c.weeklyActivity-a.c.weeklyActivity)[0];
    if(winner&&winner.c.weeklyActivity>0){const roleId=c.roles.memberWeek;try{if(roleId){await guild.members.fetch();for(const m of guild.members.cache.values())if(m.roles.cache.has(roleId))await m.roles.remove(roleId).catch(()=>{});const wm=await guild.members.fetch(winner.id).catch(()=>null);if(wm)await wm.roles.add(roleId).catch(()=>{});}}catch{}winner.c.coins+=300;await awardBadge(guild.id,winner.id,"Member of the Week");const ch=guild.channels.cache.get(c.channels.welcome);if(ch)await ch.send(`🌟 **Member of the Week:** <@${winner.id}> mit ${winner.c.weeklyActivity} Aktivitätspunkten! +300 Coins.`).catch(()=>{});}
    for(const x of members)x.c.weeklyActivity=0;
    const clips=Object.values(db.clips).filter(x=>x.guildId===guild.id&&x.week===old);const top=clips.sort((a,b)=>b.votes.length-a.votes.length)[0];if(top&&top.votes.length){const uc=ensureUser(guild.id,top.userId);uc.coins+=300;await awardBadge(guild.id,top.userId,"Clip Champion");const ch=guild.channels.cache.get(c.channels.clips);if(ch)await ch.send(`🎬 **Clip of the Week:** <@${top.userId}> mit **${top.votes.length} Votes**!\n${top.url}\n+300 Coins.`).catch(()=>{});}saveDB();}

  async function processEvents(guild){const now=Date.now(),c=ensureGuild(guild.id);for(const e of Object.values(db.events).filter(e=>e.guildId===guild.id&&!e.ended)){if(!e.reminded&&now>=e.startAt-30*60000){e.reminded=true;for(const uid of e.reminders){const u=await client.users.fetch(uid).catch(()=>null);if(u)await u.send(`⏰ **${e.name}** auf **${guild.name}** startet <t:${Math.floor(e.startAt/1000)}:R>.`).catch(()=>{});}const ch=guild.channels.cache.get(e.channelId);if(ch&&c.roles.eventPing)await ch.send({content:`<@&${c.roles.eventPing}> ⏰ **${e.name}** startet <t:${Math.floor(e.startAt/1000)}:R>.`,allowedMentions:{roles:[c.roles.eventPing]}}).catch(()=>{});}if(!e.started&&now>=e.startAt){e.started=true;const ch=guild.channels.cache.get(e.channelId);if(ch)await ch.send(`🚀 **${e.name} startet jetzt!** ${mentionList(e.participants)}`).catch(()=>{});}}saveDB();}

  async function fetchFortnite(path){const headers={"User-Agent":"StiloMultiGameCommunityBot/1.0"};if(apiKey)headers.Authorization=apiKey;const r=await fetch(`https://fortnite-api.com/${path}`,{headers});if(!r.ok)throw new Error(`Fortnite API ${r.status}`);return r.json();}
  function getNewsItems(json){const d=json?.data||json||{};return d.motds||d.br?.motds||d.news?.motds||[];}
  function flattenShop(node,out=[]){if(!node)return out;if(Array.isArray(node)){for(const x of node)flattenShop(x,out);return out;}if(typeof node!=="object")return out;if(node.name&&typeof node.name==="string"&&(node.id||node.type||node.images))out.push({name:node.name,image:node.images?.icon||node.images?.featured||node.images?.smallIcon||null,id:node.id||null});for(const v of Object.values(node))flattenShop(v,out);return out;}
  function uniqueByName(items){const m=new Map();for(const x of items){const k=norm(x.name);if(k&&!m.has(k))m.set(k,x);}return [...m.values()];}
  async function currentNews(){const j=await fetchFortnite("v2/news/br?language=de");return {hash:j?.data?.hash||JSON.stringify(getNewsItems(j)).slice(0,150),items:getNewsItems(j)};}
  async function currentShop(){let j;try{j=await fetchFortnite("v2/shop?language=de");}catch{j=await fetchFortnite("v2/shop/br?language=de");}const items=uniqueByName(flattenShop(j?.data||j));return {hash:j?.data?.hash||j?.data?.date||JSON.stringify(items.map(x=>x.name)).slice(0,300),items};}
  async function checkFortniteFeeds(guild,postChanges=true){const c=ensureGuild(guild.id);
    if(c.settings.newsEnabled){try{const n=await currentNews();if(!c.newsState.hash){c.newsState.hash=n.hash;}else if(n.hash!==c.newsState.hash){c.newsState.hash=n.hash;if(postChanges){const ch=guild.channels.cache.get(c.channels.news);for(const item of n.items.slice(0,4)){const e=footer(new EmbedBuilder().setTitle(`📰 ${item.title||"Fortnite News"}`).setDescription((item.body||item.tabTitle||"").slice(0,3500)));if(item.image)e.setImage(item.image);if(ch)await ch.send({content:c.roles.newsPing?`<@&${c.roles.newsPing}>`:undefined,embeds:[e],allowedMentions:c.roles.newsPing?{roles:[c.roles.newsPing]}:{parse:[]}}).catch(()=>{});}}}}catch(err){console.warn("Fortnite news check:",err.message);}}
    if(c.settings.shopEnabled){try{const s=await currentShop();if(!c.shopState.hash){c.shopState.hash=s.hash;}else if(s.hash!==c.shopState.hash){c.shopState.hash=s.hash;if(postChanges){const ch=guild.channels.cache.get(c.channels.itemShop);if(ch)await ch.send({content:c.roles.shopPing?`<@&${c.roles.shopPing}>`:undefined,embeds:[footer(new EmbedBuilder().setTitle("🛒 Fortnite Item Shop updated").setDescription(s.items.slice(0,25).map(x=>`• ${x.name}`).join("\n")||"Shop wurde aktualisiert."))],allowedMentions:c.roles.shopPing?{roles:[c.roles.shopPing]}:{parse:[]}}).catch(()=>{});for(const [key,u] of Object.entries(db.users).filter(([k])=>k.startsWith(`${guild.id}:`))){const uid=key.split(":")[1],uc=ensureUser(guild.id,uid);if(!uc.favorites.length||uc.notifiedShopHash===s.hash)continue;const hits=s.items.filter(it=>uc.favorites.some(f=>norm(it.name)===norm(f)||norm(it.name).includes(norm(f))));if(hits.length){const du=await client.users.fetch(uid).catch(()=>null);if(du)await du.send(`🛒 Deine Fortnite-Favoriten sind im aktuellen Shop auf **${guild.name}**:\n${hits.slice(0,10).map(x=>`• **${x.name}**`).join("\n")}`).catch(()=>{});uc.notifiedShopHash=s.hash;}}}}}catch(err){console.warn("Fortnite shop check:",err.message);}}
    saveDB();
  }

  async function scheduler(){for(const guild of client.guilds.cache.values()){await weeklyRollover(guild).catch(()=>{});await processBirthdays(guild).catch(()=>{});await processEvents(guild).catch(()=>{});}}
  async function feedScheduler(){for(const guild of client.guilds.cache.values())await checkFortniteFeeds(guild,true).catch(()=>{});}
  async function onReady(){for(const guild of client.guilds.cache.values()){ensureGuild(guild.id);await weeklyRollover(guild);await processBirthdays(guild);await processEvents(guild);await checkFortniteFeeds(guild,false).catch(()=>{});}setInterval(()=>scheduler().catch(()=>{}),15*60*1000);setInterval(()=>feedScheduler().catch(()=>{}),30*60*1000);}

  async function onTeamsearchCreated(interaction){const c=ensureUser(interaction.guild.id,interaction.user.id);c.teamsearchCount+=1;c.coins+=5;c.seasonXp+=10;c.weeklyActivity+=3;questProgress(interaction.guild.id,interaction.user.id,"teamsearch",1);await checkAchievements(interaction.guild,interaction.user.id,interaction.channel);saveDB();}
  async function onTeamMemberJoined(guild,userId){const c=ensureUser(guild.id,userId);c.weeklyActivity+=1;c.coins+=2;saveDB();}
  async function onTeamFull(team,ch,guild){team.readyIds=[];saveDB();await ch.send({content:`✅ Team voll. Ready-Check für ${mentionList(team.members)}`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`teamready_ready:${ch.id}`).setLabel("Ready").setEmoji("✅").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`teamready_not:${ch.id}`).setLabel("Not Ready").setEmoji("❌").setStyle(ButtonStyle.Danger))]});}
  async function teamReady(interaction,ready){const team=db.teams[interaction.channel.id]||db.teams[interaction.customId.split(":")[1]];if(!team||!team.members.includes(interaction.user.id))return interaction.reply({content:"❌ Du bist nicht in diesem Team.",ephemeral:true});team.readyIds=team.readyIds||[];team.readyIds=team.readyIds.filter(id=>id!==interaction.user.id);if(ready)team.readyIds.push(interaction.user.id);saveDB();if(!ready)return interaction.reply({content:"❌ Als **Not Ready** markiert.",ephemeral:true});await interaction.reply({content:`✅ Ready (${team.readyIds.length}/${team.members.length})`,ephemeral:true});if(team.readyIds.length===team.members.length&&!team.voiceId){const c=ensureGuild(interaction.guild.id),parent=interaction.guild.channels.cache.get(c.channels.voiceCategory);const voice=await interaction.guild.channels.create({name:`🎧 Ready Squad`,type:ChannelType.GuildVoice,parent:parent?.id,permissionOverwrites:[{id:interaction.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel]},...team.members.map(id=>({id,allow:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.Speak]})),{id:interaction.guild.members.me.id,allow:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.ManageChannels]}]});team.voiceId=voice.id;c.tempVoices.push(voice.id);saveDB();await interaction.channel.send(`🎧 Alle sind ready! Privater Voice: ${voice}`);}}

  async function handleInteraction(interaction){
    if(interaction.isChatInputCommand()){
      const n=interaction.commandName;
      if(n==="profile"){const user=interaction.options.getUser("user")||interaction.user;const member=await interaction.guild.members.fetch(user.id).catch(()=>null);if(member&&Date.now()-member.joinedTimestamp>180*DAY_MS)await awardBadge(interaction.guild.id,user.id,"OG Member");await interaction.reply({embeds:[profileEmbed(interaction.guild,user)]});return true;}
      if(n==="balance"){const c=ensureUser(interaction.guild.id,interaction.user.id);await interaction.reply(`🪙 ${interaction.user}: **${c.coins} Community Coins**`);return true;}
      if(n==="coinshop"){await interaction.reply({embeds:[coinShopEmbed()],components:coinShopRows(),ephemeral:true});return true;}
      if(n==="quests"){await interaction.reply({embeds:[questEmbed(interaction.guild.id,interaction.user.id)],components:questButtons(interaction.guild.id,interaction.user.id),ephemeral:true});return true;}
      if(n==="leaderboard"){const type=interaction.options.getString("typ");await interaction.reply({embeds:[footer(new EmbedBuilder().setTitle(`🏆 Leaderboard • ${type}`).setDescription(leaderboardRows(interaction.guild.id,type)))]});return true;}
      if(n==="squad"){await handleSquad(interaction);return true;}
      if(n==="event"){await handleEvent(interaction);return true;}
      if(n==="events"){const rows=Object.values(db.events).filter(e=>e.guildId===interaction.guild.id&&!e.ended&&e.startAt>Date.now()-6*60*60*1000).sort((a,b)=>a.startAt-b.startAt).slice(0,10).map(e=>`• **${e.name}** [${e.game || "Multi-Game"}] (${e.type}) — <t:${Math.floor(e.startAt/1000)}:F> • \`${e.id}\``).join("\n")||"Keine kommenden Events.";await interaction.reply({embeds:[footer(new EmbedBuilder().setTitle("📅 Event Calendar").setDescription(rows))]});return true;}
      if(n==="poll"){await handlePoll(interaction);return true;}
      if(n==="suggest"){await handleSuggestion(interaction);return true;}
      if(n==="suggeststatus"){if(!isManager(interaction.member)){await interaction.reply({content:"❌ Dafür brauchst du Server verwalten.",ephemeral:true});return true;}const id=interaction.options.getString("message_id"),s=db.suggestions[id];if(!s){await interaction.reply({content:"❌ Vorschlag nicht gefunden.",ephemeral:true});return true;}s.status=interaction.options.getString("status");saveDB();await refreshSuggestion(s,interaction.guild);await interaction.reply({content:`✅ Status: **${s.status}**`,ephemeral:true});return true;}
      if(n==="clip"){await handleClip(interaction);return true;}
      if(n==="birthday"){await handleBirthday(interaction);return true;}
      if(n==="roles"){await interaction.reply({content:"🎭 Wähle deine Rollen:",components:selfRoleRows(interaction.guild.id),ephemeral:true});return true;}
      if(n==="season"){const s=ensureGuild(interaction.guild.id).season;const uc=ensureUser(interaction.guild.id,interaction.user.id);await interaction.reply({embeds:[footer(new EmbedBuilder().setTitle(`🌟 ${s.name}`).setDescription(`Season **#${s.number}**\nEnde: <t:${Math.floor(s.endsAt/1000)}:R>\nDeine Season XP: **${uc.seasonXp}**`))]});return true;}
      if(n==="seasonstart"){if(!isManager(interaction.member)){await interaction.reply({content:"❌ Dafür brauchst du Server verwalten.",ephemeral:true});return true;}const c=ensureGuild(interaction.guild.id),old=c.season;c.seasonHistory.push({...old,endedAt:Date.now()});c.season={number:(old.number||0)+1,name:interaction.options.getString("name"),startedAt:Date.now(),endsAt:Date.now()+interaction.options.getInteger("tage")*DAY_MS};for(const [k] of Object.entries(db.users).filter(([k])=>k.startsWith(`${interaction.guild.id}:`)))ensureUser(interaction.guild.id,k.split(":")[1]).seasonXp=0;saveDB();await interaction.reply(`🌟 Neue Season gestartet: **${c.season.name}** (${interaction.options.getInteger("tage")} Tage).`);return true;}
      if(n==="fortnite"){const sub=interaction.options.getSubcommand();if(sub==="news"){await interaction.deferReply();try{const x=await currentNews();const text=x.items.slice(0,5).map(i=>`**${i.title||"News"}**\n${(i.body||"").slice(0,500)}`).join("\n\n")||"Keine News gefunden.";await interaction.editReply({embeds:[footer(new EmbedBuilder().setTitle("📰 Fortnite News").setDescription(text.slice(0,4000)))]});}catch(e){await interaction.editReply(`❌ Fortnite-News konnten nicht geladen werden: ${e.message}`);}return true;}if(sub==="shop"){await interaction.deferReply();try{const x=await currentShop();await interaction.editReply({embeds:[footer(new EmbedBuilder().setTitle("🛒 Fortnite Item Shop").setDescription(x.items.slice(0,30).map(i=>`• ${i.name}`).join("\n")||"Keine Items gefunden."))]});}catch(e){await interaction.editReply(`❌ Shop konnte nicht geladen werden: ${e.message}`);}return true;}const uc=ensureUser(interaction.guild.id,interaction.user.id);if(sub==="favorites"){await interaction.reply({content:uc.favorites.length?`🛒 Favoriten:\n${uc.favorites.map(x=>`• ${x}`).join("\n")}`:"Du hast noch keine Favoriten.",ephemeral:true});return true;}const name=interaction.options.getString("name").trim();if(sub==="favorite-add"){if(!uc.favorites.some(x=>norm(x)===norm(name)))uc.favorites.push(name);saveDB();await interaction.reply({content:`✅ **${name}** wird beobachtet. Bei einem Shop-Treffer versucht der Bot dir eine DM zu senden.`,ephemeral:true});return true;}uc.favorites=uc.favorites.filter(x=>norm(x)!==norm(name));saveDB();await interaction.reply({content:`✅ **${name}** entfernt.`,ephemeral:true});return true;}
    }

    if(interaction.isStringSelectMenu()){
      if(interaction.customId.startsWith("roles_")){await applyRoles(interaction,interaction.customId.replace("roles_",""),interaction.values);return true;}
    }

    if(interaction.isButton()){
      const id=interaction.customId;
      if(id.startsWith("quest_self:")){const qid=id.split(":")[1],c=resetDailyIfNeeded(interaction.guild.id,interaction.user.id);c.daily.progress[qid]=1;saveDB();await interaction.update({embeds:[questEmbed(interaction.guild.id,interaction.user.id)],components:questButtons(interaction.guild.id,interaction.user.id)});return true;}
      if(id.startsWith("quest_claim:")){await claimQuest(interaction,id.split(":")[1]);return true;}
      if(id.startsWith("coinbuy:")){await buyItem(interaction,id.split(":")[1]);return true;}
      if(id.startsWith("event_join:")||id.startsWith("event_leave:")||id.startsWith("event_remind:")){const [act,eid]=id.split(":");const e=db.events[eid];if(!e||e.ended){await interaction.reply({content:"Event nicht verfügbar.",ephemeral:true});return true;}if(act==="event_join"){let rewarded=false;if(!e.participants.includes(interaction.user.id)){e.participants.push(interaction.user.id);e.rewarded=e.rewarded||[];if(!e.rewarded.includes(interaction.user.id)){e.rewarded.push(interaction.user.id);const uc=ensureUser(interaction.guild.id,interaction.user.id);uc.coins+=5;uc.weeklyActivity+=2;rewarded=true;}}saveDB();await interaction.message.edit({embeds:[eventEmbed(e)],components:eventRows(e)}).catch(()=>{});await interaction.reply({content:rewarded?"✅ Event beigetreten. +5 Coins":"✅ Event beigetreten.",ephemeral:true});return true;}if(act==="event_leave"){e.participants=e.participants.filter(x=>x!==interaction.user.id);saveDB();await interaction.message.edit({embeds:[eventEmbed(e)],components:eventRows(e)}).catch(()=>{});await interaction.reply({content:"↩️ Event verlassen.",ephemeral:true});return true;}if(!e.reminders.includes(interaction.user.id))e.reminders.push(interaction.user.id);saveDB();await interaction.reply({content:"⏰ Reminder aktiviert. Der Bot versucht dir 30 Minuten vorher eine DM zu senden.",ephemeral:true});return true;}
      if(id.startsWith("poll_vote:")){const [,pid,idx]=id.split(":");await updatePoll(interaction,pid,Number(idx));return true;}
      if(id.startsWith("sug_up:")||id.startsWith("sug_down:")){const [act,sid]=id.split(":"),s=db.suggestions[sid];if(!s){await interaction.reply({content:"Vorschlag nicht verfügbar.",ephemeral:true});return true;}s.up=s.up.filter(x=>x!==interaction.user.id);s.down=s.down.filter(x=>x!==interaction.user.id);(act==="sug_up"?s.up:s.down).push(interaction.user.id);saveDB();await refreshSuggestion(s,interaction.guild);await interaction.reply({content:"✅ Vote gespeichert.",ephemeral:true});return true;}
      if(id.startsWith("clip_vote:")){const cid=id.split(":")[1],clip=db.clips[cid];if(!clip){await interaction.reply({content:"Clip nicht verfügbar.",ephemeral:true});return true;}if(clip.userId===interaction.user.id){await interaction.reply({content:"❌ Du kannst nicht für deinen eigenen Clip voten.",ephemeral:true});return true;}if(!clip.votes.includes(interaction.user.id))clip.votes.push(interaction.user.id);saveDB();await interaction.message.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`clip_vote:${cid}`).setLabel(`Vote • ${clip.votes.length}`).setEmoji("🔥").setStyle(ButtonStyle.Primary))]}).catch(()=>{});await interaction.reply({content:"🔥 Vote gespeichert.",ephemeral:true});return true;}
      if(id.startsWith("teamready_ready:")){await teamReady(interaction,true);return true;}
      if(id.startsWith("teamready_not:")){await teamReady(interaction,false);return true;}
      if(id==="welcome_roles"){await interaction.reply({content:"🎭 Wähle deine Rollen:",components:selfRoleRows(interaction.guild.id),ephemeral:true});return true;}
      if(id==="welcome_quests"){await interaction.reply({embeds:[questEmbed(interaction.guild.id,interaction.user.id)],components:questButtons(interaction.guild.id,interaction.user.id),ephemeral:true});return true;}
      if(id==="welcome_support"){const ch=interaction.guild.channels.cache.get(guildData(interaction.guild.id).channels.support);await interaction.reply({content:ch?`🎫 Support findest du hier: ${ch}`:"🎫 Nutze den Support-Kanal des Servers.",ephemeral:true});return true;}
    }
    return false;
  }

  return { setup, onReady, onMessage, onMemberAdd, onVoiceStateUpdate, onReactionAdd, handleInteraction, onTeamsearchCreated, onTeamMemberJoined, onTeamFull };
}

module.exports = { buildCommunityCommands, createCommunity };
