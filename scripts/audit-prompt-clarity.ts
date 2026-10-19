// Extraction LECTURE SEULE des consignes OÙ/QUAND pour la revue de clarté
// (cf. docs/2026-10-18-prompt-revue-clarte-consignes.md). Produit l'input des
// relecteurs : une ligne JSONL par carte approved/reviewed + la fréquence des
// verbes (normalisés comme l'invariant placeKind-verb-coherence).
//
//   npx tsx scripts/audit-prompt-clarity.ts [--out-dir <dir>] [--chunk 100]
//
// Sorties : <out-dir>/prompt-clarity-cards.jsonl, prompt-clarity-verbs.json,
// et (si --chunk) chunk-NN.jsonl pour répartir la relecture entre agents.

import fs from "node:fs";
import path from "node:path";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { normVerb } from "./_lib/invariants.js";
import { PATHS, ensureDir } from "./_lib/io.js";

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const OUT = path.resolve(flag("--out-dir") ?? path.join(PATHS.reports, "prompt-clarity"));
const CHUNK = Number(flag("--chunk") ?? 0);

const { cards, issues } = loadCardsFromDir(PATHS.cards);
if (issues.length) console.error(`⚠ ${issues.length} fichier(s) invalides ignorés`);

const rows = cards
  .map(({ data: c }) => c)
  .filter((c) => c.editorial.status === "approved" || c.editorial.status === "reviewed")
  .sort((a, b) => Number(a.dexNum) - Number(b.dexNum))
  .map((c) => {
    const fr = c.display.locales.fr;
    const t = c.canonical.time;
    return {
      dexNum: c.dexNum,
      slug: c.id,
      status: c.editorial.status,
      type: c.canonical.type,
      tag: t.tag,
      placeKind: c.canonical.place.placeKind,
      title: fr.title,
      whereSentence: `${fr.wherePrompt.pre}${fr.wherePrompt.verb}${fr.wherePrompt.post}`,
      whenSentence: `${fr.whenPrompt.pre}${fr.whenPrompt.verb}${fr.whenPrompt.post}`,
      where: fr.wherePrompt,
      when: fr.whenPrompt,
      timeDisplayLabel: fr.timeDisplayLabel,
      placeLabel: fr.placeLabel,
      pivotYear: t.pivotYear,
      startYear: t.startYear,
      endYear: t.endYear,
      timeJustification: (t.justification ?? "").slice(0, 300),
      blurb: fr.blurb,
    };
  });

type Freq = Record<string, { count: number; forms: Record<string, number>; dexNums: string[] }>;
const freq = (pick: (r: (typeof rows)[number]) => string): Freq => {
  const out: Freq = {};
  for (const r of rows) {
    const raw = pick(r).trim();
    const k = normVerb(raw);
    out[k] ??= { count: 0, forms: {}, dexNums: [] };
    out[k].count++;
    out[k].forms[raw] = (out[k].forms[raw] ?? 0) + 1;
    out[k].dexNums.push(r.dexNum);
  }
  return out;
};
const whereFreq = freq((r) => r.where.verb);
const whenFreq = freq((r) => r.when.verb);
const rare = (f: Freq) => Object.values(f).filter((v) => v.count <= 2).length;

ensureDir(OUT);
fs.writeFileSync(path.join(OUT, "prompt-clarity-cards.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(
  path.join(OUT, "prompt-clarity-verbs.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), cards: rows.length, where: whereFreq, when: whenFreq }, null, 1),
);
if (CHUNK > 0) {
  for (let i = 0, n = 1; i < rows.length; i += CHUNK, n++) {
    fs.writeFileSync(path.join(OUT, `chunk-${String(n).padStart(2, "0")}.jsonl`), rows.slice(i, i + CHUNK).map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
}
console.log(`cartes: ${rows.length} (approved=${rows.filter((r) => r.status === "approved").length}, reviewed=${rows.filter((r) => r.status === "reviewed").length})`);
console.log(`verbes QUAND distincts: ${Object.keys(whenFreq).length} (≤2 cartes: ${rare(whenFreq)}) · OÙ: ${Object.keys(whereFreq).length} (≤2: ${rare(whereFreq)})`);
console.log(`→ ${path.relative(process.cwd(), OUT)}/`);
