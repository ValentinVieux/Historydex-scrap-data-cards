#!/usr/bin/env -S tsx
// Compare data/_approved-baseline/*.json vs data/approved/*.json
// pour les cartes dexNum 001-020 (20 premières review).
// Sortie : rapport markdown identifiant les patterns de correction.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "data", "_approved-baseline");
const APPROVED = path.join(ROOT, "data", "approved");
const IMG_BASELINE = path.join(ROOT, "data", "_images-baseline");
const IMG_FINAL = path.join(ROOT, "data", "_images-final");
const INDEX = path.join(ROOT, "data", "_images-cache", "_index.json");

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return -1;
  }
}

type Diff = {
  dexNum: string;
  id: string;
  changes: string[];
  imgChanged: boolean;
  imgBaselineSize: number;
  imgFinalSize: number;
  cropSource: string | null;
  hadPreviousCrops: number;
};

function diffField(label: string, a: any, b: any, changes: string[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const aStr = typeof a === "string" ? `"${a}"` : JSON.stringify(a);
  const bStr = typeof b === "string" ? `"${b}"` : JSON.stringify(b);
  changes.push(`  ${label}: ${aStr} → ${bStr}`);
}

const baselineFiles = fs.readdirSync(BASELINE).filter((f) => f.endsWith(".json"));
const indexJson = fs.existsSync(INDEX) ? readJson(INDEX) : {};

const diffs: Diff[] = [];

for (const file of baselineFiles) {
  const baseline = readJson(path.join(BASELINE, file));
  const approvedPath = path.join(APPROVED, file);
  if (!fs.existsSync(approvedPath)) continue;
  const current = readJson(approvedPath);
  const dex = baseline.dexNum;
  if (!dex || dex < "001" || dex > "020") continue;

  const changes: string[] = [];
  const a = baseline;
  const b = current;

  // Display.fr text
  const af = a.display.locales.fr;
  const bf = b.display.locales.fr;
  diffField("title", af.title, bf.title, changes);
  diffField("blurb", af.blurb, bf.blurb, changes);
  diffField("body", af.body, bf.body, changes);
  diffField("placeLabel", af.placeLabel, bf.placeLabel, changes);
  diffField("timeDisplayLabel", af.timeDisplayLabel, bf.timeDisplayLabel, changes);
  diffField("wherePrompt.pre", af.wherePrompt.pre, bf.wherePrompt.pre, changes);
  diffField("wherePrompt.verb", af.wherePrompt.verb, bf.wherePrompt.verb, changes);
  diffField("wherePrompt.post", af.wherePrompt.post, bf.wherePrompt.post, changes);
  diffField("imageLabel", a.display.imageLabel, b.display.imageLabel, changes);

  // Canonical time
  diffField("time.tag", a.canonical.time.tag, b.canonical.time.tag, changes);
  diffField("time.timeKind", a.canonical.time.timeKind, b.canonical.time.timeKind, changes);
  diffField("time.pivotYear", a.canonical.time.pivotYear, b.canonical.time.pivotYear, changes);
  diffField("time.startYear", a.canonical.time.startYear ?? null, b.canonical.time.startYear ?? null, changes);
  diffField("time.endYear", a.canonical.time.endYear ?? null, b.canonical.time.endYear ?? null, changes);
  diffField("time.justification", a.canonical.time.justification, b.canonical.time.justification, changes);

  // Canonical place
  diffField("place.lat", a.canonical.place.lat, b.canonical.place.lat, changes);
  diffField("place.lon", a.canonical.place.lon, b.canonical.place.lon, changes);
  diffField("place.placeKind", a.canonical.place.placeKind, b.canonical.place.placeKind, changes);

  // Gameplay
  diffField("gameplay.whenDelta", a.gameplay.whenDelta, b.gameplay.whenDelta, changes);
  diffField("gameplay.whereRadiusKm", a.gameplay.whereRadiusKm, b.gameplay.whereRadiusKm, changes);
  diffField("gameplay.era", a.gameplay.era, b.gameplay.era, changes);
  diffField("gameplay.difficultyWhen", a.gameplay.difficultyWhen, b.gameplay.difficultyWhen, changes);
  diffField("gameplay.difficultyWhere", a.gameplay.difficultyWhere, b.gameplay.difficultyWhere, changes);

  // Image
  const imgB = path.join(IMG_BASELINE, `${dex}.jpg`);
  const imgF = path.join(IMG_FINAL, `${dex}.jpg`);
  const sizeB = fileSize(imgB);
  const sizeF = fileSize(imgF);
  // Considère l'image différente si la taille diffère de plus de 100 octets
  // (les écritures sharp ne sont jamais identiques au bit près).
  const imgChanged = sizeB > 0 && sizeF > 0 && Math.abs(sizeB - sizeF) > 100;

  const idxEntry = indexJson[dex];
  const cropSource = idxEntry?.crop?.source ?? null;
  const previousCrops = idxEntry?.previousCrops?.length ?? 0;

  diffs.push({
    dexNum: dex,
    id: a.id,
    changes,
    imgChanged,
    imgBaselineSize: sizeB,
    imgFinalSize: sizeF,
    cropSource,
    hadPreviousCrops: previousCrops,
  });
}

diffs.sort((x, y) => x.dexNum.localeCompare(y.dexNum));

// Sortie markdown
const out: string[] = [];
out.push(`# Diff baseline vs après-review — cartes 001-020`);
out.push("");
out.push(`Généré : ${new Date().toISOString()}`);
out.push(`Cartes analysées : **${diffs.length}**`);
out.push("");

// Tally par catégorie
const tally: Record<string, number> = {};
for (const d of diffs) {
  for (const c of d.changes) {
    const fld = c.trim().split(":")[0];
    tally[fld] = (tally[fld] ?? 0) + 1;
  }
  if (d.imgChanged) tally["IMAGE_RECROPPED"] = (tally["IMAGE_RECROPPED"] ?? 0) + 1;
}
out.push("## Fréquence des modifications");
out.push("");
out.push("| Champ | Cartes touchées / 20 |");
out.push("|---|---:|");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  out.push(`| \`${k}\` | ${v} |`);
}
out.push("");

// Détail par carte
out.push("## Détail par carte");
out.push("");
for (const d of diffs) {
  const summary: string[] = [];
  if (d.imgChanged) {
    summary.push(`image recropée (${d.imgBaselineSize} → ${d.imgFinalSize} octets, source "${d.cropSource}", history=${d.hadPreviousCrops})`);
  }
  if (d.changes.length === 0 && !d.imgChanged) {
    out.push(`### ${d.dexNum} — ${d.id} — **aucune correction**`);
    out.push("");
    continue;
  }
  out.push(`### ${d.dexNum} — ${d.id}`);
  if (summary.length > 0) out.push(`- ${summary.join(" ; ")}`);
  if (d.changes.length > 0) {
    out.push("```");
    for (const c of d.changes) out.push(c);
    out.push("```");
  }
  out.push("");
}

const reportFile = path.join(ROOT, "reports", `review-diff-001-020-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, out.join("\n"), "utf8");
console.log(`Rapport : ${path.relative(ROOT, reportFile)}`);
console.log(`Cartes analysées : ${diffs.length}`);
console.log(`Modifications totales : ${Object.values(tally).reduce((a, b) => a + b, 0)}`);
