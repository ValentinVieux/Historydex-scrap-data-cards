import {
  ERA_BOUNDS,
  HD_ERA_WHEN_DELTAS,
  RECOMMENDED_WHERE_RADIUS_KM,
  type Card,
} from "../../schemas/card.schema.js";
import type { LoadedCard } from "./load-cards.js";
import { regionFromCountryHitWithSnap, regionLabel } from "./region-geo.js";

export type Severity = "error" | "warning";

export type Issue = {
  severity: Severity;
  file: string;
  cardId?: string;
  rule: string;
  message: string;
};

const APPROVED_MIN_SOURCES = 2;

// --- placeKind ↔ wherePrompt.verb -----------------------------------------
// Normalise un participe passé en retirant l'accord (genre/nombre) :
// signées→signé, construite→construit, née→né, déroulées→déroulé, peinte→peint.
// (Les terminaisons en "é"/"i" ne sont pas touchées : é ≠ e, i ≠ e/s en fin.)
function normVerb(v: string): string {
  let s = v.trim().toLowerCase();
  if (s.endsWith("s")) s = s.slice(0, -1);
  if (s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// placeKind ↔ verbe WHERE : familles de verbes attendues (warning si hors-famille —
// l'agent card-qa tranche au cas par cas). Les placeKind absents de cette table
// (symbolic_location, origin_area, diffusion_area, capital_or_power_center, other)
// sont « flous » : le verbe dépend trop du sujet (couronné, sacré, éclaté, frappée,
// développée, fondée…) → pas de contrainte automatique, c'est le rôle de card-qa.
const PLACEKIND_VERBS: Record<string, string[]> = {
  birth_place: ["né", "baptisé"],
  death_place: ["mort", "décédé", "exécuté", "assassiné", "fusillé", "guillotiné", "tué", "inhumé", "enterré"],
  battle_site: ["déroulé", "livré", "mené", "combattu", "produit", "joué", "commis", "perpétré", "attaqué", "assiégé", "remporté"],
  construction_site: ["construit", "érigé", "bâti", "élevé", "dressé", "existé", "achevé", "aménagé", "creusé", "taillé", "fondé"],
  creation_place: ["peint", "sculpté", "écrit", "rédigé", "réalisé", "créé", "gravé", "composé", "fondu", "tissé", "produit", "dessiné", "frappé", "inventé", "conçu", "formulé", "élaboré", "perfectionné", "compilé", "décrit", "codifié", "noué", "tracé", "brodé", "forgé", "mis au point"],
  publication_place: ["publié", "paru", "rédigé", "écrit", "imprimé", "promulgué", "proclamé", "édité", "diffusé", "adopté", "présenté"],
  signature_place: ["signé", "ratifié", "scellé", "proclamé", "conclu", "paraphé", "adopté", "promulgué", "déclaré", "acté"],
  current_exhibition: ["exposé", "conservé", "présenté", "abrité"],
  discovery_site: ["découvert", "exhumé", "retrouvé", "mis au jour", "trouvé", "fouillé", "mis"],
  landing_site: ["débarqué", "atterri", "accosté", "posé", "arrivé", "abordé", "aluni"],
};
const STRICT_PLACEKINDS = new Set(Object.keys(PLACEKIND_VERBS));
function placeKindAcceptsVerb(placeKind: string, verb: string): boolean {
  const accepted = PLACEKIND_VERBS[placeKind];
  if (!accepted) return true; // placeKind flou → non contraint
  const vTrim = verb.trim().toLowerCase();
  const vNorm = normVerb(vTrim);
  return accepted.some((a) => (a.includes(" ") ? a === vTrim : normVerb(a) === vNorm));
}

// Bandes de rayon WHERE attendues par placeKind (warning si hors bande, sauf
// difficultyWhere="special"). Reprend la table du gameplay-balancer, élargie
// pour ne flaguer que les écarts nets. Recalées mai 2026 sur l'usage réel des
// 233 premières cartes : les lieux "précis" sont en pratique centrés 500-800
// (rarement < 500), et symbolic_location est centré 800 (pas 1500-3000).
const RADIUS_BANDS: Record<string, [number, number]> = {
  current_exhibition: [500, 800],
  death_place: [500, 800],
  publication_place: [500, 1000],
  birth_place: [500, 1200],
  creation_place: [500, 1200],
  signature_place: [500, 1200],
  discovery_site: [500, 1200],
  construction_site: [400, 1200],
  battle_site: [500, 1200],
  landing_site: [800, 2000],
  capital_or_power_center: [500, 2000],
  symbolic_location: [500, 2000],
  diffusion_area: [800, 3000],
  origin_area: [800, 3000],
};

export function runInvariants(loaded: LoadedCard[]): Issue[] {
  const issues: Issue[] = [];

  const idsSeen = new Map<string, string>(); // id -> file
  const dexSeen = new Map<string, string>(); // dexNum -> file
  const subjectSeen = new Map<string, string>();

  for (const { file, data } of loaded) {
    // Cross-card uniqueness
    const idOwner = idsSeen.get(data.id);
    if (idOwner) {
      issues.push({
        severity: "error",
        file,
        cardId: data.id,
        rule: "unique-id",
        message: `id "${data.id}" already used by ${idOwner}`,
      });
    } else {
      idsSeen.set(data.id, file);
    }

    const dexOwner = dexSeen.get(data.dexNum);
    if (dexOwner) {
      issues.push({
        severity: "error",
        file,
        cardId: data.id,
        rule: "unique-dexNum",
        message: `dexNum "${data.dexNum}" already used by ${dexOwner}`,
      });
    } else {
      dexSeen.set(data.dexNum, file);
    }

    const subjOwner = subjectSeen.get(data.canonical.subjectKey);
    if (subjOwner) {
      issues.push({
        severity: "warning",
        file,
        cardId: data.id,
        rule: "unique-subjectKey",
        message: `subjectKey "${data.canonical.subjectKey}" already used by ${subjOwner}`,
      });
    } else {
      subjectSeen.set(data.canonical.subjectKey, file);
    }

    issues.push(...checkSingleCard(file, data));
  }

  return issues;
}

function checkSingleCard(file: string, c: Card): Issue[] {
  const out: Issue[] = [];
  const cardId = c.id;

  // Time tag coherence
  const { tag, pivotYear, startYear, endYear } = c.canonical.time;
  if (tag === "periodique") {
    if (startYear == null || endYear == null) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "periodique-requires-range",
        message: "tag=periodique requires startYear AND endYear",
      });
    } else {
      if (startYear > endYear) {
        out.push({
          severity: "error",
          file,
          cardId,
          rule: "range-order",
          message: `startYear (${startYear}) must be <= endYear (${endYear})`,
        });
      }
      if (!(pivotYear >= startYear && pivotYear <= endYear)) {
        out.push({
          severity: "error",
          file,
          cardId,
          rule: "pivot-in-range",
          message: `pivotYear (${pivotYear}) must satisfy startYear <= pivotYear <= endYear`,
        });
      }
      if (endYear - startYear <= 10) {
        out.push({
          severity: "error",
          file,
          cardId,
          rule: "periodique-too-short",
          message: `tag=periodique avec durée ${endYear - startYear} an(s) <= 10 — convertir en ponctuelle avec pivotYear emblématique et garder la fourchette dans timeDisplayLabel`,
        });
      }
    }
  }

  // Era / pivotYear coherence
  const eraBound = ERA_BOUNDS[c.gameplay.era];
  if (!(pivotYear >= eraBound.start && pivotYear <= eraBound.end)) {
    const noteHasJustification = c.editorial.notes.some(
      (n) => n.toLowerCase().includes("ère") || n.toLowerCase().includes("era"),
    );
    out.push({
      severity: noteHasJustification ? "warning" : "error",
      file,
      cardId,
      rule: "era-pivot-coherence",
      message: `pivotYear ${pivotYear} is outside era "${c.gameplay.era}" bounds [${eraBound.start}..${eraBound.end}]${noteHasJustification ? " (justified in notes)" : " — add a justification in editorial.notes mentioning 'ère' or 'era' to downgrade to warning"}`,
    });
  }

  // whenDelta est dérivé mécaniquement de l'ère depuis la migration era-based.
  // gameplay.whenDelta doit être égal à HD_ERA_WHEN_DELTAS[gameplay.era].
  const expectedDelta = HD_ERA_WHEN_DELTAS[c.gameplay.era];
  if (c.gameplay.whenDelta !== expectedDelta) {
    out.push({
      severity: "error",
      file,
      cardId,
      rule: "whenDelta-era-mismatch",
      message: `whenDelta=${c.gameplay.whenDelta} doit valoir ${expectedDelta} pour era="${c.gameplay.era}" (HD_ERA_WHEN_DELTAS)`,
    });
  }

  // whereRadius paliers
  if (!RECOMMENDED_WHERE_RADIUS_KM.includes(c.gameplay.whereRadiusKm as never)) {
    out.push({
      severity: "warning",
      file,
      cardId,
      rule: "whereRadius-tier",
      message: `whereRadiusKm=${c.gameplay.whereRadiusKm} is not in recommended tiers ${RECOMMENDED_WHERE_RADIUS_KM.join("/")}`,
    });
  }

  // Source invariants — enforced from "reviewed" upward.
  // Rationale: "reviewed" means the pipeline (researcher → editor → normalizer) is
  // complete; empty editorial.sources at that stage means the normalize step dropped
  // the sources of the raw fact sheet. Catch it here instead of waiting for the human
  // to hit the approve button in the review app and get a 422.
  if (c.editorial.status === "reviewed" || c.editorial.status === "approved") {
    if (c.editorial.sources.length < APPROVED_MIN_SOURCES) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "reviewed-needs-sources",
        message: `${c.editorial.status} cards require at least ${APPROVED_MIN_SOURCES} sources (found ${c.editorial.sources.length})`,
      });
    }
    const hasDateSource = c.editorial.sources.some((s) => s.relevance === "date");
    const hasPlaceSource = c.editorial.sources.some((s) => s.relevance === "place");
    if (!hasDateSource) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "reviewed-needs-date-source",
        message: `${c.editorial.status} cards require at least 1 source with relevance=date`,
      });
    }
    if (!hasPlaceSource) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "reviewed-needs-place-source",
        message: `${c.editorial.status} cards require at least 1 source with relevance=place`,
      });
    }
  }

  // Approved-only invariants (judgment calls finalized during human review).
  if (c.editorial.status === "approved") {
    if (c.editorial.confidence === "low") {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "approved-no-low-confidence",
        message: "approved cards cannot have confidence=low",
      });
    }
  }

  // Display invariants
  if (c.display.defaultLocale !== "fr") {
    out.push({
      severity: "error",
      file,
      cardId,
      rule: "default-locale-fr",
      message: "display.defaultLocale must be 'fr' (phase 1)",
    });
  }
  // fr is required by schema, just sanity check non-empty fields already enforced by Zod.

  // whenPrompt coherence with tag
  const whenPre = c.display.locales.fr.whenPrompt.pre.trim().toLowerCase();
  if (tag === "periodique" && !whenPre.startsWith("vers quelle période")) {
    out.push({
      severity: "warning",
      file,
      cardId,
      rule: "whenPrompt-periodique-pre",
      message: `whenPrompt.pre="${c.display.locales.fr.whenPrompt.pre}" — cartes periodique commencent typiquement par "Vers quelle période…"`,
    });
  }
  if (tag === "ponctuelle" && !whenPre.startsWith("quand")) {
    out.push({
      severity: "warning",
      file,
      cardId,
      rule: "whenPrompt-ponctuelle-pre",
      message: `whenPrompt.pre="${c.display.locales.fr.whenPrompt.pre}" — cartes ponctuelles commencent typiquement par "Quand…"`,
    });
  }

  // wherePrompt + whenPrompt — heuristiques de forme (verbe et post)
  //
  // Le verbe doit ressembler à un participe passé / verbe simple, pas à un
  // déterminant ou démonstratif. Cf. cas Lascaux : verb="cette" (cassé).
  // Participe passé / verbe simple, éventuellement suivi d'un complément court
  // (« mis au point », « mise en service », « mise en circulation »).
  const VERB_SHAPE = /^[a-zàâéèêëïîôùûç-]+(e|s|es|ée|ées|és|i|is|it|ent)?(?: (?:au|aux|en|à|de|du|des|la|le|les) [a-zàâéèêëïîôùûç-]+)*$/i;
  // Mots-outils interdits comme verbe (déterminants, pronoms, prépositions courants).
  const VERB_FORBIDDEN = new Set([
    "ce", "cet", "cette", "ces", "le", "la", "les", "un", "une", "des",
    "du", "de", "à", "au", "aux", "et", "ou", "qui", "que", "dont", "où",
  ]);
  for (const promptName of ["wherePrompt", "whenPrompt"] as const) {
    const prompt = c.display.locales.fr[promptName];
    const verbLower = prompt.verb.trim().toLowerCase();
    if (VERB_FORBIDDEN.has(verbLower) || !VERB_SHAPE.test(prompt.verb.trim())) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-verb-shape`,
        message: `${promptName}.verb="${prompt.verb}" ne ressemble pas à un verbe (attendu : participe passé ou verbe simple)`,
      });
    }
    if (prompt.post.trim().length < 3) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-post-shape`,
        message: `${promptName}.post="${prompt.post}" est trop court (devrait contenir un substantif explicite)`,
      });
    }
    // Substantifs génériques interdits.
    const postLower = prompt.post.toLowerCase();
    if (/\b(ce site|cet objet|cette chose|ce truc)\b/.test(postLower)) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-post-generic`,
        message: `${promptName}.post="${prompt.post}" utilise un terme générique — choisis un substantif spécifique au sujet (cf. table de vocabulaire dans editorial-rules.md)`,
      });
    }
  }

  // Cohérence post entre wherePrompt et whenPrompt — devraient référer au même objet.
  const wpPost = c.display.locales.fr.wherePrompt.post.trim();
  const npPost = c.display.locales.fr.whenPrompt.post.trim();
  if (wpPost !== npPost) {
    out.push({
      severity: "warning",
      file,
      cardId,
      rule: "where-when-post-mismatch",
      message: `wherePrompt.post=${JSON.stringify(wpPost)} ≠ whenPrompt.post=${JSON.stringify(npPost)} — devraient utiliser le même substantif (objet de la carte)`,
    });
  }

  // Hygiène des prompts (espaces parasites, double espaces, verbe dupliqué).
  for (const promptName of ["wherePrompt", "whenPrompt"] as const) {
    const prompt = c.display.locales.fr[promptName];
    if (prompt.verb !== prompt.verb.trim()) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-verb-whitespace`,
        message: `${promptName}.verb=${JSON.stringify(prompt.verb)} contient un espace en début/fin`,
      });
    }
    const concat = `${prompt.pre}${prompt.verb}${prompt.post}`;
    if (/ {2,}/.test(concat)) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-double-space`,
        message: `${promptName} concaténé contient un double espace : ${JSON.stringify(concat)}`,
      });
    }
    const verbLower = prompt.verb.trim().toLowerCase();
    const preLower = prompt.pre.toLowerCase();
    if (verbLower.length > 2 && (preLower.endsWith(` ${verbLower} `) || preLower.endsWith(` ${verbLower}`))) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: `${promptName}-verb-duplicate`,
        message: `${promptName}: verbe ${JSON.stringify(prompt.verb)} déjà présent à la fin de pre=${JSON.stringify(prompt.pre)}`,
      });
    }
  }

  // tdl-range-mismatch : pour les periodique, comparer les bornes lues dans tdl à startYear/endYear.
  if (tag === "periodique" && startYear != null && endYear != null) {
    const tdl = c.display.locales.fr.timeDisplayLabel;
    // Capture chaque nombre (potentiellement avec espace fin "9 600"), avec son contexte droit.
    // On distingue BC/AD via marqueur "av. J.-C." / "ap. J.-C." dans les 25 caractères suivants,
    // avant qu'un autre nombre n'apparaisse.
    const numRegex = /(\d[\d\s]{0,5}\d|\d)/g;
    type RawYear = { n: number; ownBC: boolean | null };
    const raw: RawYear[] = [];
    let m: RegExpExecArray | null;
    while ((m = numRegex.exec(tdl)) !== null) {
      const n = parseInt(m[1].replace(/\s/g, ""), 10);
      if (isNaN(n) || n < 50) continue;
      // Cherche un marqueur dans la zone qui suit, avant le prochain nombre.
      const after = tdl.slice(m.index + m[0].length);
      const nextNumIdx = after.search(/\d/);
      const window = nextNumIdx === -1 ? after : after.slice(0, nextNumIdx);
      let ownBC: boolean | null = null;
      if (/av\.?\s*j\.?-?c\.?/i.test(window)) ownBC = true;
      else if (/ap(?:r)?\.?\s*j\.?-?c\.?/i.test(window)) ownBC = false;
      raw.push({ n, ownBC });
    }
    // Propage en arrière : un nombre sans marqueur hérite du marqueur du nombre suivant
    // (utile pour "vers 3000 à 1100 av. J.-C." où seul le 1100 a "av. J.-C." attaché).
    for (let i = raw.length - 2; i >= 0; i--) {
      if (raw[i].ownBC === null) raw[i].ownBC = raw[i + 1].ownBC;
    }
    const years = raw.map((r) => (r.ownBC === true ? -r.n : r.n));
    if (years.length >= 2) {
      const sorted = [...years].sort((a, b) => a - b);
      const tdlStart = sorted[0];
      const tdlEnd = sorted[sorted.length - 1];
      const TOL = 50;
      if (Math.abs(tdlStart - startYear) > TOL || Math.abs(tdlEnd - endYear) > TOL) {
        out.push({
          severity: "warning",
          file,
          cardId,
          rule: "tdl-range-mismatch",
          message: `timeDisplayLabel ${JSON.stringify(tdl)} (lu: ${tdlStart}..${tdlEnd}) ne reflète pas startYear=${startYear}/endYear=${endYear} (tolérance ±${TOL})`,
        });
      }
    }
  }

  // title-when-spoiler : le titre ne doit jamais contenir l'année-réponse du quizz WHEN.
  // Le titre peut nommer l'objet et le lieu (« Bataille de Marignan »), mais jamais l'année
  // que le joueur doit deviner. Politique : renommer (la date vit dans timeDisplayLabel/body,
  // affichés après résolution). Cf. editorial-rules.md « À éviter absolument ».
  {
    const title = c.display.locales.fr.title;
    const delta = c.gameplay.whenDelta;
    let lo: number, hi: number;
    if (tag === "periodique" && startYear != null && endYear != null) {
      lo = startYear - delta;
      hi = endYear + delta;
    } else {
      lo = pivotYear - delta;
      hi = pivotYear + delta;
    }
    // Titre en « av. J.-C. » → tester aussi la valeur négative (sans marqueur, « Vésuve 79 » reste AD).
    const titleBC = /av\.?\s*j\.?-?c\.?/i.test(title);
    const titleNums = (title.match(/\d{1,4}/g) || []).map((s) => parseInt(s, 10));
    const spoiler = titleNums.find(
      (n) => (n >= lo && n <= hi) || (titleBC && -n >= lo && -n <= hi),
    );
    if (spoiler !== undefined) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: "title-when-spoiler",
        message: `title ${JSON.stringify(title)} contient ${spoiler}, dans la fenêtre WHEN [${lo}..${hi}] (pivot=${pivotYear}, whenDelta=${delta}) — révèle la réponse au quizz WHEN. Renommer (déplacer la date vers body/timeDisplayLabel).`,
      });
    }
  }

  // title-contains-date : AUCUNE date (année, « av./ap. J.-C. », date jour-mois) ne doit
  // figurer dans le titre — plus strict que title-when-spoiler (qui ne couvre que la fenêtre
  // WHEN). Règle utilisateur 2026-06-27 ; cf. editorial-rules.md « À éviter absolument ».
  // Échappatoire : une note editorial.notes contenant « exception titre-date » rétrograde en
  // warning (cas du roman « 1984 » d'Orwell, dont le titre EST le nom propre de l'œuvre).
  {
    const t = c.display.locales.fr.title;
    const MONTHS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
    const hasYear = /\d{3,4}/.test(t);
    const hasBC = /av\.?\s*j\.?-?c\.?|ap\.?\s*j\.?-?c\.?/i.test(t);
    const hasDayMonth = new RegExp(`\\b\\d{1,2}\\s+(${MONTHS})\\b`, "i").test(t);
    if (hasYear || hasBC || hasDayMonth) {
      const sanctioned = c.editorial.notes.some((n) => /exception titre-date/i.test(n));
      out.push({
        severity: sanctioned ? "warning" : "error",
        file,
        cardId,
        rule: "title-contains-date",
        message: `title ${JSON.stringify(t)} contient une date (année / « av. J.-C. » / date jour-mois) — interdit dans un titre. Déplacer la date vers timeDisplayLabel/body et renommer le sujet.${sanctioned ? " (exception sanctionnée via editorial.notes)" : ""}`,
      });
    }
  }

  // Localisabilité obligatoire (règle utilisateur 2026-06-27) : toute carte doit être jouable
  // en OÙ ET en QUAND. Pas de lieu abstrait, pas de coordonnées 0,0, pas d'axe désactivé.
  const { lat, lon, geoKind } = c.canonical.place;
  if (c.gameplay.eligibleForWhere === false || geoKind === "abstract" || (lat === 0 && lon === 0)) {
    out.push({
      severity: "error",
      file,
      cardId,
      rule: "not-localizable-where",
      message: `carte non localisable dans l'espace (eligibleForWhere=${c.gameplay.eligibleForWhere}, geoKind="${geoKind}", lat=${lat}, lon=${lon}) — toute carte doit avoir un lieu réel jouable en OÙ. Choisir un sujet localisable, renseigner de vraies coordonnées, ou ancrer sur un point réel (ex. pays opérateur pour une mission spatiale).`,
    });
  }
  if (c.gameplay.eligibleForWhen === false) {
    out.push({
      severity: "error",
      file,
      cardId,
      rule: "not-localizable-when",
      message: "carte non localisable dans le temps (eligibleForWhen=false) — toute carte doit avoir une date jouable en QUAND.",
    });
  }

  // Geographic sanity (region ↔ tap explorateur, earth seulement)
  if (geoKind === "earth") {
    // region ↔ (lat, lon) — la région réellement scorée en OÙ explorateur est
    // celle du PAYS tapé sur le globe : `regionFromCountryHitWithSnap` rend le
    // pays contenant le point, sinon snappe au pays le plus proche ≤ 150 km
    // (pin en mer/détroit, île trop fine pour le 1:110M — ex. Bosphore pour
    // Istanbul). Si elle diffère de place.region, AUCUN tap correct ne valide
    // la carte → injouable. Bloquant pour une carte `approved` (gate de push) ;
    // warning sinon (édition en cours). snap = null (océan, lieu abstrait) →
    // indéterminable, ignoré. NB : utiliser le snap ferme l'angle mort historique
    // où les pins maritimes orphelins (regionFromCountryHit = null) sautaient ce
    // contrôle (cf. Mosquée bleue / Théra, audit 2026-06-14).
    const appRegion = regionFromCountryHitWithSnap(lat, lon);
    if (appRegion !== null && appRegion !== c.canonical.place.region) {
      const blocking = c.editorial.status === "approved";
      out.push({
        severity: blocking ? "error" : "warning",
        file,
        cardId,
        rule: "region-latlon-mismatch",
        message: `place.region=R${c.canonical.place.region} (${regionLabel(c.canonical.place.region as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10)}) mais le tap explorateur (lat=${lat.toFixed(2)}, lon=${lon.toFixed(2)}) résout R${appRegion} (${regionLabel(appRegion)}) → carte injouable en OÙ explorateur. Aligner place.region sur R${appRegion}, ou déplacer le pin / revoir le countryCode.`,
      });
    }
  }

  // Mot collé : le verbe doit apparaître comme token isolé dans pre+verb+post.
  // Attrape l'espace manquant entre verbe et pre/post (que double-space ne voit pas).
  // Ex. cassé : pre="…se sont " verb="déroulées" post="ces conquêtes ?" → "dérouléesces".
  for (const promptName of ["wherePrompt", "whenPrompt"] as const) {
    const prompt = c.display.locales.fr[promptName];
    const verbTrim = prompt.verb.trim();
    if (verbTrim.length === 0) continue;
    const concat = `${prompt.pre}${prompt.verb}${prompt.post}`;
    const isolated = new RegExp(`(^|\\s)${escapeRegExp(verbTrim)}(\\s|[.,!?;:…])`);
    if (!isolated.test(concat)) {
      out.push({
        severity: "error",
        file,
        cardId,
        rule: `${promptName}-verb-post-glue`,
        message: `${promptName} : le verbe ${JSON.stringify(prompt.verb)} est collé à pre ou post (espace manquant) dans ${JSON.stringify(concat)}`,
      });
    }
  }

  // placeKind ↔ wherePrompt.verb (le WHERE interroge le lieu). Erreur pour les
  // placeKind stricts ; les placeKind flous ne sont pas contraints.
  const placeKind = c.canonical.place.placeKind;
  if (STRICT_PLACEKINDS.has(placeKind) && !placeKindAcceptsVerb(placeKind, c.display.locales.fr.wherePrompt.verb)) {
    out.push({
      severity: "warning",
      file,
      cardId,
      rule: "placeKind-verb-coherence",
      message: `wherePrompt.verb=${JSON.stringify(c.display.locales.fr.wherePrompt.verb)} hors famille attendue pour placeKind="${placeKind}" (${PLACEKIND_VERBS[placeKind].join(", ")}) — à arbitrer (card-qa) : ajuster le verbe, ou changer le placeKind`,
    });
  }

  // Monument à usage prolongé cadré "construction" (cf. editorial-rules « Monuments
  // à usage prolongé »). Intervalle long + tdl "construction:" + verbe de chantier
  // → préférer "existence:"/"existé" ou resserrer l'intervalle.
  if (c.canonical.type === "archi" && tag === "periodique" && startYear != null && endYear != null && endYear - startYear > 300) {
    const tdlLower = c.display.locales.fr.timeDisplayLabel.trim().toLowerCase();
    const whenVerbNorm = normVerb(c.display.locales.fr.whenPrompt.verb);
    const constructionVerbs = new Set(["bâti", "construit", "érigé", "élevé"].map(normVerb));
    if (tdlLower.startsWith("construction:") && constructionVerbs.has(whenVerbNorm)) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: "archi-construction-vs-existence",
        message: `monument à intervalle long (${endYear - startYear} ans) cadré "construction:" + verbe ${JSON.stringify(c.display.locales.fr.whenPrompt.verb)} — préférer "existence:"/"existé" (usage prolongé) ou resserrer l'intervalle à la phase de chantier`,
      });
    }
  }

  // whereRadiusKm cohérent avec la bande attendue du placeKind (échappatoire : special).
  const band = RADIUS_BANDS[placeKind];
  if (band && c.gameplay.difficultyWhere !== "special") {
    const r = c.gameplay.whereRadiusKm;
    if (r < band[0] || r > band[1]) {
      out.push({
        severity: "warning",
        file,
        cardId,
        rule: "whereRadius-placekind-band",
        message: `whereRadiusKm=${r} hors bande [${band[0]}..${band[1]}] attendue pour placeKind="${placeKind}" — resserrer/élargir ou justifier via difficultyWhere="special" + balanceNotes`,
      });
    }
  }

  return out;
}
