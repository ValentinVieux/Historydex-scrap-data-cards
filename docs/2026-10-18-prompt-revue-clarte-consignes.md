# Revue de clarté des consignes OÙ / QUAND de tout le catalogue + durcissement des workflows

## Contexte

Un joueur a signalé la carte **774 « Cap de Bonne-Espérance »** : la consigne « Quand a été **doublé** ce cap ? » n'est pas comprise. « Doubler un cap » est du jargon de marin (= le contourner). Le même verbe figurait dans la consigne OÙ (« Où a été doublé ce cap ? », circulaire en plus), le blurb et le body. Pire : la traduction automatique Azure a rendu « doubler » au sens « multiplier par deux » dans **9 locales sur 11** (es *duplicar*, de *verdoppeln*, it *raddoppiare*, pl *podwoić*, tr *iki katına çıkarmak*, nl *verdubbelen*, ja 倍増, ko 두 배로).

La carte 774 est **déjà corrigée** (le 2026-10-18, dans `data/cards/bartolomeu-dias-cap-bonne-esperance.json`, `contentVersion` 3, note datée dans `editorial.notes`) :

- QUAND → `pre` « Quand a été », `verb` « franchi », `post` « ce cap pour la première fois ? » (validé par Valentin ; « pour la première fois » est indispensable : un cap se passe tous les jours, la réponse 1488 ne tient qu'au premier passage européen).
- OÙ → « Où se **trouve** ce cap ? ».
- blurb / body : « doubler » → « contourner ».
- 11 locales régénérées ; les lignes `{dexNum:"774", wherePrompt, whenPrompt}` dans `data/_translations/<loc>.whenwhere.jsonl` servent de **gabarit** pour le re-découpage par locale.

Ta mission : **généraliser** cette remise en cause à toutes les cartes, puis **modifier les workflows** pour que le défaut ne revienne pas.

## Ce que le joueur voit

Pendant l'énigme, le joueur ne voit que la **carte (image + titre)** et la **consigne** recomposée `pre + verb + post` (le `verb` est mis en évidence en couleur d'accent, cf. app `app/play/when.tsx`, `where.tsx`, `components/SessionCardZoomModal.tsx`). Le blurb et le body n'apparaissent qu'**après** la réponse. La consigne doit donc se comprendre **avec le seul titre**, par un joueur **non spécialiste** (ado ou adulte sans culture du domaine), dans la langue du joueur après traduction automatique.

## Échelle mesurée (2026-10-18, cartes `approved` + `reviewed`)

- 1481 cartes jouables (1045 approved, 436 reviewed).
- QUAND : **286 verbes distincts**, dont **180 utilisés ≤ 2 fois**. OÙ : 267 distincts, 162 rares.
- La queue de distribution est là où se cache le jargon : *doublé, décimalisée, élancé, séquencé, synthétisée, déferlé, sévi, culminé, aluni, aperçu, enluminé, impulsée, formalisé, codifiés, inoculé…* — et des **fautes** : *contruites, composes, atterrir, partait*.

## Critères de clarté (à appliquer à chaque consigne, OÙ et QUAND)

