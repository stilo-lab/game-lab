# Stilo Multi-Game Community Bot v1.4.4


## v1.4.4 – Member Hub für normale Mitglieder

- Neuer Command **`/member`** öffnet ein persönliches Member-Menü mit Level, Coins, Streak, Helpful-Punkten, Nachrichten und Teamsearches.
- **🎁 Daily Reward** direkt im Member Hub: Coins + Season XP; bei täglichem Abholen steigt die Streak und damit die Coin-Belohnung.
- Neue Streak-Badges bei **7 Tagen** und **30 Tagen**.
- Neuer Command **`/thanks @user`**: Member können hilfreiche Community-Mitglieder auszeichnen. Self-Thanks/Bots sind gesperrt; es gibt Cooldowns gegen Spam/Farming.
- Empfänger erhalten einen **Helpful-Punkt** und eine kleine Coin-Belohnung. Neue Badges: **Helpful Member** und **Community Hero**.
- Leaderboard unterstützt jetzt zusätzlich **Helpful**.
- Das Welcome-Panel hat einen direkten **✨ Member Hub** Button.


## v1.4.3 – `/setup` erstellt keine Kanäle mehr

- `/setup` ist jetzt ein **reiner Setup-Check** und erstellt **keine Textkanäle, Voice-Channels oder Kategorien**.
- Der Bot scannt weiterhin bestehende Kanäle, Fancy-/Unicode-Schriften und – mit Gemini – den Nachrichtenverlauf.
- Danach öffnet sich ein **privates Setup-Fenster** mit allen erkannten und fehlenden Bot-Kanälen.
- Über **Neu prüfen** kann nach manuell angelegten/umbenannten Kanälen direkt erneut gescannt werden.
- Über das Auswahlmenü kann ein fehlender Kanal ausgewählt werden; der Bot erklärt dann, wofür er gebraucht wird und welche alternativen Namen erkannt werden.
- `/serversetup` bleibt der bewusst getrennte Command, der eine komplette Serverstruktur **aktiv erstellen** darf.

## v1.4.2 – Komplettes `/serversetup`

- Neuer Admin-Command **`/serversetup`** baut eine komplette Gaming-Community-Serverstruktur auf, ohne bestehende Kanäle zu löschen.
- Erstellt bzw. verwendet Kategorien für **Info, Community, Teamsearch, Events, Squads, Support, Voice und Staff**.
- Grundkanäle: `welcome`, `rules`, `announcements`, `server-info`, `changelog`, `general-chat`, `gaming-chat`, `off-topic`, `media`, `clips`, `memes`, `bot-commands`, `teamsearch`, `events`, `squad-hub`, `support`, `faq`, `staff-chat` und `staff-commands`.
- Voice-Bereich: **General, Gaming 1, Gaming 2, Chill und AFK**.
- `welcome`, `rules`, `announcements`, `server-info`, `changelog` und `faq` werden bei neu erstellten Channels als Info-/Read-only-Bereiche angelegt.
- `staff-chat` und `staff-commands` sind privat für die **Support Team** Rolle und den Bot. Öffentliche gleichnamige Kanäle werden aus Sicherheitsgründen nicht als Staff-Kanal wiederverwendet.
- Der Bot postet automatisch Starter-Panels für Regeln, Welcome, Server-Übersicht, Bot-Commands und FAQ.
- Danach läuft automatisch das normale **Smart Setup**: Tickets, Suggestions, Rollen, Quests, Community-Fragen, Staff-Systeme usw. werden ergänzt.
- Das Setup ist **idempotent**: erneutes Ausführen verwendet vorhandene passende Kanäle statt alles doppelt anzulegen.


## v1.4.0 – `/learn` wirklich wirksam + getrennte AI-Ziele

