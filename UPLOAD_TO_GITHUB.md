# GitHub + Railway – einfache Anleitung v1.4.4

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

4. Railway-Volume auf **`/app/data`** hinzufügen (damit DB/Coins/Cases Redeploys überleben).
5. Deploy starten.
6. Bot einladen.
7. In Discord `/setup` ausführen – oder auf einem neuen/leeren Server `/serversetup`, damit auch normale Chats, Voice und die komplette Grundstruktur erstellt werden.

## Was automatisch passiert

- npm-Pakete werden installiert.
- `npm start` wird verwendet.
- Application-ID wird automatisch erkannt.
- Slash Commands werden immer global registriert; ein optionales `DEV_GUILD_ID` registriert sie zusätzlich sofort auf dem Testserver.
- `/setup` erkennt/ergänzt Bot-, Community-, Support- und Staff-Struktur.
- `/serversetup` erstellt zusätzlich eine komplette Server-Grundstruktur mit Chat, Info, Gaming, Voice und privaten Staff-Kanälen und führt danach Smart Setup aus.
- Daily Staff Brief läuft ab ca. 09:00 Europe/Berlin.
- Weekly AI Staff Report läuft sonntags ab ca. 19:00.
- Staff-Inaktivitätscheck prüft 14+ Tage ohne protokollierte Staff-Aktion.

## Games ändern

`src/games.js`

## Staff-Knowledge anpassen

`data/staff_knowledge.json`

Dort kannst du eure internen Regeln/Richtlinien als JSON-Einträge ergänzen. Nach Commit deployed Railway automatisch neu.


### v1.4.1 Hinweis
Nach dem Deploy werden bestehende Server einmalig übernommen. Neue Server benötigen danach immer deine Freigabe per DM oder `/serverfreigabe`.

## Update auf v1.5.0
Wenn du nur von v1.4.4 aktualisierst, ersetze `src/index.js` und `package.json` und füge die neue Datei `src/element_seas.js` hinzu.
