# Pixel 1.10.1 – Start-Fix und Mimic-Spielleiter

Die Bildschirmaufnahme zeigt `Cannot find module './ai_runtime'` in `/app/src/index.js`. Deshalb enthält dieses Paket den vollständigen `src`-Ordner mit **39 Dateien**, nicht nur einzelne geänderte Module. `src/ai_runtime.js` und alle anderen benötigten Module sind dabei.

## In GitHub hochladen

1. ZIP entpacken.
2. In deinem vorhandenen GitHub-Projekt den Ordner **src** öffnen.
3. **Alle 39 Dateien aus dem ZIP-Ordner src direkt dort hochladen.** Gleichnamige Dateien ersetzen, neue hinzufügen. Die Dateien gehören nach `src/dateiname.js`, nicht nach `src/src/dateiname.js`.
4. **package.json und package-lock.json in den Hauptordner** hochladen und ersetzen.
5. Der komplette bisherige assets-Ordner ist ebenfalls enthalten. Wenn bei dir Assets fehlen, den enthaltenen assets-Ordner samt Unterordnern in den Hauptordner übernehmen. Die Dateien gehören unter `assets/...`. Neue Ordner für Ansagen oder Downloads musst du nicht anlegen: Pixel legt diese selbst im bestehenden Datenverzeichnis an.
6. Falls du automatische Tests nutzt, den vollständigen enthaltenen tests-Ordner übernehmen.
7. Änderungen speichern/committen und Railway neu deployen. Bei `npm start` prüft Pixel vorab die benötigten lokalen Module und meldet fehlende Dateinamen verständlich.

Deine Railway-Variablen, Tokens, Datenbank und bisherigen Kanäle behalten. Das Paket enthält keine Zugangsdaten und keine Datenbank. Es ist kein Löschen oder Zurücksetzen des Servers erforderlich.

## Mimic: Aufnahmen statt erzeugter Übungstöne

Der normale `/mimic`-Befehl verwendet jetzt ausschließlich importierte Originalclips und Server-Uploads. Die bisherigen synthetischen Stimmen und erzeugten Übungstöne werden nicht mehr als Vorlagen gewählt. Auch der Aufnahme-Countdown verwendet in diesem Modus keine erzeugten Pieptöne.

Neun vorgeschlagene Aufnahmen:

| Aufnahme | Kategorie | Quelle |
| --- | --- | --- |
| Trymacs – On me, ich bin tot | Streamer | https://www.myinstants.com/en/instant/on-me-ich-bin-tod-trymacs-67591/ |
| Papaplatte – Stanni? | Streamer | https://www.myinstants.com/en/instant/stanni-papaplatte-3424/ |
| Papaplatte – Tamaris | Memes | https://www.myinstants.com/en/instant/papaplatte-tamaris-24889/ |
| BastiGHG – Wo ist Guam? | Gaming | https://www.myinstants.com/en/instant/bastighg-wo-ist-guam-5562/ |
| BastiGHG – Ay Zip | Streamer | https://www.myinstants.com/en/instant/bastighg-ay-zip-8128/ |
| El Risitas – Lachen | Stimmen | https://www.myinstants.com/en/instant/el-risitas-funniest-laugh-26007/ |
| Habicht hat zwei H | Memes | https://www.myinstants.com/en/instant/habicht-habicht-hat-zwei-h-84518/ |
| Minecraft – Villager | Gaming | https://www.myinstants.com/en/instant/villager/ |
| Katze – Miau | Tiere | https://www.myinstants.com/en/instant/meow-1-25594/ |

Die Audioaufnahmen selbst sind **nicht in der ZIP enthalten**. Pixel lädt sie beim ersten Lobby-Aufruf, speichert sie im vorhandenen Datenverzeichnis und verwendet sie danach wieder. Behalte dein dauerhaftes Railway-Datenverzeichnis. Community-Seiten ordnen die Clips den genannten Quellen zu; das ist keine unabhängige Prüfung oder Kooperation mit den Streamern. Bitte vorhören.

`/mimic originals` versucht die Downloads erneut. `/mimic preview id:…` spielt eine Vorlage privat ab. Du kannst weitere Originalaufnahmen mit `/mimic upload` oder `/mimic import` hinzufügen und einer Kategorie zuordnen. Maximal 30 eigene/importierte Vorlagen pro Server; Ausschnitt 0,4–6 Sekunden und maximal 2 MB pro Datei. Leere Kategorien zeigen eine verständliche Meldung. Ein nicht erreichbarer Download wird nicht durch KI oder erzeugte Töne ersetzt.

Die bestehenden Audioeffekte des Glücksrads bleiben erhalten: Sie verändern den Spieler-Take und sind keine zufällig erzeugten Runden-Vorlagen. Beschädigte Vorlagendateien werden in der laufenden Party übersprungen, wenn andere Aufnahmen verfügbar sind.

