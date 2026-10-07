# Pixel · Mimic Party — Anleitung im Sammelupdate v1.9.3

**104 Vorlagen in zehn Kategorien**, davon 56 eingesprochene Sprüche. Dazu kommen ein eigener Kategorie-Mix, Abstimmungen, Schwierigkeitsstufen und kurze Ausschnitte aus eigenen WAV-, MP3- und OGG-Dateien. Die gesamte Mimic-Erweiterung ist in diesem Sammelupdate ab deinem Server-Setup-/AI-Stand enthalten.

## Installieren

1. Bot stoppen und den bestehenden Bot-Ordner sichern.
2. Das Sammelupdate gemäß README-DE.md installieren und die enthaltenen Dateien in den Bot-Ordner kopieren. Die Ordner `src`, `assets`, `scripts` und `tests` mit den bestehenden Ordnern **zusammenführen**. `package.json` und `package-lock.json` ersetzen.
3. Im Bot-Ordner `npm ci`, `npm run check` und `npm test` ausführen. Benötigt wird Node.js ab 22.12.
4. Bot neu starten, damit die aktualisierten Slash-Befehle registriert werden.
5. In einen Voice-Kanal gehen und `/mimic lobby` verwenden. Als Pack z. B. **Streamer-Memes** oder **Streamer + Memes + Gaming** auswählen. Mitspieler treten über **Mitmachen** bei; jeder bestätigt mit **Bereit**. Der Host startet.

Deine `.env`, gespeicherten Daten und vorhandenen Pixel-Animationen sind nicht im Paket enthalten. Die enthaltenen Dateien erweitern die bisherigen Bot-Funktionen. Für Voice braucht der Bot „Kanal ansehen“, „Verbinden“ und „Sprechen“. Die optionale Replay-Ruhe benötigt außerdem „Kanäle verwalten“. Der Host muss ausgehende Discord-Voice-Verbindungen über UDP erlauben. Kopfhörer helfen gegen Rückkopplungen.

## Kategorien

| Kategorie | Vorlagen | Beispiele |
| --- | ---: | --- |
| 🎙️ Streamer-Memes | 16 | „Clip das!“, Chat-Reaktionen, Rage, letzte Runde, Hype |
| 😂 Internet-Memes | 16 | „Bruder muss los“, „Nein! Doch! Oh!“, „Skill issue“ |
| 🎮 Gaming | 12 | One-HP-Push, GG, Respawn, eigene Arcade-Geräusche |
| ⚡ Anime | 12 | „Nani?“, Kampf-Rufe, finale Form, Power-up |
| 👻 Horror | 8 | „Dreh dich nicht um“, Geister, Monster, Schritte |
| 🥁 Beatbox | 8 | Kick, Snare, Hi-Hat und kurze Rhythmen |
| 🐾 Tier-Imitationen | 8 | Bellen, Miauen, Quaken und weitere synthetische Tier-Laute |
| 🤖 Maschinen | 8 | Motoren, Alarme, Roboter und UFOs |
| 🗣️ Stimm-Laute | 8 | Wow, Hmm, Lachen und kurze Stimmübungen |
| 🎵 Melodien | 8 | Eigene kurze Melodien zum Nachsummen |

Die Meme-Sprüche verwenden **generische synthetische Stimmen**. Es sind keine Original-Streamer-Aufnahmen oder geklonten Streamer-Stimmen. Alle Audiodateien liegen fertig im Paket; beim Spielen sind weder ein TTS-Dienst noch ein zusätzlicher KI-Schlüssel nötig. Eigene Original-Clips kannst du als Datei hochladen. `assets/mimic/SOUND_SOURCES.md` dokumentiert die Herkunft der eingebauten Sounds.

## Dein Mix und die Lobby

Der Host kann in der Lobby **eine bis fünf Kategorien** kombinieren und zwischen **Einfach**, **Normal**, **Schwer** oder **Gemischt** wählen. „Alles gemischt“ enthält alle zehn Kategorien. Der Party-Mix kombiniert Streamer-Memes, Internet-Memes und Gaming.

Jeder Mitspieler kann seine Wunsch-Kategorie auswählen und seine Stimme ändern. Der Host übernimmt mit **Stimmen übernehmen** bis zu drei der beliebtesten Kategorien. Beim Verlassen wird die eigene Stimme entfernt. Nach einer Änderung am Mix müssen alle erneut **Bereit** drücken. Während des Spiels sind die Einstellungen gesperrt.

