# Pixel · Sammelupdate ab Server-Setup · v1.9.3

Dieses Paket enthält die Änderungen seit deinen drei Server-Setup-Designs und dem AI-/Support-AI-Stand auf deinem Screenshot bis einschließlich der neuen Design-Wünsche und des auswählbaren Kanal-Neustarts. Du musst die einzelnen späteren ZIPs nicht zuerst installieren. Es ist ein Update für deinen bestehenden Bot, kein neuer vollständiger Bot.

## Installieren

1. Bot stoppen und deinen bestehenden Bot-Ordner sichern.
2. Diese ZIP entpacken. Die enthaltenen Dateien direkt in deinen bestehenden Bot-Ordner kopieren: `src`, `assets`, `scripts` und `tests` **zusammenführen**, gleichnamige Dateien ersetzen. `package.json` und `package-lock.json` übernehmen.
3. Deine `.env`, Railway-Variablen, den Datenordner und `assets/pixel-gojo/` behalten. Diese ZIP enthält weder Zugangsdaten noch deine gespeicherten Bot-Daten. Die schon installierten Gojo-GIFs werden nicht mitgeliefert und nicht ersetzt.
4. Im Bot-Ordner ausführen:

```sh
npm ci
npm run check
npm test
```

5. Bot neu starten bzw. den aktualisierten Stand auf deinem bisherigen Host deployen. Der Bot registriert die Slash-Befehle beim Start wie bisher neu. Auf Railway übernimmt die übliche Installation die npm-Abhängigkeiten aus den beiden Paketdateien.

Benötigt wird Node.js **22.12 oder neuer**. Bestehende Werte für `DISCORD_TOKEN`, `OWNER_ID`, `GEMINI_API_KEY` und dein Modell weiterverwenden. Keine neuen KI-Schlüssel sind nötig. Für stabile Daten beim Deploy weiterhin den vorhandenen persistenten Datenordner bzw. das Railway-Volume nutzen.

## Server-Setup: Design und Wunsch kombinieren

1. `/serversetup` öffnen.
2. Eines der drei Designs auswählen:

| Design | Beispiel |
| --- | --- |
| Klammern & fette Schrift | 『💬』𝐂𝐡𝐚𝐭 |
| Schlicht mit Emojis | 💬│chat |
| Schmuckschrift & Gaming | 💬ℂ𝕙𝕒𝕥 |

3. Auf **Wunsch ergänzen** klicken. Beispiele:

```text
Mache eine Voice-Kategorie über Blabla mit Gaming, Chill und Musik.
Setze Gaming-Voice über Chill und füge zwei Minecraft-Voice-Chats hinzu.
Behalte die Klammern und mache eine Kategorie für Roblox und eine für YouTube.
Mache die Kanalnamen auf Deutsch und einen privaten Team-Bereich.
```

4. Die KI verändert den aktuellen Entwurf; der ausgewählte Namenstil bleibt erhalten. Kategorien und Kanäle werden in der Vorschau in ihrer geplanten Reihenfolge angezeigt. Du kannst weitere Wünsche ergänzen.
5. Wenn du einen völlig eigenen Stil willst, **Eigenes Design mit KI** im Menü wählen. Die drei Vorlagen funktionieren auch ohne Gemini-Schlüssel; zusätzliche Wünsche benötigen den bestehenden `GEMINI_API_KEY`.
6. Vorschau prüfen und **Anwenden** drücken. Das Öffnen, Wünschen und Durchblättern verändert noch keinen Serverkanal.

Die Reihenfolge wird tatsächlich über Discord gesetzt. Discord zeigt innerhalb einer Kategorie Text- und Sprachkanäle in getrennten Gruppen an. Soll Voice über einem Textbereich stehen, plant die KI dafür eine eigene Voice-Kategorie darüber. Vorhandene Kanalrechte werden beim Umbenennen oder Verschieben nicht ersetzt. Neue Team-Kanäle sind privat.

## Alte Kanäle behalten oder löschen

