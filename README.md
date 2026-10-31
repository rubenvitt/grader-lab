# Grader Lab

Begleitprojekt zum Blogpost auf rubeen.dev. These: Jede Eval-Methode hat einen blinden Fleck, und ein Grader ist selbst ein System, das getestet werden muss. Dafür bauen wir Fehler mit Absicht in korrekte Release Notes ein und messen, welcher Grader welchen Fehler findet. Die Spezifikation steht in [docs/spec.md](docs/spec.md).

Stand: Fundament. Experimente und Demo folgen.

## Aufbau

- `fixtures/src/`: von Hand geschriebene Releases der fiktiven Bibliothek quaykit, Mutationen und Kontrollen
- `fixtures/releases/`: daraus erzeugte JSON-Dateien (`npm run fixtures`)
- `src/`: Engine, Grader, Mutationen, Agent, Aggregation, Runner
- `graders/prompts/v1/`: eingefrorene Prompts und Parameter, siehe [README dort](graders/prompts/v1/README.md)
- `data/raw/`: Rohantworten, `data/raw/smoke/` enthält nur Technik-Tests auf einer Toy-Fixture außerhalb der Auswertung
- `data/results/`: Ergebnisse der Läufe

## Benutzung

Node 26, keine Laufzeit-Abhängigkeiten. Modellaufrufe laufen über die Codex-CLI und stecken hinter `callModel` in `src/engine/call-model.mjs`.

```sh
npm test
node src/run.mjs plan                 # geplante Aufrufe gegen das Budget
node src/run.mjs e1 --max-seconds 400 # auch e3, e4
```

Läufe sind fortsetzbar: Jede Antwort liegt sofort unter `data/raw/`, ein erneuter Aufruf macht dort weiter. Exit-Code 2 heißt Teilstand, einfach wiederholen. Exit-Code 3 heißt Rate-Limit, Exit-Code 4 Budget erschöpft oder wiederholte Fehlschläge.

Der Runner begrenzt auf 6 parallele Aufrufe und 1.500 insgesamt, gezählt über alle Läufe aus dem, was unter `data/raw/` liegt.

## Grenzen

- Synthetische Fixtures, kleine Fallzahl
- Mutationen stammen vom selben Autor wie die Grader
- Ein Modellstand, keine menschlichen Labels
- Fassungen mit identischem Text teilen sich die Judge-Aufrufe. `gold`, `false-success`, `lucky-path` und `extra-diligent` sehen für Judges gleich aus und bekommen darum dasselbe Urteil. Das ist die Konstruktion, kein Zufall.

## Lizenz

Apache-2.0
