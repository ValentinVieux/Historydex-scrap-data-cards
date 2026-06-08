---
name: translate-cards-mt
description: Auto-translate HistoryDex cards into every target locale (en/es/de/it/pt — all of targetLocales(), English included) via the cheap Azure-hybrid pipeline (Azure prose + LLM where/when re-split), filling display.locales.<loc> so push:db emits the cardTranslations. Idempotent — only cards still missing a locale. Run as the step BEFORE push:db so newly-approved cards ship multilingual. This is the DEFAULT path for ALL target locales including en; translate-cards (LLM) is the higher-quality opt-in alternative. Use when asked to translate cards cheaply / before pushing.
---

# translate-cards-mt

Traduction **éco** des cartes (**en**/es/de/it/pt — **toutes** les `targetLocales()`, anglais compris) — le chemin
**par défaut** pour toute locale cible. L'alternative à la skill LLM `translate-cards`
(traducteur+relecteur Opus), réservée désormais aux cas où l'on veut la garde qualité ≥90.
Moteur **Azure AI Translator** (F0 gratuit, 2M car/mois) pour la **prose**, + un **sous-agent LLM** pour les 6 champs
structurés where/when (re-découpage selon l'ordre des mots cible + invariant lead-in
que la MT ne sait pas faire). Garde : `validateTranslatedLocale` (déterministe).

> **Anglais (`en`)** : `en` fait partie de `targetLocales()` (cf. `supported-locales.json` : `en` n'est pas
> `source`) et le script l'accepte (`AZURE_TO.en`, `WHEN_LEAD_INS.en`). fr→en est la paire la plus solide
> d'Azure. C'est donc **ici** qu'on traduit `en` par défaut, comme les autres ; `translate-cards` (LLM)
> reste l'option haut de gamme si l'on veut une relecture sémantique notée.

**Quand** : étape **avant `push:db`**. On ne traduit que les cartes `approved`
(FR finalisé après revue humaine → zéro traduction périmée) **encore non traduites**
(`display.locales.<loc>` null). Idempotent : re-run = no-op si tout est traduit.

> Différence avec `translate-cards` (LLM) : ici pas de relecteur LLM (garde =
> validateTranslatedLocale seul). Qualité validée par le backfill es/de/it/pt (552×4).
> Réutilise EXACTEMENT les scripts du backfill.

## Pré-requis
- `.env` : `AZURE_TRANSLATOR_KEY` (+ `AZURE_TRANSLATOR_REGION` si ressource régionale, ex. `francecentral`).
- Locales cibles = `targetLocales()` (`scripts/_lib/card-translations.ts`, lit `../app/historydex/lib/i18n/supported-locales.json` — **source unique**). Aujourd'hui : **en, es, de, it, pt** (`en` inclus). S'étend automatiquement : ajouter une locale à `supported-locales.json` + son lead-in à `WHEN_LEAD_INS` suffit pour que cette skill la prenne en compte.

## Procédure (pour CHAQUE locale de `targetLocales()` — en, es, de, it, pt)

### 1. Prose (Azure) → staging
```bash
npx tsx scripts/translate-cards-mt.ts <loc> --apply
```
Traduit les 5 champs de prose (title, blurb, body, placeLabel, timeDisplayLabel) des
cartes `approved` non traduites → `data/_translations/<loc>.jsonl` (chaque ligne porte
aussi `frWhere`/`frWhen`/`tag` pour l'étape 2). Backoff 429 + reprise incrémentale.
S'il affiche « Rien à faire », il n'y a rien à traduire pour cette locale → passer.

### 2. where/when (sous-agent LLM) → `<loc>.whenwhere.jsonl`
Lancer **un sous-agent** (`general-purpose`) qui lit `data/_translations/<loc>.jsonl`
et, pour chaque carte, re-découpe `frWhere`/`frWhen` en `{pre,verb,post}` <loc>, puis
écrit `data/_translations/<loc>.whenwhere.jsonl` (1 ligne/carte : `{dexNum, wherePrompt, whenPrompt}`).
Règles **dures** (sinon `validateTranslatedLocale` rejette à l'étape 3) :
- Recomposer la phrase FR `pre+verb+post`, traduire **entière**, puis re-découper selon l'ordre des mots <loc> (ne pas traduire les fragments en place).
- `whenPrompt.pre` DOIT commencer par le lead-in de la locale (source unique : `WHEN_LEAD_INS` dans `scripts/_lib/card-translations.ts`) selon `tag` (ponctuelle / periodique) : **en** When / Around what period · **es** ¿Cuándo / ¿En qué período · **de** Wann / In welchem Zeitraum · **it** Quando / In quale periodo · **pt** Quando / Em que período.
- `verb` **non vide** = le verbe principal/participe, accordé. ⚠️ **Allemand V2** : pour « Wann ereignete sich X ? » (pas de participe final), mettre le verbe conjugué dans `verb` : pre=`"Wann "`, verb=`"ereignete"`, post=`" sich X?"`. Ne jamais laisser `verb` vide.
- ⚠️ **Anglais — ordre sujet-verbe** : recomposer puis re-découper en ordre **sujet-verbe** anglais (sujet dans `pre`, participe/verbe dans `verb`, `post`=`"?"`). Ex. pre=`"When was this monument "`, verb=`"built"`, post=`"?"`. **BCE/CE** pour les dates et **en-dash** pour les intervalles (cf. `../app/historydex/prompts/translation/grammar-rules.md`).
- Espacement : pas de double espace ni de mots collés ; verbe directement suivi de `?` autorisé. Ponctuation : es ouvre par `¿` ferme `?` ; **en**/de/it/pt ferment par `?`.
> Pour un gros volume, batcher via `scripts/whenwhere-source.ts <start> <count>` (slices) ; pour quelques cartes neuves, un seul sous-agent suffit.

### 3. Merge → `display.locales.<loc>`
```bash
npx tsx scripts/merge-translations.ts <loc> --apply
```
Combine prose + where/when, valide via `validateTranslatedLocale` (champs non vides,
lead-in, espacement), écrit `display.locales.<loc>` dans `data/cards/<slug>.json`.
**Objectif : 0 rejet.** Un rejet (ex. verbe vide allemand) → re-lancer le sous-agent
de l'étape 2 sur les dexNums rejetés, re-merger.

### 4. Valider + pousser
```bash
npm run validate            # Zod + invariants → 0 erreur
npm run push:db             # émet les cardTranslations (DRY-RUN d'abord, puis sans --dry-run)
```
`push:db` dérive `country` localisé (`countryName(code, locale)` via Intl) + `normalizedTitle`,
keyé `cardTranslationId` (idempotent). Pas besoin de `--retranslate` pour des cartes neuves
(lignes manquantes → poussées). `--retranslate` ne sert qu'à re-pousser un champ dérivé
modifié (ex. fix de `country`).

## Garde-fous
- Idempotent partout : prose (skip déjà-staged + déjà-traduit), merge (clé dexNum), push (clé déterministe + delta `sourceContentVersion`).
- Ne traduire que `approved` (FR stable). Les cartes `reviewed` non encore approuvées sont ignorées → traduites au push suivant une fois approuvées.
- **Non géré (TODO futur)** : re-traduction si le FR change APRÈS traduction (display.locales n'horodate pas la version FR par locale ; `push:db --retranslate` re-pousse mais ne re-traduit pas). Pour l'instant : éditer le FR ⇒ supprimer `display.locales.<loc>` de la carte puis re-lancer cette skill.
- Plan d'ensemble : `../app/historydex/docs/i18n-upstream-translation.md`.
