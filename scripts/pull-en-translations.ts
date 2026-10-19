// Rapatrie dans display.locales.en les lignes cardTranslations `en` qui n'existent QU'EN BASE
// (backfill côté app `/translate-catalog en` des cartes anciennes, jamais retranscrit dans le
// JSON du pipeline — cf. push-db.ts, missingLocales), pour les cartes sans `en` local.
//
// Pourquoi : le teaser (brève description en jeu) se traduit depuis le JSON local
// (translate-teasers.ts). Sans `en` local, pas de teaser anglais → l'app retombe sur le FR
// pour les joueurs anglophones. Rapatrier la traduction existante (qualité LLM) est plus
// sûr et moins cher que de la refaire en MT, et aligne `en` sur les autres locales.
//
// - Ne stampe PAS translationMeta.en.sourceHash : la provenance exacte est inconnue (le FR a
//   pu bouger depuis le backfill) ; `en` est de toute façon hors HASH_TRACKED_LOCALES.
// - placeLabel / timeDisplayLabel absents de la ligne DB → repli sur le FR (c'est déjà ce
//   que l'app affiche via le fallback colonne source).
// - Dry-run par défaut ; --apply écrit. Idempotent : saute les cartes qui ont déjà un `en` local.
//
// Usage : npx tsx scripts/pull-en-translations.ts [--apply] [--status approved|both]

import fs from "node:fs";
import { CardSchema, type Card } from "../schemas/card.schema.js";
import { validateTranslatedLocale, type LocaleText } from "./_lib/card-translations.js";
import { db } from "./_lib/instantdb-client.js";
import { PATHS } from "./_lib/io.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";

const APPLY = process.argv.includes("--apply");
const statusIdx = process.argv.indexOf("--status");
const STATUS = (statusIdx >= 0 ? process.argv[statusIdx + 1] : "approved") as "approved" | "both";
const wantStatus = (s: string) => (STATUS === "both" ? s === "approved" || s === "reviewed" : s === "approved");

type Row = {
  dexNum?: string;
  title?: string;
  blurb?: string;
  body?: string;
  placeLabel?: string | null;
  timeDisplayLabel?: string | null;
  whereVerb?: string;
  whereConsignePre?: string;
  whereConsignePost?: string;
  whenPromptVerb?: string;
  whenPromptPre?: string;
  whenPromptPost?: string;
  teaser?: string | null;
};

async function main() {
  const loaded = loadCardsFromDir(PATHS.cards);
  const targets = loaded.cards.filter(({ data: c }) => wantStatus(c.editorial.status) && !c.display.locales.en);
  console.log(`cartes ${STATUS} sans display.locales.en local : ${targets.length}`);
  if (!targets.length) return;

  const res = await db.query({ cardTranslations: { $: { where: { locale: "en" } } } });
  const rows = (res.cardTranslations ?? []) as Row[];
  const byDex = new Map<string, Row>();
  for (const r of rows) if (r.dexNum) byDex.set(r.dexNum, r);
  console.log(`lignes cardTranslations en=en en base : ${rows.length}`);

  let written = 0;
  const noRow: string[] = [];
  const rejected: string[] = [];
  for (const { file, data: c } of targets) {
    const r = byDex.get(c.dexNum);
    if (!r) {
      noRow.push(c.dexNum);
      continue;
    }
    const fr = c.display.locales.fr;
    const loc: LocaleText = {
      title: r.title ?? "",
      blurb: r.blurb ?? "",
      body: r.body ?? "",
      placeLabel: r.placeLabel?.trim() ? r.placeLabel : fr.placeLabel,
      timeDisplayLabel: r.timeDisplayLabel?.trim() ? r.timeDisplayLabel : fr.timeDisplayLabel,
      wherePrompt: { pre: r.whereConsignePre ?? "", verb: r.whereVerb ?? "", post: r.whereConsignePost ?? "" },
      whenPrompt: { pre: r.whenPromptPre ?? "", verb: r.whenPromptVerb ?? "", post: r.whenPromptPost ?? "" },
      ...(r.teaser?.trim() ? { teaser: r.teaser } : {}),
    };
    const v = validateTranslatedLocale(loc, c.canonical.time.tag, "en");
    if (!v.ok) {
      rejected.push(`${c.dexNum} ${v.issues.join(" | ")}`);
      continue;
    }
    if (APPLY) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Card;
      (raw.display.locales as Record<string, unknown>).en = loc;
      const parsed = CardSchema.safeParse(raw);
      if (!parsed.success) {
        rejected.push(`${c.dexNum} Zod : ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ")}`);
        continue;
      }
      fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n");
    }
    written++;
  }
  console.log(`${APPLY ? "écrites" : "à écrire (dry-run)"} : ${written} · sans ligne en base : ${noRow.length} · rejetées : ${rejected.length}`);
  if (noRow.length) console.log(`  sans ligne en : ${noRow.slice(0, 20).join(",")}${noRow.length > 20 ? "…" : ""}`);
  for (const r of rejected.slice(0, 20)) console.log(`  ✗ ${r}`);
  if (!APPLY && written) console.log("\n(DRY-RUN — relancer avec --apply, puis npx tsx scripts/translate-teasers.ts en --apply)");
}

void main();
