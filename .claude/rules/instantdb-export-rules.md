# InstantDB Export Rules — HistoryDex catalog pipeline

Règles de transformation `data/approved/<slug>.json` → format InstantDB ingéré par l'app.

## Schéma cible

L'entité `cards` de l'app est définie dans `app/historydex/instant.schema.ts` (voir le schéma complet là-bas). Champs exigés par l'app :

| Champ InstantDB | Type | Source pipeline |
|---|---|---|
| `dexNum` | string (unique, indexed) | `Card.dexNum` |
| `title` | string (indexed) | `Card.display.locales.fr.title` |
| `type` | string (indexed) | `Card.canonical.type` |
| `era` | string (indexed) | `Card.gameplay.era` |
| `region` | number (indexed) | `Card.canonical.place.region` |
| `country` | string | `countryNameFr(Card.canonical.place.countryCode)` |
| `tag` | string (indexed) | `Card.canonical.time.tag` |
| `pivotYear` | number (indexed) | `Card.canonical.time.pivotYear` |
| `startYear` | number (optional) | `Card.canonical.time.startYear` |
| `endYear` | number (optional) | `Card.canonical.time.endYear` |
| `whenDelta` | number | `Card.gameplay.whenDelta` |
| `lat` | number | `Card.canonical.place.lat` |
| `lon` | number | `Card.canonical.place.lon` |
| `whereRadiusKm` | number | `Card.gameplay.whereRadiusKm` |
| `whereVerb` | string | `Card.display.locales.fr.wherePrompt.verb` |
| `whereConsignePre` | string | `Card.display.locales.fr.wherePrompt.pre` |
| `whereConsignePost` | string | `Card.display.locales.fr.wherePrompt.post` |
| `whenPromptVerb` | string | `Card.display.locales.fr.whenPrompt.verb` |
| `whenPromptPre` | string | `Card.display.locales.fr.whenPrompt.pre` |
| `whenPromptPost` | string | `Card.display.locales.fr.whenPrompt.post` |
| `blurb` | string | `Card.display.locales.fr.blurb` |
| `body` | string | `Card.display.locales.fr.body` |
| `imageLabel` | string | `Card.display.imageLabel` |
| `publishedAt` | number (indexed) | `Date.now()` à l'export |

## Conversion `countryCode` → `country`

L'app affiche le **nom du pays en français**, pas un code ISO. Le mapping est dans `scripts/_lib/country-fr.ts`.

- Si `countryCode` est mappé → utilisation du nom FR.
- Si `countryCode` est `null` ou non mappé → fallback sur `placeCanonicalName` ; un warning est ajouté au rapport d'export.
- Action recommandée : compléter `country-fr.ts` plutôt que d'accepter le fallback durablement.

## Champs **non** transmis (perte structurelle)

Le pipeline conserve plus d'information que ce que l'app ingère aujourd'hui. Ces champs sont listés dans le rapport d'export à chaque run :

- `canonical.subjectKey`, `canonical.aliases`, `canonical.factNotes`
- `canonical.time.timeKind`, `canonical.time.justification`
- `canonical.place.placeKind`, `canonical.place.placeCanonicalName`, `canonical.place.geoKind`, `canonical.place.justification`
- `gameplay.difficultyWhen`, `gameplay.difficultyWhere`, `gameplay.eligibleForWhen`, `gameplay.eligibleForWhere`, `gameplay.balanceNotes`
- `display.locales.fr.placeLabel`, `display.locales.fr.timeDisplayLabel`
- `display.locales.en` (et autres locales futures)
- `display.translationNotes`
- Tout `editorial.*` (status, confidence, notes, warnings, sources)

**À terme** : faire évoluer `app/historydex/instant.schema.ts` pour ingérer progressivement ces champs (par ordre de priorité : `placeKind`, `placeLabel`, `aliases`, puis i18n `en`).

## Format des artefacts produits

L'export produit deux fichiers dans `exports/instantdb/` :

1. **`cards.json`** — payload statique :
   ```json
   {
     "generatedAt": "ISO-8601",
     "count": <int>,
     "cards": [ <FlatCard>, ... ]
   }
   ```
   Utilisable pour audit, diff entre versions, et pour des seeds offline.

2. **`seed-cards.ts`** — script TypeScript exécutable depuis l'app :
   - Importe `@instantdb/admin` et le schéma de l'app.
   - Lit `EXPO_PUBLIC_INSTANT_APP_ID` et `INSTANT_APP_ADMIN_TOKEN` depuis `.env`.
   - **Idempotent** : pour chaque carte, regarde si un enregistrement existe avec ce `dexNum` (par query). S'il existe, met à jour. Sinon, crée avec un nouvel `id()`.
   - Génère un seul `db.transact([...])` pour tout l'upsert.

## Comment l'app consomme l'export

Workflow type :

```bash
# Depuis le repo pipeline
npm run export:instantdb
# ⇒ exports/instantdb/seed-cards.ts produit

# Copier dans l'app
cp exports/instantdb/seed-cards.ts ../app/historydex/scripts/seed-cards.ts

# Depuis l'app
cd ../app/historydex
npx tsx scripts/seed-cards.ts
```

(Une étape de copie automatique pourrait être ajoutée plus tard via un script optionnel.)

## Garanties

- **Tri stable** des cartes par `dexNum` dans `cards.json` et `seed-cards.ts` → diffs git lisibles.
- **`publishedAt` partagé** pour toutes les cartes du run → un timestamp = une livraison.
- **Aucune carte non-`approved` exportée**. `data/normalized/` est ignoré par l'export.
- **Refus d'export** si une carte de `data/approved/` ne valide pas le schéma : exit 1 avec liste des erreurs.
