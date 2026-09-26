const GAMES = [
  { key: "fortnite", name: "Fortnite", emoji: "🪂", quiz: ["Wie heißt der Fortnite-Modus ohne Bauen?", "Zero Build"], challenges: ["Spielt eine Runde ohne Fahrzeuge.", "Wechselt nach jedem Fight die Hauptwaffe.", "Landet an einem ungewohnten Spot und bleibt als Team zusammen."] },
  { key: "roblox", name: "Roblox", emoji: "🧱", quiz: ["Wie heißt die virtuelle Roblox-Währung?", "Robux"], challenges: ["Jeder wählt ein Roblox-Game, das die anderen noch nicht kennen.", "Spielt eine Runde nur mit Standard-/Starter-Items.", "Macht eine 15-Minuten-Speedrun-Challenge in einem Obby."] },
  { key: "brawl-stars", name: "Brawl Stars", emoji: "⭐", quiz: ["Wie heißen die spielbaren Figuren in Brawl Stars?", "Brawler"], challenges: ["Spielt ein Match mit drei unterschiedlichen Rollen im Team.", "Wechselt nach jedem Sieg den Brawler.", "Spielt eine Runde ohne denselben Brawler zweimal zu benutzen."] },
  { key: "gta", name: "GTA V / GTA Online / GTA VI", emoji: "🚗", quiz: ["Wie heißt die große Stadt in GTA V?", "Los Santos"], challenges: ["Macht eine saubere Crew-Mission ohne unnötige Teamkills.", "Veranstaltet ein Community-Rennen mit zufälligen Fahrzeugen.", "Spielt eine Mission mit fest verteilten Rollen im Team."] },
  { key: "minecraft", name: "Minecraft", emoji: "⛏️", quiz: ["Welcher grüne Minecraft-Mob explodiert in der Nähe von Spielern?", "Creeper"], challenges: ["Baut in 10 Minuten ein Mini-Haus zu einem Zufallsthema.", "Sammelt als Team fünf unterschiedliche Erze.", "Startet eine kleine Build-Battle-Challenge."] },
  { key: "valorant", name: "VALORANT", emoji: "🎯", quiz: ["Wie heißen die spielbaren Charaktere in VALORANT?", "Agents"], challenges: ["Spielt eine Runde mit klaren Rollen und Callouts.", "Jeder nimmt einen Agent, den er selten spielt.", "Nach jeder Runde wechselt der Shot-Caller."] },
  { key: "rocket-league", name: "Rocket League", emoji: "🚀", quiz: ["Welche zwei Dinge verbindet Rocket League hauptsächlich?", "Autos und Fußball"], challenges: ["Spielt eine Runde ohne unnötige Doppel-Commits.", "Jeder versucht mindestens einen Assist zu machen.", "Spielt eine private Runde mit zufälligen Teams."] },
  { key: "marvel-rivals", name: "Marvel Rivals", emoji: "🦸", quiz: ["Aus welchem Universum stammen die spielbaren Figuren in Marvel Rivals?", "Marvel"], challenges: ["Baut ein Team mit klarer Frontline, Damage und Support.", "Wechselt nach jeder Runde mindestens einen Helden.", "Spielt einen Helden, den ihr selten benutzt."] },
  { key: "cod", name: "Call of Duty / Warzone", emoji: "🪖", quiz: ["Zu welchem Genre gehört Warzone hauptsächlich?", "Battle Royale / Shooter"], challenges: ["Spielt als Squad eng zusammen und markiert jedes Ziel.", "Jeder nutzt eine andere Waffenklasse.", "Eine Runde ohne unnötige Solo-Pushes."] },
  { key: "fc27", name: "EA SPORTS FC 27", emoji: "⚽", quiz: ["Welche Sportart steht bei EA SPORTS FC im Mittelpunkt?", "Fußball"], challenges: ["Spielt ein Match mit einer ungewohnten Formation.", "Jeder Angriff muss mindestens drei Pässe enthalten.", "Spielt eine Runde ohne Sprint-Spam."] },
  { key: "lol", name: "League of Legends", emoji: "🧙", quiz: ["Wie heißt die klassische 5v5-Karte von League of Legends?", "Summoner's Rift"], challenges: ["Spielt mit klarer Rollenverteilung und Objectives als Priorität.", "Nach jedem Objective bestimmt jemand anderes den nächsten Call.", "Probiert eine Teamcomp mit einem klaren gemeinsamen Plan."] },
  { key: "cs2", name: "Counter-Strike 2", emoji: "💣", quiz: ["Wie heißen die beiden klassischen Bombenplätze in Counter-Strike?", "A und B"], challenges: ["Spielt eine Runde mit konsequenten Utility-Calls.", "Nach jeder Runde wechselt der Shot-Caller.", "Kauft als Team abgestimmt statt einzeln."] },
  { key: "apex", name: "Apex Legends", emoji: "🔺", quiz: ["Wie heißen die spielbaren Charaktere in Apex Legends?", "Legends"], challenges: ["Landet zusammen und teilt Loot fair auf.", "Spielt eine Runde mit drei unterschiedlichen Klassen/Rollen.", "Keine Solo-Pushes ohne Ping oder Callout."] },
  { key: "overwatch", name: "Overwatch", emoji: "🛡️", quiz: ["Welche drei Hauptrollen gibt es in Overwatch?", "Tank, Damage und Support"], challenges: ["Spielt eine Runde mit Fokus auf Team-Ults.", "Wechselt nach jeder verlorenen Runde mindestens einen Helden.", "Jeder macht vor dem Fight einen klaren Call."] },
  { key: "dead-by-daylight", name: "Dead by Daylight", emoji: "🔦", quiz: ["Welche zwei Seiten spielen in Dead by Daylight gegeneinander?", "Killer und Survivors"], challenges: ["Survivors verteilen Aufgaben klar im Team.", "Spielt eine Runde mit einem ungewohnten Perk-Setup.", "Macht nach der Runde eine kurze Best-Moment-Abstimmung."] },
  { key: "wow", name: "World of Warcraft", emoji: "🐉", quiz: ["Wie heißt die bekannte Welt von Warcraft?", "Azeroth"], challenges: ["Macht eine Gruppenaktivität mit klaren Rollen.", "Jeder erklärt einen hilfreichen Tipp zu seiner Klasse.", "Spielt eine Session mit einem gemeinsamen Quest-Ziel."] },
  { key: "clash-royale", name: "Clash Royale", emoji: "👑", quiz: ["Was verteidigt jeder Spieler in Clash Royale?", "Türme / den Königsturm"], challenges: ["Spielt ein Friendly Battle mit zufälligen Decks.", "Jeder tauscht eine Karte seines Standarddecks aus.", "Macht ein kleines Best-of-3-Match."] },
  { key: "other", name: "Anderes Spiel / Multi-Game", emoji: "🎮", quiz: ["Wofür steht die Gaming-Abkürzung GG?", "Good Game"], challenges: ["Wählt zufällig ein Spiel aus eurer Community-Liste.", "Macht eine Best-of-3-Challenge mit wechselnden Teams.", "Jeder darf eine Runde lang den Modus bestimmen."] }
];

