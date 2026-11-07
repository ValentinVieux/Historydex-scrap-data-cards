// Resynchronise `data/cards/` depuis la base InstantDB (LECTURE SEULE sur la base).
//
// Cas d'usage : `data/cards` restauré depuis un snapshot plus ancien que la base
// (perte du dossier le 2026-11-07, snapshot 2026-10-18) alors que la base a reçu des
// corrections directes (bodies « fiche courte » 25/10, corrections FR des 05-06/11…).
// La base est la vérité : pour chaque carte dont `db.contentVersion > editorial.contentVersion`,
// on réécrit dans le JSON les SEULS champs que `push:db` dérive du JSON (miroir exact de
// `flatten()` dans scripts/_lib/push-db.ts), on pose `editorial.contentVersion = db` et on
// ajoute une note datée. La couche éditoriale (sources, notes, gameplay hors champs poussés,
// justifications, factNotes) n'est jamais touchée.
//
//   npx tsx scripts/sync-from-db.ts                      # dry-run (rapport par carte)
//   npx tsx scripts/sync-from-db.ts --apply              # écrit les JSON
//   npx tsx scripts/sync-from-db.ts --apply --from="snapshot 2026-10-18"   # libellé de la note
//
// Texte FR : la ligne `cardTranslations` de locale `fr` (lue en premier par l'app) prime sur
// les colonnes de `cards` ; une divergence entre les deux est signalée.
// `country` n'est PAS un champ du JSON (push:db le dérive de `countryCode` via country-fr.ts,
// sinon `placeCanonicalName`) : on rétro-dérive `countryCode` quand la valeur en base est un
// nom de pays connu ; sinon la valeur est signalée comme non reproductible par push:db.
// Locales traduites : quand le FR change, les locales présentes localement dérivent d'un FR
// qui n'existe plus → invalidées (null + translationMeta supprimé, même mécanique que
// apply-body-rewrites) ; `pull-db-translations.ts all --apply` les rapatrie ensuite depuis la
// base à la version courante. Un FR inchangé (bump de version seul) ne les touche pas.
// Carte en base absente en local : JSON squelette `draft` créé (couche éditoriale perdue).
// Carte locale absente en base : rien (signalée ; attendu pour les `reviewed` jamais poussées).
// Images : hors périmètre (`$files` en base ; `_images-final` absent = texte seul au push).

import fs from "node:fs";
import path from "node:path";
import { CardSchema, type Card } from "../schemas/card.schema.js";
import { targetLocales } from "./_lib/card-translations.js";
import { countryNameFr } from "./_lib/country-fr.js";
import { db } from "./_lib/instantdb-client.js";
import { PATHS, writeJson } from "./_lib/io.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { frSourceHash, frTeaserHash } from "./_lib/translation-hash.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FROM = args.find((a) => a.startsWith("--from="))?.slice("--from=".length);
const TODAY = new Date().toISOString().slice(0, 10);
const PAGE = 500;

const CARD_FIELDS = [
  "dexNum", "title", "type", "era", "region", "country", "placeLabel", "tag", "pivotYear", "startYear", "endYear",
  "whenDelta", "lat", "lon", "whereRadiusKm", "whereVerb", "whereConsignePre", "whereConsignePost",
  "whenPromptVerb", "whenPromptPre", "whenPromptPost", "timeDisplayLabel", "blurb", "body", "teaser",
  "imageLabel", "contentVersion",
] as const;
const TEXT_FIELDS = [
  "title", "blurb", "body", "placeLabel", "timeDisplayLabel", "teaser", "whereVerb", "whereConsignePre",
  "whereConsignePost", "whenPromptVerb", "whenPromptPre", "whenPromptPost",
] as const;
const FR_FIELDS = ["dexNum", ...TEXT_FIELDS, "sourceContentVersion"] as const;

type DbCard = { [K in (typeof CARD_FIELDS)[number]]?: string | number | null };
type FrRow = { [K in (typeof FR_FIELDS)[number]]?: string | number | null };

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

