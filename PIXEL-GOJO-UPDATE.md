# Pixel Gojo – klein am Nachrichtenanfang

Aktualisiert am 02.10.2026 auf Basis deiner hochgeladenen `Pixel-Gojo-Update.zip` für `stilo-lab/game-lab`.

## Installieren

1. Die aktualisierte ZIP entpacken.
2. Im Hauptordner deines GitHub-Repositories die enthaltenen Ordner `src`, `assets` und `tests` hochladen und gleichnamige Dateien ersetzen. Bestehende Ordner nicht löschen.
3. Commit speichern und Railway neu deployen lassen.
4. Nach dem Start `/ai` ausprobieren.

Zusammen gehören:

- `src/index.js`
- `src/community.js`
- `src/pixel_gojo.js`
- der komplette Ordner `assets/pixel-gojo/`
- `assets/pixel-gojo.gif` als aktualisierte Vorschau am bisherigen Dateipfad

Die Tests sind für den Betrieb optional. Neue Pakete, Schlüssel oder ein erneutes `/setup` sind für diese Anzeige nicht erforderlich.

## So sieht die Antwort aus

Direkt am Anfang der Nachricht steht ein kleines animiertes Gojo-Emoji neben **Pixel Gojo**, darunter die Antwort.

- Während der Antworterstellung: Laptop-Animation und „Ich denke nach …“.
- Dauert es länger als 20 Sekunden: Warte-Animation.
- Sobald die Antwort fertig ist: Dieselbe Nachricht wird aktualisiert. Ihr kleines Gojo-Symbol spielt die enthaltenen Animationen als Schleife ab.
- Fehler: Die gleiche Nachricht zeigt den Fehlertext mit Gojos Fehlerreaktion.
- Lange Antworten behalten die vorhandene Aufteilung in mehrere Nachrichten.

Das gilt für `/ai`, direkte Erwähnungen, KI-Vorschlagsfeedback und generierte Ticket-Antworten. Bearbeitungsbuttons in Tickets bleiben erhalten.

## Animationen

Enthalten sind die Originalposen aus deinem Pixel-Gojo-Paket: Idle/AFK, Winken, Springen, Laufen nach rechts und links, Warten, Laptop, Prüfen, Fehlerreaktion, Blue/Red einzeln und alle 16 Blickrichtungen.

Die zusammengeführte Schleife hat 75 Frames. Die Kombination, Aufladung und der Hollow-Purple-Angriff sind ausgeschlossen. Auch die alte Datei `assets/pixel-gojo.gif` enthält jetzt die neue Schleife ohne Hollow Purple.

Die Animationen stammen aus deinem gespeicherten `Pixel-Gojo-Pet.zip`; die Laptop-Sequenz aus deinem originalen Bild „Pixel-Zauberer arbeitet am Laptop“. Sie wurden für Discord ausgeschnitten, verkleinert und als transparente GIFs exportiert. Der ChatGPT-Pet selbst wurde nicht verändert.

## Kleine Symbole automatisch einrichten

Der Bot legt beim Start vier eigene **Application Emojis** an: Laptop, komplette Schleife, Warten und Fehler. Bereits vorhandene passende Emojis verwendet er wieder. Die übrigen Einzelanimationen sind zusätzlich im Asset-Ordner enthalten.

Alle GIFs liegen unter Discord's Grenze von 256 KiB. Die Einzelsequenzen haben 128 × 128 Pixel, die gesamte Schleife 80 × 80 Pixel. Discord bestimmt die tatsächliche kleine Darstellung neben dem Text. Bei deaktivierten Animationen in deinem Discord-Client kann das Symbol stillstehen.

Schlägt die Emoji-Einrichtung fehl, bleibt die KI-Antwort nutzbar und beginnt mit einem kleinen ✨. Der Grundcode erscheint im Railway-Log unter „Pixel Gojo display unavailable“. Prüfe dann insbesondere, ob der vollständige Asset-Ordner hochgeladen wurde, und starte den Bot erneut.

Es werden keine Server-Emojis gelöscht, keine Serverrechte geändert und keine Datenbankeinträge für das Pet angelegt.

Offizielle Grundlage: [Discord Application-Owned Emoji](https://docs.discord.com/developers/resources/emoji).

## Was erhalten bleibt

Gegenüber deiner hochgeladenen ZIP sind nur Pet-Anzeige und ihre Einbindung in die vorhandenen KI-Antwortpfade verändert. Die bestehenden KI-Anweisungen, der Gesprächsverlauf, Cooldowns, Vorschlags-Votes, Setup-Funktionen und anderen Befehle bleiben erhalten. YouTube-, Spotify-, Spiel- und Staff-Dateien werden nicht mit diesem Update ersetzt.

Ein Vergleichstest prüft den gesamten Code in `index.js` und `community.js` außerhalb der betroffenen Pet-Abschnitte gegen deine ursprüngliche ZIP. `tests/fixtures/module-hashes.json` wurde an die geänderte Community-Datei angepasst.

## Geprüft

- 22 Tests für Pet-Anzeige, KI-Verhalten, Vorschläge, Tickets, Setup und Erhalt des übrigen Codes.
- Zusätzlich 35 bestehende YouTube-/Integrationstests im zusammengeführten Prüfprojekt: insgesamt **57 Tests bestanden**.
- Syntaxcheck für alle drei geänderten JavaScript-Dateien.
- GIFs auf Framezahl, sichtbare Frameänderungen, Transparenz, Endlosschleife, Dateigröße und Prüfsummen geprüft; Posenübersicht visuell geprüft.

Die Prüfungen verwenden simulierte Discord-/Gemini-Antworten. Kein Live-Deployment, kein echter Emoji-Upload und kein Live-Test mit deinem Discord-Token wurden durchgeführt.

Pet-Tests im installierten Bot-Projekt:

```sh
node --test tests/pixel_gojo.test.js
```

Wenn die bisherigen YouTube-Tests installiert sind:

```sh
npm run test:uploads
```
