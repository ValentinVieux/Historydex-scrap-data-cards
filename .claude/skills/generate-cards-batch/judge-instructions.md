# Consignes du juge d'images HistoryDex

Le joueur voit l'image et le titre de la carte, puis devine OÙ et QUAND : ce sont les réponses `answerWhere` et `answerWhen`. L'image s'affiche en paysage au ratio 1,37 (800×584 px).

Le fichier judge-<plage>.json donne, pour chaque carte :
- le titre, le type et les réponses ;
- `sheet` : la planche contact, avec « #n largeur×hauteur » sur chaque vignette ;
- `dir` : les candidates en grand, dans `<dir>\<n>.jpg` ;
- la liste des candidates.

## Méthode, pour chaque carte

1. Regarde la planche avec l'outil Read.

2. Écarte toute candidate qui :
   - **trahit la réponse** : texte lisible donnant une date, une ville ou un pays (page de titre, légende, panneau, enseigne, affiche, une de journal), carte géographique, drapeau, ou monument ou paysage célèbre qui désigne le lieu-réponse. Les mots du titre sont déjà connus du joueur, ils ne trahissent rien ;
   - **montre une personne célèbre reconnaissable** quand ce n'est pas le sujet : savant, auteur, dirigeant, souverain. Si la carte porte sur cette personne, son portrait est permis ;
   - **n'est pas le sujet** : homonyme, objet sans rapport, icône, monument commémoratif moderne quand l'évènement lui-même est photographiable ;
   - est floue, minuscule, très abîmée, ou trop haute et étroite pour un cadre paysage ;
   - **montre des victimes** : cadavres, ossements, fosses, corps mutilés. C'est un jeu grand public, même pour un massacre ou un génocide. Préfère des troupes, une rue, une porte de ville, ou un mémorial sans texte daté.

3. Préfère, selon le type de carte :
   - **catastrophe** : des dégâts, des secours ou le phénomène ; une photo d'époque si elle existe ;
   - **empire ou civilisation** : un monument, un objet d'art ou une scène emblématique, sans carte ni drapeau ;
   - **traité ou conférence** : la scène de la négociation ou de la signature, avec les participants autour d'une table ; un portrait de groupe est accepté s'il s'agit des négociateurs (le sujet de la carte). Pas de document lisible daté.

   Un style qui trahit vaguement l'époque est acceptable.

4. Ouvre ta candidate en grand et donne la **boîte du sujet** en fractions de l'image (x, y du coin haut gauche, puis w et h, tout entre 0 et 1). Garde les marges et les légendes hors de la boîte. Attention : le script élargit la boîte de 15 % et garde au moins 800 px de large, donc un texte proche du bord peut revenir dans le cadre. Contrôle-le au dry-run.

5. Confiance :
   - `high` : pertinent, sans indice, de bonne qualité ;
   - `low` : un doute sur l'un de ces points ;
   - si rien n'est acceptable : `"pick": null`, avec dans `reasoning` une requête Commons **courte**, de 2 à 4 mots-clés anglais (« Hippocrates », « Masada Israel », « yurt Mongolia »). Une requête longue et précise renvoie souvent zéro fichier (constaté le 2026-11-21).

## Sortie

Écris `picks-<plage>.jsonl` dans `c:\projets\Historydex\scrap_historical_data\data\_images-candidates\` avec l'outil Write (jamais `node -e`), une ligne JSON par carte :

```
{"dexNum":"1147","pick":3,"box":{"x":0.1,"y":0.05,"w":0.7,"h":0.85},"confidence":"high","issues":[],"reasoning":"une phrase en français"}
```

Puis vérifie depuis `c:\projets\Historydex\scrap_historical_data` avec `npx tsx scripts/apply-image-picks.ts data/_images-candidates/picks-<plage>.jsonl`. C'est un dry-run : n'utilise jamais `--apply`.

## Rapport final

Une ligne par carte : « dexNum — #n — confiance — raison ». Termine par les cartes sans image acceptable, avec la requête proposée.
