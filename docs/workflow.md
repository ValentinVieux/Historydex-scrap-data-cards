# Workflow — De l'idée à l'export

Diagramme du flux d'une carte HistoryDex à travers le pipeline.

Depuis la migration single-folder (mai 2026), toutes les cartes vivent dans
`data/cards/`. Le statut éditorial est porté par `editorial.status` dans
le JSON (`reviewed` → `approved` → `archived`). Plus de déplacement de
fichier entre dossiers.

```
                    ┌─────────────────────┐
                    │ data/candidates/    │  ← sujets potentiels (markdown libre)
                    │   *.md              │
                    └──────────┬──────────┘
                               │
                  skill: research-card-candidate
                               │
                  ┌────────────┴────────────┐
                  │  agent: historical-     │
                  │           researcher    │  → cherche ≥2 sources institutionnelles
                  └────────────┬────────────┘
                               │ produit
                  ┌────────────▼────────────┐
                  │ data/raw/<slug>.md      │  ← faits, sources, quotes, incertitudes
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  agent: source-verifier │  → vérifie quotes, attribue confidence
                  └────────────┬────────────┘
                               │ enrichit (section "Vérification")
                               │
                  skill: normalize-card-data
                               │
                  ┌────────────▼────────────┐
                  │  agent: card-editor     │  → rédige display.locales.fr.*
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  agent: gameplay-       │  → choisit era, whenDelta, whereRadiusKm,
                  │           balancer      │     difficulty*, eligibleFor*
                  └────────────┬────────────┘
                               │ produit
                  ┌────────────▼────────────┐
                  │ data/cards/<slug>.json  │  ← editorial.status: "reviewed"
                  │                         │     confidence: med/high
                  └────────────┬────────────┘
                               │
                  npm run fetch-images
                               │
                  ┌────────────▼────────────┐
                  │ data/_images-cache/     │
                  │   <dexNum>.<ext>        │  ← image source téléchargée
                  └────────────┬────────────┘
                               │
                  npm run review-images
                               │
                  ┌────────────▼────────────┐
                  │  HUMAIN dans l'app :    │  ← ton, neutralité, pertinence,
                  │  - relit/édite textes   │     placeLabel, fact-check final
                  │  - rogne l'image        │  ← écrit data/_images-final/<dexNum>.jpg
                  │  - clic "Approuver"     │  ← flip editorial.status à "approved"
                  └────────────┬────────────┘
                               │ status: "approved"
                  ┌────────────▼────────────┐
                  │ data/cards/<slug>.json  │  ← prêt à pousser
                  │   (status: approved)    │
                  └────────────┬────────────┘
                               │
                  npm run push:db       (étape 4 du plan refonte)
                               │
                  ┌────────────▼────────────┐
                  │  Diff vs InstantDB      │  ← contentVersion + imageHash
                  │  Push delta seulement   │
                  └─────────────────────────┘
```

## Décisions humaines (non automatisables)

1. **Sujet** à mettre dans le pipeline — choix d'équilibrage du catalogue (sera assisté par `subject-curator` à l'étape 6).
2. **Approbation `reviewed` → `approved`** — clic « Approuver » dans l'app de review, après check ton/neutralité/crop.
3. **Résolution de désaccords entre sources** — le pipeline signale ; l'humain tranche.
4. **Choix des `placeKind` ambigus** — Œuvre : lieu de création OU d'exposition ?
5. **Décision d'archivage** — quand une carte est retirée du catalogue (flip à `editorial.status: archived`).

## Garde-fous automatiques

| Vérification | Outil | Bloquant ? |
|---|---|---|
| Schéma JSON | Zod (`scripts/validate-catalog.ts`) | Oui |
| Unicité `id`, `dexNum` cross-fichiers | `runInvariants` | Oui |
| `tag=periodique` ⇒ start/end + pivot dans range | `runInvariants` | Oui |
| `era` ↔ `pivotYear` cohérence | `runInvariants` | Oui (warning si justifié dans `notes`) |
| `lat`/`lon`/`region` valides | Zod | Oui |
| `approved` ⇒ ≥ 2 sources | `runInvariants` | Oui |
| `approved` ⇒ source `date` + source `place` | `runInvariants` | Oui |
| `approved` ⇒ `confidence ≠ low` | `runInvariants` | Oui |
| `whenDelta` ≡ `HD_ERA_WHEN_DELTAS[era]` | `runInvariants` | Oui |
| `whereRadiusKm` dans paliers | `runInvariants` | Warning |
| Eurocentrisme (R1 > 35%) | `report-catalog` | Warning |
| Régions sous-représentées (R5/R7/R8/R9 < 5%) | `report-catalog` | Warning |
| Quote dans `editorial.sources` non vide | Zod (`min(1)`) | Oui |
| `quote` ≤ 800 chars | Zod | Oui |
