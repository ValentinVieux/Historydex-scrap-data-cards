---
name: translate-cards-mt
description: Auto-translate HistoryDex cards into every target locale (every targetLocales() locale — en/es/de/it/pt/pt-PT/pl/tr/nl/ja/ko, English included) via the cheap Azure-hybrid pipeline (Azure prose + LLM where/when re-split), filling display.locales.<loc> so push:db emits the cardTranslations. Idempotent — only cards still missing a locale. Run as the step BEFORE push:db so newly-approved cards ship multilingual. This is the DEFAULT path for ALL target locales including en; translate-cards (LLM) is the higher-quality opt-in alternative. Use when asked to translate cards cheaply / before pushing.
---

# translate-cards-mt

Traduction **éco** des cartes (**en**/es/de/it/pt/pt-PT/pl/tr/nl/ja/ko — **toutes** les `targetLocales()`, anglais compris) — le chemin
**par défaut** pour toute locale cible. L'alternative à la skill LLM `translate-cards`
(traducteur+relecteur Opus), réservée désormais aux cas où l'on veut la garde qualité ≥90.
Moteur **Azure AI Translator** (F0 gratuit, 2M car/mois) pour la **prose**, + un **sous-agent LLM** pour les 6 champs
structurés where/when (re-découpage selon l'ordre des mots cible + invariant lead-in
que la MT ne sait pas faire) **et la relecture obligatoire du titre et de la prose**. Gardes :
relecture (`_lib/translation-review.ts`), `validateTranslatedLocale` (déterministe), `audit-translations`.

> **Anglais (`en`)** : `en` fait partie de `targetLocales()` (cf. `supported-locales.json` : `en` n'est pas
> `source`) et le script l'accepte (`AZURE_TO.en`, `WHEN_LEAD_INS.en`). fr→en est la paire la plus solide
> d'Azure. C'est donc **ici** qu'on traduit `en` par défaut, comme les autres ; `translate-cards` (LLM)
> reste l'option haut de gamme si l'on veut une relecture sémantique notée.

**Quand** : étape **avant `push:db`**. On ne traduit que les cartes `approved`
(FR finalisé après revue humaine → zéro traduction périmée) **encore non traduites**
(`display.locales.<loc>` null). Idempotent : re-run = no-op si tout est traduit.

> ⚠️ **Qualité Azure seule = insuffisante** (audit du 2026-10-25, `docs/2026-10-25-audit-traductions-cartes.md`) :
> ~12 % de titres faux et **~35 % des cartes × langue avec au moins une erreur majeure** dans la prose
> (contresens d'homonymes, lieux affichés traduits comme des mots — Worms → « vers de terre » —, nombres
> cassés par l'espace des milliers, « cal. BP » → « calories », pivot visible par l'anglais). Les champs
> produits par LLM (consignes) étaient, eux, quasi propres. D'où la **relecture LLM obligatoire** de
> l'étape 2 : le merge refuse une carte sans titre relu.

## Pré-requis
- `.env` : `AZURE_TRANSLATOR_KEY` (+ `AZURE_TRANSLATOR_REGION` si ressource régionale, ex. `francecentral`).
- Locales cibles = `targetLocales()` (`scripts/_lib/card-translations.ts`, lit `../app/historydex/lib/i18n/supported-locales.json` — **source unique**). Aujourd'hui : **en, es, de, it, pt, pt-PT, pl, tr, nl, ja, ko** (`en` inclus). S'étend automatiquement : ajouter une locale à `supported-locales.json` + son lead-in à `WHEN_LEAD_INS` suffit pour que cette skill la prenne en compte.

## Procédure (pour CHAQUE locale de `targetLocales()` — en, es, de, it, pt, pt-PT, pl, tr, nl, ja, ko)

