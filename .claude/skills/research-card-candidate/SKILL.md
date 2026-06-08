---
name: research-card-candidate
description: Use when the user proposes a subject (event, work, person, invention) for a HistoryDex card and wants a sourced raw fact sheet. Orchestrates historical-researcher + source-verifier and writes data/raw/<slug>.md.
---

# Research Card Candidate

L'utilisateur te donne un sujet ; tu produis une fiche brute sourcée prête à être normalisée.

## Étapes

0. **OBLIGATOIRE — Check anti-doublon** : avant toute recherche, lance :
   ```bash
   npm run check-subject -- "<sujet>"
   ```
   - Si un match avec score ≥ **0.9** apparaît (`DOUBLON QUASI-CERTAIN`) : **ne PAS continuer**. Présente le match à l'utilisateur et propose : (a) abandonner, (b) enrichir la carte existante, (c) créer une variante avec un slug clairement distinct (et confirmation utilisateur).
   - Si un match avec score 0.6-0.9 apparaît (`PROBABLE`) : présente les matches, demande confirmation explicite avant de continuer.
   - Si tous les matches sont < 0.6 : continue.

1. **Demander précision si nécessaire** : si le sujet est ambigu (« Napoléon » → Napoléon Iᵉʳ ou III ?), demande une seule clarification.

2. **Lancer le `historical-researcher`** (subagent) avec le sujet précis. Il produira `data/raw/<slug>.md` selon le format défini dans [.claude/agents/historical-researcher.md](../../agents/historical-researcher.md).

3. **Lancer le `source-verifier`** (subagent) sur le fichier produit. Il enrichira la fiche avec une section « Vérification » et un `confidence` proposé.

4. **Lire le résultat final** et présenter à l'utilisateur :
   - Slug proposé
   - Type de carte
   - Date pivot et tag (ponctuelle / périodique)
   - Lieu et région
   - Niveau de confiance proposé
   - Désaccords ou incertitudes notables
   - Chemin du fichier `data/raw/<slug>.md`

5. **Proposer la suite** : « Veux-tu que je passe au skill `normalize-card-data` pour transformer cette fiche en carte normalisée ? »

## Quand ne pas utiliser ce skill

- Si l'utilisateur a déjà une fiche raw en main (cas import depuis ailleurs) → utilise directement `normalize-card-data`.
- Si le sujet est trop vague pour produire une carte (ex : « le Moyen Âge ») → demande de restreindre à un événement, une œuvre, ou un personnage spécifique.

## Garanties à respecter

Avant de rendre la main, **vérifie** que la fiche raw contient :
- au moins 2 sources indépendantes
- au moins 1 source `relevance: "date"`
- au moins 1 source `relevance: "place"`
- des `quote` non vides pour chaque source
- un `pivotYear` justifié

Si manquant → repasser au `historical-researcher` pour compléter, ne pas livrer une fiche incomplète.
