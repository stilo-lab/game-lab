# Spotify Listening Party v1.5.4

## Was neu ist

- `/spotify start` startet eine Spotify-artige Listening Party in dem Voice-Channel, in dem der User gerade ist.
- Der Bot joint den VC als Party-Host.
- Vorgefertigte Playlist:
  `https://open.spotify.com/playlist/3oVDosIUz6bQpEJIgIsEzK`
- Tracktitel, Artists, Cover, Dauer und Spotify-Links werden über die offizielle Spotify Web API geladen.
- Player-Panel mit Previous, Play/Pause, Next, Shuffle, Repeat, Queue, Sync, Track öffnen, Playlist öffnen und Stop.
- `/spotify now`, `/spotify playlist`, `/spotify stop`.
- Die Session endet nach 60 Sekunden automatisch, wenn kein menschlicher User mehr im Party-VC ist.
- `/serversetup` erstellt zusätzlich `🎧 Spotify Party` im Voice-Bereich.

## Wichtige Grenze

Spotify-Audio wird **nicht durch den Discord-Bot rebroadcastet**. Spotify untersagt das Broadcasting von Spotify-Content über die Plattform-APIs. Das System ist deshalb eine Voice-Listening-Party mit Spotify-Metadaten, Tracklinks und einem gemeinsamen Party-Player/Timer. Jeder hört den Track über Spotify selbst.

## Railway Variablen

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_MARKET=DE
SPOTIFY_PLAYLIST_URL=https://open.spotify.com/playlist/3oVDosIUz6bQpEJIgIsEzK
```

Für Client ID und Secret eine Spotify Developer App erstellen.
