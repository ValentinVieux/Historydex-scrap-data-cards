// Traduit le teaser FR (brève description en jeu) vers une locale — ou toutes — via Azure,
// pour les cartes dont display.locales.<loc> existe déjà mais dont le teaser traduit manque
// ou dérive (translationMeta.<loc>.teaserHash ≠ frTeaserHash). Chemin court et bon marché
// (~150 caractères/carte) qui évite de repasser par prose + where/when + merge quand seul le
// teaser a changé — c'est la raison d'être du hash dédié (cf. _lib/translation-hash.ts).
//
// Hors portée (listé, pas traité) : les cartes SANS display.locales.<loc> local — typiquement
// `en` backfillé directement en base pour les cartes anciennes. Pour celles-là, la locale
// complète passe par translate-cards-mt.ts (qui embarque désormais le teaser dans la prose).
//
// Usage :
//   npx tsx scripts/translate-teasers.ts                 # dry-run, toutes locales : volumes
//   npx tsx scripts/translate-teasers.ts es --apply      # une locale
//   npx tsx scripts/translate-teasers.ts all --apply     # toutes les targetLocales()
//   flags : --status approved|both (approved) · --limit N · --dex a,b
//
// Idempotent par hash : relancer ne retraduit que ce qui manque ou a changé. Écriture par
// chunk (reprise possible). Ne bumpe PAS contentVersion : le bump vient de l'édition FR
// (generate-teasers / app de review), qui précède toujours cette étape.

import fs from "node:fs";
import path from "node:path";
import { CardSchema, type Card } from "../schemas/card.schema.js";
import { AZ_KEY, AZURE_TO, mtTranslate } from "./_lib/azure-mt.js";
import { targetLocales } from "./_lib/card-translations.js";
import { frTeaserHash } from "./_lib/translation-hash.js";

const CARDS_DIR = path.resolve(process.cwd(), "data", "cards");
const CARDS_PER_CHUNK = 100; // ~15k caractères par appel Azure

const a = process.argv.slice(2);
const localeArg = a.find((x) => !x.startsWith("--")) ?? "all";
const APPLY = a.includes("--apply");
const val = (flag: string) => {
  const f = a.find((x) => x === flag || x.startsWith(`${flag}=`));
  return f ? (f.includes("=") ? f.split("=")[1] : a[a.indexOf(f) + 1]) : undefined;
};
const STATUS = (val("--status") ?? "approved") as "approved" | "both";
const LIMIT = Number(val("--limit") ?? Infinity);
const dexRaw = val("--dex") ?? "";
const ONLY_DEX = dexRaw ? new Set(dexRaw.split(",").map((s) => s.trim()).filter(Boolean)) : null;

const locales = localeArg === "all" ? targetLocales() : [localeArg];
for (const l of locales) {
  if (!targetLocales().includes(l) || !AZURE_TO[l]) {
    console.error(`locale invalide '${l}' — cibles : ${targetLocales().join(", ")}`);
    process.exit(1);
  }
}

type Loaded = { file: string; card: Card };
const cards: Loaded[] = fs
  .readdirSync(CARDS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: path.join(CARDS_DIR, f), card: JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8")) as Card }));

const wantStatus = (s: string) => (STATUS === "both" ? s === "approved" || s === "reviewed" : s === "approved");
const fmt = (n: number) => n.toLocaleString("en-US");

async function run() {
  let totalChars = 0;
  for (const locale of locales) {
    const target = AZURE_TO[locale]!;
    const inScope = cards.filter(({ card: c }) => wantStatus(c.editorial.status) && !!c.display.locales.fr.teaser && (!ONLY_DEX || ONLY_DEX.has(c.dexNum)));
    const noLocale = inScope.filter(({ card: c }) => !(c.display.locales as Record<string, unknown>)[locale]);
    const todo = inScope
      .filter(({ card: c }) => {
        const loc = (c.display.locales as Record<string, { teaser?: string } | null>)[locale];
        if (!loc) return false;
        const stamped = (c.display.translationMeta as Record<string, { teaserHash?: string } | undefined>)[locale]?.teaserHash;
        return !loc.teaser || stamped !== frTeaserHash(c);
      })
      .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
    const chars = todo.reduce((n, { card: c }) => n + (c.display.locales.fr.teaser?.length ?? 0), 0);
    totalChars += chars;
    console.log(`locale=${locale} (Azure ${target}) · à traduire : ${todo.length} teasers (~${fmt(chars)} car.) · hors portée (pas de display.locales.${locale} local) : ${noLocale.length}`);
    if (!APPLY || !todo.length) continue;
    if (!AZ_KEY) {
      console.error("AZURE_TRANSLATOR_KEY manquante dans .env.");
      process.exit(1);
    }
    let done = 0;
    let rejected = 0;
    for (let i = 0; i < todo.length; i += CARDS_PER_CHUNK) {
      const chunk = todo.slice(i, i + CARDS_PER_CHUNK);
      const translated = await mtTranslate(chunk.map(({ card: c }) => c.display.locales.fr.teaser!), target);
      chunk.forEach(({ file, card: c }, k) => {
        const tr = (translated[k] ?? "").trim();
        if (!tr) {
          rejected++;
          return;
        }
        const locs = c.display.locales as Record<string, { teaser?: string } | null>;
        locs[locale]!.teaser = tr;
        c.display.translationMeta ??= {};
        c.display.translationMeta[locale] = { ...(c.display.translationMeta[locale] ?? {}), teaserHash: frTeaserHash(c)! };
        const v = CardSchema.safeParse(c);
        if (!v.success) {
          rejected++;
          console.log(`  ✗ ${c.dexNum}/${locale} : ${v.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ")}`);
          return;
        }
        fs.writeFileSync(file, JSON.stringify(v.data, null, 2) + "\n");
        done++;
      });
      console.log(`  …${Math.min(i + CARDS_PER_CHUNK, todo.length)}/${todo.length}`);
    }
    console.log(`  ✓ ${locale} : ${done} teasers écrits · ${rejected} rejet(s)`);
  }
  console.log(`\ntotal : ~${fmt(totalChars)} caractères Azure${APPLY ? "" : " (DRY-RUN — relancer avec --apply)"}`);
  if (!APPLY) console.log("Les cartes « hors portée » (locale absente localement) passent par translate-cards-mt.ts <loc> (prose complète, teaser inclus).");
}

void run();