**Alte Kanäle: BEHALTEN** ist immer die erste Auswahl. Passende bestehende Kanäle werden weiterverwendet. Über **Bestehende gestalten: AUS** bleiben ihre Namen und Kategorien erhalten; fehlende Kanäle werden ergänzt.

Mit **Alte Kanäle: LÖSCHEN** wählst du einen vollständigen neuen Aufbau. Die Vorschau nennt die Anzahl und hängt zwei Dateien an:

- `pixel-zu-loeschende-kanaele.txt`: genaue IDs und Namen der alten Kanäle/Kategorien.
- `pixel-alte-kanalstruktur.json`: Namen, Typen, Kategorien, Positionen, Themen, Kanalrechte und bisherige Bot-Zuordnungen.

Diese Sicherung enthält **keine Nachrichten, Thread-Inhalte, Dateien, Webhooks oder Einladungen**. Das Löschen entfernt die Inhalte der betroffenen Kanäle dauerhaft. Die Sicherung kann diese Nachrichten nicht wiederherstellen.

Nach **Anwenden** musst du **ALTE KANÄLE LÖSCHEN** in das Bestätigungsfeld tippen. Nur der Ersteller darf seine Vorschau bestätigen. Einen vollständigen Neustart dürfen der Server-Owner, der konfigurierte Bot-Owner oder die Bot-Verwaltung starten. Der Bot-Owner und der Server-Owner brauchen selbst kein zusätzliches „Kanäle verwalten“; die tatsächlichen Discord-Aktionen führt Pixel mit seinen Bot-Rechten aus. Normales Anlegen und Gestalten bleibt ohne eigene Verwaltungsrechte möglich.

Pixel erstellt zuerst den neuen Aufbau, wendet die Reihenfolge an und verbindet die Bot-Funktionen. Nur wenn diese Einrichtung erfolgreich ist, beginnt er mit der vorher bestätigten Löschliste. Er löscht keine gerade erst neu erstellten Kanäle. Ändert sich der Server vor der Ausführung, verlangt die aktualisierte Vorschau eine neue Bestätigung. Neu hinzugekommene oder veränderte Kanäle während des Neustarts stoppen weitere Löschungen.

Vorher aktive Mimic-/Spotify-Partys beenden und offene Tickets/Mitspieler-Teams schließen. Bisherige Community-Regeln, Discord-Teamhinweise, System- und AFK-Kanäle werden auf passende neue Kanäle umgestellt; dafür benötigt **der Bot** zusätzlich „Server verwalten“. Ein Community-Entwurf braucht einen öffentlichen Textkanal sowie einen privaten Team-Textkanal. Benötigte Rollen legt der Bot mit „Rollen verwalten“ an, sofern die Support-Rolle noch fehlt.

Alte und neue Kanäle müssen kurz gleichzeitig Platz im Discord-Kanal-Limit haben. Reicht der Platz nicht, wird nichts gelöscht. Ein kleinerer Entwurf schafft Platz für den sicheren Aufbau.

Bei einem Fehler bleibt der Fortschritt in den Bot-Daten gespeichert. `/serversetup` öffnet nach einem Neustart die gespeicherte Vorschau wieder. **Neustart fortsetzen** verwendet die schon erstellten Kanäle; die ursprüngliche Löschliste wird nicht erweitert. Es gibt keine automatische Fortsetzung von Löschungen beim Bot-Start. **Neustart beenden** behält den aktuellen Aufbau aus verbliebenen alten und bereits neuen Kanälen und beendet weitere Löschungen. Bereits gelöschte Nachrichten kommen dadurch nicht zurück. Die letzte Struktursicherung bleibt über `/serversetup` herunterladbar.

Bestehende YouTube-Abos werden vor dem Löschen auf den neuen YouTube-Uploads-Kanal umgestellt, inklusive Upload-Verlauf, Warteschlange und Ping-Rolle. Wenn ein Ziel fehlt, sich dessen öffentlicher/privater Zugriff ändern würde oder doppelte Abos entstehen würden, bleibt der Neustart angehalten. Dann `/uploads` prüfen oder den Neustart beenden und den Entwurf ergänzen.

## Die enthaltenen späteren Updates