- `/learn add` fragt jetzt **welche AI** lernen soll: **🤖 `/ai`**, **🎫 Support AI** oder **🔁 beide**.
- Zusätzlich wählst du **🎨 Verhalten / Stil** oder **📚 Wissen / Fakt**.
- Stil-Anweisungen wie **„Kling freudiger“**, **„Antworte kürzer“** oder **„Sei lockerer“** werden jetzt als dauerhafte System-Anweisung an die gewählte AI gegeben und nicht mehr nur als optionales Wissen behandelt.
- Fakten werden weiterhin nur verwendet, wenn sie zur aktuellen Frage passen.
- Alte `/learn`-Einträge bleiben kompatibel. Alte Sätze, die klar wie Stil-/Verhaltensregeln aussehen (z. B. „Kling freudiger“), werden automatisch als Anweisung erkannt.
- `/learn list` zeigt jetzt Ziel und Art jedes Eintrags und kann optional nach AI gefiltert werden.
- `/learn` wirkt jetzt gezielt nur auf **normale `/ai`** und/oder **Support AI** und läuft nicht versehentlich in Moderationsklassifizierung oder Staff-AI hinein.

## v1.3.9 – Community-Frage des Tages

- Neuer Command **`/communityfrage`** mit `heute`, `neu` und `ergebnis`.
- Admins können mit `/communityfrage neu` eine neue Frage starten; optional mit einem Thema wie Roblox, GTA oder allgemein.
- Gemini formuliert eine kurze, lockere Frage; wenn AI gerade nicht verfügbar ist, nimmt der Bot automatisch eine gute Ersatzfrage.
- Die Frage wird in **#community-fragen** gepostet und bekommt automatisch einen eigenen Antwort-Thread.
- Mitglieder klicken auf **💬 Antworten** und bekommen ein Modal statt den Channel mit Einzelantworten vollzuspammen.
- Die erste Antwort gibt **10 Community Coins + 5 Season XP**.
- Eine Antwort kann später aktualisiert werden; der Bot editiert dann auch den bestehenden Thread-Post.
- **🧠 AI Recap** fasst die Community-Antworten neutral zusammen, ohne Gewinner oder Rankings zu erfinden.
- Der Kanal **#community-fragen** wird von `/setup` erkannt und im Setup-Check als fehlend angezeigt, falls er noch nicht existiert. `/serversetup` kann ihn automatisch anlegen.

## v1.3.8 – AI Smart Setup

- `/setup` scannt zuerst **alle lesbaren Textkanäle** des Servers und liest pro Kanal den aktuellen Nachrichtenverlauf (bis zu 20 letzte Nachrichten).
- Gemini bewertet **Kanalname, Topic, Kategorie und Nachrichtenverlauf**, bevor der Bot entscheidet, wofür ein vorhandener Kanal genutzt werden kann.
- Beispiel: Ein vorhandener Kanal `ticket`, `𝕋𝕚𝕔𝕜𝕖𝕥`, `ᴛɪᴄᴋᴇᴛ`, `hilfe` oder ein Kanal, dessen Verlauf klar Support zeigt, kann automatisch als Support-/Ticket-Kanal erkannt werden.
- Dasselbe gilt u. a. für Matesearch/LFG, Suggestions, Rollen, Counting, Events, Quests, Coin-Shop, Welcome, Staff-Logs, Cases und Briefings.
- **Fancy-/Unicode-Schriften** werden zusätzlich lokal normalisiert, sodass Smart Setup auch ohne Gemini viele dekorative Kanalnamen erkennt.
- `/setup` erstellt nichts mehr: vorhandene passende Kanäle werden erkannt und fehlende Bereiche nur im Setup-Fenster aufgelistet.
- Die Erkennung bleibt erhalten; tatsächliches Erstellen/Installieren einer vollständigen Struktur erfolgt bewusst nur über `/serversetup`.
- Private Staff-/Log-Kanäle werden nur wiederverwendet, wenn sie für `@everyone` tatsächlich privat sind.
- Aktive private Ticket-Fälle (`ticket-owner:`) werden niemals als öffentlicher Ticket-Panel-Kanal missverstanden.
- Nach dem Setup zeigt der Bot, wie viele Kanäle geprüft und welche Zuordnungen erkannt wurden.

