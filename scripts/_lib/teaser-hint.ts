// Détecteur d'indices OÙ / QUAND dans le teaser.
//
// Le teaser est la seule prose visible PENDANT l'énigme (le blurb et le body n'arrivent
// qu'après la réponse). Il doit dire ce qu'est l'objet et pourquoi il compte, sans rien
// qui situe dans l'espace (toponyme, nationalité, continent) ni dans le temps (année,
// siècle, ère, style d'époque, nom de souverain). Essai validé le 2026-10-19 sur 8 cartes
// (cf. editorial-rules § « Teaser »).
//
// Pur et sans I/O : utilisé par l'invariant `teaser-hint` (validate), par la boucle de
// génération (generate-teasers.ts) et testé dans tests/teaser-hint.test.ts.
//
// Heuristique, pas sémantique : une « erreur » est un marqueur quasi certain (chiffre
// d'année, siècle, gentilé, mot du placeLabel), un « warning » demande un œil humain
// (nom propre, mot d'époque ambigu). Le jugement fin reste à card-qa.

import { REGION_LABELS, TEASER_MAX, TEASER_MIN, type Card } from "../../schemas/card.schema.js";
import { countryNameFr } from "./country-fr.js";

export type TeaserHint = { severity: "error" | "warning"; message: string };

