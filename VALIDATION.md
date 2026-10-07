# Pixel Sammelupdate v1.9.3 · Prüfung

- `npm run check`: alle **30** Module der vollständigen Bot-Zusammenführung erfolgreich geprüft.
- `npm test`: **270 bestanden, 0 fehlgeschlagen, 0 abgebrochen, 0 übersprungen**.
- Dieselben **270 Tests** bestehen auch nach dem Aufspielen der Sammeldatei auf eine Kopie des älteren Server-Setup-Bots v1.7.4.
- Das Update ist zusätzlich bytegenau mit dem früheren Pixel-Gojo-Stand und dem AI-/Support-AI-Stand des Screenshots zusammengesetzt worden: Quellen, Assets und Tests entsprechen der geprüften v1.9.3-Arbeitskopie.
- Die frühere `Pixel-Server-Setup-Designs.zip` ist mit ihrem ursprünglichen SHA-256 geprüft worden; ihre Quellen entsprechen dem verwendeten Server-Setup-Basisstand.

## Neue Setup-Prüfungen

- Zusatzwünsche bei allen drei Vorlagen erhalten den gewählten Stil und bekommen dessen aktuellen Entwurf. Ein bewusst gewähltes eigenes KI-Design bleibt frei gestaltbar.
- Klammern, Schmuckschrift, Emojis, Kennungen, Bot-Funktionen und gewünschte Reihenfolge bleiben nach der Stilformatierung erhalten.
- Voice über einem Textbereich verwendet eine eigene vorgelagerte Kategorie. Die konkreten Kategorie-/Voice-Positionen werden an die Discord-API übergeben.
- Behalten ist Standard; Abbrechen und bloße Vorschauen legen keine Kanäle an und löschen keine Kanäle.
- Gewöhnliche Nutzer können ohne eigene Verwaltungsrechte einrichten, aber keinen vollständigen Kanal-Neustart freigeben. Die tatsächliche Integration erlaubt den Server-/Bot-Owner ohne zusätzliche Kanal-Verwaltungsflags.
- Löschen verlangt die exakte Bestätigung durch den Ersteller im gleichen Server; fremde Nutzer, falsche Bestätigung, alte Buttons und geänderte Vorschauen führen keine Kanalaktionen aus.
- Struktursicherung, genaue Löschliste und dauerhaftes Fortschrittsprotokoll werden erstellt. Ersatzkanäle und Bot-Panels entstehen vor dem ersten Löschen.
- Fehler beim Anlegen, Ordnen, Speichern oder Verbinden der Panels starten keine Löschungen. Unterbrochene Erstellung und Löschung verwenden nach einem Neustart dieselben Ersatz-IDs und die ursprüngliche Löschliste.
- Neue/veränderte Kanäle während der Ausführung stoppen weitere Löschungen. Kategorien werden erst nach ihren Kindern entfernt. Ein nachweislich schon entfernter alter Kanal wird nicht mit einer neuen ID verwechselt.
- Ein ausdrücklich beendeter Neustart kann über eine frühere Bestätigung nicht wieder aktiviert werden.
- Aktive Mimic-/Spotify-Partys sowie offene Tickets und Teams halten den Neustart an. Kanal-Limits werden vor jeder Erstellung geprüft.
- System- und Community-Referenzen werden mit den Bot-Rechten umgestellt, bevor ihre alten Kanäle verschwinden.
- YouTube-Abos werden inklusive bestehendem Upload-Verlauf, Warteschlange und Ping-Rollen umgebunden. Fehlende Ziele, unterschiedliche öffentliche/private Zugriffe und doppelte Abos stoppen die Umstellung vor der ersten Abo-Änderung.

## Bisherige Funktionen

Alle vorhandenen AI-, Support-, Pixel-, Counting-, Ticket-, `/new`-, YouTube-, Berechtigungs- und Mimic-Tests bestehen. Die Audio-Tests prüfen echte WAV-Dateien, Opus-Kodierung, Worker-Auswertung und die lokale Discord-Audio-Pipeline.

Von den 28 bisherigen v1.9.2-Modulen wurden nur `index.js` und `server_setup_designs.js` für dieses Setup-Update angepasst; **26 bleiben bytegenau erhalten**. Zwei neue Module kapseln Wunsch-Stil/Reihenfolge und Neustart/Sicherung. Historische Vergleichstests behalten ihre ursprünglichen Prüfsummen und prüfen auch die unveränderten Teile der beiden angepassten Module.

Die Sammeldatei liefert 25 geänderte/neue Quellen seit dem älteren Stand und 184 hinzugekommene Assets. Die vorhandenen 14 Gojo-Dateien bleiben Teil des installierten Bots und werden nicht überschrieben. Der vollständige getestete Bot enthält 30 Quellen und 198 Assets, darunter die 104 Mimic-WAV-Dateien.

Umgebung: Node.js 24.19.0, discord.js 14.27.0, @discordjs/voice 0.19.2. Für die neuen Setup-Funktionen wurden keine zusätzlichen npm-Abhängigkeiten eingeführt; die benötigten Mimic-Abhängigkeiten aus den zwischenzeitlichen Updates sind in package.json/package-lock.json enthalten.

**Keine Live-Prüfung auf deinem Discord-Server und kein Test gegen deinen Gemini-Schlüssel.** Discord-Aufrufe in den Tests sind gemockt. Es wurden keine echten Kanäle, Nachrichten oder Berechtigungen verändert. Die ZIP enthält keine Zugangsdaten, Nutzer-Datenbank oder node_modules.
