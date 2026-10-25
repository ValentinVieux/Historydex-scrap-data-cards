// Relecture OBLIGATOIRE de la MT avant merge (décidé le 2026-10-25).
//
// Pourquoi : l'audit des titres du 2026-10-25 a trouvé 1 349 titres faux sur ~11 500
// (≈ 12 %, 18-20 % en ja/ko) — homonymes pris dans le mauvais sens (« Crosse » → pt
// « Estoque », « Polonaise » → « Polaco », « Réductions jésuites » → en « Discounts »),
// noms propres restés en français (« Site de Monte Verde »), transcriptions fausses.
// Un titre est un segment court sans contexte : c'est là qu'Azure se trompe le plus.
//
// Contrat : la ligne `<loc>.whenwhere.jsonl` produite par le sous-agent de l'étape 2
// porte, en plus des consignes, le `title` traduit par l'agent (jamais la MT) et les
// `fixes` de prose qu'il a jugés nécessaires. Sans `title`, la carte n'est pas mergée.

export const REVIEWABLE_FIELDS = ["blurb", "teaser", "body", "placeLabel", "timeDisplayLabel"] as const;
type ReviewableField = (typeof REVIEWABLE_FIELDS)[number];

export type ReviewRow = {
  dexNum: string;
  title?: string;
  fixes?: Partial<Record<string, string>>;
};

export function applyReview(
  prose: Record<string, string>,
  review: ReviewRow,
): { ok: true; prose: Record<string, string> } | { ok: false; issue: string } {
  const title = review.title?.trim();
  if (!title) return { ok: false, issue: "titre relu manquant (étape 2 : le sous-agent doit fournir `title`)" };
  const out = { ...prose, title };
  for (const [field, text] of Object.entries(review.fixes ?? {})) {
    if (!(REVIEWABLE_FIELDS as readonly string[]).includes(field)) return { ok: false, issue: `fix sur un champ non relisible : ${field}` };
    if (!text?.trim()) return { ok: false, issue: `fix vide sur ${field}` };
    // Un teaser absent du FR n'a pas été staged : l'agent ne doit pas en inventer un.
    if (!(field in prose)) return { ok: false, issue: `fix sur ${field} absent de la prose staged` };
    out[field as ReviewableField] = text.trim();
  }
  return { ok: true, prose: out };
}