const GAME_CHOICES = GAMES.map(g => ({ name: g.name, value: g.key }));
const GAME_ROLE_OPTIONS = GAMES.filter(g => g.key !== "other").map(g => ({ label: g.name.slice(0, 100), value: `game_${g.key}`, emoji: g.emoji }));
const GAME_ROLE_NAMES = Object.fromEntries(GAMES.filter(g => g.key !== "other").map(g => [`game_${g.key}`, g.name]));
const GAME_ROLE_KEYS = Object.keys(GAME_ROLE_NAMES);

function getGame(key) {
  return GAMES.find(g => g.key === key) || GAMES.find(g => g.key === "other");
}

function gameName(key) {
  return getGame(key).name;
}

function gameEmoji(key) {
  return getGame(key).emoji;
}

function gameListText() {
  return GAMES.map(g => `${g.emoji} **${g.name}**`).join("\n");
}

function randomGamePrompt(key, type = "challenge") {
  const g = getGame(key);
  if (type === "quiz") return `❓ **${g.name} Schnellfrage:** ${g.quiz[0]}\n||Antwort: ${g.quiz[1]}||`;
  const pick = g.challenges[Math.floor(Math.random() * g.challenges.length)];
  if (type === "drop") return `🗺️ **${g.name} Drop / Start RNG:** ${pick}`;
  if (type === "loadout") return `🎲 **${g.name} Rules RNG:** ${pick}`;
  return `🔥 **${g.name} Challenge:** ${pick}`;
}

module.exports = {
  GAMES,
  GAME_CHOICES,
  GAME_ROLE_OPTIONS,
  GAME_ROLE_NAMES,
  GAME_ROLE_KEYS,
  getGame,
  gameName,
  gameEmoji,
  gameListText,
  randomGamePrompt
};