// Nom FR → code ISO (inverse de countryNameFr). Pas de table exportée : on balaie les
// 676 codes possibles ; un nom porté par deux codes est ambigu → non rétro-dérivé.
const codeByCountryFr = new Map<string, string | null>();
for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const name = countryNameFr(a + b);
  if (name) codeByCountryFr.set(name, codeByCountryFr.has(name) ? null : a + b);
}

async function paged<T>(run: (offset: number) => Promise<unknown[] | undefined>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = ((await run(offset)) ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Pose `value` à `dotted.path` si différent ; renvoie true si modifié.
function setPath(obj: unknown, dotted: string, value: unknown): boolean {
  const keys = dotted.split(".");
  let o = obj as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  const last = keys[keys.length - 1]!;
  if (o[last] === value) return false;
  o[last] = value;
  return true;
}

// Champs JSON ← colonnes DB (miroir de flatten() dans _lib/push-db.ts). Mutations en place.
// Renvoie les chemins modifiés + les avertissements.
function applyDb(card: Card, row: DbCard, fr: FrRow | undefined): { changed: string[]; warnings: string[] } {
  const changed: string[] = [];
  const warnings: string[] = [];
  const text = (col: (typeof TEXT_FIELDS)[number]): string | undefined => {
    const a = fr?.[col];
    const b = row[col];
    if (nonEmpty(a) && nonEmpty(b) && a !== b) warnings.push(`${col} : ligne fr ≠ colonne cards (ligne fr retenue)`);
    return nonEmpty(a) ? a : nonEmpty(b) ? b : undefined;
  };
  const pairs: Array<[string, unknown]> = [
    ["display.locales.fr.title", text("title")],
    ["display.locales.fr.blurb", text("blurb")],
    ["display.locales.fr.body", text("body")],
    ["display.locales.fr.placeLabel", text("placeLabel")],
    ["display.locales.fr.timeDisplayLabel", text("timeDisplayLabel")],
    ["display.locales.fr.teaser", text("teaser")],
    ["display.locales.fr.wherePrompt.verb", text("whereVerb")],
    ["display.locales.fr.wherePrompt.pre", text("whereConsignePre")],
    ["display.locales.fr.wherePrompt.post", text("whereConsignePost")],
    ["display.locales.fr.whenPrompt.verb", text("whenPromptVerb")],
    ["display.locales.fr.whenPrompt.pre", text("whenPromptPre")],
    ["display.locales.fr.whenPrompt.post", text("whenPromptPost")],
    ["canonical.type", row.type],
    ["gameplay.era", row.era],
    ["canonical.place.region", row.region],
    ["canonical.time.tag", row.tag],
    ["canonical.time.pivotYear", row.pivotYear],
    ["gameplay.whenDelta", row.whenDelta],
    ["canonical.place.lat", row.lat],
    ["canonical.place.lon", row.lon],
    ["gameplay.whereRadiusKm", row.whereRadiusKm],
    ["display.imageLabel", row.imageLabel],
  ];
  // push:db n'émet startYear/endYear que pour une periodique : on ne les lit que dans ce cas.
  if (row.tag === "periodique") pairs.push(["canonical.time.startYear", row.startYear], ["canonical.time.endYear", row.endYear]);
  for (const [p, v] of pairs) if (v != null && setPath(card, p, v)) changed.push(p);

  // country = countryNameFr(countryCode) ?? placeCanonicalName (push-db) → rétro-dérivation.
  const localCountry = countryNameFr(card.canonical.place.countryCode) ?? card.canonical.place.placeCanonicalName;
  if (nonEmpty(row.country) && row.country !== localCountry) {
    const code = codeByCountryFr.get(row.country);
    if (code) {
      card.canonical.place.countryCode = code;
      changed.push(`canonical.place.countryCode=${code}`);
    } else {
      warnings.push(`country « ${row.country} » non reproductible par push:db (local : « ${localCountry} », countryCode=${card.canonical.place.countryCode ?? "null"})`);
    }
  }
  return { changed, warnings };
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Carte en base sans JSON : squelette minimal (status draft, sources vides) — la couche
// éditoriale est perdue, à reconstituer avant toute approbation.
function skeleton(row: DbCard, fr: FrRow | undefined): Card {
  const dexNum = String(row.dexNum);
  const slug = slugify(String(row.title)) || `carte-${dexNum}`;
  const periodique = row.tag === "periodique";
  const lost = `${TODAY} : créé depuis la base (JSON absent du snapshot) — couche éditoriale perdue (sources, notes, gameplay, justifications) à reconstituer`;
  const raw = {
    id: slug, dexNum,
    canonical: {
      subjectKey: slug, type: row.type, aliases: [], factNotes: [],
      time: { tag: row.tag, timeKind: periodique ? "range" : "single_year", pivotYear: row.pivotYear, startYear: null, endYear: null, justification: lost },
      place: { placeKind: "other", placeCanonicalName: row.country, lat: 0, lon: 0, region: row.region, countryCode: codeByCountryFr.get(String(row.country)) ?? null, geoKind: "earth", justification: lost },
    },
    gameplay: { era: row.era, whenDelta: 1, whereRadiusKm: 1, difficultyWhen: "regional", difficultyWhere: "regional", eligibleForWhen: true, eligibleForWhere: true, balanceNotes: "" },
    display: {
      defaultLocale: "fr",
      locales: { fr: { title: "", blurb: "", body: "", placeLabel: "", timeDisplayLabel: "", wherePrompt: { pre: "", verb: "", post: "" }, whenPrompt: { pre: "", verb: "", post: "" } } },
      imageLabel: "", translationNotes: [], translationMeta: {},
    },
    editorial: { status: "draft", confidence: "low", contentVersion: 1, notes: [lost], warnings: [], sources: [] },
  } as unknown as Card;
  applyDb(raw, row, fr);
  return raw;
}

async function main() {
  const dbCards = await paged<DbCard>(async (offset) =>
    (await db.query({ cards: { $: { fields: [...CARD_FIELDS] as never, order: { dexNum: "asc" }, limit: PAGE, offset } } })).cards);
  // Pas d'`order` ici : `cardTranslations.dexNum` n'est PAS indexé en prod (refus 400) ;
  // l'ordre serveur par défaut (serverCreatedAt) suffit à une pagination par offset.
  const frRows = await paged<FrRow>(async (offset) =>
    (await db.query({ cardTranslations: { $: { where: { locale: "fr" }, fields: [...FR_FIELDS] as never, limit: PAGE, offset } } })).cardTranslations);
  const frByDex = new Map(frRows.filter((r) => r.dexNum).map((r) => [String(r.dexNum), r]));

  const loaded = loadCardsFromDir(PATHS.cards);
  if (loaded.issues.length) {
    console.error(`${loaded.issues.length} JSON invalide(s) (ignorés) : ${loaded.issues.map((i) => path.basename(i.file)).join(", ")}`);
  }
  const localByDex = new Map(loaded.cards.map((c) => [c.data.dexNum, c]));
  const locales = targetLocales();

  const tally = { same: 0, updated: 0, created: 0, newer: 0, drift: 0, rejected: 0 };
  const lines: string[] = [];
  const warnings: string[] = [];

  for (const row of dbCards) {
    const dexNum = String(row.dexNum);
    const dbVersion = typeof row.contentVersion === "number" ? row.contentVersion : 0;
    const fr = frByDex.get(dexNum);
    const local = localByDex.get(dexNum);

    if (!local) {
      const card = skeleton(row, fr);
      const file = path.join(PATHS.cards, `${fs.existsSync(path.join(PATHS.cards, `${card.id}.json`)) ? `${card.id}-${dexNum}` : card.id}.json`);
      card.editorial.contentVersion = dbVersion || 1;
      const parsed = CardSchema.safeParse(card);
      if (!parsed.success) {
        tally.rejected++;
        lines.push(`  ✗ ${dexNum} absente en local, squelette invalide : ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ")}`);
        continue;
      }
      if (APPLY) writeJson(file, parsed.data);
      tally.created++;
      lines.push(`  + ${dexNum} absente en local → ${path.basename(file)} créé (draft, couche éditoriale PERDUE)`);
      continue;
    }

    const card = local.data;
    const localVersion = card.editorial.contentVersion;
    if (dbVersion < localVersion) {
      tally.newer++;
      lines.push(`  ! ${dexNum} local v${localVersion} > base v${dbVersion} (non touchée)`);
      continue;
    }
    if (dbVersion === localVersion) {
      // Même version : une divergence de texte serait une dérive sans bump (signalée, non écrite).
      const probe = applyDb(structuredClone(card), row, fr);
      if (probe.changed.length) {
        tally.drift++;
        lines.push(`  ~ ${dexNum} v${localVersion} : dérive sans bump (non écrite) : ${probe.changed.join(", ")}`);
      } else tally.same++;
      for (const w of probe.warnings) warnings.push(`${dexNum} : ${w}`);
      continue;
    }

    const hashBefore = frSourceHash(card) + "|" + frTeaserHash(card);
    const { changed, warnings: w } = applyDb(card, row, fr);
    for (const x of w) warnings.push(`${dexNum} : ${x}`);
    card.editorial.contentVersion = dbVersion;
    let note = `${TODAY} : resynchronisé depuis la base (${FROM ?? `v${localVersion}`} → v${dbVersion})`;
    const invalidated: string[] = [];
    if (hashBefore !== frSourceHash(card) + "|" + frTeaserHash(card)) {
      const locs = card.display.locales as unknown as Record<string, unknown>;
      for (const loc of locales) {
        if (!locs[loc]) continue;
        locs[loc] = null;
        delete card.display.translationMeta[loc];
        invalidated.push(loc);
      }
      if (invalidated.length) note += ` ; FR modifié → ${invalidated.length} locales invalidées, à rapatrier via pull-db-translations`;
    }
    card.editorial.notes.push(note);

    const parsed = CardSchema.safeParse(card);
    if (!parsed.success) {
      tally.rejected++;
      lines.push(`  ✗ ${dexNum} v${localVersion}→v${dbVersion} REJETÉE (Zod) : ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ")}`);
      continue;
    }
    if (APPLY) writeJson(local.file, parsed.data);
    tally.updated++;
    lines.push(`  ↑ ${dexNum} v${localVersion}→v${dbVersion} : ${changed.join(", ") || "(version seule)"}${invalidated.length ? ` · locales invalidées : ${invalidated.join(", ")}` : ""}`);
  }

  const dbDex = new Set(dbCards.map((r) => String(r.dexNum)));
  const missingInDb = loaded.cards.filter((c) => !dbDex.has(c.data.dexNum));
  const byStatus = new Map<string, string[]>();
  for (const c of missingInDb) byStatus.set(c.data.editorial.status, [...(byStatus.get(c.data.editorial.status) ?? []), c.data.dexNum]);

  console.log(`[sync-from-db] ${APPLY ? "APPLY — JSON écrits" : "DRY-RUN — rien d'écrit"}`);
  console.log(`cartes en base : ${dbCards.length} (lignes fr : ${frRows.length}) · en local : ${loaded.cards.length}`);
  console.log(
    `identiques : ${tally.same} · mises à jour : ${tally.updated} · créées (absentes en local) : ${tally.created} · ` +
      `absentes en base : ${missingInDb.length} · local plus récent : ${tally.newer} · dérive sans bump : ${tally.drift} · rejetées : ${tally.rejected}`,
  );
  if (lines.length) console.log(`\nPar carte :\n${lines.join("\n")}`);
  for (const [status, dex] of byStatus) {
    console.log(`\nabsentes en base (${status}, ${dex.length}) : ${dex.slice(0, 30).join(", ")}${dex.length > 30 ? ", …" : ""}`);
  }
  if (warnings.length) console.log(`\nAvertissements (${warnings.length}) :\n  ${warnings.join("\n  ")}`);
  if (!APPLY) console.log("\n(DRY-RUN — relancer avec --apply, puis pull-db-translations.ts all --apply, validate, push:db --dry-run)");
}

void main();