## v1.3.6 – AI Community Pulse

- `/aipulse` analysiert 15–100 der letzten normalen Textnachrichten im aktuellen Channel.
- Zeigt Top-Themen, offene Fragen, Probleme/Hinweise und sinnvolle nächste Schritte.
- **Refresh** aktualisiert die Analyse mit neuen Nachrichten.
- **Offene Fragen** zeigt eine kompakte To-do-Ansicht.
- Staff/Admins können mit **Announcement Draft** aus dem Channel-Kontext einen neutralen Community-Post erzeugen und nach Bestätigung posten.
- Der Pulse liest nur den Channel, in dem der Command benutzt wird, und speichert die Analyse nur kurzzeitig im Arbeitsspeicher.



## v1.3.5 – Smarter `/ai`

- `/ai` merkt sich die letzten Nachrichten eines Nutzers für ca. 30 Minuten.
- Folgefragen werden im Zusammenhang mit der vorherigen Antwort verstanden.
- Wiederholte Fragen bekommen bewusst einen anderen Lösungsweg statt fast derselben Antwort.
- Weniger Standardfloskeln und weniger wiederholte Einleitungen/Schlusssätze.
- Antwortlänge passt sich stärker an die Frage an.
- `/learn`-Wissen bleibt weiterhin serverbezogen eingebunden.
- Der Gesprächsverlauf ist nur temporär im Arbeitsspeicher und wird nicht dauerhaft gespeichert.


## v1.3.4 – Giveaway Animation + One-Click Translation

- Giveaways haben jetzt eine sichtbare **Ziehungsanimation** mit mehreren Fortschrittsstufen und Winner-Reveal.
- Gewinner bekommen am Ende einen **Claim-Button**. Nur tatsächlich gezogene Gewinner können claimen.
- Bei mehreren Gewinnern kann jeder genau einmal claimen; danach wird der Button automatisch deaktiviert.
- Der Owner erhält bei jedem erfolgreichen Claim eine DM.
- Der Bot setzt auf normale Textnachrichten automatisch das Emoji **🌐**.
- Reagiert ein User mit **🌐**, wird die Nachricht per Gemini übersetzt.
- Die Übersetzung geht zuerst privat per DM an den reagierenden User; falls DMs blockiert sind, erscheint sie kurz im Channel und wird wieder gelöscht.
- Standard: Nicht-deutsche Nachrichten → Deutsch; bereits deutsche Nachrichten → Englisch. Das Ziel ist per Railway-Variable änderbar.
- Übersetzungen werden pro Nachricht zwischengespeichert, damit mehrere Reaktionen nicht unnötig viele Gemini-Anfragen verbrauchen.

## v1.3.2 – Matesearch UI Fix

- `/teamsearch` zeigt jetzt direkt die sichtbare **Matesearch-Karte** statt nur „erstellt“.
- **Join** fügt den Spieler sofort zum privaten Team-Channel hinzu.
- Karte zeigt live Mitglieder und freie Plätze.
- Bei vollem Team wird **Join** automatisch deaktiviert.
- **Leave** entfernt den Zugriff wieder, **Close** beendet die Suche.


Multi-Game Discord-Bot für Fortnite, Roblox, Brawl Stars, GTA, Minecraft, VALORANT, Rocket League und viele weitere Games – jetzt zusätzlich mit einem professionellen **Staff Management + AI Moderation System**.

## v1.3.2 – Runtime-/AI-Fixes

