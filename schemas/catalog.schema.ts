import { z } from "zod";
import { CardSchema, type Card } from "./card.schema.js";

export const CatalogSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/, "ISO-8601 timestamp expected"),
  cards: z.array(CardSchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    byEra: z.record(z.string(), z.number().int().nonnegative()),
    byRegion: z.record(z.string(), z.number().int().nonnegative()),
    byType: z.record(z.string(), z.number().int().nonnegative()),
    byStatus: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

export type Catalog = z.infer<typeof CatalogSchema>;

export function buildCatalogCounts(cards: Card[]): Catalog["counts"] {
  const counts: Catalog["counts"] = {
    total: cards.length,
    byEra: {},
    byRegion: {},
    byType: {},
    byStatus: {},
  };
  for (const c of cards) {
    counts.byEra[c.gameplay.era] = (counts.byEra[c.gameplay.era] ?? 0) + 1;
    const regionKey = String(c.canonical.place.region);
    counts.byRegion[regionKey] = (counts.byRegion[regionKey] ?? 0) + 1;
    counts.byType[c.canonical.type] = (counts.byType[c.canonical.type] ?? 0) + 1;
    counts.byStatus[c.editorial.status] = (counts.byStatus[c.editorial.status] ?? 0) + 1;
  }
  return counts;
}
