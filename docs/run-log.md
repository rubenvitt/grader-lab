# Lauf-Protokoll

Was bei den echten Läufen passiert ist, in zeitlicher Reihenfolge. Die maschinenlesbare Fassung jedes Häppchens steht in `data/results/run-log.jsonl`, Fehlversuche stehen unverändert in `data/raw/errors.jsonl`.

## Bug 1: Reconnect-Hinweise galten als Fehlschlag (E1, erstes Häppchen)

**Beobachtung:** Nach 64 erfolgreichen Aufrufen brach E1 mit `repeated-failures` ab (Exit 4). Sechs Einträge in `errors.jsonl` zeigen `codex exit 0` mit Ereignissen wie `Reconnecting... 2/5 (unexpected status 403 Forbidden ...)`, aber ohne `turn.failed`. Ein Einzelaufruf direkt danach lief normal.

**Ursache:** `interpret` zählte jedes Ereignis vom Typ `error` als Fehlschlag. Die Codex-CLI meldet so aber auch vorübergehende Verbindungsprobleme und antwortet danach trotzdem. Die Antworten dieser sechs Aufrufe sind deshalb verworfen worden und nicht mehr vorhanden. Für diese Erklärung spricht das nächste Häppchen: Rohantworten enthalten das Ereignis „Falling back from WebSockets to HTTPS transport“ und danach eine gültige Antwort. Sicher belegt ist das für die sechs Aufrufe nicht, ihre Antworten hat niemand gesehen, und das Fehlerlog ist auf 2000 Zeichen gekürzt.

**Fix:** Nur `turn.failed`, ein Exit-Code ungleich 0 oder eine fehlende Antwort zählen noch als Fehlschlag. Test: `interpret keeps an answer that arrived after reconnect notices`.

**Folgen:** Sechs Aufrufe vom Budget verbraucht. Keine Antwort war zuvor in die Auswertung gelangt, kein Lauf muss wiederholt werden. Die Fehlerzeilen bleiben als Beleg stehen.

## Hinweis: `tainted` schlägt auch bei Transport-Hinweisen an

Der Fallback erscheint in den Ereignissen als `item.completed` vom Typ `error`. `interpret` markiert solche Antworten als `tainted`, obwohl kein Tool lief. Der Code bleibt so, damit alle Rohdaten nach derselben Regel markiert sind. Die eingefrorene Regel lässt `tainted`-Antworten ohnehin in der Auswertung, das Flag wirkt also auf keine Zahl. Die Auswertung trennt beim Zählen echte Tool-Nutzung von Transport-Hinweisen anhand der gespeicherten Ereignisse.

## E1

Drei Häppchen mit `--max-seconds 500`: Abbruch nach 70 Aufrufen (Bug 1), dann 506 und 387 neue Aufrufe. Vollständig, keine Lücke, 957 Antworten. Die Reconnect-Häufung trat nur in Teilen des Laufs auf und führte seit dem Fix zu keinem Fehlschlag.

## E3

Ein Häppchen: 90 neue Aufrufe, 90 aus E1 wiederverwendet (die neutralen Fassungen sind die `invented-claim`-Artefakte aus E1). Vollständig.

## E4

Probelauf `--only r1`: 34 Aufrufe, alle 4 Läufe beendet, Grader bewerten sie. Ein Lauf hatte keinen Publish. Der Blick in die Rohantworten zeigt: Der Agent hat wirklich nur `finish` aufgerufen, die Schleife hat nichts verschluckt. Über alle 24 Läufe steht kein Aufruf hinter einem `finish`.

Voller Lauf: 175 neue Aufrufe, 34 aus dem Probelauf wiederverwendet. Vollständig, keine Wiederholungen reduziert. Die Datei `data/results/e4-r1.json` aus dem Probelauf ist entfernt, sie war eine Teilmenge von `e4.json`. Die Rohantworten liegen weiter unter `data/raw/`.

Agent-Verhalten, das kein Bug ist und so in der Auswertung bleibt: Drei Läufe rufen `finish` mit lauter `null` auf (r3 `naive-1`, r3 `naive-2`, r4 `careful-2`). Ihr Status lautet trotzdem `finished`. Das Protokoll erlaubt diese Nullen, und der Agent unter Test nutzt das. In `runs[].turns` zählen nur Züge mit Tool-Aufruf, der reine `finish`-Zug nicht.

## Verbrauch

| Häppchen | neu | aus Cache | fehlgeschlagen | Stand | Ende |
|---|---|---|---|---|---|
| Smoke-Test (vor E1) | 3 | 0 | 0 | 3 | vollständig |
| E1, 1 | 70 | 0 | 6 | 73 | `repeated-failures` (Bug 1) |
| E1, 2 | 506 | 64 | 0 | 579 | `max-seconds` |
| E1, 3 | 387 | 714 | 0 | 966 | vollständig |
| E3 | 90 | 90 | 0 | 1056 | vollständig |
| E4, Probelauf r1 | 34 | 0 | 0 | 1090 | vollständig |
| E4 | 175 | 34 | 0 | 1265 | vollständig |

Kein Rate-Limit, Budget nicht ausgeschöpft (1265 von 1500). Prompts unverändert auf Stand `prompts-v1`, kein `v2`.

## Bewusst nicht geändert

- **`judge-sourced`** lässt alle 24 Kontrollen durchfallen. Das ist kein Bug: Die Begründungen sind inhaltlich, die Prompts werden korrekt gerendert, und auf Agent-Texten besteht er 11 von 24. Ein `prompts-v2` wäre Nachjustieren am Ergebnis. Details in `docs/findings.md`.
- **Gold-Lücken** (r5 `pause(false)`, r6 #414) bleiben in den Fixtures, sie sind Teil des Befunds.
- **`functional`** vergleicht bytegenau und fällt bei Leerzeichen am Zeilenende durch (r3 `careful-2`, r4 `careful-1`). Das ist die eingefrorene Regel.
- **`tainted`** bleibt in den Rohdaten, wie es geschrieben wurde.

## Auswertung

`npm run report` spielt E1, E3 und E4 mit `--offline` aus `data/raw/` nach. `--offline` setzt das Budget auf 0, startet also keinen Aufruf, schreibt nicht ins Log und bricht ab, wenn eine Antwort fehlt. Danach rechnet `src/report.mjs` `summary.json`, `demo.json` und `docs/findings.md` neu. Eine Prüfung ist: Nach einem Commit darf `npm run report` keine Datei ändern.

Die Trefferprüfung in `docs/findings.md` (Kriterium und geändertes Wort) ist nach den Läufen entstanden und dort als solche gekennzeichnet. Sie ändert kein Urteil.
