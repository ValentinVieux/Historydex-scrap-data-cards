# Editorial Guidelines — HistoryDex

Guide de relecture pour les humains qui valident une carte avant promotion à `approved`.

## Test du collégien (sélection des sujets)

**Avant** d'ouvrir une carte (donc avant même la recherche), demande-toi :

> *« Un manuel d'histoire de collège, ou un quiz culturel généraliste type "Questions pour un champion", mentionnerait-il ce sujet ? »*

Si la réponse est « non », c'est probablement trop niche pour le catalogue de **lancement**. C'est une heuristique, pas un interdit absolu :

- ✅ **Bons sujets pour le lancement** : Joconde, Révolution française, Pyramides de Gizeh, Mur de Berlin, Hiroshima, Trafalgar, Cléopâtre, 1492, Bouddha, Confucius, Toutânkhamon, Renaissance, Première Guerre mondiale, Apollo 11, Indépendance des États-Unis, Cathédrale Notre-Dame de Paris, Machu Picchu, Cité interdite…
- ⚠️ **Sujets à différer** : Bataille de Tolbiac (496), Édit de Saint-Germain (1562), Wencelas IV de Bohême, Tactiques d'Épaminondas à Leuctres, Héliogabale… intéressants mais nécessitent un public déjà passionné.

C'est une question d'**ordre de production**, pas d'exclusion : ces sujets viendront plus tard quand le catalogue de base sera large.

## Stratégie en cercles concentriques

Pour un catalogue cible de 1500 cartes, produire dans cet ordre :

| Cercle | Cartes | Profil sujet | Exemples |
|---|---|---|---|
| 1 | 1-200 | Tout francophone scolarisé reconnaît | Joconde, 1789, Pyramides, Apollo 11 |
| 2 | 201-500 | Enseigné dans les manuels collège/lycée | Charlemagne, Saint Louis, Lépante, Versailles |
| 3 | 501-1000 | Connu des amateurs d'histoire | Édit de Nantes, Spoutnik, Tarquin le Superbe |
| 4 | 1001-1500 | Pour passionnés / explorateurs assidus | Tolbiac, Concile de Trente, Tang Taizong |

Bénéfices :
- Le **mode Explorateur** (onboarding) tombe naturellement sur des cartes du cercle 1.
- Le **mode Historien** (joueurs avancés) débloque progressivement les cercles 2-4.
- Les **statistiques** de réussite diront aussi quelles cartes sont trop niches même dans leur cercle.

Le pipeline ne stocke pas explicitement le numéro de cercle (pas de champ `circle` dans le schéma) — la stratégie se matérialise dans **l'ordre de production** et l'allocation des `dexNum`. Tu peux noter le cercle visé dans `data/candidates/<batch>.md`.

## Avant de promouvoir une carte

## Avant de promouvoir une carte

Lis le JSON `data/normalized/<slug>.json` et vérifie :

### Vérité historique
- [ ] Le `pivotYear` est défendable. Pour une période longue, il y a une `justification` claire dans `canonical.time.justification`.
- [ ] Les coordonnées (`lat`, `lon`) pointent bien là où la carte le dit.
- [ ] La `region` ∈ [1..10] est cohérente avec le lieu géographique réel.
- [ ] Les sources `quote` justifient effectivement le fait (pas de paraphrase, pas de citation hors contexte).

### Cohérence éditoriale
- [ ] `placeKind` correspond au verbe utilisé dans `wherePrompt.verb` (cf. table dans [.claude/rules/editorial-rules.md](../.claude/rules/editorial-rules.md)).
- [ ] `placeLabel` est lisible pour un joueur non spécialiste — pas un nom interne de base.
- [ ] Le titre ne révèle pas la réponse au quizz (date ou lieu attendus).
- [ ] Le blurb ne révèle pas non plus la réponse.
- [ ] Le body apporte un contexte ou une retombée — pas une simple répétition de la fiche technique.

### Ton et neutralité
- [ ] Pas d'adjectifs émotionnels gratuits (« célèbre », « légendaire », « incroyable »).
- [ ] Pas d'eurocentrisme implicite (« exotique », « primitif », « oriental » pour qualifier des cultures non européennes).
- [ ] Pas d'anachronismes implicites (« France » au IXᵉ siècle → « royaume des Francs »).
- [ ] Pas de jugement moral.

### Cohérence gameplay
- [ ] `whenDelta` dans les paliers (5/25/100/500/1000/5000) ou justifié dans `gameplay.balanceNotes`.
- [ ] `whereRadiusKm` dans l'échelle (200/500/600/800/1000/1200/1500/2000/3000) et cohérent avec le `placeKind` (lieu précis ≈ 500-800, zone diffuse ≈ 2000), ou justifié via `difficultyWhere: "special"` + `balanceNotes`.
- [ ] `era` cohérente avec `pivotYear` (sinon `editorial.notes` justifie).
- [ ] Si `tag=periodique`, `startYear` et `endYear` sont cohérents (start ≤ pivot ≤ end).

### Sources
- [ ] ≥ 2 sources indépendantes.
- [ ] ≥ 1 source `relevance: date`.
- [ ] ≥ 1 source `relevance: place`.
- [ ] Toutes les `quote` sont non vides.
- [ ] `accessedAt` au format `YYYY-MM-DD`.
- [ ] Aucune source mono-éditeur ou wikipedia-only.

### Confidence
- [ ] `confidence ≠ low` pour passer en `approved`.
- [ ] Si `confidence: medium`, des warnings sont documentés.

## Rejet d'une carte

Si la carte ne passe pas la relecture :
- Laisse-la en `data/normalized/` avec un commentaire dans `editorial.notes` (« Rejeté en relecture humaine YYYY-MM-DD : raison »).
- Bascule éventuellement le statut à `draft` pour la sortir de la file de relecture.
- Si la qualité ne peut pas être atteinte (sujet mal documenté), bascule en `archived`.

## Propagation d'un correctif

Si tu modifies une carte déjà `approved` :
- `editorial.contentVersion` est auto-bumpé par chaque save dans l'app de review.
- Note la modification dans `editorial.notes` (« vN : YYYY-MM-DD : raison »).
- Re-lance `npm run validate` puis `npm run push:db` (ou bouton « Push to DB » dans l'app) — le diff vs DB détecte automatiquement la version supérieure et pousse uniquement les cartes modifiées.

## Anti-patterns observés

- Mettre la même source deux fois (deux pages du même musée) pour atteindre le minimum de 2.
- Choisir le `pivotYear` au début d'une période sans justification (préférer le milieu de période ou un pivot emblématique).
- Mettre `country` au lieu d'une zone historique pour des cartes antiques (« Italie » pour 100 av. J.-C. → préférer `placeLabel: "Empire romain"` même si `countryCode: IT`).
- Recopier le `body` du `blurb` — perte d'occasion de contextualiser.
