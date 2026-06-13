// One-shot: applique un plan de re-typage de cartes (audit catégories 2026-06-13).
//   node scripts/apply-retype-plan.mjs <plan.json> [--dry-run]
//
// Plan = {
//   note: "libellé daté à appendre",
//   changes: [
//     { dex, slug, oldType, newType, wherePost?, whenPost? }
//   ]
// }
// Effets par carte : canonical.type=newType ; (optionnel) wherePrompt.post/whenPrompt.post ;
// editorial.contentVersion++ ; append d'une note éditoriale. Écriture 2-espaces + newline.
import fs from "node:fs";
import path from "node:path";

const planPath = process.argv[2];
const dry = process.argv.includes("--dry-run");
if (!planPath) { console.error("usage: apply-retype-plan.mjs <plan.json> [--dry-run]"); process.exit(1); }

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const dir = "data/cards";
const note = plan.note || "[audit-catégories 2026-06-13] re-typage";

let ok = 0, skip = 0;
for (const ch of plan.changes) {
  const file = path.join(dir, `${ch.slug}.json`);
  if (!fs.existsSync(file)) { console.error(`MISSING ${ch.slug} (dex ${ch.dex})`); skip++; continue; }
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const cur = c.canonical.type;
  if (cur !== ch.oldType) {
    console.error(`WARN ${ch.slug}: type actuel "${cur}" ≠ oldType attendu "${ch.oldType}" — j'applique quand même → ${ch.newType}`);
  }
  if (cur === ch.newType) { console.log(`= ${ch.slug}: déjà ${ch.newType}, skip`); skip++; continue; }
  c.canonical.type = ch.newType;
  const wp = c.display.locales.fr.wherePrompt, np = c.display.locales.fr.whenPrompt;
  if (ch.wherePre) wp.pre = ch.wherePre;
  if (ch.whereVerb) wp.verb = ch.whereVerb;
  if (ch.wherePost) wp.post = ch.wherePost;
  if (ch.whenPre) np.pre = ch.whenPre;
  if (ch.whenVerb) np.verb = ch.whenVerb;
  if (ch.whenPost) np.post = ch.whenPost;
  c.editorial.contentVersion = (c.editorial.contentVersion || 1) + 1;
  c.editorial.notes = c.editorial.notes || [];
  c.editorial.notes.push(`${note} : ${cur} → ${ch.newType}.`);
  if (!dry) fs.writeFileSync(file, JSON.stringify(c, null, 2) + "\n");
  console.log(`${dry ? "[dry] " : ""}✓ [${ch.dex}] ${ch.slug}: ${cur} → ${ch.newType}${ch.wherePost ? ` (post→"${ch.wherePost}")` : ""}`);
  ok++;
}
console.log(`\n${dry ? "[DRY-RUN] " : ""}appliqué: ${ok} | sauté: ${skip} | total plan: ${plan.changes.length}`);
