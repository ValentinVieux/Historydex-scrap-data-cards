# Prompt opÃ©rationnel â pipeline de crÃ©ation du catalogue HistoryDex

Ce document est un prompt prÃªt Ã  donner Ã  une IA de codage dans un repo vide pour crÃ©er lâoutillage de recherche, validation et export du futur catalogue de cartes HistoryDex.

---

## Prompt Ã  donner Ã  lâIA

Tu es une IA de codage senior. Tu travailles dans un repository vide. Ta mission est de crÃ©er un projet complet permettant de produire un catalogue de cartes historiques pour une application mobile appelÃ©e **HistoryDex**.

Ne gÃ©nÃ¨re pas seulement une liste de cartes. Construis un **pipeline Ã©ditorial reproductible** qui permet de rechercher des informations historiques, conserver les sources, transformer les faits en cartes jouables, valider les invariants de gameplay et exporter des donnÃ©es compatibles avec lâapplication HistoryDex et sa base InstantDB.

## Contexte produit

HistoryDex est un jeu mobile Ã©ducatif dâabord rÃ©digÃ© en franÃ§ais. Le catalogue sera ensuite traduit en anglais et potentiellement dans dâautres langues : le format de donnÃ©es doit donc Ãªtre prÃªt pour lâinternationalisation, mÃªme si la traduction effective nâest pas Ã  traiter maintenant. Le joueur collectionne des cartes historiques en rÃ©pondant Ã  deux questions pour chaque carte :

- **WHEN / QUAND** : quand cela sâest-il passÃ© ?
- **WHERE / OÃ** : oÃ¹ cela sâest-il passÃ© ?

Une partie contient **3 cartes**.

| Axe | Explorateur | Historien |
|---|---|---|
| WHEN | placer les 3 cartes dans le bon ordre sur une frise | placer une date avec une tolÃ©rance propre Ã  la carte |
| WHERE | choisir la bonne rÃ©gion historique parmi 10 | placer un pin sur un globe avec un rayon propre Ã  la carte |

Les cartes peuvent reprÃ©senter un Ã©vÃ©nement, une Åuvre, un objet, une invention, un personnage, un phÃ©nomÃ¨ne historique, une bataille, un texte, un monument ou une transformation politique/sociale.

## Types de cartes

Utilise ces ids stables :

| Id | Label |
|---|---|
| `paint` | Peinture |
| `sculpt` | Sculpture |
| `war` | Guerre / Bataille |
| `invent` | Invention |
| `person` | Personnage historique |
| `archi` | Architecture |
| `text` | Texte fondateur |
| `cata` | Catastrophe |
| `explor` | Exploration |
| `relig` | Religion & Mythologie |
| `sci` | Science & MÃ©decine |
| `treaty` | TraitÃ© & Politique |
| `money` | Monnaie & Commerce |
| `sport` | Sport & Culture |

Si un sujet ne rentre pas proprement dans un type, ne force pas silencieusement. Ajoute une note Ã©ditoriale et propose Ã©ventuellement une Ã©volution de taxonomie.

## Ãres

| Id | Label | Bornes de jeu |
|---|---|---|
| `prehist` | PrÃ©histoire | avant -3000 |
| `antiq` | AntiquitÃ© | -3000 â 476 |
| `medi` | Moyen Ãge | 476 â 1492 |
| `modern` | Ãpoque moderne | 1492 â 1789 |
| `contemp` | Ãpoque contemporaine | 1789 â aujourdâhui |

Ces bornes sont des conventions de jeu. Si une carte est historiquement transitoire, nÃ©olithique ou ambiguÃ«, garde la valeur de gameplay mais documente lâexception dans `notes`.

## RÃ©gions historiques

| Id | RÃ©gion | PÃ©rimÃ¨tre |
|---:|---|---|
| 1 | Europe occidentale | France, Ãles britanniques, pÃ©ninsule ibÃ©rique, Italie, Allemagne, Pays-Bas, Scandinavie |
| 2 | Europe orientale & Balkans | Pologne, Hongrie, pays baltes, Balkans, GrÃ¨ce |
| 3 | Russie & Asie centrale | Russie, Caucase, steppes, routes de la soie, Iran historique |
| 4 | Proche-Orient & MÃ©diterranÃ©e orientale | Levant, Anatolie, MÃ©sopotamie, Ãgypte, pÃ©ninsule arabique |
| 5 | Afrique hors Ãgypte | Maghreb, Sahel, Afrique de lâOuest, Centrale, Est, Australe |
| 6 | Asie de lâEst | Chine, Japon, CorÃ©e, Vietnam, Mongolie |
| 7 | Asie du Sud | Inde, Pakistan, Bangladesh, Himalaya, Sri Lanka |
| 8 | Asie du Sud-Est & Pacifique | Indochine, Insulinde, Philippines, PolynÃ©sie, Australie |
| 9 | AmÃ©riques prÃ©colombiennes & latines | MÃ©soamÃ©rique, Andes, AmÃ©rique du Sud, CaraÃ¯bes |
| 10 | AmÃ©rique du Nord | USA, Canada, surtout post-colonisation |