Der Bot wechselt ausgewogen zwischen den gewählten Kategorien. Ein Sound wiederholt sich erst, wenn alle passenden Sounds gespielt wurden. Bei zehn gemischten Runden kommt jede der zehn Kategorien einmal vor. Mit `/mimic packs` siehst du die Kategorien; `/mimic sounds` zeigt Namen, IDs, Länge und Schwierigkeit. `/mimic preview id:…` liefert eine private WAV-Hörprobe. Hörproben sind während eines laufenden Spiels gesperrt.

## Eigene Clips

Eine Datei direkt an Discord anhängen und `/mimic upload` verwenden. Unterstützt werden **WAV, MP3 und OGG**, maximal **2 MB** pro Datei und **30 eigene Sounds pro Server**. WAV ohne Ausschnitt unterstützt 16-Bit PCM, Mono/Stereo und 8–48 kHz. Spielbare Vorlagen sind **0,4–6 Sekunden** lang.

Beim Hochladen kannst du die **Kategorie** und **Schwierigkeit** auswählen. Ein Meme-Clip spielt dann im Meme-Mix und ist zusätzlich unter „Eigene Clips“ verfügbar. Bestehende eigene Sounds bleiben erhalten.

Für eine längere Datei wählst du mit **von** den Startpunkt (0–120 Sekunden) und mit **dauer** einen Ausschnitt (0,4–6 Sekunden). Der Bot speichert nur die normalisierte kurze WAV-Vorlage im bestehenden persistenten Datenverzeichnis unter `mimic-sounds/<Server-ID>`. Ohne Ausschnitt werden Vorlagen über sechs Sekunden abgewiesen.

MP3, OGG und Ausschnitte benötigen FFmpeg. `npm install` versucht automatisch, die optionale FFmpeg-Binärdatei zu installieren. Alternativ funktioniert ein systemweit installiertes `ffmpeg` oder ein Pfad über `MIMIC_FFMPEG_PATH`. Die eingebauten Sounds und kurze PCM-WAV-Uploads funktionieren auch ohne FFmpeg.

## So spielt ihr

- **1–5 Spieler**, Solo zum Üben, **3–15 Runden**; Standard: 10.
- Alle hören dieselbe Vorlage einmal. Nach dem hörbaren Countdown nehmen alle gleichzeitig einen Versuch auf. Langsame Discord-Nachrichtenupdates verschieben die Aufnahme nicht.
- Die lokale Audio-Auswertung vergleicht relative Melodie, zeitlichen Verlauf, Einsätze und Dauer. Eine höhere oder tiefere Stimme allein entscheidet den Score nicht. Die Bewertung hat **0–100 Punkte** und zeigt ihre Teilwerte. Sie bewertet die akustische Ähnlichkeit, nicht die Wortbedeutung.
- Danach hört ihr die Takes einzeln im Voice-Chat. Ohne hörbares Mikrofon-Signal gibt es **0 Punkte**.
- Im **Chaos-Modus** erhält jeder zwischen den Runden eine Glücksrad-Karte: +15 Punkte, nächster Score ×2, Schild oder eine Sabotage. Sabotagen wirken auf den nächsten Take: Echo, Verzerrung, Pitch-Shift, Zerhacken, Pups-Ersatz oder 20 Punkte Abzug.
- Über **Sabotage wählen** wird ein anderer Spieler ausgewählt. Ein Ziel bekommt höchstens eine Sabotage pro Runde. Der Angreifer wird beim Replay aufgedeckt. Unbenutzte Sabotagen verfallen; Schilde und Multiplikatoren gelten einmal für die nächste Runde.
- **Klassisch** spielt ohne Glücksrad. Siege, Spiele, Gesamtpunkte und persönlicher Bestwert werden serverbezogen gespeichert. Gleichstand zählt als gemeinsamer Sieg.
- **Verlassen** entfernt Teilnahme und Take; ein laufendes eigenes Replay wird unterbrochen. Verlässt der Host die Party, übernimmt der nächste Spieler. Eine leere Lobby, ein Voice-Abbruch oder ein Fehler beendet die Session.

## Befehle

