# HistoryDex – Récapitulatif complet

> **Slogan officiel** : *Collectionne l'Histoire*

---

## Concept général

Application mobile de jeu éducatif basée sur l'histoire, nommée **HistoryDex**. Elle combine un gameplay de placement spatio-temporel et un système de collection de cartes inspiré du Pokédex.

---

## Les Cartes

Chaque carte représente un événement, objet ou personnage historique. Elle possède un **type** affiché discrètement sur la carte (à la manière des types Pokémon).

### Types de cartes disponibles

- Peinture
- Sculpture
- Guerre / Bataille
- Invention
- Personnage historique
- Architecture
- Texte fondateur
- Catastrophe
- Exploration
- Religion & Mythologie
- Science & Médecine
- Traité & Politique
- Monnaie & Commerce
- Sport & Culture

---

## Partie JEU

### Principe de base

L'utilisateur reçoit **3 cartes** par partie et doit répondre à deux questions pour chaque carte :
- **WHERE** – Où cela s'est-il passé ?
- **WHEN** – Quand cela s'est-il passé ?

### Options avant de lancer une partie

- **Sélection des thèmes** : le joueur choisit les types de cartes qu'il souhaite explorer (ex : seulement Peinture + Architecture, ou tous les types, etc.)
- **Pool de cartes** : le joueur choisit entre :
  - Jouer uniquement avec de **nouvelles cartes** (non débloquées)
  - Pouvoir retomber sur des **cartes déjà rencontrées**

> Dans le pool "cartes déjà rencontrées", la probabilité de tirage est pondérée silencieusement par l'historique du joueur : ×3 pour les cartes ratées **3 fois ou plus**, ×0.5 pour les cartes maîtrisées 3 fois ou plus en Or fin. Cette logique de révision espacée est invisible côté joueur — le jeu reste un jeu, pas un outil de flashcards.

### Les 2 modes de jeu

| | Mode Explorateur | Mode Historien |
|---|---|---|
| **WHEN** | Placer les 3 cartes dans le bon ordre sur une frise où les 3 dates sont déjà affichées | Placer la date sur la frise chronologique avec un **delta de tolérance** propre à la carte |
| **WHERE** | Placer la carte dans la bonne **région historique** (parmi 10) | Placer un pin sur le globe avec un **rayon de tolérance** propre à la carte |

### Flow d'une partie

Quel que soit le mode choisi, une partie se déroule toujours dans le même ordre :

1. **Choix du mode** : Explorateur ou Historien
2. **Choix des thèmes et du pool de cartes** (cf. section *Options avant de lancer une partie*)
3. **Tirage des 3 cartes** selon les règles d'ère, de tag temporel et d'écart minimum (cf. *Tagging temporel*)
4. **Étape 1 — WHEN** : le joueur répond à la question temporelle pour les 3 cartes (mécanique selon le mode)
5. **Étape 2 — WHERE** : le joueur répond à la question géographique pour les 3 cartes (mécanique selon le mode)
6. **Écran de résultats** : révélation des bonnes réponses, score détaillé carte par carte, et animation de déblocage

> **Aucun feedback intermédiaire** n'est donné entre les étapes WHEN et WHERE. Cela préserve l'effet de révélation final et empêche le joueur de calibrer ses réponses WHERE en fonction des résultats WHEN.

### Mécanique WHEN

#### Segmentation en ères historiques