## Contraintes gameplay

### Temps

Chaque carte doit avoir :

- `tag`: `ponctuelle` ou `periodique` ;
- `pivotYear`: annÃ©e utilisÃ©e pour scoring et tri ;
- `startYear` / `endYear` si `periodique` ;
- `whenDelta`: tolÃ©rance en annÃ©es.

Paliers recommandÃ©s :

| Niveau | `whenDelta` typique | Usage |
|---|---:|---|
| prÃ©cis | 5 | Ã©vÃ©nement bien datÃ© |
| dÃ©cennal | 25 | date approximative, Åuvre ou invention progressive |
| sÃ©culaire | 100 | phÃ©nomÃ¨ne diffus ou ancien |
| prÃ©historique | 500+ / 1000+ | prÃ©histoire |

Pour les phÃ©nomÃ¨nes longs, le `pivotYear` doit Ãªtre justifiÃ© : milieu de pÃ©riode, date emblÃ©matique, pic, dÃ©but conventionnel, etc.

### GÃ©ographie

Chaque carte terrestre doit avoir :

- `lat` ;
- `lon` ;
- `region` ;
- `whereRadiusKm` ;
- `placeCanonicalName` ;
- `display.locales.<locale>.placeLabel` ;
- `placeKind`.

Paliers recommandÃ©s :

| Niveau | `whereRadiusKm` typique | Usage |
|---|---:|---|
| prÃ©cis | 300 | ville, monument, bataille localisÃ©e |
| rÃ©gional | 800 | zone locale ou influence rÃ©gionale |
| Ã©tendu | 2000 | phÃ©nomÃ¨ne diffus, civilisation, guerre large |
| spÃ©cial | Ã  justifier | cas atypique |

`display.locales.<locale>.placeLabel` est la bonne rÃ©ponse pÃ©dagogique affichable : `Louvre`, `Terre sainte`, `Front occidental`, `CERN`, `Gizeh`, `Europe occidentale`, etc. Ne force pas un pays moderne si une zone historique est plus juste. `placeCanonicalName` sert de nom interne stable pour lâoutillage et ne remplace pas les labels traduisibles.

### `placeKind`

Utilise un vocabulaire contrÃ´lÃ© :

- `birth_place`
- `death_place`
- `battle_site`
- `construction_site`
- `creation_place`
- `publication_place`
- `signature_place`
- `current_exhibition`
- `discovery_site`
- `landing_site`
- `diffusion_area`
- `origin_area`
- `capital_or_power_center`
- `symbolic_location`
- `other`

Une carte doit toujours dire clairement ce que le joueur doit situer. Pour une Åuvre, `WHERE` peut demander le lieu de crÃ©ation ou le lieu dâexposition, mais ce choix doit Ãªtre explicite.

### `timeKind`

Utilise un vocabulaire contrÃ´lÃ© :

- `single_year`
- `approximate_year`
- `range`
- `symbolic_pivot`
- `debated`

## Frictions Ã  Ã©viter

Ãvite absolument ces erreurs :

- mÃ©langer lieu de crÃ©ation et lieu dâexposition sans explication ;
- utiliser un pays moderne quand une zone historique est plus pertinente ;
- rÃ©duire un phÃ©nomÃ¨ne mondial ou continental Ã  un point arbitraire sans note ;
- intÃ©grer un lieu extraterrestre dans un scoring terrestre sans champ spÃ©cial ;
- crÃ©er une carte sans sources ;
- utiliser un `pivotYear` non justifiÃ© pour un phÃ©nomÃ¨ne long ;
- forcer un type incorrect faute de meilleure catÃ©gorie ;
- produire un catalogue eurocentrÃ© par dÃ©faut ;
- oublier les rÃ©gions sous-reprÃ©sentÃ©es ;
- confondre vÃ©ritÃ© historique, choix de gameplay et texte dâaffichage.

## ModÃ¨le de donnÃ©es cible

