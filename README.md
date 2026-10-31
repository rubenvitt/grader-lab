# Grader Lab

Begleitprojekt zum Blogpost auf rubeen.dev. These: Jede Eval-Methode hat einen blinden Fleck, und ein Grader ist selbst ein System, das getestet werden muss. Dafür bauen wir Fehler mit Absicht in korrekte Release Notes ein und messen, welcher Grader welchen Fehler findet. Die Spezifikation steht in [docs/spec.md](docs/spec.md).

## Ergebnis

Kein Grader findet alle zwölf Fehlerarten: `judge-ref` findet alles im Text, aber nichts in Sandbox und Weg, und der strengste, `judge-sourced`, lässt auch alle 24 Kontrollen durchfallen. Werte aus Mutationen übertragen sich schlecht auf den echten Agenten: `judge-ref` findet 47 von 47 Fehlern im Text, lässt aber nur 2 von 24 Agent-Texten bestehen, und ohne Labels bleibt offen, wie viele dieser Ablehnungen berechtigt sind. Die erwartete Ablenkung durch selbstbewussten Ton trat nicht ein, er machte 0 Urteile milder und 7 strenger, allerdings mit Wörtern, die die Rubric ohnehin verbietet.

Details in [docs/findings.md](docs/findings.md), Ablauf und Pannen in [docs/run-log.md](docs/run-log.md).

## Demo

`site/` ist die statische Demo, reines HTML, CSS und JS ohne Build und ohne Modellaufrufe. Sie braucht wegen `fetch` einen lokalen Server, alle Pfade sind relativ:

```sh
python3 -m http.server -d site 8000
```

`npm run report` kopiert `summary.json` und `demo.json` nach `site/data/`. Alle Tabellen kommen von dort. Im Browser rechnet nur zweierlei: der Regler zur Pass-Rate, ein Test hält seine Formel gleich mit `src/aggregate.mjs`, und die Treffer-Balken im Bewertungsspiel, gezählt aus den Urteilen in `demo.json`.

`scripts/check-site.cjs` spielt die Seite mit Playwright durch. Playwright ist bewusst keine Abhängigkeit, die Kopfzeile des Skripts sagt, wie es läuft.

## Aufbau

- `fixtures/src/`: von Hand geschriebene Releases der fiktiven Bibliothek quaykit, Mutationen und Kontrollen
- `fixtures/releases/`: daraus erzeugte JSON-Dateien (`npm run fixtures`)
- `src/`: Engine, Grader, Mutationen, Agent, Aggregation, Runner
- `graders/prompts/v1/`: eingefrorene Prompts und Parameter, siehe [README dort](graders/prompts/v1/README.md)
- `data/raw/`: Rohantworten, `data/raw/smoke/` enthält nur Technik-Tests auf einer Toy-Fixture außerhalb der Auswertung
- `data/results/`: Ergebnisse der Läufe, dazu `summary.json` (alle Kennzahlen) und `demo.json` (Daten für die Demo)
- `site/`: statische Demo

## Reproduzieren

Node 26, keine Laufzeit-Abhängigkeiten. Modellaufrufe laufen über die Codex-CLI und stecken hinter `callModel` in `src/engine/call-model.mjs`.

```sh
npm test
node src/run.mjs plan                 # geplante Aufrufe gegen das Budget
node src/run.mjs e1 --max-seconds 400 # auch e3, e4
npm run report                        # alle Zahlen und docs/findings.md neu aus data/raw/ rechnen
```

`npm run report` macht keinen Modellaufruf und bricht ab, wenn eine Rohantwort fehlt. Auf einem sauberen Checkout ändert es keine Datei.

Läufe sind fortsetzbar: Jede Antwort liegt sofort unter `data/raw/`, ein erneuter Aufruf macht dort weiter. Exit-Code 2 heißt Teilstand, einfach wiederholen. Exit-Code 3 heißt Rate-Limit, Exit-Code 4 Budget erschöpft oder wiederholte Fehlschläge.

Für den Anlauf von E4 begrenzt `--only r1` den Lauf auf ein Release, das Ergebnis landet dann in `e4-r1.json`.

Der Runner begrenzt auf 6 parallele Aufrufe und 1.500 insgesamt, gezählt über alle Läufe aus dem, was unter `data/raw/` liegt.

## Grenzen

- Synthetische Fixtures, kleine Fallzahl
- Mutationen stammen vom selben Autor wie die Grader
- Ein Modellstand, keine menschlichen Labels
- Gold ist von Hand geschrieben und nicht fehlerfrei, die Kontrollen sind also nur annähernd fehlerfrei. Beispiele in [docs/findings.md](docs/findings.md).
- Die Wortlisten von `wording` sind nach den Mutationen entstanden, ihre Fundrate dort ist eine Obergrenze. Mehr dazu in [graders/prompts/v1/README.md](graders/prompts/v1/README.md).
- Fassungen mit identischem Text teilen sich die Judge-Aufrufe. `gold`, `false-success`, `lucky-path` und `extra-diligent` sehen für Judges gleich aus und bekommen darum dasselbe Urteil. Das ist die Konstruktion, kein Zufall.

## Lizenz

Apache-2.0
