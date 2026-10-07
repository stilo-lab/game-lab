# Pixel-Anzeige-Fix

Dieser kleine Zusatz zum Pixel-Verbesserungs-Update 1.9.4 repariert die Pixel-Figuren am Anfang der Nachrichten von `/ai` und bei der Auswahl mit `/pixel`.

## Installation

1. Entpacke `Pixel-Anzeige-Fix.zip`.
2. Öffne den vorhandenen Ordner `src` in deinem Bot-Projekt auf GitHub.
3. Lade die drei Dateien aus dem ZIP-Ordner `src` genau dort hoch:
   - `pixel_gojo.js` – vorhandene Datei ersetzen.
   - `pixel_characters.js` – vorhandene Datei ersetzen.
   - `pixel_assets.js` – neue Datei hinzufügen.
4. Speichere die Änderung und starte bzw. deploye den Bot neu, zum Beispiel in Railway.
5. Wähle einen Charakter mit `/pixel` und teste danach `/ai`.

Die drei Dateien gehören direkt in dein bestehendes `src`. Die benötigten Anzeige-GIFs sind bereits in `pixel_assets.js` enthalten. Dafür brauchst du keine weiteren Charakter-Ordner oder Discord-Kanäle. Deine vorhandenen Assets bleiben erhalten, weil andere Funktionen und Vorschauen sie weiterhin verwenden können.

## Was der Fix repariert

- GIFs werden mit dem passenden Bildformat `image/gif` an Discord übergeben.
- Die Bestätigung von `/pixel` verwendet dieselbe animierte Figur wie `/ai`.
- Zuerst wird der ausgewählte Charakter geladen. Der Bot lädt beim Start nicht sämtliche Figuren hoch.
- Nach einem vorübergehenden Fehler versucht der Bot es bei der nächsten Auswahl oder AI-Antwort erneut.
- Fehlende oder ungültige lokale GIFs können aus der enthaltenen Sicherung geladen werden. Gültige vorhandene GIFs haben weiterhin Vorrang.
- Gleichzeitige Anfragen teilen laufende Ladevorgänge. Langsame Emoji-Anfragen blockieren die Anzeige höchstens acht Sekunden.
- Vorhandene funktionierende Anwendungs-Emojis werden wiederverwendet. Der Fix löscht keine Emojis.

Discord muss für Anwendungs-Emojis erreichbar sein. Während einer Störung kann vorübergehend ein gewöhnliches Symbol erscheinen; die AI-Antwort bleibt trotzdem lesbar.

## Prüfung

319 automatisierte Tests bestanden, darunter 16 neue Tests für diesen Fix. Die Prüfung umfasst den echten GIF-Request-Aufbau von discord.js mit simulierten Discord-Antworten, Auswahl, Ladefehler, fehlende Ordner, Wiederholungen und gleichzeitige Anfragen. Alle 34 Quelldateien wurden auf gültige JavaScript-Syntax geprüft.

Die 33 vorherigen Module wurden mit dem Stand 1.9.4 verglichen. Nur `pixel_gojo.js` und `pixel_characters.js` enthalten die dokumentierten Änderungen; `pixel_assets.js` ist neu. Die bisherigen Assets und übrigen Funktionen wurden unverändert übernommen.

Noch nicht live auf Discord geprüft. Es wurden keine Bot-Zugangsdaten benötigt und keine echten Discord-Nachrichten gesendet.

Wenn dein GitHub-Projekt automatische Tests ausführt, übernimm zusätzlich die sechs beigefügten Dateien unter `tests` an ihre jeweiligen Pfade. Danach funktioniert `npm test` auch mit diesem Fix. Neue Pakete oder Änderungen an `package.json` sind nicht nötig.

