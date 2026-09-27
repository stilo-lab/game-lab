# START_HERE – Stilo Multi-Game Bot v1.4.4

## Neu in v1.4.4: Member Hub

Normale Mitglieder können **`/member`** nutzen. Dort gibt es Daily Reward/Streak, Quests, Profil und Coin-Shop. Mit **`/thanks @user`** können hilfreiche Mitglieder Reputation sammeln. Dafür ist kein zusätzlicher API-Key nötig.


## Neu in v1.4.0: `/learn`

`/learn add` hat jetzt zwei wichtige Auswahlen: **Ziel** (`/ai`, Support AI, beide) und **Art** (Verhalten/Stil oder Wissen/Fakt). Für Sätze wie **„Kling freudiger“** immer **Verhalten / Stil** wählen. Dadurch wird die Anweisung dauerhaft auf jede Antwort der gewählten AI angewendet.

Das Setup bleibt absichtlich einfach.

## Pflicht: nur 2 Werte

```env
DISCORD_TOKEN=dein_bot_token
OWNER_ID=deine_discord_user_id
```

Für die neuen **AI-Funktionen** solltest du zusätzlich `GEMINI_API_KEY` setzen. Ohne Gemini funktionieren Tickets, Staff-Cases, Activity, Shifts, Tasks, Audit und normale Moderation weiter, aber AI-Erkennung/Schlichtung/Staff-AI nicht.

## 1. Discord-Bot erstellen

1. Öffne das Discord Developer Portal und erstelle eine Application + Bot.
2. Unter **Bot** aktivieren:
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
3. Bot-Token kopieren → `DISCORD_TOKEN`.
4. In Discord Entwicklermodus aktivieren und deine User-ID kopieren → `OWNER_ID`.

## 2. Bot einladen

**OAuth2 → URL Generator**

Scopes:
- `bot`
- `applications.commands`

Für den einfachen Start: **Administrator**. So funktionieren Auto-Setup, private Mediation-Channels, Timeouts und Staff-Logs ohne einzelnes Rechte-Puzzle.

## 3. Auf GitHub hochladen

1. Neues Repository.
2. **Add file → Upload files**.
3. Den kompletten Inhalt dieses Ordners hochladen.
4. Commit.

**Nie** eine echte `.env` oder deinen Token hochladen.

## 4. Railway

1. **New Project → Deploy from GitHub Repo**.
2. Repository auswählen.
3. Unter **Variables** mindestens:

```env
DISCORD_TOKEN=...
OWNER_ID=...
```

Für alle AI-Systeme zusätzlich:

```env
GEMINI_API_KEY=...
```

Optional:

```env
BOT_NAME=Gaming Community Bot
DEV_GUILD_ID=deine_server_id  # optional; Commands werden trotzdem immer global registriert
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_SUPPORT_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_MIN_INTERVAL_MS=4500
GEMINI_SUPPORT_MIN_INTERVAL_MS=12500
FORTNITE_API_KEY=
COMMUNITY_TIMEZONE=Europe/Berlin
AI_INSULT_TIMEOUT_MIN=20
DISPUTE_DECLINE_TIMEOUT_MIN=30
DISPUTE_FAILED_TIMEOUT_MIN=30
DISPUTE_RESOLVED_TIMEOUT_MIN=10
```

Railway startet automatisch mit `npm start`.

## 4a. Railway Volume – wichtig für gespeicherte Daten

Füge deinem Railway-Service ein **Volume** hinzu und mounte es auf:

```text
/app/data
```

Sonst können `data/db.json`, Cases, Coins, Level, Staff-Aktivität und Tasks bei einem Redeploy verloren gehen.

## 5. In Discord einmal ausführen

Wenn dein Server schon aufgebaut ist und der Bot nur seine Systeme erkennen/einrichten soll:

```text
/setup
```

Wenn es ein neuer/leerer Server ist und der Bot **auch die komplette Serverstruktur mit normalen Chats und Voice** bauen soll:

```text
/serversetup
```

`/serversetup` erstellt u. a. Start/Info, General-/Gaming-Chat, Off-Topic, Media, Clips, Memes, Bot-Commands, Teamsearch, Events, Squads, Support, FAQ, mehrere Voice-Channels und private Staff-Channels. Danach führt er automatisch das normale Smart Setup aus. Vorhandene passende Channels werden wiederverwendet; nichts wird gelöscht.

Der Bot erstellt/ergänzt automatisch Support, Community und die privaten Staff-Bereiche:
- `staff-audit`
- `ai-staff-alerts`
- `mod-cases`
- `staff-briefing`
- `staff-tasks`
- private `AI • MEDIATION` Kategorie

