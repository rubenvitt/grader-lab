# Befunde

Alle Zahlen und Zitate in dieser Datei erzeugt `npm run report` aus `data/raw/`, von Hand steht hier nur der verbindende Text. Grundlage: Prompts `v1`, Agent `gpt-6-luna`, Judges `gpt-6.1-terra`, Effort `low`.

## Das Wichtigste

- **Der scheinbar beste Grader hält am wenigsten, was seine Zahl verspricht.** `judge-ref` findet auf den Mutationen alles, was im Text steht (47 von 47 Texten, 0 Fehlalarme). Auf echten Agent-Texten lässt er nur 2 von 24 bestehen. Er verlangt jedes Detail der Referenz, Mutationen sind per Bau nah an ihr, echte Texte nicht. Ohne Labels bleibt offen, wie viele dieser Ablehnungen berechtigt sind. Beispiel 7 zeigt aber einen Fall, in dem die Referenz selbst der Fehler ist.
- **`judge-sourced` lässt alle 24 Kontrollen durchfallen.** TPR 0,00, TNR 1,00. Seine Fundrate von 100 % sagt allein deshalb nichts. Auf den Texten des Agenten lässt er dagegen 11 von 24 bestehen. Vermutlich bieten die erklärenden Gold-Texte mehr Angriffsfläche als die knappen Agent-Texte. Ein Teil seiner Vorwürfe gegen Gold ist berechtigt.
- **Die Ablenkung aus E3 trat nicht ein, eher das Gegenteil.** Selbstbewusster Ton machte 0 Urteile milder und 7 strenger.
- **Mutationen ersetzen keine echten Läufe.** TPR und TNR aus E1 übertragen sich schlecht auf E4. Die Korrektur nach Rogan-Gladen ergibt für dieselben Texte je nach Grader Werte zwischen 0,00 und 0,49.

## Kennzahlen

Definition wie im Skill `validate-evaluator` und damit andersherum als oft üblich: „positiv“ heißt bestanden. **TPR** ist der Anteil fehlerfreier Fälle, die der Grader bestehen lässt. **TNR** ist der Anteil fehlerhafter Fälle, die er durchfallen lässt.

Das Urteil pro Artefakt ist die Mehrheit der Wiederholungen. E1 umfasst 83 Artefakte (24 Kontrollen, 59 Mutationen). 13 Kombinationen aus Release und Fehlerart sind nicht definiert, etwa ein Embargo-Leck ohne Embargo-Fix. Sie stehen in `data/results/e1.json`.

## E1: Matrix

Zellen zeigen, wie viele Artefakte durchgefallen sind. Bei Mutationen ist das die Fundrate, bei Kontrollen die Zahl der Fehlalarme.

| Fassung | schema | pr-refs | semver | wording | ref-sim | funct | traj | j-ref | j-src | j-blind | pair |
|---|---|---|---|---|---|---|---|---|---|---|---|
| missing-breaking | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 0/3 | 0/3 |
| wrong-bump | 3/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 2/3 | 3/3 |
| ghost-pr | 0/6 | 6/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 6/6 | 0/6 | 0/6 |
| invented-claim | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 6/6 | 1/6 | 2/6 |
| wrong-migration | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 | 5/5 | 1/5 | 2/5 |
| reverted-listed | 1/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 1/3 | 0/3 |
| embargo-leak | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 1/3 | 3/3 |
| internal-noise | 4/6 | 0/6 | 0/6 | 5/6 | 0/6 | 0/6 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| hype-tone | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| useless-true | 0/6 | 0/6 | 0/6 | 4/6 | 6/6 | 0/6 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| false-success | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 |
| lucky-path | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 6/6 | 0/6 | 0/6 |
| gold (Kontrolle) | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 |
| paraphrase (Kontrolle) | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 |
| reordered (Kontrolle) | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 |
| extra-diligent (Kontrolle) | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 6/6 | 0/6 | 0/6 |

Spalten: `schema` = schema, `pr-refs` = pr-refs, `semver` = semver-labels, `wording` = wording, `ref-sim` = ref-similarity, `funct` = functional, `traj` = trajectory, `j-ref` = judge-ref, `j-src` = judge-sourced, `j-blind` = judge-blind, `pair` = pairwise.

### TPR und TNR

| Grader | TPR | TNR | TPR je Text | TNR je Text |
|---|---|---|---|---|
| schema | 1,00 (24/24) | 0,15 (9/59) | – | – |
| pr-refs | 1,00 (24/24) | 0,15 (9/59) | – | – |
| semver-labels | 1,00 (24/24) | 0,02 (1/59) | – | – |
| wording | 1,00 (24/24) | 0,29 (17/59) | – | – |
| ref-similarity | 0,75 (18/24) | 0,10 (6/59) | – | – |
| functional | 1,00 (24/24) | 0,10 (6/59) | – | – |
| trajectory | 1,00 (24/24) | 0,10 (6/59) | – | – |
| judge-ref | 1,00 (24/24) | 0,80 (47/59) | 1,00 (18/18) | 1,00 (47/47) |
| judge-sourced | 0,00 (0/24) | 1,00 (59/59) | 0,00 (0/18) | 1,00 (47/47) |
| judge-blind | 1,00 (24/24) | 0,41 (24/59) | 1,00 (18/18) | 0,51 (24/47) |
| pairwise | 1,00 (24/24) | 0,47 (28/59) | 1,00 (18/18) | 0,60 (28/47) |

