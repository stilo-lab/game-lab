# YouTube-Upload-System v1.7.3 – Installation

Dieses Update gehört zu deinem vorhandenen Stilo Multi-Game Bot / „rekordbox fix (bot)“. Es baut auf dem aktuellen Paket v1.7.2 auf und enthält alle benötigten Programmdateien. Deinen bisherigen Bot und seine Daten behalten.

## 1. Update hochladen

1. Diese ZIP auf deinem Mac entpacken.
2. Dein bestehendes Bot-Repository auf GitHub öffnen.
3. In die oberste Ebene gehen, in der `package.json` und `src` liegen.
4. „Add file“ → „Upload files“ öffnen.
5. Die entpackten Ordner `src` und `tests` sowie `package.json`, `START_HERE.md` und `UPLOAD_SYSTEM.md` hineinziehen. Die ZIP selbst nicht hochladen. Unter `src` müssen die JavaScript-Dateien liegen.
6. „Commit changes“ anklicken und Railway den neuen Stand deployen lassen.
7. Sobald der Bot online ist, als Bot-Owner einmal `/commandsync` ausführen.

Deine Railway-Variablen, echten Tokens und die Dateien in `data` bleiben bestehen. Die ZIP enthält keine leere Datenbank und keine Anmeldedaten. Falls schon eine `src/youtube_ping.js` existiert, kann sie liegen bleiben: Das neue Hauptprogramm startet dieses alte Modul nicht mehr.

## 2. YouTube-Kanal einrichten

1. In Discord `/uploads` eingeben.
2. **YouTube-Kanal hinzufügen** anklicken.
3. Den YouTube-Kanal-Link einfügen, zum Beispiel `https://www.youtube.com/@DeinKanal`.
4. Im Auswahlmenü den Discord-Textkanal wählen.
5. Fertig! Über **Testmeldung senden** kannst du eine Beispielmeldung mit dem neuesten Upload senden lassen.

Oder direkt mit einem Befehl:

`/uploads link:https://www.youtube.com/@DeinKanal kanal:#youtube-uploads`

Auch die bisherigen Befehle bleiben verfügbar:

`/youtube add link:… kanal:…`
`/youtube list`
`/youtube check`
`/youtube test id:…`
`/youtube remove id:…`

Die Abo-ID steht in der Übersicht. Bereits vorhandene IDs wie `YT-1` bleiben gültig.

## 3. Benachrichtigungen

- Der Bot prüft standardmäßig alle **2 Minuten** auf neue Einträge.
- Neue Videos und Shorts werden gemeldet, sobald sie im öffentlichen YouTube-Kanal-Feed erscheinen.
- Die Meldung enthält Titel, Kanalname, Vorschaubild, Link und einen **Video ansehen**-Button.
- Beim Einrichten werden bereits vorhandene Videos nicht nachträglich gepostet.
- Für Rollen-Pings kannst du beim Befehl die Option `ping` verwenden oder im Abo auf **Ping-Rolle ändern** klicken.
- Ohne ausgewählte Rolle gibt es keinen Rollen-Ping. Testmeldungen pingen keine Rolle.
- Im Menü kannst du Abos pausieren, fortsetzen, den Discord-Kanal ändern und Abos entfernen.

## Rechte und Speicherung

Einrichten dürfen Bot-/Server-Owner und Mitglieder mit **Server verwalten** oder **Kanäle verwalten**.

Der Bot braucht im Zielkanal:
- Kanal ansehen
- Nachrichten senden
- Links einbetten
- Nachrichtenverlauf anzeigen

Eine ausgewählte Ping-Rolle muss erwähnbar sein oder der Bot braucht dafür das Recht **@everyone, @here und alle Rollen erwähnen**. Das System selbst erlaubt keinen @everyone-Ping.

Ein YouTube-API-Key und eine zusätzliche Callback-Adresse sind für dieses System nicht erforderlich.

Die Abos und wartenden Meldungen speichert der Bot in `data/youtube_uploads.json`. Bestehende YouTube-Abos aus dem vorherigen System werden einmalig übernommen; `data/db.json` wird dabei nicht verändert. Auf Railway muss dein vorhandenes Volume weiterhin unter `/app/data` eingebunden sein, damit die Daten nach einem Redeploy erhalten bleiben.

Optional: `YOUTUBE_UPLOAD_POLL_SECONDS=120` in Railway. Erlaubter Bereich: 60–1800 Sekunden. Die ältere Variable `YOUTUBE_POLL_SECONDS` wird ebenfalls unterstützt.

## Wenn etwas nicht klappt

- **Command fehlt:** Nach dem Deployment `/commandsync` als Bot-Owner ausführen.
- **Kanal-Link nicht erkannt:** Den direkten YouTube-Kanal-Link `https://www.youtube.com/channel/UC…` verwenden. Er benötigt keine Auflösung der @Handle-Seite. Keine Video- oder Playlist-Links verwenden.
- **Keine Meldung:** `/uploads` öffnen und das Abo auswählen; dort stehen der letzte Prüftermin, wartende Meldungen und Fehler. Bot-Rechte und Serverfreigabe prüfen.
- **YouTube liefert 404 oder reagiert nicht:** Später erneut prüfen. Vorhandene Abos bleiben gespeichert. Fehlgeschlagene Zustellungen bleiben in der Warteschlange.
- **Wartungsmodus:** Während der Wartung sendet das neue Upload-System keine Meldungen.

YouTube kann den Feed verzögert aktualisieren. Er enthält nur die jüngsten öffentlichen Uploads; bei langen Ausfällen können ältere, schon aus dem Feed verschwundene Videos nicht nachträglich ermittelt werden. Es gibt deshalb keine Garantie für sekundengenaue oder lückenlose Meldungen während längerer Offline-Zeiten.

Details zur Prüfung stehen in `UPLOAD_SYSTEM.md`.
