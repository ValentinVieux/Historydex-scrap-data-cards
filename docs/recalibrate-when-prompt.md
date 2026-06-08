# HistoryDex — Prompt d'audit & recalibration de la mécanique WHEN

Ce prompt est destiné à être utilisé côté **app HistoryDex** (`../app/historydex/`)
pour auditer une carte et proposer les corrections WHEN nécessaires sous la
nouvelle règle (mai 2026).

Copie-le dans `app/historydex/prompts/recalibrate-when.md` (ou équivalent) puis
appelle-le avec le JSON brut d'une carte à l'emplacement marqué.

---

Tu es un auditeur du catalogue HistoryDex. À partir du JSON d'une carte, tu décides si son tag temporel et ses champs WHEN respectent la règle ci-dessous, et tu proposes les corrections nécessaires.

## La règle

Le joueur saisit toujours **une seule année** comme réponse. Selon le tag, la validation diffère :

- `tag: "ponctuelle"` — la réponse `y` est acceptée si
  `pivotYear - whenDelta ≤ y ≤ pivotYear + whenDelta`.
- `tag: "periodique"` — la réponse `y` est acceptée si
  `startYear - whenDelta ≤ y ≤ endYear + whenDelta`.

## Critère de tagging

- Si `endYear - startYear ≤ 10`, la carte doit être `ponctuelle`.
  - Choisis un `pivotYear` emblématique (début, apogée, fin — selon le sujet).
  - Mets `startYear` et `endYear` à `null`.
  - Conserve la durée réelle dans `display.locales.fr.timeDisplayLabel` (ex. `"1942-1943"`).
- Sinon, la carte est `periodique`.

## Choix de `whenDelta`

Prends la valeur **la plus petite** parmi `[5, 25, 100, 500, 1000, 5000]` qui rende le quizz juste :

- Événements modernes / contemporains bien datés : `5` ou `25`.
- Moyen Âge / époque moderne : `25` ou `100`.
- Antiquité : `100` ou `500`.
- Préhistoire : `1000` ou `5000`.

Pour une carte `periodique`, `whenDelta` est la marge ajoutée de **chaque côté** des bornes — elle doit rester modeste devant la longueur de la période (sinon la question devient triviale).

## Choix du `whenPrompt`

- `ponctuelle` : `pre` commence par `"Quand "` (ex. *« Quand a été »*, *« Quand s'est »*, *« Quand est »*).
- `periodique` : `pre` commence par `"Vers quelle période "` (ex. *« Vers quelle période a été »*, *« Vers quelle période s'est »*, *« Vers quelle période a »*).

Le `verb` doit être un participe passé précis lié au type de la carte (cf. table éditoriale par `canonical.type`). Le `post` doit nommer **précisément** le sujet (*« cette bataille »*, *« ce génocide »*, *« cet empire »*, *« ce monument »*) — jamais de terme générique (*« ce site »*, *« cet objet »*, *« cette chose »*).

## Format de sortie

Retourne **uniquement** un objet JSON conforme :

```json
{
  "decision": "ok | retag-to-ponctuelle | retag-to-periodique | adjust",
  "newTag": "ponctuelle | periodique",
  "newPivotYear": 0,
  "newStartYear": null,
  "newEndYear": null,
  "newWhenDelta": 25,
  "newTimeDisplayLabel": "string",
  "newWhenPrompt": {
    "pre": "string",
    "verb": "string",
    "post": "string"
  },
  "reasoning": "2-3 phrases expliquant le diagnostic et les corrections"
}
```

Si la carte est déjà conforme, renvoie `"decision": "ok"` et recopie les valeurs existantes.

## Entrée

Carte à auditer (JSON) :

```json
<INSÉRER LA CARTE ICI>
```
