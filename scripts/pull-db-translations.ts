// Rapatrie dans `display.locales.<loc>` les lignes `cardTranslations` qui n'existent
// QU'EN BASE (traduites côté app par `/translate-catalog <loc>`, ou backfill `en`),
// pour toutes les locales cibles ou une seule. Généralise pull-en-translations.ts
// (teaser et placeLabel compris). Logique pure + règle de provenance :
// scripts/_lib/db-translation-pull.ts (à lire avant de toucher ce script).
//
// ⚠️ À lancer sur le poste qui a `data/cards`, AVANT le prochain `push:db`.
//
//   npx tsx scripts/pull-db-translations.ts all              # dry-run, toutes les locales cibles
//   npx tsx scripts/pull-db-translations.ts ru --apply       # écrit display.locales.ru
//   npx tsx scripts/pull-db-translations.ts all --apply --status both
//
// - N'écrase JAMAIS une locale locale (le JSON fait foi), ne bumpe pas contentVersion
//   (écriture directe du fichier, pas save-card : un bump rendrait toutes les lignes
//   « périmées » au push suivant).
// - Ne rapatrie que les lignes traduites depuis la version FR COURANTE
//   (`sourceContentVersion === editorial.contentVersion`) ; les autres sont listées
//   « périmées → à retraduire ». Provenance stampée : sourceHash/teaserHash du FR
//   courant (vrais, par l'égalité de version) + `origin:"db-pull"`.
// - Dry-run par défaut ; idempotent (une locale rapatriée est ensuite `skip-local`).
// - `--status approved` (défaut) | `both` (approved + reviewed).

import fs from "node:fs";
import { CardSchema, type Card } from "../schemas/card.schema.js";
import { targetLocales, validateTranslatedLocale } from "./_lib/card-translations.js";
import { localeTextFromRow, pullDecision, pulledMeta, type DbTranslationRow } from "./_lib/db-translation-pull.js";
import { db } from "./_lib/instantdb-client.js";
import { PATHS } from "./_lib/io.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { frSourceHash, frTeaserHash } from "./_lib/translation-hash.js";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--") && !["approved", "both"].includes(a));
const APPLY = args.includes("--apply");
const statusIdx = args.indexOf("--status");
const STATUS = (statusIdx >= 0 ? args[statusIdx + 1] : "approved") as "approved" | "both";
const wantStatus = (s: string) => (STATUS === "both" ? s === "approved" || s === "reviewed" : s === "approved");

const all = targetLocales();
if (!target || (target !== "all" && !all.includes(target))) {
  console.error(`Usage: tsx scripts/pull-db-translations.ts <loc|all> [--apply] [--status approved|both]\n  <loc> ∈ ${all.join(", ")}`);
  process.exit(1);
}
const LOCALES = target === "all" ? all : [target];

const FIELDS = [
  "dexNum", "locale", "title", "blurb", "body", "placeLabel", "timeDisplayLabel", "teaser",
  "whereVerb", "whereConsignePre", "whereConsignePost", "whenPromptVerb", "whenPromptPre", "whenPromptPost",
  "sourceContentVersion",
] as const;

async function main() {
  const loaded = loadCardsFromDir(PATHS.cards);
  const cards = loaded.cards.filter(({ data: c }) => wantStatus(c.editorial.status));
  console.log(`cartes ${STATUS} : ${cards.length} · locales : ${LOCALES.join(", ")}`);

  // Une requête par locale (where indexé, projection : `body` est lourd).
  const rowsByLocale = new Map<string, Map<string, DbTranslationRow>>();
  for (const locale of LOCALES) {
    const res = await db.query({ cardTranslations: { $: { where: { locale }, fields: [...FIELDS] } } });
    const byDex = new Map<string, DbTranslationRow>();
    for (const r of (res.cardTranslations ?? []) as DbTranslationRow[]) if (r.dexNum) byDex.set(r.dexNum, r);
    rowsByLocale.set(locale, byDex);
  }

  type Tally = { pulled: number; local: number; noRow: number; stale: string[]; rejected: string[] };
  const tallies = new Map<string, Tally>(LOCALES.map((l) => [l, { pulled: 0, local: 0, noRow: 0, stale: [], rejected: [] }]));
  const tally = (l: string) => tallies.get(l)!;

  for (const { file, data: c } of cards) {
    const pulls: { locale: string; loc: ReturnType<typeof localeTextFromRow> }[] = [];
    for (const locale of LOCALES) {
      const t = tally(locale);
      const row = rowsByLocale.get(locale)!.get(c.dexNum);
      const d = pullDecision(c as never, locale, row);
      if (d.kind === "skip-local") { t.local++; continue; }
      if (d.kind === "no-row") { t.noRow++; continue; }
      if (d.kind === "stale") { t.stale.push(`${c.dexNum} (ligne v${d.rowVersion ?? "?"} ≠ FR v${d.cardVersion})`); continue; }
      const loc = localeTextFromRow(row!, c.display.locales.fr);
      const v = validateTranslatedLocale(loc, c.canonical.time.tag, locale);
      if (!v.ok) { t.rejected.push(`${c.dexNum} ${v.issues.join(" | ")}`); continue; }
      pulls.push({ locale, loc });
    }
    if (!pulls.length) continue;

    if (APPLY) {
      // Relecture fraîche du fichier, mutation, Zod, écriture SANS bump de version.
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Card;
      const hashes = { sourceHash: frSourceHash(raw), teaserHash: frTeaserHash(raw) };
      raw.display.translationMeta ??= {};
      for (const { locale, loc } of pulls) {
        (raw.display.locales as Record<string, unknown>)[locale] = loc;
        raw.display.translationMeta[locale] = pulledMeta(hashes, loc, raw.editorial.contentVersion);
      }
      const parsed = CardSchema.safeParse(raw);
      if (!parsed.success) {
        const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ");
        for (const { locale } of pulls) tally(locale).rejected.push(`${c.dexNum} Zod : ${msg}`);
        continue;
      }
      fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n");
    }
    for (const { locale } of pulls) tally(locale).pulled++;
  }

  for (const l of LOCALES) {
    const t = tally(l);
    if (!t.pulled && !t.stale.length && !t.rejected.length && !t.noRow) continue;
    console.log(
      `[${l}] ${APPLY ? "rapatriées" : "à rapatrier (dry-run)"} : ${t.pulled} · déjà locales : ${t.local} · ` +
        `sans ligne en base : ${t.noRow} · périmées : ${t.stale.length} · rejetées : ${t.rejected.length}`,
    );
    if (t.stale.length) console.log(`  périmées (à retraduire, NON rapatriées) : ${t.stale.slice(0, 15).join(", ")}${t.stale.length > 15 ? "…" : ""}`);
    for (const r of t.rejected.slice(0, 10)) console.log(`  ✗ ${r}`);
  }
  if (!APPLY) console.log("\n(DRY-RUN — relancer avec --apply, puis npm run validate avant push:db)");
}

void main();
