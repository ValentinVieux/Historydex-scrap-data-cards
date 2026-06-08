#!/usr/bin/env -S tsx
// One-shot migration : fusion data/normalized/*.json + data/approved/*.json
// vers data/cards/, en préservant editorial.status (D2 du plan).
//
// La séparation par dossier devient inutile une fois que editorial.status
// devient la source unique de vérité. Ce script ne touche pas au contenu
// JSON, il se contente de déplacer les fichiers.
//
// Usage :
//   npx tsx scripts/migrate-to-cards-folder.ts           # dry-run (default)
//   npx tsx scripts/migrate-to-cards-folder.ts --apply   # exécute

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DIRS = {
  normalized: path.join(ROOT, "data", "normalized"),
  approved: path.join(ROOT, "data", "approved"),
  cards: path.join(ROOT, "data", "cards"),
};

const APPLY = process.argv.includes("--apply");

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

type Probe = { dexNum: string | null; status: string | null };

function probe(file: string): Probe {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      dexNum: typeof raw.dexNum === "string" ? raw.dexNum : null,
      status: raw?.editorial?.status ?? null,
    };
  } catch {
    return { dexNum: null, status: null };
  }
}

const normalizedFiles = listJson(DIRS.normalized);
const approvedFiles = listJson(DIRS.approved);

console.log(`[${APPLY ? "APPLY" : "DRY-RUN"}] Migration vers data/cards/\n`);
console.log(`  data/normalized/ : ${normalizedFiles.length} fichier(s)`);
console.log(`  data/approved/   : ${approvedFiles.length} fichier(s)`);
console.log();

// 1. Collision de nom de fichier
const nameCollisions: string[] = [];
const normSet = new Set(normalizedFiles);
for (const f of approvedFiles) {
  if (normSet.has(f)) nameCollisions.push(f);
}
if (nameCollisions.length > 0) {
  console.error(`✗ Collision(s) de nom de fichier entre normalized/ et approved/ :`);
  for (const c of nameCollisions) console.error(`  - ${c}`);
  console.error(`\nRésous manuellement avant de relancer.`);
  process.exit(1);
}

// 2. Collision de dexNum
const dexMap = new Map<string, string[]>();
for (const f of normalizedFiles) {
  const { dexNum } = probe(path.join(DIRS.normalized, f));
  if (dexNum) {
    const arr = dexMap.get(dexNum) ?? [];
    arr.push(`normalized/${f}`);
    dexMap.set(dexNum, arr);
  }
}
for (const f of approvedFiles) {
  const { dexNum } = probe(path.join(DIRS.approved, f));
  if (dexNum) {
    const arr = dexMap.get(dexNum) ?? [];
    arr.push(`approved/${f}`);
    dexMap.set(dexNum, arr);
  }
}
const dexCollisions = [...dexMap.entries()].filter(([, files]) => files.length > 1);
if (dexCollisions.length > 0) {
  console.error(`✗ Collision(s) de dexNum :`);
  for (const [dex, files] of dexCollisions) {
    console.error(`  - dexNum=${dex} : ${files.join(", ")}`);
  }
  console.error(`\nRésous manuellement avant de relancer.`);
  process.exit(1);
}

// 3. Distribution des status (info)
const statusCounts: Record<string, number> = {};
const allFiles = [
  ...normalizedFiles.map((f) => path.join(DIRS.normalized, f)),
  ...approvedFiles.map((f) => path.join(DIRS.approved, f)),
];
for (const f of allFiles) {
  const s = probe(f).status ?? "?";
  statusCounts[s] = (statusCounts[s] ?? 0) + 1;
}
console.log(`Distribution des status (préservée telle quelle) :`);
for (const [s, n] of Object.entries(statusCounts).sort()) {
  console.log(`  ${s} : ${n}`);
}
console.log();

if (!APPLY) {
  console.log(
    `✓ Aucune collision détectée. ${
      normalizedFiles.length + approvedFiles.length
    } fichier(s) seraient déplacés vers data/cards/.`,
  );
  console.log(`Relance avec --apply pour exécuter.`);
  process.exit(0);
}

// 4. Exécution
fs.mkdirSync(DIRS.cards, { recursive: true });
let moved = 0;
for (const f of normalizedFiles) {
  fs.renameSync(path.join(DIRS.normalized, f), path.join(DIRS.cards, f));
  moved++;
}
for (const f of approvedFiles) {
  fs.renameSync(path.join(DIRS.approved, f), path.join(DIRS.cards, f));
  moved++;
}

// Maintien d'un .gitkeep dans data/cards/ pour le tracker git.
const gitkeep = path.join(DIRS.cards, ".gitkeep");
if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, "");

// 5. Suppression des dossiers vides
for (const dir of [DIRS.normalized, DIRS.approved]) {
  if (fs.existsSync(dir)) {
    const remaining = fs.readdirSync(dir);
    const onlyGitkeep = remaining.length === 0 || (remaining.length === 1 && remaining[0] === ".gitkeep");
    if (onlyGitkeep) {
      if (remaining[0] === ".gitkeep") fs.unlinkSync(path.join(dir, ".gitkeep"));
      fs.rmdirSync(dir);
      console.log(`✓ Dossier supprimé : ${path.relative(ROOT, dir)}`);
    } else {
      console.warn(
        `! Dossier non supprimé (contient encore : ${remaining.join(", ")}) : ${path.relative(ROOT, dir)}`,
      );
    }
  }
}

console.log();
console.log(`✓ ${moved} carte(s) déplacée(s) vers data/cards/`);
