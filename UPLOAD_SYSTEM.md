# YouTube Uploads – v1.7.3

Fertiggestellt am 30.09.2026 für den vorhandenen Stilo Multi-Game Community Bot.

## Änderungen

- Eigenes Menü `/uploads` mit Link-Formular und Discord-Kanalauswahl.
- Weiterhin `/youtube add|list|remove|test|check`; optionale Rollen-Pings.
- Videos und Shorts aus dem öffentlichen Kanal-Feed, Vorschau und Link-Button.
- Mehrere Abos, Pausieren/Fortsetzen, Kanalwechsel und Testmeldungen.
- Keine nachträglichen Meldungen der beim Einrichten vorhandenen Videos.
- Persistente Warteschlange: fehlgeschlagene Zustellungen werden erneut versucht.
- Schutz vor doppelten Meldungen über gespeicherte Video-IDs, Discord-Nonce und Verlaufskontrolle.
- Einmaliger Import früherer YouTube-Abos inklusive IDs, Rollen und bekannter Video-IDs.
- Die bisherige YouTube-Abfrage wird durch genau ein neues System ersetzt, damit keine zwei Timer dieselben Uploads melden.

## Schutz der bestehenden Funktionen

Das neue System verwendet `src/youtube_uploads.js` und `src/youtube_uploads_core.js`. Die Einbindung im Hauptbot besteht aus Laden, Command-Registrierung, Start und Weiterleitung seiner eigenen Interaktionen. Fehler bei YouTube werden getrennt behandelt. Das Modul verwendet eine eigene JSON-Datei; die Hauptdatenbank wird nicht bearbeitet.

`src/community.js`, `src/staff.js`, `src/games.js`, `src/element_seas.js` und `src/spotify_party.js` sind bytegenau unverändert gegenüber der zuletzt gespeicherten vollständigen v1.7.2. Diese Fassung enthält die inzwischen aktualisierte Spotify-Datei. Es wurden keine zusätzlichen npm-Abhängigkeiten hinzugefügt.

## Prüfung

25 automatisierte Tests erfolgreich, darunter:

- Eingabe/Auflösung von Kanal-Links und Verarbeitung von Feed-Daten
- Abweisen fremder URLs und unsicherer Weiterleitungen
- kein Spam alter Uploads, keine erneute Meldung nach Neustart
- Wiederholungsversuche bei fehlenden Discord-Rechten oder Zustellfehlern
- gespeicherte Warteschlange, mehrere Uploads und überschneidende Prüfläufe
- Pausieren, Wartungsmodus, Zielkanalwechsel und Entfernen
- Server-/Berechtigungsgrenzen und fremde Menübedienung
- vorhandene Abos importieren, ohne entfernte Abos wiederherzustellen
- beschädigte YouTube-Speicherdatei unverändert lassen
- Rollen-Pings nur für die ausgewählte Rolle; keine Pings bei Tests
- Validierung der Discord-Menüs und Commands mit discord.js 14.19.3
- alle bisherigen nicht-YouTube-Commands identisch
- bestehende Fachmodule per SHA-256 verglichen
- fehlendes YouTube-Modul verhindert nicht die übrige Command-Registrierung

Zusätzlich sind alle JavaScript-Dateien mit `npm run check` syntaktisch geprüft.

Die Tests verwenden simulierte YouTube-Antworten und Discord-Objekte. Live-Abrufe öffentlicher Testkanäle waren aus dieser Umgebung nicht erfolgreich (404 bzw. nicht unterstützte Weiterleitung). Es wurden keine Nachrichten auf deinem echten Discord-Server gesendet und keine echten Bot-Zugangsdaten verwendet. Die Live-Verbindung prüfst du nach dem Deployment über `/uploads` und **Testmeldung senden**.

Tests lokal nach `npm install`:

```sh
npm run check
npm run test:uploads
```

## Quellen zur Implementierung

- Offizieller YouTube-Kanal-Feed und Atom-Format: https://developers.google.com/youtube/v3/guides/push_notifications
- Discord.js-Nachrichtenoptionen und Nonce: https://discord.js.org/docs/packages/discord.js/14.19.2/MessageCreateOptions:Interface

Das Modul fragt den Feed regelmäßig ab; es betreibt keinen zusätzlichen Webhook-Server.