## Gesprochener Spielleiter

Der Spielleiter ist in neuen Lobbys standardmäßig an. Seine vier aufgezeichneten Game-Ansagen sind:

| Ansage | Zeitpunkt | Quelle |
| --- | --- | --- |
| Ready | Vor dem dreisekündigen Aufnahme-Countdown | https://www.myinstants.com/de/instant/mario-party-announcer-ready-99518/ |
| Start | Direkt vor dem Mikrofon-Aufnahmefenster | https://www.myinstants.com/en/instant/mario-party-announcer-start-19739/ |
| Finish | Nachdem das Aufnahmefenster geschlossen ist | https://www.myinstants.com/de/instant/mario-party-announcer-finish-93120/ |
| Congratulations | Nach der letzten Runde | https://www.myinstants.com/en/instant/announcer-congratulations-15201/ |

Die Standardansagen sind kurze englische Game-Aufnahmen, keine KI-Stimme. Die Seiten ordnen Ready, Start und Finish der Sprecherin Eriko Ibe zu. Pixel importiert und speichert die Dateien; er erzeugt und klont keine Stimme. Die Ansagen laufen außerhalb des Aufnahmefensters. Kopfhörer helfen zusätzlich gegen Lautsprecher-Echo.

- `/mimic spielleiter`: Ansagen laden und Status anzeigen.
- `/mimic spielleiter probe:record`: Start-Ansage privat vorhören.
- `/mimic spielleiter aktiv:false`: Als Verwaltung den Spielleiter ausschalten.
- `/mimic lobby spielleiter:false`: Eine Lobby ohne Ansagen öffnen.
- `/mimic ansage phase:record datei:deine-aufnahme.wav`: Eigene deutsche Start-Ansage speichern.
- `/mimic ansage phase:reference link:…`: Alternativ eine Originalaufnahme von Myinstants nutzen.

Eigene Ansagen sind möglich für Begrüßung, Vorlage anhören, Bereit/Countdown, Aufnahme starten/beenden, Bewertung, Replay, Glücksrad, Rundenende, Spielende, Pause und Fortsetzen. Die Bereit-Ansage läuft vor der festen dreisekündigen Pause. Die Start-Ansage läuft unmittelbar vor der Aufnahme. Spielernamen und dynamische Punktzahlen stehen im Panel; sie werden nicht synthetisch gesprochen.

Maximal 2 MB, Ausschnitt 0,4–6 Sekunden. Ansagen benötigen genau einen Datei- oder Link-Eingang. Nur Serververwaltung oder Bot-Owner können Ansagen ändern bzw. den Server-Schalter setzen. Ansagen werden getrennt von den Runden-Vorlagen gespeichert und erscheinen nicht als zufällige Nachmach-Aufgabe. Eigene Ansagen werden von späteren Standard-Downloads nicht überschrieben. Fehlt eine Ansage oder ist sie beschädigt, läuft die Party mit Textansagen weiter.

## Bisherige Funktionen

`/new` mit Rollenvergabe, Rollen-/Kanalrechten und den bisherigen Serveraktionen ist enthalten. Der Pixel-Anzeige-Fix, AI/Support, Counting, YouTube-System, Server-Setup, Tickets und weitere vorhandene Module wurden übernommen. Nur vier bestehende Mimic-Module wurden für dieses Update geändert; die anderen 33 bisherigen Module sind unverändert. Alle 198 bestehenden Assets sind unverändert enthalten. Keine neuen Paketabhängigkeiten.

## Prüfung und Grenzen

**375 automatisierte Tests bestanden**, darunter Start mit vollständigen Modulen, Simulation des fehlenden ai_runtime-Moduls, sämtliche bisherigen Tests, Originalaufnahme-Auswahl, Ansage-Import, Wiederverwendung nach Neustart, Quellen-/Hashprüfung, begrenzte Dateigrößen und URLs, eigene Ansagen, Schreibfehler-Rollback, Berechtigungen, Reihenfolge vor/nach Aufnahme, Pufferlöschung und Überspringen beschädigter Vorlagen. Alle 39 JavaScript-Module bestehen die Syntaxprüfung.

Noch nicht live auf Discord/Railway oder mit echtem UDP-Voice getestet. Die recherchierten MP3s konnten in dieser Umgebung nicht heruntergeladen oder abgehört werden. Import-/Codec-Tests verwenden simulierte Download-Antworten mit MP3-Testbytes; diese Testaufnahmen werden nicht als Stimmen verteilt. Die tatsächlichen Quellen können ausfallen; Vorhören, erneuter Import und eigener Datei-Upload sind vorgesehen.

Dies ist eine Discord-Umsetzung von Mimic Party. Die originale 3D-Oberfläche und eine identische nicht veröffentlichte Bewertungsformel sind nicht enthalten.
