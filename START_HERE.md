# Sammelupdate v1.6.8 bis v1.7.2 – hier anfangen

Alle Updates aus dem Chat „rekordbox fix (bot)“, früher „Multi game bot erstellt“, ab einschließlich des Minigame-Fixes v1.6.8 in einem Paket.

Dieses Update ist für deinen bereits vorhandenen Stilo Multi-Game Community Bot ab v1.6.7. Es ist kein separates neues Bot-Projekt. Falls der Minigame-Fix schon installiert ist, kannst du das Paket trotzdem verwenden.

## In dein bestehendes GitHub-Repository hochladen

1. ZIP auf deinem Mac entpacken.
2. Dein bestehendes Bot-Repository öffnen. In dessen oberster Ebene müssen `package.json` und der Ordner `src` liegen.
3. „Add file“ → „Upload files“ öffnen.
4. Den entpackten Ordner `src`, `package.json`, `START_HERE.md` und `README_UPDATE.md` hineinziehen. Lade die Dateien in derselben Ordnerstruktur hoch; lade nicht die ZIP selbst hoch. Kontrolliere vor dem Speichern, dass die drei JavaScript-Dateien unter `src/` liegen.
5. „Commit changes“ anklicken. Gleichnamige Dateien werden dadurch aktualisiert. Die übrigen Dateien in `src` behalten.
6. Railway neu deployen lassen bzw. den neuen Stand deployen.
7. Sobald der Bot online ist, in Discord `/commandsync` ausführen.
8. Mit `/sea` das Minigame öffnen; Spotify mit `/spotify diagnose` prüfen.

Die mitgelieferte `.env.example` ist nur eine Vorlage. Deine echten Tokens und API-Keys bleiben in den Railway-Variablen bzw. in deiner lokalen `.env`.

## Bestehende Daten erhalten

Das Paket enthält keine `data/db.json` und keine Spotify-Anmeldedaten. Deinen bestehenden `data`-Ordner behalten. Auf Railway muss `/app/data` dauerhaft über ein Volume gespeichert sein, damit Level, Coins, Kämpfe und Anmeldungen einen Redeploy überstehen.

## Deine Spotify-Playlist

Im Code dieses Updates ist diese Playlist fest als Standard gesetzt:
https://open.spotify.com/playlist/0j5WfIigrPdHMGu9TKZ860

- Beim Starten, Anzeigen oder Auswählen eines Titels wird die Liste neu geladen.
- Während einer laufenden Party wird sie standardmäßig alle 60 Sekunden aktualisiert.
- `/spotify refresh` lädt sie sofort neu.
- Neue und entfernte Songs werden übernommen, sofern Spotify die aktuelle Liste erfolgreich liefert. Bei einem Ladefehler nutzt der Bot die zuletzt gespeicherte Liste.

Wenn Spotify bereits eingerichtet ist, bleiben deine Zugangsdaten bestehen. Falls noch keine Verbindung besteht, zuerst `/spotify connect` benutzen. Bei Problemen helfen `/spotify diagnose` und `/spotify devices`; mit `/spotify device nummer:…` wählst du ein Gerät aus.

Das vorhandene Spotify-Modul steuert ein verbundenes Spotify-Gerät. Es überträgt die Musik nicht als Audio in den Discord-Voice-Channel.

Alle enthaltenen Änderungen stehen in `README_UPDATE.md`.
