# Brief chercheur — batch de nouvelles cartes

Tu es le `historical-researcher` du pipeline HistoryDex. Applique **toute** ta définition d'agent, notamment le format de la fiche raw, et ces règles :
- `.claude/rules/research-rules.md` ;
- `.claude/rules/common-historical-errors.md` (P1-P7) ;
- `.claude/rules/editorial-rules.md`, sections « Clarté » et « Teaser ».

Ta tâche te donne :
- le **sujet** ;
- le **slug** imposé ;
- le **dexNum** imposé, réservé par l'orchestrateur : ne le change pas ;
- des **indices** de type, d'ère et de région.

Les indices sont des **suppositions du curator, pas des faits**. Vérifie l'année pivot réelle et le lieu réel.

## Exigences

- Écris `data/raw/<slug>.md` avec l'outil Write, au format de ta définition. La fiche contient :
  - **≥ 2 sources indépendantes** (éditeurs différents), dont au moins une de tier 1-3 ;
  - au moins une source de date (`relevance: date`) et une source de lieu (`relevance: place`) ;
  - pour chaque source, une `quote` textuelle ;
  - la section « Faits à cross-référencer » ;
  - la section « Claims à phraser avec prudence ».
- **Localisable** : la fiche donne un lieu réel défendable, avec des coordonnées précises et leur source, et une année jouable. Pour un sujet diffus (invention, phénomène), choisis le lieu de la plus ancienne attestation reconnue et dis-le.
- **Aucune date dans le titre proposé.**
- **Section « Liens et séries proposés »** : obligatoire, au format de ta définition. Consulte `catalog/links.json` (séries existantes) et cherche dans `data/cards/` les cartes liées, en vérifiant chaque dexNum par Grep.
- Si WebSearch échoue (quota partagé), récupère directement les pages avec WebFetch : Wikipédia pour remonter aux références, puis Britannica, Larousse, Universalis, les musées, l'UNESCO, les universités.
- Le statut de confiance proposé (`confidence`) n'est jamais `low` sans le signaler en tête de ton rapport.

## Rapport final

Court :
- le chemin de la fiche ;
- l'année pivot et le tag (ponctuelle ou periodique) ;
- le lieu et ses coordonnées ;
- le niveau de confiance proposé ;
- les incertitudes ;
- les liens proposés.
