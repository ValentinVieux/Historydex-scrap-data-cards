# scripts/archive/

Scripts one-shot historiques, conservés pour traçabilité.

**Ils ne tournent plus après la migration** vers `data/cards/` (mai 2026) :
ils référencent les anciens dossiers `data/normalized/` et `data/approved/`
qui n'existent plus.

À ne pas exécuter en l'état.

## Inventaire

| Script | Rôle historique | Période |
|---|---|---|
| `_seed-test-50.ts` | Génération d'un sous-ensemble test de 50 cartes | début catalogue |
| `analyze-review-diff.ts` | Diff entre crops auto-attention et corrections humaines | review images |
| `apply-audit-2026-05-11.ts` | Application en masse d'un audit éditorial | audit 2026-05-11 |
| `autofix-cards-21-53.ts` | Correctifs automatiques cartes #21-53 | cleanup |
| `backfill-when-prompt.ts` | Backfill rétroactif des `whenPrompt` | migration prompt |
| `bulk-balance-normalized.ts` | Pass gameplay-balance massive sur normalized/ | bulk re-balance |
| `check-104-153.ts` | Audit ciblé cartes #104-153 | QC intermediate |
| `check-50-subjects.ts` | Vérif anti-doublon sur 50 sujets candidats | sourcing batch |
| `fix-normalized-zod-errors.ts` | Correction de zod errors connus | cleanup |
| `migrate-when-delta-era-based.ts` | Migration `whenDelta` → dérivé de l'ère | feb 2026 |
| `prereview-report-21-53.ts` | Rapport pre-review cartes #21-53 | QC intermediate |
| `snapshot-baseline.ts` | Snapshot `data/approved/` + `_images-final/` avant review | baseline freeze |

Si tu as besoin de relancer l'un d'eux, prévois d'adapter `data/normalized/` /
`data/approved/` → `data/cards/` au cas par cas.