Die Spalten „je Text“ gelten nur für LLM-Grader. `gold`, `extra-diligent`, `false-success` und `lucky-path` haben denselben Text und teilen sich dieselben Judge-Aufrufe. Die Spec-Zahl zählt sie mehrfach, `false-success` und `lucky-path` senken die TNR jedes Judges, obwohl kein Judge sie sehen kann. Je Text bleiben 18 Kontrollen und 47 Mutationen.

### Hypothesen der Spec

Lesart: „Judge“ heißt `judge-ref`, `judge-sourced`, `judge-blind`. „Referenz“ heißt `judge-ref`, `ref-similarity`. „Eingetreten“ heißt: Alle Erwarteten finden alle Fälle, bei „nur“ findet zudem kein anderer etwas.

| Fehler | Erwartung der Spec | Gemessen bei den Erwarteten | Ergebnis | Fanden außerdem |
|---|---|---|---|---|
| missing-breaking | Judge mit Quellen, Referenz | judge-sourced 3/3, judge-ref 3/3, ref-similarity 0/3 | teilweise | schema |
| wrong-bump | Code nur, falls Labels es hergeben | semver-labels 1/3 | teilweise | schema, judge-ref, judge-sourced, judge-blind, pairwise |
| ghost-pr | Code | pr-refs 6/6 | eingetreten | judge-ref, judge-sourced |
| invented-claim | Judge mit Quellen | judge-sourced 6/6 | eingetreten | judge-ref, judge-blind, pairwise |
| wrong-migration | Judge mit Quellen, Referenz | judge-sourced 5/5, judge-ref 5/5, ref-similarity 0/5 | teilweise | judge-blind, pairwise |
| reverted-listed | Judge, Code mit Revert-Regel | judge-ref 3/3, judge-sourced 3/3, judge-blind 1/3, pr-refs 3/3 | teilweise | schema |
| embargo-leak | Wording, Judge | wording 2/3, judge-ref 3/3, judge-sourced 3/3, judge-blind 1/3 | teilweise | pairwise |
| internal-noise | Judge, Wording teilweise | judge-ref 6/6, judge-sourced 6/6, judge-blind 6/6, wording 5/6 | teilweise | schema, pairwise |
| hype-tone | Wording, Judge | wording 6/6, judge-ref 6/6, judge-sourced 6/6, judge-blind 6/6 | eingetreten | pairwise |
| useless-true | Judge, Mensch | judge-ref 6/6, judge-sourced 6/6, judge-blind 6/6 | eingetreten | wording, ref-similarity, pairwise |
| false-success | nur Functional | functional 6/6 | teilweise | judge-sourced |
| lucky-path | nur Trajectory | trajectory 6/6 | teilweise | judge-sourced |

Was davon nicht eintrat:

- `ref-similarity` findet keinen fehlenden Breaking Change (0/3) und keine falsche Migration (0/5). Eine fehlende Zeile oder ein falscher Optionsname bewegt die Ähnlichkeit kaum unter 0,7. Dafür schlägt der Grader bei allen 6 Paraphrasen falsch an und bei allen 24 Agent-Texten.
- `semver-labels` findet den falschen Bump in 1/3 Fällen. `schema` findet ihn in 3/3, ohne dafür gebaut zu sein: Ein Abschnitt „Breaking Changes“ bei Minor verstößt gegen die Strukturregel.
- `judge-blind` findet Fehler in Form und Ton, inhaltliche kaum: 1/6 erfundene Aussagen, 0/6 Geister-PRs. Das steht nicht in der Spec, passt aber zur These.
- `false-success` und `lucky-path` sind nur scheinbar von `judge-sourced` gefunden. Er sieht denselben Text wie bei Gold und lehnt ihn genauso ab. Das ist kein Fund, sondern sein Grundrauschen.

### Trifft der Judge wirklich den eingebauten Fehler?

Eine Fundrate zählt nur das Durchfallen. Bei einem Judge, der alles ablehnt, ist das wertlos. Darum eine Zusatzprüfung, **nach den Läufen definiert und nicht Teil der vorab eingefrorenen Regeln**: Nennt die Mehrheit der Wiederholungen das zur Mutation passende Rubric-Kriterium, und enthält der Beleg ein Wort, das sich gegenüber Gold geändert hat? Die Prüfung ist grob. Ein Treffer kann Zufall sein, ein paraphrasierter Beleg kann durchrutschen.

