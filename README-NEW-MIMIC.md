# Pixel: /new & Mimic Party – Update 1.10.0

Zusatz zu deinem Pixel-Verbesserungs-Update 1.9.4. Der Pixel-Anzeige-Fix ist ebenfalls enthalten.

## Installation

1. ZIP entpacken.
2. Alle **12 Dateien aus `src`** direkt in deinen bestehenden GitHub-Ordner `src` hochladen. Gleichnamige Dateien ersetzen.
3. `package.json` und `package-lock.json` im Hauptordner ersetzen.
4. Falls dein Projekt automatische Tests ausführt: Die Dateien aus `tests` ebenfalls an denselben Pfaden übernehmen.
5. Bot neu deployen bzw. neu starten. Er registriert die neuen Slash-Unterbefehle beim Start.

Für dieses Update brauchst du keine neuen Asset-Ordner. Die Pixel-Anzeige-GIFs und 24 bisherige normale Mimic-Sounds sind zusätzlich in Quelldateien enthalten. Deine vorhandenen Dateien und Ordner behalten, damit andere Funktionen und Vorschauen sie weiter nutzen können.

## /new: Rollen, Rechte und Server-Aktionen

Beispiele für das Feld `wunsch`:

- „Erstelle eine Rolle Helfer, gib ihr Nachrichten verwalten und weise sie @Mia zu.“
- „Gib @VIP in #lounge Zugriff und die Erlaubnis zu schreiben.“
- „Entferne bei @VIP Dateien anhängen. Die anderen Rechte behalten.“
- „Verschiebe #gaming-chat in die Kategorie Gaming und setze 15 Sekunden Slowmode.“
- „Begrenze den Voice-Kanal Lobby auf fünf Personen.“
- „Gib @Mia einen Timeout für zehn Minuten wegen Spam.“
- „Hebe den Timeout von @Mia auf.“
- „Pinne Nachricht 123456789012345678 in #ankündigungen.“

Neu angeschlossen: Rollen zuweisen/entfernen, Rechte ergänzen/entziehen, Rollen umbenennen/färben/verschieben/löschen, Kanalrechte erlauben/verbieten/vererben, Kanäle verschieben/sperren/löschen, Slowmode, Voice-Limits/Bitrate, aktuelle Nachrichten aufräumen, Nachrichten pinnen/lösen, Timeouts, Kicks, Banns/Entbannen, Nicknames, Einladungen und Servername/Beschreibung. Die bisherigen Aktionen für Kanäle, Umfragen, Counting, Bot-Einstellungen und Antworten bleiben erhalten.

Rechte-, Moderations- und Löschaufträge erscheinen zuerst als konkrete Vorschau mit **Ausführen**. Nur der Auftraggeber kann sie ausführen. Beim Ausführen werden aktuelle Rechte erneut geprüft. Ein Teilfehler wird mit den schon erledigten Schritten gemeldet.

Die tatsächlichen Discord-Aktionsrechte braucht **Pixel**. Die Bot-Verwaltung oder der Owner beauftragt sensible Änderungen. Der Bot-Owner braucht dafür keine eigenen Discord-Flags wie „Rollen verwalten“. Administrator-/Rollenverwaltungsrechte vergeben dürfen Administratoren oder Owner. Pixels höchste Rolle muss über den betroffenen Rollen und zu moderierenden Mitgliedern stehen. Pixel vergibt nur Rechte, die er selbst besitzt.

Es werden nur ausdrücklich genannte Rechte ergänzt oder entfernt. Andere Rechte bleiben erhalten, ebenso die Kanalrechte beim Verschieben. Registrierte Counting-, Ticket- und andere Systemkanäle sind vor allgemeinen Löschaufträgen geschützt. Die bisherigen Beschränkungen für Bot-Einstellungen bleiben erhalten.

`/new` führt die angeschlossenen Discord-Aktionen aus. Beliebige Kontozugriffe, Programme und das selbstständige Umschreiben des laufenden Bot-Codes gehören nicht dazu. Für nicht angeschlossene Aufgaben oder fehlende Angaben erklärt die AI das bzw. fragt gezielt nach.

## Mimic Party

1. In einen Voice-Chat gehen.
2. Optional `/mimic mic`: Dein Mikrofon wird 2,5 Sekunden geprüft. Der Pegel wird angezeigt; der Mitschnitt wird sofort gelöscht.
3. `/mimic lobby` öffnen. Beim ersten Mal werden die vorgeschlagenen Streamer-Clips geladen.
4. Mitspieler drücken **Mitmachen** und **Bereit**, dann startet der Host.

Alle hören dieselbe Vorlage und machen sie nach dem Countdown gleichzeitig nach. Ein Versuch pro Runde; anschließend lokale Bewertung von Melodie, Rhythmus und Einsätzen, Replays und Glücksrad mit Boni, Multiplikatoren und Sabotagen.

Neu:

