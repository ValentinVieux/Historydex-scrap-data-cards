// Contrôle d'un lot de traduction par agent AVANT merge (étape 2 du skill translate-cards-mt) :
// mêmes rejets que merge-translations.ts (titre relu, fixes, validateTranslatedLocale), plus un
// avertissement « nombre du body FR absent de la traduction » (à relire : une reformulation en
// lettres peut être légitime). N'écrit rien.
//
//   npx tsx scripts/check-translation-batch.ts <loc> data/_translations/<loc>.whenwhere.b01.jsonl

import fs from "node:fs";
import path from "node:path";
import { validateTranslatedLocale } from "./_lib/card-translations.js";
import { applyReview, type ReviewRow } from "./_lib/translation-review.js";
import { unsourcedNumbers } from "./_lib/body-rule.js";

type Prompt = { pre: string; verb: string; post: string };
type Row = ReviewRow & { wherePrompt: Prompt; whenPrompt: Prompt };
type Staged = { dexNum: string; file: string; tag: "ponctuelle" | "periodique"; prose: Record<string, string> };

const [locale, batchFile] = process.argv.slice(2);
if (!locale || !batchFile) {
  console.error("usage: check-translation-batch.ts <loc> <batch.jsonl>");
  process.exit(1);
}
const readJsonl = <T>(p: string): T[] => fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as T);
const staged = new Map(readJsonl<Staged>(path.join("data", "_translations", `${locale}.jsonl`)).map((s) => [s.dexNum, s]));

const rejects: string[] = [];
const warnings: string[] = [];
let rows: Row[];
try {
  rows = readJsonl<Row>(batchFile);
} catch (err) {
  console.error(`JSON invalide : ${(err as Error).message}`);
  process.exit(1);
}
const seen = new Set<string>();
for (const row of rows) {
  if (seen.has(row.dexNum)) rejects.push(`[${row.dexNum}] ligne en double`);
  seen.add(row.dexNum);
  const s = staged.get(row.dexNum);
  if (!s) {
    rejects.push(`[${row.dexNum}] carte absente du staging ${locale}.jsonl`);
    continue;
  }
  const r = applyReview(s.prose, row);
  if (!r.ok) {
    rejects.push(`[${row.dexNum}] ${r.issue}`);
    continue;
  }
  const loc = { ...r.prose, wherePrompt: row.wherePrompt, whenPrompt: row.whenPrompt };
  if ("teaser" in s.prose && !r.prose.teaser?.trim()) rejects.push(`[${row.dexNum}] teaser non traduit`);
  const v = validateTranslatedLocale(loc as Parameters<typeof validateTranslatedLocale>[0], s.tag, locale);
  if (!v.ok) rejects.push(`[${row.dexNum}] ${v.issues.join(" | ")}`);
  const card = JSON.parse(fs.readFileSync(path.join("data", "cards", s.file), "utf8"));
  // Titre = visible pendant l'énigme : aucune date absente du titre FR (« The Third of May 1808 »).
  const titleYears = unsourcedNumbers(r.prose.title ?? "", [card.display.locales.fr.title]).filter((n) => n.length >= 3);
  if (titleYears.length) rejects.push(`[${row.dexNum}] date dans le titre absente du FR : ${titleYears.join(", ")} — « ${r.prose.title} »`);
  const lost = unsourcedNumbers(card.display.locales.fr.body, [r.prose.body ?? ""]);
  if (lost.length) warnings.push(`[${row.dexNum}] nombre(s) du body FR absent(s) : ${lost.join(", ")} — vérifier`);
}

console.log(`${locale} · ${rows.length} ligne(s) · ${rejects.length} rejet(s) · ${warnings.length} avertissement(s)`);
for (const r of rejects) console.log("  REJET " + r);
for (const w of warnings) console.log("  AVERT " + w);
if (rejects.length) process.exitCode = 1;
