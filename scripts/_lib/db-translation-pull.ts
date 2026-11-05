// Rapatriement des `cardTranslations` qui n'existent QU'EN BASE — logique PURE
// (testée, cf. tests/db-translation-pull.test.ts), branchée par
// scripts/pull-db-translations.ts.
//
// Contexte : l'app traduit aussi le catalogue elle-même (skill `/translate-catalog`
// côté app : lit le FR en base, écrit les lignes `status:'machine'` directement).
// Ces lignes ne sont jamais retranscrites dans les JSON du pipeline. Le prochain
// `push:db` ne les écrase pas (une locale absente du JSON est sautée), mais le
// pipeline les ignore : pas de teaser à retraduire, pas d'audit, pas de détection
// de dérive. On les rapatrie dans `display.locales.<loc>`.
//
// PROVENANCE (load-bearing) — on ne stampe jamais un hash qu'on ne peut pas prouver :
//   - la ligne a été traduite depuis la version FR `row.sourceContentVersion`
//     (posée par push-card-translations.ts côté app = cards.contentVersion lu au
//     moment de la traduction) ;
//   - si elle ÉGALE `editorial.contentVersion` de la carte locale, le FR local est
//     celui dont la traduction dérive (le pipeline incrémente la version à chaque
//     sauvegarde) → stamper `sourceHash`/`teaserHash` du FR COURANT est VRAI, et
//     `translation-stale` / `teaser-translation-stale` détecteront toute édition
//     ultérieure du FR, comme pour une traduction produite ici ;
//   - sinon (FR modifié depuis) la ligne en base est PÉRIMÉE : on ne la rapatrie
//     PAS (la rapatrier puis la re-pousser sous la nouvelle version blanchirait la
//     dérive — le bug du batch 58). Elle est listée « à retraduire » (côté app,
//     translation-source.ts la voit périmée dès que la nouvelle version est poussée).
//   - `translationMeta.<loc>.origin = "db-pull"` + `pulledContentVersion` marquent
//     la provenance : la traduction vient de la base (garde LLM de l'app), pas de
//     merge-translations. Une retraduction locale (merge-translations) réécrit
//     `translationMeta.<loc>` et efface ce marqueur.

import type { Card } from "../../schemas/card.schema.js";
import type { LocaleText } from "./card-translations.js";

export type DbTranslationRow = {
  dexNum?: string;
  locale?: string;
  title?: string;
  blurb?: string;
  body?: string;
  placeLabel?: string | null;
  timeDisplayLabel?: string | null;
  teaser?: string | null;
  whereVerb?: string;
  whereConsignePre?: string;
  whereConsignePost?: string;
  whenPromptVerb?: string;
  whenPromptPre?: string;
  whenPromptPost?: string;
  sourceContentVersion?: number | null;
};

export type PullDecision =
  | { kind: "skip-local" } // la locale existe déjà dans le JSON : le pipeline fait foi
  | { kind: "no-row" } // rien en base pour cette locale
  | { kind: "stale"; rowVersion: number | null; cardVersion: number } // traduite d'un autre FR
  | { kind: "pull" };

export function pullDecision(
  card: { editorial: { contentVersion: number }; display: { locales: Record<string, unknown> } },
  locale: string,
  row: DbTranslationRow | undefined,
): PullDecision {
  if (card.display.locales[locale]) return { kind: "skip-local" };
  if (!row) return { kind: "no-row" };
  const rowVersion = typeof row.sourceContentVersion === "number" ? row.sourceContentVersion : null;
  if (rowVersion !== card.editorial.contentVersion) {
    return { kind: "stale", rowVersion, cardVersion: card.editorial.contentVersion };
  }
  return { kind: "pull" };
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

// Ligne DB (schéma app) → LocaleText (schéma pipeline). placeLabel/timeDisplayLabel
// absents de la ligne (anciens backfills `en`) → repli sur le FR, ce que l'app
// affiche déjà via le fallback colonne source. Le teaser n'est repris que s'il existe.
export function localeTextFromRow(row: DbTranslationRow, fr: LocaleText): LocaleText {
  return {
    title: row.title ?? "",
    blurb: row.blurb ?? "",
    body: row.body ?? "",
    placeLabel: nonEmpty(row.placeLabel) ? row.placeLabel : fr.placeLabel,
    timeDisplayLabel: nonEmpty(row.timeDisplayLabel) ? row.timeDisplayLabel : fr.timeDisplayLabel,
    wherePrompt: { pre: row.whereConsignePre ?? "", verb: row.whereVerb ?? "", post: row.whereConsignePost ?? "" },
    whenPrompt: { pre: row.whenPromptPre ?? "", verb: row.whenPromptVerb ?? "", post: row.whenPromptPost ?? "" },
    ...(nonEmpty(row.teaser) ? { teaser: row.teaser } : {}),
  } as LocaleText;
}

export type TranslationMetaEntry = NonNullable<Card["display"]["translationMeta"]>[string];

// Marqueur de provenance d'une locale rapatriée (cf. en-tête). `hashes` = empreintes
// du FR COURANT (frSourceHash / frTeaserHash), valides parce que pullDecision a
// vérifié l'égalité des versions. teaserHash seulement si la ligne porte un teaser
// (sinon `teaser-translation-stale` le réclamera, à juste titre).
export function pulledMeta(
  hashes: { sourceHash: string; teaserHash: string | null },
  loc: LocaleText,
  contentVersion: number,
): TranslationMetaEntry {
  return {
    sourceHash: hashes.sourceHash,
    ...(hashes.teaserHash && loc.teaser ? { teaserHash: hashes.teaserHash } : {}),
    origin: "db-pull",
    pulledContentVersion: contentVersion,
  };
}