### 1. Staging
```bash
npx tsx scripts/translate-cards-mt.ts <loc> --no-mt --apply   # DÉFAUT (2026-10-25) : sans Azure
```
**Par défaut, plus d'Azure** (décision Valentin 2026-10-25, après l'audit) : `--no-mt` écrit le staging avec une prose **vide** ; l'agent de l'étape 2 traduit **tout** depuis le FR (`title` + `fixes` pour chaque champ de prose présent en FR). Un champ oublié reste vide → rejeté au merge (`empty/missing`), un teaser oublié → `teaser-translation-stale` au validate. Sans `--no-mt` (grosse passe d'une nouvelle langue, quand le volume dépasse ce que les agents peuvent tenir), le script traduit les champs de prose (title, blurb, **teaser** s'il existe, body, placeLabel, timeDisplayLabel) des
cartes `approved` non traduites → `data/_translations/<loc>.jsonl` (chaque ligne porte
aussi `frWhere`/`frWhen`/`tag` pour l'étape 2). Backoff 429 + reprise incrémentale.
S'il affiche « Rien à faire », il n'y a rien à traduire pour cette locale → passer.

### 2. Relecture (sous-agent LLM, OBLIGATOIRE) → `<loc>.whenwhere.jsonl`
Azure seul n'est **pas** publiable : audit du 2026-10-25 = **1 349 titres faux sur ~11 500** (≈ 12 %, 18-20 % en ja/ko) — homonymes dans le mauvais sens (« Crosse » → pt *Estoque*, « Polonaise » → *Polaco*, « Réductions jésuites » → en *Discounts*, ja 投影 pour une projection cartographique), noms propres restés en français (« Site de Monte Verde ») ou mal transcrits, grammaire cassée. Le merge (étape 3) **refuse** toute carte sans titre relu (`scripts/_lib/translation-review.ts`).

Source du lot : `npx tsx scripts/whenwhere-source.ts <start> <count> --locale <loc>` → pour chaque carte staged : `fr` (titre, prose, consignes), `mt` (prose Azure), `tag`, `type`, `era`, `countryCode`.
Le sous-agent (`general-purpose`) écrit `data/_translations/<loc>.whenwhere.jsonl`, 1 ligne/carte :
`{dexNum, title, fixes?, wherePrompt, whenPrompt}` — où :
- **`title`** (requis) : traduit par l'agent **depuis le FR**, jamais recopié de `mt.title` sans vérification. Nom **usuel** dans la langue cible (exonyme, titre d'œuvre consacré : it *La sagra della primavera*, ja 東海道五十三次, ko 부부의 석관), glossaire `../app/historydex/prompts/glossary/<loc>.json`. Un nom propre invariable reste tel quel ; un mot-outil français (« de », « Site de », « Culture ») ne reste jamais.
- **`fixes`** : `{ blurb?, teaser?, body?, placeLabel?, timeDisplayLabel? }`. Avec `--no-mt` (défaut) : **tous** les champs présents dans `mt` (vides), traduits par l'agent depuis le FR. Avec Azure : texte **complet** corrigé du champ quand la MT est fautive : contresens/homonyme, fait altéré (date, nombre, nom, rôle), nom propre traduit comme un mot commun (« Mio Figlio » pour Mỹ Sơn, « dem Lied » pour la dynastie Song), passage resté en français, phrase agrammaticale, sujet désigné autrement que par `title`, teaser qui ajoute un indice de lieu/date. Un style simplement perfectible ne justifie pas de fix. Pas de fix sur un champ absent de `mt` (teaser FR absent).
- **`wherePrompt` / `whenPrompt`** : re-découpage des consignes, règles ci-dessous.

