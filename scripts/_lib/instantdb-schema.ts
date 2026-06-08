// Schéma InstantDB pour les cartes HistoryDex, mirror côté pipeline.
//
// ⚠️ DOIT RESTER SYNCHRONISÉ avec ../../app/historydex/instant.schema.ts.
//
// Pourquoi un mirror plutôt qu'un import direct ?
//   1. L'app utilise @instantdb/react-native pour le runtime mobile.
//      Le schéma exporté importe i de @instantdb/core, qui est dispo aussi
//      ici via @instantdb/admin. L'import croisé fonctionnerait techniquement,
//      mais introduit un couplage de chemin entre deux repos.
//   2. Le pipeline n'a besoin que des entités `cards` + `cardTranslations` (le
//      push amont émet les traductions). Le reste (users, rounds…) ne le concerne
//      pas — on minimise le bruit ici.
//
// Si tu modifies ce schéma, propage côté app ET pousse avec :
//   cd ../app/historydex && npx instant-cli push schema

import { i } from "@instantdb/admin";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    cards: i.entity({
      dexNum: i.string().unique().indexed(),
      title: i.string(),
      normalizedTitle: i.string().indexed().optional(),
      type: i.string().indexed(),
      era: i.string().indexed(),
      region: i.number().indexed(),
      country: i.string(),
      tag: i.string(),
      pivotYear: i.number(),
      startYear: i.number().optional(),
      endYear: i.number().optional(),
      whenDelta: i.number(),
      lat: i.number(),
      lon: i.number(),
      whereRadiusKm: i.number(),
      whereVerb: i.string(),
      whereConsignePre: i.string(),
      whereConsignePost: i.string(),
      whenPromptVerb: i.string(),
      whenPromptPre: i.string(),
      whenPromptPost: i.string(),
      timeDisplayLabel: i.string().optional(),
      blurb: i.string(),
      body: i.string(),
      imageLabel: i.string(),
      blurhash: i.string().optional(),
      publishedAt: i.number().indexed(),
      contentVersion: i.number().optional(),
      imageHash: i.string().optional(),
      // Langue d'autoring des colonnes texte (= plan source/fallback). 'fr' si absent.
      sourceLocale: i.string().optional(),
    }),

    // ── Catalog i18n : 1 ligne par (carte × locale) ──────────
    // Émis par le push amont (display.locales.<loc>). Mirror de l'app.
    cardTranslations: i.entity({
      locale: i.string().indexed(),
      dexNum: i.string().indexed(),
      normalizedTitle: i.string().indexed(),
      title: i.string(),
      country: i.string(),
      whereVerb: i.string(),
      whereConsignePre: i.string(),
      whereConsignePost: i.string(),
      whenPromptVerb: i.string(),
      whenPromptPre: i.string(),
      whenPromptPost: i.string(),
      timeDisplayLabel: i.string().optional(),
      blurb: i.string(),
      body: i.string(),
      status: i.string(), // 'machine' | 'human' | 'reviewed'
      sourceContentVersion: i.number().optional(),
    }),
  },
  rooms: {},
  links: {
    card_image: {
      forward: { on: "cards", has: "one", label: "image", onDelete: "cascade" },
      reverse: { on: "$files", has: "one", label: "card" },
    },
    card_thumb: {
      forward: { on: "cards", has: "one", label: "thumb", onDelete: "cascade" },
      reverse: { on: "$files", has: "one", label: "cardThumb" },
    },
    cardTranslation_card: {
      forward: { on: "cardTranslations", has: "one", label: "card", onDelete: "cascade" },
      reverse: { on: "cards", has: "many", label: "translations" },
    },
  },
});

type _PipelineSchema = typeof _schema;
export interface PipelineSchema extends _PipelineSchema {}
const schema: PipelineSchema = _schema;
export default schema;