1. **Verbe compris sans culture du domaine.** Préférer le mot courant au terme technique (nautique, juridique, scientifique, artistique) : *contourné/franchi* plutôt que *doublé* ; *construit* plutôt que *élancé* ; *découvert/identifié* plutôt que *séquencé* quand c'est le sens ; *frappé* reste acceptable pour une monnaie (usage répandu), *paraphé* ne l'est pas. Le verbe « légitime et précis » des tables d'`editorial-rules.md` n'est pas un but en soi s'il n'est pas compris.
2. **L'événement daté/localisé est explicite.** La question doit dire *ce qui* est demandé quand il y a ambiguïté : première fois (« pour la première fois »), création vs découverte vs exposition, début vs fin, construction vs usage. Vérifier la cohérence avec `canonical.time.justification` / `pivotYear` / `placeKind` : la consigne doit poser exactement la question à laquelle `pivotYear` et `lat/lon` répondent.
3. **Phrase naturelle une fois recomposée**, référent clair (« ce cap », « cette bataille » = l'objet du titre), substantif spécifique (règles existantes), pas de circularité (« Où a été doublé ce cap ? » : au cap).
4. **Robuste à la traduction automatique** : un verbe FR polysémique (doubler, relever, lever, dresser, tenir, arrêter, élever, tirer…) est un risque de contresens dans 11 langues. Préférer le mot sans double sens ; sinon vérifier les traductions existantes du blurb/body de la carte.
5. **Invariants à conserver** (cf. `.claude/rules/validation-rules.md`) : lead-in « Quand… » (ponctuelle) / « Vers quelle période… » (periodique) ; espacement `pre`/`verb`/`post` ; `verb` sans espace ; `where-when-post-mismatch` est un **warning** — une exception motivée (comme 774 : même substantif, le QUAND porte en plus « pour la première fois ») se documente dans `editorial.notes` ; `placeKind-verb-coherence` arbitré par `card-qa` ; aucune date dans le titre.

Classer chaque consigne : **A** claire · **B** acceptable mais améliorable · **C** jargon / ambiguë / fautive → réécriture proposée.

## Méthode attendue

0. **Snapshot d'abord.** `data/cards/*.json` et `data/_translations/` sont **gitignorés** (aucun `git checkout` possible) : copier `data/cards/` (et `data/_translations/`) dans un dossier daté hors git avant toute écriture de masse.
1. **Extraction en lecture seule** : script `tsx` qui produit, pour chaque carte approved/reviewed, `{dexNum, slug, status, type, tag, placeKind, title, whereSentence, whenSentence, timeDisplayLabel, blurb}` + la fréquence des verbes (JSONL dans `reports/`). C'est l'input des relecteurs.
2. **Audit par lots** via sous-agents (≈ 100 cartes/agent, en parallèle, un seul passage ; une seconde lecture indépendante seulement sur les **C**). Sortie par carte : grade, raison en une ligne, proposition OÙ et QUAND sous forme `{pre, verb, post}` (changement **minimal**), mention si le même jargon est dans blurb/body, fautes repérées. Rappeler aux agents les critères ci-dessus et les invariants ; leur donner la carte 774 comme exemple avant/après.
3. **Rapport pour Valentin** (Markdown dans `reports/`, résumé en chat) : **C d'abord, groupés par verbe** (toutes les « doublé », toutes les « décimalisée »…) puis les B, avec la réécriture proposée en face. Valentin **valide lot par lot dans le chat** (il peut amender une formulation) ; **rien n'est appliqué sans sa validation**. Pas d'estimation de durée.
4. **Application** par script, carte par carte : champs FR (`wherePrompt`, `whenPrompt`, éventuellement blurb/body pour le même mot), `editorial.contentVersion += 1`, entrée **datée** dans `editorial.notes` (avant → après + motif), puis pour les cartes **approved** : `display.locales.<loc> = null` et suppression de `display.translationMeta.<loc>` pour les 11 locales. Les cartes **reviewed** ne se traduisent pas (elles le seront à l'approbation).
5. **Retraduction** (cartes approved uniquement) selon `.claude/skills/translate-cards-mt/SKILL.md`, avec les pièges suivants, constatés sur 774 :
   - `translate-cards-mt.ts` **saute** toute carte déjà présente dans `data/_translations/<loc>.jsonl` (« déjà staged ») → purger la ligne `"dexNum":"<n>"` de `<loc>.jsonl` **et** de `<loc>.whenwhere.jsonl` pour chaque carte modifiée, puis lancer scopé (`--min-dex`/`--max-dex`, ou ajouter un `--dex a,b,c`).
   - Re-découpage where/when par locale : sous-agent (ou toi) écrit les lignes `<loc>.whenwhere.jsonl` (11 locales × N cartes) — gabarit = lignes 774. Règles dures du skill (lead-ins, SOV tr/ja/ko, `？` et sans espace en ja, `¿…?` en es, verbe non vide).
   - `merge-translations.ts <loc> --apply` **réécrit toutes les cartes du staging** (≈ 1045 fichiers) et **re-stampe le hash FR courant** sur chacune : à **scoper** (voir « Workflows » ci-dessous) **avant** la passe de masse, sinon tout FR édité entre temps serait blanchi.
   - Quota Azure F0 = 2 M caractères/mois : estimer avant (≈ 1,5 k car. de prose × 11 locales ≈ 17 k car./carte → ~110 cartes = quota) ; au-delà, passer la ressource en S1 le temps du rattrapage (cf. skill) ou étaler.
6. **Validation + push** : `npm run validate` → 0 erreur (l'invariant `translation-stale` bloque tant qu'une locale n'est pas régénérée) ; `npm run push:db -- --dry-run` → montrer le delta ; **push réel seulement après accord explicite de Valentin dans le chat** (écriture en prod InstantDB, les joueurs voient le changement immédiatement). Lancer la commande nue, sans pipe ni redirection.

## Workflows à modifier (la partie durable)

- `.claude/rules/editorial-rules.md` : nouvelle section « **Clarté pour un joueur non spécialiste** » — les 5 critères ci-dessus, la règle « la consigne se comprend avec le seul titre », l'obligation d'expliciter une première fois, et une **table jargon → remplacement** issue de l'audit (verbes proscrits + verbes polysémiques à éviter pour la MT). Revoir la colonne « Verbes typiques » des tables par `type` / `placeKind` à l'aune de ces critères.
- `.claude/agents/card-editor.md` et `.claude/agents/card-qa.md` : items de checklist correspondants (verbe compris par un non-spécialiste, événement explicite, polysémie MT).
- `scripts/_lib/invariants.ts` + `.claude/rules/validation-rules.md` : warning `prompt-verb-jargon` (denylist alimentée par l'audit, normalisation comme `normVerb`) ; signaler aussi dans le rapport `validate` les verbes **rares** (≤ 2 cartes) pour relecture `card-qa`. Pas d'allowlist fermée (trop rigide), une denylist suffit.
- `scripts/translate-cards-mt.ts` et `scripts/merge-translations.ts` : option `--dex <liste>` (ou équivalent) pour ne traiter que des cartes données ; le merge scopé ne doit réécrire que ces cartes. Documenter dans le skill `translate-cards-mt` la procédure **« FR modifié après traduction »** (aujourd'hui marquée « non géré »).
- `scripts/audit-translations.ts` : 3ᵉ détecteur « verbes polysémiques » (FR → rendus fautifs par locale, ex. doubler → duplicar/verdoppeln/raddoppiare/podwoić/verdubbelen/倍増/두 배), table à enrichir au fil des trouvailles.
- `CLAUDE.md` du pipeline : une ligne dans l'étape 3 du workflow (clarté) et un renvoi vers la procédure de retraduction.
- Facultatif, à proposer sans l'imposer : afficher les deux consignes recomposées en tête du panneau texte de l'app de review (`scripts/review-app/app.js`).

## Garde-fous

- Le dépôt a du **travail non commité** (11 fichiers modifiés + 3 non suivis : provenance des traductions `translation-hash.ts`, `audit-translations.ts`, `backfill-translation-hash.ts`, app de review, invariants). Ne rien annuler ni réécrire ; demander à Valentin s'il faut le committer d'abord ; committer **uniquement tes hunks**, par chemin.
- Travail sur une branche depuis `main` → PR (comme la PR #4 « langues-6 »). Messages de commit en français conventionnel.
- Les JSON de cartes ne sont pas versionnés : le snapshot de l'étape 0 est la seule marche arrière.
- Chemin MT par défaut ; pas de skill LLM `translate-cards` sur la masse (coût).
- Répondre en français ; valider avec Valentin **avant** d'appliquer et **avant** de pousser ; dire ce qui n'a pas été vérifié.

## Références

- Carte exemple : `data/cards/bartolomeu-dias-cap-bonne-esperance.json` (note datée du 2026-10-18 dans `editorial.notes`).
- Règles : `.claude/rules/editorial-rules.md` (formules OÙ/QUAND, espacement, placeKind), `.claude/rules/validation-rules.md` (invariants), `.claude/agents/card-editor.md`, `.claude/agents/card-qa.md`.
- Traduction : `.claude/skills/translate-cards-mt/SKILL.md`, `scripts/translate-cards-mt.ts`, `scripts/merge-translations.ts`, `scripts/_lib/card-translations.ts` (`WHEN_LEAD_INS`, `validateTranslatedLocale`), `scripts/_lib/translation-hash.ts`.
- Push : `scripts/push-db.ts` (`--dry-run`, `--max-dex`, gate traduction).
- Rendu côté app (lecture seule, repo voisin `../app/historydex`) : `lib/store/gameSession.ts` (`getWhenPrompt`, concaténation `pre + verb + post`), `app/play/when.tsx`, `app/play/where.tsx`.
