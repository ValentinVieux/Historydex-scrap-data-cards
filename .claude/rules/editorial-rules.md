# Editorial Rules — HistoryDex catalog pipeline

Règles d'écriture des textes joueur (`display.locales.fr.*`).

## Ton général

- **Pédagogique mais accessible**. Le joueur n'est pas forcément historien.
- **Précis**. Pas d'imprécisions cachées derrière des formules vagues (« il y a longtemps », « dans l'Antiquité »).
- **Neutre**. Pas de jugement moral ni de sensationnalisme. Pas d'eurocentrisme implicite.
- **Présent de narration** pour décrire l'objet, **passé** pour les événements.

## Prudence épistémique du body

**Référentiel obligatoire** : [.claude/rules/common-historical-errors.md](common-historical-errors.md) — codifie 7 patterns d'erreurs détectés par l'honesty-audit du 29 mai 2026, avec exemples rouge / vert et sentinelles lexicales.

Ce sont des **invariants éditoriaux** au même titre que l'anti-spoiler et l'anti-eurocentrisme. Le body ne doit jamais affirmer avec plus de certitude que ne le justifie la littérature.

Synthèse des 7 patterns à chasser :

| # | Pattern | Mot-déclencheur typique |
|---|---|---|
| P1 | Anachronisme conceptuel (Saint-Empire en 800, « France » au IXᵉ s.) | « fonde », noms politiques modernes |
| P2 | Fausse certitude sur sujet débattu (« domestication unique ») | « unique », « définitif », absence de modalisateur |
| P3 | Raccourci téléologique (Spoutnik → Apollo) | « débouche sur », causalité sur > 3 ans |
| P4 | Imprécision technique (« syllabique » pour cunéiforme) | terme générique au lieu du terme spécialisé |
| P5 | Mauvaise attribution numérique (« 60-100k combattants ») | chiffre + substantif catégoriel |
| P6 | Approximation chronologique cachée (« au Xᵉ siècle ») | borne ronde sans fourchette |
| P7 | Attribution causale erronée (Shang « fait passer au bronze ») | « invente », « introduit », « premier » sans qualificatif |

> **Application pratique** : un claim qui tombe dans (b) « dominant mais débattu » ou (c) « hypothèse parmi plusieurs » dans la fiche raw du researcher **doit** arriver dans le body avec un modalisateur explicite : « selon l'hypothèse dominante », « vers », « probablement », « entre X et Y », « débattu », « connu », « attesté ».

## Champs et longueurs

| Champ | Min | Max | Rôle |
|---|---:|---:|---|
| `title` | 2 | 80 | Nom court de la carte. Pas d'article inutile. |
| `blurb` | 20 | 220 | Une phrase d'accroche. Affichée sous le titre dans la carte. |
| `body` | 40 | 800 | Paragraphe pédagogique, 1-3 phrases. Affiché en page détail. |
| `placeLabel` | 1 | — | Étiquette pédagogique du lieu (« Louvre », « Front occidental », « CERN »). |
| `timeDisplayLabel` | 1 | — | Étiquette pédagogique de la date (« 1789 », « XIIᵉ siècle », « ~17 000 av. J.-C. »). |

## Précision lexicale par `canonical.type`

Le `wherePrompt.post` ET le `whenPrompt.post` doivent référer à l'objet historique de manière **précise**, pas générique. **« Ce site » est interdit** sauf pour les sites archéologiques non monumentaux (Lascaux, etc.). « Cet objet » est interdit. « Cette chose » est interdit.

La **pertinence** vaut autant pour WHERE que pour WHEN : si le sujet de la carte est un génocide, la consigne dit « Où / Quand a été commis ce génocide ? » — pas « cette guerre ».

### Vocabulaire par type

