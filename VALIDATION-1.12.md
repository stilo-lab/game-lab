# Prüfung von Pixel 1.12.0

**412 Tests bestanden, 0 fehlgeschlagen.** Alle 41 JavaScript-Module bestehen die Syntaxprüfung. Die Installationsprüfung findet alle benötigten lokalen Module.

Der Ausgangspunkt ist das vollständige Update 1.11.0. Davon wurden nur `index.js`, `ai_runtime.js` und `youtube_uploads_core.js` erweitert. Das neue Modul ist `ai_reasoning.js`. Alle anderen 37 vorhandenen Quellmodule bleiben bytegleich. Alle 198 Assets bleiben bytegleich. Kein vorhandener Quellpfad oder Asset wurde entfernt. Keine neuen Paketabhängigkeiten.

Die bisherigen 389 Tests bleiben aktiv. Hinzu kommen 14 Prüfungen zum KI-Denkmodus und zur Antwortprüfung sowie 9 Prüfungen der Fehler aus der Aufnahme.

Die neuen Tests prüfen:

- Serverlose `/ai`-Anfragen und die unveränderte Bedienung im Server.
- RetryInfo-/Retry-After-Fristen, Wartezeiten nach `429`, keine sofortige Ersatzmodell-Anfrage und Wiederaufnahme nach der Wartefrist.
- Das offizielle YouTube-Atom-Format mit Self-Link und ohne oberste Kanal-ID; weiterhin abgelehnte widersprüchliche Metadaten, fremde Einträge und unbestimmte Feeds.
- Auswahl des stärkeren konfigurierten KI-Modells, zur Modellfamilie passende Denkparameter, Begrenzung zusätzlicher Aufrufe, kompatible Ersatzanfragen und abgeschnittene Ausgaben.
- Prüfung eines fehlerhaften Rechenentwurfs, Weitergabe von Sprache/Stil/Einschränkungen, Speicherung nur der endgültigen Antwort und Erhaltung einer vollständigen Antwort bei fehlerhafter Prüfung.
- Bytegenaue Rekonstruktion sämtlicher früherer Quellversionen außerhalb der jeweils dokumentierten Änderungen.

Die Prüfungen verwenden simulierte Discord- und API-Antworten. Sie messen weder einen IQ noch eine garantierte Verbesserung bei echten Modellantworten. Kein Live-Test auf deinem Discord-Server oder Railway. Externe Gemini-Kontingente und Ausfälle bleiben bestehen; ein wirklich fremder YouTube-Feed wird nicht als passender Kanal akzeptiert.
