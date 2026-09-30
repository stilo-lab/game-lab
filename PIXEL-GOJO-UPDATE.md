# Pixel Gojo – Bot-Update

Dieses Update basiert auf `stilo-lab/game-lab`, Branch `main`, Stand 30.09.2026 (package.json 1.7.3). Es ist vorbereitet und getestet, aber noch nicht auf GitHub hochgeladen oder auf Railway deployed.

## Installieren

1. `Pixel-Gojo-Update.zip` entpacken.
2. Im Hauptordner deines GitHub-Repositories **Add file → Upload files** öffnen. Die entpackten Ordner `src`, `assets` und `tests` hineinziehen und die vorhandenen gleichnamigen Dateien ersetzen. Keine bestehenden Ordner löschen.
3. Änderungen mit **Commit changes** speichern und Railway neu deployen lassen.
4. Im Discord `/setup` ausführen, danach `/ai` und einen neuen Vorschlag testen. Für das GIF braucht der Bot **Dateien anhängen** und **Links einbetten** im jeweiligen Kanal.

Alle vier Laufzeitdateien müssen zusammen hochgeladen werden:

- `src/index.js` – geändert
- `src/community.js` – geändert
- `src/pixel_gojo.js` – neu
- `assets/pixel-gojo.gif` – neu

Die ZIP enthält außerdem den neuen Verhaltenstest und den aktualisierten Community-Prüfwert für die bestehenden Regressionstests. Es sind keine Tokens, Keys oder Datenbankdateien enthalten.

## Verhalten

- Die Gesprächs-KI heißt **Pixel Gojo**. Bei `/ai`, direkten Erwähnungen, Vorschlagsfeedback und generierten Ticket-Antworten erscheint zuerst dein echtes animiertes Pet als eigene Nachricht, danach die Antwort. Längere Antworten können mehrere Textnachrichten bilden.
- Das GIF enthält sechs Frames der ursprünglichen Blue-/Red-/Hollow-Purple-Animation deines aktiven Pets. Es liegt fest im Bot-Projekt und benötigt keinen ablaufenden Download-Link. Bei fehlenden Dateirechten erscheint stattdessen der Name; die Textantwort funktioniert weiterhin.
- `/ai` trennt den Gesprächsverlauf nach Server, Kanal und Nutzer. Kontext läuft nach 30 Minuten ab und wird nicht in der Datenbank gespeichert. Vorhandenes Wissen aus `/learn` und Feedback aus `/verbesserung` bleiben wirksam.
- Wortgleiche längere Antworten werden einmal neu angefordert. Leere Antworten und API-Fehler werden erkennbar gemeldet.
- Neue Vorschläge per `/suggest`, Formular oder eigenständiger Textnachricht im verbundenen Suggestions-Kanal erhalten eine konkrete KI-Einschätzung. Votes und Entscheidungen bleiben bei Community und Team. Antworten auf bestehende Beiträge lösen keine weiteren KI-Kommentare aus. Die vorhandene AI-Einstellung unter `/settings` wird beachtet.
- `/setup` verhindert parallele Ausführungen und meldet fehlgeschlagene Panel-Updates. Bestehende Panels werden aktualisiert. Die vorhandene Unterscheidung zwischen Setup-Prüfung und vollständiger Installation bleibt bestehen.

## Prüfung

Alle JavaScript-Dateien bestehen den Syntaxcheck. **38 automatisierte Tests bestanden**, darunter 13 neue Tests für Pixel Gojo, KI-Kontext, Wiederholungen, Vorschläge und Setup sowie die 25 bestehenden Tests. Die GIF-Datei wurde auf sechs unterschiedliche Frames und Transparenz geprüft.

Die Tests verwenden simulierte Gemini-/Discord-Antworten und echte Discord-Builder. Ein Live-Test mit deinem Discord-Bot oder Gemini-Key wurde nicht durchgeführt.

Die anderen Quelldateien, Befehle, Paketabhängigkeiten und Datenbankdateien bleiben unverändert.
