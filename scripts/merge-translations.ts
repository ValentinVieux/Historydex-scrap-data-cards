// Merge (étape 3) : combine la PROSE (Azure, staging `<loc>.jsonl`) + la RELECTURE LLM
// (`<loc>.whenwhere.jsonl` : consignes re-découpées, titre traduit par l'agent, fixes de
// prose — cf. _lib/translation-review.ts) en une LocaleText complète, la valide via
// validateTranslatedLocale, et l'écrit dans
// `display.locales.<loc>` de chaque carte. Puis `npm run push:db` émet les cardTranslations.
//
// DRY-RUN par défaut (n'écrit rien) ; --apply écrit les cartes. Idempotent.
//
// Usage : npx tsx scripts/merge-translations.ts es [--apply] [--dex 774,801]

import fs from "node:fs";
import path from "node:path";
import { validateTranslatedLocale } from "./_lib/card-translations.js";
import { frSourceHash, frTeaserHash } from "./_lib/translation-hash.js";
import { applyReview, type ReviewRow } from "./_lib/translation-review.js";

const CARDS_DIR = path.resolve(process.cwd(), "data", "cards");
const STAGING_DIR = path.resolve(process.cwd(), "data", "_translations");

const locale = process.argv.slice(2).find((x) => !x.startsWith("--")) ?? "";
const APPLY = process.argv.includes("--apply");
// --dex 774,801 : ne (ré)écrire QUE ces cartes. Indispensable après une correction FR
// ciblée : chaque carte écrite est re-stampée avec le hash du FR COURANT, donc une passe
// de masse blanchirait toute autre carte dont le FR a bougé sans retraduction.
const dexArg = process.argv.includes("--dex") ? (process.argv[process.argv.indexOf("--dex") + 1] ?? "") : "";
const ONLY_DEX = dexArg ? new Set(dexArg.split(",").map((s) => s.trim()).filter(Boolean)) : null;
if (!locale) {
  console.error("usage: merge-translations.ts <locale> [--apply]");
  process.exit(1);
}

type Prompt = { pre: string; verb: string; post: string };
type ProseRow = { dexNum: string; file: string; tag: "ponctuelle" | "periodique"; prose: Record<string, string> };
type WhenWhereRow = ReviewRow & { wherePrompt: Prompt; whenPrompt: Prompt };

function readJsonl<T>(p: string): T[] {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
}

const prose = readJsonl<ProseRow>(path.join(STAGING_DIR, `${locale}.jsonl`)).filter((p) => !ONLY_DEX || ONLY_DEX.has(p.dexNum));
const whenwhere = readJsonl<WhenWhereRow>(path.join(STAGING_DIR, `${locale}.whenwhere.jsonl`));
if (!prose.length) {
  console.error(`staging prose vide${ONLY_DEX ? ` pour --dex ${[...ONLY_DEX].join(",")}` : ""} : ${path.join(STAGING_DIR, `${locale}.jsonl`)} — lance d'abord translate-cards-mt.ts`);
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
  const reviewed = applyReview(p.prose, ww);
  if (!reviewed.ok) {
    rejected++;
    issues.push(`[${p.dexNum}] ${reviewed.issue}`);
    continue;
  }
  const pr = reviewed.prose;
  const loc = {
    title: pr.title,
    blurb: pr.blurb,
    // Teaser optionnel : seulement s'il a été staged (FR présent au moment de la MT).
    ...(pr.teaser ? { teaser: pr.teaser } : {}),
    body: pr.body,
    placeLabel: pr.placeLabel,
    timeDisplayLabel: pr.timeDisplayLabel,
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
    // Stampe la provenance : sha256 du FR dont CETTE traduction dérive. C'est le
    // seul endroit du pipeline qui le sait. Sans ça, une correction ultérieure du
    // body FR laisse une traduction contradictoire que rien ne détecte
    // (cf. _lib/translation-hash.ts et l'invariant `translation-stale`).
    card.display.translationMeta ??= {};
    card.display.translationMeta[locale] = { sourceHash: frSourceHash(card) };
    // Hash dédié du teaser (cf. frTeaserHash) : stampé seulement si la locale a bien reçu
    // un teaser traduit — sinon `teaser-translation-stale` le réclamera à translate-teasers.ts.
    const th = frTeaserHash(card);
    if (th && loc.teaser) card.display.translationMeta[locale].teaserHash = th;
    fs.writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
  }
  written++;
}

console.log(`locale=${locale}${ONLY_DEX ? ` · --dex ${[...ONLY_DEX].join(",")}` : ""} · prose=${prose.length} · where/when=${whenwhere.length}`);
console.log(`${APPLY ? "écrites" : "à écrire (dry-run)"}: ${written} · rejetées (relecture / validateTranslatedLocale): ${rejected} · sans where/when: ${missingWW}`);
if (issues.length) {
  console.log(`\nRejets (${issues.length}) :`);
  for (const i of issues.slice(0, 30)) console.log("  " + i);
  if (issues.length > 30) console.log(`  … +${issues.length - 30}`);
}
if (!APPLY && written > 0) console.log(`\n(DRY-RUN — relancer avec --apply pour écrire display.locales.${locale}, puis npm run push:db)`);