| Update | Enthaltene Änderungen |
| --- | --- |
| AI & Support-AI | Mehr Gesprächskontext, passende Serverinformationen, frühere Lösungsversuche, Screenshots und zuverlässigere Support-Fallbacks; lockerer deutscher Chatstil. |
| Stabilität | Persistente Kanal-IDs für Counting und andere Bot-Funktionen, zuverlässigere Zählung, geschützte Ticket-Zuordnungen und Datenbank-Sicherung. |
| Zehn Pixel | Gojo, Sukuna, Geto, Nanami, Toji, Zelda, Link sowie Nova, Ember und Luna mit eigenen Animationen. Auswahl beim ersten `/ai`, Wechsel über `/pixel`. Bestehende persönliche Auswahl bleibt erhalten. |
| `/new` | Aufgaben in normaler Sprache: Kategorien und Text-/Voice-Kanäle, normale Rollen, Umbenennen, Kanalthemen, Nachrichten, Umfragen und Counting-Zuordnung; Fragen, Texte und Code. |
| AI-Gedächtnis | Gesprächsverlauf pro Nutzer/Server/Kanal, gezielte Reaktion auf Korrekturen und optional Google-Suche bei aktuellen Fragen mit einem geeigneten vorhandenen Modell. |
| Mimic Party | Voice-Spiel für 1–5 Spieler, 104 Vorlagen in zehn Kategorien, Streamer-Memes, eigene Clips, Kategorien-Mix, Abstimmungen, Runden, Replays, Chaos-Effekte und Rangliste. |
| Berechtigungen | `/create`, `/setup`, `/setupmap`, normales `/serversetup` und unterstützte `/new`-Aktionen verwenden die Bot-Rechte. Private Logs und Bot-Verwaltung bleiben gesichert. |
| Neues Server-Setup | Ausgewähltes Design plus Zusatzwunsch, tatsächliche Reihenfolge sowie Behalten/Löschen mit Vorschau, Struktursicherung und unterbrechbarem Fortschritt. |

`/new` unterstützt die oben genannten Aktionen, führt aber keinen erzeugten Programmcode aus und installiert keine neuen Bot-Module. Kanalzugriff und Schutz der Bot-Einstellungen gelten weiterhin. Beschränkungen für Owner- und Moderationsbefehle bleiben bestehen.

Öffne `assets/preview/index.html` für die Pixel-Vorschau. Deine vorhandenen Gojo-Animationen bleiben im Bot; Hollow Purple wird nicht hinzugefügt. Die mitgelieferten Gojo-Porträts gehören zur Figurenauswahl, nicht zu einem Austausch deiner Gojo-GIFs.

Die Mimic-Anleitung steht in `MIMIC-ANLEITUNG.md`. Die Meme-Stimmen sind generische synthetische Stimmen und eigene Sounds. Die proprietäre Originalspiel-KI und Steam-Funktionen gehören nicht zu diesem Discord-Spiel. Eigene MP3/OGG-Clips benötigen FFmpeg; die fertigen WAV-Vorlagen funktionieren ohne zusätzlichen TTS-Dienst oder KI-Schlüssel.

## Prüfung

Die Ergebnisse stehen in `VALIDATION.md`; `UPDATE_MANIFEST.json` enthält die Prüfsummen der gelieferten Dateien. Geprüft wurden die Änderungen und die Installation auf Kopien des älteren Server-Setup- und AI-/Support-AI-Stands.

**Kein Live-Test mit deinem Discord-Bot.** Es wurden keine echten Discord-Kanäle gelöscht oder geändert. Deine gespeicherten Bot-Daten werden durch die Installation des Updates nicht mit einer neuen Datenbank ersetzt.

Technische Primärquellen für die neuen Setup-Funktionen: [Discord: Kanalpositionen](https://docs.discord.com/developers/resources/guild#modify-guild-channel-positions), [Discord: Kanäle löschen](https://docs.discord.com/developers/resources/channel#deleteclose-channel), [Discord: System- und Community-Kanäle](https://docs.discord.com/developers/resources/guild#modify-guild).
