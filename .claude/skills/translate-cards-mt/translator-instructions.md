# Consignes du traducteur (une locale, un lot de cartes)

Tu traduis les cartes d'un lot dans la langue `<loc>`, comme un traducteur natif de cette langue. Tu traduis **tout toi-même, depuis le français**. Aucun service de traduction automatique ne doit être utilisé : Azure est abandonné depuis le 2026-11-21.

La tâche te donne `<loc>` (la langue) et `<lot>` (le numéro du lot, par exemple 1147). Les chemins sont relatifs à `c:\projets\Historydex\scrap_historical_data`.

## À lire avant de commencer

- `.claude/skills/translate-cards-mt/SKILL.md`, sections « 2. Relecture » et « Règles dures des consignes » ;
- le lead-in QUAND de ta langue, dans `WHEN_LEAD_INS` de `scripts/_lib/card-translations.ts` (formes ponctuelle et periodique) ;
- le glossaire de ta langue s'il existe : `../app/historydex/prompts/glossary/<loc>.json` ;
- **les conventions déjà en place pour ta langue**. Ouvre quelques cartes de `data/cards/` qui ont déjà `display.locales.<loc>` et relève :
  - les préfixes de `timeDisplayLabel` (le français « extension: », « règne: »… a déjà une traduction attitrée : réutilise-la, n'en invente pas une nouvelle) ;
  - les abréviations de dates (av./ap. J.-C.) ;
  - la forme des consignes.

## Entrée

`data/_translations/_src-<loc>-<lot>.json`. Pour chaque carte, le fichier donne :
- `fr` : `title`, `blurb`, `teaser`, `body`, `placeLabel`, `timeDisplayLabel`, `wherePrompt`, `whenPrompt` ;
- `mt` : la liste des champs à remplir, tous vides ;
- `tag`, `type`, `era`, `countryCode`.

## Sortie

`data/_translations/<loc>.whenwhere.b<lot>.jsonl`, avec une ligne par carte :

```
{"dexNum":"…","title":"…","fixes":{"blurb":"…","teaser":"…","body":"…","placeLabel":"…","timeDisplayLabel":"…"},"wherePrompt":{"pre":"…","verb":"…","post":"…"},"whenPrompt":{"pre":"…","verb":"…","post":"…"}}
```

Écris les fichiers avec l'outil Write, jamais avec `node -e`.

**Tes fichiers de travail intermédiaires et tes scripts de contrôle portent le préfixe `<loc>-<lot>-`**, par exemple `<loc>-<lot>-part1.jsonl` ou `<loc>-<lot>-check.mjs` (deux lots d'une même langue peuvent tourner en même temps). Plusieurs traducteurs tournent en parallèle dans le même dossier temporaire : un nom générique comme `p1.jsonl` ou `check.mjs` serait écrasé par celui d'une autre langue (incident du 2026-11-21).

## Règles

- **title** : prends le nom **usuel** dans ta langue (exonyme, nom consacré), jamais un calque du français. Le titre ne contient aucune date. Un nom propre invariable reste tel quel.
- **fixes** : traduis **chaque** champ présent dans `mt`, depuis le français.
  - Le `teaser` fait 20 à 200 caractères. Il n'ajoute aucun indice de lieu, de date, de nationalité ou d'époque absent du teaser français, et ne contient aucun chiffre arabe.
  - Le `body` garde exactement les faits, les nombres et les modalisations du français (« selon », « vers », « sans doute »).
- **Consignes** : recompose la phrase française `pre+verb+post`, traduis-la **en entier**, puis redécoupe-la selon l'ordre des mots de ta langue.
  - `verb` est le verbe principal, jamais vide.
  - `whenPrompt.pre` commence par le lead-in. Pour les langues SOV (tr, ja, ko, zh-Hans, hu), il doit seulement être **contenu** dans `pre`.
  - Pas de double espace, pas de mots collés. En japonais, aucune espace et le point d'interrogation pleine chasse `？`.
  - Respecte la ponctuation de ta langue : `¿…?` en espagnol, `؟` en arabe, `;` en grec.
- **Verbes** : choisis-les sans double sens, comme le demande la règle de clarté des consignes. Le joueur ne voit que le titre et la consigne pendant l'énigme.

## Vérification

Contrôle ton fichier avec un script `<loc>-check.mjs` que tu lances avec `node`. Il doit vérifier :
- une ligne de JSON valide par carte, avec des dexNum uniques et identiques à ceux de la source ;
- tous les champs remplis ;
- le lead-in présent ;
- un teaser de 20 à 200 caractères.

**N'applique rien.** Ne lance pas `merge-translations` et ne touche pas à `<loc>.whenwhere.jsonl` : l'orchestrateur s'occupe du merge.

## Rapport final

Court :
- le nombre de lignes écrites ;
- les titres difficiles et le choix retenu pour chacun ;
- les conventions reprises de l'existant ;
- les doutes éventuels.
