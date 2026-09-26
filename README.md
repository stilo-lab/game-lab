# Stilo Multi-Game Community Bot v1.2

Multi-Game Discord-Bot für Fortnite, Roblox, Brawl Stars, GTA, Minecraft, VALORANT, Rocket League und viele weitere Games – jetzt zusätzlich mit einem professionellen **Staff Management + AI Moderation System**.

## Neu in v1.2 – Professional Staff / AI

- **Mod Activity Check**: echte Staff-Aktionen statt Chat-Spam zählen
- `/staffstats` und `/staffleaderboard`
- automatischer Hinweis an Owner bei 14+ Tagen ohne Staff-Aktion
- **AI Staff Performance / Daily Brief / Weekly Report**
- **AI Moderation Assistant** + `/modassist`
- **Case-System** mit `CASE-00001` IDs, Notizen, User-History und AI Case Summary
- **Punishment History**
- **Staff Audit Log**
- **Server Health Report**
- **Shift / Duty System**
- **Staff Tasks + Deadline Reminder**
- **AI Staff Knowledge Assistant** (`/staffai`)
- editierbare Knowledge Base: `data/staff_knowledge.json`
- **Staff Application AI Review** ohne automatische Annahme/Ablehnung
- **AI Internal Alerts** bei ungewöhnlich vielen Staff-Strafen
- **Raid / Mass-Mention / koordinierter Duplicate-Spam Detection**
- **private AI-Streit-Schlichtung** mit Beweis-/Screenshot-Unterstützung

## AI-Streit-/Beleidigungslogik

Der Bot bestraft **nicht sofort wegen einer einzelnen Beleidigung**.

1. Ein verdächtiger Chat wird mit Kontext analysiert.
2. Erstes starkes Signal → nur internes **„AI is observing“**.
3. Wiederholte bestätigte einseitige Beleidigung/Eskalation → konfigurierbarer Timeout + Owner-DM + Case.
4. Erkennt die AI einen gegenseitigen Streit, wird stattdessen eine Schlichtung angeboten.
5. Beide Nein → beide Timeout.
6. Mindestens einer Ja → privater Mediation-Channel; AI antwortet auf die Beiträge beider Seiten, fragt Anliegen, Vorwurf, gewünschte Lösung und Beweise ab.
7. Beide „Streit gelöst“ → 10 Minuten Cooldown-Timeout für beide.
8. Beide „Close – ungelöst“ → längerer Timeout für beide.

Die AI entscheidet nicht automatisch über Ban-Appeals oder Schuld in schweren Vorwürfen; solche Fälle können vom Staff über Cases und AI-Zusammenfassungen geprüft werden.

## Bestehende Hauptfunktionen

- Advanced Tickets: AI Yes/No, Claim, Transcript, Reopen, Bewertung, Auto-Close
- Multi-Game Teamsearch + Ready Check
- Coins, Daily Quests, Seasons, Profile, Leaderboards
- Squads / Clans + temporäre Voice-Channels
- Multi-Game Community Events
- Giveaways + Claim
- Level, Invites, Counting
- Anti-Spam, Timeout, Ban
- Self-Roles, Suggestions, Starboard, Clips, Member of the Week, Geburtstage, Polls
- Multi-Game Minigames
- Fortnite News / Shop / Favoriten optional
- Owner Status Panel + globale Announcements
- `Made with ❤️ by Stilo`

**Keine Turniere, keine Scrims, keine Custom Games.**

## Setup

Lies **`START_HERE.md`**. Kurz:

1. Dateien in GitHub hochladen.
2. GitHub-Repo mit Railway verbinden.
3. `DISCORD_TOKEN` + `OWNER_ID` setzen.
4. Für AI zusätzlich `GEMINI_API_KEY`.
5. Deploy.
6. `/setup`.

## Wichtige Dateien

- `src/index.js` – Hauptbot, Tickets, Moderation, Teamsearch, Giveaways, AI
- `src/community.js` – Community-Systeme
- `src/staff.js` – Professional Staff, Cases, AI Moderation, Mediation, Health, Shifts, Tasks
- `src/games.js` – zentrale Game-Liste
- `data/faq.json` – Support-FAQ
- `data/staff_knowledge.json` – interne Staff-Knowledge-Base
- `data/db.json` – Laufzeitdaten

Für Railway ist ein **Persistent Volume** empfehlenswert, damit `data/db.json` Redeploys überlebt.