| Fehler | j-ref durchgefallen | j-ref Kriterium | j-ref Kriterium + Wort | j-src durchgefallen | j-src Kriterium | j-src Kriterium + Wort | j-blind durchgefallen | j-blind Kriterium | j-blind Kriterium + Wort |
|---|---|---|---|---|---|---|---|---|---|
| missing-breaking | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 0/3 | 0/3 | 0/3 |
| wrong-bump | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 | 2/3 |
| ghost-pr | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 0/6 | 0/6 | 0/6 |
| invented-claim | 6/6 | 6/6 | 5/6 | 6/6 | 6/6 | 4/6 | 1/6 | 0/6 | 0/6 |
| wrong-migration | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 1/5 | 1/5 | 1/5 |
| reverted-listed | 3/3 | 0/3 | 0/3 | 3/3 | 3/3 | 3/3 | 1/3 | 0/3 | 0/3 |
| internal-noise | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| hype-tone | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| useless-true | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| embargo-leak | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 1/3 | 1/3 | 1/3 |

`judge-sourced` meldet den eingebauten Fehler also meist tatsächlich, lehnt daneben aber auch Fehlerfreies ab. Er ist kein Zufallsgenerator, sondern zu streng. Der Prompt bleibt trotzdem unverändert: Eine Nachschärfung bis zur schönen Matrix wäre genau das, was die Spec ausschließt.

## E2: Stabilität

Quote der Fälle, in denen die drei Wiederholungen nicht einig sind. Die Spalte „je Text“ zählt jeden Text einmal.

| Grader | uneinig je Artefakt | uneinig je Text |
|---|---|---|
| judge-ref | 0/83 (0 %) | 0/65 (0 %) |
| judge-sourced | 5/83 (6 %) | 2/65 (3 %) |
| judge-blind | 3/83 (4 %) | 3/65 (5 %) |
| pairwise | 4/83 (5 %) | 4/65 (6 %) |

Alle uneinigen Fälle:

| Release | Fassung | Grader | bestanden |
|---|---|---|---|
| r1 | missing-breaking | pairwise | 2/3 |
| r1 | wrong-bump | judge-blind | 1/3 |
| r1 | reordered | judge-sourced | 1/3 |
| r2 | embargo-leak | pairwise | 1/3 |
| r3 | wrong-bump | judge-blind | 2/3 |
| r3 | embargo-leak | pairwise | 1/3 |
| r4 | false-success | judge-sourced | 1/3 |
| r4 | lucky-path | judge-sourced | 1/3 |
| r4 | gold | judge-sourced | 1/3 |
| r4 | extra-diligent | judge-sourced | 1/3 |
| r5 | invented-claim | pairwise | 2/3 |
| r6 | embargo-leak | judge-blind | 2/3 |

Die Flakiness ist gering. Die Reihenfolge wirkt stärker: Bei `pairwise` antworten die beiden Reihenfolgen in 15 von 249 Wiederholungen nicht gleich, davon 14-mal als Präferenz gegen „equal“. Eine echte Umkehr gab es 1-mal. Die eingefrorene Regel fängt das ab, weil eine Fassung nur durchfällt, wenn Gold in beiden Reihenfolgen gewinnt. Das drückt aber auch die Fundrate von `pairwise`.

## E3: Ablenkung

Pro Release dieselbe erfundene Aussage (`invented-claim`), neutral und selbstbewusst formuliert. Die Zellen zeigen bestandene Wiederholungen. Alle Fassungen sind fehlerhaft, jedes Bestehen ist also ein Fehlurteil.

| Release | j-ref neutral | j-ref selbstbewusst | j-src neutral | j-src selbstbewusst | j-blind neutral | j-blind selbstbewusst | pair neutral | pair selbstbewusst |
|---|---|---|---|---|---|---|---|---|
| r1 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 |
| r2 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 |
| r3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 |
| r4 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 3/3 | 3/3 | 0/3 |
| r5 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 |
| r6 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 2/3 | 3/3 | 0/3 |

- `judge-ref` und `judge-sourced` lassen sich nicht beirren, beide Fassungen fallen in allen Wiederholungen durch.
- `judge-blind` lässt die neutrale Fassung in 5 von 6 Releases bestehen, die selbstbewusste in 2.
- `pairwise` lässt die neutrale Fassung in 4 von 6 bestehen, die selbstbewusste in 0.
- Bei `pairwise` gab es in 36 Wiederholungen 0 echte Umkehrungen durch die Reihenfolge und 3 ungleiche Antworten.

Die Spec fragt nach Tripathi et al., ob sich ein Vergleich durch selbstbewussten Ton eher täuschen lässt als eine absolute Bewertung. Dieser kleine Aufbau zeigt das nicht. Die Aussagekraft ist aber begrenzt: Unsere selbstbewussten Fassungen enthalten Wörter wie „guaranteed“ und „definitively“. Die Rubric verbietet solchen Ton in R7 ausdrücklich, ein Judge hat also einen Anlass abzulehnen. Zudem verschärfen einzelne Formulierungen die Aussage etwas, der Inhalt ist nur annähernd gleich. Eine Ablenkung, die im Ton innerhalb der Rubric bleibt, haben wir nicht getestet.

