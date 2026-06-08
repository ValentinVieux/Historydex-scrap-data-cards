# Research Rules — HistoryDex catalog pipeline

Règles à appliquer pour toute recherche de sources sur une carte.

## Hiérarchie des sources (priorité décroissante)

1. **Institutions patrimoniales** : musées (Louvre, Met, British Museum, Smithsonian, Prado…), bibliothèques nationales (BnF, BL, LoC), archives nationales, UNESCO World Heritage Centre.
2. **Universités et ressources académiques** : presses universitaires, Cairn, JSTOR (URLs publiques), Persée, OpenEdition.
3. **Encyclopédies reconnues** : Britannica, Larousse, Universalis, Stanford Encyclopedia of Philosophy, Oxford Reference.
4. **Sites officiels** d'un monument, d'une institution, d'un État, d'une fondation.
5. **Bases ouvertes structurées** : Wikidata, DBpedia, GeoNames, OpenStreetMap/Nominatim — utiles pour vérifier des coordonnées et des codes ISO, jamais comme source narrative.
6. **Wikipédia** : uniquement comme **point de départ**, **jamais comme source finale unique**. Les références Wikipedia (notes de bas de page) sont utiles pour remonter vers la vraie source.

## Minimums obligatoires

| Cible | Min sources |
|---|---:|
| Une carte au statut `approved` | **2** sources indépendantes |
| Date pivot | au moins **1** source avec `relevance: "date"` |
| Lieu | au moins **1** source avec `relevance: "place"` |
| Crédibilité | au moins **1** source de **tier 1-3** (musée / université / encyclopédie reconnue) |
| **Chaque chiffre précis ou nom propre secondaire du body** | **2** sources indépendantes concordantes (sinon marqué `single_source`) |

Une « source indépendante » = un autre éditeur, une autre institution. Deux pages d'un même musée comptent comme une seule source. Wikipedia + un site qui re-publie Wikipedia = 1 seule source.

## Cross-référencement des chiffres et noms précis

Les audits honnêteté du 29 mai 2026 (rapports `reports/honesty-audit-*.md`) ont révélé que **la plupart des erreurs résiduelles du pipeline sont des chiffres ou noms mal sourcés à l'unique** : Tondibi date (12 avril vs 13 mars 1591), Wright distance (255 vs 260 m), Wimbledon double messieurs (1879 vs 1884), Mayflower séparatistes (« majorité » vs minorité), Coupe du monde 1930 (« 80k » vs 68k officiel), etc.

**Règle** : pour chaque fait suivant qui apparaîtra (ou pourrait apparaître) dans le body, le `historical-researcher` doit lister la source dans la section « Faits à cross-référencer » de la fiche raw avec **≥ 2 sources indépendantes concordantes** (publishers différents). Si une seule source disponible : status `single_source`, le card-editor modalisera ou omettra.

**Catégories soumises au cross-référencement obligatoire** :
- Toute **date précise** au jour ou au mois (ex. « 14 octobre 1066 », « 13 mars 1591 »)
- Toute **dimension chiffrée** (hauteur, longueur, masse, durée, distance, capacité)
- Tout **effectif chiffré** (combattants, morts, spectateurs, blocs de pierre, habitants, passagers)
- Toute **proportion ou pourcentage** (« 51,89 % », « un tiers », « majorité de »)
- Tout **nom de personne secondaire** (ingénieurs, architectes, capitaines, sculpteurs annexes, peintres associés)
- Toute **dénomination technique précise** (type de navire, alliage, agent pathogène, classe de phénomène, période géologique)
- Toute **attribution unique** au sens fort (« inventeur de », « premier à », « fondateur de », « auteur de »)

**Hors champ** : faits structurants déjà capturés en `canonical.*` (pivotYear, lat/lon, type, placeKind) — ils relèvent des règles « Minimums obligatoires » ci-dessus.

