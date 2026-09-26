# GitHub + Railway – einfache Anleitung v1.2

## GitHub

1. Neues Repository erstellen.
2. **Add file → Upload files**.
3. **Alle Dateien aus diesem Bot-Ordner** hineinziehen.
4. **Commit changes**.

Nicht hochladen: echte `.env`, Bot-Token oder API-Keys.

## Railway

1. **New Project → Deploy from GitHub Repo**.
2. Repository auswählen.
3. Unter **Variables**:

Pflicht:
```env
DISCORD_TOKEN=...
OWNER_ID=...
```

Für die Professional-AI-Funktionen:
```env
GEMINI_API_KEY=...
```

Optional:
```env
BOT_NAME=Gaming Community Bot
DEV_GUILD_ID=...
GEMINI_MODEL=gemini-3.8-flash
FORTNITE_API_KEY=
COMMUNITY_TIMEZONE=Europe/Berlin
AI_INSULT_TIMEOUT_MIN=20
DISPUTE_DECLINE_TIMEOUT_MIN=30
DISPUTE_FAILED_TIMEOUT_MIN=30
DISPUTE_RESOLVED_TIMEOUT_MIN=10
```

4. Deploy starten.
5. Bot einladen.
6. In Discord `/setup` ausführen.

## Was automatisch passiert

- npm-Pakete werden installiert.
- `npm start` wird verwendet.
- Application-ID wird automatisch erkannt.
- Slash Commands werden registriert.
- `/setup` baut Community-, Support- und Staff-Struktur.
- Daily Staff Brief läuft ab ca. 09:00 Europe/Berlin.
- Weekly AI Staff Report läuft sonntags ab ca. 19:00.
- Staff-Inaktivitätscheck prüft 14+ Tage ohne protokollierte Staff-Aktion.

## Games ändern

`src/games.js`

## Staff-Knowledge anpassen

`data/staff_knowledge.json`

Dort kannst du eure internen Regeln/Richtlinien als JSON-Einträge ergänzen. Nach Commit deployed Railway automatisch neu.
