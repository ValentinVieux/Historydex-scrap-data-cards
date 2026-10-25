// Applique des bodies réécrits au format « fiche courte » (décision Valentin 2026-10-25,
// editorial-rules § Body — fiche courte). Entrée : JSONL produit par les sous-agents de
// réécriture, 1 ligne / carte : {"dexNum":"088","body":"…"}.
//
// Gardes (une ligne qui échoue est ignorée et signalée, le reste passe) :
//   - ≤ BODY_MAX_WORDS mots ;
//   - aucun nombre absent de l'ancien body / titre / libellé de date / lieu / teaser / blurb
//     (une réécriture courte n'apporte aucun fait) ;
//   - Zod (saveCardFile) : 40 caractères au moins.
// Pour chaque carte : `fr.body` remplacé, `contentVersion += 1`, note datée (ancien body gardé
// dans la note → réversible), et pour les `approved` : `display.locales.<loc> = null` +
// `translationMeta.<loc>` supprimé → `approved-locale-missing` bloque `push:db` jusqu'à la
// retraduction (skill translate-cards-mt).
//
// DRY-RUN par défaut ; --apply écrit.   npx tsx scripts/apply-body-rewrites.ts <rewrites.jsonl> [--apply]

import fs from "node:fs";
import { loadCardFile, saveCardFile } from "./_lib/save-card.js";
import { targetLocales } from "./_lib/card-translations.js";
import { BODY_MAX_WORDS, bodyWordCount, unsourcedNumbers } from "./_lib/body-rule.js";

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith("--"));
const APPLY = argv.includes("--apply");
if (!input) {
  console.error("usage: apply-body-rewrites.ts <rewrites.jsonl> [--apply]");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rows = fs.readFileSync(input, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as { dexNum: string; body: string });

let changed = 0;
let approved = 0;
const errors: string[] = [];

for (const row of rows) {
  let loaded;
  try {
    loaded = loadCardFile(row.dexNum);
  } catch (err) {
    errors.push(`[${row.dexNum}] ${(err as Error).message}`);
    continue;
  }
  const { file, card } = loaded;
  const fr = card.display.locales.fr;
  const body = row.body.trim();
  if (body === fr.body) continue; // déjà appliqué (idempotent)

  const words = bodyWordCount(body);
  if (words > BODY_MAX_WORDS) {
    errors.push(`[${row.dexNum}] ${words} mots (max ${BODY_MAX_WORDS})`);
    continue;
  }
  const extra = unsourcedNumbers(body, [fr.body, fr.title, fr.blurb, fr.teaser ?? "", fr.placeLabel, fr.timeDisplayLabel]);
  if (extra.length) {
    errors.push(`[${row.dexNum}] nombre(s) absent(s) des sources : ${extra.join(", ")} — « ${body} »`);
    continue;
  }

  const old = fr.body;
  fr.body = body;
  const isApproved = card.editorial.status === "approved";
  card.editorial.notes.push(
    `${today} — Body réécrit au format fiche courte (editorial-rules § Body — fiche courte, décision Valentin). Ancien body : « ${old} »` +
      (isApproved ? ` ${targetLocales().length} locales invalidées → retraduction via translate-cards-mt.` : ""),
  );
  if (isApproved) {
    const locales = card.display.locales as unknown as Record<string, unknown>;
    const meta = (card.display as unknown as { translationMeta?: Record<string, unknown> }).translationMeta;
    for (const loc of targetLocales()) {
      if (loc in locales) locales[loc] = null;
      if (meta && loc in meta) delete meta[loc];
    }
  }
  if (APPLY) {
    const res = saveCardFile(file, card);
    if (!res.ok) {
      errors.push(`[${row.dexNum}] Zod : ${res.errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`);
      continue;
    }
  }
  changed++;
  if (isApproved) approved++;
}

console.log(`${APPLY ? "Écrites" : "À écrire (dry-run)"} : ${changed} carte(s) sur ${rows.length} ligne(s), dont ${approved} approved à retraduire.`);
if (errors.length) {
  console.error(`\nRejets (${errors.length}) :`);
  for (const e of errors) console.error("  " + e);
  process.exitCode = 1;
}
if (!APPLY && changed > 0) console.log("\n(DRY-RUN — relancer avec --apply pour écrire.)");
