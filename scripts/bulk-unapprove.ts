#!/usr/bin/env -S tsx
// Bulk-unapprove : flip editorial.status de toutes les cartes "approved"
// vers "reviewed". Bump contentVersion au passage.
//
// Cas d'usage : audit complet du catalogue avant un push initial.
// Une fois lancé, npm run push:db ne pousse plus rien tant que tu n'as pas
// re-approuvé les cartes une à une via l'app de review (ou en batch via
// auto-promote --apply).
//
// Usage :
//   npx tsx scripts/bulk-unapprove.ts            # dry-run (default)
//   npx tsx scripts/bulk-unapprove.ts --apply    # exécute

import fs from "node:fs";
import path from "node:path";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";

const APPLY = process.argv.includes("--apply");

const cardFiles = listJsonFiles(PATHS.cards);
if (cardFiles.length === 0) {
  console.log("Aucune carte dans data/cards/.");
  process.exit(0);
}

type Verdict = { slug: string; dexNum: string; file: string; fromVersion: number };
const targets: Verdict[] = [];
let skipped = 0;

for (const file of cardFiles) {
  const slug = path.basename(file, ".json");
  let raw: Record<string, unknown>;
  try {
    raw = readJson<Record<string, unknown>>(file);
  } catch {
    skipped++;
    continue;
  }
  const editorial = raw.editorial as Record<string, unknown> | undefined;
  if (editorial?.status !== "approved") {
    skipped++;
    continue;
  }
  targets.push({
    slug,
    dexNum: typeof raw.dexNum === "string" ? raw.dexNum : "?",
    file,
    fromVersion: typeof editorial.contentVersion === "number" ? editorial.contentVersion : 0,
  });
}

targets.sort((a, b) => Number(a.dexNum) - Number(b.dexNum));

console.log(`${APPLY ? "" : "[DRY-RUN] "}Bulk-unapprove bilan :\n`);
console.log(`  À flipper (approved → reviewed) : ${targets.length}`);
console.log(`  Ignorées (autre statut)         : ${skipped}\n`);

if (targets.length > 0 && targets.length <= 20) {
  console.log("Cartes à flipper :");
  for (const v of targets) {
    console.log(`  [${v.dexNum}] ${v.slug} (v${v.fromVersion} → v${v.fromVersion + 1})`);
  }
} else if (targets.length > 20) {
  console.log("Premières 10 :");
  for (const v of targets.slice(0, 10)) {
    console.log(`  [${v.dexNum}] ${v.slug} (v${v.fromVersion} → v${v.fromVersion + 1})`);
  }
  console.log(`  … et ${targets.length - 10} autres.`);
}
console.log();

if (!APPLY) {
  console.log("(dry-run : aucun statut modifié. Relance avec --apply pour appliquer.)");
  process.exit(0);
}

let flipped = 0;
for (const v of targets) {
  const raw = readJson<Record<string, unknown>>(v.file);
  const editorial = raw.editorial as Record<string, unknown>;
  editorial.status = "reviewed";
  if (typeof editorial.contentVersion === "number") {
    editorial.contentVersion += 1;
  }
  fs.writeFileSync(v.file, JSON.stringify(raw, null, 2) + "\n", "utf8");
  flipped++;
}
console.log(`✓ ${flipped} carte(s) passée(s) en editorial.status="reviewed"`);
console.log("\nProchaine étape : npm run review-images → revérifie + clic Approuver.");