- `/setup`-Crash **`TypeError: teamsearch is not a function`** behoben.
- Discord.js-Warnung zum alten `ready`-Event behoben (`clientReady`).
- veraltete `ephemeral: true`-Antworten auf `MessageFlags.Ephemeral` umgestellt.
- wichtige async Command-Handler werden jetzt korrekt `await`et, damit Fehler im zentralen Handler landen statt als unhandled rejection den Prozess zu treffen.
- Slash Commands werden **immer global** registriert; `DEV_GUILD_ID` ist nur noch eine zusätzliche schnelle Testserver-Registrierung.
- Gemini-Aufrufe haben Queue/Abstand + Retry bei `429/503`.
- Ticket-AI nutzt bevorzugt `GEMINI_SUPPORT_MODEL` und fällt bei Überlastung/Free-Tier-Problemen automatisch auf ein Modell **ohne Google Search** zurück, statt einfach still zu sterben.
- Scam-/Staff-Vorwürfe wie **„einer von euren Mods hat mich gescammt“** werden sofort an menschlichen Support übergeben.
- Fehlender `GEMINI_API_KEY` wird sichtbar gemeldet; Tickets bleiben offen.
- `data/db.json` wird atomarer gespeichert, damit ein abgebrochener Schreibvorgang die DB weniger leicht beschädigt.

## Neu in v1.3 – Professional Staff / AI

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
- Giveaways + animierte Ziehung + sicherer Winner-Claim
- Level, Invites, Counting
- Anti-Spam, Timeout, Ban
- Self-Roles, Suggestions, Starboard, Clips, Member of the Week, Geburtstage, Polls
- Multi-Game Minigames
- Fortnite News / Shop / Favoriten optional
- Owner Status Panel + globale Announcements
- 🌐 One-Click Übersetzung per Reaktion
- `Made with ❤️ by Stilo`

**Keine Turniere, keine Scrims, keine Custom Games.**

## Setup

Lies **`START_HERE.md`**. Kurz:

1. Dateien in GitHub hochladen.
2. GitHub-Repo mit Railway verbinden.
3. `DISCORD_TOKEN` + `OWNER_ID` setzen.
4. Für AI zusätzlich `GEMINI_API_KEY`.
5. Deploy.
6. Für nur die Bot-Systeme: `/setup`. Für einen komplett neuen Server inklusive Chats/Voice: `/serversetup`.

## Wichtige Dateien

- `src/index.js` – Hauptbot, Tickets, Moderation, Teamsearch, Giveaways, AI
- `src/community.js` – Community-Systeme
- `src/staff.js` – Professional Staff, Cases, AI Moderation, Mediation, Health, Shifts, Tasks
- `src/games.js` – zentrale Game-Liste
- `data/faq.json` – Support-FAQ
- `data/staff_knowledge.json` – interne Staff-Knowledge-Base
- `data/db.json` – Laufzeitdaten

Für Railway ist ein **Persistent Volume auf `/app/data` stark empfohlen**, damit Cases, Coins, Level, Staff-Aktivität und `data/db.json` Redeploys überleben.


## 🧠 `/learn` – `/ai` oder Support AI gezielt beibringen

Nur Administratoren können `/learn` verwenden. Beim Hinzufügen wählst du jetzt **Ziel** und **Art**:

- `ziel: /ai` – nur die normale `/ai`-KI lernt es
- `ziel: Support AI` – nur die Ticket-/Support-KI lernt es
- `ziel: Beide` – beide lernen es
- `art: Verhalten / Stil` – dauerhafte Anweisung, z. B. `Kling freudiger`, `Antworte kürzer`, `Nutze mehr Beispiele`
- `art: Wissen / Fakt` – Server-Fakt, FAQ oder Regel, die nur bei passenden Fragen verwendet wird

Beispiel für einen echten Stil-Learn:

`/learn add ziel:/ai art:Verhalten / Stil wissen:Kling freudiger und motivierender.`

Beispiel für Support-Wissen:

`/learn add ziel:Support AI art:Wissen / Fakt thema:Käufe wissen:Bei Kaufproblemen zuerst nach Screenshot und Transaktions-ID fragen.`

Weitere Commands:

- `/learn list` – zeigt Ziel, Art und Inhalt; optional nach Ziel filtern
- `/learn delete id:<K-ID>` – einzelnen Eintrag löschen
- `/learn clear` – alle `/learn`-Einträge dieses Servers löschen

