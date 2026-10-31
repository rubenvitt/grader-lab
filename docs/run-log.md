# Lauf-Protokoll

Was bei den echten Läufen passiert ist, in zeitlicher Reihenfolge. Die maschinenlesbare Fassung jedes Häppchens steht in `data/results/run-log.jsonl`, Fehlversuche stehen unverändert in `data/raw/errors.jsonl`.

## Bug 1: Reconnect-Hinweise galten als Fehlschlag (E1, erstes Häppchen)

**Beobachtung:** Nach 64 erfolgreichen Aufrufen brach E1 mit `repeated-failures` ab (Exit 4). Sechs Einträge in `errors.jsonl` zeigen `codex exit 0` mit Ereignissen wie `Reconnecting... 2/5 (unexpected status 403 Forbidden ...)`, aber ohne `turn.failed`. Ein Einzelaufruf direkt danach lief normal.

**Ursache:** `interpret` zählte jedes Ereignis vom Typ `error` als Fehlschlag. Die Codex-CLI meldet so aber auch vorübergehende Verbindungsprobleme und antwortet danach trotzdem. Die Antworten dieser sechs Aufrufe sind deshalb verworfen worden und nicht mehr vorhanden. Die Bestätigung kam mit dem nächsten Häppchen: Rohantworten enthalten das Ereignis „Falling back from WebSockets to HTTPS transport“ und danach eine gültige Antwort.

**Fix:** Nur `turn.failed`, ein Exit-Code ungleich 0 oder eine fehlende Antwort zählen noch als Fehlschlag. Test: `interpret keeps an answer that arrived after reconnect notices`.

**Folgen:** Sechs Aufrufe vom Budget verbraucht. Keine Antwort war zuvor in die Auswertung gelangt, kein Lauf muss wiederholt werden. Die Fehlerzeilen bleiben als Beleg stehen.

## Hinweis: `tainted` schlägt auch bei Transport-Hinweisen an

Der Fallback erscheint in den Ereignissen als `item.completed` vom Typ `error`. `interpret` markiert solche Antworten als `tainted`, obwohl kein Tool lief. Der Code bleibt so, damit alle Rohdaten nach derselben Regel markiert sind. Die eingefrorene Regel lässt `tainted`-Antworten ohnehin in der Auswertung, das Flag wirkt also auf keine Zahl. Die Auswertung trennt beim Zählen echte Tool-Nutzung von Transport-Hinweisen anhand der gespeicherten Ereignisse.

## E1

Drei Häppchen mit `--max-seconds 500`: Abbruch nach 70 Aufrufen (Bug 1), dann 506 und 387 neue Aufrufe. Vollständig, keine Lücke, 957 Antworten. Die Reconnect-Häufung trat nur in Teilen des Laufs auf und führte seit dem Fix zu keinem Fehlschlag.
