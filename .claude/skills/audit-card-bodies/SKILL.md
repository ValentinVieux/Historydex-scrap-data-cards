---
name: audit-card-bodies
description: Audit honnêteté du body des cartes — 2 fact-checkers parallèles + spot-check + corrections appliquées automatiquement. Reprend là où on s'est arrêté via data/_audit/_progress.json.
---

# Audit Card Bodies

Tu auscultes le `display.locales.fr.body` des cartes HistoryDex pour détecter les
erreurs factuelles, anachronismes, fausses certitudes et approximations. Tu reproduis
exactement le pipeline d'audit éprouvé sur les 5 premiers batches (cartes 005-100) :
2 fact-checkers indépendants, spot-check humain via WebFetch sur les claims litigieuses,
synthèse en rapport Markdown, **application automatique des corrections** (avec garde-fou
spot-check pour éviter les faux positifs).

## Quand invoquer ce skill

- ✓ « audite les 10 prochaines cartes »
- ✓ « refais une vérification des bodies »
- ✓ « passe la batterie d'audit sur ce qui reste à voir »

## Quand NE PAS invoquer

- ✗ Tu veux auditer **les sources** (`editorial.sources[]`) : c'est le rôle du `source-verifier`
- ✗ Tu veux vérifier les invariants schéma / lat-lon / prompts : utilise `npm run validate` ou `npm run verify-geo`
- ✗ Tu veux générer une nouvelle carte : utilise `/generate-cards-batch` ou `/research-card-candidate` + `/normalize-card-data`

## Progression actuelle

> Snapshot mis à jour manuellement à la fin de chaque run. Source de vérité réelle : `data/_audit/_progress.json`.

- **Dernière mise à jour** : 2026-05-31T18-20-23Z
- **Cartes auditées** : **524 / 524 — CATALOGUE INTÉGRALEMENT AUDITÉ** ✅. Toutes les cartes de `data/cards/` sont passées par l'honesty-audit (batches 1-23).
- **Restant à auditer** : **aucune.** Les 14 dernières cartes à petit dexNum (001-004, 006, 010-013, 015-019), ajoutées après le début de la campagne, ont été auditées au batch 23.
- **Plus petit dexNum non audité** : **aucun**. Un `/audit-card-bodies` sans argument ne sélectionnera plus rien (message « catalogue intégralement audité ») ; pour re-contrôler une carte modifiée depuis, utiliser `range:A-B`.
- **Batches exécutés** : 23 (couverture complète 001-524)
- **Corrections appliquées sur l'historique** : 13 erreurs factuelles (P1-P7 confirmées par spot-check) + 65 imprécisions mineures

## Arguments

Convention identique à `generate-cards-batch` — un seul argument optionnel passé en string :

| Invocation | Effet |
|---|---|
| `/audit-card-bodies` | Audit les **25 prochaines** cartes (N par défaut = 25), sélectionnées comme les plus petits `dexNum` du catalogue absents de `_progress.json#/auditedDexNums`. |
| `/audit-card-bodies 30` | Override de N : audit les **30 prochaines** cartes. Plafond dur à 30 ; au-delà de 13 cartes, le dispatch des fact-checkers est **chunké** en sous-lots de ≤ 13 cartes par paire d'agents (cf. cas particuliers). |
| `/audit-card-bodies range:101-110` | Audit explicite d'une plage de dexNum (override de l'état). Utile pour re-auditer après modification ou pour cibler un cercle précis. |
| `/audit-card-bodies range:055` | Audit explicite d'une seule carte (range avec une seule valeur). |

## Étapes

### 1. Lire l'état d'audit

```typescript
// Pseudocode
const progress = JSON.parse(Read("data/_audit/_progress.json"))
const auditedSet = new Set(progress.auditedDexNums)
```