## E4: Echter Agent

24 Läufe: 2 Prompts, 6 Releases, je 2 Wiederholungen. Jeder LLM-Grader urteilt hier einmal, wie in `params.json` eingefroren. Es gibt keine menschlichen Labels, **darum stehen hier weder TPR noch TNR**. Die Tabelle zeigt nur, wer wem widerspricht.

| Release | Lauf | publ. | schema | pr-refs | semver | wording | ref-sim | funct | traj | j-ref | j-src | j-blind | pair |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r1 | naive-1 | ja | **F** | P | **F** | P | **F** | P | **F** | **F** | **F** | **F** | **F** |
| r1 | naive-2 | **nein** | P | P | P | P | **F** | **F** | **F** | **F** | **F** | **F** | **F** |
| r1 | careful-1 | ja | P | P | P | P | **F** | P | P | **F** | P | P | P |
| r1 | careful-2 | ja | P | P | P | P | **F** | P | P | P | P | P | P |
| r2 | naive-1 | ja | **F** | P | P | P | **F** | **F** | **F** | **F** | **F** | **F** | P |
| r2 | naive-2 | ja | **F** | P | P | P | **F** | P | **F** | **F** | **F** | P | P |
| r2 | careful-1 | ja | P | P | P | P | **F** | P | P | **F** | P | P | P |
| r2 | careful-2 | ja | **F** | P | P | P | **F** | P | P | **F** | P | P | P |
| r3 | naive-1 | ja | **F** | P | **F** | P | **F** | **F** | **F** | **F** | **F** | P | **F** |
| r3 | naive-2 | **nein** | **F** | P | **F** | **F** | **F** | **F** | **F** | **F** | **F** | P | **F** |
| r3 | careful-1 | ja | P | P | P | P | **F** | P | **F** | **F** | P | P | **F** |
| r3 | careful-2 | ja | P | P | P | P | **F** | **F** | P | **F** | **F** | P | P |
| r4 | naive-1 | ja | P | P | P | P | **F** | P | **F** | **F** | P | P | **F** |
| r4 | naive-2 | ja | **F** | P | P | P | **F** | **F** | **F** | **F** | P | P | **F** |
| r4 | careful-1 | ja | P | P | P | P | **F** | **F** | P | **F** | P | P | P |
| r4 | careful-2 | **nein** | **F** | P | **F** | **F** | **F** | **F** | **F** | **F** | **F** | P | **F** |
| r5 | naive-1 | ja | P | P | P | P | **F** | P | **F** | **F** | P | P | P |
| r5 | naive-2 | ja | P | P | P | P | **F** | P | P | **F** | P | P | P |
| r5 | careful-1 | ja | P | P | P | P | **F** | P | P | **F** | **F** | P | P |
| r5 | careful-2 | **nein** | P | P | P | P | **F** | **F** | P | **F** | P | P | P |
| r6 | naive-1 | ja | **F** | P | P | P | **F** | P | **F** | **F** | **F** | **F** | **F** |
| r6 | naive-2 | ja | **F** | P | P | P | **F** | P | **F** | **F** | **F** | P | **F** |
| r6 | careful-1 | ja | P | P | P | P | **F** | P | P | P | **F** | P | P |
| r6 | careful-2 | ja | P | P | P | **F** | **F** | P | P | **F** | **F** | **F** | **F** |

| Grader | besteht naiv (von 12) | besteht sorgfältig (von 12) |
|---|---|---|
| schema | 4 | 10 |
| pr-refs | 12 | 12 |
| semver-labels | 9 | 11 |
| wording | 11 | 10 |
| ref-similarity | 0 | 0 |
| functional | 7 | 8 |
| trajectory | 1 | 10 |
| judge-ref | 0 | 2 |
| judge-sourced | 4 | 7 |
| judge-blind | 8 | 11 |
| pairwise | 4 | 9 |

Was auffällt:

- Sorgfalt hilft messbar, aber nicht überall. `trajectory` steigt von 1 auf 10, `schema` von 4 auf 10. Bei `functional` ändert sich fast nichts (7 zu 8). 2 sorgfältige und 2 naive Läufe veröffentlichen nie.
- 4 von 24 Läufen haben nichts veröffentlicht, 3 haben `finish` ohne Plan aufgerufen, 2 davon ohne Notes. Der Status `finished` in `e4.json` sagt nur, dass `finish` kam.
- Die vier LLM-Grader sind sich in 19 von 24 Läufen uneinig. Über alle Grader gilt das für alle 24, schon weil `pr-refs` jeden und `ref-similarity` keinen Lauf bestehen lässt.
- Am weitesten auseinander liegen `judge-ref` und `judge-blind` mit 17 widersprüchlichen Läufen. `judge-ref` lehnt ab, wenn ein Detail der Referenz fehlt oder etwas hinzukommt, `judge-blind` lässt durch, was in sich sauber klingt.
- `wording` schlägt auf Agent-Texten kaum an: 3 Treffer, davon 2 auf leeren Notes und einer wegen eines Embargo-Begriffs. Der Agent schreibt keinen Werbeton. Die hohen Fundraten aus E1 bleiben darum, wie in `graders/prompts/v1/README.md` angekündigt, eine Obergrenze ohne Gegenprobe.

