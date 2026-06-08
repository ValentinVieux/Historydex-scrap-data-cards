# Validation Rules — HistoryDex catalog pipeline

Liste exhaustive des invariants vérifiés par `npm run validate` (`scripts/validate-catalog.ts`).
Sert de référence aux humains qui relisent une carte avant promotion en `approved`.

## Erreurs bloquantes (le script exit 1)

### Schéma
- Toute non-conformité au schéma Zod (`schemas/card.schema.ts`) est bloquante.

### Unicité
- `id` unique cross-fichiers (normalized + approved).
- `dexNum` unique cross-fichiers.

### Cohérence temporelle
- `tag = "periodique"` ⇒ `startYear` et `endYear` non null.
- Si `tag = "periodique"` : `startYear ≤ endYear`.
- Si `tag = "periodique"` : `startYear ≤ pivotYear ≤ endYear`.
- Si `tag = "periodique"` ET `endYear - startYear ≤ 10` ⇒ erreur `periodique-too-short`. Convertir en `ponctuelle` avec un `pivotYear` emblématique, `startYear`/`endYear` à `null`, fourchette préservée dans `timeDisplayLabel`.

### Cohérence ère / pivotYear
- `pivotYear` doit tomber dans les bornes de `gameplay.era` :
  - `prehist` : `< -3000`
  - `antiq` : `-3000` à `476`
  - `medi` : `476` à `1492`
  - `modern` : `1492` à `1789`
  - `contemp` : `1789` à aujourd'hui
- **Exception documentée** : si `editorial.notes` contient une justification (mention « ère » ou « era »), l'erreur devient un warning. Sinon, elle est bloquante.

### Cohérence géographique
- `lat ∈ [-90, 90]`
- `lon ∈ [-180, 180]`
- `region ∈ [1..10]`

### Cohérence whenDelta / era (`whenDelta-era-mismatch`)
- `gameplay.whenDelta` doit être strictement égal à `HD_ERA_WHEN_DELTAS[gameplay.era]` :
  - `prehist` → **2000**
  - `antiq` → **100**
  - `medi` → **25**
  - `modern` → **10**
  - `contemp` → **5**
- La tolérance temporelle est désormais portée par l'ère côté app (mode historien). Le champ par carte est conservé pour le fallback explorateur mais doit refléter ce palier — sinon le pipeline et l'app divergent.

### Sources (vérifié dès `reviewed`)
Ces 3 règles sont **bloquantes dès qu'une carte atteint `status: "reviewed"`**, pas seulement
`approved`. Raison : un statut `reviewed` signifie que le pipeline (researcher → editor →
normalizer) est terminé ; une carte arrivée à `reviewed` avec `editorial.sources: []` (ou
sans tag `relevance: date` / `place`) signale que le `normalize` a sauté la transcription
des sources depuis la fiche raw. On attrape ça ici, pas plus tard quand l'humain clique
« Approuver » dans l'app et reçoit un 422.

- `reviewed-needs-sources` : ≥ 2 entrées dans `editorial.sources`.
- `reviewed-needs-date-source` : au moins 1 source avec `relevance: "date"`.
- `reviewed-needs-place-source` : au moins 1 source avec `relevance: "place"`.

### Promotion à `approved`
- Toutes les règles « Sources » ci-dessus.
- `confidence ≠ "low"` (règle `approved-no-low-confidence`).
- (Côté app de review uniquement) ≥ 2 **publishers** distincts (deux pages du même éditeur =
  1) ; crop d'image présent. Cf. `scripts/_lib/pre-approve.ts`.

### Affichage
- `display.defaultLocale` doit être `"fr"`.
- `display.locales.fr` doit exister et avoir tous ses champs (title, blurb, body, placeLabel, timeDisplayLabel, wherePrompt complet).
- `title-when-spoiler` : le `title` contient un nombre qui tombe dans la fenêtre de devinette WHEN `[pivotYear ± whenDelta]` (ou `[startYear-δ .. endYear+δ]` pour les `periodique`) — révèle la réponse au quizz WHEN. Ex. « Maracanazo (1950) » avec pivot 1950 / whenDelta 5 flagge 1950 ∈ [1945..1955]. Politique « toujours renommer » (cf. `editorial-rules.md` « À éviter absolument ») : déplacer la date vers `timeDisplayLabel`/`body`. Le **lieu** dans le titre reste autorisé (« Bataille de Marignan »).

### Hygiène des prompts (bloquant)
- `wherePrompt-verb-post-glue` / `whenPrompt-verb-post-glue` : le `verb` (trimé) n'apparaît pas comme token isolé dans `pre+verb+post` → mot collé (espace manquant entre verbe et `pre`/`post`). Ex. `verb:"déroulées"` + `post:"ces conquêtes ?"` → `"…déroulées​ces conquêtes ?"`. Cf. convention d'espacement dans `editorial-rules.md`.

## Warnings (n'empêchent pas la validation, mais à examiner)