CrÃ©e un schÃ©ma TypeScript/Zod qui sÃ©pare :

1. **Canon historique**
2. **Gameplay**
3. **Affichage**
4. **MÃ©tadonnÃ©es Ã©ditoriales**
5. **Textes localisables**

Le canon historique et les paramÃ¨tres de gameplay doivent rester indÃ©pendants de la langue. Les textes affichÃ©s au joueur (`title`, `blurb`, `body`, consignes, labels pÃ©dagogiques) doivent Ãªtre stockÃ©s dans une structure localisable, avec au minimum `fr` maintenant et une extension naturelle vers `en`, puis dâautres locales.

Format recommandÃ© :

```json
{
  "id": "stable-slug",
  "dexNum": "001",
  "canonical": {
    "subjectKey": "stable-subject-key",
    "type": "paint",
    "aliases": ["string"],
    "factNotes": ["string"],
    "time": {
      "tag": "ponctuelle",
      "timeKind": "single_year",
      "pivotYear": 0,
      "startYear": null,
      "endYear": null,
      "justification": "string"
    },
    "place": {
      "placeKind": "battle_site",
      "placeCanonicalName": "string",
      "lat": 0,
      "lon": 0,
      "region": 1,
      "countryCode": "FR",
      "geoKind": "earth",
      "justification": "string"
    }
  },
  "gameplay": {
    "era": "contemp",
    "whenDelta": 5,
    "whereRadiusKm": 300,
    "difficultyWhen": "precise",
    "difficultyWhere": "precise",
    "eligibleForWhen": true,
    "eligibleForWhere": true,
    "balanceNotes": "string"
  },
  "display": {
    "defaultLocale": "fr",
    "locales": {
      "fr": {
        "title": "string",
        "blurb": "string",
        "body": "string",
        "placeLabel": "string",
        "timeDisplayLabel": "string",
        "wherePrompt": {
          "pre": "OÃ¹ a Ã©tÃ© ",
          "verb": "construit",
          "post": " ce monument ?"
        }
      },
      "en": null
    },
    "imageLabel": "string",
    "translationNotes": ["string"]
  },
  "editorial": {
    "status": "draft",
    "confidence": "medium",
    "contentVersion": 1,
    "notes": ["string"],
    "warnings": ["string"],
    "sources": [
      {
        "title": "string",
        "url": "https://...",
        "publisher": "string",
        "author": "string|null",
        "accessedAt": "YYYY-MM-DD",
        "relevance": "date",
        "quote": "short excerpt justifying the fact"
      }
    ]
  }
}
```

Tu peux ajuster le modÃ¨le, mais tu dois conserver les idÃ©es de sources, justifications, statut, sÃ©paration canon/gameplay/UI, prÃ©paration i18n et revue humaine.

## StratÃ©gie de recherche web

PrivilÃ©gie dans lâordre :

1. institutions patrimoniales : musÃ©es, bibliothÃ¨ques nationales, archives, UNESCO ;
2. universitÃ©s et ressources acadÃ©miques ;
3. encyclopÃ©dies reconnues : Britannica, Larousse, Universalis si accessible, Stanford Encyclopedia, Oxford Reference si accessible ;
4. sites officiels de monuments ou institutions ;
5. bases ouvertes structurÃ©es : Wikidata, DBpedia, GeoNames, OpenStreetMap/Nominatim ;
6. WikipÃ©dia uniquement comme point de dÃ©part, jamais comme source finale unique.

RÃ¨gles :

- minimum 2 sources indÃ©pendantes pour les faits structurants ;
- minimum 1 source pour la date ;
- minimum 1 source pour le lieu ;
- conserver URL, titre, Ã©diteur, auteur si disponible, date de consultation et extrait court ;
- signaler les dÃ©saccords entre sources ;
- utiliser `confidence`, `timeKind`, `notes` et `warnings` plutÃ´t que masquer lâincertitude.

Respecte robots.txt, les conditions dâutilisation, les dÃ©lais entre requÃªtes et le cache local. Ne contourne aucun paywall. PrÃ©fÃ¨re une API officielle au scraping HTML quand elle existe.

## Architecture du repo Ã  crÃ©er

CrÃ©e au minimum :