| Befehl | Funktion |
| --- | --- |
| `/mimic lobby` | Pack, Schwierigkeit, Runden, Chaos/Klassisch und Replay-Ruhe auswählen |
| `/mimic start` | Eigene Lobby starten; alle müssen bereit sein |
| `/mimic stop` | Party beenden; Host oder Serververwaltung |
| `/mimic status` | Aktuelles Spiel mit Buttons anzeigen |
| `/mimic top` | Server-Rangliste anzeigen |
| `/mimic packs` | Kategorien und verfügbare Sound-Anzahl ansehen |
| `/mimic sounds pack:… seite:1` | Sound-Katalog mit IDs und Schwierigkeit; zehn Sounds pro Seite |
| `/mimic preview id:…` | Privaten Sound zum Vorhören schicken, wenn kein Spiel läuft |
| `/mimic upload datei:… name:…` | Eigene Vorlage, optional Kategorie, Schwierigkeit und Ausschnitt; Server verwalten nötig |
| `/mimic remove id:…` | Eigenen Sound entfernen; Server verwalten nötig, keine aktive Party |
| `/mimic diagnose` | Voice-Abhängigkeiten prüfen und offene Sprechrechte wiederherstellen |

## Aufnahmen und Stabilität

Aufgenommen werden ausschließlich angemeldete und bereite Spieler während des kurzen Aufnahmefensters; maximal sieben Sekunden. Mitschnitte und Effektkopien bleiben im Arbeitsspeicher und werden nach jeder Runde oder beim Abbruch verworfen. Eigene hochgeladene Vorlagen und Ranglisten werden dauerhaft gespeichert. Eine Voice-Party wird nach einem Neustart nicht automatisch fortgesetzt.

Die optionale Replay-Ruhe setzt kurz nur das Sprechrecht der Teilnehmer in diesem Voice-Kanal aus. Vor der Aufnahme wird es wiederhergestellt. Vorhandene Server-Mutes bleiben erhalten. Die Änderungen werden vorab protokolliert und beim Neustart wiederhergestellt. Administratoren können die Discord-Sprechsperre umgehen. Eine fehlgeschlagene Wiederherstellung wird im Panel angezeigt und sperrt neue Lobbys bis zur Reparatur mit `/mimic diagnose`.

Spotify und Mimic reservieren dieselbe Voice-Verbindung gegenseitig und beenden ausschließlich ihre eigene Verbindung. Vier Server können gleichzeitig Mimic spielen. Die Bewertung läuft in einem begrenzten Worker-Pool. Die bestehenden AI-, Support-, Counting-, Ticket-, YouTube- und Pixel-Funktionen bleiben integriert.

## Umfang und Prüfung

Der Ablauf orientiert sich an der [offiziellen Steam-Beschreibung von Mimic Party](https://store.steampowered.com/app/5053820/Mimic_Party/) und seinen [Community-Soundpacks](https://steamcommunity.com/app/5053820/workshop/). Dieses Update verwendet eigene Sounds und einen eigenen lokalen Signalvergleich. Die proprietäre Original-KI, 3D-Steam-Lobby, Steam Workshop, DLCs und Steam Cloud sind keine Funktionen dieses Discord-Updates.

Die Prüfung umfasst echte Opus-Kodierung, die Discord-Audio-Pipeline, MP3/OGG-Konvertierung, alle 104 Audiodateien, Kategorien, Abstimmungen, Einwilligung, vollständige Runden, Abbrüche, Wiederherstellung der Sprechrechte, Spotify-Kollisionen und alle bisherigen Bot-Tests. Unbeteiligte Quelldateien werden zusätzlich mit der vorherigen Version verglichen. Die genauen Ergebnisse stehen in `VALIDATION.md`.

**Es wurde kein Live-Voice-Test mit deinem Discord-Bot durchgeführt.** Discord dokumentiert den Empfang von Bot-Voice-Audio nicht als stabile API. Bei Voice-Problemen hilft `/mimic diagnose`.

Technische Primärquellen: [Voice 0.19.2](https://discord.js.org/docs/packages/voice/0.19.2), [Discord Voice/DAVE](https://docs.discord.com/developers/topics/voice-connections), [VoiceReceiver](https://discord.js.org/docs/packages/voice/0.19.2/VoiceReceiver:Class), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static).
