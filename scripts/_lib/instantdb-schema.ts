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
      // Clé de tri era-major pour la grille Dex sectionnée : eraRank(ERA_ORDER)
      // × 10000 + int(dexNum). La grille catalogue de l'app filtre
      // `eraSort: { $isNull: false }` — une carte poussée sans ce champ est
      // INVISIBLE dans le Dex jusqu'au backfill cron. Le push le calcule donc
      // désormais (cf. flatten() dans push-db.ts) pour que les nouvelles cartes
      // soient visibles immédiatement, sans attendre le cron de maintenance.
      eraSort: i.number().indexed().optional(),
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

    // ── Compteur singleton du catalogue (dénominateur « X / N ») ──────────
    // Mirror de l'app. Écrit surtout par le cron de maintenance
    // (../app/historydex/scripts/refresh-catalog-stats.ts), MAIS le push amont
    // le recale aussi en fin de run (cardCount + eraCounts) pour que le « X / N »
    // du profil / Dex reflète les nouvelles cartes sans attendre le cron.
    // `update` sur l'id singleton = merge → ne clobbe pas registeredCollectors /
    // rarityComputedAt (maintenus par refresh-card-scarcity.ts). Champs optionnels
    // alignés sur l'app pour que ce mirror n'écrase pas leur typage au push schema.
    catalogStats: i.entity({
      cardCount: i.number(),
      eraCounts: i.json().optional(),
      registeredCollectors: i.number().optional(),
      rarityComputedAt: i.number().optional(),
      updatedAt: i.number(),
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
