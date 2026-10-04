# Pixel · Schlauere Chat-KI und Support-KI

## Einbauen

1. ZIP entpacken.
2. Die drei Dateien aus `src` in den vorhandenen `src`-Ordner deines Bots hochladen:
   - `index.js` ersetzen.
   - `ai_quality.js` hinzufügen.
   - `server_setup_designs.js` hinzufügen oder ersetzen. Das ist unverändert das Modul aus deinem letzten Server-Setup-Update; es ist für eine vollständige Installation ebenfalls dabei.
3. Änderungen auf GitHub speichern und den Bot bei Railway neu deployen bzw. neu starten.

Deine vorhandenen übrigen Bot-Dateien, Daten, Gojo-Assets und Umgebungsvariablen weiterverwenden. Keine neuen Pakete, kein neuer Schlüssel und keine neuen Slash-Befehle nötig. Das Update baut auf dem zuletzt gelieferten Server-Setup mit drei Designs auf.

## Was verbessert wurde

### Chat-KI: /ai und direkte Erwähnung

- Bis zu zwölf statt fünf Frage-Antwort-Paare im Kontext, mit einem zusätzlichen Größenlimit. Der Verlauf bleibt nach der letzten erfolgreichen Antwort bis zu zwei Stunden im Arbeitsspeicher. Bei einem Neustart wird er zurückgesetzt.
- Gespräche bleiben nach Server, Kanal und Nutzer getrennt.
- Die KI soll Korrekturen und schon genannte Details berücksichtigen, bei Folgefragen beim Thema bleiben und auf „geht nicht“ gezielt reagieren.
- Passendes älteres Serverwissen aus `/learn` kann jetzt vor neueren, unpassenden Einträgen ausgewählt werden. Gleiches gilt für Feedback aus `/verbesserung`.
- Bei technischen Fragen stehen mehr Ausgabetokens und eine niedrigere Zufälligkeit zur Verfügung. Smalltalk behält den kurzen, lockeren Stil; die deutschen SenZ-artigen Tonbeispiele für `/ai` bleiben erhalten.
- Klarere Vorgaben gegen erfundene Live-Daten, unnötige Rückfragen und falsche Behauptungen über ausgeführte Aktionen. Die normale Chat-KI erhält durch dieses Update keinen Internetzugriff.

### Support-KI

- Der aktuelle Ticket-Verlauf enthält auch frühere KI-Lösungsvorschläge. Dadurch kann die KI erkennen, welcher Schritt bereits erfolglos versucht wurde.
- Konkrete nächste Prüfschritte, erwartete Ergebnisse und höchstens eine entscheidende Rückfrage auf einmal. Eine vollständige Anleitung bleibt auf Wunsch möglich.
- Screenshots werden weiterhin mitgesendet; sichtbare Angaben und nicht lesbare Details sollen klar unterschieden werden. Alte Dateinamen gelten nicht als aktuell sichtbare Bilder.
- Wenn ein gespeicherter Gemini-Verlauf abgelaufen ist, wird die Anfrage einmal mit dem lokalen Ticket-Kontext neu versucht.
- Bei Ausfall des primären Support-Modells verwendet der Ersatzweg die normale Content-API. Er erhält dieselben Bilder, FAQ, Serverinformationen, Admin-Hinweise und bisherigen Lösungsschritte. Im alten Ersatzweg gingen Teile davon verloren.
- Google-Suche bleibt im primären Support-Weg verfügbar. Der Ersatzweg arbeitet ohne Suche und wird ausdrücklich angewiesen, keine aktuelle Recherche zu behaupten.
- Leere Antworten gelten als Fehler; sie werden nicht als erfolgreiche Lösung gespeichert. Quellen werden aus tatsächlich zurückgegebenen Quellenangaben gelesen.
- Die Zusammenfassung für Menschen berücksichtigt auch bereits vorgeschlagene KI-Schritte. Wird die KI während einer laufenden Antwort ausgeschaltet oder das Ticket geschlossen, wird ihre Antwort nicht nachträglich angezeigt und der alte Gesprächsstatus nicht wiederhergestellt.

Moderationsentscheidungen bleiben bei Menschen. Die KI erhält keine neuen Rechte zum Ändern von Konten, Kanälen oder Servereinstellungen.

## Kurz ausprobieren

**Chat:** „Mein YouTube-Link meldet 404, ich nutze Railway.“ Danach: „Hab ich schon gemacht, geht trotzdem nicht.“ Die Antwort sollte beim YouTube-Problem bleiben und nach dem konkreten Ergebnis fragen oder einen anderen sinnvollen Prüfschritt nennen.

**Support:** In einem Ticket die KI einschalten, Fehlertext oder Screenshot schicken und nach einem vorgeschlagenen Schritt das Ergebnis melden. Sie sollte frühere Angaben berücksichtigen. „Get Human Support“ und „Continue“ bleiben verfügbar.

**Serverwissen:** Mit `/learn` einen konkreten Fakt für die passende KI hinterlegen und später dazu fragen. `/verbesserung` bleibt für die Korrektur echter Antworten nutzbar.

## Prüfung und Grenzen

92 automatisierte Tests bestanden: neue Prüfungen für Kontext, relevante Wissensauswahl, Support-Fallback, Bilder, abgelaufene Interaktionen und Übergaben sowie die bisherigen Tests für Gojo/KI, Server-Setup und YouTube. Die beiden geänderten Quelldateien wurden auf Syntax geprüft. Quelltext außerhalb der freigegebenen KI-Bereiche und die bestehenden Funktionsmodule wurden gegen das letzte Update verglichen.

Die Modellaufrufe wurden in Tests simuliert; keine Live-Prüfung auf Discord oder gegen Gemini. Das Update verbessert Kontext und Antwortvorgaben, wechselt aber nicht automatisch auf ein anderes Modell. Die tatsächliche Antwortqualität hängt weiterhin vom eingestellten Modell und den verfügbaren Informationen ab. Mehr Gesprächskontext kann mehr API-Tokens verbrauchen.

Optional nach Installation der vorhandenen Projekt-Abhängigkeiten:

```sh
node --check src/index.js
node --check src/ai_quality.js
node tests/ai_quality.test.js
```

Der mitgelieferte `tests`-Ordner aktualisiert außerdem die vorhandenen Vergleichsdaten und den Gojo-KI-Test für den erweiterten KI-Kontext. Für den laufenden Bot werden die Tests nicht benötigt.

Technische Referenz für die verwendeten Antwort- und Bildformate: [offizielle Gemini-Migrationsdokumentation](https://ai.google.dev/gemini-api/docs/migrate-to-interactions) und [Interactions-Verlauf](https://ai.google.dev/gemini-api/docs/interactions-overview).
