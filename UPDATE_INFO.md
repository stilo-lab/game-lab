# Update v1.5.8

Dieses Update enthält genau die zwei gewünschten Bereiche:

1. **Suggestions / Einsende-Kanäle**
   - `/setup` erkennt mehrere Ideen-/Feedback-/Vorschlags-/Einsende-Kanäle.
   - Fancy-Schriften werden normalisiert.
   - Auf jede neue Einsendung reagiert der Bot mit 💡 👍 👎.
   - Funktioniert auch bei Embed-Einsendungen anderer Bots.

2. **Spotify Connect**
   - `/spotify connect`, `/spotify status`, `/spotify disconnect`
   - `/spotify start` startet die feste Playlist wirklich auf dem verbundenen Spotify-Gerät.
   - Play/Pause, Next, Previous, Shuffle, Repeat und `/spotify play nummer:1-45` steuern Spotify.
   - Musik läuft auf dem Spotify-Gerät; Spotify-Audio wird nicht in Discord rebroadcastet.

## Dateien ersetzen
- `src/index.js`
- `src/spotify_party.js`
- `package.json`
- `.env.example` (nur Vorlage; NICHT deine echte `.env` überschreiben)
- `.gitignore`

## Spotify OAuth zusätzlich
Aktiviere in Railway eine Public Domain und setze in Railway:
`SPOTIFY_REDIRECT_URI=https://DEINE-DOMAIN/spotify/callback`

Exakt dieselbe URL muss im Spotify Developer Dashboard unter Redirect URIs stehen.
Danach neu deployen und `/spotify connect` ausführen.
