---
name: normalize-card-data
description: Use after a raw fact sheet (data/raw/<slug>.md) has been verified, to transform it into a schema-conformant JSON card in data/cards/ with editorial.status="reviewed". Orchestrates card-editor + gameplay-balancer + data-validator.
---

# Normalize Card Data

Tu prends une fiche raw vérifiée et tu produis un JSON conforme au schéma Zod, prêt pour validation humaine.

## Étapes

1. **Vérifier l'entrée** : le fichier `data/raw/<slug>.md` (ou `.json`) existe et a une section « Vérification » (sinon → repasser au skill `research-card-candidate`).

2. **Construire la première version du JSON** :
   - Crée `data/cards/<slug>.json` avec le bloc `canonical` rempli depuis la fiche raw, et un bloc `editorial` (status: `draft`, **sources transcrites depuis la fiche raw**). Le statut passera à `reviewed` après l'étape 4.
   - Choisis un `id` (kebab-case stable) et un `dexNum` (3-4 chiffres, le suivant disponible — vérifier les fichiers existants dans `data/cards/`).
   - ⚠️ **Transcription des sources — étape la plus oubliée**. Pour chaque source retenue par `source-verifier` (regarde la section « Vérification » de la fiche raw : ignore les `sources à rejeter`, garde les 403/429 institutionnels en notant l'incident dans la `quote`), produis une entrée `editorial.sources[]` complète : `title`, `url`, `publisher`, `author` (ou `null`), `accessedAt` (`YYYY-MM-DD`), `relevance` **unique** (`date` | `place` | `fact` | `context` | `image` | `general`), `quote` (≤ 800 caractères, citation textuelle ou paraphrase clairement marquée si la page est inaccessible). La fiche raw peut taguer une source avec plusieurs `relevance` (« date, place ») — au moment du JSON, **choisis une seule relevance par entrée** ; si la même source justifie à la fois la date et le lieu, duplique-la en deux entrées. Le minimum dur : **≥ 2 sources, ≥ 1 `relevance: "date"`, ≥ 1 `relevance: "place"`** — sinon `npm run validate` exit 1 dès que tu flipperas `status` à `reviewed`.

3. **Lancer le `card-editor`** (subagent) sur le fichier JSON pour qu'il rédige `display.locales.fr` (title, blurb, body, placeLabel, timeDisplayLabel, wherePrompt, imageLabel).

4. **Lancer le `gameplay-balancer`** (subagent) sur le même fichier pour qu'il choisisse `era`, `whenDelta`, `whereRadiusKm`, `difficulty*`, `eligibleFor*`. (Le statut ne passe à `reviewed` qu'après l'étape QA — étape 6.)

5. **Lancer le `card-qa`** (subagent) sur le fichier — relecture qualité à œil neuf : cohérence question ↔ lieu/date, substantif le plus précis, cadrage construction/existence, anti-spoiler, ton, et géo via `npm run verify-geo -- --card <slug>`. S'il rend « À CORRIGER », route chaque fix : texte → repasser `card-editor` ; faits (lat/lon/region/pivotYear/placeKind) → repasser `historical-researcher` ; puis relancer `card-qa` jusqu'à `PASS`.

6. **Lancer le `data-validator`** (subagent) ou directement `npm run validate`. Itérer tant qu'il y a des erreurs bloquantes. Quand `validate` est vert **et** que `card-qa` rend `PASS`, mettre `editorial.status` à `reviewed`.

7. **Présenter à l'utilisateur** :
   - Récap de la carte (titre, type, ère, région, dates, lieu, deltas, confidence).
   - Liste des warnings restants à examiner manuellement.
   - Chemin du fichier `data/cards/<slug>.json`.
   - Étapes suivantes : « Lance `npm run fetch-images` puis `npm run review-images`. Dans l'app, recadre l'image et clique « ✓ Approuver » — l'app vérifie les pré-conditions et flip `editorial.status` à `approved`. **Puis, avant de pousser, lance `/translate-cards-mt`** (auto-traduction es/de/it/pt des cartes approuvées — la carte naît multilingue). Enfin pousse en DB via le bouton « Push to DB » de l'app, ou `npm run push:db` en CLI. »

## Choix du `dexNum`

Le `dexNum` est un identifiant **public** du joueur (style PokéDex). Il doit être :
- unique cross-fichiers (toutes les cartes de `data/cards/`)
- formé de 3 à 4 chiffres avec zéros à gauche (« 042 », « 0501 » plus tard)
- attribué de manière incrémentale par défaut (= max(dexNum existants) + 1)

Tu peux laisser un trou si une partie de la collection est en cours d'édition ailleurs, mais évite les trous gratuits.

## Garanties avant de rendre

- [ ] `npm run validate` est vert (exit 0) ou ne contient que des warnings examinés.
- [ ] `card-qa` a rendu `PASS` (cohérence question↔lieu/date, substantif, anti-spoiler, ton, géo).
- [ ] `editorial.sources[]` a **≥ 2 entrées**, dont **≥ 1 `relevance: "date"`** et **≥ 1 `relevance: "place"`** (sinon `reviewed-needs-sources` / `-date-source` / `-place-source` font exit 1).
- [ ] `editorial.status` est `reviewed` (pas `approved`, c'est l'humain qui décide via l'app de review).
- [ ] `editorial.confidence` est `medium` ou `high` (sinon → revenir à `research-card-candidate`).
- [ ] Le fichier `data/cards/<slug>.json` est propre (pas de TODO restants).

## Tu ne fais PAS

- Tu ne flippes pas `editorial.status` à `approved`. **C'est une décision humaine**, prise via le bouton « Approuver » de l'app de review après vérification visuelle (ton, crop d'image, neutralité).