**Pourquoi le minimum tier 1-3 ?** Une carte qui ne s'appuie que sur des bases ouvertes (Wikidata, GeoNames) ou des sites obscurs est typiquement un sujet trop niche pour le catalogue de lancement. Si aucune institution reconnue n'a documenté le sujet, c'est probablement parce qu'il intéresse une audience trop restreinte. Ce n'est pas une exclusion définitive — c'est un signal pour différer (cf. stratégie en cercles dans `docs/editorial-guidelines.md`).

## Que stocker pour chaque source

Format `editorial.sources[]` du schéma :

```json
{
  "title": "Titre de la page ou de l'ouvrage",
  "url": "https://...",
  "publisher": "Nom de l'éditeur ou de l'institution",
  "author": "Auteur si nommé, sinon null",
  "accessedAt": "YYYY-MM-DD",
  "relevance": "date" | "place" | "fact" | "context" | "image" | "general",
  "quote": "Extrait court (≤ 800 caractères) qui justifie le fait."
}
```

**`quote`** est crucial : c'est ce qui prouve qu'on n'a pas inventé. Doit citer textuellement la source. Pas de paraphrase.

## Coordonnées (lat / lon)

- Reporter les coordonnées **du lieu réellement nommé** (`placeCanonicalName`), pas un repère approximatif. **Citer la source de la coordonnée** dans `place.justification` (Wikidata P625, page UNESCO, fiche du monument…).
- Choisir `region` (1..10) cohérente avec (lat, lon).
- **Recoupement automatique** : `npm run verify-geo -- --card <slug>` géocode `placeCanonicalName` via Nominatim (scopé au `countryCode`, pour éviter les homonymes) et flague les écarts. À lancer avant promotion ; l'agent `card-qa` arbitre. Faillible sur les lieux anciens (Tenochtitlan, Constantinople) → jugement humain. C'est le garde-fou contre l'erreur « bonne région, mauvaise ville » (type Stonehenge à ~85 km).

## Désaccord entre sources

Si deux sources fiables se contredisent (date, lieu, auteur…) :

1. **Ne pas masquer**. Garde les deux dans `editorial.sources` avec leur quote respective.
2. Choisis la valeur retenue pour le canon historique en privilégiant la source la plus académique / institutionnelle.
3. **Ajoute un `editorial.warnings`** explicite : `"Désaccord sur la date : Britannica donne 1789, Larousse donne 1791. Retenu : 1789 (cf. archives officielles)."`
4. Considère `editorial.confidence: "medium"` ou `"low"`.

Une carte avec `confidence: low` **ne peut pas être promue à `approved`**.

## Phrasage du niveau de certitude

Au-delà du désaccord ouvert entre sources, beaucoup d'erreurs viennent de claims **présentés comme acquis alors qu'ils sont en réalité dominants-mais-débattus**. C'est le cœur des patterns P2 (fausse certitude), P6 (approximation chronologique) et P7 (attribution causale erronée) — cf. [common-historical-errors.md](common-historical-errors.md).

Pour chaque claim destiné au body, classer dans une des 3 catégories :

| Catégorie | Définition | Phrasage attendu dans le body |
|---|---|---|
| **(a) Consensus dur** | Sources institutionnelles convergent, peu d'incertitude résiduelle. | Direct, sans modalisateur. *« 4 juillet 1776 »*. |
| **(b) Dominant mais débattu** | Une hypothèse domine la littérature actuelle, mais une alternative sérieuse existe. | **Modalisateur obligatoire** : *« selon l'hypothèse dominante »*, *« vers »*, *« probablement »*, *« entre X et Y »*, *« autour de »*. |
| **(c) Hypothèse parmi d'autres** | Pas de consensus, plusieurs thèses cohabitent. | **Débat explicite** : *« reste débattu »*, *« les sources divergent »*, *« plusieurs hypothèses : … »*. |