```text
.
âââ CLAUDE.md
âââ README.md
âââ package.json
âââ tsconfig.json
âââ .env.example
âââ .gitignore
âââ .claude/
â   âââ rules/
â   â   âââ editorial-rules.md
â   â   âââ research-rules.md
â   â   âââ validation-rules.md
â   â   âââ instantdb-export-rules.md
â   âââ agents/
â   â   âââ historical-researcher.md
â   â   âââ source-verifier.md
â   â   âââ card-editor.md
â   â   âââ gameplay-balancer.md
â   â   âââ data-validator.md
â   â   âââ instantdb-exporter.md
â   âââ skills/
â       âââ research-card-candidate/
â       â   âââ SKILL.md
â       âââ normalize-card-data/
â       â   âââ SKILL.md
â       âââ validate-card-catalog/
â       â   âââ SKILL.md
â       âââ generate-instantdb-seed/
â           âââ SKILL.md
âââ data/
â   âââ candidates/
â   âââ raw/
â   âââ normalized/
â   âââ approved/
âââ exports/
â   âââ instantdb/
â   âââ app/
âââ reports/
âââ schemas/
â   âââ card.schema.ts
â   âââ catalog.schema.ts
âââ scripts/
â   âââ research-card.ts
â   âââ normalize-card.ts
â   âââ validate-catalog.ts
â   âââ report-catalog.ts
â   âââ export-instantdb-seed.ts
âââ docs/
    âââ source-policy.md
    âââ editorial-guidelines.md
    âââ workflow.md
```

## CLAUDE.md attendu

Le `CLAUDE.md` doit expliquer :

- le but du projet ;
- les commandes disponibles ;
- la structure des dossiers ;
- la politique de scraping ;
- les rÃ¨gles Ã©ditoriales ;
- les invariants HistoryDex ;
- comment utiliser agents et skills.

Il doit rappeler que toute carte publiÃ©e doit Ãªtre sourcÃ©e, validÃ©e, relue humainement et exportÃ©e seulement aprÃ¨s passage Ã  `approved`.

## Agents Claude Ã  crÃ©er

CrÃ©e ces subagents dans `.claude/agents/` avec frontmatter `name`, `description`, `tools`, Ã©ventuellement `model`.

### `historical-researcher`

Trouve des sources fiables et extrait les faits bruts : URLs, citations, dates, lieux, contexte, incertitudes, sources Ã  rejeter.

### `source-verifier`

Croise les sources et attribue un niveau de confiance : faits confirmÃ©s, faits contestÃ©s, `low | medium | high`, warnings.

### `card-editor`

Transforme la recherche en carte pÃ©dagogique franÃ§aise : titre, blurb, body, consigne WHERE claire, `placeLabel`, `placeKind`, notes.

### `gameplay-balancer`

Choisit les paramÃ¨tres jouables : `tag`, `pivotYear`, `startYear/endYear`, `whenDelta`, `region`, `whereRadiusKm`, difficultÃ©s, justification.

### `data-validator`

VÃ©rifie JSON et invariants : erreurs bloquantes, warnings Ã©ditoriaux, score de complÃ©tude, rapport Markdown.

### `instantdb-exporter`

GÃ©nÃ¨re les exports compatibles app : JSON aplati, seed TypeScript idempotent, rapport des champs non encore supportÃ©s.

## Skills Claude Ã  crÃ©er

CrÃ©e ces skills dans `.claude/skills/<name>/SKILL.md`.

### `research-card-candidate`

Quand lâutilisateur donne un sujet, rechercher plusieurs sources, extraire date/lieu/contexte, produire une fiche dans `data/raw/` et lister les incertitudes.

### `normalize-card-data`

Transformer une fiche brute en JSON conforme au schÃ©ma dans `data/normalized/`, avec sources, justifications et warnings.

### `validate-card-catalog`

Lancer les checks, produire un rapport dans `reports/`, distinguer erreurs bloquantes et warnings.

### `generate-instantdb-seed`

Lire `data/approved/`, gÃ©nÃ©rer un export JSON aplati et un seed idempotent, signaler les champs Ã©ditoriaux non reprÃ©sentÃ©s dans le schÃ©ma actuel.

## Scripts Ã  implÃ©menter

Utilise TypeScript et Zod.

### `scripts/validate-catalog.ts`

Valide :

- conformitÃ© au schÃ©ma ;
- ids et `dexNum` uniques ;
- enums valides ;
- `tag = periodique` implique `startYear` et `endYear` ;
- `startYear <= pivotYear <= endYear` ;
- `era` cohÃ©rente avec `pivotYear`, ou warning documentÃ© ;
- `lat` entre -90 et 90 ;
- `lon` entre -180 et 180 ;
- `region` entre 1 et 10 ;
- `whereRadiusKm` dans les paliers recommandÃ©s ou warning ;
- au moins deux sources pour une carte `approved` ;
- `placeKind`, `placeCanonicalName` et `display.locales.fr.placeLabel` prÃ©sents ;
- `display.defaultLocale = fr` ;
- `display.locales.fr` complet pour tous les textes joueur ;
- les textes localisables ne sont pas dupliquÃ©s dans des champs non localisÃ©s sans raison ;
- aucune carte `approved` avec `confidence = low`.

