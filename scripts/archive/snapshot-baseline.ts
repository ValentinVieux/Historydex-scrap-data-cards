#!/usr/bin/env -S tsx
// Snapshot complet "avant review" : images finales + métadonnées des cartes.
//
// Pourquoi : avant une session de review humaine, on fige l'état actuel
// (crops auto-attention + textes/géo/temporalité courants des cartes
// `data/approved/*.json`) pour pouvoir comparer "avant review" vs "après
// review" et apprendre des corrections humaines (cadrage, choix d'imageLabel,
// reformulation de blurb, ajustement de pivotYear, etc.).
//
// Comme ce repo n'est pas (forcément) un dépôt git, on ne peut pas se reposer
// sur `git diff data/approved/`. D'où le snapshot manuel.
//
// Usage :
//   npm run snapshot:baseline             → refuse si la baseline existe déjà
//   npm run snapshot:baseline -- --force  → écrase la baseline existante
//   npm run snapshot:baseline -- --info   → affiche juste l'état (pas d'écriture)
//
// Effet :
//   data/_images-final/<dexNum>.jpg    → data/_images-baseline/<dexNum>.jpg
//   data/_images-cache/_index.json     → data/_images-baseline/_index.json
//   data/approved/<slug>.json          → data/_approved-baseline/<slug>.json
//   data/_images-baseline/_meta.json   ← écrit (createdAt, count, source)

import fs from "node:fs";
import path from "node:path";
import { ensureDir, nowIso, PATHS } from "./_lib/io.js";

const IMAGES_FINAL = path.join(PATHS.exports, "..", "data", "_images-final");
const IMAGES_CACHE = path.join(PATHS.exports, "..", "data", "_images-cache");
const IMAGES_BASELINE = path.join(PATHS.exports, "..", "data", "_images-baseline");
const APPROVED_BASELINE = path.join(PATHS.exports, "..", "data", "_approved-baseline");
const INDEX_FILE = path.join(IMAGES_CACHE, "_index.json");
const BASELINE_INDEX = path.join(IMAGES_BASELINE, "_index.json");
const BASELINE_META = path.join(IMAGES_BASELINE, "_meta.json");

type Meta = {
  createdAt: string;
  source: string;
  imageCount: number;
  imageBytes: number;
  approvedCount: number;
  approvedBytes: number;
  cropSourceCounts: Record<string, number>;
};

function listFinalImages(): string[] {
  if (!fs.existsSync(IMAGES_FINAL)) return [];
  return fs
    .readdirSync(IMAGES_FINAL)
    .filter((f) => /^\d{3,4}\.(jpg|jpeg|png)$/.test(f))
    .sort();
}

function listApprovedFiles(): string[] {
  if (!fs.existsSync(PATHS.approved)) return [];
  return fs
    .readdirSync(PATHS.approved)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function info(): void {
  const finals = listFinalImages();
  const approved = listApprovedFiles();
  const imagesBaselineExists = fs.existsSync(IMAGES_BASELINE);
  const approvedBaselineExists = fs.existsSync(APPROVED_BASELINE);
  console.log(`État courant :`);
  console.log(`  data/_images-final/        : ${finals.length} fichier(s)`);
  console.log(`  data/approved/             : ${approved.length} fichier(s)`);
  console.log(
    `  data/_images-baseline/     : ${imagesBaselineExists ? "présent" : "absent"}`,
  );
  console.log(
    `  data/_approved-baseline/   : ${approvedBaselineExists ? "présent" : "absent"}`,
  );
  if (imagesBaselineExists && fs.existsSync(BASELINE_META)) {
    try {
      const meta: Meta = JSON.parse(fs.readFileSync(BASELINE_META, "utf8"));
      console.log(`    createdAt        : ${meta.createdAt}`);
      console.log(`    imageCount       : ${meta.imageCount}`);
      console.log(`    approvedCount    : ${meta.approvedCount}`);
      console.log(`    source           : ${meta.source}`);
    } catch {
      console.log(`    (méta illisible)`);
    }
  }
}

function cropSourceFromIndex(): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!fs.existsSync(INDEX_FILE)) return counts;
  try {
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Record<
      string,
      { crop?: { source?: string } }
    >;
    for (const entry of Object.values(idx)) {
      const src = entry?.crop?.source ?? "(aucun)";
      counts[src] = (counts[src] ?? 0) + 1;
    }
  } catch {
    // ignore
  }
  return counts;
}

