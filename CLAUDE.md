# CLAUDE.md — HistoryDex Catalog Pipeline

Pipeline éditorial pour produire le catalogue de cartes HistoryDex (cible : 500 cartes au lancement).

L'app cible est dans `../app/historydex/` (React Native + InstantDB). Ce repo produit l'entité `cards` qu'elle ingère.

## But

Industrialiser la production éditoriale d'une carte HistoryDex de bout en bout :

```
sujet → recherche sourcée → normalisation → validation → export InstantDB
```

Chaque étape laisse une trace lisible : sources avec quotes, justifications de pivotYear, warnings éditoriaux, distribution du catalogue.

## Commandes

```bash
npm install                # installe zod, tsx, typescript, @instantdb/admin
npm run check-subject -- "Bataille de Marignan"  # cherche un doublon avant recherche
npm run validate           # vérifie schéma + invariants sur data/cards/
npm run report             # produit reports/catalog-<ts>.md (distribution + cibles)
npm run check              # = validate && report
npm run push:db            # diff vs DB + push delta (texte + images) — idempotent
npm run push:db -- --dry-run               # diff seulement, sans pousser
npm run push:db -- --max-dex 120           # restreint aux dexNum ≤ 120
npm run wipe-db            # vide la table cards en DB (double confirmation : taper "WIPE")
npm run normalize -- data/raw/<slug>.json  # raw → data/cards/ (utilitaire CLI)
npm run fetch-images       # télécharge les images Wikipedia → data/_images-cache/
npm run review-images      # app de review interactive (recadrage + bouton Approuver + bouton Push to DB)
npm run verify-geo         # recoupe (lat,lon) ↔ lieu nommé via Nominatim → reports/geo-verify-<ts>.md (advisoire)
npm run verify-geo -- --card <slug>        # un seul sujet (utilisé par l'agent card-qa)
npx tsx scripts/backfill-translation-hash.ts --apply   # stampe la provenance des traductions (one-shot, idempotent)
npm run audit-translations                 # cherche les erreurs INTRODUITES par la traduction (advisoire, hors validate) : nombres perdus, pièges MT, verbes polysémiques
npm test                                   # tests unitaires du pipeline (détecteur d'indices du teaser)
npm run generate-teasers -- --apply        # teaser FR (brève description en jeu, sans indice OÙ/QUAND) des cartes qui n'en ont pas — API Claude ; ou --brief/--import pour des sous-agents
npm run translate-teasers -- all --apply   # traduit le teaser seul (Azure, hash dédié teaserHash) — chemin court après un teaser neuf/corrigé
npx tsx scripts/pull-en-translations.ts --apply   # rapatrie dans display.locales.en les lignes `en` qui n'existaient qu'en base (fait le 2026-10-19 pour 416 cartes ; idempotent)
npx tsx scripts/audit-prompt-clarity.ts --chunk 100   # extraction lecture seule des consignes OÙ/QUAND + fréquence des verbes (revue de clarté)
npx tsx scripts/apply-prompt-rewrites.ts <validated.jsonl> --apply   # applique des consignes validées (note datée, contentVersion, locales invalidées)

# Skill (à invoquer comme commande slash) :
/audit-card-bodies [N|range:A-B]           # audit véracité historique des bodies (2 fact-checkers parallèles + spot-check + corrections auto) — cursor : .claude/skills/audit-card-bodies/SKILL.md
```