### Paliers gameplay
- `whereRadiusKm` hors de l'échelle recommandée (200, 500, 600, 800, 1000, 1200, 1500, 2000, 3000) — règle `whereRadius-tier`.
- (`whenDelta` n'est plus en warning : depuis la migration era-based, il est vérifié en **erreur bloquante** via `whenDelta-era-mismatch` — cf. section « Erreurs bloquantes ».)

### Géographie suspecte
- `lat = 0` ET `lon = 0` (Null Island) : presque toujours un geocode oublié.
- `region-latlon-mismatch` : `place.region` ne correspond pas à la classification
  géographique de `(lat, lon)` calculée par le port `scripts/_lib/region-geo.ts`
  (qui miroir la doctrine app — per-anneau pour les territoires d'outre-mer,
  ISO overrides pour les bridge cases comme Iran=R4, Mongolie=R3, Égypte=R4).
  Détecte les cartes mal classées (Hawaii en R10 au lieu de R8, Guyane en R1
  au lieu de R9, Vienne en R2 au lieu de R1, etc.). Ignoré quand le tap est
  orphelin (regionFromCountryHit → null : lieu abstrait, ou île trop petite
  pour le TopoJSON 1:110M — le snap nearest de l'app rattrape ces cas).
  Pour identifier la liste, lancer `npx tsx scripts/audit-regions.ts`.

### Unicité éditoriale
- `subjectKey` déjà utilisé par une autre carte (warning, pas erreur — utile pour repérer des doublons sémantiques).

### Cohérence ère / pivotYear (cas justifié)
- Si `editorial.notes` justifie une exception d'ère, c'est un warning au lieu d'une erreur.

### Cohérence prompts ↔ tag
- `whenPrompt-periodique-pre` : carte `periodique` dont `whenPrompt.pre` ne commence pas par « Vers quelle période… ».
- `whenPrompt-ponctuelle-pre` : carte `ponctuelle` dont `whenPrompt.pre` ne commence pas par « Quand… ».

### Hygiène des prompts
- `whenPrompt-verb-whitespace` / `wherePrompt-verb-whitespace` : espace en début/fin de `verb`.
- `whenPrompt-double-space` / `wherePrompt-double-space` : double espace dans la chaîne concaténée `pre+verb+post`.
- `whenPrompt-verb-duplicate` / `wherePrompt-verb-duplicate` : verbe répété entre la fin de `pre` et `verb` (ex. `"Où a régné " + "régné"`).
- `wherePrompt-verb-shape` / `whenPrompt-verb-shape` : `verb` ne ressemble pas à un participe passé (mot-outil, déterminant…).
- `wherePrompt-post-shape` / `whenPrompt-post-shape` : `post` trop court (< 3 caractères utiles).
- `wherePrompt-post-generic` / `whenPrompt-post-generic` : substantif générique (« ce site », « cet objet », « cette chose »).
- `where-when-post-mismatch` : `wherePrompt.post` et `whenPrompt.post` ne réfèrent pas au même substantif.

### Cohérence tdl ↔ intervalle
- `tdl-range-mismatch` : pour les `periodique`, les bornes numériques lues dans `timeDisplayLabel` ne correspondent pas à `startYear`/`endYear` (tolérance ±50 ans).

### Cohérence sémantique (warnings — arbitrés par `card-qa`)
- `placeKind-verb-coherence` : `wherePrompt.verb` hors de la famille attendue du `placeKind` (placeKind stricts seulement ; les flous ne sont pas contraints). **Pas un échec automatique** : un verbe légitime hors-liste (monnaie « frappée », massacre « commis ») est correct — l'agent `card-qa` décide d'ajuster le verbe ou de changer le `placeKind`.
- `archi-construction-vs-existence` : carte `archi` `periodique` d'intervalle > 300 ans cadrée `construction:` + verbe de chantier (`bâti`/`construit`/`érigé`/`élevé`) — préférer le cadrage `existence:`/`existé` ou resserrer l'intervalle (cf. « Monuments à usage prolongé » dans `editorial-rules.md`).
- `whereRadius-placekind-band` : `whereRadiusKm` hors de la bande attendue pour le `placeKind` (lieu ponctuel ≤ 800, zone diffuse 800-3000…). Échappatoire : `difficultyWhere: "special"` + `balanceNotes`.

## Audit géographique advisoire — `npm run verify-geo`

**Outil séparé, non bloquant** (n'altère pas `validate`). Recoupe chaque `(lat, lon)` avec le lieu nommé
géocodé via **Nominatim** (scopé au `countryCode` de la carte pour éviter les homonymes), et écrit
`reports/geo-verify-<ts>.md` listant les écarts > seuil (serré pour les lieux ponctuels ~75 km, large
pour les zones diffuses). Faillible sur les lieux anciens/abstraits (non géocodables) → c'est un
**signal** pour `card-qa` / l'humain, pas une vérité. Flags : `--card <slug>`, `--max-dex N`, `--force`.

## Invariants vérifiés au-delà du script

Le script ne juge pas la sémantique ni la pertinence. Ces points sont désormais **passés en revue
automatiquement par l'agent `card-qa`** (avant le statut `reviewed`) ; le relecteur humain confirme en
dernier ressort dans l'app de review :

- [ ] Le `placeKind` correspond au verbe utilisé dans `wherePrompt.verb` (cf. `editorial-rules.md`).
- [ ] Le `placeLabel` est lisible pour un joueur non spécialiste.
- [ ] Le `pivotYear` choisi pour une carte périodique est défendable (milieu de période, pic, date emblématique).
- [ ] Les sources `quote` justifient effectivement le fait avancé.
- [ ] Pas de spoiler de la réponse WHEN/WHERE dans le titre ou le blurb.
- [ ] Le ton est neutre et pédagogique (cf. `editorial-rules.md`).
- [ ] Les sources sont indépendantes (pas deux pages du même éditeur).
- [ ] L'image future cohérente avec `imageLabel` (texte court ≤ 16 chars).

## Ce qui se passe quand `validate` échoue

1. Le script écrit `reports/validation-<timestamp>.md` avec la liste complète.
2. Le script affiche les **erreurs** sur stderr.
3. Le script exit 1.
4. Tant qu'il y a une erreur, **aucune carte ne devrait être promue à `approved`** ni exportée.

`npm run check` (= `validate && report`) propage l'exit code : si validation rouge, le report n'est pas généré.