## Rechenbeispiel Rogan-Gladen

Die beobachtete Pass-Rate eines Graders auf E4 lässt sich mit seinen Werten aus E1 korrigieren: geschätzte wahre Rate = (beobachtet + TNR − 1) / (TPR + TNR − 1).

| Grader | beobachtet | TPR | TNR | korrigiert |
|---|---|---|---|---|
| judge-ref | 0,08 | 1,00 | 0,80 | 0,00 |
| judge-sourced | 0,46 | 0,00 | 1,00 | nicht definiert (TPR + TNR − 1 = 0) |
| judge-blind | 0,79 | 1,00 | 0,41 | 0,49 |
| pairwise | 0,54 | 1,00 | 0,47 | 0,03 |

Dieselben 24 Texte, und die geschätzte Rate reicht je nach Grader von 0,00 bis 0,49. Bei `judge-ref` wird das Ergebnis auf 0 begrenzt, bei `judge-sourced` ist die Formel gar nicht definiert. Die Korrektur setzt voraus, dass TPR und TNR auf den neuen Daten gelten. Hier tun sie das nachweislich nicht: `judge-sourced` hat auf den Kontrollen TPR 0,00 und lässt trotzdem 11 Agent-Texte bestehen. Das Beispiel zeigt deshalb vor allem die Grenze der Korrektur, nicht die Qualität des Agenten.

## Beispiele

### 1. Fehlalarm auf Gold: eine offensichtliche Folge gilt als unbelegt

Experiment E1, Release r1, Fassung `gold`

