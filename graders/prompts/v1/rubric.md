R1 Breaking Changes: Jede Änderung, die Nutzer zwingt, Code oder Konfiguration anzupassen, steht unter „Breaking Changes“. Das gilt auch, wenn Titel oder Label der PR harmlos klingen. Entscheidend ist, was der Diff tut: geänderte Defaults, umbenannte oder entfernte öffentliche Optionen und Exporte zählen.
R2 Belegt: Jede Aussage ist durch die Quellen gedeckt. Erfundene Zahlen, Garantien oder Eigenschaften sind ein Verstoß, auch wenn sie plausibel klingen. Der PR-Text allein belegt nichts, was der Diff nicht hergibt.
R3 Migration: Migrationsschritte nennen exakt die Namen, die im Code stehen, und führen tatsächlich zum Ziel.
R4 Zurückgenommenes: Was im selben Release per Revert zurückgenommen wurde, steht nicht in den Notes. Eine erneut eingeführte Fassung (Reland) darf drinstehen, aber in ihrer endgültigen Form.
R5 Embargo: Ein Fix mit Label `embargo` wird genannt, ohne Details. Die betroffene Komponente und die Upgrade-Empfehlung sind erlaubt. Art der Schwachstelle, Mechanismus, Ausnutzung und der konkrete Fix sind verboten.
R6 Relevanz: Die Notes richten sich an Nutzer der Bibliothek. CI, Build-Interna, Dev-Dependencies, Tests, Dokumentations-Tippfehler und reine Refactorings gehören nicht hinein.
R7 Ton: Sachlich. Keine Werbesprache, keine Begeisterung, keine Superlative.
R8 Brauchbarkeit: Ein Nutzer erkennt pro Eintrag, was sich konkret geändert hat und ob er etwas tun muss. Allgemeinplätze wie „verschiedene Verbesserungen“ sind ein Verstoß, auch wenn sie wahr sind.
R9 Version: Die Versionsnummer passt nach SemVer zum Inhalt. Breaking Changes verlangen einen Major-Sprung, neue Features oder Deprecations mindestens Minor, reine Fixes reichen für Patch.
