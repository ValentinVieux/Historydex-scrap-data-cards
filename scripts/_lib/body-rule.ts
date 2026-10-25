// Body « fiche courte » (décision Valentin 2026-10-25, editorial-rules § Body — fiche courte) :
// 3 phrases, 60 mots au plus. Pur et sans I/O : invariant `body-too-long` (validate) et garde de
// `apply-body-rewrites.ts`, testé dans tests/body-rule.test.ts.

export const BODY_MAX_WORDS = 60;

/** Mots = suites contenant une lettre ou un chiffre (« — », « : » ne comptent pas). */
export function bodyWordCount(body: string): number {
  return body.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

/** Chiffres nus, insensibles au séparateur de milliers : « 15 000 » = « 15.000 » = « 15000 ». */
function numbersOf(text: string): Set<string> {
  const t = text.replace(/(\d)[.,\s  ](?=\d{3}(?!\d))/g, "$1");
  return new Set(t.match(/\d+/g) ?? []);
}

/**
 * Nombres d'une réécriture absents de toutes les sources (ancien body, titre, libellé de date…).
 * Une réécriture courte n'apporte aucun fait : un nombre nouveau est un fait inventé ou déformé.
 */
export function unsourcedNumbers(rewrite: string, sources: string[]): string[] {
  const known = numbersOf(sources.join(" "));
  return [...numbersOf(rewrite)].filter((n) => !known.has(n));
}
