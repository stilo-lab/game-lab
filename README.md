# Setup Fix v1.5.1

Ersetze in GitHub:
- `src/index.js`
- `src/community.js`
- `src/staff.js`
- `package.json`

Neues Verhalten von `/setup`:
1. vorhandene Kanäle scannen (Fancy Fonts + optional AI/Nachrichtenverlauf),
2. erkannte Kanäle sofort mit den passenden Bot-Funktionen verbinden,
3. Panels in erkannten Kanälen erstellen/aktualisieren,
4. fehlende Kanäle im privaten Setup-Fenster anzeigen,
5. keine neuen Kanäle oder Kategorien erstellen.

`/serversetup` bleibt der Command, der eine komplette Server-Struktur erstellen darf.