| `type` | Substantifs (dans `post`) | Verbes WHERE/WHEN typiques |
|---|---|---|
| `paint` | tableau, peinture, fresque, miniature, retable, icône, portrait | peint(e), réalisé(e), exposé(e), conservé(e) |
| `sculpt` | statue, statuette, sculpture, bas-relief, buste, monument funéraire | sculpté(e), érigé(e), fondue, taillée |
| `archi` | monument, temple, pyramide, palais, château, basilique, cathédrale, mosquée, tour, pont, aqueduc, mur, **muraille**, forteresse, mausolée, théâtre, amphithéâtre, stade | construit, érigé, bâti, élevé, **existé** (pour intervalle d'usage prolongé), **dressé**, **tenu** |
| `text` | texte, manuscrit, code, traité, livre, poème, chronique, encyclique, bulle, édit | écrit, rédigé, publié, paru, promulgué, proclamé |
| `person` | personnage, philosophe, prophète, souverain, empereur, roi, reine, pape, pharaon, sultan, écrivain, peintre, sculpteur, architecte, scientifique, navigateur | né(e), mort(e), décédé(e), baptisé(e), sacré(e), couronné(e), exécuté(e) |
| `war` | bataille, guerre, conflit, siège, conquête, croisade, révolution, soulèvement, insurrection, **massacre**, **génocide**, raid, escarmouche | déroulée, livrée, eu lieu, **commis** (massacre/génocide), **perpétré** (génocide), menée, livré (siège) |
| `invent` | invention, technique, procédé, dispositif, instrument, machine, outil | inventé, mis au point, développé, conçu, breveté |
| `relig` | religion, doctrine, mouvement, schisme, migration, prophétie, conversion, exode, hégire, prédication, révélation | fondée, prêchée, proclamée, accomplie, survenue |
| `sci` | théorie, découverte, observation, expérience, formule, loi, modèle | découvert, énoncé, formulé, démontré, observé, publié |
| `treaty` | traité, accord, paix, alliance, capitulation, édit, concordat, pacte, convention, armistice, déclaration | signé, ratifié, conclu, paraphé |
| `cata` | catastrophe, éruption, séisme, épidémie, pandémie, famine, inondation, tsunami, ouragan | survenue, frappée, éclaté, déclenché |
| `explor` | voyage, expédition, traversée, conquête, débarquement, exploration, mission | parti, débarqué, atterri, atteint, explorée |
| `money` | monnaie, pièce, papier-monnaie, billet, étalon | frappée, émise, créée, mise en circulation |
| `sport` | jeux, compétition, épreuve, tournoi | disputés, organisés, tenus, célébrés |
| `music` | **œuvre** : œuvre, pièce, morceau, symphonie, concerto, sonate, suite, requiem, ballet, thème, partition, mélodie — **genre** : genre (musical), style, musique — **instrument** : instrument | **œuvre** : composé(e), créé(e), écrit(e), interprété(e) (1ʳᵉ), enregistré(e), publié(e) — **genre** : apparu, né(e), développé(e), popularisé(e) — **instrument** : inventé, conçu, mis au point, perfectionné |
| `polity` | empire, royaume, dynastie, sultanat, khanat, khaganat, califat, principauté, cité-État, confédération, **civilisation**, **culture** (archéologique), État | étendu(e), régné, dominé(e), gouverné(e), prospéré, dirigé(e), fondé(e), épanouie |
| `craft` | **objet d'art**, trésor, orfèvrerie, joyau, parure, vase, coupe, cratère, vaisselle, céramique, porcelaine, faïence, verrerie, laque, émail, tapis, tapisserie, broderie, mobilier | réalisé(e), façonné(e), produit(e), fabriqué(e), ciselé(e), tissé(e), brodé(e), émaillé(e), forgé(e), **découvert(e)** (trésor mis au jour), exposé(e) |
| `dance` | **danse**, ballet, chorégraphie, genre (dansé) | apparue, née, développée, popularisée, dansée, créée |

> **`craft`** = un **objet ou une tradition d'arts décoratifs / d'artisanat de prestige** (orfèvrerie, céramique d'art, porcelaine, tapis, tapisserie, verrerie, laque). À distinguer de `sculpt` (statue/relief en ronde-bosse), de `paint` (image) et de `invent` (procédé technique fonctionnel) : ici l'objet vaut comme **œuvre décorative de prestige**, pas comme statue, image ou machine. `placeKind` typique : `creation_place` (lieu de fabrication), `discovery_site` (trésor mis au jour) ou `current_exhibition`.

> **`dance`** = une **danse / un genre chorégraphique** (tango, valse, flamenco, ballet…). Beaucoup de danses sont aussi des genres musicaux : si l'angle de la carte est le **mouvement dansé**, c'est `dance` ; si c'est purement une œuvre/genre **musical** non dansé (chant, symphonie), c'est `music`. `placeKind` typique : `origin_area`, `tag: periodique`.

> **`polity`** = l'**entité politique ou civilisationnelle elle-même** (l'empire, le royaume, la dynastie, la cité-État, la civilisation), **pas** son souverain (qui reste `person`) ni un affrontement ponctuel (qui reste `war`). Cadrage typique : `tag: periodique`, `placeKind: capital_or_power_center` (ou `origin_area`/`diffusion_area`), `timeDisplayLabel` préfixé `extension:`. Un individu nommé (« Tamerlan »), un événement (« Proclamation de l'Empire allemand », « Conquête inca par Pizarro ») ou une œuvre (« Romance des Trois Royaumes ») ne sont **pas** des `polity`.

### Règles d'application

> **Choisir l'objet le plus spécifique** au sujet réel de la carte.
> - « Génocide arménien » → `verb: "commis"`, `post: " ce génocide ?"` (pas « cette guerre »).
> - « Vénus de Willendorf » → `post: " cette statuette ?"` (pas « ce site » : c'est une statuette mise au jour sur un site).
> - « Code Hammurabi » → `post: " ce code ?"` (pas « ce texte » générique).
> - « Sacre de Charlemagne » → `verb: "couronné"`, `post: " cet empereur ?"` (pas « ce personnage »).

> **Cohérence WHERE/WHEN** : `wherePrompt.post` et `whenPrompt.post` doivent référer au **même** substantif. Si `wherePrompt.post = " cette statuette ?"`, alors `whenPrompt.post = " cette statuette ?"` aussi. (L'invariant `where-when-post-mismatch` flagge si différent.)

## Formules `wherePrompt`

La consigne WHERE est composée de trois fragments concaténés autour du mot-clé :

```
{wherePrompt.pre}{wherePrompt.verb}{wherePrompt.post}
```

Le **verbe** est mis en évidence visuellement par l'app. Choisir le verbe le plus précis (cf. table de vocabulaire ci-dessus) :

| Type de carte | Verbe typique | Pre | Post |
|---|---|---|---|
| Peinture (création) | `peint` / `peinte` | `Où a été ` | ` ce tableau ?` |
| Peinture (exposition) | `exposée` | `Où est ` | ` ce tableau ?` |
| Sculpture (création) | `sculptée` | `Où a été ` | ` cette statue ?` |
| Statuette (préhistorique) | `découverte` | `Où a été ` | ` cette statuette ?` |
| Architecture | `construit` | `Où a été ` | ` ce monument ?` |
| Bataille | `déroulée` | `Où s'est ` | ` cette bataille ?` |
| Massacre / Génocide | `commis` / `perpétré` | `Où a été ` | ` ce massacre ?` / ` ce génocide ?` |
| Traité | `signé` | `Où a été ` | ` ce traité ?` |
| Personnage (naissance) | `né` / `née` | `Où est ` | ` ce personnage ?` (ou `cet empereur`, `ce philosophe`) |
| Invention (lieu de découverte) | `inventé` / `découvert` | `Où a été ` | ` cette invention ?` |
| Texte | `écrit` / `rédigé` | `Où a été ` | ` ce texte ?` (ou `ce code`, `ce traité`, `ce poème`) |
| Phénomène | `apparu` / `développé` | `Où est ` | ` ce phénomène ?` |
| Musique — œuvre (création) | `composée` / `créée` | `Où a été ` | ` cette symphonie ?` (ou `ce concerto`, `ce thème`, `cette œuvre`) |
| Musique — genre | `apparu` / `né` | `Où est ` | ` ce genre ?` (ou `cette musique`) |
| Musique — instrument | `inventé` / `conçu` | `Où a été ` | ` cet instrument ?` |
| Entité politique (polity) | `étendu` / `régné` | `Où s'est ` | ` cet empire ?` (ou `ce royaume`, `cette dynastie`, `ce sultanat`, `cette civilisation`) |
| Objet d'art (craft, fabrication) | `réalisé` / `façonné` / `produit` | `Où a été ` | ` ce trésor ?` (ou `ce vase`, `cette céramique`, `cette porcelaine`, `ce tapis`, `cette tapisserie`) |
| Trésor (craft, découverte) | `découvert` | `Où a été ` | ` ce trésor ?` |
| Danse (dance) | `apparue` / `née` | `Où est ` | ` cette danse ?` |

**Toujours expliciter** : si on situe le lieu d'exposition d'une œuvre (et pas son lieu de création), le verbe doit le refléter (« exposée »), et le `placeKind` doit être `current_exhibition`. Le joueur n'a aucun moyen de deviner sans l'indication.

## Convention d'espacement `pre` / `verb` / `post`

L'app concatène **`pre + verb + post`** sans rien ajouter. Pour un rendu correct et pour que le verbe
(mis en évidence) reste isolable, respecter **strictement** :

- `pre` **finit par une espace** : `"Où a été "`, `"Où s'est "`.
- `verb` n'a **aucune espace** en début ni en fin : `"construit"`, `"déroulée"`.
- `post` **commence par une espace** : `" ce monument ?"`, `" cette bataille ?"`.

⚠️ Ne jamais « porter » l'espace par le verbe (`verb: "déroulées "`) : si le `post` n'a pas d'espace de
tête, les mots se collent au rendu (`"…se sont déroulées​ces conquêtes ?"`). L'invariant
`wherePrompt-verb-post-glue` / `whenPrompt-verb-post-glue` (**erreur bloquante**) attrape ce cas ;
`*-double-space` attrape l'excès inverse.

## Cohérence WHERE / placeKind

| `placeKind` | Verbe attendu (exemples) |
|---|---|
| `birth_place` | né, née |
| `death_place` | mort, morte, décédé |
| `battle_site` | déroulée, livrée |
| `construction_site` | construit, érigé, bâti, élevé, existé (pour intervalle d'usage prolongé) |
| `creation_place` | peint, sculpté, écrit, composé |
| `publication_place` | publié, paru |
| `signature_place` | signé, ratifié |
| `current_exhibition` | exposée, conservée |
| `discovery_site` | découvert, mis au jour |
| `landing_site` | débarqué, atterri |
| `diffusion_area` | diffusé, propagé |
| `origin_area` | apparu, originaire |
| `capital_or_power_center` | dirigée, gouvernée, régné (pour souverain/dynastie), étendu (pour empire) |
| `symbolic_location` | symbolisé, associé |

`placeLabel` doit refléter le `placeKind` choisi : « Louvre » pour une exposition, « Sainte-Hélène » pour une mort, « Reims » pour un sacre.

> **Outillé (warning)** : l'invariant `placeKind-verb-coherence` compare `wherePrompt.verb` à la famille
> attendue du `placeKind`. Les placeKind **stricts** (birth/death/battle/construction/creation/
> publication/signature/exhibition/discovery/landing) ont une famille fermée ; les placeKind **flous**
> (`symbolic_location`, `origin_area`, `diffusion_area`, `capital_or_power_center`, `other`) ne sont pas
> contraints (le verbe dépend trop du sujet : « couronné », « éclaté », « frappée », « fondée »…). Un
> warning **n'est pas un échec** : verbe légitime hors-liste (monnaie « frappée » en `creation_place`,
> massacre « commis » en `battle_site`) → on garde ; sinon, ajuster le verbe **ou** changer le
> `placeKind`. C'est l'agent `card-qa` qui tranche.

## Formules `whenPrompt`

Symétrique à `wherePrompt`, structure `pre + verb + post`. Le **verbe** est mis en évidence visuellement par l'app (même style accent que WHERE).

La structure dépend du `tag` temporel :

### Cartes `tag: "ponctuelle"` — la réponse attendue est une année

| Type de carte | Verbe typique | Pre | Post |
|---|---|---|---|
| Peinture (création) | `peint` / `peinte` | `Quand a été ` | ` ce tableau ?` |
| Sculpture | `sculpté` / `sculptée` | `Quand a été ` | ` cette statue ?` |
| Statuette (découverte) | `découverte` | `Quand a été ` | ` cette statuette ?` |
| Architecture | `construit` / `érigé` | `Quand a été ` | ` ce monument ?` |
| Bataille | `déroulée` / `livrée` | `Quand s'est ` | ` cette bataille ?` |
| Massacre / Génocide | `commis` / `perpétré` | `Quand a été ` | ` ce massacre ?` / ` ce génocide ?` |
| Traité | `signé` / `ratifié` | `Quand a été ` | ` ce traité ?` |
| Personnage (naissance) | `né` / `née` | `Quand est ` | ` ce personnage ?` (ou `cet empereur`, `ce philosophe`) |
| Invention (découverte) | `inventé` / `découvert` | `Quand a été ` | ` cette invention ?` |
| Texte | `écrit` / `publié` | `Quand a été ` | ` ce texte ?` (ou `ce code`, `ce traité`, `ce poème`) |
| Catastrophe | `survenue` / `frappée` | `Quand est ` | ` cette catastrophe ?` (ou `cette éruption`, `cette épidémie`) |
| Musique — œuvre | `composée` / `créée` | `Quand a été ` | ` cette symphonie ?` (ou `ce concerto`, `ce thème`, `cette œuvre`) |
| Musique — instrument | `inventé` / `conçu` | `Quand a été ` | ` cet instrument ?` |

### Cartes `tag: "periodique"` — la réponse attendue est une année dans la fenêtre élargie

La réponse attendue est **une seule année** (comme pour les cartes ponctuelles). La validation accepte toute année dans `[startYear - whenDelta, endYear + whenDelta]`. Le libellé *« Vers quelle période »* signale au joueur qu'une date approximative dans la fenêtre suffit.

**Critère de tagging** : utiliser `periodique` uniquement quand l'événement s'étend sur **plus de 10 ans**. En deçà, préférer `ponctuelle` avec un `pivotYear` emblématique, et garder la durée réelle dans `timeDisplayLabel` (ex. *« 1942-1943 »*).

| Type de carte | Verbe typique | Pre | Post |
|---|---|---|---|
| Phénomène / civilisation | `développé` / `développée` | `Vers quelle période s'est ` | ` ce phénomène ?` (ou `cette civilisation`) |
| Dynastie / époque | `étendue` / `régné` | `Vers quelle période s'est ` | ` cette dynastie ?` |
| Mouvement artistique | `développé` | `Vers quelle période s'est ` | ` ce mouvement ?` |
| Religion / doctrine | `propagée` / `prêchée` | `Vers quelle période s'est ` | ` cette religion ?` (ou `cette doctrine`) |
| Domestication / diffusion | `apparu` / `propagé` | `Vers quelle période s'est ` | ` ce phénomène ?` |
| Architecture longue (chantier multi-siècles) | `bâti` | `Vers quelle période a été ` | ` ce monument ?` (ou `ce temple`, `cette cathédrale`) |
| Empire / royaume | `étendu` | `Vers quelle période s'est ` | ` cet empire ?` (ou `ce royaume`) |
| Guerre longue / croisades | `menée` / `livrée` | `Vers quelle période a été ` | ` cette guerre ?` (ou `cette croisade`) |
| Musique — genre musical | `apparu` / `développé` | `Vers quelle période est ` | ` ce genre ?` (ou `cette musique`) |

Le verbe peut être identique à `wherePrompt.verb` quand l'événement est ponctuel et compatible avec une formulation temporelle (« déroulée », « peint », « signé »). Pour les `periodique`, préférer un verbe duratif (« étendue », « développé », « bâti », « menée »).

**Pertinence du substantif** : suivre la table « Précision lexicale par `canonical.type` » plus haut. **Aucun terme générique** (« ce site », « cet objet », « cette chose ») dans `wherePrompt.post` ni `whenPrompt.post` sauf cas archéologique non monumental.

**Cohérence whenPrompt.post = wherePrompt.post** : utiliser le **même substantif** dans les deux post. L'invariant `where-when-post-mismatch` flagge si différent.

## À éviter absolument

- **Spoiler la date-réponse WHEN dans le titre ou le blurb**. Le titre peut nommer l'objet (« La Joconde ») **et le lieu** (« Bataille de Marignan » — le lieu attendu en réponse WHERE reste autorisé dans le titre), mais ni le titre ni le blurb ne doivent contenir l'**année / la date** que le joueur doit deviner au quizz WHEN. **Politique « toujours renommer »** : si le nom usuel inclut une date (« Maracanazo (1950) », « Acte d'Union de 1707 »), choisis une forme sans date (« Maracanazo », « Acte d'Union anglo-écossais ») ; la date vit dans `timeDisplayLabel` et le `body`, affichés après résolution. Détection automatique : invariant **bloquant** `title-when-spoiler` (`npm run validate`).
- **Articles inutiles** : « Bataille de Marignan », pas « La bataille de Marignan ».
- **Anachronismes implicites** : « France » au IXᵉ siècle est trompeur — préfère « royaume des Francs » dans le `body` (et utilise quand même `countryCode: FR` dans le canonical pour faciliter le geocoding).
- **Eurocentrisme** : ne pas qualifier d'« orientales », « exotiques » ou « primitives » des civilisations non européennes.
- **Adjectifs émotionnels gratuits** : « célèbre », « légendaire », « incroyable » dans le body. Le joueur jugera lui-même.

## Anti-spoil dans le body

Le `body` est affiché **après** la résolution de la carte. Il peut donc révéler date et lieu, mais reste pédagogique : explique pourquoi cette carte est intéressante, son contexte, son impact. Pas de simple répétition de la fiche technique.

## `timeDisplayLabel` — format normalisé

Le `timeDisplayLabel` est affiché au joueur **sans contexte** (la question `whenPrompt` n'est lue qu'au moment du quizz). Le joueur doit donc comprendre ce que représente l'année ou la fourchette **rien qu'à la lecture du tdl**.

### Pour `tag: "ponctuelle"`

Format simple, pas de préfixe.

| Cas | Format | Exemple |
|---|---|---|
| Année connue | `"<année>"` | `"1066"`, `"1492"` |
| Année incertaine | `"vers <année>"` | `"vers 1503"`, `"vers 600"` |
| Fourchette serrée (ex-periodique ≤ 10 ans) | `"<a>-<b>"` | `"1914-1918"`, `"1519-1521"` |
| Année préhistorique | `"vers <nnn> av. J.-C."` | `"vers 25 000 av. J.-C."` |

### Pour `tag: "periodique"`

**Toujours préfixer par un label de type** pour lever l'ambiguïté.

| Cas (canonical.type / placeKind) | Préfixe | Exemple |
|---|---|---|
| Construction d'un monument (`archi` + `construction_site`) | `construction:` | `construction: 1211-1345` |
| Existence/usage d'un monument disparu | `existence:` | `existence: 280 av. J.-C. — 1480` |
| Règne d'un souverain / dynastie (`person`) | `règne:` | `règne: 1312-1337` |
| Extension d'un empire / royaume (`person`/`relig`/`explor` + `capital_or_power_center`) | `extension:` | `extension: VIIIᵉ-XIIIᵉ siècle` |
| Création d'œuvres en série (`paint`/`sculpt`) | `production:` | `production: 1400-1700` |
| Art rupestre / fresque (`paint` + `creation_place`) | `réalisation:` | `réalisation: 10 000-1 500 av. J.-C.` |
| Phénomène diffus / pandémie / effondrement (`cata`) | `phénomène:` | `phénomène: 800-950` |
| Voyage / expédition (`explor`) | `voyage:` | `voyage: 1271-1295` |
| Éditions répétées (jeux, conciles) (`sport` + `symbolic_location`) | `éditions:` | `éditions: 776 av. J.-C. — 393 ap. J.-C.` |
| Diffusion (religion, domestication) (`relig`/`invent` + `origin_area`) | `diffusion:` | `diffusion: 25 000-14 000 av. J.-C.` |
| Genre musical (`music` + `origin_area`) | `genre:` | `genre: 1890-1920` |

**Cohérence numérique** : les nombres lus dans le tdl doivent matcher `startYear`/`endYear` (tolérance ±50 ans). L'invariant `tdl-range-mismatch` flagge sinon (cf. Göbekli Tepe : start=-9300/end=-7500 ≠ tdl "9 600 à 8 200 av. J.-C." = à corriger).

## Monuments à usage prolongé : choisir un cadrage cohérent

Pour les `archi` dont l'usage s'étale sur plusieurs siècles voire millénaires (Stonehenge, Phare d'Alexandrie, Mausolée d'Halicarnasse, royaume de Méroé pour ses pyramides), deux cadrages cohérents existent — **ne jamais mélanger les deux** :

| Cadrage | `startYear` / `endYear` couvrent | `whenPrompt.verb` typique | `timeDisplayLabel` préfixe |
|---|---|---|---|
| **Construction** | Phase de chantier uniquement | `bâti`, `érigé`, `construit` | `construction:` |
| **Existence / usage** | Première date attestée à dernière date d'usage | `existé`, `dressé`, `tenu` | `existence:` |

⚠️ **Incohérence à éviter** : si l'intervalle est l'usage complet (ex. -280 à 1480 pour le Phare d'Alexandrie), le verbe doit être `existé`, pas `bâti`. Inversement, si le verbe est `bâti`, resserrer l'intervalle à la phase de chantier réelle (quelques années à quelques décennies).

> **Outillé (warning)** : l'invariant `archi-construction-vs-existence` flague un `archi` `periodique`
> dont l'intervalle dépasse 300 ans tout en étant cadré `construction:` + verbe de chantier
> (`bâti`/`construit`/`érigé`/`élevé`) — signe d'un mélange des deux cadrages.

## i18n future

Les textes vivent dans `display.locales.fr` aujourd'hui. `display.locales.en` est `null`. Quand on traduira :

- `placeLabel` peut changer entre langues (« Royaume-Uni » → « United Kingdom »).
- `wherePrompt` et `whenPrompt` changent complètement de structure (verbe placé différemment en anglais).
- Toujours partir du `canonical` (lat, lon, pivotYear, etc.), pas du fr, pour traduire vers une nouvelle locale.
