---
name: generate-cards-batch
description: Use to generate N new HistoryDex cards end-to-end in one shot. Orchestrates subject-curator (gap-driven subject selection) + parallel research+normalization + automatic image choice/crop + honesty audit + final validate. Outputs N cards in data/cards/ with editorial.status="reviewed", ready for human review in npm run review-images.
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

### 4. Images : choix automatique + cadrage (depuis 2026-11-15)

Une fois tous les sujets traités (cf. CLAUDE.md § « Workflow images d'illustration ») :

```bash
npx tsx scripts/image-candidates.ts --dex <liste du batch>     # ≤ 12 candidates libres / carte + planche contact (≈ 25 s / carte : lancer en arrière-plan)
```

Découper le brief (`data/_images-candidates/brief-<ts>.json`) en fichiers `judge-<a>-<b>.json` de 12-13 cartes.
Puis **un sous-agent juge par tranche**, avec pour prompt « Lis tes consignes :
`.claude/skills/generate-cards-batch/judge-instructions.md`, applique-les à `judge-<a>-<b>.json`, écris
`picks-<a>-<b>.jsonl` » (consignes complètes dans ce fichier — résumé :
lit `sheet.jpg`, écarte ce qui trahit la réponse (texte daté/situé, page de titre, pochette, carte,
drapeau, monument-réponse), le portrait de l'auteur/compositeur/savant, les homonymes ; préfère une
scène de l'œuvre / l'objet / le phénomène ; écrit `picks-<range>.jsonl` avec la boîte du sujet et une
confiance `high`/`low`, et vérifie en dry-run). Appliquer :

```bash
npx tsx scripts/apply-image-picks.ts data/_images-candidates/picks-<range>.jsonl --apply
```

Cartes sans image acceptable (`pick: null`) ou choix faible : relancer une **recherche ciblée**
`image-candidates.ts --dex <n> --force --query "<2 à 4 mots-clés anglais>"` (une requête par carte ;
**requête courte** — « Hippocrates », « Masada Israel » : les requêtes longues et précises renvoient souvent
0 fichier, ce qui a laissé 8 cartes sans image au 1er passage du 2026-11-21), puis un
juge de rattrapage qui n'écrit une ligne que s'il fait mieux. Finir par une **planche des cadrages
finaux** relue par l'orchestrateur. Les `low` restent marquées « à revoir » dans l'app de review, où
Valentin peut aussi choisir une autre candidate (bouton « Remplacer image »).

### 4bis. Liens et séries (registre `catalog/links.json`)

Reporte dans `catalog/links.json` (suivi par git, format miroir de l'app) les lignes `LIENS :`
retenues par `card-qa` : relations `{from, to, kind, why}` et ajout du dexNum aux séries
existantes **à sa place chronologique**. Une **série nouvelle** (`new:<nom>` du manifest ou
proposée par le researcher) n'est pas créée d'office : liste-la dans le rapport final pour
validation de Valentin (id, nom, icône, titre à porter, membres). `npm run validate` contrôle
le registre (`links-*`, `series-*`, `relation-*`).

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

### 6. Audit honnêteté des bodies (skill `audit-card-bodies`)

**Étape obligatoire du pipeline** (depuis 2026-06-19). Une fois les cartes valides et
imagées, lance une passe d'audit véracité sur **la plage de dexNum du batch courant** :

```
/audit-card-bodies range:<minDex>-<maxDex>
```

où `<minDex>`/`<maxDex>` sont les dexNum extrêmes des cartes que ce batch vient de
produire (ex. `range:915-944`). On utilise `range:` (et pas l'argument vide) pour cibler
**exactement** ce batch, indépendamment du curseur global `data/_audit/_progress.json`.

Ce que fait l'audit (cf. `.claude/skills/audit-card-bodies/SKILL.md`) : 2 fact-checkers
indépendants par sous-lot (≤ 13 cartes), spot-check WebFetch des claims litigieux, et
**application automatique des corrections** au `display.locales.fr.body` (avec
incrément `contentVersion` + entrée datée dans `editorial.notes`). Il ne touche ni aux
sources, ni au `canonical`, ni au `gameplay`, ni au `status`.

Pourquoi dans le pipeline : la passe `card-qa` faite pendant la normalisation est une
auto-relecture (mêmes yeux que l'éditeur) ; `audit-card-bodies` est une **vérification
externe à œil neuf**, qui a historiquement rattrapé les erreurs résiduelles de chiffres
et de datations (patterns P1-P7). Mieux vaut corriger avant la review humaine que de
laisser passer en `approved`.

> Si le batch dépasse ~13 cartes, l'audit chunke tout seul ; pour > 30 cartes, fais
> plusieurs invocations `range:` successives (plafond dur de la skill à 30).

### 7. Rapport final à l'utilisateur

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
  · Audit bodies       : Z correction(s) appliquée(s) / K (honesty-audit, range:min-max)

Cartes nouvelles dans data/cards/ (status: reviewed) :
  - [dexNum] slug : titre
  - …

Prochaine étape :
  npm run review-images
  → review visuelle + image (recadrer / choisir une autre candidate) + clic "Approuver"
  → puis traduction des cartes approuvées dans les 26 langues (skill translate-cards-mt,
    `--dex` + `--no-mt` + sous-agents, y compris les 15 langues de la vague 2026-11)
  → PAS de push manuel : la publication se fait par lots de 25 chaque lundi
    (tâche planifiée → push:db --next 25). Le stock prêt est visible sur le site de stats.
```

## Garanties à respecter

- N cartes produites = N sujets validés par l'utilisateur en étape 2.
- Statut final de chaque carte produite : `editorial.status="reviewed"` (jamais
  `approved` automatiquement — c'est une décision humaine).
- Le manifest `data/_batches/<timestamp>.json` doit refléter les sujets
  réellement traités (mettre à jour si des sujets ont été substitués).
- Anti-doublon : aucun nouveau slug ne doit collisionner avec un slug existant
  dans `data/cards/`.
- **Audit honnêteté passé** (étape 6) sur toute la plage de dexNum du batch via
  `/audit-card-bodies range:<min>-<max>`, corrections appliquées, `validate` re-vert.

## Tu ne fais PAS

- Tu n'approuves pas les cartes — c'est `editorial.status="reviewed"` à la fin.
- Tu ne pousses pas en DB — la publication est hebdomadaire et automatique
  (`push:db --next 25` le lundi), après validation humaine et traduction 26 langues.
- Tu ne lances pas un nouveau batch tant que celui-ci n'est pas reviewé côté
  humain (sauf demande explicite).

## Cas particuliers

- **N grand (> 25)** : découpe en **vagues de 25** (éprouvé sur 1047-1146) et traite-les
  l'une après l'autre (curation unique, puis recherche/normalisation/images/audit par vague).
  Plafond pratique : 20 sous-agents simultanés dans la session.
- **dexNum attribués centralement** : avant la phase 3, réserve la plage du batch
  (max(dexNum existants)+1 …) et impose à chaque `gameplay-balancer` le dexNum de son sujet
  — sinon les agents parallèles posent des placeholders qui collisionnent.
- **Sujet trop niche pour le cercle courant** : le subject-curator filtre déjà,
  mais si tu repères un sujet du cercle 4 alors que `catalogTotal < 200`,
  flag-le à l'utilisateur en étape 2.
- **Échec en cascade (≥ 3 sujets échoués)** : interromps le batch et reporte —
  c'est probablement un problème systémique (réseau, rate limit, etc.).