Danach deinen Mods die automatisch erzeugte **Support Team** Rolle geben.

## 6. Neue Professional-Commands testen

```text
/staffstats
/staffleaderboard
/serverhealth
/case user
/staffai
/shift start
/stafftask list
/staffbrief
/modassist
```

## AI-Moderation wichtig

- Eine einzelne erkannte Beleidigung = **kein sofortiger Timeout**.
- Der Bot beobachtet erst und protokolliert das erste starke Signal intern.
- Erst bei erneuter bestätigter Eskalation kann ein Timeout folgen; der Owner bekommt eine DM.
- Bei erkennbar gegenseitigem Streit bietet der Bot zuerst **AI-Schlichtung** an.
- Wenn beide **Nein** wählen → beide Timeout (Standard 30 min).
- Wenn mindestens einer **Ja** wählt → privater Schlichtungs-Channel.
- Wenn beide **Streit gelöst** wählen → beide 10 Minuten Cooldown-Timeout.
- Wenn beide **Close – ungelöst** wählen → beide Timeout (Standard 30 min).

Die Timeout-Zeiten sind über die Railway-Variablen oben änderbar.

**Turniere, Scrims und Custom Games bleiben entfernt.**

## Suggestions-Menü v1.3.3

`/suggestions` öffnet ein interaktives Menü mit **Vorschlag erstellen**, **Meine Vorschläge** und **Top Vorschläge**. `/suggestionspanel` kann von Admins genutzt werden, um das öffentliche Menü im Suggestions-Channel neu zu posten/aktualisieren. `/setup` prüft nur, ob ein passender Suggestions-Kanal vorhanden ist; es erstellt oder verändert keinen Kanal.


## Neue Funktionen in v1.3.4

- Giveaway-Ziehung mit Animation und sicherem Claim-Button für Gewinner.
- 🌐 wird automatisch an normale Textnachrichten gehängt. Klickt ein User auf 🌐, übersetzt Gemini die Nachricht. Keine zusätzliche Einrichtung nötig, solange `GEMINI_API_KEY` gesetzt ist.


## AI Community Pulse
Teste nach dem Deploy `/aipulse`. Der Bot analysiert die letzten Nachrichten im aktuellen Channel und kann für Staff einen Announcement-Draft erstellen.

## Smart Setup v1.3.8

Wenn der Bot online ist, führe `/setup` als Administrator aus. Der Bot analysiert vorhandene lesbare Textkanäle und bis zu 20 der letzten Nachrichten pro Kanal. Er erkennt auch dekorative/Fancy-Unicode-Namen. **Wichtig: `/setup` erstellt ab v1.4.3 keine Kanäle mehr.** Stattdessen öffnet sich ein privates Setup-Fenster mit den erkannten und fehlenden Kanälen. Fehlende Kanäle kannst du manuell anlegen und danach über **Neu prüfen** erneut scannen. Für einen komplett automatisch erstellten Server gibt es weiterhin `/serversetup`.

Beispiele: `ticket`, `🎫・𝕋𝕚𝕔𝕜𝕖𝕥`, `ᴛɪᴄᴋᴇᴛ` oder ein Hilfe-Kanal mit Support-Verlauf können als Ticket-/Support-Kanal erkannt werden. `matesearch`, `lfg`, `ideen`, `vorschläge`, `rollen` usw. werden entsprechend zugeordnet.

Mit `GEMINI_API_KEY` nutzt `/setup` zusätzlich die AI für die Zuordnung. Ohne Gemini funktioniert weiterhin die lokale Fancy-Font-/Keyword-Erkennung. Der Bot liest nur Kanäle, auf die er bereits Zugriff hat.


## Community-Frage des Tages

Nach `/setup` gibt es einen Bereich **#community-fragen**. Ein Admin startet dort mit:

```text
/communityfrage neu
```

Optional kann ein Thema angegeben werden. Mitglieder antworten über den Button **💬 Antworten**.

## Neue Server bestätigen
Wenn jemand deinen Bot auf einen weiteren Discord-Server hinzufügt, bekommst du als Bot-Owner automatisch eine DM. Der Bot bleibt dort komplett gesperrt, bis du **Server freigeben** drückst. Mit **Ablehnen & verlassen** verlässt er den Server wieder. Als Fallback gibt es `/serverfreigabe`.

## Element Seas testen
Nach dem Deployment werden die neuen Commands global registriert. Teste zuerst `/elementseas`. Für PvP kannst du `/seaduel @user` verwenden.
