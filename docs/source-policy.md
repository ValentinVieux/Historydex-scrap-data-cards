# Source Policy — HistoryDex

Politique externe lisible par toute personne qui souhaite contribuer au catalogue, ou qui veut comprendre comment les cartes sont sourcées.

## Pourquoi sourcer

Une carte HistoryDex annonce une date et un lieu **comme bonne réponse** à un quizz. Si la donnée est fausse ou imprécise, le joueur est trompé et le score injuste. La traçabilité est donc une exigence de qualité produit, pas seulement académique.

## Hiérarchie utilisée

Par ordre décroissant de fiabilité :

1. **Institutions patrimoniales** : musées (Louvre, Met, British Museum…), bibliothèques nationales, archives nationales, UNESCO World Heritage Centre.
2. **Universités et ressources académiques** : presses universitaires, Cairn, Persée, OpenEdition, JSTOR (URLs publiques).
3. **Encyclopédies reconnues** : Britannica, Larousse, Universalis, Stanford Encyclopedia of Philosophy, Oxford Reference.
4. **Sites officiels** : monuments, institutions, États, fondations.
5. **Bases ouvertes structurées** : Wikidata, GeoNames, OpenStreetMap (vérification de coordonnées et codes ISO).
6. **Wikipedia** uniquement comme **point de départ** ; jamais comme source finale unique.

## Exigences pour qu'une carte devienne `approved`

- **≥ 2 sources indépendantes** (deux pages d'un même éditeur = 1 source).
- **≥ 1 source `relevance: "date"`** justifiant la date pivot.
- **≥ 1 source `relevance: "place"`** justifiant le lieu.
- **Confidence ≠ `low`**.

Une carte qui n'atteint pas ces seuils reste en `reviewed` ou `draft`, pas exportée.

## Format d'une source dans la base

```json
{
  "title": "...",
  "url": "https://...",
  "publisher": "Nom institutionnel",
  "author": "Auteur si nommé, sinon null",
  "accessedAt": "YYYY-MM-DD",
  "relevance": "date | place | fact | context | image | general",
  "quote": "Extrait textuel court (≤ 800 chars) qui justifie le fait."
}
```

`quote` est crucial : pas de paraphrase. C'est la phrase qui prouve le fait. Si la phrase n'existe pas explicitement dans la source, la source ne sert pas à démontrer ce fait.

## Désaccord entre sources

Quand deux sources fiables se contredisent :

1. Les **deux** sont conservées dans la fiche, avec leurs quotes respectives.
2. La valeur retenue pour le canon historique privilégie la source la plus académique / institutionnelle.
3. Un `editorial.warnings` explicite le désaccord et la décision.
4. Le `confidence` baisse à `medium` ou `low`.

## Interdits

- **Paywalls contournés**. Si l'accès est payant, on cite la source comme référence (avec un extrait éventuellement issu d'un résumé public) ou on cherche une source équivalente.
- **Robots.txt ignorés**. Si un site interdit l'indexation, on n'y prend rien.
- **Sources non citables** : blogs personnels, agrégateurs sans rigueur, contenu généré par IA non corrigé, forums, réseaux sociaux.
- **Sources mono-éditeur** comme seule preuve. Toujours croiser.
