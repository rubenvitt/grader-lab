# Grader-Prompts v1

Eingefroren vor E1 (Tag `prompts-v1`). Dieser Ordner wird nicht mehr geändert. Eine Änderung wird ein neuer Ordner `v2/`, `v1/` bleibt sichtbar.

Eingefroren ist alles, womit sich die Matrix nachträglich schönrechnen ließe. Der Tag umfasst den ganzen Baum, also auch `fixtures/`, `src/graders/code.mjs`, `src/mutate.mjs` und `src/aggregate.mjs`. In diesem Ordner liegen:

- `rubric.md`: gemeinsame Rubric aller Judges
- `judge-ref.md`, `judge-sourced.md`, `judge-blind.md`, `pairwise.md`: Grader-Prompts
- `agent-protocol.md`, `agent-naive.md`, `agent-careful.md`: Agent für E4
- `params.json`: Modellnamen, Wiederholungen, Schwelle von `ref-similarity`, Wortlisten und Längen von `wording`, erlaubte Abschnitte, Regeln für Urteil und Pairwise

## Festgelegte Regeln

- **Urteil pro Artefakt:** Mehrheit der Wiederholungen. Ein Patt, etwa wegen eines fehlenden Aufrufs, zählt als durchgefallen. Uneinigkeit geht in E2 ein.
- **Lücken:** Fehlgeschlagene Aufrufe werden wiederholt. Was dauerhaft fehlt, wird als Lücke ausgewiesen und nie aufgefüllt.
- **Judges mit Tool-Nutzung:** Antworten mit `tainted: true` bleiben in der Auswertung und werden gezählt und ausgewiesen. Ein nachträglicher Filter wäre selbst eine Stellschraube.
- **Pairwise:** Eine Wiederholung sind zwei Aufrufe mit vertauschter Reihenfolge. Die Fassung fällt nur durch, wenn die Gold-Fassung in beiden Reihenfolgen bevorzugt wird. `equal` ist kein Bevorzugen.
- **`ref-similarity`:** Schwelle 0,7 auf der Kosinus-Ähnlichkeit von Wörtern und Wortpaaren. Der Wert ist vorab gesetzt und nicht an den Auswertungs-Releases kalibriert.
- **`functional`:** „Version stimmt“ heißt: Die veröffentlichte Version folgt aus dem letzten Tag und dem Bump im Plan, Notes und Plan stimmen überein. Ein Vergleich mit Gold findet nicht statt, weil es im Betrieb kein Gold gibt.
- **`semver-labels`:** Labels liefern eine Untergrenze. Ein höherer Bump ist kein Fehler.

## Offenlegung zu `wording`

Die Wortlisten stammen vom selben Autor wie die Mutationen und sind nach ihnen entstanden. Einige Treffer sind deshalb Wörter aus den Mutationstexten selbst, etwa „sleek“ oder „deflaked“. Die Fundrate von `wording` bei `hype-tone`, `useless-true` und `internal-noise` ist darum eine Obergrenze. Die Listen werden nicht nachträglich bereinigt. Die Gegenprobe außerhalb der Mutationen ist E4, dort läuft `wording` auf Texten des echten Agenten.
