

## v1.5.9 – Owner `/links`

- `/links` ist nur für den in `OWNER_ID` eingetragenen Bot-Owner.
- Zeigt alle Server, auf denen der Bot aktuell Mitglied ist.
- Für jeden Server versucht der Bot einen permanenten Invite (`maxAge=0`, `maxUses=0`) zu erstellen.
- Bereits erstellte Bot-Invites werden wiederverwendet.
- Falls dem Bot `Einladung erstellen` fehlt, wird der Server trotzdem angezeigt und der Fehler genannt.
- Die Ausgabe ist ephemeral und nur für den Owner sichtbar.
