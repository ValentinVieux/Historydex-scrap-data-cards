import { z } from "zod";

export const CARD_TYPES = [
  "paint",
  "sculpt",
  "war",
  "invent",
  "person",
  "archi",
  "text",
  "cata",
  "explor",
  "relig",
  "sci",
  "treaty",
  "money",
  "sport",
  "music",
] as const;

export const ERAS = ["prehist", "antiq", "medi", "modern", "contemp"] as const;

export const ERA_BOUNDS: Record<(typeof ERAS)[number], { start: number; end: number }> = {
  prehist: { start: -Infinity, end: -3000 },
  antiq: { start: -3000, end: 476 },
  medi: { start: 476, end: 1492 },
  modern: { start: 1492, end: 1789 },
  contemp: { start: 1789, end: 9999 },
};

export const REGIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const REGION_LABELS: Record<number, string> = {
  1: "Europe occidentale",
  2: "Europe orientale & Balkans",
  3: "Russie & Asie centrale",
  4: "Proche-Orient & Méditerranée orientale",
  5: "Afrique hors Égypte",
  6: "Asie de l'Est",
  7: "Asie du Sud",
  8: "Asie du Sud-Est & Pacifique",
  9: "Amériques précolombiennes & latines",
  10: "Amérique du Nord",
};

export const PLACE_KINDS = [
  "birth_place",
  "death_place",
  "battle_site",
  "construction_site",
  "creation_place",
  "publication_place",
  "signature_place",
  "current_exhibition",
  "discovery_site",
  "landing_site",
  "diffusion_area",
  "origin_area",
  "capital_or_power_center",
  "symbolic_location",
  "other",
] as const;

export const TIME_KINDS = [
  "single_year",
  "approximate_year",
  "range",
  "symbolic_pivot",
  "debated",
] as const;

export const TIME_TAGS = ["ponctuelle", "periodique"] as const;

export const GEO_KINDS = ["earth", "extraterrestrial", "abstract"] as const;

export const STATUSES = ["draft", "reviewed", "approved", "archived"] as const;

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const DIFFICULTY_LEVELS = ["precise", "regional", "extended", "special"] as const;

export const SOURCE_RELEVANCE = ["date", "place", "fact", "context", "image", "general"] as const;

// Mode historien (mode dominant côté app) : la tolérance whenDelta est portée par
// l'ère, pas par la carte. Source : app/historydex/lib/catalog/eras.ts.
// gameplay.whenDelta DOIT être égal à HD_ERA_WHEN_DELTAS[gameplay.era] — vérifié
// par l'invariant whenDelta-era-mismatch (erreur bloquante).
export const HD_ERA_WHEN_DELTAS: Record<(typeof ERAS)[number], number> = {
  prehist: 2000,
  antiq: 100,
  medi: 25,
  modern: 10,
  contemp: 5,
};

// RECOMMENDED_WHEN_DELTA : legacy, conservé pour référence (whenDelta est dérivé
// de l'ère depuis la migration era-based, plus normatif).
export const RECOMMENDED_WHEN_DELTA = [2, 5, 10, 25, 50, 100, 300, 500, 1000, 2000, 5000] as const;
// RECOMMENDED_WHERE_RADIUS_KM : échelle de paliers WHERE. Pilote le warning
// `whereRadius-tier` (invariants.ts). Recalée mai 2026 sur l'usage réel des 233
// premières cartes (600 et 1000 sont devenus des paliers majeurs, 200 = plancher
// « très précis » rare). Les valeurs fines hors-échelle restent permises (simple warning).
export const RECOMMENDED_WHERE_RADIUS_KM = [200, 500, 600, 800, 1000, 1200, 1500, 2000, 3000] as const;

const SourceSchema = z.object({
  title: z.string().min(2),
  url: z.string().url(),
  publisher: z.string().min(1),
  author: z.string().nullable().optional(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "accessedAt must be YYYY-MM-DD"),
  relevance: z.enum(SOURCE_RELEVANCE),
  quote: z.string().min(1).max(800),
});

const TimeBlockSchema = z.object({
  tag: z.enum(TIME_TAGS),
  timeKind: z.enum(TIME_KINDS),
  pivotYear: z.number().int(),
  startYear: z.number().int().nullable().optional(),
  endYear: z.number().int().nullable().optional(),
  justification: z.string().min(3),
});

