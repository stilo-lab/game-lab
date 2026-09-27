# Spotify Command Fix v1.5.5

Ersetze in GitHub:
- `src/index.js`
- `src/spotify_party.js`
- `package.json`

Danach Railway neu deployen lassen.

Neu:
- Slash Commands werden global registriert.
- Zusätzlich werden sie auf allen freigegebenen Servern sofort guild-spezifisch synchronisiert.
- `/commandsync` kann vom Bot-Owner genutzt werden, um alle Commands manuell sofort neu zu registrieren.
- `/spotify start`, `/spotify now`, `/spotify playlist`, `/spotify stop` sollten danach sofort erscheinen.
