#!/usr/bin/env -S tsx
// Bulk gameplay-balance des cartes data/normalized/ — applique les heuristiques
// de gameplay-balancer.md de manière déterministe (sans agent LLM).
//
// Règles (cf. .claude/agents/gameplay-balancer.md) :
//
// whenDelta — Plancher par era + min pour periodique :
//   prehist : 2000-10000
//   antiq   : 25-500
//   medi    : 25-100
//   modern  : 5-25 (mais 25 minimum, palier 5 retiré)
//   contemp : 5-25 (idem)
//   periodique avec range > 500 → whenDelta ≥ (end-start)/2
//
// whereRadiusKm — par placeKind :
//   creation_place, construction_site, birth_place, signature_place,
//     current_exhibition, discovery_site, death_place : 200-500
//   battle_site, landing_site                          : 500-800
//   capital_or_power_center, publication_place         : 800-1200
//   diffusion_area, origin_area, symbolic_location     : 1500-3000
//
// difficulty :
//   whenDelta 25-100      → precise
//   whenDelta 500-1000    → regional
//   whenDelta 2000        → extended
//   whenDelta 5000-10000  → special
//
//   whereRadiusKm 200-500     → precise
//   whereRadiusKm 800-1200    → regional
//   whereRadiusKm 2000-3000   → extended
//
// Passe également status à "reviewed".

import fs from "node:fs";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";
import { CardSchema, type Card } from "../schemas/card.schema.js";

type WhenDelta = 25 | 100 | 500 | 1000 | 2000 | 5000 | 10000;
type WhereRadius = 200 | 500 | 800 | 1200 | 2000 | 3000;

function chooseWhenDelta(c: Card): WhenDelta {
  const era = c.gameplay.era;
  const tag = c.canonical.time.tag;
  const start = c.canonical.time.startYear;
  const end = c.canonical.time.endYear;

  // Plancher periodique : (end-start)/2 si range > 500
  let periodiqueFloor: number | null = null;
  if (tag === "periodique" && start != null && end != null) {
    const range = end - start;
    if (range > 500) {
      periodiqueFloor = Math.ceil(range / 2);
    }
  }

  // Plancher era
  let eraDefault: WhenDelta;
  switch (era) {
    case "prehist":
      eraDefault = 5000;
      break;
    case "antiq":
      eraDefault = 100;
      break;
    case "medi":
      eraDefault = 25;
      break;
    case "modern":
      eraDefault = 25;
      break;
    case "contemp":
      eraDefault = 25;
      break;
  }

  if (periodiqueFloor != null) {
    // Snap au palier supérieur ou égal
    for (const tier of [25, 100, 500, 1000, 2000, 5000, 10000] as WhenDelta[]) {
      if (tier >= periodiqueFloor && tier >= eraDefault) return tier;
    }
    return 10000;
  }
  return eraDefault;
}

function chooseWhereRadius(c: Card): WhereRadius {
  const pk = c.canonical.place.placeKind;
  switch (pk) {
    case "creation_place":
    case "construction_site":
    case "birth_place":
    case "signature_place":
    case "current_exhibition":
    case "discovery_site":
    case "death_place":
      return 200;
    case "battle_site":
    case "landing_site":
      return 500;
    case "capital_or_power_center":
    case "publication_place":
      return 800;
    case "diffusion_area":
    case "origin_area":
    case "symbolic_location":
      return 2000;
    default:
      return 800;
  }
}

function difficultyForWhen(d: number): Card["gameplay"]["difficultyWhen"] {
  if (d <= 100) return "precise";
  if (d <= 1000) return "regional";
  if (d <= 2000) return "extended";
  return "special";
}

function difficultyForWhere(r: number): Card["gameplay"]["difficultyWhere"] {
  if (r <= 500) return "precise";
  if (r <= 1200) return "regional";
  return "extended";
}

const verdicts: { slug: string; changes: string[] }[] = [];

for (const file of listJsonFiles(PATHS.normalized)) {
  const raw = readJson<any>(file);
  const before = CardSchema.parse(raw);
  const changes: string[] = [];

  const newWhenDelta = chooseWhenDelta(before);
  const newWhereRadius = chooseWhereRadius(before);
  const newDifficultyWhen = difficultyForWhen(newWhenDelta);
  const newDifficultyWhere = difficultyForWhere(newWhereRadius);

  if (raw.gameplay.whenDelta !== newWhenDelta) {
    changes.push(`whenDelta ${raw.gameplay.whenDelta} → ${newWhenDelta}`);
    raw.gameplay.whenDelta = newWhenDelta;
  }
  if (raw.gameplay.whereRadiusKm !== newWhereRadius) {
    changes.push(`whereRadiusKm ${raw.gameplay.whereRadiusKm} → ${newWhereRadius}`);
    raw.gameplay.whereRadiusKm = newWhereRadius;
  }
  if (raw.gameplay.difficultyWhen !== newDifficultyWhen) {
    changes.push(`difficultyWhen ${raw.gameplay.difficultyWhen} → ${newDifficultyWhen}`);
    raw.gameplay.difficultyWhen = newDifficultyWhen;
  }
  if (raw.gameplay.difficultyWhere !== newDifficultyWhere) {
    changes.push(`difficultyWhere ${raw.gameplay.difficultyWhere} → ${newDifficultyWhere}`);
    raw.gameplay.difficultyWhere = newDifficultyWhere;
  }
  if (raw.editorial.status !== "reviewed") {
    changes.push(`status ${raw.editorial.status} → reviewed`);
    raw.editorial.status = "reviewed";
  }

  if (changes.length === 0) continue;

  // Re-valide pour s'assurer qu'on n'a rien cassé
  const parsed = CardSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`✗ ${path.basename(file, ".json")} — validation échouée après bulk-balance :`);
    for (const e of parsed.error.errors) {
      console.error(`    ${e.path.join(".")}: ${e.message}`);
    }
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
  verdicts.push({ slug: path.basename(file, ".json"), changes });
}

import path from "node:path";

verdicts.sort((a, b) => a.slug.localeCompare(b.slug));

console.log(`${verdicts.length} cartes ajustées :\n`);
for (const v of verdicts) {
  console.log(`[${v.slug}]`);
  for (const c of v.changes) console.log(`    - ${c}`);
}
