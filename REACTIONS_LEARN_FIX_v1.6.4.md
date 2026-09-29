# v1.6.4 – Reaktions-Fix + Learn 2.0

## Reaktionen
- Die automatische 💡 👍 👎 Reaktion in erkannten Suggestions-/Einsende-Kanälen wurde komplett entfernt.
- Formelle Suggestions aus dem Bot-Menü behalten ihre eigenen Upvote/Downvote-Buttons.
- Nachrichten mit @everyone oder @here bekommen keine automatische Übersetzungsreaktion.
- Auch Counting setzt bei Mass-Mentions keinen Reaktions-Emoji.

## /learn 2.0
`/learn add` benötigt nur noch `wissen`. Die restlichen Felder sind optional:
- `ziel`: /ai, Support AI oder beide; sonst automatische Erkennung.
- `art`: Verhalten/Stil oder Wissen/Fakt; sonst automatische Erkennung.
- `bereich`: Server (Standard) oder global (nur Owner).
- `thema`: optional.

Die AI präzisiert unklare Stil-Anweisungen, ohne die Bedeutung zu verändern, und zeigt danach verständlich, was gespeichert wurde und wie sie die Regel interpretiert. Exakte Duplikate werden erkannt.
