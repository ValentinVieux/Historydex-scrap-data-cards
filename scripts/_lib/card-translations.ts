// Émission des `cardTranslations` (locales non-source) vers InstantDB, depuis les
// cartes générées en amont (display.locales.<loc> rempli par le skill translate-cards).
//
// - Locales cibles = SOURCE UNIQUE : app/historydex/lib/i18n/supported-locales.json
//   (lu via chemin frère). Toute locale non-`source` est une cible de traduction.
// - Mapping LocaleText (schéma scrap) → ligne `cardTranslations` (schéma app) :
//   wherePrompt/whenPrompt {pre,verb,post} → where/whenConsigne* ; placeLabel n'est
//   PAS le pays — cardTranslations.country = countryName(countryCode, locale) (exonyme localisé).
// - `status:'machine'` = état final (l'humain ne relit que le FR ; la garde LLM du
//   skill est le QA des traductions).
// - Validation (validateTranslatedLocale) = défense en profondeur AVANT écriture :
//   champs non vides, invariant lead-in ponctuelle/periodique, contrat d'espaces.

import fs from "node:fs";
import path from "node:path";
import type { Card } from "../../schemas/card.schema.js";
import { countryName } from "./country-en.js";
import { normalizeForSearch } from "./normalize.js";

export type LocaleText = Card["display"]["locales"]["fr"];

export type CardTranslationRow = {
  locale: string;
  dexNum: string;
  normalizedTitle: string;
  title: string;
  country: string;
  whereVerb: string;
  whereConsignePre: string;
  whereConsignePost: string;
  whenPromptVerb: string;
  whenPromptPre: string;
  whenPromptPost: string;
  blurb: string;
  body: string;
  status: string;
  sourceContentVersion: number;
  timeDisplayLabel?: string;
};

const SOURCE_LOCALE = "fr";

// ── Locales cibles (source unique = JSON côté app, chemin frère) ─────────────
type LocaleEntry = { code: string; name?: string; native?: string; source?: boolean };

export function loadSupportedLocales(): LocaleEntry[] {
  const p = path.resolve(process.cwd(), "..", "app", "historydex", "lib", "i18n", "supported-locales.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as LocaleEntry[];
  } catch {
    // Repli défensif si le repo frère est introuvable.
    return [
      { code: "fr", source: true },
      { code: "en" },
    ];
  }
}

/** Codes des locales À TRADUIRE (toutes les non-source). */
export function targetLocales(): string[] {
  return loadSupportedLocales()
    .filter((l) => !l.source && l.code !== SOURCE_LOCALE)
    .map((l) => l.code);
}

// ── Validation structurelle (cf. app/historydex/lib/i18n/translationQuality.ts) ──
type TemporalTag = "ponctuelle" | "periodique";

export const WHEN_LEAD_INS: Record<string, Record<TemporalTag, string>> = {
  fr: { ponctuelle: "Quand", periodique: "Vers quelle période" },
  en: { ponctuelle: "When", periodique: "Around what period" },
  es: { ponctuelle: "¿Cuándo", periodique: "¿En qué período" },
  de: { ponctuelle: "Wann", periodique: "In welchem Zeitraum" },
  it: { ponctuelle: "Quando", periodique: "In quale periodo" },
  pt: { ponctuelle: "Quando", periodique: "Em que período" },
};

const WORD_END = /[\p{L}\p{N}]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;

function spacingIssues(axis: string, pre: string, verb: string, post: string): string[] {
  const issues: string[] = [];
  const s = `${pre}${verb}${post}`;
  if (s.includes("  ")) issues.push(`${axis} double space: "${s.trim()}"`);
  if (WORD_END.test(pre) && WORD_START.test(verb)) issues.push(`${axis} verb glued to pre: "${s.trim()}"`);
  if (WORD_END.test(verb) && WORD_START.test(post)) issues.push(`${axis} verb glued to post: "${s.trim()}"`);
  return issues;
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Valide une LocaleText traduite. ok=false ⇒ NE PAS écrire (à re-traduire). */
export function validateTranslatedLocale(
  loc: LocaleText,
  tag: TemporalTag,
  locale: string,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const required: [string, unknown][] = [
    ["title", loc.title], ["blurb", loc.blurb], ["body", loc.body],
    ["placeLabel", loc.placeLabel], ["timeDisplayLabel", loc.timeDisplayLabel],
    ["wherePrompt.pre", loc.wherePrompt?.pre], ["wherePrompt.verb", loc.wherePrompt?.verb], ["wherePrompt.post", loc.wherePrompt?.post],
    ["whenPrompt.pre", loc.whenPrompt?.pre], ["whenPrompt.verb", loc.whenPrompt?.verb], ["whenPrompt.post", loc.whenPrompt?.post],
  ];
  for (const [name, v] of required) if (!nonEmpty(v)) issues.push(`empty/missing: ${name}`);

  const leadIns = WHEN_LEAD_INS[locale];
  if (!leadIns) {
    issues.push(`locale '${locale}' missing from WHEN_LEAD_INS — add its lead-ins`);
  } else {
    const pre = typeof loc.whenPrompt?.pre === "string" ? loc.whenPrompt.pre : "";
    if (!pre.trimStart().startsWith(leadIns[tag])) {
      issues.push(`whenPrompt.pre must start with "${leadIns[tag]}" for ${tag} (${locale}); got "${pre.slice(0, 28)}…"`);
    }
  }

  issues.push(...spacingIssues("WHEN", loc.whenPrompt?.pre ?? "", loc.whenPrompt?.verb ?? "", loc.whenPrompt?.post ?? ""));
  issues.push(...spacingIssues("WHERE", loc.wherePrompt?.pre ?? "", loc.wherePrompt?.verb ?? "", loc.wherePrompt?.post ?? ""));

  return { ok: issues.length === 0, issues };
}

// ── Mapping LocaleText → ligne cardTranslations ──────────────────────────────

/** La LocaleText d'une locale donnée, ou null si absente/non remplie. */
export function localeTextOf(card: Card, locale: string): LocaleText | null {
  const locales = card.display.locales as unknown as Record<string, LocaleText | null | undefined>;
  return locales[locale] ?? null;
}

export function buildTranslationRow(card: Card, locale: string, loc: LocaleText): CardTranslationRow {
  // Pays = exonyme localisé dans la locale cible (Intl) ; repli sur le nom de lieu
  // canonique FR si pas de countryCode (ex. Lune, océan, région diffuse).
  const country = countryName(card.canonical.place.countryCode, locale) ?? card.canonical.place.placeCanonicalName;
  const row: CardTranslationRow = {
    locale,
    dexNum: card.dexNum,
    normalizedTitle: normalizeForSearch(loc.title),
    title: loc.title,
    country,
    whereVerb: loc.wherePrompt.verb,
    whereConsignePre: loc.wherePrompt.pre,
    whereConsignePost: loc.wherePrompt.post,
    whenPromptVerb: loc.whenPrompt.verb,
    whenPromptPre: loc.whenPrompt.pre,
    whenPromptPost: loc.whenPrompt.post,
    blurb: loc.blurb,
    body: loc.body,
    status: "machine",
    sourceContentVersion: card.editorial.contentVersion,
  };
  if (nonEmpty(loc.timeDisplayLabel)) row.timeDisplayLabel = loc.timeDisplayLabel;
  return row;
}
