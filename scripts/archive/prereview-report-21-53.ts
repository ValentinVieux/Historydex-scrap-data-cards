#!/usr/bin/env -S tsx
// Génère un rapport pré-review pour les cartes 21-53 :
//   - score Vision Haiku par carte (et issues détectées)
//   - warnings invariants restants par carte
//   - flag "priorité" pour orienter la review humaine
//
// Sortie : reports/prereview-21-53-<ts>.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listJsonFiles, PATHS, readJson, writeText, nowIso, nowStamp } from "./_lib/io.js";
import { CardSchema } from "../schemas/card.schema.js";
import { runInvariants } from "./_lib/invariants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_FILE = path.join(PATHS.exports, "..", "data", "_images-cache", "_index.json");
const indexJson = fs.existsSync(INDEX_FILE) ? readJson<any>(INDEX_FILE) : {};

// Charge toutes les cartes via Zod pour pouvoir invoquer runInvariants.
const allLoaded: { file: string; data: any }[] = [];
for (const file of listJsonFiles(PATHS.approved)) {
  const raw = readJson<any>(file);
  const parsed = CardSchema.safeParse(raw);
  if (parsed.success) {
    allLoaded.push({ file, data: parsed.data });
  }
}
const allIssues = runInvariants(
  allLoaded.map((c) => ({ file: c.file, source: "approved" as const, data: c.data })),
);

type Row = {
  dexNum: string;
  id: string;
  visionScore: number | null;
  visionIssues: string[];
  visionReasoning: string;
  warnings: { rule: string; message: string }[];
  priority: "high" | "medium" | "low";
};

const rows: Row[] = [];

for (const c of allLoaded) {
  const dex = c.data.dexNum;
  if (dex < "021") continue;
  const entry = indexJson[dex];
  const crop = entry?.crop ?? {};
  const cardWarnings = allIssues
    .filter((i) => i.cardId === c.data.id && i.severity === "warning")
    .map((i) => ({ rule: i.rule, message: i.message }));

  // Priorité :
  //   high   = image score Vision < 6 OU >= 3 warnings invariants
  //   medium = score 6-7 OU 1-2 warnings
  //   low    = score >= 8 ET 0 warning
  const score = crop?.centeringScoreIfCentered ?? null;
  let priority: Row["priority"] = "low";
  if (score != null && score < 6) priority = "high";
  if (cardWarnings.length >= 3) priority = "high";
  if (priority !== "high") {
    if (score != null && score < 8) priority = "medium";
    if (cardWarnings.length >= 1) priority = "medium";
  }

  rows.push({
    dexNum: dex,
    id: c.data.id,
    visionScore: score,
    visionIssues: crop?.issues ?? [],
    visionReasoning: crop?.reasoning ?? "",
    warnings: cardWarnings,
    priority,
  });
}

rows.sort((a, b) => {
  const order = { high: 0, medium: 1, low: 2 };
  if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
  return a.dexNum.localeCompare(b.dexNum);
});

const out: string[] = [];
out.push(`# Pré-review report — cartes 21-53`);
out.push("");
out.push(`Généré : ${nowIso()}`);
out.push(`Cartes : **${rows.length}**`);
out.push("");
out.push(`Priorité high : ${rows.filter((r) => r.priority === "high").length}`);
out.push(`Priorité medium : ${rows.filter((r) => r.priority === "medium").length}`);
out.push(`Priorité low : ${rows.filter((r) => r.priority === "low").length}`);
out.push("");
out.push("## Légende priorité");
out.push("");
out.push("- **high** : score Vision < 6 OU ≥ 3 warnings invariants — regarder en premier");
out.push("- **medium** : score Vision 6-7 OU 1-2 warnings");
out.push("- **low** : score Vision ≥ 8 ET 0 warning — relecture rapide suffit");
out.push("");
out.push("## Tableau récapitulatif");
out.push("");
out.push("| Prio | dex | id | Vision | Warnings |");
out.push("|---|---|---|---:|---:|");
for (const r of rows) {
  const score = r.visionScore != null ? `${r.visionScore}/10` : "—";
  out.push(`| **${r.priority}** | ${r.dexNum} | ${r.id} | ${score} | ${r.warnings.length} |`);
}
out.push("");
out.push("## Détail par carte");
out.push("");
for (const r of rows) {
  out.push(`### ${r.dexNum} — ${r.id} — **${r.priority}**`);
  out.push("");
  if (r.visionScore != null) {
    out.push(`**Vision** : score ${r.visionScore}/10`);
    if (r.visionIssues.length > 0) {
      out.push(`- Issues : ${r.visionIssues.map((i) => `\`${i}\``).join(", ")}`);
    }
    if (r.visionReasoning) {
      out.push(`- Raisonnement : ${r.visionReasoning}`);
    }
  }
  if (r.warnings.length > 0) {
    out.push("");
    out.push("**Warnings invariants** :");
    for (const w of r.warnings) {
      out.push(`- \`${w.rule}\` — ${w.message}`);
    }
  }
  out.push("");
}

const reportFile = path.join(PATHS.reports, `prereview-21-53-${nowStamp()}.md`);
writeText(reportFile, out.join("\n"));
console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);
console.log(`high: ${rows.filter((r) => r.priority === "high").length}, medium: ${rows.filter((r) => r.priority === "medium").length}, low: ${rows.filter((r) => r.priority === "low").length}`);