Règles **dures** des consignes (sinon `validateTranslatedLocale` rejette à l'étape 3) :
- Recomposer la phrase FR `pre+verb+post`, traduire **entière**, puis re-découper selon l'ordre des mots <loc> (ne pas traduire les fragments en place).
- `whenPrompt.pre` DOIT commencer par le lead-in de la locale (source unique : `WHEN_LEAD_INS` dans `scripts/_lib/card-translations.ts`) selon `tag` (ponctuelle / periodique) : **en** When / Around what period · **es** ¿Cuándo / ¿En qué período · **de** Wann / In welchem Zeitraum · **it** Quando / In quale periodo · **pt** et **pt-PT** Quando / Em que período · **pl** Kiedy / W jakim okresie · **nl** Wanneer / In welke periode.
- ⚠️ **Langues SOV (tr, ja, ko)** : le mot interrogatif suit le sujet → `whenPrompt.pre` doit le **contenir** (pas commencer par) : **tr** « ne zaman » / « hangi dönemde » (pre=`"Bu anıt ne zaman "`, verb=`"inşa edildi"`, post=`"?"`) · **ja** « いつ » / « どの時代 » (pre=`"この記念碑はいつ"`, verb=`"建てられました"`, post=`"か？"`) · **ko** « 언제 » / « 어느 시기 » (pre=`"이 기념물은 언제 "`, verb=`"세워졌나요"`, post=`"?"`). Le validateur applique « contient » pour ces 3 locales (`LEAD_IN_INSIDE`).
- ⚠️ **Japonais** : aucune espace entre les mots — le contrôle « mots collés » est désactivé pour `ja` (`NO_WORD_SPACING`), le double espace reste interdit. Point d'interrogation pleine chasse `？`.
- **pt-PT** = portugais du **Portugal** (code Azure `pt-pt`), distinct de `pt` (Brésil) : tu, « estar a + infinitif », ecrã, telemóvel, registar…
- `verb` **non vide** = le verbe principal/participe, accordé. ⚠️ **Allemand V2** : pour « Wann ereignete sich X ? » (pas de participe final), mettre le verbe conjugué dans `verb` : pre=`"Wann "`, verb=`"ereignete"`, post=`" sich X?"`. Ne jamais laisser `verb` vide.
- ⚠️ **Anglais — ordre sujet-verbe** : recomposer puis re-découper en ordre **sujet-verbe** anglais (sujet dans `pre`, participe/verbe dans `verb`, `post`=`"?"`). Ex. pre=`"When was this monument "`, verb=`"built"`, post=`"?"`. **BCE/CE** pour les dates et **en-dash** pour les intervalles (cf. `../app/historydex/prompts/translation/grammar-rules.md`).
- Espacement : pas de double espace ni de mots collés ; verbe directement suivi de `?` autorisé. Ponctuation : es ouvre par `¿` ferme `?` ; **en**/de/it/pt ferment par `?`.
> Pour un gros volume, batcher via `scripts/whenwhere-source.ts <start> <count> --locale <loc>` (slices de ~50 cartes — la relecture lit toute la prose, pas seulement les consignes —, un agent par locale × slice, chaque agent écrit `<loc>.whenwhere.bNNNN.jsonl` puis on concatène en `<loc>.whenwhere.jsonl`) ; pour quelques cartes neuves, un seul sous-agent par locale suffit.
> **Grosse passe** (nouvelle locale, ~800 k caractères de prose) : dépasse le palier Azure **F0** (2 M/mois) dès 3 locales → passer la ressource en **S1** (≈ 10 $/M, sans quota gratuit) le temps du rattrapage, puis revenir en F0. En S1, lancer les locales **en parallèle** (1 process `translate-cards-mt.ts` par locale) : le throttle par process est calibré F0.

### 3. Merge → `display.locales.<loc>`
```bash
npx tsx scripts/merge-translations.ts <loc> --apply
```
Combine prose + relecture (titre de l'agent, `fixes` appliqués) + where/when, valide via
`validateTranslatedLocale` (champs non vides, lead-in, espacement), écrit `display.locales.<loc>`
dans `data/cards/<slug>.json`. **Objectif : 0 rejet.** Un rejet (titre relu manquant, verbe vide
allemand…) → re-lancer le sous-agent de l'étape 2 sur les dexNums rejetés, re-merger.

Puis **`npm run audit-translations`** : 0 piège MT, 0 verbe polysémique, nombres perdus triés (une reformulation en lettres est légitime). Chaque nouvelle erreur trouvée → une entrée dans `TRAPS`/`POLYSEMY` (`scripts/audit-translations.ts`).

### 4. Valider + pousser
```bash
npm run validate            # Zod + invariants → 0 erreur
npm run push:db             # émet les cardTranslations (DRY-RUN d'abord, puis sans --dry-run)
```
`push:db` dérive `country` localisé (`countryName(code, locale)` via Intl) + `normalizedTitle`,
keyé `cardTranslationId` (idempotent). Pas besoin de `--retranslate` pour des cartes neuves
(lignes manquantes → poussées). `--retranslate` ne sert qu'à re-pousser un champ dérivé
modifié (ex. fix de `country`).

## Teaser seul (carte déjà traduite dont le teaser FR est nouveau ou corrigé)

Le teaser (brève description en jeu) a son **propre hash** (`translationMeta.<loc>.teaserHash`) : l'invariant `teaser-translation-stale` ne réclame que lui, et le chemin court suffit — pas de prose, pas de where/when, pas de merge :
```bash
npx tsx scripts/translate-teasers.ts                 # dry-run : volumes par locale + cartes « hors portée »
npx tsx scripts/translate-teasers.ts all --apply     # toutes les locales (~150 car./carte, Azure)
```
⚠️ Ce chemin court n'a **pas** de relecture automatique : avant `push:db`, faire relire les teasers traduits par un sous-agent (FR vs <loc>, critères de l'étape 2 + aucun indice de lieu/date ajouté) et écrire ses corrections directement dans `display.locales.<loc>.teaser` (le `teaserHash` hache le FR : il reste valide).
Idempotent par hash. « Hors portée » = cartes sans `display.locales.<loc>` local : pour elles, le teaser traduit n'existe pas → l'app retombe sur le FR. Deux voies : si la ligne existe déjà en base (cas du `en` des cartes anciennes, backfillé côté app), `npx tsx scripts/pull-en-translations.ts --apply` la rapatrie dans le JSON (fait le 2026-10-19 pour les 416 cartes concernées) ; sinon la locale complète via la procédure ci-dessus (la prose embarque désormais le teaser).

## Garde-fous
- Idempotent partout : prose (skip déjà-staged + déjà-traduit — sauf `--dex`, qui force), merge (clé dexNum), push (clé déterministe + delta `sourceContentVersion`).
- Ne traduire que `approved` (FR stable). Les cartes `reviewed` non encore approuvées sont ignorées → traduites au push suivant une fois approuvées.
- Re-traduction quand le FR change APRÈS traduction : voir la procédure ci-dessous. `push:db --retranslate` re-pousse mais ne re-traduit pas ; l'invariant `translation-stale` (hash du FR stampé au merge) bloque `push:db` tant que la locale n'est pas régénérée.

## FR modifié après traduction (correction de consigne / body sur une carte déjà traduite)

Cas typique : revue de clarté du 2026-10-18 (carte 774 « doublé » → « franchi … pour la première fois »). Trois pièges, tous constatés :
1. `translate-cards-mt.ts` **saute** toute carte « déjà traduite » (`display.locales.<loc>` non null) ou « déjà staged » (présente dans `<loc>.jsonl`) ;
2. l'ancienne ligne `<loc>.whenwhere.jsonl` serait re-mergée telle quelle ;
3. `merge-translations.ts <loc> --apply` **réécrit toutes les cartes du staging** (≈ 1045) et **re-stampe le hash FR courant** sur chacune → toute autre carte dont le FR a bougé serait blanchie.

Procédure (dexNums `a,b` = cartes approved dont le FR a changé) :
```bash
npm run validate                                   # translation-stale attendu sur a,b (ou approved-locale-missing si les locales ont été mises à null)
npx tsx scripts/translate-cards-mt.ts <loc> --dex a,b --apply   # purge leurs lignes de <loc>.jsonl ET <loc>.whenwhere.jsonl, re-stage la prose Azure (pour CHAQUE loc)
# → sous-agent de relecture (étape 2) sur ces seules cartes : écrit (append) les lignes {dexNum, title, fixes?, wherePrompt, whenPrompt} dans <loc>.whenwhere.jsonl.
#   Gabarit par locale = les lignes dexNum 774 (lead-ins, SOV tr/ja/ko, ？ sans espace en ja, ¿…? en es, verb non vide).
npx tsx scripts/merge-translations.ts <loc> --dex a,b --apply   # n'écrit QUE a,b (jamais sans --dex après une correction FR)
npm run validate                                   # 0 translation-stale
npx tsx scripts/audit-translations.ts --dex a      # nombres / pièges / verbes polysémiques sur la carte
npm run push:db -- --dry-run                       # puis push réel après accord
```
`scripts/apply-prompt-rewrites.ts` (revue de clarté) met déjà les locales à `null` et supprime `translationMeta.<loc>` des cartes approved modifiées : `approved-locale-missing` bloque alors le push jusqu'à la retraduction, en plus de `translation-stale`.

Quota Azure F0 (2 M car./mois) : ≈ 1,5 k car. de prose × 11 locales ≈ 17 k car. par carte → ~110 cartes = le quota ; au-delà, passer la ressource en S1 le temps du rattrapage ou étaler sur deux mois.
- Plan d'ensemble : `../app/historydex/docs/i18n-upstream-translation.md`.
