#!/usr/bin/env -S tsx
// Auto-fixes textuels structurels pour les cartes 21-53 (jamais reviewées
// humainement). Trois corrections sans risque :
//
//   1. whenDelta=5 → 25  (5 retiré des paliers recommandés)
//   2. whenPrompt.post ← wherePrompt.post  (cohérence WHERE/WHEN, source de
//      vérité = wherePrompt qui a la table de vocabulaire la plus établie)
//   3. whereRadiusKm=300 → 500  (300 retiré des paliers, 500 est le plus proche
//      pour un lieu précis non-très-précis)
//
// Skip systématique des cartes 001-020 (déjà reviewées par l'utilisateur).
//
// Usage :
//   npx tsx scripts/autofix-cards-21-53.ts --dry-run   # preview seulement
//   npx tsx scripts/autofix-cards-21-53.ts             # applique

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CardSchema } from "../schemas/card.schema.js";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY = process.argv.includes("--dry-run");

type FixVerdict = {
  file: string;
  dexNum: string;
  id: string;
  changes: string[];
};

const verdicts: FixVerdict[] = [];

for (const file of listJsonFiles(PATHS.approved)) {
  const raw = readJson<any>(file);
  const dex = raw.dexNum;
  if (!dex || dex < "021") continue; // skip 001-020

  const changes: string[] = [];

  // Fix 1 : whenDelta=5 → 25
  if (raw.gameplay?.whenDelta === 5) {
    raw.gameplay.whenDelta = 25;
    changes.push(`gameplay.whenDelta: 5 → 25`);
  }

  // Fix 2 : whenPrompt.post ← wherePrompt.post (si différent)
  const wp = raw.display?.locales?.fr?.wherePrompt?.post;
  const np = raw.display?.locales?.fr?.whenPrompt?.post;
  if (wp && np && wp !== np) {
    raw.display.locales.fr.whenPrompt.post = wp;
    changes.push(`whenPrompt.post: ${JSON.stringify(np)} → ${JSON.stringify(wp)} (aligné sur wherePrompt.post)`);
  }

  // Fix 3 : whereRadiusKm=300 → 500
  if (raw.gameplay?.whereRadiusKm === 300) {
    raw.gameplay.whereRadiusKm = 500;
    changes.push(`gameplay.whereRadiusKm: 300 → 500`);
  }

  if (changes.length === 0) continue;

  // Valide via Zod
  const parsed = CardSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[${dex}] ${raw.id} — VALIDATION ÉCHOUÉE après autofix :`);
    for (const e of parsed.error.errors) {
      console.error(`  ${e.path.join(".")}: ${e.message}`);
    }
    continue;
  }

  if (!DRY) {
    fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
  }

  verdicts.push({ file, dexNum: dex, id: raw.id, changes });
}

verdicts.sort((a, b) => a.dexNum.localeCompare(b.dexNum));

console.log(`${DRY ? "[DRY-RUN] " : ""}${verdicts.length} carte(s) avec auto-fix appliqué :\n`);
for (const v of verdicts) {
  console.log(`[${v.dexNum}] ${v.id}`);
  for (const c of v.changes) console.log(`  - ${c}`);
}

console.log(`\nTotal modifications : ${verdicts.reduce((sum, v) => sum + v.changes.length, 0)}`);
if (DRY) console.log("(dry-run : aucun fichier écrit — relance sans --dry-run pour appliquer)");
