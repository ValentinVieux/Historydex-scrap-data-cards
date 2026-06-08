// Merge (étape 2/2) : combine la PROSE (Azure, staging `<loc>.jsonl`) + les champs
// WHERE/WHEN re-découpés par le LLM (`<loc>.whenwhere.jsonl`) en une LocaleText
// complète, la valide via validateTranslatedLocale, et l'écrit dans
// `display.locales.<loc>` de chaque carte. Puis `npm run push:db` émet les cardTranslations.
//
// DRY-RUN par défaut (n'écrit rien) ; --apply écrit les cartes. Idempotent.
//
// Usage : npx tsx scripts/merge-translations.ts es [--apply]

import fs from "node:fs";
import path from "node:path";
import { validateTranslatedLocale } from "./_lib/card-translations.js";

const CARDS_DIR = path.resolve(process.cwd(), "data", "cards");
const STAGING_DIR = path.resolve(process.cwd(), "data", "_translations");

const locale = process.argv.slice(2).find((x) => !x.startsWith("--")) ?? "";
const APPLY = process.argv.includes("--apply");
if (!locale) {
  console.error("usage: merge-translations.ts <locale> [--apply]");
  process.exit(1);
}

type Prompt = { pre: string; verb: string; post: string };
type ProseRow = { dexNum: string; file: string; tag: "ponctuelle" | "periodique"; prose: Record<string, string> };
type WhenWhereRow = { dexNum: string; wherePrompt: Prompt; whenPrompt: Prompt };

function readJsonl<T>(p: string): T[] {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

const prose = readJsonl<ProseRow>(path.join(STAGING_DIR, `${locale}.jsonl`));
const whenwhere = readJsonl<WhenWhereRow>(path.join(STAGING_DIR, `${locale}.whenwhere.jsonl`));
if (!prose.length) {
  console.error(`staging prose vide : ${path.join(STAGING_DIR, `${locale}.jsonl`)} — lance d'abord translate-cards-mt.ts`);
  process.exit(1);
}
const wwByDex = new Map(whenwhere.map((w) => [w.dexNum, w] as const));

let written = 0;
let rejected = 0;
let missingWW = 0;
const issues: string[] = [];

for (const p of prose) {
  const ww = wwByDex.get(p.dexNum);
  if (!ww) {
    missingWW++;
    continue; // pas encore de where/when → on attend l'étape LLM
  }
  const loc = {
    title: p.prose.title,
    blurb: p.prose.blurb,
    body: p.prose.body,
    placeLabel: p.prose.placeLabel,
    timeDisplayLabel: p.prose.timeDisplayLabel,
    wherePrompt: ww.wherePrompt,
    whenPrompt: ww.whenPrompt,
  };
  const v = validateTranslatedLocale(loc as Parameters<typeof validateTranslatedLocale>[0], p.tag, locale);
  if (!v.ok) {
    rejected++;
    issues.push(`[${p.dexNum}] ${v.issues.join(" | ")}`);
    continue;
  }
  if (APPLY) {
    const file = path.join(CARDS_DIR, p.file);
    const card = JSON.parse(fs.readFileSync(file, "utf8"));
    card.display.locales[locale] = loc;
    fs.writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
  }
  written++;
}

console.log(`locale=${locale} · prose=${prose.length} · where/when=${whenwhere.length}`);
console.log(`${APPLY ? "écrites" : "à écrire (dry-run)"}: ${written} · rejetées (validateTranslatedLocale): ${rejected} · sans where/when: ${missingWW}`);
if (issues.length) {
  console.log(`\nRejets (${issues.length}) :`);
  for (const i of issues.slice(0, 30)) console.log("  " + i);
  if (issues.length > 30) console.log(`  … +${issues.length - 30}`);
}
if (!APPLY && written > 0) console.log(`\n(DRY-RUN — relancer avec --apply pour écrire display.locales.${locale}, puis npm run push:db)`);
