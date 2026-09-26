# START_HERE – Stilo Multi-Game Bot v1.2

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
DEV_GUILD_ID=deine_server_id
GEMINI_MODEL=gemini-3.8-flash
FORTNITE_API_KEY=
COMMUNITY_TIMEZONE=Europe/Berlin
AI_INSULT_TIMEOUT_MIN=20
DISPUTE_DECLINE_TIMEOUT_MIN=30
DISPUTE_FAILED_TIMEOUT_MIN=30
DISPUTE_RESOLVED_TIMEOUT_MIN=10
```

Railway startet automatisch mit `npm start`.

## 5. In Discord einmal ausführen

```text
/setup
```

Der Bot erstellt automatisch Support, Community und die neuen privaten Staff-Bereiche:
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