### `scripts/report-catalog.ts`

Produit : distribution par Ã¨re, rÃ©gion, type, tag, difficultÃ©, warnings, sources insuffisantes, rÃ©gions/types sous-reprÃ©sentÃ©s.

### `scripts/export-instantdb-seed.ts`

Produit un export compatible avec le schÃ©ma actuel de lâapp :

```ts
cards: {
  dexNum: string;
  title: string;
  type: string;
  era: string;
  region: number;
  country: string;
  tag: string;
  pivotYear: number;
  startYear?: number;
  endYear?: number;
  whenDelta: number;
  lat: number;
  lon: number;
  whereRadiusKm: number;
  whereVerb: string;
  whereConsignePre: string;
  whereConsignePost: string;
  blurb: string;
  body: string;
  imageLabel: string;
  publishedAt: number;
}
```

Le pipeline doit conserver les champs enrichis et la structure i18n dans ses JSON, mÃªme si lâapp ne les ingÃ¨re pas encore. Pour lâexport InstantDB actuel, mappe temporairement `display.locales.fr` vers les champs plats `title`, `blurb`, `body`, `whereVerb`, `whereConsignePre`, `whereConsignePost` et documente cette perte de structure dans le rapport dâexport.

## Commandes attendues

CrÃ©e un `package.json` avec au minimum :

```json
{
  "scripts": {
    "validate": "tsx scripts/validate-catalog.ts",
    "report": "tsx scripts/report-catalog.ts",
    "export:instantdb": "tsx scripts/export-instantdb-seed.ts",
    "check": "npm run validate && npm run report"
  }
}
```

DÃ©pendances probables : `typescript`, `tsx`, `zod`, Ã©ventuellement `yaml`, `cheerio`, `turndown`, `p-limit`.

Ne hardcode aucune clÃ© API. Mets les variables dans `.env.example`.

## DonnÃ©es dâexemple minimales

CrÃ©e 2 ou 3 cartes dâexemple pour dÃ©montrer le pipeline :

- une carte ponctuelle localisÃ©e prÃ©cisÃ©ment ;
- une carte pÃ©riodique ou phÃ©nomÃ¨ne diffus ;
- une carte Åuvre/objet avec `placeKind` explicite.

Ces exemples servent Ã  tester les scripts, pas Ã  constituer le catalogue final.

## Workflow attendu pour produire une carte

1. Lâutilisateur propose un sujet.
2. `historical-researcher` collecte les sources.
3. `source-verifier` croise les faits.
4. `card-editor` rÃ©dige la carte.
5. `gameplay-balancer` choisit les paramÃ¨tres jouables.
6. `data-validator` vÃ©rifie les invariants.
7. La carte reste en `reviewed` jusquâÃ  validation humaine.
8. Une fois validÃ©e, elle passe en `approved`.
9. `instantdb-exporter` gÃ©nÃ¨re lâexport pour lâapp.

## CritÃ¨res dâacceptation

La tÃ¢che est rÃ©ussie si :

- le repo contient une structure claire ;
- `CLAUDE.md` existe et guide les futures sessions ;
- `.claude/rules`, `.claude/agents` et `.claude/skills` existent ;
- un schÃ©ma Zod de carte existe ;
- les scripts de validation/report/export existent ;
- le schÃ©ma distingue les champs canoniques des textes localisables ;
- `fr` est complet et le format permet dâajouter `en` ou dâautres locales sans migration lourde ;
- les exemples passent la validation ;
- les rapports listent erreurs et warnings ;
- lâexport InstantDB est gÃ©nÃ©rable ;
- le README explique le workflow complet ;
- aucune carte ne peut devenir `approved` sans sources suffisantes.

## Format de rÃ©ponse final attendu

Ã la fin de ton travail, rÃ©ponds avec :

- fichiers crÃ©Ã©s ;
- commandes disponibles ;
- comment ajouter une nouvelle carte ;
- comment valider le catalogue ;
- comment exporter vers HistoryDex ;
- limites restantes ou dÃ©cisions Ã  valider humainement.

Commence maintenant par initialiser le repo et crÃ©er lâarchitecture minimale.
