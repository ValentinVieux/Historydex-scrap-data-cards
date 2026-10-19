// Applique des réécritures de consignes OÙ/QUAND VALIDÉES (revue de clarté du 2026-10-18,
// docs/2026-10-18-prompt-revue-clarte-consignes.md). Rien n'est inventé ici : l'entrée est le
// JSONL des propositions acceptées par Valentin, lot par lot.
//
// Entrée (1 ligne / carte) :
//   {"dexNum":"702","where":{pre,verb,post}|null,"when":{pre,verb,post}|null,
//    "prose":[{"field":"blurb"|"body"|"placeLabel","from":"doubler","to":"contourner","optional":true?}]?,"reason":"…"}
//   (`optional` : ne pas signaler si `from` est absent — utile pour une même correction tentée sur blurb ET body)
//
// Pour chaque carte : champs FR remplacés, `editorial.contentVersion += 1` (saveCardFile),
// note datée dans `editorial.notes` (avant → après + motif), et pour les cartes `approved` :
// `display.locales.<loc> = null` + suppression de `display.translationMeta.<loc>` pour toutes
// les `targetLocales()` → `approved-locale-missing` bloque `push:db` jusqu'à retraduction
// (`translate-cards-mt.ts <loc> --dex …`, cf. skill translate-cards-mt § « FR modifié après
// traduction »). Les cartes `reviewed` ne sont pas traduites : rien à invalider.
//
// DRY-RUN par défaut (affiche avant → après) ; --apply écrit. --dex a,b restreint l'entrée.
//   npx tsx scripts/apply-prompt-rewrites.ts reports/prompt-clarity/validated.jsonl [--apply] [--dex 702,774]

import fs from "node:fs";
import { loadCardFile, saveCardFile } from "./_lib/save-card.js";
import { targetLocales } from "./_lib/card-translations.js";

type Prompt = { pre: string; verb: string; post: string };
type Rewrite = {
  dexNum: string;
  where?: Prompt | null;
  when?: Prompt | null;
  prose?: Array<{ field: "blurb" | "body" | "placeLabel"; from: string; to: string; optional?: boolean }>;
  reason: string;
};

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const APPLY = argv.includes("--apply");
const dexArg = argv.includes("--dex") ? (argv[argv.indexOf("--dex") + 1] ?? "") : "";
const ONLY = dexArg ? new Set(dexArg.split(",").map((s) => s.trim()).filter(Boolean)) : null;
if (!input) {
  console.error("usage: apply-prompt-rewrites.ts <validated.jsonl> [--apply] [--dex a,b]");
  process.exit(1);
}

const sentence = (p: Prompt) => `${p.pre}${p.verb}${p.post}`;
const today = new Date().toISOString().slice(0, 10);
const rewrites = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Rewrite)
  .filter((r) => !ONLY || ONLY.has(r.dexNum));

let changed = 0;
const approvedTouched: string[] = [];
const errors: string[] = [];

for (const rw of rewrites) {
  let loaded;
  try {
    loaded = loadCardFile(rw.dexNum);
  } catch (err) {
    errors.push(`[${rw.dexNum}] ${(err as Error).message}`);
    continue;
  }
  const { file, card } = loaded;
  const fr = card.display.locales.fr;
  const before: string[] = [];
  const after: string[] = [];

  if (rw.where && sentence(rw.where) !== sentence(fr.wherePrompt)) {
    before.push(`OÙ « ${sentence(fr.wherePrompt)} »`);
    after.push(`OÙ « ${sentence(rw.where)} »`);
    fr.wherePrompt = { ...rw.where };
  }
  if (rw.when && sentence(rw.when) !== sentence(fr.whenPrompt)) {
    before.push(`QUAND « ${sentence(fr.whenPrompt)} »`);
    after.push(`QUAND « ${sentence(rw.when)} »`);
    fr.whenPrompt = { ...rw.when };
  }
  for (const p of rw.prose ?? []) {
    const cur = fr[p.field];
    if (!cur.includes(p.from)) {
      if (!p.optional) errors.push(`[${rw.dexNum}] ${p.field} : « ${p.from} » introuvable — remplacement ignoré`);
      continue;
    }
    fr[p.field] = cur.split(p.from).join(p.to);
    before.push(`${p.field} « ${p.from} »`);
    after.push(`${p.field} « ${p.to} »`);
  }
  if (before.length === 0) continue; // rien à changer (déjà appliqué, idempotent)

  const isApproved = card.editorial.status === "approved";
  card.editorial.notes.push(
    `${today} — Revue de clarté des consignes (joueur non spécialiste, cf. docs/2026-10-18-prompt-revue-clarte-consignes.md) : ${before.join(" ; ")} → ${after.join(" ; ")}. Motif : ${rw.reason}.` +
      (isApproved ? ` ${targetLocales().length} locales invalidées (display.locales.<loc>=null, translationMeta supprimé) → retraduction via translate-cards-mt --dex.` : ""),
  );
  if (isApproved) {
    const locales = card.display.locales as unknown as Record<string, unknown>;
    const meta = (card.display as unknown as { translationMeta?: Record<string, unknown> }).translationMeta;
    for (const loc of targetLocales()) {
      if (loc in locales) locales[loc] = null;
      if (meta && loc in meta) delete meta[loc];
    }
    approvedTouched.push(card.dexNum);
  }

  console.log(`#${card.dexNum} ${fr.title} (${card.editorial.status}, v${card.editorial.contentVersion} → v${card.editorial.contentVersion + 1})`);
  for (let i = 0; i < before.length; i++) console.log(`   ${before[i]}\n → ${after[i]}`);

  if (APPLY) {
    const res = saveCardFile(file, card);
    if (!res.ok) {
      errors.push(`[${card.dexNum}] Zod : ${res.errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`);
      continue;
    }
  }
  changed++;
}

console.log(`\n${APPLY ? "Écrites" : "À écrire (dry-run)"} : ${changed} carte(s) sur ${rewrites.length} ligne(s).`);
if (approvedTouched.length) {
  console.log(`Cartes approved à retraduire (11 locales) — pour chaque <loc> :`);
  console.log(`  npx tsx scripts/translate-cards-mt.ts <loc> --dex ${approvedTouched.join(",")} --apply`);
}
if (errors.length) {
  console.error(`\nErreurs (${errors.length}) :`);
  for (const e of errors) console.error("  " + e);
  process.exitCode = 1;
}
if (!APPLY && changed > 0) console.log("\n(DRY-RUN — relancer avec --apply pour écrire.)");
