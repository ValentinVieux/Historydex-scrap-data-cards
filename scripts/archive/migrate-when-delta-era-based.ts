#!/usr/bin/env -S tsx
/**
 * One-shot : aligne gameplay.whenDelta sur HD_ERA_WHEN_DELTAS[era] pour toutes les
 * cartes de data/normalized/ et data/approved/.
 *
 * Dry-run par défaut. Flag --apply pour persister.
 *
 *   npx tsx scripts/migrate-when-delta-era-based.ts            # dry-run
 *   npx tsx scripts/migrate-when-delta-era-based.ts --apply    # écrit les JSON
 */
import path from "node:path";
import fs from "node:fs";
import { HD_ERA_WHEN_DELTAS, ERAS } from "../schemas/card.schema.js";
import { PATHS, ensureDir, listJsonFiles, nowStamp, readJson, writeJson, writeText } from "./_lib/io.js";

type Era = (typeof ERAS)[number];

type RawCard = {
  id?: string;
  dexNum?: string;
  canonical?: { type?: string; time?: { tag?: string } };
  gameplay?: { era?: Era; whenDelta?: number; balanceNotes?: string };
  editorial?: { status?: string };
};

type Change = {
  file: string;
  dexNum: string;
  id: string;
  source: "normalized" | "approved";
  status: string;
  era: Era;
  type: string;
  tag: string;
  before: number;
  after: number;
};

function migrateDir(dir: string, source: "normalized" | "approved", apply: boolean, dateStamp: string): {
  changes: Change[];
  unchanged: number;
  errors: string[];
} {
  const files = listJsonFiles(dir);
  const changes: Change[] = [];
  const errors: string[] = [];
  let unchanged = 0;

  for (const file of files) {
    let card: RawCard;
    try {
      card = readJson<RawCard>(file);
    } catch (err) {
      errors.push(`${path.relative(process.cwd(), file)} : JSON invalide — ${(err as Error).message}`);
      continue;
    }

    const era = card.gameplay?.era;
    const current = card.gameplay?.whenDelta;

    if (!era || !ERAS.includes(era)) {
      errors.push(`${path.relative(process.cwd(), file)} : gameplay.era manquant ou invalide (${String(era)})`);
      continue;
    }
    if (typeof current !== "number") {
      errors.push(`${path.relative(process.cwd(), file)} : gameplay.whenDelta manquant`);
      continue;
    }

    const expected = HD_ERA_WHEN_DELTAS[era];
    if (current === expected) {
      unchanged++;
      continue;
    }

    const change: Change = {
      file,
      dexNum: card.dexNum ?? "?",
      id: card.id ?? "?",
      source,
      status: card.editorial?.status ?? "?",
      era,
      type: card.canonical?.type ?? "?",
      tag: card.canonical?.time?.tag ?? "?",
      before: current,
      after: expected,
    };
    changes.push(change);

    if (apply) {
      if (!card.gameplay) {
        errors.push(`${path.relative(process.cwd(), file)} : gameplay manquant (cas étrange, skip)`);
        continue;
      }
      card.gameplay.whenDelta = expected;
      const note = `whenDelta aligné sur HD_ERA_WHEN_DELTAS[era] (${dateStamp})`;
      const prev = (card.gameplay.balanceNotes ?? "").trim();
      card.gameplay.balanceNotes = prev.length > 0 ? `${prev} ; ${note}` : note;
      writeJson(file, card);
    }
  }

  return { changes, unchanged, errors };
}

function formatChanges(changes: Change[]): string {
  if (changes.length === 0) return "_(aucune modification nécessaire)_\n";
  const lines: string[] = [];
  lines.push("| dexNum | id | source | status | era | type | tag | before → after |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of changes) {
    lines.push(
      `| ${c.dexNum} | ${c.id} | ${c.source} | ${c.status} | ${c.era} | ${c.type} | ${c.tag} | ${c.before} → ${c.after} |`,
    );
  }
  return lines.join("\n") + "\n";
}

function main(): number {
  const apply = process.argv.includes("--apply");
  const dateStamp = new Date().toISOString().slice(0, 10);

  ensureDir(PATHS.normalized);
  ensureDir(PATHS.approved);
  ensureDir(PATHS.reports);

  const norm = migrateDir(PATHS.normalized, "normalized", apply, dateStamp);
  const appr = migrateDir(PATHS.approved, "approved", apply, dateStamp);

  const allChanges = [...norm.changes, ...appr.changes];
  const allErrors = [...norm.errors, ...appr.errors];
  const totalUnchanged = norm.unchanged + appr.unchanged;

  // Distribution par ère parmi les changements
  const byEra = new Map<Era, number>();
  for (const c of allChanges) {
    byEra.set(c.era, (byEra.get(c.era) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# Migration whenDelta era-based — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Mode : **${apply ? "APPLY (écriture effective)" : "DRY-RUN"}**`);
  lines.push("");
  lines.push("## Table de référence HD_ERA_WHEN_DELTAS");
  lines.push("");
  for (const era of ERAS) {
    lines.push(`- \`${era}\` → ${HD_ERA_WHEN_DELTAS[era]}`);
  }
  lines.push("");
  lines.push("## Bilan");
  lines.push("");
  lines.push(`- Cartes inchangées : **${totalUnchanged}**`);
  lines.push(`- Cartes à modifier : **${allChanges.length}** (normalized=${norm.changes.length}, approved=${appr.changes.length})`);
  lines.push(`- Erreurs de lecture : **${allErrors.length}**`);
  if (allChanges.length > 0) {
    lines.push("");
    lines.push("### Répartition par ère parmi les modifications");
    for (const era of ERAS) {
      const n = byEra.get(era) ?? 0;
      if (n > 0) lines.push(`- \`${era}\` (→ ${HD_ERA_WHEN_DELTAS[era]}) : ${n}`);
    }
  }
  lines.push("");
  lines.push("## Détail (normalized)");
  lines.push("");
  lines.push(formatChanges(norm.changes));
  lines.push("## Détail (approved)");
  lines.push("");
  lines.push(formatChanges(appr.changes));
  if (allErrors.length > 0) {
    lines.push("## Erreurs");
    lines.push("");
    for (const e of allErrors) lines.push(`- ${e}`);
    lines.push("");
  }

  const reportFile = path.join(PATHS.reports, `migration-when-delta-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));

  console.log(`Mode : ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Inchangées : ${totalUnchanged}`);
  console.log(`À modifier : ${allChanges.length} (normalized=${norm.changes.length}, approved=${appr.changes.length})`);
  console.log(`Erreurs lecture : ${allErrors.length}`);
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);
  if (!apply && allChanges.length > 0) {
    console.log(`\nRelance avec --apply pour écrire les JSON.`);
  }
  if (allErrors.length > 0) {
    console.error("\n=== ERREURS ===");
    for (const e of allErrors) console.error(`  ${e}`);
    return 1;
  }
  return 0;
}

process.exit(main());
