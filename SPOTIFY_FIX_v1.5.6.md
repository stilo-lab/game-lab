# Spotify Fix v1.5.6

## Problem
`/spotify start` meldete: `Spotify hat für diese Playlist keine Tracks geliefert.`

## Fix
- unterstützt das 2026-Feld `items` statt nur `tracks`
- eingebauter Fallback-Katalog für die feste Playlist mit 45 Titeln
- `/spotify start` funktioniert auch wenn Spotify keine fremden Playlist-Items liefert
- `/spotify play nummer:1-45` wählt jeden Titel aus
- aktueller Track wird bei Bedarf über Spotify Search auf einen exakten Track-Link aufgelöst
- falls Spotify Search fehlschlägt, bleibt ein Spotify-Suchlink als Fallback

## Wichtig
Der Discord-Bot rebroadcastet kein Spotify-Audio. Nutzer hören den ausgewählten Track über Spotify selbst.