- Si argument vide ou numérique : sélectionner les **N plus petits dexNums** du catalogue (`data/cards/*.json`) **absents** de `auditedSet`. N défaut = 25, override par l'argument.
- Si argument `range:<A>-<B>` : sélectionner toutes les cartes dont `dexNum` est dans la plage `[A..B]` qui existent dans `data/cards/`. Ne pas filtrer par `auditedSet` (l'argument range autorise la ré-audit).
- Si argument `range:<X>` : sélectionner uniquement la carte de dexNum `X`.
- Si aucune carte sélectionnable : message « catalogue intégralement audité au-delà de `<plus_grand_dexNum>`. Utilise `range:A-B` pour re-auditer une plage. » et STOP.

### 2. Extraire bodies + claims (Explore agent)

Invoque un sub-agent `Explore` pour produire un récap structuré de chaque carte sélectionnée :

```
## [dexNum] Title — status
- pivotYear: X (range si periodique : S–E)
- lieu: NAME (lat, lon)
- body: "..." (VERBATIM, non tronqué)
```

Le prompt de l'agent doit lister explicitement les dexNums à extraire (pas une plage — donne la liste exacte que tu viens de calculer en étape 1) et insister sur « body verbatim, ne pas tronquer ».

### 3. Construire la liste de claims (toi, pas un agent)

Pour chaque body, identifie **5-10 affirmations factuelles testables** : dates, nombres,
noms propres, attributions, lieux, séquences causales. Numérote-les C1, C2, …

Exemple sur un body type « bataille » :
- C1: Date exacte (`14 octobre 1066`)
- C2: Lieu précis (`à 11 km au nord-ouest de Hastings`)
- C3: Acteurs nommés (`Guillaume le Conquérant` vs `Harold Godwinson`)
- C4: Conséquence directe nommée (`couronnement à Westminster, Noël 1066`)
- …

Cette extraction est **manuelle** parce qu'elle exige une lecture sémantique — un agent fait moins bien sur la sélection des claims réellement testables.

### 4. Dispatch parallèle de fact-checkers (background)

Invoque **2 sub-agents `general-purpose` en parallèle, en mode `run_in_background: true`**, avec le **même prompt** et des fichiers de sortie différents :

- Agent A → `data/_audit/agent-a-<min>-<max>.md` (où `<min>` et `<max>` sont les dexNums extrêmes du batch courant)
- Agent B → `data/_audit/agent-b-<min>-<max>.md`

> **Chunking au-delà de 13 cartes** : un fact-checker perd en qualité YAML quand il doit vérifier
> beaucoup de cartes d'affilée (faux flags ~40 % vus sur les batches 1 et 4 à 20 cartes). Quand le
> batch courant dépasse **13 cartes**, découpe-le en sous-lots de ≤ 13 cartes et dispatch **une paire
> A/B par sous-lot** (donc 4 agents pour 14-26 cartes, 6 pour 27-39…), avec des fichiers de sortie
> suffixés par la plage du sous-lot (`agent-a-101-113.md`, `agent-a-114-125.md`…). La synthèse (étape 5)
> agrège tous les sous-lots dans un seul rapport `<min>-<max>` global.

#### Template de prompt pour chaque agent

```
You are **Fact-Check Agent <A|B>** for a French history-card catalog audit.
<Pour B :> Work independently — Agent A is doing the same in parallel. Do NOT try to read A's output.

# Mission

For each of the N cards below, verify the factual claims in `body` against independent web sources.
Verdict per claim from this fixed vocabulary: `confirmed` | `nuanced` | `disputed` | `refuted` | `not_found`.
Cite ONE source URL with a quote ≤ 200 chars. Add a 1-sentence note.
Then `overall_verdict` per card: `solid` | `minor_issues` | `needs_revision` | `unreliable`.

# Source policy (HARD RULES)

- **Wikipedia is NOT acceptable as the sole source for a `confirmed` verdict.** Drop to `nuanced` or `not_found` if Wikipedia-only.
- Prefer institutional: museums, university presses, UNESCO, UN, Britannica, Larousse, national libraries, archives, journals.
- URL must be a real page you fetched. Quote verbatim (translate from English with `[translated]` prefix).
- Do NOT read any local file under `data/cards/` — work strictly from the body text I give you.

# Output

Write report to **`data/_audit/agent-<A|B>-<min>-<max>.md`** as a single Markdown file containing N YAML blocks separated by `---`:

```yaml
dexNum: "<dexNum>"
title: "<title>"
claims:
  - id: C1
    text: "<claim>"
    verdict: confirmed
    source: "https://..."
    quote: "..."
    note: "..."
overall_verdict: solid
```

After writing the file, return a SHORT (≤ 100 words) summary of cards flagged as `needs_revision` or `unreliable` with one-line reasons. Don't paste back the YAML.

# The N cards to verify

<Liste : pour chaque carte, dexNum + title + body verbatim + claims C1-Cn>
```

Le harness re-invoquera le skill dès que chaque agent finit. Attends les **deux** notifications avant de passer à l'étape 5 (un seul fichier YAML ne suffit pas).

### 5. Synthèse A vs B

Lis les 2 fichiers YAML produits. Construis mentalement une table par carte :

| dexNum | verdict A | verdict B | claims divergents | action |
|---|---|---|---|---|
| 101 | solid | solid | aucun | OK |
| 102 | minor_issues | minor_issues | C3 (nuanced/nuanced) | spot-check C3 |
| 103 | needs_revision | minor_issues | C1 (refuted/nuanced) | spot-check C1 |
| 104 | solid | minor_issues | C5 (confirmed/nuanced) | spot-check C5 |

**Règles de flag pour étape 6 (spot-check) :**
- Convergence sur `refuted` ou `disputed` → spot-check obligatoire (très probable correction)
- Divergence A/B sur un claim (intensité différente) → spot-check obligatoire
- Au moins un agent donne `needs_revision` ou `unreliable` à la carte entière → spot-check obligatoire
- Convergence sur `confirmed` ou `nuanced` mineur sur des claims peu structurants → pas de spot-check (OK direct)

### 6. Spot-check humain (WebFetch)

Pour chaque claim flaggé, fais un **WebFetch direct** sur la source la plus institutionnelle citée par les agents (préférer Britannica > UNESCO > université > Wikipedia). Pose une question ciblée :

```
WebFetch(
  url: "<URL>",
  prompt: "<Question factuelle précise sur le claim — ex. 'When was X founded? Quote the date.'>"
)
```

Conclusion possible :
- **Spot-check CONFIRME** que les agents ont raison → correction à appliquer à l'étape 7
- **Spot-check INFIRME** (faux positif d'agent — cas Cueva de las Manos batch 1) → **ne PAS appliquer la correction**, mentionner le faux positif dans le rapport

⚠️ Ce filet est non négociable : c'est ce qui a évité l'erreur Cueva de las Manos (829 mains gauches lu comme total alors que >2000 est le bon chiffre).

### 7. Application automatique des corrections

Pour chaque carte dont au moins une correction est validée par le spot-check :

1. `Read` le fichier `data/cards/<slug>.json` (trouver le slug via le `dexNum`)
2. `Edit` `display.locales.fr.body` : remplacer le fragment erroné par la version corrigée
   - Préférer un phrasage **prudent** (modalisateurs « selon », « probablement », fourchettes) plutôt qu'un remplacement sec
   - Si le body devient `> 800 chars` (cf. cas Songhaï batch 4), raccourcir en supprimant les redondances avant ré-essai
3. `Edit` `editorial.notes` : ajouter en **première position** une entrée datée et patternée :
   ```
   "Body révisé YYYY-MM-DD (honesty-audit cards <min>-<max>) : « <ancien fragment> » → « <nouveau fragment> ». Source : <URL spot-check>. Pattern : <P1-P7 cf. .claude/rules/common-historical-errors.md>."
   ```
4. `Edit` `editorial.contentVersion` : `++` (incrément de 1)

Après toutes les éditions, lance **`npm run validate`** via Bash :
- ✓ Si vert (0 erreurs, warnings tolérés) : continuer vers l'étape 8
- ✗ Si erreur de longueur body sur une carte → reformuler plus court, ré-Edit, ré-validate
- ✗ Si erreur d'invariant non-corrigeable par reformulation → arrêter, sauvegarder l'état partiel, demander arbitrage humain

### 8. Mise à jour de l'état + livraison

#### 8a. Mettre à jour `data/_audit/_progress.json`

- Étendre `auditedDexNums` avec les nouveaux dexNums (dédupliquer)
- Ajouter une entrée dans `batches[]` :
  ```json
  {
    "label": "batch N — <description>",
    "dexNums": [<liste>],
    "reportPath": "reports/honesty-audit-cards-<min>-<max>-<ts>.md",
    "auditedAt": "<ISO timestamp>",
    "needsRevision": <int>,
    "minorIssues": <int>,
    "solid": <int>
  }
  ```
- Mettre à jour `lastAuditedAt`, `totalCardsAudited`, `totalBatches`, et accumuler `cumulativeCorrections`

#### 8b. Mettre à jour la section « Progression actuelle » du présent SKILL.md

Auto-éditer ce fichier (`.claude/skills/audit-card-bodies/SKILL.md`) via `Edit` pour rafraîchir le cursor inscrit en dur :

- `Dernière mise à jour` : nouveau timestamp
- `Cartes auditées` : nouveau total
- `Plus petit dexNum non audité` : recalculer
- `Batches exécutés` : `+1`
- `Corrections appliquées sur l'historique` : accumulation

Faire **un seul Edit avec `replace_all: false`** sur le bloc de la section « Progression actuelle » pour minimiser le risque de toucher au reste du fichier.

#### 8c. Écrire le rapport Markdown

Crée `reports/honesty-audit-cards-<min>-<max>-<ISO-ts>.md` selon le format **identique** aux rapports manuels (cf. exemples dans `reports/honesty-audit-cards-*.md`) :

1. **Header** : date, périmètre (dexNums + status approved/reviewed), méthode (2 agents indépendants, spot-check), pointeurs vers `data/_audit/agent-a-*.md` et `agent-b-*.md`
2. **TL;DR** : table récap (catégorie / nb / cartes)
3. **Évolution des batches** : ajouter la nouvelle ligne au tableau historique (`batch N : taux X %`)
4. **Cartes corrigées (needs_revision)** : pour chacune, body avant/après + justification + source + pattern
5. **Cartes corrigées (minor_issues)** : table compacte (dexNum / problème / reformulation appliquée)
6. **Cartes solides** : liste compacte
7. **Tableau A vs B** : verdicts par carte + spot-check fait/non fait + verdict final
8. **Recommandations** : généralement « aucune action restante » puisque corrections appliquées

#### 8d. Résumé chat

Présente à l'utilisateur :
- Le verdict global (X/N cartes corrigées)
- La liste des corrections appliquées (avec dexNum + résumé en une ligne par carte)
- Tout faux positif détecté par le spot-check (cartes que les agents flaguaient mais le body était juste)
- Le nouveau cursor : « prochain `/audit-card-bodies` commencera à dexNum X »
- Le lien Markdown vers le rapport généré

## Garanties à respecter

- [ ] Spot-check fait via WebFetch sur **tout** claim flaggé `refuted`/`disputed` ou divergent entre A et B
- [ ] `npm run validate` vert avant clôture (exit 0, ou warnings examinés)
- [ ] `data/_audit/_progress.json` mis à jour : `auditedDexNums` étendu, nouvelle entrée `batches[]`, compteurs accumulés
- [ ] Section « Progression actuelle » du présent SKILL.md mise à jour (cursor visible à l'utilisateur)
- [ ] Pour chaque carte modifiée : `editorial.contentVersion` incrémenté ET nouvelle entrée datée dans `editorial.notes`
- [ ] Rapport écrit dans `reports/honesty-audit-cards-<min>-<max>-<ts>.md` avec toutes les sections standard
- [ ] Aucune correction appliquée sans validation par spot-check (filet anti-faux-positif)
- [ ] Aucune carte modifiée hors du body, contentVersion et editorial.notes (ne touche pas aux sources, gameplay, canonical, status)

## Tu ne fais PAS

- Tu ne flippes pas `editorial.status` (l'audit ne change pas le statut — `reviewed` reste `reviewed`, `approved` reste `approved`)
- Tu n'ajoutes pas/ne supprimes pas d'entrées dans `editorial.sources[]` (c'est le rôle de `source-verifier`)
- Tu ne touches pas à `canonical.*` (lat/lon, pivotYear, placeKind, type) — ces faits structurants sont du domaine de `historical-researcher`
- Tu ne touches pas à `gameplay.*` (whenDelta, whereRadiusKm, difficulty) — c'est du domaine de `gameplay-balancer`
- Tu ne re-audites pas des cartes déjà couvertes (sauf si `range:` explicite dans l'argument)
- Tu ne pousses pas en DB (`npm run push:db` reste un acte manuel sur demande utilisateur)

## Cas particuliers

- **N > 30 demandé** : refuse poliment, propose 2 invocations successives. Justification : au-delà, le rendement humain de review du rapport ne suit pas, et le coût par run devient élevé. Pour 14-30 cartes, ne pas refuser : appliquer le **chunking** de l'étape 4 (sous-lots de ≤ 13 cartes par paire d'agents) qui neutralise la fatigue YAML observée historiquement sur les gros lots mono-paire.
- **Aucune carte non auditée disponible** : message clair « catalogue intégralement audité au-delà de `<plus_grand_dexNum_audité>`. Utilise `range:A-B` pour re-auditer une plage. » et STOP sans rien faire.
- **Spot-check révèle un faux positif d'agent** : ne PAS appliquer la correction. Documenter le faux positif dans le rapport (section dédiée « Faux positifs détectés ») avec la mention « le body est juste, l'agent s'est trompé en lisant la source ». Cas historique : Cueva de las Manos (1ᵉʳ audit), « 829 left hands » lu comme total alors que >2000 est le chiffre correct.
- **`npm run validate` reste rouge après reformulation** : arrêter immédiatement, sauvegarder l'état partiel des fichiers modifiés, présenter à l'utilisateur la liste des erreurs et demander arbitrage. Ne pas continuer aveuglément vers l'étape 8 (mise à jour du progress).
- **Carte avec body très court ou très technique** (peu de claims testables) : produire un YAML avec `claims: []` côté agents possible ; `overall_verdict: solid` par défaut ; pas de correction nécessaire.
- **Agent en background qui timeout** (>30 min) : reprendre uniquement le rapport disponible, noter l'incident dans le rapport, et continuer avec l'agent qui a fini. Si les deux ont timeout, arrêter et reporter.

## Estimation de coût par invocation

| Phase | Wall-clock | Tokens output | Coût indicatif |
|---|---|---|---|
| Étapes 1-3 (extraction + claims) | ~3 min | ~30k | $0.10 |
| Étape 4 (2 agents A+B en parallèle) | ~10-15 min | ~250-280k | $1.50-2.00 |
| Étape 6 (spot-check : 3-8 WebFetch) | ~3-5 min | ~15k | $0.10 |
| Étapes 7-8 (corrections + rapport) | ~5-10 min | ~30k | $0.15 |
| **Total par batch de 10 cartes** | **~25-35 min** | **~330k** | **~$2.00** |

Pour 20 cartes : doubler approximativement.
