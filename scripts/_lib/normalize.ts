// Normalisation de recherche du Dex — DOIT rester identique à
// app/historydex/lib/catalog/search.ts (et à la copie historique dans push-db.ts) :
// la valeur stockée dans cards.normalizedTitle / cardTranslations.normalizedTitle
// est comparée par un `$like` SERVEUR à la saisie utilisateur normalisée avec cette
// même fonction. Toute divergence casse la recherche (0 résultat).
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