export type TeaserContext = {
  title: string;
  placeLabel: string;
  countryCode?: string | null;
  region?: number | null;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
/** Texte normalisé en mots séparés par UNE espace (hyphens/apostrophes → espace). */
const words = (s: string) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => words(s).split(" ").filter(Boolean);

// Terminaisons d'accord tolérées sur un radical (français : française(s), européen → européenne(s),
// grec → grecque(s), féodal → féodaux).
const ENDINGS = "(?:e|s|es|ne|nes|que|ques|x|aux)?";
const phraseRe = (phrase: string) => new RegExp(`(?:^| )${words(phrase)}${ENDINGS}(?: |$)`);

// ── Temps ────────────────────────────────────────────────────────────────────
const MONTHS = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";
const TIME_PATTERNS: Array<[RegExp, string]> = [
  [/(?:^| )\d{3,4}(?: |$)/, "année en chiffres"],
  [new RegExp(`(?:^| )(?:[ivxlcdm]+|\\d+) ?(?:er|re|e|eme|ieme)? ?(?:siecle|millenaire)`), "siècle / millénaire numéroté"],
  [/(?:^| )av(?:ant)? ?(?:j ?c|jc|notre ere)(?: |$)/, "« av. J.-C. »"],
  [/(?:^| )ap(?:res)? ?(?:j ?c|jc|notre ere)(?: |$)/, "« ap. J.-C. »"],
  [new RegExp(`(?:^| )\\d{1,2} ?(?:er)? (?:${MONTHS})(?: |$)`), "date jour-mois"],
  [/(?:^| )annees (?:\d{2,4}|folles|trente|vingt|soixante)(?: |$)/, "décennie"],
];

// Mots d'époque : forts (erreur) et doux (warning — le contexte peut les sauver).
const ERA_STRONG = [
  "antiquite", "antique", "medieval", "moyen age", "moyenageux", "feodal", "renaissance",
  "prehistoire", "prehistorique", "paleolithique", "neolithique", "mesolithique", "chalcolithique",
  "age du bronze", "age du fer", "gothique", "baroque", "rococo", "hellenistique",
  "guerre froide", "guerre mondiale", "entre deux guerres", "belle epoque", "revolution industrielle",
  "victorien", "napoleonien", "carolingien", "merovingien", "capetien", "elisabethain", "edouardien",
];
const ERA_SOFT = ["moderne", "contemporain", "classique", "romantique", "colonial", "biblique", "pharaonique", "lumieres", "imperial", "royal"];

// ── Espace ───────────────────────────────────────────────────────────────────
const GEO_WORDS = [
  "europe", "europeen", "asie", "asiatique", "afrique", "africain", "amerique", "americain",
  "oceanie", "oceanien", "antarctique", "arctique", "mediterranee", "mediterraneen",
  "orient", "oriental", "occident", "occidental", "proche orient", "moyen orient", "extreme orient",
  // (« pacifique » exclu : adjectif courant — l'océan s'écrit avec majuscule → warning nom propre.)
  "nouveau monde", "atlantique", "nordique", "scandinave", "balkanique", "iberique",
  "saharien", "transsaharien", "sahara", "andin", "amazonien", "caraibe", "caribeen", "polynesien",
  "himalayen", "himalaya", "alpin", "levant", "levantin", "maghreb", "maghrebin", "anatolien", "mesopotamien",
];
// Gentilés / peuples (radicaux normalisés ; accords via ENDINGS).
const PEOPLES = [
  "francais", "gaulois", "franc", "anglais", "britannique", "ecossais", "irlandais", "gallois",
  "allemand", "germain", "germanique", "prussien", "bavarois", "saxon", "autrichien", "suisse",
  "italien", "romain", "latin", "etrusque", "venitien", "florentin", "genois", "lombard", "sicilien", "napolitain",
  "espagnol", "castillan", "aragonais", "catalan", "andalou", "portugais", "basque",
  "grec", "hellene", "athenien", "spartiate", "macedonien", "byzantin", "cretois", "minoen", "mycenien",
  "hollandais", "neerlandais", "flamand", "belge", "polonais", "hongrois", "tcheque", "slave",
  "suedois", "danois", "norvegien", "finlandais", "viking", "normand", "breton",
  "russe", "sovietique", "ukrainien", "mongol", "hun", "tatar", "cosaque",
  "turc", "ottoman", "arabe", "persan", "perse", "iranien", "parthe", "sassanide", "achemenide",
  "sumerien", "babylonien", "assyrien", "akkadien", "hittite", "phenicien", "carthaginois", "hebreu", "israelien", "palestinien",
  "egyptien", "nubien", "ethiopien", "aksoumite", "berbere", "touareg", "maure", "marocain", "algerien", "tunisien", "libyen",
  "malien", "songhai", "ghaneen", "senegalais", "nigerian", "congolais", "zoulou", "swahili", "kenyan", "soudanais",
  "chinois", "han", "mandchou", "japonais", "coreen", "mongole", "tibetain", "vietnamien", "khmer", "thai", "birman",
  "indien", "hindou", "moghol", "bengali", "cinghalais", "nepalais", "afghan", "pakistanais", "indonesien", "malais", "philippin", "javanais",
  "americain", "mexicain", "azteque", "maya", "olmeque", "inca", "peruvien", "bresilien", "argentin", "chilien", "cubain", "haitien", "canadien", "quebecois",
  "australien", "neo zelandais", "maori", "hawaien", "polynesien", "aborigene", "inuit", "apache", "sioux", "cherokee",
  "parisien", "londonien", "new yorkais", "moscovite", "romain", "troyen", "thebain", "alexandrin",
];

// Mots du placeLabel / du pays trop génériques pour trahir quoi que ce soit.
const PLACE_STOP = new Set([
  "musee", "royaume", "empire", "republique", "etat", "etats", "unis", "ville", "cite", "ile", "iles",
  "palais", "chateau", "cathedrale", "eglise", "basilique", "temple", "abbaye", "monastere", "universite",
  "hopital", "hospital", "base", "camp", "fort", "port", "pont", "place", "rue", "avenue", "grand", "grande",
  "petit", "petite", "haute", "basse", "nouvelle", "nouveau", "vieux", "vieille", "mer", "ocean", "lac",
  "golfe", "baie", "cap", "detroit", "vallee", "plaine", "plateau", "desert", "foret", "montagne", "mont",
  "fleuve", "riviere", "region", "province", "comte", "duche", "canton", "centre", "central", "front",
  "ligne", "zone", "site", "actuel", "actuelle", "aujourd", "ancien", "ancienne", "pres", "entre", "vers",
  "sous", "dans", "chez", "avec", "pour", "des", "les", "aux", "une", "notre", "leur", "saint", "sainte",
  "nord", "sud", "ouest", "est", "orientale", "occidentale", "hors", "precolombiennes", "latines",
  // Noms communs fréquents dans les placeLabel (« Stade Centenario », « atelier impérial »,
  // « pays de la zone euro ») : un teaser qui dit « un stade », « un atelier », « plusieurs pays »
  // ne situe rien — faux positifs constatés au backfill du 2026-10-19.
  "pays", "stade", "atelier", "cour", "siege", "quartier", "maison", "salle", "jardin", "parc", "tour",
  "colline", "rocher", "falaise", "grotte", "champ", "champs", "pierre", "mine", "usine", "laboratoire",
  "observatoire", "bibliotheque", "ecole", "college", "academie", "theatre", "opera", "arene", "cirque",
  "forum", "agora", "necropole", "tombeau", "mausolee", "pyramide", "citadelle", "forteresse", "muraille",
  "monastere", "sanctuaire", "chapelle", "mosquee", "synagogue", "pagode", "stupa", "ziggourat", "oasis",
  "estuaire", "delta", "canal", "cap", "col", "glacier", "volcan", "archipel", "atoll", "peninsule", "isthme",
  "frontiere", "route", "chemin", "voie", "gare", "aeroport", "chantier", "arsenal", "caserne", "prison",
  "bureau", "banque", "bourse", "marche", "foire", "exposition", "pavillon", "galerie", "chateaux",
  "terre", "terres", "cote", "cotes", "plage", "plages", "monde", "rive", "rives", "sommet", "bord",
  "royal", "royale", "royaux", "imperial", "imperiale", "national", "nationale", "municipal", "sacre",
  "proche", "moyen", "extreme", "haut", "bas", "milieu", "fond", "pointe", "porte", "portes", "mur", "murs",
]);
// Noms communs souvent capitalisés sans rien situer.
const PROPER_ALLOW = new Set(["terre", "lune", "soleil", "dieu", "etat", "etats", "eglise", "empire", "republique", "antiquite"]);

/**
 * Indices OÙ/QUAND détectés dans `teaser`. `ctx.title` est le seul texte que le joueur
 * voit avec le teaser : ses mots sont autorisés (un lieu dans le titre est permis).
 */
export function teaserHints(teaser: string, ctx: TeaserContext): TeaserHint[] {
  const out: TeaserHint[] = [];
  const t = teaser.trim();
  if (t.length < TEASER_MIN) out.push({ severity: "error", message: `trop court (${t.length} < ${TEASER_MIN} caractères)` });
  if (t.length > TEASER_MAX) out.push({ severity: "error", message: `trop long (${t.length} > ${TEASER_MAX} caractères)` });

  const w = ` ${words(t)} `;
  const titleTokens = new Set(tokens(ctx.title));

  for (const [re, label] of TIME_PATTERNS) if (re.test(w)) out.push({ severity: "error", message: `indice QUAND : ${label}` });
  for (const p of ERA_STRONG) if (phraseRe(p).test(w)) out.push({ severity: "error", message: `indice QUAND : mot d'époque « ${p} »` });
  for (const p of ERA_SOFT) if (phraseRe(p).test(w)) out.push({ severity: "warning", message: `indice QUAND possible : « ${p} » (préférer un mot sans époque)` });

  for (const p of GEO_WORDS) if (!titleTokens.has(words(p)) && phraseRe(p).test(w)) out.push({ severity: "error", message: `indice OÙ : « ${p} »` });
  for (const p of PEOPLES) if (!titleTokens.has(words(p)) && phraseRe(p).test(w)) out.push({ severity: "error", message: `indice OÙ : gentilé « ${p} »` });

  // Mots du placeLabel (la réponse OÙ) et du nom de pays / de région, hors mots du titre.
  const answerTokens = new Set<string>();
  for (const tok of tokens(ctx.placeLabel)) answerTokens.add(tok);
  const country = countryNameFr(ctx.countryCode ?? null);
  if (country) for (const tok of tokens(country)) answerTokens.add(tok);
  if (ctx.region != null && REGION_LABELS[ctx.region]) for (const tok of tokens(REGION_LABELS[ctx.region]!)) answerTokens.add(tok);
  for (const tok of answerTokens) {
    if (tok.length < 4 || PLACE_STOP.has(tok) || titleTokens.has(tok)) continue;
    if (new RegExp(`(?:^| )${tok}${ENDINGS}(?: |$)`).test(w)) out.push({ severity: "error", message: `indice OÙ : « ${tok} » vient du lieu-réponse (placeLabel / pays)` });
  }

  // Noms propres hors titre, en milieu de phrase → à relire (un peintre, un roi situent l'œuvre).
  const raw = t.split(/\s+/);
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1]!;
    if (/[.!?…]$/.test(prev) || prev === "«") continue;
    const m = /^[«(]?([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{2,})/.exec(raw[i]!);
    if (!m) continue;
    const n = norm(m[1]!).replace(/[^a-z]/g, "");
    if (titleTokens.has(n) || PROPER_ALLOW.has(n)) continue;
    out.push({ severity: "warning", message: `nom propre « ${m[1]} » : vérifier qu'il ne situe pas l'œuvre (lieu, souverain, auteur)` });
  }

  return out;
}

export function teaserHintsForCard(card: Card): TeaserHint[] {
  const fr = card.display.locales.fr;
  if (!fr.teaser) return [];
  return teaserHints(fr.teaser, {
    title: fr.title,
    placeLabel: fr.placeLabel,
    countryCode: card.canonical.place.countryCode,
    region: card.canonical.place.region,
  });
}
