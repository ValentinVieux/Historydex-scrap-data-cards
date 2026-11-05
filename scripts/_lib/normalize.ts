// Normalisation de recherche du Dex — DOIT rester identique à
// app/historydex/lib/catalog/search.ts (et à la copie historique dans push-db.ts) :
// la valeur stockée dans cards.normalizedTitle / cardTranslations.normalizedTitle
// est comparée par un `$like` SERVEUR à la saisie utilisateur normalisée avec cette
// même fonction. Toute divergence casse la recherche (0 résultat).
//
// NFD puis suppression de TOUTES les marques combinantes (`\p{M}`) : accents latins
// (vietnamien compris), tonos grecs, brève cyrillique (й → и, ё → е), niqqud, tashkīl.
// Sur le latin, identique à l'ancienne plage U+0300–U+036F. « đ » → « d », sigma final
// « ς » → « σ ». Écritures gardées : a-z, chiffres, Han, Kana, Hangul, cyrillique,
// grec, arabe, hébreu. Échappements explicites : aucun caractère combinant littéral.
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\u0111/g, "d")
    .replace(/\u03C2/g, "\u03C3")
    .replace(
      /[^a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}]+/gu,
      "",
    );
}
