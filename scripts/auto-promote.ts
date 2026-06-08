#!/usr/bin/env -S tsx
// Auto-promotion en batch : flip editorial.status de "reviewed" à "approved"
// pour toutes les cartes éligibles du catalogue.
//
// Depuis la migration single-folder (mai 2026), il n'y a plus de déplacement
// de fichier : toutes les cartes vivent dans data/cards/, le statut est la
// seule source de vérité. Ce script est l'équivalent batch du bouton
// "Approuver" de l'app de review (mêmes pre-conditions, sans le check de crop).
//
// La logique de pré-conditions est centralisée dans scripts/_lib/pre-approve.ts
// (partagée avec l'endpoint POST /api/cards/:dexNum/approve du review-server).
//
// ⚠️ Ce script NE vérifie PAS la présence du crop d'image (contrairement
// à l'endpoint /approve de l'app de review, plus strict). Il sert à
// approuver en masse des cartes textuellement complètes ; le passage par
// l'app de review reste recommandé pour vérifier visuellement le crop.
//
// Usage :
//   npx tsx scripts/auto-promote.ts            # dry-run (par défaut, safe)
//   npx tsx scripts/auto-promote.ts --apply    # applique le flip status

import fs from "node:fs";
import path from "node:path";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";
import { checkApprovalPreconditions, type Blocker } from "./_lib/pre-approve.js";

const APPLY = process.argv.includes("--apply");

type Verdict = {
  slug: string;
  dexNum: string;
  file: string;
  decision: "promote" | "block" | "skip";
  blockers: Blocker[];
};

const verdicts: Verdict[] = [];

const cardFiles = listJsonFiles(PATHS.cards);
if (cardFiles.length === 0) {
  console.log("Aucune carte dans data/cards/. Rien à promouvoir.");
  process.exit(0);
}

for (const file of cardFiles) {
  const slug = path.basename(file, ".json");
  let raw: Record<string, unknown>;
  try {
    raw = readJson<Record<string, unknown>>(file);
  } catch (err) {
    verdicts.push({
      slug,
      dexNum: "?",
      file,
      decision: "block",
      blockers: [{ rule: "io", message: (err as Error).message.slice(0, 200) }],
    });
    continue;
  }

  const dexNum = typeof raw.dexNum === "string" ? raw.dexNum : "?";

  // Filtre statut : on ne traite que les "reviewed".
  const editorial = raw.editorial as Record<string, unknown> | undefined;
  const status = editorial?.status as string | undefined;
  if (status !== "reviewed") {
    verdicts.push({
      slug,
      dexNum,
      file,
      decision: "skip",
      blockers: [{ rule: "status", message: `status=${status ?? "?"} (rien à faire)` }],
    });
    continue;
  }

  // Pre-conditions (sans check de crop — batch CLI, pas review visuelle).
  const blockers = checkApprovalPreconditions(raw, { requireImageCrop: false });

  verdicts.push({
    slug,
    dexNum,
    file,
    decision: blockers.length === 0 ? "promote" : "block",
    blockers,
  });
}

verdicts.sort((a, b) => a.dexNum.localeCompare(b.dexNum));

const promoted = verdicts.filter((v) => v.decision === "promote");
const blocked = verdicts.filter((v) => v.decision === "block");
const skipped = verdicts.filter((v) => v.decision === "skip");

console.log(`${APPLY ? "" : "[DRY-RUN] "}Auto-promote bilan :\n`);
console.log(`  ✓ Éligibles à approved : ${promoted.length}`);
console.log(`  ✗ Bloquées en reviewed : ${blocked.length}`);
console.log(`  · Ignorées (autre statut) : ${skipped.length}\n`);

if (promoted.length > 0) {
  console.log("Cartes éligibles :");
  for (const v of promoted) {
    console.log(`  [${v.dexNum}] ${v.slug}`);
  }
  console.log();
}

if (blocked.length > 0) {
  console.log("Cartes bloquées :");
  for (const v of blocked) {
    console.log(`  [${v.dexNum}] ${v.slug}`);
    for (const b of v.blockers) {
      console.log(`     - [${b.rule}] ${b.message}`);
    }
  }
  console.log();
}

if (!APPLY) {
  console.log("(dry-run : aucun statut modifié. Relance avec --apply pour appliquer.)");
  process.exit(0);
}

// Application : flip status="approved" en place. Bump contentVersion.
let flipped = 0;
for (const v of promoted) {
  const raw = readJson<Record<string, unknown>>(v.file);
  const editorial = raw.editorial as Record<string, unknown>;
  editorial.status = "approved";
  if (typeof editorial.contentVersion === "number") {
    editorial.contentVersion += 1;
  }
  fs.writeFileSync(v.file, JSON.stringify(raw, null, 2) + "\n", "utf8");
  flipped++;
}
console.log(`✓ ${flipped} carte(s) passée(s) en editorial.status="approved"`);