function snapshot(force: boolean): number {
  if (!fs.existsSync(IMAGES_FINAL)) {
    console.error(
      `data/_images-final/ n'existe pas. Lance d'abord 'npm run process-images'.`,
    );
    return 1;
  }
  const finals = listFinalImages();
  if (finals.length === 0) {
    console.error(`data/_images-final/ est vide. Rien à snapshoter.`);
    return 1;
  }
  const approved = listApprovedFiles();
  const baselineExists =
    fs.existsSync(IMAGES_BASELINE) || fs.existsSync(APPROVED_BASELINE);
  if (baselineExists && !force) {
    console.error(
      `Une baseline existe déjà (data/_images-baseline/ ou data/_approved-baseline/). Utilise --force pour écraser, ou --info pour voir l'état.`,
    );
    return 1;
  }

  if (force) {
    if (fs.existsSync(IMAGES_BASELINE)) fs.rmSync(IMAGES_BASELINE, { recursive: true, force: true });
    if (fs.existsSync(APPROVED_BASELINE)) fs.rmSync(APPROVED_BASELINE, { recursive: true, force: true });
  }
  ensureDir(IMAGES_BASELINE);
  ensureDir(APPROVED_BASELINE);

  // 1. Images finales
  let imageBytes = 0;
  for (const filename of finals) {
    const src = path.join(IMAGES_FINAL, filename);
    const dst = path.join(IMAGES_BASELINE, filename);
    fs.copyFileSync(src, dst);
    imageBytes += fs.statSync(src).size;
  }

  // 2. Index image cache (utile pour avoir attribution + source initiale du crop).
  if (fs.existsSync(INDEX_FILE)) {
    fs.copyFileSync(INDEX_FILE, BASELINE_INDEX);
  }

  // 3. Métadonnées des cartes (data/approved/*.json) — figeage des textes,
  //    géo, temporalité. Permet de comparer après tes éditions de review.
  let approvedBytes = 0;
  for (const filename of approved) {
    const src = path.join(PATHS.approved, filename);
    const dst = path.join(APPROVED_BASELINE, filename);
    fs.copyFileSync(src, dst);
    approvedBytes += fs.statSync(src).size;
  }

  const cropSourceCounts = cropSourceFromIndex();
  const meta: Meta = {
    createdAt: nowIso(),
    source: "data/_images-final/ + data/approved/ (état au moment du snapshot)",
    imageCount: finals.length,
    imageBytes,
    approvedCount: approved.length,
    approvedBytes,
    cropSourceCounts,
  };
  fs.writeFileSync(BASELINE_META, JSON.stringify(meta, null, 2) + "\n", "utf8");

  console.log(`Snapshot baseline figé.`);
  console.log(
    `  Images   : ${finals.length} fichier(s) → ${path.relative(process.cwd(), IMAGES_BASELINE)} (${(imageBytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  console.log(
    `  Approved : ${approved.length} fichier(s) → ${path.relative(process.cwd(), APPROVED_BASELINE)} (${(approvedBytes / 1024).toFixed(0)} KB)`,
  );
  if (Object.keys(cropSourceCounts).length > 0) {
    console.log(`  cropSource au snapshot :`);
    for (const [k, v] of Object.entries(cropSourceCounts)) {
      console.log(`    ${k.padEnd(18)} ${v}`);
    }
  }
  console.log(`  méta     : ${path.relative(process.cwd(), BASELINE_META)}`);
  console.log(``);
  console.log(`Tu peux maintenant lancer 'npm run review-images' et reviewer.`);
  console.log(`Les modifs (crops + textes/géo/temporalité) ne toucheront plus la baseline.`);
  return 0;
}

const args = process.argv.slice(2);
if (args.includes("--info")) {
  info();
  process.exit(0);
}
const force = args.includes("--force");
process.exit(snapshot(force));
