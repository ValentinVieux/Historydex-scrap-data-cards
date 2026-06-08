---
name: translate-cards
description: Higher-quality (opt-in) translation of HistoryDex cards into the target locales (fills display.locales.<loc> in data/cards/*.json) via translator+reviewer subagents with a scored gate (≥90 + semantic), so cards are born multilingual. Then push:db emits the cardTranslations. NOTE: the DEFAULT path for every locale (en included) is now translate-cards-mt (cheap Azure-hybrid); use THIS skill only when you explicitly want the LLM semantic-review gate (e.g. a locale where MT quality is insufficient).
---

# translate-cards

> ⚠️ **Chemin par défaut = `translate-cards-mt` (Azure-hybride), `en` compris.** Depuis que
> l'anglais est routé par Azure comme les autres locales, cette skill LLM (traducteur Sonnet +
> relecteur Opus, garde ≥90) n'est plus le défaut : c'est l'**option haut de gamme**, à invoquer
> seulement quand on veut la relecture sémantique notée (p.ex. une locale où la MT déçoit).

Remplit `display.locales.<loc>` des cartes générées (à partir du FR autoré), pour
que les cartes naissent **multilingues** en amont. Mêmes garanties que le pipeline
app (`translate-catalog`), adaptées au schéma scrap (forme **imbriquée**
`LocaleTextSchema`) et au stockage **fichier** (`data/cards/<slug>.json`). Ensuite,
`npm run push:db` émet les lignes `cardTranslations` (cf. `scripts/_lib/card-translations.ts`).

L'humain ne relit **que le FR** : la garde LLM (traducteur → relecteur → ≥90 +
sémantique) est le QA des traductions. Les lignes partent en `status:'machine'`
(état final).

## Invocation

```
/translate-cards [<locale>]
```
`<locale>` ∈ locales cibles de `lib/i18n/supported-locales.json` (côté app, source unique). Défaut : toutes les cibles non-source. Pour pousser ensuite : `npm run push:db` (DRY-RUN par défaut, `--apply`).

## Références (partagées avec l'app — chemin frère, source unique)

Lire AVANT de traduire et **injecter dans chaque sous-agent** (le **loader** les lit une seule fois) :
- `../app/historydex/prompts/translation/grammar-rules.md` — triplets WHEN/WHERE, **ordre sujet-verbe anglais**, invariant `ponctuelle`/`periodique`, **BCE/CE**, tirets en-dash, contrat d'espaces.
- `../app/historydex/prompts/translation/quality-rubric.md` — rubrique + garde sémantique + format de sortie relecteur.
- `../app/historydex/prompts/translation/glossary-spec.md` — usage du glossaire.
- `../app/historydex/prompts/glossary/<locale>.json` — exonymes / noms propres canoniques.

⚠️ Le `field-spec` de l'app décrit la forme **plate** (cardTranslations) ; **ICI** la sortie est la forme **imbriquée** `LocaleTextSchema` (ci-dessous). Le reste des règles (grammaire, BCE/CE, S-V) s'applique tel quel.

## Forme de sortie : `display.locales.<loc>` = `LocaleTextSchema`

Le traducteur produit, **par carte**, un objet `LocaleTextSchema` (clés exactes) :
```jsonc
{
  "title":  "…",                       // nom (exonyme canonique via glossaire)
  "blurb":  "…",                       // accroche 1 phrase, ton encyclopédique
  "body":   "…",                       // 2-4 phrases, fidèle aux faits/dates (BCE/CE, en-dash)
  "placeLabel": "…",                   // libellé de lieu (PAS le pays — le pays est dérivé du code à l'export)
  "timeDisplayLabel": "…",             // ex. "c. 1503", "existence: 220 BCE – 17th century"
  "wherePrompt": { "pre":"Where was this monument ", "verb":"built", "post":"?" },
  "whenPrompt":  { "pre":"When was this monument ",  "verb":"built", "post":"?" }
}
```
Règle des triplets (cf. `grammar-rules.md`) : traduire la **phrase reconstruite** `pre+verb+post` puis re-découper en **ordre sujet-verbe** (sujet dans `pre`, `post`=« ? »), lead-in `When…`/`Around what period…` selon le `tag` (`canonical.time.tag`, fourni en contexte). **Ne pas** produire de `country`/`normalizedTitle`/`status` (dérivés à l'export par `buildTranslationRow`).

## Run loop (optimisé : loader + lots)

### 0. Préflight
- Locale cible ∈ `targetLocales()` (`scripts/_lib/card-translations.ts`). Réfs + glossaire présents (chemin frère).

### 1. Énumérer
Cartes de `data/cards/*.json` dont `display.locales.<loc>` est `null` (et `editorial.status` ∈ `reviewed`/`approved`). Filtrer le sous-ensemble demandé.

### 2. Loader (1 agent, Sonnet) — **lecture unique**
Un agent lit les références + le glossaire (chemin frère) et renvoie un **préfixe stable** (refs+glossaire) réutilisé dans chaque appel (cache-friendly). Lit aussi les cartes du run (leur `display.locales.fr` + `canonical.time.tag`/`type`/`gameplay.era` en contexte).

### 3. Lots de 6 (séquentiel/parallèle)
Pour chaque lot :
- **TRADUCTEUR** (`model: sonnet`) : préfixe stable + cartes FR → produit les `LocaleTextSchema` `<loc>` (forme ci-dessus) + `newGlossaryTerms`.
- **RELECTEUR** (`model: opus` — garde qualité unique) : corrige + **note** (rubrique). Accepté ⟺ `semanticPass && score ≥ 90`. Sinon re-traduire la carte (≤ 3 tentatives) ; épuisé → **non écrite** (repli FR) + signalée.

### 4. Écrire `display.locales.<loc>` + valider
Écrire chaque `LocaleTextSchema` accepté dans `data/cards/<slug>.json` (`display.locales.<loc>`). Puis valider : `npm run validate` (Zod `CardSchema` + invariants) **doit** passer. La validation structurelle de traduction (`validateTranslatedLocale`) est **ré-appliquée à l'export** par `push:db` (rejet d'une ligne non conforme).

### 5. Pousser
```bash
npm run push:db            # DRY-RUN : montre les cardTranslations à (ré)écrire + rejets
npm run push:db -- --apply # écrit cards + cardTranslations (status:'machine')
```
`push-db.ts` mappe `display.locales.<loc>` → ligne `cardTranslations` (pays = `countryNameEn(countryCode)`, `normalizedTitle` dérivé), keyée par `cardTranslationId(card.id, locale)` (idempotent, **même clé que le backfill app-side**). Delta : (ré)écrit si ligne manquante ou `sourceContentVersion ≠ contentVersion`.

## Garde-fous

- **Modèles** : traducteur **Sonnet** (coût), relecteur **Opus** (garde — l'humain ne relit que le FR).
- **Ne jamais** produire `country`/`normalizedTitle`/`status`/`locale` — dérivés à l'export.
- Ordre **sujet-verbe** anglais, **BCE/CE**, en-dash, lead-in selon `tag` — validés à l'export (`validateTranslatedLocale`), une ligne non conforme est **rejetée** (à re-traduire).
- Idempotence : clé déterministe + delta `sourceContentVersion`. Re-run = no-op si rien n'a changé.
- Le schéma `cardTranslations` (mirror `scripts/_lib/instantdb-schema.ts`) doit rester **synchro** avec l'app.
- Plan d'ensemble : `../app/historydex/docs/i18n-upstream-translation.md`.