Die Einträge werden **nur auf dem jeweiligen Discord-Server** gespeichert. Stil-Anweisungen werden bei jeder Antwort der gewählten AI mitgegeben; Fakten nur wenn sie relevant sind.

## Suggestions-Menü v1.3.3

`/suggestions` öffnet ein interaktives Menü mit **Vorschlag erstellen**, **Meine Vorschläge** und **Top Vorschläge**. `/suggestionspanel` kann von Admins genutzt werden, um das öffentliche Menü im Suggestions-Channel neu zu posten/aktualisieren. `/setup` prüft nur, ob ein passender Suggestions-Kanal vorhanden ist; es erstellt oder verändert keinen Kanal.


## AI-Verbesserung (v1.3.8)

Mit `/verbesserung` koennen Administratoren echte AI-Antworten pruefen und verbessern.

1. `/verbesserung` ausfuehren.
2. **Normale AI** oder **Support AI** waehlen.
3. Eine der letzten 10 echten Fragen auswaehlen.
4. Frage und damalige Bot-Antwort pruefen.
5. **Verbesserung** anklicken und z. B. schreiben: `Du solltest lieber so antworten ...`.

Die Verbesserung wird serverbezogen gespeichert und bei zukuenftigen aehnlichen Antworten der ausgewaehlten AI als Admin-Feedback beruecksichtigt. Der Command ist nur fuer Administratoren sichtbar/nutzbar.

## 🔐 Server-Freigabe durch den Bot-Owner

Ab v1.4.1 muss **jeder neu hinzugefügte Server zuerst vom Bot-Owner freigegeben werden**. Direkt nach dem Join ist der Bot auf diesem Server gesperrt: keine Commands, keine AI, keine automatische Moderation, keine Reaktionen und keine Community-Automation.

Der Bot-Owner bekommt automatisch eine DM mit Servername, Server-ID, Mitgliederzahl und Server-Owner sowie zwei Buttons:

- **✅ Server freigeben** – aktiviert den Bot auf diesem Server.
- **❌ Ablehnen & verlassen** – der Bot verlässt den Server wieder.

Falls die DM verloren geht, kann der Bot-Owner zusätzlich `/serverfreigabe list`, `/serverfreigabe approve server_id:...` und `/serverfreigabe reject server_id:...` verwenden. Beim ersten Start mit v1.4.1 werden bereits verbundene Server automatisch als freigegeben übernommen, damit bestehende Setups nicht plötzlich gesperrt werden.

## 🌊 Element Seas (v1.5.0)

Element Seas ist ein persistentes Discord-RPG mit einem eigenen Fortschrittssystem. Es ist von Open-World-Anime-Piraten-RPGs inspiriert, nutzt aber eigene Namen, Inseln, Gegner, Bosse, Powers und Items.

### Commands
- `/elementseas` – öffnet den persönlichen Game Hub
- `/seaprofile [user]` – Profil, Level, Gold, Bounty, Build, Mastery und PvP
- `/seaduel @user` – fordert einen anderen Spieler zu einem rundenbasierten PvP-Duell heraus
- `/sealeaderboard` – Server-Rangliste nach Level/Bounty

### Gameplay
- Level 1–500
- 3 Seas und mehrere freischaltbare Inseln
- Insel-Quests mit Bonus-XP/Gold
- normale Gegner + Insel-Bosse
- Boss-Drops und Weapon-Mastery
- 8 eigene Powers mit Power-Mastery
- transparente Discovery-Chancen + Pity-System
- Strength / Defense / Power Stat-Builds
- Inventar, Potions, Gold und Shards
- Bounty, PvP-Siege und Niederlagen
- gesamter Fortschritt wird in `data/db.json` gespeichert

Power Discoveries verwenden ausschließlich erspieltes Ingame-Gold. Es gibt keinen Echtgeld-Lootbox-Zwang.
