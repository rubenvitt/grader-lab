# Grader Lab: Spezifikation

Begleitprojekt zum Blogpost auf rubeen.dev. Öffentliches Repo, statische Demo auf GitHub Pages.

## These

Jede Eval-Methode hat einen blinden Fleck, und ein Grader ist selbst ein System, das getestet werden muss.
Dafür borgen wir uns die Idee von Mutation Testing: Wir bauen Fehler mit Absicht in ein korrektes Ergebnis ein.
Das Label steht dann durch die Konstruktion fest, und wir messen, welcher Grader welchen Fehler findet.
Die zentrale Abbildung ist die Matrix Grader × Fehlerart.

## Das Feature unter Test (kein Chat)

Ein **Release-Notes-Agent** für die fiktive TypeScript-Bibliothek `quaykit` (Job-Queue). Eingabe ist eine Liste
gemergter PRs seit dem letzten Tag, kein Dialog. Der Agent hat Tools `list_prs()`, `get_pr(id)`, `get_diff(id)`,
`get_issue(id)` und `publish_release({version, notes})`. Ergebnis ist ein Artefakt mit vier Teilen:

```
artifact = { notes_md, plan: { bump, version, sections[] }, transcript: ToolCall[], sandbox: { published, version, notes } }
```

Warum dieses Beispiel: Entwickler beurteilen Release Notes selbst auf einen Blick, es gibt strukturierte Daten
(Code-Grader), Text (Judges), einen Seiteneffekt (Functional) und einen Weg (Trajectory).

## Fixtures (komplett synthetisch)

6 Releases in `fixtures/releases/<id>/`, je 6 bis 10 PRs mit Titel, Labels, Body, Diff-Ausschnitt, optional Issue.
Dazu pro Release eine Gold-Fassung (`gold.json`, einzeln geschrieben). Jede Fallart kommt mindestens in zwei
Releases vor:

- versteckter Breaking Change (`chore:`-Titel, Diff ändert Default oder benennt öffentliche Option um)
- Feature und Revert im selben Release
- Security-Fix mit Label `embargo`: nennen, aber ohne Details
- rein interne Änderungen (CI, Dependabot für devDependencies)
- Verhaltensänderung mit Migrationsschritt
- Deprecation

## Mutationen (Label durch Konstruktion)

Jede Mutation ist eine kleine, einzeln für das jeweilige Release formulierte Änderung am Gold-Artefakt.

