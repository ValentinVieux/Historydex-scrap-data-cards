#!/usr/bin/env -S tsx
import fs from "node:fs";
import path from "node:path";
import {
  CARD_TYPES,
  ERAS,
  REGIONS,
  REGION_LABELS,
  type Card,
} from "../schemas/card.schema.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS, ensureDir, nowStamp, writeText } from "./_lib/io.js";

const REGION_OVERREP_THRESHOLD = 0.35;
const REGION_UNDERREP_THRESHOLD = 0.05;
const UNDERREPRESENTED_REGIONS = [5, 7, 8, 9]; // Afrique, Asie du Sud, SEA & Pacifique, Amériques pré-c.

// Cibles de distribution (% du catalogue total).
// Inspirées des programmes scolaires français, pondérées contre l'eurocentrisme par défaut.
// Surchargeable via data/_targets.json (mêmes clés).
type Targets = {
  era: Record<string, number>;
  region: Record<string, number>;
  typeMinPct: number;
};

const DEFAULT_TARGETS: Targets = {
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

function loadTargets(): Targets {
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

function classifyDeviation(actualPct: number, targetPct: number): { flag: string; gap: number } {
  const gap = actualPct - targetPct;
  let flag: string;
  if (Math.abs(gap) < 2) flag = "OK";
  else if (gap > 5) flag = "DÉRIVE";
  else if (gap > 2) flag = "léger excès";
  else if (gap < -5 && targetPct >= 5) flag = "LACUNE";
  else flag = "léger déficit";
  return { flag, gap };
}

function bar(count: number, total: number, width = 30): string {
  if (total === 0) return "";
  const filled = Math.round((count / total) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

function tally<T extends string | number>(cards: Card[], pick: (c: Card) => T): Map<T, number> {
  const m = new Map<T, number>();
  for (const c of cards) {
    const k = pick(c);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function main(): number {
  ensureDir(PATHS.reports);

  const all = loadCardsFromDir(PATHS.cards);
  const cards = all.cards.map((c) => c.data);
  const total = cards.length;
  const reviewedCount = cards.filter((c) => c.editorial.status === "reviewed").length;
  const approvedCount = cards.filter((c) => c.editorial.status === "approved").length;
  const draftCount = cards.filter((c) => c.editorial.status === "draft").length;
  const archivedCount = cards.filter((c) => c.editorial.status === "archived").length;

  const lines: string[] = [];
  lines.push(`# Catalog report — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Total cartes chargées : **${total}** (reviewed=${reviewedCount}, approved=${approvedCount}, draft=${draftCount}, archived=${archivedCount})`);
  if (total === 0) {
    lines.push("");
    lines.push("_Aucune carte chargée. Ajoute des fichiers dans `data/cards/`._");
    const reportFile = path.join(PATHS.reports, `catalog-${nowStamp()}.md`);
    writeText(reportFile, lines.join("\n"));
    console.log(`Rapport : ${path.relative(process.cwd(), reportFile)} (catalogue vide)`);
    return 0;
  }

  // Distribution par ère
  lines.push("");
  lines.push("## Distribution par ère");
  lines.push("");
  const byEra = tally(cards, (c) => c.gameplay.era);
  for (const era of ERAS) {
    const n = byEra.get(era) ?? 0;
    lines.push(`- \`${era.padEnd(8)}\` ${String(n).padStart(4)} (${pct(n, total).padStart(6)}) ${bar(n, total)}`);
  }

  // Distribution par région
  lines.push("");
  lines.push("## Distribution par région");
  lines.push("");
  const byRegion = tally(cards, (c) => c.canonical.place.region);
  for (const r of REGIONS) {
    const n = byRegion.get(r) ?? 0;
    lines.push(`- \`R${String(r).padStart(2, "0")}\` ${String(n).padStart(4)} (${pct(n, total).padStart(6)}) ${bar(n, total)} — ${REGION_LABELS[r]}`);
  }

  // Distribution par type
  lines.push("");
  lines.push("## Distribution par type");
  lines.push("");
  const byType = tally(cards, (c) => c.canonical.type);
  for (const t of CARD_TYPES) {
    const n = byType.get(t) ?? 0;
    lines.push(`- \`${t.padEnd(7)}\` ${String(n).padStart(4)} (${pct(n, total).padStart(6)}) ${bar(n, total)}`);
  }

  // Distribution par tag
  lines.push("");
  lines.push("## Distribution par tag temporel");
  lines.push("");
  const byTag = tally(cards, (c) => c.canonical.time.tag);
  for (const tag of ["ponctuelle", "periodique"] as const) {
    const n = byTag.get(tag) ?? 0;
    lines.push(`- \`${tag.padEnd(11)}\` ${String(n).padStart(4)} (${pct(n, total).padStart(6)}) ${bar(n, total)}`);
  }

  // Distribution par status
  lines.push("");
  lines.push("## Distribution par status éditorial");
  lines.push("");
  const byStatus = tally(cards, (c) => c.editorial.status);
  for (const [k, v] of [...byStatus.entries()].sort()) {
    lines.push(`- \`${k.padEnd(9)}\` ${String(v).padStart(4)} (${pct(v, total).padStart(6)}) ${bar(v, total)}`);
  }

  // Distribution par confiance
  lines.push("");
  lines.push("## Distribution par confiance");
  lines.push("");
  const byConf = tally(cards, (c) => c.editorial.confidence);
  for (const [k, v] of [...byConf.entries()].sort()) {
    lines.push(`- \`${k.padEnd(7)}\` ${String(v).padStart(4)} (${pct(v, total).padStart(6)}) ${bar(v, total)}`);
  }

  // Difficulté
  lines.push("");
  lines.push("## Difficulté WHEN / WHERE");
  lines.push("");
  const byDiffWhen = tally(cards, (c) => c.gameplay.difficultyWhen);
  const byDiffWhere = tally(cards, (c) => c.gameplay.difficultyWhere);
  lines.push("**WHEN** :");
  for (const [k, v] of [...byDiffWhen.entries()].sort()) {
    lines.push(`- \`${k.padEnd(9)}\` ${String(v).padStart(4)} (${pct(v, total)}) ${bar(v, total)}`);
  }
  lines.push("");
  lines.push("**WHERE** :");
  for (const [k, v] of [...byDiffWhere.entries()].sort()) {
    lines.push(`- \`${k.padEnd(9)}\` ${String(v).padStart(4)} (${pct(v, total)}) ${bar(v, total)}`);
  }

  // Sources insuffisantes
  lines.push("");
  lines.push("## Cartes avec moins de 2 sources");
  lines.push("");
  const lowSrc = cards.filter((c) => c.editorial.sources.length < 2);
  if (lowSrc.length === 0) {
    lines.push("_(aucune)_");
  } else {
    for (const c of lowSrc) {
      lines.push(`- \`${c.id}\` (status=${c.editorial.status}, sources=${c.editorial.sources.length})`);
    }
  }

  // Cartes avec warnings éditoriaux
  lines.push("");
  lines.push("## Cartes avec warnings éditoriaux");
  lines.push("");
  const withWarn = cards.filter((c) => c.editorial.warnings.length > 0);
  if (withWarn.length === 0) {
    lines.push("_(aucune)_");
  } else {
    for (const c of withWarn) {
      lines.push(`- \`${c.id}\` — ${c.editorial.warnings.join(" ; ")}`);
    }
  }

  // Couverture cible vs actuelle
  lines.push("");
  lines.push("## Couverture cible vs actuelle");
  lines.push("");
  const targets = loadTargets();
  lines.push("### Par ère");
  lines.push("");
  for (const era of ERAS) {
    const n = byEra.get(era) ?? 0;
    const actualPct = total > 0 ? (n / total) * 100 : 0;
    const targetPct = targets.era[era] ?? 0;
    const { flag, gap } = classifyDeviation(actualPct, targetPct);
    const sign = gap >= 0 ? "+" : "";
    lines.push(`- \`${era.padEnd(8)}\` ${actualPct.toFixed(1).padStart(5)}% (cible ${String(targetPct).padStart(2)}%) [${sign}${gap.toFixed(1)}] **${flag}**`);
  }
  lines.push("");
  lines.push("### Par région");
  lines.push("");
  for (const r of REGIONS) {
    const n = byRegion.get(r) ?? 0;
    const actualPct = total > 0 ? (n / total) * 100 : 0;
    const targetPct = targets.region[String(r)] ?? 0;
    const { flag, gap } = classifyDeviation(actualPct, targetPct);
    const sign = gap >= 0 ? "+" : "";
    lines.push(`- \`R${String(r).padStart(2, "0")}\` ${actualPct.toFixed(1).padStart(5)}% (cible ${String(targetPct).padStart(2)}%) [${sign}${gap.toFixed(1)}] **${flag}** — ${REGION_LABELS[r]}`);
  }
  lines.push("");
  lines.push(`### Par type (cible : ≥ ${targets.typeMinPct}% par type)`);
  lines.push("");
  for (const t of CARD_TYPES) {
    const n = byType.get(t) ?? 0;
    const actualPct = total > 0 ? (n / total) * 100 : 0;
    let flag = "OK";
    if (actualPct === 0) flag = "ABSENT";
    else if (actualPct < targets.typeMinPct) flag = "déficit";
    lines.push(`- \`${t.padEnd(7)}\` ${actualPct.toFixed(1).padStart(5)}% (cible ≥${targets.typeMinPct}%) **${flag}**`);
  }

  // Suggestions concrètes basées sur les écarts
  lines.push("");
  lines.push("### Prochaines priorités suggérées");
  lines.push("");
  const suggestions: string[] = [];
  for (const era of ERAS) {
    const actualPct = total > 0 ? ((byEra.get(era) ?? 0) / total) * 100 : 0;
    const targetPct = targets.era[era] ?? 0;
    if (actualPct - targetPct < -5 && targetPct >= 5) {
      suggestions.push(`- Produire plus de cartes en ère **${era}** (actuel ${actualPct.toFixed(1)}%, cible ${targetPct}%)`);
    }
  }
  for (const r of REGIONS) {
    const actualPct = total > 0 ? ((byRegion.get(r) ?? 0) / total) * 100 : 0;
    const targetPct = targets.region[String(r)] ?? 0;
    if (actualPct - targetPct < -5 && targetPct >= 5) {
      suggestions.push(`- Produire plus de cartes en région **R${r} (${REGION_LABELS[r]})** (actuel ${actualPct.toFixed(1)}%, cible ${targetPct}%)`);
    }
  }
  for (const t of CARD_TYPES) {
    const actualPct = total > 0 ? ((byType.get(t) ?? 0) / total) * 100 : 0;
    if (actualPct === 0) {
      suggestions.push(`- Type **${t}** absent du catalogue — produire au moins 1 carte`);
    } else if (actualPct < targets.typeMinPct) {
      suggestions.push(`- Type **${t}** sous-représenté (actuel ${actualPct.toFixed(1)}%, cible ≥${targets.typeMinPct}%)`);
    }
  }
  if (suggestions.length === 0) {
    lines.push("_Aucune lacune majeure détectée — distribution équilibrée par rapport aux cibles._");
  } else {
    lines.push(...suggestions);
  }

  // Alertes équilibre éditorial
  lines.push("");
  lines.push("## Alertes équilibre éditorial");
  lines.push("");
  const region1Share = (byRegion.get(1) ?? 0) / total;
  if (region1Share > REGION_OVERREP_THRESHOLD) {
    lines.push(
      `- **WARNING** Eurocentrisme : Europe occidentale = ${pct(byRegion.get(1) ?? 0, total)} > ${REGION_OVERREP_THRESHOLD * 100}%`,
    );
  }
  for (const r of UNDERREPRESENTED_REGIONS) {
    const share = (byRegion.get(r) ?? 0) / total;
    if (share < REGION_UNDERREP_THRESHOLD) {
      lines.push(
        `- **WARNING** Région sous-représentée : ${REGION_LABELS[r]} (R${r}) = ${pct(byRegion.get(r) ?? 0, total)} < ${REGION_UNDERREP_THRESHOLD * 100}%`,
      );
    }
  }
  const typesAbsent = CARD_TYPES.filter((t) => (byType.get(t) ?? 0) === 0);
  if (typesAbsent.length > 0) {
    lines.push(`- **INFO** Types absents : ${typesAbsent.join(", ")}`);
  }

  const reportFile = path.join(PATHS.reports, `catalog-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);
  return 0;
}

process.exit(main());
