const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");

const MAX_LEVEL = 500;
const BATTLE_TTL = 20 * 60 * 1000;
const DISCOVERY_COOLDOWN = 20 * 60 * 1000;
const POWER_DISCOVERY_COST = 2500;

const POWERS = [
  { id: "ember", name: "🔥 Ember Core", rarity: "Common", weight: 35, mult: 1.18, unlock: 1, skill: "Flame Burst" },
  { id: "tide", name: "🌊 Tide Heart", rarity: "Uncommon", weight: 25, mult: 1.27, unlock: 1, skill: "Tidal Crash" },
  { id: "gale", name: "🌪️ Gale Sigil", rarity: "Rare", weight: 15, mult: 1.38, unlock: 15, skill: "Cyclone Cut" },
  { id: "frost", name: "❄️ Frost Wisp", rarity: "Rare", weight: 10, mult: 1.45, unlock: 35, skill: "Frozen Spear" },
  { id: "volt", name: "⚡ Volt Crown", rarity: "Epic", weight: 7, mult: 1.62, unlock: 60, skill: "Thunder Chain" },
  { id: "umbral", name: "🌑 Umbral Eye", rarity: "Epic", weight: 5, mult: 1.7, unlock: 90, skill: "Night Rift" },
  { id: "solar", name: "☀️ Solar Wing", rarity: "Legendary", weight: 2, mult: 1.92, unlock: 125, skill: "Sunfall" },
  { id: "rift", name: "🌀 Rift Stone", rarity: "Mythic", weight: 1, mult: 2.18, unlock: 160, skill: "Void Break" }
];

const WEAPONS = [
  { id: "rustblade", name: "🗡️ Rustblade", rarity: "Starter", mult: 1.0 },
  { id: "reef_saber", name: "⚔️ Reef Saber", rarity: "Uncommon", mult: 1.14 },
  { id: "storm_katana", name: "🌩️ Storm Katana", rarity: "Rare", mult: 1.28 },
  { id: "frost_glaive", name: "🧊 Frost Glaive", rarity: "Epic", mult: 1.45 },
  { id: "sun_scythe", name: "🌞 Sun Scythe", rarity: "Legendary", mult: 1.7 },
  { id: "voidfang", name: "🕳️ Voidfang", rarity: "Mythic", mult: 1.95 }
];

const ISLANDS = [
  {
    id: "driftwood", sea: 1, level: 1, name: "🏝️ Driftwood Coast",
    enemy: { name: "Dock Rogue", level: 3, hp: 80, xp: 55, gold: 48 },
    boss: { name: "Captain Brine", level: 12, hp: 420, xp: 450, gold: 600, drop: "reef_saber", dropChance: 0.28 },
    questKills: 5, questXp: 330, questGold: 360
  },
  {
    id: "coral", sea: 1, level: 15, name: "🪸 Coral Haven",
    enemy: { name: "Reef Raider", level: 20, hp: 165, xp: 105, gold: 82 },
    boss: { name: "Tide Warden", level: 28, hp: 760, xp: 760, gold: 980, drop: "reef_saber", dropChance: 0.38 },
    questKills: 6, questXp: 620, questGold: 650
  },
  {
    id: "tempest", sea: 1, level: 35, name: "⛈️ Tempest Reach",
    enemy: { name: "Sky Marauder", level: 42, hp: 300, xp: 180, gold: 135 },
    boss: { name: "Storm Ronin", level: 52, hp: 1250, xp: 1250, gold: 1600, drop: "storm_katana", dropChance: 0.3 },
    questKills: 7, questXp: 1050, questGold: 1100
  },
  {
    id: "glacier", sea: 1, level: 60, name: "🏔️ Glacier Crown",
    enemy: { name: "Frost Sentinel", level: 68, hp: 510, xp: 290, gold: 205 },
    boss: { name: "Ice Regent", level: 82, hp: 2050, xp: 2050, gold: 2650, drop: "frost_glaive", dropChance: 0.26 },
    questKills: 8, questXp: 1750, questGold: 1850
  },
  {
    id: "ashfall", sea: 1, level: 90, name: "🌋 Ashfall Citadel",
    enemy: { name: "Cinder Knight", level: 100, hp: 820, xp: 440, gold: 310 },
    boss: { name: "Magma Tyrant", level: 118, hp: 3300, xp: 3300, gold: 4200, drop: "storm_katana", dropChance: 0.38 },
    questKills: 9, questXp: 2850, questGold: 3000
  },
  {
    id: "sunspire", sea: 2, level: 125, name: "🌅 Sunspire Kingdom",
    enemy: { name: "Royal Vanguard", level: 138, hp: 1250, xp: 650, gold: 460 },
    boss: { name: "Solar Champion", level: 155, hp: 5000, xp: 5200, gold: 6900, drop: "sun_scythe", dropChance: 0.2 },
    questKills: 10, questXp: 4300, questGold: 4600
  },
  {
    id: "shadowport", sea: 2, level: 160, name: "🌒 Shadowport",
    enemy: { name: "Night Corsair", level: 175, hp: 1850, xp: 920, gold: 650 },
    boss: { name: "Umbral Admiral", level: 195, hp: 7400, xp: 7600, gold: 9800, drop: "sun_scythe", dropChance: 0.28 },
    questKills: 10, questXp: 6400, questGold: 6900
  },
  {
    id: "rift", sea: 2, level: 210, name: "🌀 Rift Archipelago",
    enemy: { name: "Rift Hunter", level: 228, hp: 2750, xp: 1320, gold: 920 },
    boss: { name: "Void Sovereign", level: 250, hp: 10800, xp: 11200, gold: 14500, drop: "voidfang", dropChance: 0.14 },
    questKills: 12, questXp: 9100, questGold: 9800
  },
  {
    id: "celestial", sea: 3, level: 300, name: "✨ Celestial Expanse",
    enemy: { name: "Astral Guard", level: 320, hp: 4300, xp: 2050, gold: 1450 },
    boss: { name: "Starbreaker", level: 350, hp: 17000, xp: 18000, gold: 22500, drop: "voidfang", dropChance: 0.22 },
    questKills: 12, questXp: 14500, questGold: 15500
  }
];

