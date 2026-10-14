# Prüfung von Pixel 1.11.0

Ausgangspunkt: `Pixel-Mimic-Spielleiter-Fix.zip`, Version 1.10.1, aus dem bisherigen Bot-Chat.

- Alle **389 Tests bestanden**: 375 bestehende Tests und 14 zusätzliche Tests zum Rollen-/KI-Update.
- Syntaxprüfung für alle **40** JavaScript-Module erfolgreich.
- Installationsprüfung erfolgreich; die benötigten lokalen Module sind enthalten.
- Alle **198** bisherigen Assets sind bytegleich übernommen.
- Alle **39** bisherigen Quellmodule sind enthalten. **36** bleiben bytegleich. Geändert wurden ausschließlich `index.js`, `server_setup_designs.js` und `ai_quality.js`. Hinzu kommt `setup_roles.js`.
- Die Paketabhängigkeiten bleiben unverändert. Paket- und Lockfile-Version wurden gemeinsam auf 1.11.0 gesetzt.

Die zusätzlichen Tests prüfen Rollen-Vorschauen ohne Schreibaktionen, wiederholte Einrichtung und Neustart, Wiederverwendung gespeicherter IDs, bestehende Mitgliederzuweisungen und Berechtigungen, Selfrole-/Support-Zuordnung, fremde und Discord-verwaltete Rollen, Hierarchiegrenzen, ausgeschaltete Gestaltung, fehlende Rechte, Rollenlimit, mehrdeutige Namen, API-Fehler und Wiederaufnahme, die tatsächliche `/setup`-Anbindung und das erneute Prüfen einer veralteten Designer-Vorschau.

Die KI-Prüfungen decken knappe Fehlerrückmeldungen, Link-Folgefragen, Themenwechsel, Korrekturen, Einschränkungen, Recherche-Auswahl und die Erhaltung des bisherigen Chat-/Support-Verhaltens ab. Die Erhaltungsprüfung rekonstruiert jede vorherige Quelldatei aus den exakt dokumentierten Änderungen und vergleicht ihren SHA-256-Hash. Die bisherigen Erhaltungsprüfungen bleiben ebenfalls aktiv.

Kein Live-Test auf deinem Discord-Server oder Railway und keine echte KI-Qualitätsmessung. Discord-, Voice- und KI-Aufrufe werden in den Tests simuliert. Die vorherige Mimic-Einschränkung bleibt bestehen: Originalclips und Ansagen lädt der Bot nach; externe Quellen können ausfallen.