const PlaceBlockSchema = z.object({
  placeKind: z.enum(PLACE_KINDS),
  placeCanonicalName: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  region: z.number().int().refine((n) => REGIONS.includes(n as (typeof REGIONS)[number]), {
    message: "region must be 1..10",
  }),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "countryCode must be ISO-3166-1 alpha-2").nullable(),
  geoKind: z.enum(GEO_KINDS).default("earth"),
  justification: z.string().min(3),
});

const CanonicalSchema = z.object({
  subjectKey: z.string().min(2),
  type: z.enum(CARD_TYPES),
  aliases: z.array(z.string()).default([]),
  factNotes: z.array(z.string()).default([]),
  wikipediaTitle: z.string().nullable().optional(),
  time: TimeBlockSchema,
  place: PlaceBlockSchema,
});

const GameplaySchema = z.object({
  era: z.enum(ERAS),
  whenDelta: z.number().int().positive(),
  whereRadiusKm: z.number().int().positive(),
  difficultyWhen: z.enum(DIFFICULTY_LEVELS),
  difficultyWhere: z.enum(DIFFICULTY_LEVELS),
  eligibleForWhen: z.boolean().default(true),
  eligibleForWhere: z.boolean().default(true),
  balanceNotes: z.string().optional().default(""),
});

const WherePromptSchema = z.object({
  pre: z.string().min(1),
  verb: z.string().min(1),
  post: z.string().min(1),
});

const WhenPromptSchema = z.object({
  pre: z.string().min(1),
  verb: z.string().min(1),
  post: z.string().min(1),
});

const LocaleTextSchema = z.object({
  title: z.string().min(2).max(80),
  blurb: z.string().min(20).max(220),
  body: z.string().min(40).max(800),
  placeLabel: z.string().min(1),
  timeDisplayLabel: z.string().min(1),
  wherePrompt: WherePromptSchema,
  whenPrompt: WhenPromptSchema,
});

// Locales TRADUITES (non-source) : mêmes champs, mais les plafonds éditoriaux
// stricts (title/blurb/body) ne s'appliquent qu'à la source `fr`. Les langues
// cibles (en/es/de/it…) sont souvent +10-25 % plus longues que le FR ; on tolère
// donc l'expansion, avec un garde-fou généreux (~2× le FR) contre une sortie MT
// aberrante. Le rendu app scrolle le body, et `cardTranslations.body` côté DB n'a
// aucune contrainte de longueur — la seule limite était ce schéma Zod.
const TranslatedLocaleTextSchema = z.object({
  title: z.string().min(2).max(160),
  blurb: z.string().min(20).max(440),
  body: z.string().min(40).max(1600),
  placeLabel: z.string().min(1),
  timeDisplayLabel: z.string().min(1),
  wherePrompt: WherePromptSchema,
  whenPrompt: WhenPromptSchema,
});

const DisplaySchema = z.object({
  defaultLocale: z.literal("fr"),
  locales: z.object({
    fr: LocaleTextSchema,
    en: TranslatedLocaleTextSchema.nullable().default(null),
    es: TranslatedLocaleTextSchema.nullable().default(null),
    de: TranslatedLocaleTextSchema.nullable().default(null),
    it: TranslatedLocaleTextSchema.nullable().default(null),
    pt: TranslatedLocaleTextSchema.nullable().default(null),
  }),
  imageLabel: z.string().min(1).max(16),
  translationNotes: z.array(z.string()).default([]),
});

const EditorialSchema = z.object({
  status: z.enum(STATUSES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  contentVersion: z.number().int().positive().default(1),
  notes: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  sources: z.array(SourceSchema).default([]),
});

export const CardSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "id must be a slug"),
  dexNum: z.string().regex(/^\d{3,4}$/, "dexNum must be 3-4 digits"),
  canonical: CanonicalSchema,
  gameplay: GameplaySchema,
  display: DisplaySchema,
  editorial: EditorialSchema,
});

export type Card = z.infer<typeof CardSchema>;
export type CardSource = z.infer<typeof SourceSchema>;
export type CardType = (typeof CARD_TYPES)[number];
export type Era = (typeof ERAS)[number];
export type Region = (typeof REGIONS)[number];
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type TimeKind = (typeof TIME_KINDS)[number];
export type Status = (typeof STATUSES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

export function parseCard(raw: unknown): Card {
  return CardSchema.parse(raw);
}

export function safeParseCard(raw: unknown) {
  return CardSchema.safeParse(raw);
}
