# Pixel 1.11.0 – Setup-Rollen und bessere KI

Dieses Update baut direkt auf **Pixel-Mimic-Spielleiter-Fix 1.10.1** aus „Bot Datei erstellen“ auf. Alle 39 vorhandenen Quellmodule und alle 198 Assets sind enthalten. Drei vorhandene Module wurden gezielt geändert; das Rollenmodul wurde ergänzt. Mimic mit Originalclips und Spielleiter, Pixel-Charaktere, `/new`, YouTube, Counting, Tickets, Giveaways, Community und Staff bleiben enthalten.

## Hochladen

1. ZIP entpacken und dein bestehendes GitHub-Projekt öffnen.
2. Die **40 Dateien** aus dem ZIP-Ordner `src` direkt in deinen vorhandenen GitHub-Ordner `src` hochladen. Gleichnamige Dateien ersetzen, neue hinzufügen. Ziel ist beispielsweise `src/setup_roles.js`, niemals `src/src/setup_roles.js`.
3. `package.json` und `package-lock.json` in den Hauptordner hochladen und ersetzen.
4. Falls du Tests nutzt, den vollständigen `tests`-Ordner übernehmen. Er enthält auch die zugehörigen Fixtures.
5. Änderungen committen und den Railway-Deploy abwarten. Anschließend `/serversetup` oder `/setup` verwenden.

Deine vorhandenen Assets, Railway-Variablen und das dauerhaft gespeicherte Datenverzeichnis weiterverwenden. Zugangsdaten oder `data/db.json` werden durch dieses Paket nicht ersetzt. Der vollständige Assets-Ordner ist als unveränderte Ergänzung enthalten, falls bei dir Dateien fehlen.

## Gestaltete Rollen

`/serversetup` zeigt zusätzlich zur Kanalstruktur eine Rollen-Vorschau mit Namen und Farben. Die Rollen folgen der ausgewählten Vorlage:

| Design | Beispiel |
| --- | --- |
| Schlicht | 🎫 │ Support Team |
| Klammern | 『🎫』𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐓𝐞𝐚𝐦 |
| Schmuckschrift | 🎫 𝕊𝕦𝕡𝕡𝕠𝕣𝕥 𝕋𝕖𝕒𝕞 |

Enthalten sind 47 Team-/Community-Rollen, alle bisherigen Spielrollen, Plattformen, Spielstile, Regionen und Ping-/Belohnungsrollen. Die passenden Farben unterscheiden die Bereiche. Bei einem freien KI-Kanaldesign erhalten die Rollen den schlichten Stil.

Erst **Anwenden** erstellt fehlende Rollen und gestaltet vorhandene passende Rollen. **Bestehende gestalten: AUS** behält Namen und Farben vorhandener Rollen bei. Die bestehenden Mitgliederzuweisungen, Berechtigungen, Hierarchie und Erwähnbarkeit werden bei wiederverwendeten Rollen beibehalten. Neue Rollen haben keine Verwaltungsberechtigungen und werden niemandem automatisch zugewiesen. Die bestehende Support-Logik nutzt die gespeicherte Support-Rolle. Die neue Moderator-Rolle ist zunächst eine gestaltete Team-Rolle; zusätzliche Rechte vergibst du bewusst über Discord oder `/new`.

`/setup` prüft weiter die vorhandenen Kanäle und erstellt keine neuen Kanäle. Zusätzlich richtet es die gestalteten Rollen ein. Beim ersten Mal nutzt es den schlichten Rollenstil, danach den zuletzt gespeicherten Stil. Wiederholungen und Neustarts verwenden gespeicherte Rollen-IDs; die Selfrole-Menüs, Ping-Funktionen und Belohnungen behalten ihre Zuordnung.

Der Bot braucht **Rollen verwalten**. Seine Rolle muss über den zu gestaltenden Rollen stehen. Rollen von Discord-Integrationen und Rollen oberhalb des Bots werden übernommen, ohne sie zu bearbeiten. Gibt es mehrere Rollen mit demselben passenden Namen, stoppt die Rollen-Einrichtung mit einem Hinweis, statt eine weitere anzulegen. Vorhandene Rollen werden nicht gelöscht.

Die bisherigen drei Kanaldesigns, das zusätzliche Wunschfeld und der bisherige ausdrücklich bestätigte Kanal-Neustart bleiben enthalten. Standard ist **Alte Kanäle: BEHALTEN**. Für dieses Update ist kein Kanal-Neustart erforderlich.

## Bessere KI

- Folgefragen wie „hat nix gebracht“, „nope“, „klappt nd“, „link pls“ und „was kostet das“ werden mit dem aktuellen Thema verknüpft, auch nach mehreren knappen Folgefragen.
- Korrekturen, ausdrücklich genannte Einschränkungen und berichtete Versuche werden im Chat- und Ticket-Kontext deutlicher hervorgehoben. Der eigene frühere Vorschlag zählt nicht als Beweis, dass der Nutzer ihn ausprobiert hat.
- Ein klarer Themenwechsel startet eine neue Antwort; Smalltalk erhält nicht mehr allein wegen einer früheren technischen Frage die Einstellungen für lange Problemlösungen.
- Link-Anfragen, Kauf-/Preisfragen, Tutorials und Event-Termine können die vorhandene Google-Recherche nutzen. Das gilt auch für passende Folgefragen. Ohne verfügbare Recherche bleiben die bestehenden ehrlichen Ersatzantworten aktiv.
- Kurze Rechenaufgaben werden als Erklär-/Rechenanliegen erkannt. `/learn`, Admin-Feedback, die bisherige Gesprächsspeicherung und die Trennung von Nutzern, Kanälen und Servern bleiben erhalten.

Der deutsche SenZ-ähnliche Chat-Stil bleibt erhalten. Die KI-Modelle, API-Schlüssel, Queue und bisherigen Modell-Fallbacks werden nicht automatisch geändert. `GEMINI_REASONING_MODEL` kann wie bisher optional ein vorhandenes leistungsfähigeres Modell für komplexe Fragen festlegen. `GEMINI_CHAT_SEARCH=false` deaktiviert die Chat-Recherche weiterhin.

## Prüfung

Siehe `VALIDATION-1.11.md`. Die Prüfungen verwenden simulierte Discord-/KI-Aufrufe, keine echten Serveraktionen. Die tatsächliche Antwortqualität hängt auch vom konfigurierten Modell und seinen verfügbaren API-Funktionen ab.

Die frühere Mimic-Anleitung und Quellen stehen weiterhin in `README-START-FIX.md`.
