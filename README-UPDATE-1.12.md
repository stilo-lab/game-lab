# Pixel 1.12.0 – KI-Denkmodus und Fehler aus der Aufnahme

Vollständiges Update auf Basis von Pixel 1.11.0. Das Paket enthält **41 Quellmodule** und alle **198 bisherigen Assets**. Rollen-Design, Mimic mit Originalclips und Spielleiter, Pixel-Anzeige und Auswahl, `/new`, Tickets, Counting, YouTube, Giveaways und bisherige Community-/Staff-Funktionen bleiben enthalten.

## Installieren

1. ZIP entpacken.
2. Alle **41 Dateien aus `src`** direkt in deinen vorhandenen GitHub-Ordner `src` hochladen. Gleichnamige Dateien ersetzen; neue hinzufügen. Insbesondere `src/ai_reasoning.js` und `src/setup_roles.js` müssen mitkommen. Kein zusätzlicher `src/src`-Ordner.
3. `package.json` und `package-lock.json` im Hauptordner ersetzen.
4. Für automatische Tests den gesamten `tests`-Ordner einschließlich `fixtures` übernehmen.
5. Commit speichern und den Railway-Deploy abwarten.

Vorhandene Variablen, Zugangsdaten, Assets und das dauerhafte Datenverzeichnis weiterverwenden. Die ZIP enthält keine Ersatz-Datenbank. Es ist kein erneutes Server-Setup und kein Löschen von Kanälen erforderlich.

## Fehlerbehebungen

Die Aufnahme zeigt Version 1.10.1 und unter anderem diese Meldungen:

| Beobachtung | Änderung |
| --- | --- |
| `Cannot read properties of null (reading 'id')` in `/ai` | Anfragen ohne Server bekommen eine verständliche Antwort, bevor Einstellungen oder Pixel-Auswahl auf die Server-ID zugreifen. |
| Gemini `429` und Ticket-Fallbacks nach erschöpftem Kontingent | Auch ohne Wiederholungsversuch wird eine Wartefrist gespeichert. Weitere zu frühe Anfragen werden lokal abgewiesen. Bei `429` startet kein sofortiger Ersatzmodell- oder Ticket-Fallback-Aufruf. Das Ticket bleibt offen. |
| Gemini `503/504` | Bestehende begrenzte Wiederholungen und Modell-Fallbacks bleiben aktiv. Die letzte gescheiterte Anfrage hinterlässt ebenfalls eine Pause, statt die nächsten Anfragen sofort erneut zu senden. |
| Abgelehnte Kanal-ID im YouTube-Feed | Der Parser erkennt zusätzlich die Atom-Feed-ID und den offiziellen Self-Link. Das offizielle Atom-Format kann eine Kanal-ID im Feed-Kopf weglassen. Jeder Videoeintrag muss weiterhin zum erwarteten Kanal gehören. Widersprüchliche oder fremde Feeds werden abgewiesen; gespeicherte Abos bleiben erhalten. |

Gemini-Ausfälle und ein tatsächlich erschöpftes API-Kontingent können durch Bot-Code nicht beseitigt werden. Das Update verbessert die Behandlung: kein endloser Neuversuch, keine falsche Erfolgsmeldung und keine gelöschten Tickets oder Verläufe. Bei YouTube beweist die Aufnahme nicht, welches konkrete Feed-Format vorlag; die zusätzliche gültige Atom-Variante ist getestet, eine tatsächlich falsche Kanalzuordnung wird weiterhin nicht übernommen.

Gemini berücksichtigt jetzt auch RetryInfo-Angaben des SDK, eingebettete `retryDelay`-Werte und explizite Retry-After-Header. Ohne eine konkrete Frist verwendet der Bot bei `429` zunächst 60 Sekunden. Wartende Jobs und heruntergefahrene Instanzen bleiben über die vorhandene Queue begrenzt.

## Stärkere KI

Schwierige Anfragen erhalten das konfigurierte `GEMINI_REASONING_MODEL`. Ist es nicht gesetzt, nutzt der Chat für anspruchsvolle Aufgaben das bereits konfigurierte `GEMINI_SUPPORT_MODEL`; Smalltalk bleibt beim normalen `GEMINI_MODEL`.

Das neue Modul unterscheidet Code, Mathematik, Planung und wiederholt gescheiterte Problemlösungen. Unterstützte Gemini-3-Textmodelle erhalten passende Thinking-Level; Gemini 2.5 erhält passende Thinking-Budgets. Unbekannte Modellfamilien behalten kompatible Einstellungen.

Der Denkmodus bekommt ausreichend Platz für interne Verarbeitung und den eigentlichen Antworttext. Bei abgeschnittener Ausgabe erfolgt maximal ein weiterer Versuch mit mehr Platz. Bleibt sie abgeschnitten, wird sie nicht als vollständige Lösung ausgegeben oder als erfolgreiche Antwort gespeichert.

Bei komplexem Code, mehrstufigen Rechnungen, umfangreicher Planung und wiederholter erfolgloser Fehlersuche prüft ein zusätzlicher KI-Aufruf den Entwurf. Er soll konkrete Fehler oder übergangene Einschränkungen korrigieren. Nur die endgültige Antwort wird im Gespräch gespeichert. Ein fehlgeschlagener oder unbrauchbarer Prüfschritt lässt eine zuvor vollständige Antwort bestehen. Das ist eine zusätzliche Prüfung, keine Garantie fehlerfreier Antworten.

Der deutsche lockere Chat-Stil, `/learn`, Admin-Feedback, Recherche und isolierte Gesprächsspeicherung bleiben erhalten. Das Update vergibt keine messbare neue IQ-Zahl.

Mehr Denken und die zusätzliche Prüfung können längere Antwortzeiten und höheren API-Verbrauch bedeuten. Mit `GEMINI_ANSWER_REVIEW=false` lässt sich nur der zusätzliche Prüfschritt abschalten. `GEMINI_REASONING_MODEL` kann auf ein für deinen Schlüssel verfügbares Modell gesetzt werden. Falls ein Denkparameter oder das ausgewählte Modell abgelehnt wird, versucht der Bot den kompatiblen konfigurierten Chat-Pfad. Bestehende Schlüssel werden nicht ersetzt.

## Prüfung und Quellen

Prüfbericht: `VALIDATION-1.12.md`. Die API-Aufrufe werden in den Tests simuliert; ein Live-Test auf deinem Discord-Server oder Railway wurde nicht durchgeführt.

Die Fehler- und Modellbehandlung wurde anhand der offiziellen Dokumentation geprüft:

- https://ai.google.dev/gemini-api/docs/generate-content/thinking
- https://ai.google.dev/gemini-api/docs/troubleshooting
- https://developers.google.com/youtube/v3/guides/push_notifications

Die Rollen-Anleitung steht weiterhin in `README-UPDATE-1.11.md`. Die ältere Mimic-Anleitung und Quellen bleiben in `README-START-FIX.md` enthalten.
