# Update ab dem endgültigen Setup-Fix

Dieses Paket enthält alle Code-Änderungen ab dem endgültigen Setup-Fix v1.5.2 bis v1.5.3.

## Enthalten
- v1.5.2: /setup richtet gefundene Kanäle wirklich ein und zeigt fehlende/fehlerhafte Kanäle korrekt an.
- v1.5.3: Support-AI erkennt auch Tickets anderer Ticket-Bots und wartet, bis der Ticket-Ersteller wirklich schreibt.

## In GitHub ersetzen
- src/index.js
- src/community.js
- src/staff.js
- package.json

## Nicht überschreiben
Dieses Paket enthält absichtlich keine data/db.json. Deine bestehenden Coins, Cases, Learn-Einträge, Staff-Daten und sonstigen gespeicherten Daten bleiben dadurch erhalten.

Nach dem Commit Railway neu deployen lassen und /setup erneut testen.