**Règle dure :** un claim de catégorie (b) ou (c) qui arrive dans le body sans modalisateur **est un bug**. C'est card-qa qui rattrape en pratique (section VERACITY-CHECK), mais le researcher est en première ligne : c'est dans la fiche raw que la traçabilité (a)/(b)/(c) doit être posée.

**Cas typiques de catégorie (b)** rencontrés sur le catalogue actuel :
- Datations préhistoriques fines (paléogénétique évolue tous les 3-5 ans).
- Dates de règne de souverains pré-XIVᵉ siècle non européens (Mansa Moussa, rois aksoumites, mansas du Mali).
- Effondrements civilisationnels (Mayas, Aksoum, Indus).
- Origines de domestications (chien, cheval, mouton).
- Causalités historiographiques classiques (Spoutnik → Apollo, Sarajevo → 14-18 sans pause).

**Cas typiques de catégorie (c)** :
- Historicité de figures semi-légendaires (Homère, Confucius, premiers patriarches bibliques).
- Causes profondes d'événements multi-factoriels (effondrement de Rome, Révolution française).
- Localisation précise d'événements antiques mal documentés (Alésia, batailles de l'âge du bronze).

## Politique de scraping

- **Respecter `robots.txt`** et les conditions d'utilisation de chaque site.
- **Ne contourner aucun paywall**. Si un contenu est payant, soit la source est citée comme référence (avec accessedAt vide possible et `quote` extrait d'un résumé public), soit on cherche ailleurs.
- **Préférer les APIs officielles** (Wikidata SPARQL, GeoNames API) au scraping HTML quand elles existent.
- **Espacer les requêtes** : pas de rafale sur un même domaine. ≥ 1 seconde entre deux requêtes vers le même hôte.
- **Cacher les contenus localement** quand on les a déjà téléchargés pour éviter de re-télécharger.

## Sources à éviter

- Blogs personnels sans rigueur citationnelle.
- Sites d'agrégation low-effort (contenu généré par IA, contenu reformulé sans source).
- Forums (Reddit, Stack Exchange) sauf comme piste vers une vraie source.
- Réseaux sociaux.
- Articles de presse généraliste pour des faits historiques anciens (ils citent eux-mêmes des sources, remonte à la vraie source).

## Cas particuliers

- **Préhistoire** : les datations évoluent constamment (calibrations carbone 14, nouvelles fouilles). Cite la **fourchette** la plus récente publiée par une institution. `timeKind: "approximate_year"` ou `"range"`. `confidence` rarement `high`.
- **Personnages mythologiques ou semi-légendaires** : si l'historicité est débattue (ex : Homère, Zarathoustra), `timeKind: "debated"` et `confidence: "medium"` au mieux. Documenter le débat dans `notes`.
- **Événements diffus** (Renaissance, Révolution industrielle) : `tag: "periodique"`, `pivotYear` justifié comme « milieu de période » ou « pic d'intensité » dans `canonical.time.justification`.
- **Monuments / civilisations / institutions à usage prolongé** : capturer la fourchette d'usage **complète**, pas juste la phase de construction principale. `tag: "periodique"` systématique.
  - `startYear` = **première date documentée** (construction, fondation, début d'usage attesté)
  - `endYear` = **dernière date documentée** d'usage (abandon, ruine, désaffectation, fin d'usage attesté)
  - `pivotYear` = date pivot (pic d'intensité, période emblématique, médiane)
  - Exemple **Stonehenge** : `start=-3000, end=-1100, pivot=-2100` — monument actif sur ~1900 ans (pas juste la phase de construction des sarsens vers -2400).
  - Exemple **Pyramide de Khéops** : `tag=ponctuelle, pivot=-2580` (chantier court ~20 ans, pas un site d'usage prolongé).
  - **Le `time.justification` doit citer les sources des deux bornes** (`startYear` ET `endYear`), pas seulement du `pivotYear`.
