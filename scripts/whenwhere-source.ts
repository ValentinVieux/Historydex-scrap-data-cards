// Helper de l'étape LLM where/when : imprime un SLICE (JSON) de la source FR des
// cartes approuvées, pour qu'un sous-agent récupère son lot sans qu'on passe 66 Ko
// d'args. Tri stable par nom de fichier. Indépendant de la prose Azure.
//
// Usage : npx tsx scripts/whenwhere-source.ts <start> <count>
//   → [{ dexNum, tag, frWhere:{pre,verb,post}, frWhen:{pre,verb,post} }, …]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(here, "..", "data", "cards");

const start = Number(process.argv[2] ?? 0);
const count = Number(process.argv[3] ?? 0) || Infinity;

const cards = fs
  .readdirSync(CARDS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8")))
  .filter((c) => c.editorial?.status === "approved" && c.display?.locales?.fr);

const slice = cards.slice(start, start + count).map((c) => ({
  dexNum: c.dexNum,
  tag: c.canonical.time.tag,
  frWhere: c.display.locales.fr.wherePrompt,
  frWhen: c.display.locales.fr.whenPrompt,
}));

process.stdout.write(JSON.stringify(slice));
