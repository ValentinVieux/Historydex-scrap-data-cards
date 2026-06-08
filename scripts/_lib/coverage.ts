// Analyse de couverture du catalogue HistoryDex.
//
// Lib partagée entre :
//   - scripts/report-catalog.ts (produit le rapport markdown distribution)
//   - .claude/agents/subject-curator.md (choisit N sujets pour combler les lacunes)
//
// Data-only : pas de formatage markdown ici, le caller choisit son rendu.

import fs from "node:fs";
import path from "node:path";
import { type Card } from "../../schemas/card.schema.js";
import { PATHS } from "./io.js";

// ── Targets (% du catalogue total visé pour chaque axe) ──────────────────

export type Targets = {
  era: Record<string, number>;
  region: Record<string, number>;
  typeMinPct: number;
};

export const DEFAULT_TARGETS: Targets = {
  era: {
    prehist: 10,
    antiq: 18,
    medi: 22,
    modern: 18,
    contemp: 32,
  },
  region: {
    "1": 28, // Europe occidentale (volontairement plafonnée)
    "2": 8,  // Europe orientale & Balkans
    "3": 6,  // Russie & Asie centrale
    "4": 12, // Proche-Orient & Méditerranée orientale
    "5": 8,  // Afrique hors Égypte
    "6": 12, // Asie de l'Est
    "7": 8,  // Asie du Sud
    "8": 6,  // Asie du Sud-Est & Pacifique
    "9": 6,  // Amériques précolombiennes & latines
    "10": 6, // Amérique du Nord
  },
  typeMinPct: 5,
};

export function loadTargets(): Targets {
  const targetFile = path.join(PATHS.candidates, "..", "_targets.json");
  if (!fs.existsSync(targetFile)) return DEFAULT_TARGETS;
  try {
    const raw = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    return {
      era: { ...DEFAULT_TARGETS.era, ...(raw.era ?? {}) },
      region: { ...DEFAULT_TARGETS.region, ...(raw.region ?? {}) },
      typeMinPct: raw.typeMinPct ?? DEFAULT_TARGETS.typeMinPct,
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

// ── Données brutes de couverture ─────────────────────────────────────────

export type DistroBucket<K extends string | number> = {
  key: K;
  count: number;
  pct: number;
  targetPct?: number;
  deviation?: number; // pct - targetPct
};

export type CoverageReport = {
  total: number;
  approvedTotal: number;
  reviewedTotal: number;
  byEra: DistroBucket<string>[];
  byRegion: DistroBucket<number>[];
  byType: DistroBucket<string>[];
  byTag: DistroBucket<string>[];
  // Lacunes signalées (gap negative > 5% du target).
  gaps: Array<{ axis: "era" | "region" | "type"; key: string | number; missingPct: number; missingCount: number }>;
  // Surplus (au-dessus du target).
  excess: Array<{ axis: "era" | "region" | "type"; key: string | number; excessPct: number; excessCount: number }>;
};

function tally<T extends string | number>(cards: Card[], pick: (c: Card) => T): Map<T, number> {
  const m = new Map<T, number>();
  for (const c of cards) {
    const k = pick(c);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Analyse la distribution du catalogue et identifie les lacunes/excès vs targets.
// Pour piloter le batch generation : passer en revue `gaps` pour savoir quel
// type/ère/région privilégier pour le prochain lot.
export function analyzeCoverage(cards: Card[], targets: Targets = DEFAULT_TARGETS): CoverageReport {
  const total = cards.length;
  const approvedTotal = cards.filter((c) => c.editorial.status === "approved").length;
  const reviewedTotal = cards.filter((c) => c.editorial.status === "reviewed").length;

  const eraMap = tally(cards, (c) => c.gameplay.era);
  const regionMap = tally(cards, (c) => c.canonical.place.region);
  const typeMap = tally(cards, (c) => c.canonical.type);
  const tagMap = tally(cards, (c) => c.canonical.time.tag);

  const byEra: DistroBucket<string>[] = [...eraMap.entries()].map(([key, count]) => {
    const pctVal = total > 0 ? (count / total) * 100 : 0;
    const targetPct = targets.era[key];
    return { key, count, pct: pctVal, targetPct, deviation: targetPct != null ? pctVal - targetPct : undefined };
  });
  byEra.sort((a, b) => b.count - a.count);

  const byRegion: DistroBucket<number>[] = [...regionMap.entries()].map(([key, count]) => {
    const pctVal = total > 0 ? (count / total) * 100 : 0;
    const targetPct = targets.region[String(key)];
    return { key, count, pct: pctVal, targetPct, deviation: targetPct != null ? pctVal - targetPct : undefined };
  });
  byRegion.sort((a, b) => b.count - a.count);

  const byType: DistroBucket<string>[] = [...typeMap.entries()].map(([key, count]) => {
    const pctVal = total > 0 ? (count / total) * 100 : 0;
    return { key, count, pct: pctVal, targetPct: targets.typeMinPct, deviation: pctVal - targets.typeMinPct };
  });
  byType.sort((a, b) => b.count - a.count);

  const byTag: DistroBucket<string>[] = [...tagMap.entries()].map(([key, count]) => ({
    key,
    count,
    pct: total > 0 ? (count / total) * 100 : 0,
  }));

  // Lacunes : axes où la couverture est < target - 2 (>2% sous le target).
  const gaps: CoverageReport["gaps"] = [];
  const excess: CoverageReport["excess"] = [];

  for (const b of byEra) {
    if (b.targetPct == null || b.deviation == null) continue;
    if (b.deviation < -2) gaps.push({ axis: "era", key: b.key, missingPct: -b.deviation, missingCount: Math.ceil((-b.deviation * total) / 100) });
    if (b.deviation > 5) excess.push({ axis: "era", key: b.key, excessPct: b.deviation, excessCount: Math.ceil((b.deviation * total) / 100) });
  }
  // Régions absentes (count=0) — les listes en priorité.
  for (let r = 1; r <= 10; r++) {
    if (!regionMap.has(r)) {
      const targetPct = targets.region[String(r)] ?? 0;
      if (targetPct > 0) {
        gaps.push({ axis: "region", key: r, missingPct: targetPct, missingCount: Math.ceil((targetPct * total) / 100) });
      }
    }
  }
  for (const b of byRegion) {
    if (b.targetPct == null || b.deviation == null) continue;
    if (b.deviation < -2) gaps.push({ axis: "region", key: b.key, missingPct: -b.deviation, missingCount: Math.ceil((-b.deviation * total) / 100) });
    if (b.deviation > 5) excess.push({ axis: "region", key: b.key, excessPct: b.deviation, excessCount: Math.ceil((b.deviation * total) / 100) });
  }
  for (const b of byType) {
    if (b.deviation != null && b.deviation < -2) {
      gaps.push({ axis: "type", key: b.key, missingPct: -b.deviation, missingCount: Math.ceil((-b.deviation * total) / 100) });
    }
  }

  gaps.sort((a, b) => b.missingPct - a.missingPct);
  excess.sort((a, b) => b.excessPct - a.excessPct);

  return { total, approvedTotal, reviewedTotal, byEra, byRegion, byType, byTag, gaps, excess };
}

// Cercle de production estimé (heuristique simple basée sur la taille du catalogue).
// Cf. docs/editorial-guidelines.md "Stratégie de production en cercles concentriques".
export function estimateCircleForBatch(total: number): 1 | 2 | 3 | 4 {
  if (total < 200) return 1;       // grands classiques universels
  if (total < 500) return 2;       // programmes scolaires
  if (total < 1000) return 3;      // amateurs d'histoire
  return 4;                         // passionnés
}
