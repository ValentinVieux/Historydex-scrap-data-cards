// ISO 3166-1 alpha-2 → nom de pays LOCALISÉ (exonyme), via Intl.DisplayNames —
// correct par construction (CLDR), sans table à maintenir. Sert à dériver
// cardTranslations.country par locale (le pays n'est PAS un champ éditorial du
// LLM : LocaleTextSchema n'a pas de `country`). Ex. countryName("GB","es")="España"… non,
// "Reino Unido" ; countryName("GB","en")="United Kingdom".
//
// Overrides PAR LOCALE pour coller aux exonymes choisis par le catalogue
// (ex. en: Türkiye plutôt que Turkey ; es/de/it/pt gardent l'exonyme naturel d'Intl).

const OVERRIDES: Record<string, Record<string, string>> = {
  en: { TR: "Türkiye" },
};

const cache = new Map<string, Intl.DisplayNames>();
function names(locale: string): Intl.DisplayNames {
  let dn = cache.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: "region" });
    cache.set(locale, dn);
  }
  return dn;
}

/** Nom de pays dans `locale` (ISO 639-1) pour un code ISO 3166-1 alpha-2. */
export function countryName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  const ov = OVERRIDES[locale]?.[c];
  if (ov) return ov;
  try {
    return names(locale).of(c) ?? null;
  } catch {
    return null;
  }
}

/** Rétro-compat : nom de pays en anglais. */
export function countryNameEn(code: string | null | undefined): string | null {
  return countryName(code, "en");
}
