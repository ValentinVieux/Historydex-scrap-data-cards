---
name: generate-cards-batch
description: Use to generate N new HistoryDex cards end-to-end in one shot. Orchestrates subject-curator (gap-driven subject selection) + parallel research+normalization + image fetch + final validate. Outputs N cards in data/cards/ with editorial.status="reviewed", ready for human review in npm run review-images.
---

# Generate Cards Batch

L'utilisateur dit « génère 10 nouvelles cartes » (ou tout N raisonnable, typiquement 3-20).
Tu orchestres le pipeline complet de bout en bout pour produire N cartes à
`editorial.status="reviewed"`, prêtes pour validation humaine dans l'app de review.

## Étapes

### 1. Curation des sujets

Invoque le subagent `subject-curator` avec N en paramètre. Il analyse les lacunes
du catalogue, applique la stratégie en cercles concentriques, et écrit un
manifest dans `data/_batches/<timestamp>.json` listant N sujets à traiter.

Sortie attendue : un chemin vers le manifest JSON + un récap tableau.

### 2. Confirmation utilisateur (recommandée)

Avant de lancer la phase coûteuse (research + normalize × N), affiche le tableau
de sujets et demande **une seule confirmation** :

> « Voici les N sujets retenus. Tu valides le lancement ? (recherche + normalisation
> en parallèle, ~2-3 min par sujet, peut prendre 15-30 min au total selon le batch) »

Si l'utilisateur veut modifier la liste (échange d'un sujet, ajout, retrait),
édite le manifest et reboucle. **Ne lance pas la phase 3 sans confirmation
explicite** — c'est l'étape qui consomme des tokens et du temps web.

### 3. Recherche + normalisation en parallèle (par lots de 3)

Pour chaque sujet du manifest, **en lançant 3 sujets en parallèle à la fois**
(pas plus, pour respecter les rate limits et éviter de saturer le researcher) :

1. **research** : invoque le subagent `historical-researcher` avec le sujet, puis
   `source-verifier` sur le `.md` produit. Garantit ≥ 2 sources, confidence ≠ low.
2. **normalize** : invoque `card-editor`, `gameplay-balancer`, puis `card-qa`
   (relecture qualité à œil neuf — boucle de correction texte→`card-editor` /
   faits→`historical-researcher` jusqu'à `PASS`), puis `data-validator`
   pour produire `data/cards/<slug>.json` avec `editorial.status="reviewed"`.

Si un sujet échoue (anti-doublon trop élevé, sources introuvables, validation
rouge persistente après itération), **note l'échec et continue avec les autres**.
Le batch n'est pas une transaction atomique.

### 4. Récupération des images

Une fois tous les sujets traités, lance :

```bash
npm run fetch-images
```

Scanne `data/cards/` (toutes cartes y compris les nouvelles), télécharge les
images Wikipedia pour celles qui ont `canonical.wikipediaTitle != null`.

### 5. Validation finale + audit géo

```bash
npm run validate
npm run verify-geo            # recoupe (lat,lon) ↔ lieu nommé via Nominatim
```

`validate` doit être vert. Si rouge sur une des nouvelles cartes → invoque
`data-validator` pour proposer les fixes.

`verify-geo` est **advisoire** : pour chaque nouvelle carte flaguée (écart > seuil),
arbitre — vrai écart de coordonnées → corriger `lat`/`lon` (via `historical-researcher`) ;
lieu ancien/abstrait non géocodable → ignorer.

### 6. Rapport final à l'utilisateur

Affiche :

```
Batch de N sujets — bilan :

  ✓ Cartes produites  : K / N
  ✗ Sujets échoués    : N - K
    - <slug> : raison
    - …
  · Images téléchargées : I / K (sujets sans wikipediaTitle exclus)
  · Validate           : vert (X warnings)
  · Géo (verify-geo)   : Y écart(s) à arbitrer / K

Cartes nouvelles dans data/cards/ (status: reviewed) :
  - [dexNum] slug : titre
  - …

Prochaine étape :
  npm run review-images
  → review visuelle + recadrage image + clic "Approuver" sur chaque carte
  → puis bouton "Push to DB" pour propager en prod
```

## Garanties à respecter

- N cartes produites = N sujets validés par l'utilisateur en étape 2.
- Statut final de chaque carte produite : `editorial.status="reviewed"` (jamais
  `approved` automatiquement — c'est une décision humaine).
- Le manifest `data/_batches/<timestamp>.json` doit refléter les sujets
  réellement traités (mettre à jour si des sujets ont été substitués).
- Anti-doublon : aucun nouveau slug ne doit collisionner avec un slug existant
  dans `data/cards/`.

## Tu ne fais PAS

- Tu n'approuves pas les cartes — c'est `editorial.status="reviewed"` à la fin.
- Tu ne pousses pas en DB — c'est `npm run push:db` ou le bouton « Push to DB »
  de l'app de review, après validation humaine.
- Tu ne lances pas un nouveau batch tant que celui-ci n'est pas reviewé côté
  humain (sauf demande explicite).

## Cas particuliers

- **N très grand (> 20)** : refuse poliment et propose de découper en plusieurs
  batches plus petits (10 max recommandé) — le rendement humain de review ne
  suit pas, et la fenêtre de contexte des agents fatigue.
- **Sujet trop niche pour le cercle courant** : le subject-curator filtre déjà,
  mais si tu repères un sujet du cercle 4 alors que `catalogTotal < 200`,
  flag-le à l'utilisateur en étape 2.
- **Échec en cascade (≥ 3 sujets échoués)** : interromps le batch et reporte —
  c'est probablement un problème systémique (réseau, rate limit, etc.).