- Synthetische Sprachvorlagen sind im normalen Spiel ausgeschaltet.
- Kurze Reaktionsfenster zwischen den Replays; die Mikrofone werden zwischen den Takes wieder freigegeben.
- Replay-Ruhe ist automatisch aktiv, wenn Pixel „Kanäle verwalten“ besitzt. Server-Administratoren können Discord-Kanalsperren umgehen.
- Host kann **Pause** vormerken. Nach der Runde sind die Takes gelöscht und die Mikrofone frei, bis der Host fortsetzt.
- **Noch eine Party** erstellt eine frische Lobby. Aufnahme-Zustimmung wird durch erneutes Beitreten und Bereit eingeholt.
- Das Glücksrad zeigt vor den Karten eine Drehphase.
- Kategorie-Mix, Wunsch-Abstimmung, Schwierigkeit, Rangliste und bisherige Audioeffekte bleiben erhalten.
- Fehlende Sound-Asset-Ordner können über die enthaltenen normalen Sounds ersetzt werden.

## Streamer-Clips

**Die Streamer-MP3s sind nicht als Audiodateien in der ZIP enthalten.** Der Bot lädt die fünf kurzen Community-Clips beim ersten Lobby-Aufruf aus dem Internet, speichert sie in seinem bestehenden Datenverzeichnis und verwendet sie danach wieder. Behalte dein dauerhaftes Railway-Datenverzeichnis, damit sie Neustarts überstehen.

| Vorgeschlagener Clip | Quelle |
| --- | --- |
| Trymacs – On me, ich bin tot | [Myinstants](https://www.myinstants.com/en/instant/on-me-ich-bin-tod-trymacs-67591/) |
| Papaplatte – Stanni? | [Myinstants](https://www.myinstants.com/en/instant/stanni-papaplatte-3424/) |
| Papaplatte – Tamaris | [Myinstants](https://www.myinstants.com/en/instant/papaplatte-tamaris-24889/) |
| BastiGHG – Wo ist Guam? | [Myinstants](https://www.myinstants.com/en/instant/bastighg-wo-ist-guam-5562/) |
| BastiGHG – Ay Zip | [Myinstants](https://www.myinstants.com/en/instant/bastighg-ay-zip-8128/) |

| Befehl | Funktion |
| --- | --- |
| `/mimic originals` | Vorschläge laden bzw. erneut versuchen; zeigt IDs und Quellen. |
| `/mimic sounds pack:streamers` | Verfügbare Streamer-Clips auflisten. |
| `/mimic preview id:…` | Vorlage privat vorhören. |
| `/mimic import link:…` | Eine Myinstants-Sound-Seite oder deren direkten MP3-Link importieren. |
| `/mimic upload` | Eigene Originalaufnahme als WAV, MP3 oder OGG hinzufügen. |

Name, Kategorie, Schwierigkeit und Ausschnitt sind einstellbar. Clips: 0,4–6 Sekunden, höchstens 2 MB, bis zu 30 eigene/importierte Clips pro Server. Weitere Links und Uploads verwaltet die Serververwaltung oder der Owner; die feste Vorschlagsliste kann aus jeder Lobby geladen werden.

Audio wird dekodiert und vereinheitlicht. Pixel erzeugt oder klont keine Streamer-Stimme. Die Namenszuordnung stammt von den Community-Soundboard-Seiten; über Vorhören kannst du die Aufnahme prüfen. Nicht erreichbare Quellen werden gemeldet und nicht durch KI-Stimmen ersetzt. Ein erneuter Import oder dein eigener Datei-Upload ist möglich. Ein YouTube-Video-Downloader ist nicht angeschlossen.

## Prüfung

**357 automatisierte Tests bestanden.** Alle 37 Quelldateien bestehen die JavaScript-Syntaxprüfung. Die Prüfung umfasst Rollen-/Kanalrechte, Autorisierung, Hierarchie, Erhalt bestehender Rechte, Teilfehler, echte MP3-Dekodierung mit simulierten Download-Antworten, Speicherung, Wiederverwendung, Mikrofontest, Pausen, Reaktionsfenster, frische Lobby und fehlende Asset-Ordner. Alle vorherigen 34 Module wurden mit dem gelieferten Stand verglichen; nur die dokumentierten /new- und Mimic-Änderungen sind hinzugekommen. Bestehende Assets wurden unverändert übernommen.

Keine neuen Paketabhängigkeiten. Die bisherigen Discord-/Voice- und FFmpeg-Abhängigkeiten bleiben erhalten. `/mimic diagnose` hilft bei Voice-Problemen.

Noch nicht live auf Discord, mit echtem UDP-Voice oder gegen die Clip-Downloadserver geprüft. YouTube-Videozugriff und Abspielen der recherchierten MP3s waren hier blockiert. Die Testaufnahmen prüfen die Audioverarbeitung, nicht die Echtheit eines Community-Uploads.

Die Spielmechanik folgt der [offiziellen Steam-Beschreibung](https://store.steampowered.com/app/5053820/Mimic_Party/). Dies ist eine Discord-Umsetzung; originale 3D-Oberfläche und nicht veröffentlichte interne Bewertungsformel sind nicht enthalten. Rechteprüfungen folgen der [Discord-Dokumentation](https://docs.discord.com/developers/topics/permissions).

