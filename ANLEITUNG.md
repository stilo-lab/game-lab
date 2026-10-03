# Pixel · Server-Setup mit drei Designs und KI-Wünschen

## Installieren

Dieses Update gehört zu deinem bestehenden Bot mit dem zuletzt gelieferten AI-Stil-Update.

1. ZIP entpacken.
2. Im Bot-Projekt `src/index.js` durch die Datei aus diesem ZIP ersetzen.
3. Die neue Datei `src/server_setup_designs.js` ebenfalls in den vorhandenen Ordner `src` legen.
4. Änderungen auf GitHub hochladen und den Bot bei Railway neu deployen bzw. neu starten.
5. In Discord als Server-Administrator `/serversetup` ausführen.

Es werden keine neuen Pakete benötigt. Die bisherigen Bot-Dateien, Einstellungen und Assets weiterverwenden. Gojo-Grafiken sind deshalb nicht erneut enthalten. Der Bot-Token und andere Schlüssel gehören weiterhin in die vorhandenen Umgebungsvariablen.

## Die Auswahl

Die Vorlagen übernehmen die drei Schrift- und Emoji-Stile aus deinen Bildern:

| Variante | Beispiele |
| --- | --- |
| 1 · Klammern & fette Schrift | `『💬』𝐂𝐡𝐚𝐭` · `『📜』𝐑𝐞𝐠𝐞𝐥𝐧` |
| 2 · Schlicht mit Emojis | `💬│chat` · `🎫│tickets` |
| 3 · Schmuckschrift & Gaming | `💬ℂ𝕙𝕒𝕥` · `💬 \| COMMUNITY \| 💬` |
| Eigenes Design mit KI | Beschreibe Schrift, Emojis, Kategorien, Kanalnamen und Umfang selbst. |

Die drei fertigen Vorlagen enthalten jeweils 39 Kanäle in acht Kategorien: Infos, Community, Bot, Games, Giveaways, Support, Voice und Team. Sie verwenden die vorhandenen Funktionen deines Bots. Persönliche Shop-Namen aus den Screenshots werden nicht übernommen.

## Eigenen Wunsch eingeben

Wähle **Eigenes Design mit KI** und beschreibe beispielsweise:

> Mach einen kleinen blauen Gaming-Server ohne Schmuckschrift. Ich möchte Regeln, Chat, Clips, Tickets, zwei Sprachkanäle und einen privaten Team-Bereich. Nimm 🌊 als Kategorie-Emoji.

Du bekommst erst einen Entwurf. Über **KI: Wunsch ändern** kannst du danach beispielsweise schreiben: „Nenn den Chat pixel-lounge und füge einen Kanal für Ideen hinzu.“

Dafür wird die schon vorhandene Gemini-Konfiguration (`GEMINI_API_KEY` und das konfigurierte Modell) verwendet. Ohne KI-Schlüssel bleiben die drei fertigen Vorlagen verfügbar. Die KI bekommt deinen Gestaltungswunsch und den aktuellen Entwurf, keine Chatverläufe.

## Vorschau und Anwenden

- Mit den Pfeilen alle Seiten ansehen. Die Vorschau markiert neue, umbenannte und übernommene Kanäle.
- **Bestehende gestalten: AN** benennt eindeutig zugeordnete Kanäle um und verschiebt sie in die vorgesehenen Kategorien. Ihre IDs, Chatverläufe und bestehenden Kanalrechte bleiben erhalten.
- **Bestehende gestalten: AUS** behält Name und Kategorie vorhandener Kanäle bei. Fehlende Kanäle werden ergänzt.
- **Anwenden** führt den Entwurf aus. **Abbrechen** verändert den Server nicht.

Vorhandene Kanäle werden nicht gelöscht. Kanäle außerhalb des Entwurfs bleiben bestehen, auch wenn du einen kleineren Aufbau wünschst. Neue Team- und Logkanäle sind privat; aktive Tickets werden nicht als Vorlagenkanäle wiederverwendet. Bei bestehenden Kanälen gelten weiterhin ihre bisherigen Rechte, auch wenn der Entwurf einen anderen Schreibzugriff vorschlägt.

Vorhandene Zuordnungen für Tickets, Community und Team werden übernommen. Die üblichen Bot-Panels werden eingerichtet oder aktualisiert; Regeln und FAQ erhalten erkennbare Vorlagen. Ein Kanalname allein aktiviert keine zusätzliche Funktion: YouTube-Abos zum Beispiel weiterhin über das vorhandene YouTube-System einrichten.

Der Bot benötigt passende Kanal-, Nachrichten-, Thread- und Sprachrechte. Zum Erstellen fehlender Bot-Rollen braucht er außerdem „Rollen verwalten“ und eine ausreichend hohe Rolle. Fehlende Rechte werden beim Anwenden gemeldet.

Eine Vorschau läuft nach 20 Minuten oder einem Bot-Neustart ab. Dann `/serversetup` erneut starten. Nach einem teilweise fehlgeschlagenen Setup werden erfolgreich erstellte Kanal-IDs gespeichert und beim nächsten Versuch wiederverwendet.

`/setup` behält seine bisherige Funktion zum Erkennen und Verbinden vorhandener Bot-Kanäle.

## Prüfung

76 automatisierte Tests bestanden: 18 für das neue Setup, 23 für Gojo/KI und 35 für YouTube und bestehende Integration. Außerdem Syntaxprüfung der beiden geänderten Bot-Dateien. Die neuen Tests prüfen unter anderem KI-Wünsche, Administratorrechte, Vorschau, Abbruch, Umbenennen ohne Änderung bestehender Rechte, ältere Kanalzuordnungen und Wiederholungen nach Teilfehlern.

Die übrigen Bereiche der zentralen Bot-Datei sowie die vorhandenen Funktionsmodule wurden gegen das letzte Update verglichen. Keine Live-Prüfung auf Discord oder gegen Gemini durchgeführt.

Optional im bestehenden Projekt nach Installation der vorhandenen Abhängigkeiten:

```sh
node --check src/index.js
node --check src/server_setup_designs.js
node tests/server_setup_designs.test.js
```

Der Ordner `tests` enthält die neuen Tests sowie aktualisierte Vergleichsdaten für die vorhandenen Gojo-Tests; er wird für den laufenden Bot nicht benötigt.