`validate` exit 1 sur erreur bloquante. `push:db` ne pousse que les cartes à `editorial.status === "approved"`, refuse de tourner si l'une d'elles est invalide, et ne pousse que le delta (cartes neuves + `local.contentVersion > db.contentVersion` côté texte ; `sha256(_images-final/<dexNum>.jpg) ≠ db.imageHash` côté image). Il **calcule `eraSort`** pour chaque carte (visibilité immédiate dans la grille Dex sans attendre le backfill cron) et **recale le singleton `catalogStats`** (cardCount + eraCounts, les « X / N » du profil/Dex) en fin de push quand des cartes ont été créées, puis **déclenche la notif joueurs « 🆕 nouvelles cartes »** (hook `notifyNewCards` → `../app/historydex/scripts/send-new-card-push.ts --apply`, watermark anti-doublon, no-op sans `EXPO_ACCESS_TOKEN` dans le `.env` de l'app ; le cron quotidien est débranché, secours manuel = workflow_dispatch `new-card-push.yml`). **Gate traduction** : `push:db` refuse un push réel si une carte approuvée n'a pas toutes ses locales cibles (`display.locales.{en,es,de,it,pt}`) — lance `/translate-cards-mt` avant, ou `--allow-untranslated` pour forcer (le dry-run liste les cartes concernées sans bloquer).

**Pré-requis push:db** :
1. `.env` du pipeline contient `EXPO_PUBLIC_INSTANT_APP_ID` + `INSTANT_APP_ADMIN_TOKEN` (cf. `.env.example`).
2. Schéma DB à jour côté app : `cd ../app/historydex && npx instant-cli push schema` (pour propager `contentVersion` + `imageHash` + `eraSort` + l'entité `catalogStats`).

## Structure du repo

| Dossier | Rôle |
|---|---|
| `schemas/` | Sources de vérité Zod (`card.schema.ts`, `catalog.schema.ts`). |
| `scripts/` | Scripts TypeScript (validate, report, export, normalize) + `_lib/`. |
| `scripts/archive/` | Scripts one-shot historiques (non-fonctionnels après la migration mai 2026). |
| `data/candidates/` | Listes de sujets potentiels (markdown libre, entrée du pipeline). |
| `data/raw/` | Fiches brutes produites par `historical-researcher` (gitignorées). |
| `data/cards/` | JSON conforme au schéma. Statut éditorial (`reviewed`/`approved`/`archived`) dans `editorial.status`. C'est la source unique du catalogue. |
| `data/_batches/` | Listes de sujets curatés par `subject-curator` avant lancement de batch (gitignoré). |
| `data/_audit/` | Sorties brutes des fact-checkers d'audit honnêteté (`agent-a-*.md`, `agent-b-*.md`) + état d'avancement (`_progress.json`). Lu par `/audit-card-bodies` pour reprendre où on s'est arrêté (gitignoré). |
| `data/_images-cache/` | Images source téléchargées de Wikipedia (gitignorées). |
| `data/_images-final/` | Images rognées validées via l'app de review (gitignorées, prêtes à uploader). |
| `reports/` | Rapports horodatés (validation, distribution, export). |
| `.claude/rules/` | Règles éditoriales / recherche / validation / export. |
| `.claude/agents/` | Subagents (researcher, verifier, editor, balancer, qa, validator). |
| `.claude/skills/` | Skills user-invocables qui orchestrent les agents. |
| `docs/` | Workflow, source-policy, editorial-guidelines (lecture humaine). |
| `data_et_prompts/` | Documents de référence d'origine (concept HistoryDex + brief pipeline). |

## Workflow d'ajout d'une carte

1. **Sujet** déposé dans `data/candidates/*.md` (ou directement dit en chat).
2. **Skill `research-card-candidate`** → agent `historical-researcher` produit `data/raw/<slug>.md` avec ≥ 2 sources, agent `source-verifier` enrichit avec un `confidence` proposé.
3. **Skill `normalize-card-data`** → agent `card-editor` rédige `display.locales.fr` (dont le **`teaser`** : brève description visible **pendant** l'énigme, sans aucun indice OÙ/QUAND — invariant bloquant `teaser-hint`, cf. [editorial-rules § Teaser](.claude/rules/editorial-rules.md)), agent `gameplay-balancer` choisit `era`/`whenDelta`/`whereRadiusKm`/etc., agent `card-qa` relit la qualité (cohérence question ↔ lieu/date, substantif précis, **clarté de la consigne pour un joueur non spécialiste** — verbe courant, événement explicite, non circulaire, robuste à la MT ; cf. [editorial-rules § Clarté](.claude/rules/editorial-rules.md) et warning `prompt-verb-jargon` —, anti-spoiler, ton, géo via `verify-geo`) en bouclant les corrections jusqu'à `PASS`, puis agent `data-validator` vérifie. Sortie : `data/cards/<slug>.json` avec `editorial.status: "reviewed"`.
   > ⚠️ **Transcription obligatoire des sources** : `editorial.sources[]` doit reprendre les sources de la fiche raw retenues par `source-verifier` (rejette les 404, conserve les 403/429 institutionnels avec note explicite), avec `quote` (≤ 800 caractères) et `relevance` ciblé (au moins **1 source `date`** + **1 source `place`**, dupliquer une même source si nécessaire). Une carte arrivée à `status: "reviewed"` avec `sources: []` (ou sans `date`/`place`) est désormais **erreur bloquante** côté `npm run validate` (`reviewed-needs-sources`, `reviewed-needs-date-source`, `reviewed-needs-place-source`) — détectée immédiatement, plus dans l'app au moment de cliquer « Approuver ».
3bis. **Skill `audit-card-bodies`** (audit honnêteté, **avant la review humaine**) → `/audit-card-bodies range:<min>-<max>` sur la plage de dexNum des cartes fraîchement produites. Deux fact-checkers indépendants par sous-lot (≤ 13 cartes), spot-check WebFetch des claims litigieux, puis **application automatique des corrections** au `body` (incrément `contentVersion` + entrée datée dans `editorial.notes`). C'est une **vérification externe à œil neuf** qui complète l'auto-relecture `card-qa` de l'étape 3 : elle rattrape les erreurs résiduelles de chiffres/datations/attributions (patterns P1-P7, cf. [.claude/rules/common-historical-errors.md](.claude/rules/common-historical-errors.md)) avant que l'humain ne voie la carte. Ne touche ni aux `sources`, ni au `canonical`, ni au `gameplay`, ni au `status`. (En génération de masse, c'est l'étape 6 du skill `generate-cards-batch`.)
4. **Validation humaine dans l'app de review** : `npm run fetch-images` puis `npm run review-images` — les cartes au statut `reviewed` apparaissent dans la liste avec un tag orange. Tu peux y recadrer l'image, éditer les textes (title/blurb/body/wherePrompt/whenPrompt/imageLabel), corriger `lat`/`lon` et `whereRadiusKm`. Vérifie aussi ce que les scripts ne peuvent pas : ton, neutralité, pertinence du `placeLabel`.
5. **Approbation** : clic « ✓ Approuver » dans l'app. L'endpoint vérifie les pré-conditions (≥ 2 publishers, sources date+place, confidence ≠ low, crop d'image, invariants OK, **teaser présent** — bloqueur `approved-needs-teaser` —, **audit honnêteté passé** — carte présente dans `data/_audit/_progress.json`, bloqueur `approved-needs-honesty-audit`) et flip `editorial.status: approved`. Sur 422, l'app affiche la liste des bloqueurs. Pour approuver en masse hors UI : `npx tsx scripts/auto-promote.ts --apply` (sans check de crop, batch CLI).
6. **Skill `validate-card-catalog`** une dernière fois (vert obligatoire).
7. **Skill `translate-cards-mt`** (auto-traduction en/es/de/it/pt/pt-PT/pl/tr/nl/ja/ko — toutes les `targetLocales()`, **AVANT le push**) : remplit `display.locales.<loc>` des cartes **approuvées** non encore traduites, via le pipeline Azure-hybride (prose Azure + sous-agent de **relecture obligatoire** — titre traduit par l'agent, corrections de prose, consignes where/when — + merge qui refuse une carte non relue + `npm run audit-translations`), idempotent. Azure seul n'est pas publiable : cf. `docs/2026-10-25-audit-traductions-cartes.md`. Sans cette étape, `push:db` ne pousse que le FR (les autres langues retombent sur l'anglais/FR côté app). Cf. `.claude/skills/translate-cards-mt/SKILL.md`. **FR modifié après traduction** (consigne ou body corrigés sur une carte déjà traduite) : procédure du même nom dans le skill — `translate-cards-mt.ts <loc> --dex a,b --apply` (purge + re-stage) → sous-agent de relecture (titre + prose + where/when) → `merge-translations.ts <loc> --dex a,b --apply`. **Jamais de merge de masse après une correction FR** (il re-stampe le hash de toutes les cartes du staging). **Teaser seul** (teaser FR neuf ou corrigé sur une carte déjà traduite) : `npm run translate-teasers -- all --apply` — hash dédié `teaserHash`, invariant `teaser-translation-stale`, pas de passage par prose/where-when/merge.
8. **Push effectif vers InstantDB** :
   - **CLI** : `npm run push:db` depuis le pipeline (diff vs DB, push delta, idempotent).
   - **UI** : bouton « Push to DB » dans l'app de review (modal dry-run + confirmation).
   - Pour la première fois après le wipe initial : `npm run wipe-db` puis `npm run push:db`.

## Workflow images d'illustration

Les cartes ont une image associée (téléchargée de Wikipedia). L'app les rend en `cover` centré, donc un sujet décentré dans l'image source est tronqué. Le pipeline produit donc une version **finale rognée** au ratio cible (800×1112, ~0.72) :

1. **`npm run fetch-images`** — télécharge les originaux dans `data/_images-cache/<dexNum>.<ext>`. Idempotent (skip si déjà présent, sauf `--force`). Scanne `data/cards/` (toutes cartes, indépendamment de `editorial.status`).
2. **`npm run review-images`** — ouvre l'app de review sur `http://localhost:5174`. Liste triée par `dexNum`, les cartes au statut `editorial.status = "reviewed"` sont marquées d'un tag « REVIEWED » bleu :
   - Liste à gauche, source + aperçu carte au centre, infos Claude à droite.
   - Glisse pour redéfinir le crop (ratio verrouillé 0.72), ou `c` pour centrer, `v` pour demander un crop à Claude (Haiku, ~$0.001/image).
   - `Entrée` ou `→` pour approuver et passer à la suivante. `←/↑` pour reculer.
   - Sauvegarde dans `data/_images-final/<dexNum>.jpg`. Statut `reviewed: true` dans `data/_images-cache/_index.json`.
3. **Re-push des images vers InstantDB** (côté repo voisin `../app/historydex/`) — modifie `scripts/seed-card-images.ts` pour pointer sur `data/_images-final/` et retirer le `sharp.resize(..., position:"attention")` devenu redondant. Puis `npx tsx scripts/seed-card-images.ts`.

   > ⚠️ Ce script **ne push que les images**. Si tu as aussi modifié du texte (title, blurb, wherePrompt, etc.), lance d'abord `npx tsx scripts/seed-cards.ts` (cf. « Workflow d'ajout d'une carte » étape 8). Confondre les deux est une cause classique de modifs invisibles côté app.

Le bouton 🤖 Claude nécessite `ANTHROPIC_API_KEY` dans `.env` (cf. `.env.example`). Sans la clé, l'app fonctionne en mode 100% manuel.

## Invariants HistoryDex (rappels)

- 18 types de cartes (cf. `CARD_TYPES` dans `schemas/card.schema.ts`) — dont `music` (œuvre/objet musical : pièce, concerto, instrument, genre ; **pas** une personne — les musiciens restent `person`), `polity` (entité politique/civilisationnelle : empire, royaume, dynastie, sultanat, khanat, cité-État, civilisation — **l'État lui-même**, pas son souverain qui reste `person`, ni un affrontement ponctuel qui reste `war`), `craft` (arts décoratifs / artisanat de prestige : orfèvrerie, trésor, céramique, porcelaine, tapis, tapisserie — **pas** une statue `sculpt` ni une machine `invent`) et `dance` (danse / genre chorégraphique — si l'angle est le mouvement dansé ; sinon un genre purement musical reste `music`).
- 5 ères (`prehist`/`antiq`/`medi`/`modern`/`contemp`) avec bornes de jeu.
- 10 régions historiques (cf. `REGION_LABELS`). `place.region` (cartes `geoKind:"earth"`) est **dérivée mécaniquement de (lat, lon)** via `regionFromCountryHitWithSnap` (`scripts/_lib/region-geo.js`) — **MÊME fonction que le scoring Explorateur du jeu** : c'est la région qu'un tap correct sur ce lieu valide. Le globe du jeu est l'**autorité** (doctrine « géographie pure ») ; ne **jamais** la saisir/forcer à la main (une valeur divergente rend la carte **injouable**). Re-dérivée à chaque édition `lat`/`lon` dans l'app de review ; toute divergence sur une carte terrestre → erreur bloquante `region-latlon-mismatch`. Réaligner en masse : `npx tsx scripts/audit-regions.ts --fix` (Liste E).
- 15 `placeKind` du vocabulaire contrôlé.
- 5 `timeKind` du vocabulaire contrôlé.
- `whenDelta` est **dérivé mécaniquement de l'ère** depuis la migration era-based (mode historien côté app, cf. `../app/historydex/lib/catalog/eras.ts`). Table figée : `prehist=2000`, `antiq=100`, `medi=25`, `modern=10`, `contemp=5`. Toute carte qui diverge → erreur bloquante `whenDelta-era-mismatch`. Ce champ n'est pas éditable depuis l'app de review.
- Échelle `whereRadiusKm` recommandée : **200, 500, 600, 800, 1000, 1200, 1500, 2000, 3000** (recalée mai 2026 sur l'usage réel des 233 premières cartes ; `600` et `1000` sont des paliers majeurs, `200` = plancher « très précis » rare). La **valeur typique par `placeKind`** (lieu précis ≈ 500-800, capitale/site étendu ≈ 1200, zone diffuse ≈ 2000) est tabulée dans [.claude/agents/gameplay-balancer.md](.claude/agents/gameplay-balancer.md). Hors échelle → warning `whereRadius-tier` ; hors bande du `placeKind` → warning `whereRadius-placekind-band`.
- Seuil `periodique`/`ponctuelle` : si `endYear - startYear ≤ 10`, la carte doit être `ponctuelle` (invariant `periodique-too-short`).
- Cohérence prompts (auto) : `*-verb-post-glue` (**erreur** : verbe collé à `pre`/`post`, espace manquant), `placeKind-verb-coherence` (warning : verbe WHERE hors famille du `placeKind`), `archi-construction-vs-existence` (warning), `whereRadius-placekind-band` (warning). Le jugement sémantique fin est porté par l'agent `card-qa`.
- **Localisable dans le temps ET l'espace (erreur bloquante)** : toute carte doit être jouable en OÙ et en QUAND — `not-localizable-where` (`eligibleForWhere=false`, `geoKind="abstract"`, ou `0,0`) et `not-localizable-when` (`eligibleForWhen=false`). Un sujet sans lieu réel défendable (cryptomonnaie décentralisée, concept abstrait) n'est pas une carte valide ; une mission spatiale s'ancre sur un point réel du pays opérateur.
- **Aucune date dans le titre (erreur bloquante)** : `title-contains-date` interdit toute date (année, « av. J.-C. », date jour-mois) dans `title`, même hors fenêtre de devinette (plus strict que `title-when-spoiler`). Renommer (la date vit dans `timeDisplayLabel`/`body`). Échappatoire : note `editorial.notes` contenant « exception titre-date » (seul cas : roman « 1984 »).
- **Teaser sans indice (erreur bloquante dès `reviewed`)** : `display.locales.fr.teaser` (20-200 car.) est la seule prose visible **pendant** l'énigme (aperçu de carte, `CardPreviewModal` côté app) ; il dit ce que c'est et pourquoi ça compte, **sans** toponyme, nationalité, continent, date, siècle, mot d'époque/style ni nom de personne — les mots du titre exceptés. Détecteur `scripts/_lib/teaser-hint.ts` → `teaser-hint` (erreur / warning nom propre), `teaser-missing` (warning), `teaser-translation-stale` (hash dédié `translationMeta.<loc>.teaserHash`, bloquant sur `approved`). Décidé le 2026-10-19 après essai sur 8 cartes : les blurbs contiennent 8 fois sur 8 un indice, d'où un champ dédié plutôt qu'une réécriture des blurbs.
- Géo : `npm run verify-geo` recoupe `(lat,lon)` au lieu nommé (Nominatim, **advisoire** — hors `validate`).
- **Traductions liées au FR dont elles dérivent.** `display.translationMeta.<loc>.sourceHash` = sha256 du texte FR au moment de la traduction (stampé par `merge-translations.ts`). Toute édition ultérieure d'un champ FR traduit (`title`, `blurb`, `body`, `placeLabel`, `timeDisplayLabel`, prompts) fait diverger le hash → erreur bloquante `translation-stale` sur les cartes `approved` → `push:db` refuse. **Corriger un body FR d'une carte traduite impose donc de relancer `/translate-cards-mt`** ; ne jamais rédiger la traduction à la main. Raison d'être : `sourceContentVersion` n'enregistre que la version au **push**, pas à la **traduction** — un simple bump de `contentVersion` re-poussait le texte traduit inchangé en le déclarant frais (bug constaté le 2026-07-19). Une locale mise à `null` est bloquée par `approved-locale-missing`, ce qui force la retraduction au lieu d'un push silencieux.

## Politique sources

Détails complets dans [.claude/rules/research-rules.md](.claude/rules/research-rules.md).

Règles courtes :
- ≥ 2 sources indépendantes pour toute carte `approved`.
- ≥ 1 source `relevance: "date"`, ≥ 1 source `relevance: "place"`.
- Wikipedia jamais comme source unique.
- Pas de paywall contourné, respect des `robots.txt`.
- Pas de scraping HTML quand une API officielle existe.

## Règles éditoriales (résumé)

Détails dans [.claude/rules/editorial-rules.md](.claude/rules/editorial-rules.md).

- Ton pédagogique et neutre. Pas d'eurocentrisme implicite.
- `title` (2-80), `teaser` (20-200, visible pendant l'énigme, **zéro indice OÙ/QUAND**), `blurb` (20-220, sans spoiler, après la réponse), `body` (40-800, peut révéler).
- `wherePrompt` = `pre + verb + post` ; le verbe est mis en évidence par l'app.
- Espacement strict : `pre` finit par une espace, `verb` sans espace en bord, `post` commence par une espace (sinon mots collés — invariant bloquant `*-verb-post-glue`).
- Cohérence `placeKind` ↔ verbe (« exposée » pour `current_exhibition`, « signé » pour `signature_place`, etc.) — outillée en warning (`placeKind-verb-coherence`), arbitrée par `card-qa`.

## Comment utiliser agents et skills

- **Skills** : invoque-les au début d'une tâche. Ils orchestrent les agents.
  - `/research-card-candidate <sujet>` — produit `data/raw/<slug>.md`
  - `/normalize-card-data <slug>` — produit `data/cards/<slug>.json` (status: reviewed)
  - `/validate-card-catalog` — résume erreurs + warnings + distribution
  - `/translate-cards-mt` — auto-traduit toutes les `targetLocales()` (en/es/de/it/pt/pt-PT/pl/tr/nl/ja/ko, Azure-hybride, bon marché) des cartes approuvées non traduites, **avant `push:db`** ; remplit `display.locales.<loc>`. (Alternative éco à `/translate-cards` LLM.)
  - `/audit-card-bodies [N|range:A-B]` — audit honnêteté du body sur les N prochaines cartes (ou plage explicite) : 2 fact-checkers parallèles + spot-check WebFetch + corrections appliquées automatiquement. Cursor d'avancement dans `data/_audit/_progress.json` ; détails dans `.claude/skills/audit-card-bodies/SKILL.md`.

- **Agents** : invoqués par les skills, mais peuvent l'être directement si une étape doit être refaite (ex : relancer `source-verifier` après modification manuelle, ou `card-qa` pour re-contrôler une carte éditée à la main avant promotion).

## Statuts éditoriaux

| Status | Sens |
|---|---|
| `draft` | Squelette créé, manque encore des champs ou des sources. |
| `reviewed` | Pipeline complet passé, valide schéma+invariants, attend lecture humaine. |
| `approved` | Lecture humaine OK, prêt à pousser via `npm run push:db`. |
| `archived` | Carte retirée du catalogue (mais conservée pour historique). |

**Une carte ne peut atteindre `reviewed`** que si (vérifié par `npm run validate`) :
- ≥ 2 sources indépendantes dans `editorial.sources`
- ≥ 1 source `relevance: date`, ≥ 1 source `relevance: place`

**Une carte ne peut devenir `approved`** que si, en plus :
- `confidence ≠ low`
- `npm run validate` est vert
- **audit honnêteté du body passé** (carte présente dans `data/_audit/_progress.json#auditedDexNums` — gate `approved-needs-honesty-audit` dans `scripts/_lib/pre-approve.ts`, partagé app de review + `auto-promote.ts` ; désactivé si le fichier de progression est absent d'un checkout frais)
- **teaser présent et sans indice** (`display.locales.fr.teaser` — gate `approved-needs-teaser` dans `pre-approve.ts` ; contenu contrôlé par l'invariant `teaser-hint` ; une carte `approved` qui le perdrait tombe en erreur `teaser-missing`)
- (vérifié par l'app de review uniquement) ≥ 2 publishers distincts + crop d'image présent

## Stratégie de production en cercles concentriques

Pour atteindre 500 puis 1500 cartes sans dériver vers le niche, produire dans cet ordre :

1. **Cercle 1 (cartes 1-200)** — sujets que tout francophone scolarisé reconnaît : Joconde, 1789, Pyramides, Apollo 11, Mur de Berlin…
2. **Cercle 2 (201-500)** — programmes d'histoire collège/lycée : Charlemagne, Lépante, Versailles…
3. **Cercle 3 (501-1000)** — amateurs d'histoire : Édit de Nantes, Spoutnik…
4. **Cercle 4 (1001-1500)** — passionnés.

Détails dans [docs/editorial-guidelines.md](docs/editorial-guidelines.md). Le pipeline ne stocke pas le cercle dans le schéma — c'est une heuristique de production. `npm run report` te dit où sont les lacunes par ère/région/type pour piloter.

> ⚠️ **Le cercle est un plafond de niche, pas un plancher.** Le critère n°1 du choix
> des sujets est la **notoriété** (« est-ce que ça parle aux gens ? »), pas l'équilibre
> statistique ni la taille du catalogue. Un catalogue volumineux peut très bien manquer
> encore des évidences (La Nuit étoilée, Le Sacre de Napoléon…) : ces grands manquants
> cercle 1-2 priment **toujours** sur une lacune exotique comblée par un sujet obscur.
> L'équilibre ère/région/type ne sert qu'à **départager des sujets de notoriété
> comparable**. Rubrique de notoriété (1-5) et procédure « grands manquants » dans
> [.claude/agents/subject-curator.md](.claude/agents/subject-curator.md).

## Anti-doublon à grande échelle

Avant de lancer une recherche sur un sujet :

```bash
npm run check-subject -- "<sujet>"
```

Cherche dans `data/{raw,normalized,approved}` sur `id`, `dexNum`, `subjectKey`, `title`, `aliases`, et noms de fichiers raw. Le skill `research-card-candidate` lance automatiquement ce check en étape 0.

## Ce que le pipeline ne fait pas (encore)

- Traduction de toutes les `targetLocales()` (es/de/it/pt/pt-PT/pl/tr/nl/ja/ko ; liste = `app/historydex/lib/i18n/supported-locales.json`, surchargeable par `SUPPORTED_LOCALES_JSON`) : **automatisée** via `/translate-cards-mt` (Azure-hybride, étape avant push) ; `en` a été backfillé côté app (`/translate-catalog en`). Re-traduction quand le FR change **après** une première traduction : **outillée** (`--dex` sur `translate-cards-mt.ts` et `merge-translations.ts`, procédure « FR modifié après traduction » du skill) mais déclenchée à la main — l'invariant `translation-stale` la rend obligatoire avant push.
- Pas de génération d'images (`imageLabel` est un texte court).
- Recherche narrative pilotée par les agents (pas d'extraction automatisée de faits). **Exception** : `npm run verify-geo` appelle Nominatim pour recouper les coordonnées (advisoire, hors `validate`).
- Pas de hooks Claude (auto-validate à l'écriture, etc.).

Ces extensions sont prévues mais hors-périmètre v1.
