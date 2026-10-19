#!/usr/bin/env -S tsx
import path from "node:path";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { normVerb, runInvariants, type Issue } from "./_lib/invariants.js";
import { PATHS, ensureDir, nowStamp, writeText } from "./_lib/io.js";

function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) return "_(aucun)_\n";
  return issues
    .map(
      (i) =>
        `- **${i.severity.toUpperCase()}** [${i.rule}] ${path.relative(process.cwd(), i.file)}${i.cardId ? ` (${i.cardId})` : ""} — ${i.message}`,
    )
    .join("\n") + "\n";
}

function main(): number {
  ensureDir(PATHS.cards);
  ensureDir(PATHS.reports);

  const result = loadCardsFromDir(PATHS.cards);

  // Schema-level errors (these block validation)
  const schemaErrors: Issue[] = result.issues.flatMap((i) =>
    i.errors.map((e) => ({
      severity: "error" as const,
      file: i.file,
      rule: "schema",
      message: e,
    })),
  );

  // Invariant-level issues
  const invariantIssues = runInvariants(result.cards);

  const errors = [...schemaErrors, ...invariantIssues.filter((i) => i.severity === "error")];
  const warnings = invariantIssues.filter((i) => i.severity === "warning");

  // Verbes de consigne RARES (≤ 2 cartes approved/reviewed) : la queue de distribution est
  // là où se cache le jargon (revue de clarté 2026-10-18 : doublé, décimalisée, élancé…).
  // Pas une erreur — une liste à relire par card-qa. Clé normalisée comme l'invariant
  // placeKind-verb-coherence (normVerb). Denylist des verbes proscrits : prompt-verb-jargon.
  const verbUse = new Map<string, Set<string>>();
  for (const { data } of result.cards) {
    if (data.editorial.status !== "approved" && data.editorial.status !== "reviewed") continue;
    for (const p of [data.display.locales.fr.wherePrompt, data.display.locales.fr.whenPrompt]) {
      const k = normVerb(p.verb);
      if (!verbUse.has(k)) verbUse.set(k, new Set());
      verbUse.get(k)!.add(data.dexNum);
    }
  }
  const rareVerbs = [...verbUse].filter(([, d]) => d.size <= 2).sort(([a], [b]) => a.localeCompare(b, "fr"));

  const totalCards = result.cards.length;
  const reviewedCount = result.cards.filter((c) => c.data.editorial.status === "reviewed").length;
  const approvedCount = result.cards.filter((c) => c.data.editorial.status === "approved").length;
  const draftCount = result.cards.filter((c) => c.data.editorial.status === "draft").length;
  const archivedCount = result.cards.filter((c) => c.data.editorial.status === "archived").length;

  const lines: string[] = [];
  lines.push(`# Validation report — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- Cartes chargées : **${totalCards}** (reviewed=${reviewedCount}, approved=${approvedCount}, draft=${draftCount}, archived=${archivedCount})`);
  lines.push(`- Erreurs bloquantes : **${errors.length}**`);
  lines.push(`- Warnings : **${warnings.length}**`);
  lines.push("");
  lines.push("## Erreurs");
  lines.push(formatIssues(errors));
  lines.push("## Warnings");
  lines.push(formatIssues(warnings));
  lines.push(`## Verbes de consigne rares (≤ 2 cartes) — ${rareVerbs.length} à relire (card-qa)`);
  lines.push(rareVerbs.length === 0 ? "_(aucun)_\n" : rareVerbs.map(([v, d]) => `- **${v}** : ${[...d].join(", ")}`).join("\n") + "\n");

  const reportFile = path.join(PATHS.reports, `validation-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));

  // Console summary
  console.log(`Cartes : ${totalCards} (reviewed=${reviewedCount}, approved=${approvedCount}, draft=${draftCount}, archived=${archivedCount})`);
  console.log(`Erreurs : ${errors.length}`);
  console.log(`Warnings : ${warnings.length}`);
  console.log(`Verbes de consigne rares (≤ 2 cartes, relecture card-qa) : ${rareVerbs.length}`);
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);

  if (errors.length > 0) {
    console.error("\n=== ERREURS ===");
    for (const e of errors) {
      console.error(`  [${e.rule}] ${path.relative(process.cwd(), e.file)}${e.cardId ? ` (${e.cardId})` : ""} — ${e.message}`);
    }
  }
  if (warnings.length > 0 && process.env.VERBOSE) {
    console.warn("\n=== WARNINGS ===");
    for (const w of warnings) {
      console.warn(`  [${w.rule}] ${path.relative(process.cwd(), w.file)}${w.cardId ? ` (${w.cardId})` : ""} — ${w.message}`);
    }
  }

  return errors.length > 0 ? 1 : 0;
}

process.exit(main());
