# Brief de normalisation (rôles card-editor + gameplay-balancer)

Tu transformes une fiche raw vérifiée en carte JSON conforme. Ta tâche te donne le slug et le dexNum imposé. Les chemins sont relatifs à `c:\projets\Historydex\scrap_historical_data`.

## À lire avant de commencer

- `.claude/skills/normalize-card-data/SKILL.md`, étapes 2 à 4 et 6 ;
- tes deux rôles : `.claude/agents/card-editor.md` (textes FR) et `.claude/agents/gameplay-balancer.md` (gameplay) ;
- `.claude/rules/editorial-rules.md` en entier : fiche courte du body (60 mots au plus, 3 phrases), teaser, clarté des consignes, substantif, espacement pre/verb/post, aucune date dans le titre ;
- `.claude/rules/common-historical-errors.md` (P1-P7) ;
- la fiche `data/raw/<slug>.md`, y compris sa section « Vérification » ajoutée par source-verifier ;
- comme modèle de forme, une carte récente de `data/cards/` (par exemple `grep -l '"dexNum": "1221"' data/cards/*.json`).

## Ce que tu produis

`data/cards/<slug>.json`, avec :
- `id` = le slug et `dexNum` = celui qui t'est imposé ;
- `canonical`, rempli depuis la fiche. `place.region` doit correspondre à (lat, lon) : `validate` le vérifie ;
- `display.locales.fr`, rédigé selon card-editor : title, **teaser**, blurb, body, placeLabel, timeDisplayLabel, wherePrompt, whenPrompt ; plus `imageLabel` et `wikipediaTitle` si ton modèle les a ;
- `gameplay`, choisi selon gameplay-balancer. `whenDelta` dépend de l'ère : prehist 2000, antiq 100, medi 25, modern 10, contemp 5 ;
- `editorial` :
  - les sources sont **transcrites** depuis la fiche raw (sources rejetées exclues), avec une seule `relevance` par entrée, au moins une `date` et au moins une `place` ;
  - `confidence` reprend celle de la vérification ;
  - `status: "reviewed"`, `contentVersion: 1` ;
  - les notes et warnings utiles.

## Contraintes

- Le body ne contient aucun fait absent de la fiche raw. Les claims « à phraser avec prudence » de la fiche sont modalisés.
- Le teaser ne contient aucun toponyme, aucune nationalité, aucune date, aucun mot d'époque et aucun nom de personne, à part les mots du titre.
- Les consignes utilisent un verbe courant, absent de la denylist `PROMPT_VERB_JARGON` de `scripts/_lib/invariants.ts`. Ajoute « pour la première fois » si l'événement se répète. Écris « Où se trouve … ? » si le titre est déjà le lieu.

## Vérifications

- `npx tsx scripts/validate-catalog.ts` doit donner 0 erreur sur ta carte. Corrige toute erreur qui la concerne et regarde ses warnings dans le dernier `reports/validation-*.md`.
- Lance aussi `npm run verify-geo -- --card <slug>`.

Écris les fichiers avec l'outil Write ou Edit, jamais avec `node -e`.

## Rapport final

Court : titre, teaser, consignes OÙ et QUAND, année pivot et tag, lieu et région, résultat de validate pour ta carte, résultat de verify-geo, et les liens proposés par la fiche, recopiés tels quels.
