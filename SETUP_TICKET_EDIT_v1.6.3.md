# v1.6.3 — Smart Setup V2 + Ticket Message Editor

## Setup V2
- `/setup` löscht vor jedem Scan alte automatische Kanal-Zuordnungen und übernimmt nur den aktuellen Scan.
- Eigene alte Bot-Panels werden beim Erkennen ignoriert, damit ein früherer Fehler sich nicht selbst verstärkt.
- Kanalname + Topic sind Hauptsignal. Nachrichtenverlauf ist nur Zusatzsignal.
- `giveaway`, `general`, `chat`, `memes`, `media`, `music`, `rules`, `bot-commands` usw. werden nicht automatisch als andere Module missbraucht.
- `fortnite-news` braucht explizit Fortnite im Namen/Topic; allgemeines `news`/`updates` wird `announcements`.
- Alte falsch platzierte Setup-Panels werden beim nächsten `/setup` automatisch entfernt.
- Community-/Staff-Module vergessen alte Kanal-IDs, wenn sie im neuen Scan nicht mehr gefunden wurden.

## Manuelle Korrektur
Wenn die Automatik auf einem ungewöhnlichen Server trotzdem nicht passt:
- `/setupmap set funktion:<...> kanal:<#kanal>` — feste Zuordnung
- `/setupmap list` — feste Zuordnungen anzeigen
- `/setupmap clear funktion:<...>` — wieder auf Automatik zurück
Danach `/setup` erneut ausführen.

## Ticket-Nachrichten bearbeiten
Bot-Nachrichten im Support-Ticket bekommen einen Button **✏️ Bot-Nachricht bearbeiten**.
- Bot-Owner, Support-Team und Nutzer mit `Nachrichten verwalten` dürfen ihn benutzen.
- Klick -> Modal -> neuen Text schreiben -> die bestehende Bot-Nachricht wird angepasst.
- Das gilt u. a. für Support-AI-Antworten, AI-Yes/No-Prompt und Human-Handoff.
- Das Bearbeiten ändert nur die konkrete Discord-Nachricht; es trainiert die AI nicht. Für dauerhaftes Lernen weiterhin `/learn` oder `/verbesserung` benutzen.
