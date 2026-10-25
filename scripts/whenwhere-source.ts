// Helper de l'étape 2 (relecture LLM) : imprime un SLICE (JSON) de la source FR, pour
// qu'un sous-agent récupère son lot sans qu'on passe 66 Ko d'args.
//
// Usage :
//   npx tsx scripts/whenwhere-source.ts <start> <count> --locale es
//     → cartes STAGED dans data/_translations/es.jsonl (ordre du staging) :
//       [{ dexNum, tag, type, era, countryCode, fr:{title,blurb,teaser,body,placeLabel,
//          timeDisplayLabel,wherePrompt,whenPrompt}, mt:{…prose Azure} }, …]
//       = tout ce qu'il faut pour traduire le titre, relire la prose ET re-découper les consignes.
//   npx tsx scripts/whenwhere-source.ts <start> <count>
//     → ancien format (consignes seules, toutes les cartes approuvées, tri par fichier).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(here, "..", "data", "cards");
const STAGING_DIR = path.resolve(here, "..", "data", "_translations");

const argv = process.argv.slice(2);
const locale = argv.includes("--locale") ? argv[argv.indexOf("--locale") + 1] : null;
const [start, count] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--locale").map(Number);
const from = start ?? 0;
const to = from + (count || Infinity);

const readCard = (f: string) => JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8"));

let slice: unknown[];
if (locale) {
  const staged = fs
    .readFileSync(path.join(STAGING_DIR, `${locale}.jsonl`), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { dexNum: string; file: string; prose: Record<string, string> });
  slice = staged.slice(from, to).map((s) => {
    const c = readCard(s.file);
    const fr = c.display.locales.fr;
    return {
      dexNum: s.dexNum,
      tag: c.canonical.time.tag,
      type: c.canonical.type,
      era: c.gameplay?.era,
      countryCode: c.canonical.place?.countryCode ?? null,
      fr: { title: fr.title, blurb: fr.blurb, teaser: fr.teaser, body: fr.body, placeLabel: fr.placeLabel, timeDisplayLabel: fr.timeDisplayLabel, wherePrompt: fr.wherePrompt, whenPrompt: fr.whenPrompt },
      mt: s.prose,
    };
  });
} else {
  slice = fs
    .readdirSync(CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(readCard)
    .filter((c) => c.editorial?.status === "approved" && c.display?.locales?.fr)
    .slice(from, to)
    .map((c) => ({ dexNum: c.dexNum, tag: c.canonical.time.tag, frWhere: c.display.locales.fr.wherePrompt, frWhen: c.display.locales.fr.whenPrompt }));
}

process.stdout.write(JSON.stringify(slice));
