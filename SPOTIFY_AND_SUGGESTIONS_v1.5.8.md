# v1.5.8 – Suggestions + Spotify Connect

## 1) Suggestions / Einsende-Kanäle
`/setup` erkennt jetzt nicht nur `suggestions`, sondern auch z. B. `ideen`, `feedback`, `vorschläge`, `einsenden`, `submit`, `submissions` und Fancy-Schriften davon.

- Es können mehrere Einsende-Kanäle gleichzeitig erkannt werden.
- Der Bot speichert alle erkannten Einsende-Kanäle.
- Auf jede neue Einsendung reagiert er automatisch mit `💡`, `👍`, `👎`.
- Das gilt auch für Embed-Posts anderer Suggestion-Bots.
- Eigene Bot-Nachrichten werden ignoriert.
- `/setup` erstellt weiterhin keine neuen Kanäle.

## 2) Spotify Connect – Musik startet wirklich
Spotify-Audio wird nicht in Discord rebroadcastet. Stattdessen steuert der Bot ein echtes Spotify-Gerät über Spotify Connect.

Neue Commands:
- `/spotify connect` – Admin verbindet ein Spotify-Konto.
- `/spotify status` – zeigt Verbindung und Spotify-Geräte.
- `/spotify start` – startet die feste Playlist auf dem verbundenen Spotify-Gerät.
- `/spotify play nummer:<1-45>` – startet einen bestimmten Playlist-Titel.
- `/spotify now` – zeigt den aktuellen Track.
- `/spotify stop` – pausiert Spotify und beendet die Party.
- `/spotify disconnect` – trennt die Spotify-Verbindung.

### Railway / Spotify OAuth
Zusätzlich zu `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` braucht Spotify Connect eine öffentliche Callback-URL.

1. In Railway eine **Public Domain** für den Bot-Service aktivieren.
2. Die Callback-URL ist dann z. B.:
   `https://DEINE-DOMAIN.up.railway.app/spotify/callback`
3. Exakt diese URL im Spotify Developer Dashboard als Redirect URI eintragen.
4. In Railway als `SPOTIFY_REDIRECT_URI` speichern.
5. Bot neu deployen und in Discord `/spotify connect` ausführen.
6. Spotify auf PC/Handy öffnen. Für Player-Steuerung ist Spotify Premium erforderlich.

`data/spotify_auth.json` speichert Refresh-Tokens lokal und ist in `.gitignore`, damit diese nicht auf GitHub landen.
