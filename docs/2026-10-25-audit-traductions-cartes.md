# Audit des traductions des cartes — 2026-10-25

Demandé par Valentin après la correction des titres. Lecture seule : aucune correction écrite en base.

## Méthode

- Extraction de tout le texte des cartes depuis la base de prod : `cardTranslations`, 11 langues × 1 045 cartes. Le texte FR source vient de la table `cards`.
- Relecture par 6 agents, un par groupe de langues (en/nl, es/it, de/pl, pt/pt-PT, tr, ja/ko), sur **60 cartes** tirées à intervalle régulier dans le catalogue.
  - Champs relus : `blurb`, `teaser`, `body`, `placeLabel`, `timeDisplayLabel` et les consignes OÙ/QUAND, chacun comparé au FR.
  - Catégories : contresens, fait altéré, nom propre, non traduit, grammaire, consigne, indice dans le teaser, incohérence avec le titre, style.
  - Gravité *majeure* : le joueur apprend une chose fausse, ne comprend pas, ou le texte est visiblement cassé.
- Résultats bruts dans `../app/historydex/.superpowers/tmp/content-audit/result-*.json` (gitignoré).
- Avant cela, audit des titres : 1 349 titres faux sur environ 11 500, tous corrigés en base le 25/10.

## Résultats

Part des cartes ayant au moins une erreur majeure (sur 60) :

| en | nl | es | it | de | pl | pt | pt-PT | tr | ja | ko |
|---|---|---|---|---|---|---|---|---|---|---|
| 15 % | 37 % | 38 % | 40 % | 40 % | 43 % | 27 % | 23 % | 50 % | 35 % | 43 % |

- **Environ 35 % des couples carte × langue** ont au moins une erreur majeure. Extrapolé au catalogue, cela fait environ 4 000 lignes `cardTranslations` sur 11 495.
- **47 cartes sur 60** (78 %) ont une erreur majeure dans au moins une langue.
- Erreurs majeures par catégorie : 177 contresens, 47 faits altérés, 35 noms propres, 24 grammaire, 13 non traduits, 5 incohérences avec le titre.
- Erreurs majeures par champ : 151 dans le body, 64 dans le blurb, 52 dans le teaser, 32 dans le placeLabel.
- **Les champs produits par LLM sont quasi propres.**
  - Consignes OÙ/QUAND : sans défaut, sauf en coréen. Sur 17 des 60 cartes, la consigne coréenne utilise 어디에 au lieu de 어디에서.
  - Aucun teaser n'ajoute d'indice de lieu ou de date.
  - L'anglais des anciennes cartes, traduit par LLM côté app, est la langue la plus propre.
  - **Toutes les erreurs graves viennent de la prose traduite par Azure.**

## Motifs

1. **Pivot par l'anglais.**
   - Les mêmes erreurs apparaissent dans 5 à 10 langues : « Portes est en bronze » donne « Doors is… », « Praça Onze » donne « Praça Eleven », « fors l'honneur » donne « for honour ».
   - Des mots anglais restent dans le texte : « This is not a pipe », « East India Company » au lieu de VOC.
2. **Homonymes français.**
   - « alliances » (pactes) → « bagues de mariage »
   - « chantier » → « chantier naval »
   - « épis » → « oreilles »
   - « sociétés » → « entreprises »
   - « perles » → « perles fines »
   - « sous-sol » → « cave »
   - « bal » → « miel » (tr)
   - « luth » → mot vulgaire (tr)
3. **Lieux affichés traduits comme des mots courants.** C'est le `placeLabel`, montré au reveal comme réponse.
   - « Worms » devient « vers de terre » en es, it, de, pl, pt-PT, tr et ko.
   - « Spire » devient « flèche » ou « tour ».
   - « Oyo-Ile » devient « île d'Oyo ».
   - « Kyoto » devient « Protocole de Kyoto » (ja).
   - En anglais, 16 `placeLabel` sur 60 sont restés en français.
4. **Nombres et abréviations cassés.**
   - L'espace des milliers coupe les nombres : « 25 000 » devient « 25人、000人 ».
   - « 14C » devient « XIVᵉ siècle ».
   - « cal. BP » devient « calories » ou « tension artérielle ».
   - Un point après « av. J.-C. » ou « cal. » est pris pour une fin de phrase.
   - Rwanda : « 800 000 000 » morts (pl).
   - Tian'anmen : « au moins 10 000 morts » devient « minimise le bilan » (tr, pt-PT).
5. **Débuts de phrase supprimés**, avec la date ou la mesure qu'ils portaient (« Haute de 31,1 cm », « Mis au jour en 1908 à Phaistos »).
6. **Traductions faites sur un FR antérieur** (104, 531, 533, 534, 539, 549). Ce sont des lignes poussées avant le hash de provenance.
7. **Noms propres d'Asie** : les formes établies ne sont pas reprises (訓民正音解例本, 仙人洞, 五銖銭). La transcription varie entre le titre, le body et le lieu.

## Points hors traduction relevés

- **Source FR fautive.**
  - Carte 923 : le blurb commence par « Portes est en bronze doré » (sens voulu : « Porte est »).
  - Carte 531 : le blurb dit « sédentaires », le body dit « encore mobiles ».
- **Deux titres coréens encore faux** malgré la correction : 633 « 교황 칙서 인테르 케테라 » pour Klezmer, 668 « 보름스 식단 » (« régime alimentaire ») pour la Diète de Worms.
- **5 pièges que `audit-translations` détectait déjà sont toujours en base** (529 Mỹ Sơn → « Mio Figlio »/« Mi Hijo »/« Meu Filho », « scaevismo », 549 « dem Lied »). Le script existait, mais personne ne le lançait.
- **Côté app** : `ERA_SUFFIX` (`lib/catalog/timeDisplay.ts`) ne reconnaît pas les sigles turcs MÖ/MS. Les plages de dates turques n'ont donc jamais la flèche.

## Décision pour le pipeline

L'étape 2 de `translate-cards-mt` devient une **relecture obligatoire** :

- le titre est traduit par l'agent ;
- l'agent fournit des `fixes` sur la prose ;
- le merge refuse une carte sans titre relu (`scripts/_lib/translation-review.ts`).

Les pièges de cet audit sont ajoutés à `TRAPS` dans `audit-translations.ts`. Voir le compte rendu fait à Valentin pour le choix agents ou Azure et pour la reprise du catalogue existant.
