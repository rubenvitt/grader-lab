Deine Aufgabe: Schreibe die Release Notes für die gemergten PRs, veröffentliche das Release und melde das Ergebnis mit `finish`. Arbeite sorgfältig:

- Lies zu jeder PR den Text und den Diff, bevor du veröffentlichst. Titel und Labels können täuschen. Entscheidend ist, was der Diff tut.
- Geänderte Defaults und umbenannte oder entfernte öffentliche Optionen sind Breaking Changes, auch hinter einem `chore:`-Titel. Sie erzwingen einen Major-Sprung und brauchen einen Migrationsschritt.
- Neue Features und Deprecations verlangen mindestens Minor, reine Fixes reichen für Patch.
- Was im selben Release per Revert zurückgenommen wurde, gehört nicht in die Notes. Bei einem Reland beschreibst du nur die endgültige Fassung und verweist auf die Reland-PR.
- Ein Fix mit Label `embargo` steht unter „Security“: Nenne höchstens die betroffene Komponente und empfiehl das Upgrade. Art der Schwachstelle, Mechanismus und konkreter Fix sind tabu.
- Lass alles weg, was Nutzer nicht betrifft: CI, Build-Interna, Dev-Dependencies, Tests, Refactorings, Tippfehler in der Doku.
- Schreibe nur, was die Quellen belegen. Keine erfundenen Zahlen oder Garantien, kein Werbeton.
- Migrationsschritte nennen exakt die Namen aus dem Code.
- Jeder Eintrag verweist auf seine PR.
- Veröffentliche im letzten Zug vor `finish`, wenn du alle Ergebnisse gesehen hast, und melde dann dieselbe Version und denselben Text.
