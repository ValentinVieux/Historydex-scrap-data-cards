// Backfill one-shot : stampe `display.translationMeta.<loc>.sourceHash` sur toute
// carte dont les locales MT sont déjà remplies mais dépourvues de provenance.
//
// Pose l'assertion « les traductions actuelles correspondent au FR actuel ». C'est
// vrai au moment du backfill (elles ont été produites depuis ce FR), et c'est ce
// qui rend la garantie rétroactive : à partir de là, toute édition du FR sans
// retraduction fait diverger le hash et déclenche l'invariant `translation-stale`.
//
//   npx tsx scripts/backfill-translation-hash.ts            # dry-run
//   npx tsx scripts/backfill-translation-hash.ts --apply
//
// Idempotent : ne touche pas une carte déjà stampée (sauf --restamp, qui force —
// à n'utiliser que si tu sais que les traductions sont à jour vis-à-vis du FR).

import fs from "node:fs";
import path from "node:path";
import { frSourceHash, HASH_TRACKED_LOCALES } from "./_lib/translation-hash.js";

const CARDS_DIR = "data/cards";
const APPLY = process.argv.includes("--apply");
const RESTAMP = process.argv.includes("--restamp");

let scanned = 0;
let touched = 0;
let stamps = 0;
let alreadyOk = 0;
const drifted: string[] = [];

for (const f of fs.readdirSync(CARDS_DIR)) {
  if (!f.endsWith(".json")) continue;
  const file = path.join(CARDS_DIR, f);
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  scanned++;

  const hash = frSourceHash(card);
  const meta: Record<string, { sourceHash: string }> = card.display.translationMeta ?? {};
  let changed = false;

  for (const locale of HASH_TRACKED_LOCALES) {
    if (!card.display.locales?.[locale]) continue;
    const stamped = meta[locale]?.sourceHash;
    if (stamped === hash) {
      alreadyOk++;
      continue;
    }
    if (stamped && !RESTAMP) {
      // Déjà stampé mais divergent : c'est une vraie dérive, pas un trou de
      // backfill. On la SIGNALE au lieu de l'écraser — l'écraser reviendrait à
      // déclarer à jour une traduction qui contredit le FR, soit exactement le
      // bug qu'on corrige.
      drifted.push(`[${card.dexNum}] ${locale} : stampé ${stamped} ≠ FR actuel ${hash}`);
      continue;
    }
    meta[locale] = { sourceHash: hash };
    stamps++;
    changed = true;
  }

  if (changed) {
    touched++;
    if (APPLY) {
      card.display.translationMeta = meta;
      fs.writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
    }
  }
}

console.log(`Cartes scannées      : ${scanned}`);
console.log(`Locales déjà à jour  : ${alreadyOk}`);
console.log(`Locales à stamper    : ${stamps} (sur ${touched} cartes)`);
if (drifted.length) {
  console.log(`\n⚠️  ${drifted.length} dérive(s) réelle(s) — NON écrasées (relancer /translate-cards-mt sur ces locales) :`);
  for (const d of drifted.slice(0, 30)) console.log("   " + d);
  if (drifted.length > 30) console.log(`   … +${drifted.length - 30}`);
}
console.log(APPLY ? "\n✓ Écrit." : "\n(DRY-RUN — relancer avec --apply)");
