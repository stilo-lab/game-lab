# Spotify Listening Party Update v1.5.4

Ausgehend von Bot v1.5.3.

In GitHub ersetzen/hinzufuegen:
- `src/index.js` ersetzen
- `src/spotify_party.js` neu hinzufuegen
- `package.json` ersetzen
- `.env.example` optional ersetzen

Railway Variablen hinzufuegen:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- optional `SPOTIFY_MARKET=DE`
- optional `SPOTIFY_PLAYLIST_URL=https://open.spotify.com/playlist/3oVDosIUz6bQpEJIgIsEzK`

Danach neu deployen und `/spotify start` in einem Textchannel ausfuehren, waehrend du in einem Voice-Channel bist.