function buildElementSeasCommands() {
  return [
    new SlashCommandBuilder().setName("elementseas").setDescription("Öffnet Element Seas – dein persistentes Discord-RPG."),
    new SlashCommandBuilder().setName("sea").setDescription("Öffnet Element Seas – Kurzcommand für das RPG."),
    new SlashCommandBuilder().setName("seaprofile").setDescription("Zeigt ein Element-Seas-Profil.")
      .addUserOption(o => o.setName("user").setDescription("Optional: anderes Mitglied")),
    new SlashCommandBuilder().setName("seaduel").setDescription("Fordert ein Mitglied zu einem Element-Seas-Duell heraus.")
      .addUserOption(o => o.setName("user").setDescription("Gegner").setRequired(true)),
    new SlashCommandBuilder().setName("sealeaderboard").setDescription("Zeigt die stärksten Element-Seas-Spieler dieses Servers.")
  ];
}

function createElementSeas(ctx) {
  const { db, saveDB, footer } = ctx;
  if (!db.elementSeas || typeof db.elementSeas !== "object") db.elementSeas = {};
  if (!db.elementSeas.players) db.elementSeas.players = {};
  if (!db.elementSeas.duels) db.elementSeas.duels = {};
  if (!db.elementSeas.battles || typeof db.elementSeas.battles !== "object") db.elementSeas.battles = {};

  const battles = new Map(Object.entries(db.elementSeas.battles || {}));
  const duelSessions = new Map(Object.entries(db.elementSeas.duels || {}));

  function persistSessions() {
    db.elementSeas.battles = Object.fromEntries(battles);
    db.elementSeas.duels = Object.fromEntries(duelSessions);
    saveDB();
  }

  const key = (guildId, userId) => `${guildId}:${userId}`;
  const powerById = id => POWERS.find(x => x.id === id) || null;
  const weaponById = id => WEAPONS.find(x => x.id === id) || WEAPONS[0];
  const islandById = id => ISLANDS.find(x => x.id === id) || ISLANDS[0];

  function xpNeeded(level) {
    return Math.floor(90 + level * 38 + Math.pow(level, 1.32) * 12);
  }
  function maxHp(p) { return Math.floor(100 + p.level * 9 + (p.stats?.defense || 0) * 13); }
  function baseDamage(p) { return 10 + p.level * 2.2 + (p.stats?.strength || 0) * 3.1; }
  function powerDamage(p) { return 12 + p.level * 2.35 + (p.stats?.power || 0) * 3.5; }
  function rankName(level) {
    if (level >= 300) return "Celestial";
    if (level >= 210) return "Riftwalker";
    if (level >= 125) return "Sea Conqueror";
    if (level >= 60) return "Grand Adventurer";
    if (level >= 15) return "Rookie Captain";
    return "Castaway";
  }

  function ensurePlayer(guildId, userId) {
    const k = key(guildId, userId);
    if (!db.elementSeas.players[k]) {
      db.elementSeas.players[k] = {
        guildId, userId, createdAt: Date.now(), level: 1, xp: 0, gold: 500, shards: 0,
        islandId: "driftwood", sea: 1, bounty: 0, wins: 0, losses: 0,
        stats: { strength: 1, defense: 1, power: 1 }, statPoints: 0,
        weaponId: "rustblade", weaponsOwned: ["rustblade"], weaponMastery: { rustblade: 1 },
        powerId: null, powersOwned: [], powerMastery: {}, discoveryPity: 0, lastDiscoveryAt: 0,
        inventory: { potions: 3 }, quest: null, bossWins: {}, enemyKills: {}, totalKills: 0
      };
      saveDB();
    }
    const p = db.elementSeas.players[k];
    if (!Number.isFinite(p.level) || p.level < 1) p.level = 1;
    if (!Number.isFinite(p.xp) || p.xp < 0) p.xp = 0;
    if (!Number.isFinite(p.gold) || p.gold < 0) p.gold = 500;
    if (!Number.isFinite(p.shards) || p.shards < 0) p.shards = 0;
    if (!Number.isFinite(p.bounty) || p.bounty < 0) p.bounty = 0;
    if (!Number.isFinite(p.wins) || p.wins < 0) p.wins = 0;
    if (!Number.isFinite(p.losses) || p.losses < 0) p.losses = 0;
    if (!Number.isFinite(p.totalKills) || p.totalKills < 0) p.totalKills = 0;
    if (!p.islandId || !ISLANDS.some(i => i.id === p.islandId)) p.islandId = "driftwood";
    if (!Number.isFinite(p.sea) || p.sea < 1) p.sea = islandById(p.islandId).sea;
    if (!p.weaponId || !WEAPONS.some(w => w.id === p.weaponId)) p.weaponId = "rustblade";
    if (p.powerId && !POWERS.some(x => x.id === p.powerId)) p.powerId = null;
    if (!p.stats) p.stats = { strength: 1, defense: 1, power: 1 };
    if (!Number.isFinite(p.stats.strength) || p.stats.strength < 1) p.stats.strength = 1;
    if (!Number.isFinite(p.stats.defense) || p.stats.defense < 1) p.stats.defense = 1;
    if (!Number.isFinite(p.stats.power) || p.stats.power < 1) p.stats.power = 1;
    if (!Number.isFinite(p.statPoints)) p.statPoints = 0;
    if (!Array.isArray(p.weaponsOwned)) p.weaponsOwned = ["rustblade"];
    if (!p.weaponMastery) p.weaponMastery = { rustblade: 1 };
    if (!Array.isArray(p.powersOwned)) p.powersOwned = [];
    if (!p.powerMastery) p.powerMastery = {};
    if (!p.inventory) p.inventory = { potions: 3 };
    if (!Number.isFinite(p.inventory.potions)) p.inventory.potions = 0;
    if (!p.bossWins) p.bossWins = {};
    if (!p.enemyKills) p.enemyKills = {};
    return p;
  }

  function grantXp(p, amount) {
    let levels = 0;
    p.xp += Math.max(0, Math.floor(amount));
    while (p.level < MAX_LEVEL && p.xp >= xpNeeded(p.level)) {
      p.xp -= xpNeeded(p.level);
      p.level += 1;
      p.statPoints += 3;
      p.gold += 100 + p.level * 12;
      levels++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    const bestIsland = [...ISLANDS].reverse().find(i => p.level >= i.level);
    if (bestIsland) p.sea = bestIsland.sea;
    return levels;
  }

  function progressBar(current, max, size = 12) {
    const ratio = max <= 0 ? 1 : Math.max(0, Math.min(1, current / max));
    const fill = Math.round(ratio * size);
    return `${"▰".repeat(fill)}${"▱".repeat(size - fill)} ${Math.floor(ratio * 100)}%`;
  }

  function profileEmbed(guild, user, p) {
    const island = islandById(p.islandId);
    const power = powerById(p.powerId);
    const weapon = weaponById(p.weaponId);
    const need = xpNeeded(p.level);
    return footer(new EmbedBuilder()
      .setTitle(`🌊 Element Seas • ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`**${rankName(p.level)}** • Sea ${p.sea}\n${island.name}`)
      .addFields(
        { name: `⭐ Level ${p.level}/${MAX_LEVEL}`, value: p.level >= MAX_LEVEL ? "**MAX LEVEL**" : `${progressBar(p.xp, need)}\n${p.xp.toLocaleString()}/${need.toLocaleString()} XP`, inline: false },
        { name: "💰 Gold", value: p.gold.toLocaleString(), inline: true },
        { name: "💎 Shards", value: p.shards.toLocaleString(), inline: true },
        { name: "🏴 Bounty", value: p.bounty.toLocaleString(), inline: true },
        { name: "⚔️ Weapon", value: `${weapon.name}\nMastery ${p.weaponMastery[p.weaponId] || 1}`, inline: true },
        { name: "✨ Power", value: power ? `${power.name}\nMastery ${p.powerMastery[p.powerId] || 1}` : "Noch keine Power", inline: true },
        { name: "📊 Stats", value: `STR **${p.stats.strength}** • DEF **${p.stats.defense}** • PWR **${p.stats.power}**\nFreie Punkte: **${p.statPoints}**`, inline: false },
        { name: "🏆 PvP", value: `${p.wins} Siege • ${p.losses} Niederlagen`, inline: true },
        { name: "☠️ Kills", value: String(p.totalKills || 0), inline: true }
      ).setTimestamp());
  }

  function hubEmbed(guild, user, p) {
    const island = islandById(p.islandId);
    const power = powerById(p.powerId);
    const weapon = weaponById(p.weaponId);
    const q = p.quest;
    const questText = q
      ? `**${q.title}**\n${q.progress}/${q.target} ${q.targetName} besiegt`
      : "Keine aktive Quest – hol dir eine für extra XP & Gold.";
    return footer(new EmbedBuilder()
      .setTitle("🌊 ELEMENT SEAS")
      .setDescription(`**${user.username}**, deine Reise geht weiter.\n\n📍 ${island.name} • **Sea ${island.sea}**\n⭐ Level **${p.level}** • 💰 **${p.gold.toLocaleString()} Gold** • 🏴 **${p.bounty.toLocaleString()} Bounty**`)
      .addFields(
        { name: "⚔️ Loadout", value: `${weapon.name}\n${power ? power.name : "✨ Keine Power ausgerüstet"}`, inline: true },
        { name: "📜 Aktive Quest", value: questText, inline: true },
        { name: "🎯 Nächstes Ziel", value: p.level >= MAX_LEVEL ? "MAX LEVEL erreicht – Bosses, Mastery & PvP!" : `Noch **${Math.max(0, xpNeeded(p.level) - p.xp).toLocaleString()} XP** bis Level ${p.level + 1}`, inline: false }
      )
      .setFooter({ text: "Element Seas • Made with ❤️ by Stilo • Fortschritt wird gespeichert" }));
  }

  function hubRows(p) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("es_fight").setLabel("Fight").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("es_boss").setLabel("Boss").setEmoji("☠️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("es_quest").setLabel("Quest").setEmoji("📜").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("es_travel").setLabel("Reisen").setEmoji("⛵").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("es_power").setLabel("Powers").setEmoji("✨").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("es_inventory").setLabel("Inventar").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("es_stats").setLabel("Stats").setEmoji("📊").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("es_help").setLabel("Guide").setEmoji("❓").setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  function battleId() { return `B${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`; }
  function battleEmbed(b) {
    const p = ensurePlayer(b.guildId, b.userId);
    const power = powerById(p.powerId);
    const weapon = weaponById(p.weaponId);
    const log = b.log.slice(-4).join("\n") || "Der Kampf beginnt!";
    return footer(new EmbedBuilder()
      .setTitle(`${b.isBoss ? "☠️ BOSS" : "⚔️ KAMPF"} • ${b.enemy.name}`)
      .setDescription(`**${b.enemy.name} • Lv. ${b.enemy.level}**\n❤️ ${Math.max(0, b.enemyHp).toLocaleString()}/${b.enemy.maxHp.toLocaleString()}\n${progressBar(b.enemyHp, b.enemy.maxHp, 14)}\n\n**Du • Lv. ${p.level}**\n❤️ ${Math.max(0, b.playerHp).toLocaleString()}/${b.playerMaxHp.toLocaleString()}\n${progressBar(b.playerHp, b.playerMaxHp, 14)}`)
      .addFields(
        { name: "Loadout", value: `${weapon.name}${power ? ` • ${power.name}` : ""}`, inline: false },
        { name: "Battle Log", value: log.slice(0, 1000), inline: false }
      ));
  }

  function battleRows(b) {
    const p = ensurePlayer(b.guildId, b.userId);
    const power = powerById(p.powerId);
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`es_batk:${b.id}`).setLabel("Attack").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`es_bpow:${b.id}`).setLabel(power ? power.skill : "Keine Power").setEmoji("✨").setStyle(ButtonStyle.Primary).setDisabled(!power),
      new ButtonBuilder().setCustomId(`es_bguard:${b.id}`).setLabel("Guard").setEmoji("🛡️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`es_bheal:${b.id}`).setLabel(`Potion (${p.inventory.potions})`).setEmoji("🧪").setStyle(ButtonStyle.Success).setDisabled(p.inventory.potions <= 0)
    )];
  }

  function startBattle(guildId, userId, isBoss = false) {
    const p = ensurePlayer(guildId, userId);
    const island = islandById(p.islandId);
    const src = isBoss ? island.boss : island.enemy;
    const hpScale = Math.max(0.85, Math.min(1.35, 1 + (p.level - src.level) * 0.004));
    const b = {
      id: battleId(), guildId, userId, islandId: island.id, isBoss,
      enemy: { ...src, maxHp: Math.floor(src.hp * hpScale) },
      enemyHp: Math.floor(src.hp * hpScale),
      playerHp: maxHp(p), playerMaxHp: maxHp(p), turn: 0, guarded: false,
      log: [], createdAt: Date.now()
    };
    battles.set(b.id, b);
    persistSessions();
    return b;
  }

  function rollRange(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

  async function finishVictory(interaction, b) {
    const p = ensurePlayer(b.guildId, b.userId);
    const island = islandById(b.islandId);
    const mult = b.isBoss ? 1 : (0.92 + Math.random() * 0.18);
    const xp = Math.floor(b.enemy.xp * mult);
    const gold = Math.floor(b.enemy.gold * mult);
    let levels = grantXp(p, xp);
    p.gold += gold;
    p.totalKills = (p.totalKills || 0) + 1;
    p.enemyKills[b.enemy.name] = (p.enemyKills[b.enemy.name] || 0) + 1;
    p.bounty += b.isBoss ? Math.max(50, Math.floor(b.enemy.level * 3.2)) : Math.max(2, Math.floor(b.enemy.level * 0.25));
    const wm = p.weaponMastery[p.weaponId] || 1;
    p.weaponMastery[p.weaponId] = Math.min(600, wm + (b.isBoss ? 5 : 1));
    if (p.powerId) p.powerMastery[p.powerId] = Math.min(600, (p.powerMastery[p.powerId] || 1) + (b.isBoss ? 6 : 1));

    let questBonus = null;
    if (p.quest && p.quest.islandId === b.islandId && p.quest.targetName === b.enemy.name) {
      p.quest.progress = Math.min(p.quest.target, (p.quest.progress || 0) + 1);
      if (p.quest.progress >= p.quest.target) {
        const q = p.quest;
        const qLevels = grantXp(p, q.xp);
        p.gold += q.gold;
        p.shards += q.shards || 0;
        levels += qLevels;
        questBonus = `📜 Quest abgeschlossen: **+${q.xp.toLocaleString()} XP, +${q.gold.toLocaleString()} Gold${q.shards ? `, +${q.shards} Shards` : ""}**`;
        p.quest = null;
      }
    }

    let dropText = null;
    if (b.isBoss) {
      p.bossWins[b.enemy.name] = (p.bossWins[b.enemy.name] || 0) + 1;
      p.shards += Math.max(1, Math.floor(b.enemy.level / 35));
      if (b.enemy.drop && Math.random() < (b.enemy.dropChance || 0)) {
        if (!p.weaponsOwned.includes(b.enemy.drop)) {
          p.weaponsOwned.push(b.enemy.drop);
          p.weaponMastery[b.enemy.drop] = 1;
          dropText = `🎁 **BOSS DROP:** ${weaponById(b.enemy.drop).name}`;
        } else {
          const bonus = Math.floor(b.enemy.gold * 0.55);
          p.gold += bonus;
          dropText = `🎁 Duplicate Drop → **+${bonus.toLocaleString()} Gold**`;
        }
      }
    }

    saveDB();
    battles.delete(b.id);
    persistSessions();
    const description = [
      `Du hast **${b.enemy.name}** besiegt!`,
      `⭐ **+${xp.toLocaleString()} XP** • 💰 **+${gold.toLocaleString()} Gold**`,
      levels ? `⬆️ **${levels} Level-Up${levels > 1 ? "s" : ""}!** Du hast ${levels * 3} neue Stat-Punkte erhalten.` : null,
      questBonus,
      dropText
    ].filter(Boolean).join("\n");
    return interaction.update({ embeds: [footer(new EmbedBuilder().setTitle("🏆 Sieg!").setDescription(description))], components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("es_fight").setLabel("Nochmal kämpfen").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("es_home").setLabel("Zurück zum Hub").setEmoji("🌊").setStyle(ButtonStyle.Primary)
    )] });
  }

  async function battleAction(interaction, b, action) {
    if (!b) return interaction.reply({ content: "⌛ Dieser Kampf konnte nicht mehr geladen werden. Öffne mit `/sea` einen neuen Hub und starte den Kampf erneut.", flags: MessageFlags.Ephemeral });
    if (b.userId !== interaction.user.id) return interaction.reply({ content: "❌ Dieser Kampf gehört nicht dir.", flags: MessageFlags.Ephemeral });
    if (Date.now() - b.createdAt > BATTLE_TTL) {
      battles.delete(b.id);
      persistSessions();
      return interaction.update({ content: "⌛ Dieser Kampf ist abgelaufen. Öffne Element Seas neu.", embeds: [], components: [] });
    }
    const p = ensurePlayer(b.guildId, b.userId);
    const weapon = weaponById(p.weaponId);
    const power = powerById(p.powerId);
    const mastery = p.weaponMastery[p.weaponId] || 1;
    b.turn++;
    let damage = 0;
    if (action === "attack") {
      const crit = Math.random() < Math.min(0.22, 0.05 + mastery / 5000);
      damage = Math.floor(baseDamage(p) * weapon.mult * (0.88 + Math.random() * 0.24) * (crit ? 1.7 : 1));
      b.enemyHp -= damage;
      b.log.push(`⚔️ Du triffst für **${damage}** Schaden${crit ? " **CRIT!**" : ""}.`);
    } else if (action === "power" && power) {
      const pm = p.powerMastery[p.powerId] || 1;
      const burst = 1 + Math.min(0.38, pm / 1100);
      damage = Math.floor(powerDamage(p) * power.mult * burst * (0.9 + Math.random() * 0.22));
      b.enemyHp -= damage;
      b.log.push(`✨ **${power.skill}** verursacht **${damage}** Schaden.`);
    } else if (action === "guard") {
      b.guarded = true;
      b.log.push("🛡️ Du gehst in Guard und reduzierst den nächsten Treffer stark.");
    } else if (action === "heal") {
      if (p.inventory.potions <= 0) return interaction.reply({ content: "❌ Keine Potions mehr.", flags: MessageFlags.Ephemeral });
      p.inventory.potions -= 1;
      const heal = Math.min(b.playerMaxHp - b.playerHp, Math.floor(b.playerMaxHp * 0.32));
      b.playerHp += heal;
      b.log.push(`🧪 Potion: **+${heal} HP**.`);
      saveDB();
    }

    if (b.enemyHp <= 0) return finishVictory(interaction, b);

    let enemyDamage = Math.floor((8 + b.enemy.level * 1.75) * (0.86 + Math.random() * 0.28));
    const mitigation = Math.min(0.48, (p.stats.defense || 1) / (p.stats.defense + 130));
    enemyDamage = Math.max(1, Math.floor(enemyDamage * (1 - mitigation)));
    if (b.guarded) {
      enemyDamage = Math.max(1, Math.floor(enemyDamage * 0.35));
      b.guarded = false;
    }
    b.playerHp -= enemyDamage;
    b.log.push(`💥 ${b.enemy.name} trifft dich für **${enemyDamage}**.`);

    if (b.playerHp <= 0) {
      battles.delete(b.id);
      persistSessions();
      const lossGold = Math.min(p.gold, Math.max(25, Math.floor(p.gold * 0.025)));
      p.gold -= lossGold;
      saveDB();
      return interaction.update({ embeds: [footer(new EmbedBuilder().setTitle("💀 Besiegt").setDescription(`**${b.enemy.name}** war diesmal stärker.\nDu verlierst **${lossGold.toLocaleString()} Gold**. Dein Level/XP bleibt erhalten.`))], components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("es_home").setLabel("Zurück zum Hub").setEmoji("🌊").setStyle(ButtonStyle.Primary)
      )] });
    }
    persistSessions();
    return interaction.update({ embeds: [battleEmbed(b)], components: battleRows(b) });
  }

  function questEmbed(p) {
    const island = islandById(p.islandId);
    if (p.quest) return footer(new EmbedBuilder().setTitle("📜 Aktive Quest").setDescription(`**${p.quest.title}**\nBesiege **${p.quest.target}× ${p.quest.targetName}**\nFortschritt: **${p.quest.progress}/${p.quest.target}**\n\nBelohnung: ⭐ ${p.quest.xp.toLocaleString()} XP • 💰 ${p.quest.gold.toLocaleString()} Gold${p.quest.shards ? ` • 💎 ${p.quest.shards} Shards` : ""}`));
    return footer(new EmbedBuilder().setTitle(`📜 Quest • ${island.name}`).setDescription(`Besiege **${island.questKills}× ${island.enemy.name}**.\n\nBelohnung: ⭐ **${island.questXp.toLocaleString()} XP**\n💰 **${island.questGold.toLocaleString()} Gold**\n\nQuests geben deutlich mehr Fortschritt als stumpfes Farmen.`));
  }

  function travelPayload(p) {
    const unlocked = ISLANDS.filter(i => p.level >= i.level).slice(-25);
    const menu = new StringSelectMenuBuilder().setCustomId("es_travel_select").setPlaceholder("Wähle eine freigeschaltete Insel …")
      .addOptions(unlocked.map(i => ({ label: i.name.replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 100), value: i.id, description: `Sea ${i.sea} • ab Level ${i.level}`, default: i.id === p.islandId })));
    const next = ISLANDS.find(i => p.level < i.level);
    const embed = footer(new EmbedBuilder().setTitle("⛵ Reisen").setDescription(`Freigeschaltete Inseln: **${unlocked.length}/${ISLANDS.length}**${next ? `\nNächste Insel: ${next.name} ab **Level ${next.level}**` : "\n✨ Alle aktuellen Inseln freigeschaltet!"}`));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
  }

  function statsPayload(p) {
    const embed = footer(new EmbedBuilder().setTitle("📊 Stats").setDescription(`Freie Stat-Punkte: **${p.statPoints}**\n\n💪 **Strength ${p.stats.strength}** – mehr Weapon Damage\n🛡️ **Defense ${p.stats.defense}** – mehr HP & weniger Schaden\n✨ **Power ${p.stats.power}** – stärkerer Power Damage\n\nBei jedem Level-Up bekommst du **3 Punkte**.`));
    const disabled = p.statPoints <= 0;
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("es_stat_str").setLabel("+ Strength").setEmoji("💪").setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId("es_stat_def").setLabel("+ Defense").setEmoji("🛡️").setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId("es_stat_pow").setLabel("+ Power").setEmoji("✨").setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId("es_home").setLabel("Hub").setEmoji("🌊").setStyle(ButtonStyle.Secondary)
    )] };
  }

  function inventoryPayload(p) {
    const weaponLines = p.weaponsOwned.map(id => `${id === p.weaponId ? "✅" : "▫️"} ${weaponById(id).name} • M${p.weaponMastery[id] || 1}`).join("\n") || "—";
    const powerLines = p.powersOwned.map(id => `${id === p.powerId ? "✅" : "▫️"} ${powerById(id)?.name || id} • M${p.powerMastery[id] || 1}`).join("\n") || "Noch keine Powers.";
    const rows = [];
    if (p.weaponsOwned.length) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("es_weapon_select").setPlaceholder("Weapon ausrüsten …").addOptions(p.weaponsOwned.slice(0,25).map(id => ({ label: weaponById(id).name.replace(/^[^\p{L}\p{N}]+/u, "").slice(0,100), value:id, description:`${weaponById(id).rarity} • Mastery ${p.weaponMastery[id] || 1}`, default:id===p.weaponId })))));
    }
    if (p.powersOwned.length) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("es_power_select").setPlaceholder("Power ausrüsten …").addOptions(p.powersOwned.slice(0,25).map(id => ({ label:(powerById(id)?.name || id).replace(/^[^\p{L}\p{N}]+/u, "").slice(0,100), value:id, description:`${powerById(id)?.rarity || "Power"} • Mastery ${p.powerMastery[id] || 1}`, default:id===p.powerId })))));
    }
    const embed = footer(new EmbedBuilder().setTitle("🎒 Inventar").addFields(
      { name: "⚔️ Weapons", value: weaponLines.slice(0,1024), inline:false },
      { name: "✨ Powers", value: powerLines.slice(0,1024), inline:false },
      { name: "🧪 Items", value: `Potions: **${p.inventory.potions}**`, inline:false }
    ));
    return { embeds:[embed], components:rows };
  }

  function choosePower(p, forceEpic = false) {
    let pool = POWERS.filter(x => p.level >= x.unlock);
    if (!pool.length) pool = POWERS.slice(0, 2);
    if (forceEpic) pool = pool.filter(x => ["Epic","Legendary","Mythic"].includes(x.rarity));
    const total = pool.reduce((s,x)=>s+x.weight,0);
    let r = Math.random()*total;
    for (const x of pool) { r -= x.weight; if (r <= 0) return x; }
    return pool[pool.length-1];
  }

  function powerPayload(p) {
    const now = Date.now();
    const rem = Math.max(0, DISCOVERY_COOLDOWN - (now - (p.lastDiscoveryAt || 0)));
    const power = powerById(p.powerId);
    const odds = "Common 35% • Uncommon 25% • Rare 25% • Epic 12% • Legendary 2% • Mythic 1%";
    const desc = [
      power ? `Ausgerüstet: **${power.name}** • Mastery ${p.powerMastery[p.powerId] || 1}` : "Du hast noch keine Power ausgerüstet.",
      `\n💰 Discovery kostet **${POWER_DISCOVERY_COST.toLocaleString()} Gold** (nur erspieltes Gold).`,
      `🎲 Basis-Chancen: ${odds}`,
      `🛡️ Pity: Nach **10 Discoveries ohne Epic+** ist die nächste Epic oder besser. Aktuell: **${p.discoveryPity || 0}/10**.`,
      rem ? `⏳ Nächste Discovery in **${Math.ceil(rem/60000)} Min.**` : "✅ Discovery bereit."
    ].join("\n");
    return { embeds:[footer(new EmbedBuilder().setTitle("✨ Power Shrine").setDescription(desc))], components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("es_discover").setLabel("Power entdecken").setEmoji("🔮").setStyle(ButtonStyle.Primary).setDisabled(rem>0 || p.gold<POWER_DISCOVERY_COST),
      new ButtonBuilder().setCustomId("es_inventory").setLabel("Meine Powers").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("es_home").setLabel("Hub").setEmoji("🌊").setStyle(ButtonStyle.Secondary)
    )] };
  }

  function helpEmbed() {
    return footer(new EmbedBuilder().setTitle("❓ Element Seas Guide").setDescription(
`**Dein Loop**\n📜 Quest annehmen → ⚔️ Gegner besiegen → ⭐ leveln → ⛵ neue Inseln → ☠️ Bosse → 🎁 Weapons → ✨ Powers meistern.\n\n**Stats**\nJedes Level gibt 3 Punkte für Strength, Defense oder Power.\n\n**Mastery**\nBenutze Weapon/Power im Kampf. Mastery steigt mit Siegen und verstärkt dein Build.\n\n**Power Shrine**\nPower Discoveries kosten nur erspieltes Gold. Die Chancen sind sichtbar und es gibt ein Pity-System. Kein Echtgeld-Gambling.\n\n**Seas**\nSea 1: Level 1+ • Sea 2: 125+ • Sea 3: 300+\n\n**PvP**\nMit \`/seaduel @user\` kannst du andere Spieler herausfordern. Siege erhöhen Bounty.`));
  }

  function duelPower(p) { const pw=powerById(p.powerId); return pw ? powerDamage(p)*pw.mult : 0; }
  function duelWeapon(p) { const w=weaponById(p.weaponId); return baseDamage(p)*w.mult; }
  function duelMaxHp(p) { return maxHp(p); }
  function duelEmbed(d) {
    const a = ensurePlayer(d.guildId,d.aId), b=ensurePlayer(d.guildId,d.bId);
    return footer(new EmbedBuilder().setTitle("⚔️ Element Seas Duel").setDescription(
      `<@${d.aId}> ❤️ **${Math.max(0,d.hpA)}/${duelMaxHp(a)}**\n${progressBar(d.hpA,duelMaxHp(a),12)}\n\nVS\n\n<@${d.bId}> ❤️ **${Math.max(0,d.hpB)}/${duelMaxHp(b)}**\n${progressBar(d.hpB,duelMaxHp(b),12)}\n\n🎯 Zug: <@${d.turnId}>\n${d.log.slice(-3).join("\n") || "Das Duell beginnt!"}`));
  }
  function duelRows(d) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`es_duel_atk:${d.id}`).setLabel("Attack").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`es_duel_pow:${d.id}`).setLabel("Power").setEmoji("✨").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`es_duel_guard:${d.id}`).setLabel("Guard").setEmoji("🛡️").setStyle(ButtonStyle.Secondary)
    )];
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      if (["elementseas", "sea"].includes(interaction.commandName)) {
        if (!interaction.guild) {
          await interaction.reply({ content: "❌ Element Seas funktioniert nur auf einem Discord-Server.", flags: MessageFlags.Ephemeral });
          return true;
        }
        const p = ensurePlayer(interaction.guild.id, interaction.user.id);
        await interaction.reply({ embeds:[hubEmbed(interaction.guild,interaction.user,p)], components:hubRows(p), flags:MessageFlags.Ephemeral });
        return true;
      }
      if (interaction.commandName === "seaprofile") {
        const user = interaction.options.getUser("user") || interaction.user;
        const p = ensurePlayer(interaction.guild.id, user.id);
        await interaction.reply({ embeds:[profileEmbed(interaction.guild,user,p)] }); return true;
      }
      if (interaction.commandName === "sealeaderboard") {
        const rows = Object.values(db.elementSeas.players).filter(p=>p.guildId===interaction.guild.id).sort((a,b)=>b.level-a.level || b.bounty-a.bounty).slice(0,10);
        const text = rows.length ? rows.map((p,i)=>`**${i+1}.** <@${p.userId}> • Lv. **${p.level}** • 🏴 ${p.bounty.toLocaleString()} • 💰 ${p.gold.toLocaleString()}`).join("\n") : "Noch niemand spielt Element Seas.";
        await interaction.reply({ embeds:[footer(new EmbedBuilder().setTitle("🏆 Element Seas Leaderboard").setDescription(text))] }); return true;
      }
      if (interaction.commandName === "seaduel") {
        const target=interaction.options.getUser("user");
        if(target.bot||target.id===interaction.user.id){await interaction.reply({content:"❌ Wähle einen anderen menschlichen Spieler.",flags:MessageFlags.Ephemeral});return true;}
        const a=ensurePlayer(interaction.guild.id,interaction.user.id), b=ensurePlayer(interaction.guild.id,target.id);
        if(Math.abs(a.level-b.level)>100){await interaction.reply({content:"❌ Für ein faires Duell dürfen eure Level höchstens 100 auseinanderliegen.",flags:MessageFlags.Ephemeral});return true;}
        const id=`D${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
        duelSessions.set(id,{id,guildId:interaction.guild.id,aId:interaction.user.id,bId:target.id,status:"pending",createdAt:Date.now()});
        persistSessions();
        await interaction.reply({content:`⚔️ ${target}, **${interaction.user.username}** fordert dich zu einem Element-Seas-Duell heraus!`,components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`es_duel_accept:${id}`).setLabel("Annehmen").setEmoji("⚔️").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`es_duel_decline:${id}`).setLabel("Ablehnen").setStyle(ButtonStyle.Secondary)
        )]}); return true;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const p = ensurePlayer(interaction.guild.id,interaction.user.id);
      if(interaction.customId==="es_travel_select"){
        const island=islandById(interaction.values[0]);
        if(p.level<island.level)return interaction.reply({content:`🔒 Dafür brauchst du Level ${island.level}.`,flags:MessageFlags.Ephemeral}).then(()=>true);
        p.islandId=island.id;p.sea=island.sea;saveDB();
        await interaction.update({embeds:[hubEmbed(interaction.guild,interaction.user,p)],components:hubRows(p)});return true;
      }
      if(interaction.customId==="es_weapon_select"){
        const id=interaction.values[0];if(!p.weaponsOwned.includes(id))return true;p.weaponId=id;saveDB();await interaction.update(inventoryPayload(p));return true;
      }
      if(interaction.customId==="es_power_select"){
        const id=interaction.values[0];if(!p.powersOwned.includes(id))return true;p.powerId=id;saveDB();await interaction.update(inventoryPayload(p));return true;
      }
    }

    if (interaction.isButton()) {
      const id=interaction.customId;
      if(id.startsWith("es_batk:")||id.startsWith("es_bpow:")||id.startsWith("es_bguard:")||id.startsWith("es_bheal:")){
        const [type,bid]=id.split(":");const b=battles.get(bid);const act={es_batk:"attack",es_bpow:"power",es_bguard:"guard",es_bheal:"heal"}[type];await battleAction(interaction,b,act);return true;
      }
      if(id.startsWith("es_duel_accept:")||id.startsWith("es_duel_decline:")){
        const [act,did]=id.split(":");const d=duelSessions.get(did);if(!d)return interaction.reply({content:"❌ Challenge abgelaufen.",flags:MessageFlags.Ephemeral}).then(()=>true);
        if(interaction.user.id!==d.bId)return interaction.reply({content:"❌ Nur der herausgeforderte Spieler kann das entscheiden.",flags:MessageFlags.Ephemeral}).then(()=>true);
        if(act==="es_duel_decline"){duelSessions.delete(did);persistSessions();await interaction.update({content:"❌ Duell abgelehnt.",components:[]});return true;}
        d.status="active";d.hpA=duelMaxHp(ensurePlayer(d.guildId,d.aId));d.hpB=duelMaxHp(ensurePlayer(d.guildId,d.bId));d.turnId=Math.random()<0.5?d.aId:d.bId;d.guardA=false;d.guardB=false;d.log=[];
        persistSessions();await interaction.update({content:"",embeds:[duelEmbed(d)],components:duelRows(d)});return true;
      }
      if(id.startsWith("es_duel_atk:")||id.startsWith("es_duel_pow:")||id.startsWith("es_duel_guard:")){
        const [act,did]=id.split(":");const d=duelSessions.get(did);if(!d||d.status!=="active")return interaction.reply({content:"❌ Duell nicht mehr aktiv.",flags:MessageFlags.Ephemeral}).then(()=>true);
        if(interaction.user.id!==d.turnId)return interaction.reply({content:"⏳ Du bist noch nicht dran.",flags:MessageFlags.Ephemeral}).then(()=>true);
        const selfId=d.turnId,otherId=selfId===d.aId?d.bId:d.aId;const self=ensurePlayer(d.guildId,selfId),other=ensurePlayer(d.guildId,otherId);
        const selfIsA=selfId===d.aId;let dmg=0;
        if(act==="es_duel_guard"){if(selfIsA)d.guardA=true;else d.guardB=true;d.log.push(`🛡️ <@${selfId}> geht in Guard.`);}else{
          dmg=Math.floor((act==="es_duel_pow"&&self.powerId?duelPower(self):duelWeapon(self))*(0.88+Math.random()*0.24));
          const mitigation=Math.min(0.42,(other.stats.defense||1)/(other.stats.defense+145));dmg=Math.max(1,Math.floor(dmg*(1-mitigation)));
          const guarded=selfIsA?d.guardB:d.guardA;if(guarded)dmg=Math.max(1,Math.floor(dmg*0.4));if(selfIsA)d.guardB=false;else d.guardA=false;
          if(selfIsA)d.hpB-=dmg;else d.hpA-=dmg;d.log.push(`${act==="es_duel_pow"?"✨":"⚔️"} <@${selfId}> trifft für **${dmg}**.`);
        }
        if(d.hpA<=0||d.hpB<=0){const winner=d.hpA>0?d.aId:d.bId,loser=winner===d.aId?d.bId:d.aId;const wp=ensurePlayer(d.guildId,winner),lp=ensurePlayer(d.guildId,loser);wp.wins++;lp.losses++;const bounty=Math.max(25,Math.floor(lp.level*1.7));wp.bounty+=bounty;wp.gold+=Math.max(100,Math.floor(lp.level*8));saveDB();duelSessions.delete(did);persistSessions();await interaction.update({embeds:[footer(new EmbedBuilder().setTitle("🏆 Duel Winner").setDescription(`<@${winner}> gewinnt!\n🏴 **+${bounty} Bounty**`))],components:[]});return true;}
        d.turnId=otherId;persistSessions();await interaction.update({embeds:[duelEmbed(d)],components:duelRows(d)});return true;
      }

      if(!id.startsWith("es_"))return false;
      const p=ensurePlayer(interaction.guild.id,interaction.user.id);
      if(id==="es_home"){await interaction.update({embeds:[hubEmbed(interaction.guild,interaction.user,p)],components:hubRows(p)});return true;}
      if(id==="es_fight"||id==="es_boss"){
        const b=startBattle(interaction.guild.id,interaction.user.id,id==="es_boss");
        await interaction.update({embeds:[battleEmbed(b)],components:battleRows(b)});return true;
      }
      if(id==="es_quest"){
        if(!p.quest){const island=islandById(p.islandId);p.quest={id:`Q${Date.now().toString(36)}`,title:`${island.name} Bounty`,islandId:island.id,targetName:island.enemy.name,target:island.questKills,progress:0,xp:island.questXp,gold:island.questGold,shards:island.sea>=2?1:0};saveDB();}
        await interaction.update({embeds:[questEmbed(p)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("es_home").setLabel("Hub").setEmoji("🌊").setStyle(ButtonStyle.Primary))]});return true;
      }
      if(id==="es_travel"){await interaction.update(travelPayload(p));return true;}
      if(id==="es_inventory"){await interaction.update(inventoryPayload(p));return true;}
      if(id==="es_stats"){await interaction.update(statsPayload(p));return true;}
      if(id==="es_power"){await interaction.update(powerPayload(p));return true;}
      if(id==="es_help"){await interaction.update({embeds:[helpEmbed()],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("es_home").setLabel("Hub").setEmoji("🌊").setStyle(ButtonStyle.Primary))]});return true;}
      if(["es_stat_str","es_stat_def","es_stat_pow"].includes(id)){
        if(p.statPoints<=0)return interaction.reply({content:"❌ Keine freien Stat-Punkte.",flags:MessageFlags.Ephemeral}).then(()=>true);
        const field=id==="es_stat_str"?"strength":id==="es_stat_def"?"defense":"power";p.stats[field]++;p.statPoints--;saveDB();await interaction.update(statsPayload(p));return true;
      }
      if(id==="es_discover"){
        const rem=Math.max(0,DISCOVERY_COOLDOWN-(Date.now()-(p.lastDiscoveryAt||0)));if(rem>0)return interaction.reply({content:`⏳ Noch ${Math.ceil(rem/60000)} Min. Cooldown.`,flags:MessageFlags.Ephemeral}).then(()=>true);
        if(p.gold<POWER_DISCOVERY_COST)return interaction.reply({content:"❌ Nicht genug Gold.",flags:MessageFlags.Ephemeral}).then(()=>true);
        p.gold-=POWER_DISCOVERY_COST;p.lastDiscoveryAt=Date.now();const force=(p.discoveryPity||0)>=10;const power=choosePower(p,force);const high=["Epic","Legendary","Mythic"].includes(power.rarity);p.discoveryPity=high?0:(p.discoveryPity||0)+1;
        let result;if(!p.powersOwned.includes(power.id)){p.powersOwned.push(power.id);p.powerMastery[power.id]=1;if(!p.powerId)p.powerId=power.id;result=`✨ Du hast **${power.name}** (${power.rarity}) entdeckt!`;}else{const refund=Math.floor(POWER_DISCOVERY_COST*0.55);p.gold+=refund;p.shards+=1;result=`♻️ **${power.name}** war ein Duplicate. Du bekommst **${refund.toLocaleString()} Gold + 1 Shard** zurück.`;}saveDB();
        await interaction.update({embeds:[footer(new EmbedBuilder().setTitle("🔮 Power Discovery").setDescription(`${result}\n\nPity: **${p.discoveryPity}/10**`))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("es_power").setLabel("Zurück zum Shrine").setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId("es_home").setLabel("Hub").setStyle(ButtonStyle.Secondary))]});return true;
      }
      return false;
    }
    return false;
  }

  function cleanup() {
    const now=Date.now();
    let changed=false;
    for(const [id,b] of battles)if(now-b.createdAt>BATTLE_TTL){battles.delete(id);changed=true;}
    for(const [id,d] of duelSessions)if(now-d.createdAt>BATTLE_TTL){duelSessions.delete(id);changed=true;}
    if(changed) persistSessions();
  }
  setInterval(cleanup,5*60*1000).unref?.();

  async function openHub(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ Element Seas funktioniert nur auf einem Discord-Server.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const p = ensurePlayer(interaction.guild.id, interaction.user.id);
    await interaction.reply({ embeds:[hubEmbed(interaction.guild,interaction.user,p)], components:hubRows(p), flags:MessageFlags.Ephemeral });
    return true;
  }

  return { handleInteraction, ensurePlayer, openHub };
}

module.exports = { buildElementSeasCommands, createElementSeas };
