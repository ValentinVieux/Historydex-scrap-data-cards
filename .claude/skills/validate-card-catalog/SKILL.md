---
name: validate-card-catalog
description: Use to run schema and invariant validation across data/cards/, then summarize blocking errors and warnings.
---

# Validate Card Catalog

Tu lances la validation et tu présentes le résultat de manière actionnable.

## Étapes

1. Lancer `npm run validate` (équivalent : `tsx scripts/validate-catalog.ts`).
2. Lire la sortie console **et** le rapport `reports/validation-<ts>.md`.
3. Présenter :
   - Nombre total de cartes
   - Nombre d'erreurs bloquantes
   - Nombre de warnings
   - Pour chaque erreur bloquante : fichier, règle, fix recommandé (utilise [.claude/agents/data-validator.md](../../agents/data-validator.md) pour les recommandations type)
   - Top 3 warnings à examiner

4. Lancer aussi `npm run report` pour produire la distribution (par ère, région, type, tag) — utile pour repérer les déséquilibres.

5. Proposer les actions à mener :
   - Si erreurs bloquantes : lister les fichiers à corriger (ne pas les corriger sans demander).
   - Si tout est vert : suggérer la promotion vers `approved` ou l'export.

## Sortie attendue

Un résumé concis sous la forme :

```
Catalogue : N cartes (reviewed=X, approved=Y, draft=Z, archived=W)
Validation : ✗ K erreurs, M warnings
  Erreurs :
    - path/to/file.json (cardId) — règle : message
    - ...
  Warnings notables :
    - path/to/file.json (cardId) — règle : message

Distribution :
  Ères : prehist=A, antiq=B, medi=C, modern=D, contemp=E
  Top régions : R1=X, R6=Y, R4=Z
  Cartes sans 2 sources : N

Prochaines actions recommandées :
  1. ...
  2. ...
```

## Tu ne fais PAS

- Tu ne modifies pas les fichiers du catalogue.
- Tu ne flippes pas `editorial.status` toi-même — c'est le rôle du bouton « Approuver » de l'app de review (vérifie aussi le crop d'image) ou de `npx tsx scripts/auto-promote.ts --apply` pour les flips en masse.