> - Completed jobs are now removed by default: `removeOnComplete` defaults to `true` instead of `false`, so a finished job can no longer be fetched from the queue unless you opt in (#307).

Bestehen lassen: schema, pr-refs, semver-labels, wording, ref-similarity, functional, trajectory, judge-ref (3/3), judge-blind (3/3), pairwise (3/3).

Durchfallen lassen: judge-sourced (0/3).

Begründungen:

- `judge-sourced`, Wiederholung 3: „R2: Die Notes behaupten zu #307, ein abgeschlossener Job könne ohne Opt-in nicht mehr aus der Queue abgerufen werden. Der Diff belegt nur, dass der Standardwert von `removeOnComplete` von `false` auf `true` wechselt; ein Abrufverhalten ist nicht gezeigt.“
- `judge-sourced`, Wiederholung 1: „R2: Die Notes zu #304 behaupten, der Job bleibe nach einem synchronen Fehler nicht mehr bis zum Ablauf des Locks im Status „active“. Der Diff belegt die Freigabe des Locks im `finally`-Block, zeigt aber keine Änderung des Jobstatus.“

Der Diff zeigt den neuen Default, die Folge für Nutzer steht nicht wörtlich darin. Die Rubric sagt: „Der PR-Text allein belegt nichts, was der Diff nicht hergibt.“ Der Judge nimmt das genau, und unsere Diffs sind Ausschnitte. Alle 24 Kontrollen fallen bei ihm durch. In diesem Fall ist es ein echter Fehlalarm.

### 2. Der Grader hat recht, das Label nicht

Experiment E1, Release r5, Fassung `gold`

> Migration: call `worker.pause({ drain: true })`.

Bestehen lassen: schema, pr-refs, semver-labels, wording, ref-similarity, functional, trajectory, judge-ref (3/3), judge-blind (3/3), pairwise (3/3).

Durchfallen lassen: judge-sourced (0/3).

Begründungen:

- `judge-sourced`, Wiederholung 1: „R3: Die Migration zu `worker.pause({ drain: true })` ersetzt `worker.pause(true)`, ändert aber das Verhalten von `worker.pause(false)`. Laut Diff von #399 muss der bisherige boolesche Wert als `drain` übernommen werden: `worker.pause({ drain: false })` beziehungsweise `worker.pause({ drain: true })`.“

Gold ist hier wirklich lückenhaft. Der Diff reicht den Boolean als `drain` durch, wer `pause(false)` nach dieser Anleitung umstellt, ändert das Verhalten. „Fehlerfrei durch Konstruktion“ gilt also nur, soweit der Autor der Fixtures fehlerfrei war. In r6 meldet derselbe Judge in allen drei Wiederholungen, dass #414 bisher gültige Schemanamen ablehnt und darum ein Breaking Change sei. Das ist vertretbar, aber Auslegung. Fixtures und Labels bleiben trotzdem unverändert, die Lücke steht hier offen.

### 3. Pairwise sieht die erfundene PR-Nummer und zuckt mit den Schultern

Experiment E1, Release r1, Fassung `ghost-pr`

> - `quaykit inspect --json` prints the queue statistics as JSON instead of a table (#319).

Bestehen lassen: schema, semver-labels, wording, ref-similarity, functional, trajectory, judge-blind (3/3), pairwise (3/3).

Durchfallen lassen: pr-refs, judge-ref (0/3), judge-sourced (0/3).

Begründungen:

- `pairwise`, Wiederholung 1: „Gold zuerst: equal, Die Fassungen unterscheiden sich nur in der PR-Nummer für die JSON-Ausgabe: A nennt #318, B nennt #319. Ohne Quellen lässt sich nicht beurteilen, welche Zuordnung korrekt ist; nach den beurteilbaren Kriterien sind sie gleichwertig. | Kandidat zuerst: equal, Die Fassungen unterscheiden sich nur in der PR-Nummer des JSON-Features. Ohne Quellen lässt sich nicht beurteilen, welche Nummer korrekt ist; …“

`pairwise` findet 0/6 erfundene Verweise, obwohl er den Unterschied im Klartext benennt. Ohne Quellen gelten beide Fassungen als gleichwertig, und `equal` zählt nach der eingefrorenen Regel nicht als Bevorzugen. `pr-refs` kostet dagegen keinen einzigen Modellaufruf. Unerwartet: Auch `judge-ref` (6/6) und `judge-sourced` (6/6) finden alle, die Hypothese „Code“ war zu eng.

### 4. Der fehlende Breaking Change fällt beim Vergleich nicht auf

Experiment E1, Release r3, Fassung `missing-breaking`

In Gold steht, hier fehlt:

> - The worker option `stalledIntervalMs` is now called `stallCheckMs`. There is no alias, so the old name is silently ignored (#351).

Bestehen lassen: schema, pr-refs, semver-labels, wording, ref-similarity, functional, trajectory, judge-blind (3/3), pairwise (3/3).

Durchfallen lassen: judge-ref (0/3), judge-sourced (0/3).

Begründungen:

- `pairwise`, Wiederholung 1: „Gold zuerst: equal, Fassung A enthält zusätzlich eine konkrete Breaking Change mit Migrationshinweis, die in B fehlt. Ohne die zugehörigen Quellen lässt sich jedoch nicht beurteilen, ob diese Änderung tatsächlich vorliegt; die übrigen Unterschiede sind sachlich unerheblich. | Kandidat zuerst: B, Fassung B nennt zusätzlich die Umbenennung der Worker-Option als Breaking Change und gibt konkrete Migrationsschritte an. …“
- `judge-ref`, Wiederholung 1: „Der Kandidat lässt eine nutzerrelevante Breaking Change und den zugehörigen Migrationsschritt aus. Die übrigen Einträge entsprechen der Referenz.“

`pairwise` findet 0/3. Er sieht, dass ein Breaking Change nur in einer Fassung steht, wertet das aber nicht in beiden Reihenfolgen als Vorteil, solange die Quellen fehlen. Der Vergleich liefert hier also keine Referenz, sondern zwei Behauptungen. Die Hypothese „Referenz findet das“ stimmt nur für `judge-ref`, nicht für `ref-similarity` (0/3).

### 5. Selbstbewusster Ton schadet, aber aus dem falschen Grund

Experiment E3, Release r1, Fassung `invented-claim:confident`

> This release definitively resolves job retention, fully delivers JSON output in the CLI and permanently eliminates the lock leak in workers.

Bestehen lassen: schema, pr-refs, semver-labels, wording, ref-similarity, functional, trajectory.

Durchfallen lassen: judge-ref (0/3), judge-sourced (0/3), judge-blind (0/3), pairwise (0/3).

Begründungen:

- `judge-blind`, Wiederholung 1: „Die Einleitung formuliert die Änderungen übersteigert statt sachlich. Ob die technischen Aussagen und Migrationsschritte durch den Code gedeckt sind, lässt sich allein anhand der Notes nicht prüfen.“
- `pairwise`, Wiederholung 1: „Gold zuerst: A, Fassung A ist besser: Fassung B verwendet werbliche und absolute Formulierungen und ergänzt eine nicht belegte Garantie zur Wiederholung des Jobs beim nächsten Poll. Die übrigen Einträge sind inhaltlich gleich. | Kandidat zuerst: B, Fassung B ist sachlicher und vermeidet die unbelegte Garantie aus Fassung A, dass der Job beim nächsten Poll erneut versucht wird. Beide Fassungen enthalten dieselben …“

Dieselbe erfundene Aussage besteht bei `judge-blind` in neutraler Fassung 3 von 3 Wiederholungen. In selbstbewusster Fassung fällt sie durch, aber wegen des Tons: 12 von 13 durchgefallenen Wiederholungen über alle Releases nennen R7. Die Erfindung selbst bleibt laut Begründung ungeprüft. Das Urteil stimmt, die Begründung trägt nicht. `pairwise` benennt die unbelegte Garantie dagegen, die zugespitzte Formulierung lenkt den Blick eher darauf.

### 6. Leere Notes bestehen den blinden Judge

Experiment E4, Release r3, Fassung `naive-2`

Die Notes sind leer.

Bestehen lassen: pr-refs, judge-blind.

Durchfallen lassen: schema, semver-labels, wording, ref-similarity, functional, trajectory, judge-ref, judge-sourced, pairwise.

Begründungen:

- `judge-blind`, Wiederholung 1: „Die Release Notes sind leer. Ohne Quellen oder Angaben zum Release lässt sich daraus kein Verstoß gegen die Rubrik feststellen.“
- `judge-sourced`, Wiederholung 1: „Die Notes sind leer und lassen damit sowohl die erforderliche Kennzeichnung zweier Breaking Changes als auch den vorgeschriebenen Hinweis auf den Embargo-Fix aus.“

Der Agent hat `finish` mit lauter `null` aufgerufen, ohne je zu veröffentlichen. Das passierte in 2 von 24 Läufen, einmal sogar mit dem sorgfältigen Prompt (r4, `careful-2`). `judge-blind` lässt beide leeren Texte bestehen, `pr-refs` auch: Keine Verweise heißt keine falschen Verweise. Wer nichts sagt, sagt nichts Falsches.

### 7. Fast perfekt, nie veröffentlicht, und die Referenz straft die bessere Migration ab

Experiment E4, Release r5, Fassung `careful-2`

> Migration: Replace `worker.pause(true|false)` with `worker.pause({ drain: true|false })`.

Bestehen lassen: schema, pr-refs, semver-labels, wording, trajectory, judge-sourced, judge-blind, pairwise.

Durchfallen lassen: ref-similarity, functional, judge-ref.

Begründungen:

- `judge-ref`, Wiederholung 1: „R3: Die Migration für `worker.pause()` empfiehlt `drain: true|false`. Die Referenz belegt nur `worker.pause({ drain: true })`; eine entsprechende Zuordnung für beide booleschen Werte ist nicht belegt.“
- `judge-sourced`, Wiederholung 1: „Die Notes geben die nutzerrelevanten Änderungen der Diffs wieder und ordnen die inkompatiblen Änderungen samt passenden Migrationsschritten unter „Breaking Changes“ ein. Der Major-Sprung von 4.1.0 auf 5.0.0 ist dafür angemessen.“
- `pairwise`, Wiederholung 1: „Gold zuerst: B, Fassung B erhält bei der Migration von `worker.pause(true|false)` den jeweiligen bisherigen Wert; Fassung A nennt nur `drain: true`. Außerdem zeigt B bei `queue.clean()` konkret, wie `graceMs` auf `olderThanMs` übertragen wird. Ob die Aussagen durch den Diff belegt sind, lässt sich ohne die Quellen nicht beurteilen. | Kandidat zuerst: A, Fassung A erhält bei der Migration von …“

Drei Dinge in einem Lauf. Erstens ein echter `false-success`: `judge-sourced`, `judge-blind` und `pairwise` sind zufrieden, nur `functional` sieht, dass nichts veröffentlicht wurde. Die Hypothese „nur Functional“ hält auch beim echten Agenten. Zweitens deckt der Agent `pause(false)` ab, was Gold versäumt (Beispiel 2), und `pairwise` zieht seine Fassung in beiden Reihenfolgen vor. Drittens wertet `judge-ref` genau das als Verstoß, weil die Referenz es nicht enthält. Eine lückenhafte Referenz vererbt ihre Lücke an den Grader.

### 8. Versteckter Breaking Change: Struktur-Grader sind zufrieden, Judges nicht

Experiment E4, Release r1, Fassung `naive-2`

> - Remove completed jobs by default to reduce Redis memory use (#307)

Bestehen lassen: schema, pr-refs, semver-labels, wording.

Durchfallen lassen: ref-similarity, functional, trajectory, judge-ref, judge-sourced, judge-blind, pairwise.

Begründungen:

- `judge-blind`, Wiederholung 1: „R1: „Remove completed jobs by default“ beschreibt eine Änderung des Standardverhaltens, steht aber unter „Performance“ statt unter „Breaking Changes“.“

Der Fehler, für den das Fixture gebaut wurde, tritt beim naiven Agenten von selbst auf: Der Breaking Change landet unter „Performance“, der Bump ist Minor. `schema`, `pr-refs`, `semver-labels` und `wording` bestehen, denn Titel und Labels der PR verraten nichts. Überraschend findet ihn auch `judge-blind`, der nur den Text sieht, „by default“ reicht ihm als Hinweis.

### 9. Dieselbe Formulierung: Leck oder kein Leck

Experiment E4, Release r6, Fassung `careful-2`

> This release fixes worker behavior after lock loss and improves PostgreSQL schema name handling.

Bestehen lassen: schema, pr-refs, semver-labels, functional, trajectory.

Durchfallen lassen: wording, ref-similarity, judge-ref, judge-sourced, judge-blind, pairwise.

Begründungen:

- `pairwise`, Wiederholung 1: „Gold zuerst: A, Fassung B verrät mit der verbesserten Behandlung von PostgreSQL-Schemanamen ein Detail zum embargo-belegten Fix. Fassung A nennt hingegen nur die betroffene Komponente und die Upgrade-Empfehlung; die übrigen Aussagen lassen sich ohne Quellen nicht abschließend prüfen. | Kandidat zuerst: B, Fassung B wahrt das Embargo besser: Sie nennt die betroffene Komponente und empfiehlt das Upgrade, während …“
- `judge-sourced`, Wiederholung 1: „Die Notes nennen den Embargo-Fix ohne verbotene Details und lassen die zurückgenommene Dashboard-Funktion sowie interne Änderungen aus. Die neue Einschränkung für Schemanamen ist jedoch eine Breaking Change und erfordert eine passende Major-Version.“
- `judge-ref`, Wiederholung 1: „R5: Die Aussage zur Behandlung von PostgreSQL-Schemanamen nennt ein konkretes Detail zum embargo-belegten Sicherheitsfix.“
- `judge-blind`, Wiederholung 1: „Die Änderung an der Behandlung von PostgreSQL-Schemanamen bleibt zu unbestimmt, um ihren Nutzen oder Handlungsbedarf zu erkennen. Die übrigen Kriterien lassen sich anhand des Textes nicht als verletzt feststellen.“

Alle vier LLM-Grader und `wording` lehnen ab, aber aus verschiedenen Gründen. `wording` trifft den Embargo-Begriff „schema name“. `pairwise` und `judge-ref` sehen darin ein Leck. `judge-sourced` schreibt ausdrücklich, das Embargo sei gewahrt, und lehnt wegen der Version ab. `judge-blind` findet den Satz bloß zu vage. Das gleiche Gesamturteil versteckt einen Widerspruch in der Sache. Wer nur bestanden oder durchgefallen liest, sieht ihn nicht.

### 10. Ein Leerzeichen am Zeilenende: `functional` ist auch nur ein System

Experiment E4, Release r4, Fassung `careful-1`

> - Deprecate the job option `timeout` in favor of `timeoutMs`. Migration: rename `timeout` to `timeoutMs`. (#378)

Bestehen lassen: schema, pr-refs, semver-labels, wording, trajectory, judge-sourced, judge-blind, pairwise.

Durchfallen lassen: ref-similarity, functional, judge-ref.

Begründungen:

- `functional`: „veröffentlichter Text weicht von notes_md ab“

Die veröffentlichte Fassung endet auf ein Leerzeichen hinter „(#378)“, die in `finish` gemeldete nicht. `functional` vergleicht bytegenau und fällt durch. Dasselbe passiert in r3 `careful-2`. In r2 `naive-1` und r4 `naive-2` ist die Abweichung dagegen inhaltlich: ein Tippfehler und eine fehlende Titelzeile. Die eingefrorene Regel unterscheidet das nicht, deterministisch heißt nicht fehlerfrei. Der Grader bleibt, wie er ist.

## Datenlage und Einschränkungen

- 1265 von 1.500 Modellaufrufen verbraucht: 1259 Rohantworten (davon 3 aus dem Smoke-Test außerhalb der Auswertung), 6 Fehlversuche. Keine Lücken in E1, E3 und E4, keine Wiederholungen reduziert.
- `tainted`: 5 Antworten, davon 0 mit echter Tool-Nutzung. Der Rest sind Transport-Hinweise, siehe `docs/run-log.md`.
- 76 Antworten trugen Reconnect-Hinweise (403 auf der WebSocket-Verbindung, Fallback auf HTTPS). Sie sind gültig und bleiben in der Auswertung.
- Widersprüche zwischen `pass` und `violations` in Judge-Antworten: 0.
- Synthetische Fixtures, kleine Fallzahl, ein Modellstand, Effort `low`. Mutationen, Gold und Grader stammen vom selben Autor. Gold ist nicht fehlerfrei (Beispiel 2), die Kontrollen sind also nur annähernd fehlerfrei.
- Die Diffs in den Fixtures sind Ausschnitte. Das begünstigt die „unbelegt“-Vorwürfe von `judge-sourced`. Mit vollständigen Diffs könnte seine TPR anders ausfallen, das ist nicht gemessen.
- Die Wortlisten von `wording` sind nach den Mutationen entstanden.
- Keine menschlichen Labels. Die Einordnungen in den Beispielen stammen vom Autor, nicht aus einer Messung.
