# Grader Lab

Begleitprojekt zum Blogpost auf rubeen.dev. These: Jede Eval-Methode hat einen blinden Fleck, und ein Grader ist selbst ein System, das getestet werden muss. Dafür bauen wir Fehler mit Absicht in korrekte Release Notes ein und messen, welcher Grader welchen Fehler findet. Die Spezifikation steht in [docs/spec.md](docs/spec.md).

## Ergebnis

Kein Grader findet alle zwölf Fehlerarten: `judge-ref` findet alles im Text, aber nichts in Sandbox und Weg, und der strengste, `judge-sourced`, lässt auch alle 24 Kontrollen durchfallen. Das ist kein bloßer Fehlalarm: Die Kontrollen sind nur annähernd fehlerfrei, und in 5 von 6 Releases wiederholt er Vorwürfe gegen Gold in allen drei Wiederholungen. Er ist streng und zugleich teils im Recht, ohne Labels ist das nicht trennbar. Werte aus Mutationen übertragen sich schlecht auf den echten Agenten: `judge-ref` findet 47 von 47 Fehlern im Text (47 von 59 über alle Mutationen), lässt aber nur 2 von 24 Agent-Texten bestehen, und ohne Labels bleibt offen, wie viele dieser Ablehnungen berechtigt sind. Seine 0 Fehlalarme tragen wenig, denn 12 der 24 Kontrollen sind Gold selbst, echt gefordert ist er nur auf 6 Paraphrasen. Die Ablenkung durch selbstbewussten Ton ist mit diesem Aufbau nicht prüfbar: Die selbstbewussten Fassungen verletzen die Rubric zusätzlich und ändern den Inhalt.

Details in [docs/findings.md](docs/findings.md), Ablauf und Pannen in [docs/run-log.md](docs/run-log.md).

## Demo

`site/` ist eine statische Werkbank ohne Build: Fehler in Release Notes einbauen und sehen, welcher Grader anschlägt. Sie braucht wegen `fetch` einen lokalen Server, alle Pfade sind relativ:

```sh
python3 -m http.server -d site 8000
```

Die 7 Code-Grader laufen im Browser. `npm run report` kopiert dafür `src/graders/code.mjs` und `src/graders/llm-core.mjs` nach `site/js/`, dazu `summary.json` und `demo.json` nach `site/data/`. Ein Test baut jedes Artefakt aus E1 und E4 so nach wie die Seite und vergleicht mit den aufgezeichneten Urteilen.

Die Modell-Grader zeigen aufgezeichnete Urteile, solange der Text einer Aufzeichnung entspricht. Für geänderten Text kann man mit eigenem OpenAI- oder Anthropic-Key live prüfen, das sind 5 Aufrufe pro Lauf. Der Key bleibt im Speicher der Seite und geht direkt an den Anbieter. Bei Anthropic läuft das Schema über `output_config.format`, weil erzwungenes `tool_choice` auf `claude-sonnet-5-5` mit 400 endet.

`scripts/check-site.cjs` spielt die Seite mit Playwright durch, die Anbieter sind dabei gemockt. Playwright ist bewusst keine Abhängigkeit, die Kopfzeile des Skripts sagt, wie es läuft.

## Aufbau

- `fixtures/src/`: einzeln geschriebene (nicht generierte) Releases der fiktiven Bibliothek quaykit, Mutationen und Kontrollen
- `fixtures/releases/`: daraus erzeugte JSON-Dateien (`npm run fixtures`)
- `src/`: Engine, Grader, Mutationen, Agent, Aggregation, Runner
- `graders/prompts/v1/`: eingefrorene Prompts und Parameter, siehe [README dort](graders/prompts/v1/README.md)
- `data/raw/`: Rohantworten, `data/raw/smoke/` enthält nur Technik-Tests auf einer Toy-Fixture außerhalb der Auswertung
- `data/results/`: Ergebnisse der Läufe, dazu `summary.json` (alle Kennzahlen) und `demo.json` (Daten für die Demo)
- `site/`: statische Werkbank

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
- Mutationen stammen vom selben Autor wie die Grader, einem Coding Agent, der das Lab nach der Spezifikation gebaut hat
- Ein Modellstand, keine menschlichen Labels
- Gold ist einzeln geschrieben, stammt wie Fixtures, Mutationen, Rubric und Grader vom Coding Agent, der dieses Lab im Auftrag gebaut hat, und ist nicht fehlerfrei, die Kontrollen sind also nur annähernd fehlerfrei. Beispiele in [docs/findings.md](docs/findings.md).
- Ein Teil der Kontrollen vergleicht Gold mit sich selbst, echt gefordert sind die Grader nur auf 6 Paraphrasen.
- Die Prompts von `judge-blind` und `pairwise` bestimmen deren Fundraten mit: `judge-blind` wertet Ungeprüftes als erfüllt, `pairwise` erfährt nicht, welche Fassung die Referenz ist.
- Nachträglich entstanden die Auswertungen je Text, die Zuordnung der Hypothesen, die Trefferprüfung und die Schwellen-Tabelle zu `ref-similarity`. Die eingefrorenen Regeln und Spec-Zahlen stehen daneben.
- Die Wortlisten von `wording` sind nach den Mutationen entstanden, ihre Fundrate dort ist eine Obergrenze. Mehr dazu in [graders/prompts/v1/README.md](graders/prompts/v1/README.md).
- Fassungen mit identischem Text teilen sich die Judge-Aufrufe. `gold`, `false-success`, `lucky-path` und `extra-diligent` sehen für Judges gleich aus und bekommen darum dasselbe Urteil. Das ist die Konstruktion, kein Zufall.

## Lizenz

Apache-2.0
