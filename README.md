# v1.6.1 Update – /create + /setup Rechte

Ausgehend von v1.6.0.

In GitHub ersetzen:
- `src/index.js`
- `package.json`

Neu:
- `/create` zeigt die fehlenden Setup-Kanäle in einem Mehrfach-Auswahlmenü.
- Nur ausgewählte Kanäle werden erstellt.
- Danach werden die neu gefundenen Kanäle automatisch eingerichtet.
- `/setup` erstellt weiterhin nichts.
- `OWNER_ID` darf `/setup` auch ohne Administrator-Rolle benutzen.
- Andere Nutzer benötigen Administrator oder `Kanäle verwalten`.
- `/create` benötigt beim ausführenden Nutzer Administrator oder `Kanäle verwalten`; der Bot selbst braucht ebenfalls `Kanäle verwalten` oder Administrator.