L'histoire couvre une amplitude temporelle énorme avec une densité d'événements très inégale (peu d'événements documentés en -2000, beaucoup en 1945). Une frise unique de la Préhistoire à aujourd'hui serait illisible. La frise est donc **segmentée en 5 ères**, chacune avec sa propre échelle interne :

| Ère | Bornes | Échelle interne |
|---|---|---|
| Préhistoire | avant -3000 | logarithmique (millions d'années → millénaires) |
| Antiquité | -3000 → 476 | par siècles |
| Moyen Âge | 476 → 1492 | par siècles |
| Époque moderne | 1492 → 1789 | par décennies |
| Époque contemporaine | 1789 → aujourd'hui | par décennies / années |

Une partie peut traverser **plusieurs ères**, mais elle est **limitée à 2 ères adjacentes** dans l'ordre chronologique (cf. règle 3 du tirage ci-dessous) afin d'éviter des écarts temporels trop disparates entre les 3 cartes. La frise par défaut affiche les 5 ères en bandes de **largeur égale** (sinon les ères modernes et contemporaines, plus courtes en années, deviendraient illisibles à l'écran).

#### Zoom intra-ère

Le joueur peut taper sur n'importe quelle ère pour zoomer dedans et placer une carte avec plus de précision (utile en mode Historien). Le zoom respecte les bornes de l'ère sélectionnée et utilise son échelle interne (logarithmique pour la Préhistoire, linéaire pour les autres).

#### Mécaniques de placement

- **Mode Explorateur** : les 3 dates sont déjà placées sur la frise, le joueur doit y associer les bonnes cartes
- **Mode Historien** : le joueur place chaque date librement, une zone de tolérance (delta) est visible et détermine la réussite

#### Delta de tolérance par carte (mode Historien)

Chaque carte stocke une date pivot et un **delta de tolérance personnalisé**. Le delta est rendu visuellement sur la frise au moment du placement. Trois niveaux types sont utilisés pour cohérence éditoriale :

- **Précis** (~5 ans) — événements bien datés (XXᵉ siècle, signatures de traités, dates documentées)
- **Décennal** (~25 ans) — événements à date approximative ou figures dont la période d'activité est connue
- **Séculaire** (~100 ans) — phénomènes diffus, événements de l'Antiquité ou du Moyen Âge périphérique

> **Cas particulier — Préhistoire** : l'échelle logarithmique de l'ère impose des deltas spécifiques (millénaires voire centaines de milliers d'années). Le delta reste défini par carte mais avec des valeurs adaptées à l'échelle.

Le delta devient un levier de difficulté éditorial carte par carte, en miroir du rayon de tolérance WHERE.

#### Tagging temporel des cartes & règles de tirage

Pour éviter toute ambiguïté lors du placement chronologique (notamment en mode Explorateur), chaque carte porte un **tag temporel** :

- **Ponctuelle** : associée à une **date précise** (ex : Révolution française – 1789, Sacre de Napoléon – 1804)
- **Périodique** : associée à un **intervalle / phénomène étalé** (ex : Révolution industrielle – fin XVIIIᵉ → XIXᵉ siècle, Renaissance – XIVᵉ → XVIᵉ siècle). Les cartes périodiques portent une **date pivot** (médiane de l'intervalle) qui sert au rattachement à une ère et au calcul des écarts.

**Règles de tirage intelligent** appliquées au moment de constituer une partie :

1. **Homogénéité du tag** : les 3 cartes tirées dans une même partie doivent partager le même tag (3 ponctuelles **ou** 3 périodiques). On ne mélange jamais les deux. C'est cette règle qui garantit la cohérence du placement : toutes les cartes d'une partie se placent de la même façon (un pin pour les ponctuelles, un bracket pour les périodiques).
2. **Écart minimum de 20 ans** entre les cartes tirées (sur la date pivot pour les ponctuelles, sur les bornes pour les périodiques). Ce seuil garantit un ordre chronologique non ambigu et reste ajustable si besoin pendant le playtest.
3. **Au plus 2 ères adjacentes** dans l'ordre chronologique `Préhistoire → Antiquité → Moyen Âge → Moderne → Contemporaine`. Les 3 cartes peuvent toutes appartenir à une même ère, ou se répartir sur 2 ères qui se touchent ; on ne mélange pas par exemple Antiquité + Moderne. Cette règle évite des sauts temporels qui rendraient l'énigme trop disparate. *Fallback* : si le sous-ensemble du catalogue qui respecte cette contrainte ne contient pas 3 cartes (filtres types/cartes nouvelles cumulés), la règle est relâchée pour ne pas bloquer la partie.

→ Ces règles combinées garantissent un placement chronologique non ambigu tout en gardant les 3 cartes dans un horizon temporel cohérent (≤ 2 ères adjacentes).

### Mécanique WHERE

#### Découpage par régions historiques (mode Explorateur)

Les "continents" sont trop grossiers et trop déséquilibrés pour le gameplay (la majorité des cartes seraient européennes). Le mode Explorateur utilise donc un découpage en **10 régions historiques** :

| # | Région | Périmètre |
|---|---|---|
| 1 | Europe occidentale | France, Îles britanniques, péninsule ibérique, Italie, Allemagne, Pays-Bas, Scandinavie |
| 2 | Europe orientale & Balkans | Pologne, Hongrie, pays baltes, Balkans, Grèce |
| 3 | Russie & Asie centrale | Russie, Caucase, steppes, routes de la soie, Iran historique |
| 4 | Proche-Orient & Méditerranée orientale | Levant, Anatolie, Mésopotamie, Égypte, péninsule arabique |
| 5 | Afrique (hors Égypte) | Maghreb, Sahel, Afrique de l'Ouest, Centrale, Est, Australe |
| 6 | Asie de l'Est | Chine, Japon, Corée, Vietnam, Mongolie |
| 7 | Asie du Sud | Inde, Pakistan, Bangladesh, Himalaya, Sri Lanka |
| 8 | Asie du Sud-Est & Pacifique | Indochine, Insulinde, Philippines, Polynésie, Australie |
| 9 | Amériques précolombiennes & latines | Mésoamérique, Andes, Amérique du Sud, Caraïbes |
| 10 | Amérique du Nord | USA, Canada (post-colonisation principalement) |

> Ce découpage s'inspire de la *Cambridge World History*, des aires culturelles d'Encyclopædia Universalis et des modèles ludiques de *Civilization VI* / *Humankind*. Tout choix d'aires culturelles est nécessairement politique : ce découpage sera documenté dans les crédits de l'app.

#### Placement libre avec rayon de tolérance (mode Historien)

En mode Historien, le joueur place un **pin** sur un globe interactif. Chaque carte stocke un point géographique précis et un **rayon de tolérance personnalisé** ; ce rayon est rendu visuellement autour du curseur du joueur lors du placement.

Trois niveaux types de rayon sont utilisés pour cohérence éditoriale :

- **Précis** (~300 km) — lieux ponctuels et bien identifiés (un monument, une ville)
- **Régional** (~800 km) — événements ou zones d'influence locales
- **Étendu** (~2000 km) — phénomènes diffus ou civilisations larges

Le rayon devient un levier de difficulté éditorial carte par carte.

**Résolution affichée à la fin de la partie** : la "bonne réponse" OÙ est présentée au joueur sous forme de **pays** (ex. *« Égypte »*, *« Royaume-Uni »*) — granularité plus fine que la région utilisée en mode Explorateur, en cohérence avec la promesse de précision du mode. Chaque carte porte donc, en plus de son point (lat, lon) et de son rayon, une étiquette `country` éditoriale figée en base. Le scoring lui-même reste basé sur la distance au point pivot et le rayon de tolérance, indépendamment de cette étiquette.

#### Pistes visuelles d'interaction

- **Globe interactif style cartoon** : sphère qui roule au doigt, ambiance ludique et immersive
- **Carte stylisée illustrée** type parchemin ancien, avec pins numérotés pour chaque carte
- **Zones qui s'allument au survol/sélection** : adapté particulièrement au mode Explorateur

#### Que situe-t-on ?

La nature du lieu à situer dépend de la carte (création, exposition, construction, événement, etc.). La règle est définie **au cas par cas selon ce qui est le plus logique pour la carte**, et est explicitée dans la consigne affichée au joueur.

**Le mot-clé est mis en évidence dans la phrase de consigne**, par exemple :
- *"Où a été **peinte** cette œuvre ?"*
- *"Où est **exposée** cette sculpture ?"*
- *"Où a été **construit** ce monument ?"*
- *"Où s'est **déroulée** cette bataille ?"*
- *"Où a été **signé** ce traité ?"*
- *"Où est **né** ce personnage ?"*

→ Cela évite d'imposer une règle rigide par type tout en gardant le joueur informé sans ambiguïté.

### Conditions de victoire

La condition de victoire est évaluée à la fin de la partie, une fois les deux étapes complétées.

**Règle commune aux deux modes** : maximum **1 erreur** sur les 6 réponses (≥ 5/6, WHERE et WHEN confondus).

Cette uniformisation rend la difficulté lisible : la différence entre modes se joue sur la **mécanique de placement** (région ou pin libre, ordre ou date libre), pas sur le seuil de victoire.

### Récompenses

Trois paliers de récompense selon le score, l'ornement de la victoire dépendant du **mode joué**.

- **Victoire (≥ 5/6)** : le joueur débloque les **3 cartes** de la partie avec l'ornement du mode (**Marbre** pour Explorateur, **Or fin** pour Historien).
- **Défaite honorable (3/6 ou 4/6)** : le joueur voit un écran de correction (les 3 cartes avec leurs bonnes réponses WHEN/WHERE révélées), puis choisit, sur ce même écran, **1 carte parmi les 3** à garder. Elle est débloquée avec **l'ornement du mode** (Marbre en Explorateur, Or fin en Historien) — l'ornement de la consolation suit celui du mode pour préserver la cohérence visuelle avec les cartes affichées.
- **Échec (≤ 2/6)** : le joueur voit le même écran de correction (valeur pédagogique conservée) mais **ne gagne aucune carte**. Les statistiques internes (compteur d'échecs par carte) sont mises à jour normalement.
- **Bonus enigma parfaite (6/6)** : en plus des 3 cartes débloquées, le joueur reçoit **+1 énigme offerte** dans son stock (sans dépasser le cap de 5). Ce bonus ne s'applique pas au Daily Challenge.

→ Cette mécanique récompense la performance par paliers : seul un score d'au moins 3/6 mérite une carte, et seule la victoire (5+/6) débloque les 3 cartes complètes. Le palier 0–2/6 garde la valeur d'apprentissage (correction visible) mais sans cadeau de participation. Le bonus *enigma parfaite* ajoute un palier d'aspiration sans pénaliser la victoire simple à 5/6.

### Streak

Le **streak** est le nombre de jours consécutifs avec au moins une victoire (Daily ou partie classique). Il est affiché sur l'écran de résultats en cas de victoire et sur le profil. Le streak se réinitialise à 0 après 24 h sans victoire.

---

## Daily Challenge

Une fois par jour, un **défi quotidien** est proposé : 3 cartes identiques pour tous les joueurs du monde, en mode Historien.

### Mécanique

- Mêmes cartes pour tous les joueurs sur une fenêtre de 24h
- Une seule tentative possible par jour
- Score sur 6 selon les règles classiques du mode Historien
- À la fin de la partie, un **bouton de partage** copie un résumé en emojis. Convention : 🟩 = réponse correcte, 🟥 = réponse incorrecte.

```
HistoryDex Daily 03/05/2026
Mode Historien · 5/6
WHEN  🟩🟩🟥
WHERE 🟩🟩🟩
historydex.app
```

### Pourquoi

Inspiré directement du mécanisme **Wordle** : aucune infrastructure backend lourde, mais effet viral fort. Le Daily transforme l'app d'un "j'ouvre quand j'y pense" en un rituel quotidien partageable. C'est le levier de rétention principal au lancement.

Les cartes du Daily comptent dans le Historydex selon les mêmes règles que les parties classiques.

---

## Modèle économique

### Modèle gratuit (free-to-play)

Le joueur dispose d'un **stock d'énigmes** :

- **Stock maximum** : 5 énigmes
- **Régénération** : 1 énigme toutes les 2 heures (jusqu'à atteindre le stock max)
- **Quand le stock est à 0** : un bouton **+3 énigmes** apparaît en surbrillance clignotante. Le joueur peut le cliquer pour visionner une publicité (rewarded ad) et regagner 3 énigmes.

Une partie consomme **1 énigme**, quel que soit le mode (Explorateur ou Historien).

> Le **Daily Challenge** ne consomme pas d'énigme — c'est une partie offerte à tous les joueurs chaque jour, indépendamment de leur stock.

### Abonnement premium — *Cabinet de Curiosités*

Pour **3 € / mois** ou **25 € / an** (économie ~30 %), avec un essai gratuit de 7 jours, le joueur accède à :

- **Énigmes illimitées** (plus de système de stock ni de pubs)
- **Statistiques détaillées** sur ses performances : taux de réussite par type de carte, par ère, par région, par mode, courbes de progression dans le temps, cartes les plus ratées / les mieux maîtrisées

Le nom *Cabinet de Curiosités* évoque les *Wunderkammer* de la Renaissance — les collections privées d'objets rares et précieux. Cohérent avec l'univers HistoryDex et naturellement traduisible en anglais (*Cabinet of Curiosities*) pour la phase 2.

---

## Partie HISTORYDEX

### Principe

Fonctionne comme un Pokédex : collection des cartes débloquées au fil des parties.

### Mécaniques

- Les cartes se débloquent à l'issue d'une partie selon le score : **3 cartes** en cas de victoire (≥ 5/6), **1 carte au choix** en cas de défaite honorable (3-4/6), **aucune carte** en cas de score trop faible (≤ 2/6)
- Chaque carte débloquée contient des **informations historiques détaillées**
- Le **niveau d'ornement** dépend du mode dans lequel la carte a été gagnée (Marbre / Or fin)
- Chaque carte affiche son **type** discrètement

### Fonctionnalités du Historydex

- **Filtres** : par type, par ère, par région, par niveau d'ornement
- **Barre de progression** : visualisation du nombre de cartes débloquées par catégorie (par type, par ère, etc.)

---

## Expérience utilisateur

- **Onboarding sur 3 cartes ultra-connues** : à la première ouverture, le joueur fait une partie tutoriel avec 3 cartes très familières (ex : *La Joconde*, *Révolution française – 1789*, *Chute du Mur de Berlin*) pour comprendre les mécaniques sans frustration. Cette partie est en mode Explorateur par défaut.
- **Écran de résultats détaillé** en fin de partie : score global, validation carte par carte, affichage des bonnes réponses pour la dimension pédagogique
- **Effet de révélation de carte animé** sur les cartes débloquées, façon ouverture de pack de cartes, pour valoriser le moment du déblocage (3 cartes en cas de victoire, 1 carte au choix en cas de défaite)

---

## Périmètre de lancement

- **Catalogue cible au lancement** : **500 cartes**, suffisant pour alimenter le pool "nouvelles cartes uniquement" sur plusieurs semaines / mois selon le rythme de jeu
- **Langues** :
  - **Phase 1 (lancement)** : français uniquement
  - **Phase 2** : ajout de l'anglais (traduction du contenu éditorial + adaptation des consignes WHERE)

---

## Roadmap post-MVP

Fonctionnalités identifiées comme valeur ajoutée mais reportées après le lancement initial :

- **Mode Classe / Famille** : code à 6 chiffres pour rejoindre un groupe privé, avec classement entre les membres uniquement. Angle pédagogique fort (profs d'histoire, familles).
- **Duel asynchrone** : deux joueurs reçoivent les mêmes 3 cartes, le second voit le score du premier après avoir joué (modèle *Words With Friends*).
- **Classement Daily hebdomadaire mondial** : leaderboard global pour les défis quotidiens, avec pseudo + score.
