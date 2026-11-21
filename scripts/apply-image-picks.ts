#!/usr/bin/env -S tsx
// Applique les choix d'image du juge (étape 2/2, après scripts/image-candidates.ts).
//
// Entrée : JSONL, 1 ligne / carte :
//   {"dexNum":"1067","pick":3,"box":{"x":0.1,"y":0.2,"w":0.5,"h":0.6},
//    "confidence":"high"|"low","issues":["…"],"reasoning":"…"}
//   pick = n° de la candidate (planche contact), null = aucune acceptable.
//   box  = boîte du sujet, en fractions de l'image candidate.
// Effet : candidate → data/_images-cache/<dex>.jpg ; cadrage 1.37 qui contient le sujet
// (centré sur la boîte, étendu au minimum, borné à l'image) → data/_images-final/<dex>.jpg
// 800×584 ; entrée _index.json au format de l'app de review (crop.source = "vision").
// confidence "low" ⇒ crop.reviewed = false → la carte reste à revoir dans `npm run review-images`.
// Une carte dont le crop a déjà été validé par un humain (source "manual"/"centered" reviewed) est sautée.
//
// DRY-RUN par défaut.   npx tsx scripts/apply-image-picks.ts <picks.jsonl> [--apply]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PATHS, ensureDir, nowIso } from "./_lib/io.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";

const DATA = path.join(PATHS.exports, "..", "data");
const CAND = path.join(DATA, "_images-candidates");
const CACHE = path.join(DATA, "_images-cache");
const FINAL = path.join(DATA, "_images-final");
const INDEX = path.join(CACHE, "_index.json");
const RATIO = 1.37, OUT_W = 800, OUT_H = Math.round(OUT_W / RATIO);
const PAD = 1.15; // marge autour du sujet

type Box = { x: number; y: number; w: number; h: number };
type Pick = { dexNum: string; pick: number | null; box?: Box; confidence: "high" | "low"; issues?: string[]; reasoning?: string };

/** Plus petit rectangle au ratio 1.37 contenant la boîte (+ marge), centré dessus, dans l'image. */
export function cropRect(W: number, H: number, b: Box) {
  const bx = b.x * W, by = b.y * H, bw = b.w * W, bh = b.h * H;
  const maxW = Math.min(W, H * RATIO);
  let w = Math.min(maxW, Math.max(bw * PAD, bh * PAD * RATIO, Math.min(maxW, OUT_W))); // ponytail: pas plus serré que 800 px source si possible (pas d'upscale)
  const h = w / RATIO;
  const cx = bx + bw / 2, cy = by + bh / 2;
  const left = Math.max(0, Math.min(W - w, cx - w / 2));
  const top = Math.max(0, Math.min(H - h, cy - h / 2));
  return { left: Math.round(left), top: Math.round(top), width: Math.round(w), height: Math.round(h) };
}

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const APPLY = argv.includes("--apply");
if (argv.includes("--selftest")) {
  const r = cropRect(1600, 1000, { x: 0.4, y: 0.4, w: 0.1, h: 0.1 });
  console.assert(Math.abs(r.width / r.height - RATIO) < 0.01 && r.width === 800, "ratio/min width", r);
  const e = cropRect(1600, 1000, { x: 0, y: 0, w: 1, h: 1 }); // sujet plein cadre → bornée à l'image
  console.assert(e.left >= 0 && e.top >= 0 && e.left + e.width <= 1600 && e.top + e.height <= 1000, "inside", e);
  const c = cropRect(1600, 1000, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }); // coin → recalée dedans
  console.assert(c.left + c.width <= 1600 && c.top + c.height <= 1000, "clamp", c);
  console.log("selftest ok", r, e, c);
  process.exit(0);
}
if (!input) { console.error("usage: apply-image-picks.ts <picks.jsonl> [--apply]"); process.exit(1); }

const picks = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Pick);
const cardIds = new Map(loadCardsFromDir(PATHS.cards).cards.map((c) => [c.data.dexNum, c.data.id]));
const index: Record<string, any> = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, "utf8")) : {};
const out: string[] = [];

for (const p of picks) {
  const prev = index[p.dexNum]?.crop;
  if (prev?.reviewed && prev.source !== "vision") { out.push(`[${p.dexNum}] crop humain déjà validé — sauté`); continue; }
  if (p.pick == null || !p.box) { out.push(`[${p.dexNum}] ⚠️ aucune image retenue — ${p.reasoning ?? ""}`); continue; }
  const cands = JSON.parse(fs.readFileSync(path.join(CAND, p.dexNum, "candidates.json"), "utf8"));
  const c = cands[p.pick - 1];
  if (!c) { out.push(`[${p.dexNum}] ❌ candidate #${p.pick} inexistante`); continue; }
  const src = path.join(CAND, p.dexNum, c.local);
  const meta = await sharp(src).metadata();
  const rect = cropRect(meta.width!, meta.height!, p.box);
  out.push(`[${p.dexNum}] #${p.pick} ${c.file} → crop ${rect.width}×${rect.height}@${rect.left},${rect.top} (${p.confidence})${p.issues?.length ? " · " + p.issues.join("; ") : ""}`);
  if (!APPLY) continue;
  ensureDir(CACHE); ensureDir(FINAL);
  fs.copyFileSync(src, path.join(CACHE, `${p.dexNum}.jpg`));
  await sharp(src).extract(rect).resize(OUT_W, OUT_H).jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(FINAL, `${p.dexNum}.jpg`));
  const entry = index[p.dexNum] ?? {};
  if (entry.crop) entry.previousCrops = [entry.crop, ...(entry.previousCrops ?? [])].slice(0, 5);
  index[p.dexNum] = {
    ...entry, dexNum: p.dexNum, cardId: cardIds.get(p.dexNum) ?? entry.cardId ?? null,
    wikipediaTitle: entry.wikipediaTitle ?? null, sourceUrl: c.url, sourcePageUrl: c.descUrl, resolvedLang: null,
    attribution: `${c.artist || "auteur inconnu"} — ${c.license} — Wikimedia Commons (${c.file})`,
    localFile: `${p.dexNum}.jpg`, status: "ok", fetchedAt: nowIso(),
    crop: { cropDecisionVersion: 2, source: "vision", model: "claude-subagent",
      subjectBoundingBox: { x: Math.round(p.box.x * meta.width!), y: Math.round(p.box.y * meta.height!), width: Math.round(p.box.w * meta.width!), height: Math.round(p.box.h * meta.height!) },
      manualExtract: rect, issues: p.issues ?? [], reasoning: p.reasoning, ratio: RATIO,
      finalFile: `${p.dexNum}.jpg`, reviewed: p.confidence === "high", cropAppliedAt: nowIso() },
  };
}
if (APPLY) fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(out.join("\n") + `\n\n${APPLY ? "Écrit" : "DRY-RUN"} : ${picks.length} ligne(s).`);