| ID | Fehler | Erwartung, wer ihn sehen kann |
|---|---|---|
| `missing-breaking` | Breaking Change fehlt in den Notes | Judge mit Quellen, Referenz |
| `wrong-bump` | minor statt major | Code nur, falls Labels es hergeben |
| `ghost-pr` | Verweis auf nicht existierende PR-Nummer | Code |
| `invented-claim` | plausible Aussage zu echter PR, die der Diff nicht hergibt | Judge mit Quellen |
| `wrong-migration` | falscher Optionsname im Migrationsschritt | Judge mit Quellen, Referenz |
| `reverted-listed` | zurückgenommenes Feature steht in den Notes | Judge, Code mit Revert-Regel |
| `embargo-leak` | Details des Embargo-Fixes stehen im Text | Wording, Judge |
| `internal-noise` | CI-Interna in den Notes | Judge, Wording teilweise |
| `hype-tone` | Inhalt korrekt, Ton Marketing | Wording, Judge |
| `useless-true` | alles wahr, nichts brauchbar („Various improvements") | Judge, Mensch |
| `false-success` | Notes korrekt, `publish_release` nie aufgerufen | nur Functional |
| `lucky-path` | Ergebnis korrekt, Diffs nie gelesen | nur Trajectory |

Dazu **fehlerfreie Kontrollen**, die keinen Alarm auslösen dürfen: `gold` (unverändert), `paraphrase` (gleiche
Fakten, andere Worte, einzeln umformuliert), `reordered` (andere Reihenfolge der Abschnitte), `extra-diligent`
(Agent ruft zusätzlich `get_issue` auf, korrekt, aber abweichender Weg).

## Grader

| ID | Methode | Art |
|---|---|---|
| `schema` | Struktur und Pflichtabschnitte | Code |
| `pr-refs` | jede `#n` existiert und ist nicht zurückgenommen | Code |
| `semver-labels` | Bump passt zu Labels und Conventional-Commit-Präfixen | Code |
| `wording` | verbotene Wörter, Embargo-Begriffe, Länge | Wording/Regex |
| `ref-similarity` | Text-Ähnlichkeit zur Gold-Fassung über Schwelle | Referenz, ohne LLM |
| `judge-ref` | LLM vergleicht mit Gold-Fassung | Referenz, LLM |
| `judge-sourced` | LLM prüft Rubric gegen PRs und Diffs, keine Gold-Fassung | Reference-free, LLM |
| `judge-blind` | LLM prüft Rubric, sieht nur die Notes | Reference-free, LLM |
| `pairwise` | LLM vergleicht mit Gold-Fassung A/B, beide Reihenfolgen | Pairwise, LLM |
| `functional` | Sandbox-Zustand: veröffentlicht, Version stimmt | Task-Success, Code |
| `trajectory` | jeder Diff gelesen, bevor veröffentlicht wird | Trajectory, Code |
| Mensch | der Leser in der Demo | Human |

Die Spalte „Mensch" enthält keine erfundenen Werte. Sie zeigt nur, was der Leser in der Demo selbst bewertet.

## Experimente

- **E1 Matrix:** alle Artefakte durch alle Grader. LLM-Grader je 3 Wiederholungen. Ergebnis: Fundrate je Grader
  und Fehlerart, Fehlalarmrate auf den Kontrollen, TPR/TNR je Grader, mit der Definition aus dem Hamel-Husain-Skill
  (`validate-evaluator`): TPR = Anteil fehlerfreier Fälle, die der Grader bestehen lässt; TNR = Anteil fehlerhafter
  Fälle, die er durchfallen lässt. Rogan-Gladen-Korrektur einer beobachteten Pass-Rate als Rechenbeispiel.
- **E2 Stabilität:** aus den Wiederholungen die Quote der Fälle mit uneinigem Urteil, pro LLM-Grader.
- **E3 Ablenkung:** eine fehlerhafte Fassung, einmal neutral, einmal selbstbewusst formuliert (gleicher Inhalt).
  Absolute Bewertung gegen Pairwise, inklusive Reihenfolge-Tausch. Kleine Nachstellung der Frage von Tripathi et al.
- **E4 Echter Agent:** Der Agent läuft wirklich, zwei Prompt-Varianten (naiv, sorgfältig) je 2 Läufe pro Release.
  Alle Grader bewerten die Ergebnisse. Wir suchen Fälle, in denen Grader sich widersprechen. Das sind die
  konkreten Beispiele für den Post.

## Modelle und Budget

- Claude-CLI ist in dieser Umgebung nicht angemeldet. Alle Modellaufrufe laufen über `codex exec`:
  `codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules -s read-only -m <model> -c 'model_reasoning_effort="low"' --json --output-schema <file> <prompt>`
  in einem leeren Arbeitsverzeichnis. Ein Aufruf dauert etwa 5 Sekunden und hat rund 21k Input-Tokens Grundlast.
- Agent unter Test: `gpt-6-luna`. Judges: `gpt-6.1-terra`. Beide Namen stehen pro Datensatz im Ergebnis.
- Maximal 6 parallele Aufrufe, insgesamt höchstens 1.500 LLM-Aufrufe. Bei Rate-Limit stoppen, Stand sichern, melden.
- Der Modellaufruf steckt hinter einer einzigen Funktion, damit andere Anbieter leicht anzubinden sind.
- Läufe sind fortsetzbar: jede Antwort landet sofort roh in `data/raw/` mit Schlüssel aus Eingabe-Hash, Modell, Wiederholung.

## Redlichkeit (nicht verhandelbar)

1. Alle Zahlen stammen aus echten Läufen. Rohantworten liegen im Repo. Nichts von Hand korrigieren.
2. Rubrics und Grader-Prompts werden **vor** E1 eingefroren (`graders/prompts/`, eigener Commit). Spätere Änderungen
   laufen als neue Version, die alte bleibt sichtbar. Kein Nachjustieren, bis die Matrix hübsch aussieht.
3. Bleibt ein erwartetes Muster aus, zeigen wir das. Die Tabelle „Erwartung" oben ist Hypothese, keine Vorgabe.
4. Grenzen stehen offen in Demo und README: synthetische Fixtures, kleine Fallzahl, Mutationen vom selben Autor wie
   die Grader, ein Modellstand, keine menschlichen Labels.
5. Keine personenbezogenen Daten. Kein Bezug zu Arbeitgeber, Kunden oder Ehrenamt.

## Demo (statisch, GitHub Pages, deutsch)

Eine Seite, kein Build-Zwang: `site/` mit HTML, CSS, JS-Modulen und den aggregierten JSONs. Keine API-Schlüssel, keine
Laufzeit-Modellaufrufe. Abschnitte:

1. **Der Agent:** Release wählen, PRs links, Notes rechts, Transcript aufklappbar. Sofort klar: das ist kein Chat.
2. **Du bist der Grader:** ein paar Fassungen bewerten, danach Auflösung, Vergleich mit den Gradern. Stand nur lokal im Browser.
3. **Die Matrix:** Heatmap Grader × Fehlerart, Klick auf eine Zelle zeigt konkretes Artefakt, Diff zur Gold-Fassung und Begründung des Judges.
4. **Wem kannst du trauen:** TPR/TNR, Flakiness, Rechenbeispiel Pass-Rate-Korrektur mit Regler.
5. **Ablenkung:** Ergebnis aus E3.
6. **Was hier nicht gezeigt wird:** Grenzen, Repo-Link, Link zum Blogpost.

Optik wie rubeen.dev: Tokens aus `design-system/`, orange Akzent, hell und dunkel, funktioniert auf dem Handy, Tastatur
und Screenreader (Tabelle bleibt eine echte Tabelle, Farbe nie allein der Informationsträger).

## Struktur

```
fixtures/   src/ (engine, graders, mutate, run)   graders/prompts/   data/raw/  data/results/   site/   test/   docs/
```

Node 26 ohne Laufzeit-Abhängigkeiten, Tests mit `node:test`. Lizenz Apache-2.0. Code und Bezeichner englisch, Texte deutsch.
