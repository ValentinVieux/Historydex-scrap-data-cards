#!/usr/bin/env -S tsx
/**
 * Script ponctuel — applique l'audit des cartes #001-068 du 2026-05-11.
 * Cf. C:\Users\valen\.claude\plans\on-va-faire-une-serene-clover.md
 *
 * Chaque entrée décrit les patches à appliquer sur une carte donnée.
 * Le script bump `editorial.contentVersion` d'1 unité et écrit le résultat.
 */
import fs from "node:fs";
import path from "node:path";

type AnyObj = Record<string, any>;

type Patch = {
  slug: string;
  reason: string; // numéro d'audit + description courte
  apply: (c: AnyObj) => void;
};

function setPath(obj: AnyObj, dotted: string, value: any) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

const fr = (c: AnyObj) => c.display.locales.fr;

const patches: Patch[] = [
  // B.1 — Reims pivot hors borne
  {
    slug: "cathedrale-de-reims",
    reason: "[1] pivotYear 1429 HORS [1211,1345] → 1278 (médiane)",
    apply: (c) => {
      c.canonical.time.pivotYear = 1278;
      c.canonical.time.justification +=
        " — pivotYear ramené à 1278 (médiane de la phase de construction principale 1211-1345) pour cohérence intervalle.";
    },
  },

  // B.2 — Göbekli Tepe mismatch tdl/intervalle (aligner tdl sur start/end stockés)
  {
    slug: "gobekli-tepe",
    reason: "[2] tdl aligné sur startYear=-9300/endYear=-7500",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 9 300 à 7 500 av. J.-C.";
    },
  },

  // B.3 — Typos
  {
    slug: "grottes-de-lascaux",
    reason: "[3] wherePrompt refondu (verb='cette' cassé)",
    apply: (c) => {
      fr(c).wherePrompt = {
        pre: "Où a été ",
        verb: "peinte",
        post: " cette grotte ?",
      };
      // Strip espace de fin sur whenPrompt.verb si présent
      fr(c).whenPrompt.verb = fr(c).whenPrompt.verb.trim();
    },
  },
  {
    slug: "venus-de-willendorf",
    reason: "[4] verb 'crée'→'créée', 'découvert'→'découverte'",
    apply: (c) => {
      fr(c).whenPrompt.verb = "créée";
      fr(c).wherePrompt.verb = "découverte";
    },
  },
  {
    slug: "premiers-jeux-olympiques-antiques",
    reason: "[5][6] trim verbe + leading space sur post",
    apply: (c) => {
      fr(c).whenPrompt.verb = fr(c).whenPrompt.verb.trim();
      fr(c).wherePrompt.verb = fr(c).wherePrompt.verb.trim();
      if (!fr(c).whenPrompt.post.startsWith(" ")) fr(c).whenPrompt.post = " " + fr(c).whenPrompt.post;
      if (!fr(c).wherePrompt.post.startsWith(" ")) fr(c).wherePrompt.post = " " + fr(c).wherePrompt.post;
    },
  },
  {
    slug: "conquetes-d-alexandre",
    reason: "[7][59] trim verbe + align where sur 'conquêtes'",
    apply: (c) => {
      fr(c).whenPrompt.verb = fr(c).whenPrompt.verb.trim();
      fr(c).wherePrompt = {
        pre: "Où se sont ",
        verb: "déroulées",
        post: " ces conquêtes ?",
      };
    },
  },
  {
    slug: "imprimerie-de-gutenberg",
    reason: "[8] double espace dans wherePrompt.post",
    apply: (c) => {
      fr(c).wherePrompt.post = " l'imprimerie ?";
      fr(c).whenPrompt.post = " l'imprimerie ?";
    },
  },
  {
    slug: "bronzes-du-benin",
    reason: "[9] 'a été créées'→'ont été créées'",
    apply: (c) => {
      fr(c).whenPrompt.pre = "Vers quelle période ont ";
      fr(c).whenPrompt.verb = "été créées";
      fr(c).wherePrompt.pre = "Où ont ";
      fr(c).wherePrompt.verb = "été créées";
    },
  },
  {
    slug: "cueva-de-las-manos",
    reason: "[10] wherePrompt refondu ('se trouve peinte' non français)",
    apply: (c) => {
      fr(c).wherePrompt = {
        pre: "Où a été ",
        verb: "peinte",
        post: " cette fresque ?",
      };
    },
  },
  {
    slug: "dynastie-shang",
    reason: "[11] verbe dupliqué 'a régné régné'",
    apply: (c) => {
      fr(c).wherePrompt = {
        pre: "Où a ",
        verb: "régné",
        post: " cette dynastie ?",
      };
    },
  },

  // B.4 — Question vs intervalle
  {
    slug: "mausolee-d-halicarnasse",
    reason: "[12] Option A : verb 'bâti'→'existé' (intervalle = existence)",
    apply: (c) => {
      fr(c).whenPrompt.verb = "existé";
      fr(c).timeDisplayLabel = "existence: 353 av. J.-C. — 1494";
    },
  },
  {
    slug: "phare-d-alexandrie",
    reason: "[13] tdl normalisé 'existence: 280 av. J.-C. — 1480'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "existence: 280 av. J.-C. — 1480";
    },
  },
  {
    slug: "royaume-de-meroe",
    reason: "[14] Option (c) : focus royaume au lieu de pyramides",
    apply: (c) => {
      // type 'archi' → 'person'/'capital_or_power_center' n'est pas idéal (Méroé n'est pas une personne)
      // Plus simple : garder le focus mais reformuler en parlant du royaume
      // Note : le type 'archi' reste car les pyramides sont mentionnées, mais la question parle du royaume.
      fr(c).whenPrompt = {
        pre: "Vers quelle période s'est ",
        verb: "étendu",
        post: " ce royaume ?",
      };
      fr(c).wherePrompt = {
        pre: "Où s'est ",
        verb: "étendu",
        post: " ce royaume ?",
      };
      fr(c).timeDisplayLabel = "extension: 300 av. J.-C. — 350 ap. J.-C.";
    },
  },
  {
    slug: "stonehenge",
    reason: "[15] tdl préfixé 'construction:'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 3000-1100 av. J.-C.";
    },
  },

  // B.5 — Tag bascule
  {
    slug: "empire-khmer-jayavarman-vii",
    reason: "[16] règne 37 ans → bascule periodique (1181-1218, pivot=1199)",
    apply: (c) => {
      c.canonical.time.tag = "periodique";
      c.canonical.time.timeKind = "range";
      c.canonical.time.startYear = 1181;
      c.canonical.time.endYear = 1218;
      c.canonical.time.pivotYear = 1199;
      c.canonical.time.justification +=
        " — Bascule en periodique car règne 1181-1218 (37 ans > 10) ; pivot=1199 médiane.";
      fr(c).timeDisplayLabel = "règne: 1181-1218";
      fr(c).whenPrompt.pre = "Vers quelle période a ";
    },
  },

  // B.6 — Verbes hors vocab / placeKind / types
  {
    slug: "supereruption-toba",
    reason: "[17] verb 'apparu'→'éclaté' (table cata)",
    apply: (c) => {
      fr(c).whenPrompt.verb = "éclaté";
      fr(c).whenPrompt.pre = "Quand a ";
      fr(c).whenPrompt.post = " cette éruption ?";
      fr(c).wherePrompt.verb = "éclaté";
      fr(c).wherePrompt.pre = "Où a ";
      fr(c).wherePrompt.post = " cette éruption ?";
    },
  },
  {
    slug: "eruption-du-vesuve-pompei",
    reason: "[18] placeKind 'battle_site'→'discovery_site' (anachronisme corrigé)",
    apply: (c) => {
      c.canonical.place.placeKind = "discovery_site";
    },
  },
  {
    slug: "spoutnik-1957",
    reason: "[19] placeKind 'landing_site'→'creation_place' (Baïkonour = lancement)",
    apply: (c) => {
      c.canonical.place.placeKind = "creation_place";
    },
  },
  {
    slug: "cyrus-le-grand-empire-perse",
    reason: "[20] verb 'fondé cet empire'→'régné ce souverain' (cohérent type=person)",
    apply: (c) => {
      fr(c).whenPrompt = {
        pre: "Quand a ",
        verb: "régné",
        post: " ce souverain ?",
      };
      fr(c).wherePrompt = {
        pre: "Où a ",
        verb: "régné",
        post: " ce souverain ?",
      };
    },
  },
  // [21][22] : ajustements de table de vocabulaire déjà fait dans editorial-rules.md
  // (`voyagé` resté tel quel, `régné` ajouté à capital_or_power_center)

  {
    slug: "revolution-francaise-1789",
    reason: "[23] type 'cata'→'war'",
    apply: (c) => {
      c.canonical.type = "war";
    },
  },
  {
    slug: "revolution-russe-1917",
    reason: "[24] type 'cata'→'war'",
    apply: (c) => {
      c.canonical.type = "war";
    },
  },
  {
    slug: "bombardement-d-hiroshima",
    reason: "[25] type 'cata'→'war'",
    apply: (c) => {
      c.canonical.type = "war";
    },
  },
  {
    slug: "chute-mur-de-berlin",
    reason: "[26] type 'cata'→'war' (acte politique, pas catastrophe naturelle)",
    apply: (c) => {
      c.canonical.type = "war";
    },
  },
  {
    slug: "independance-des-etats-unis",
    reason: "[27] type 'treaty'→'text' (déclaration unilatérale)",
    apply: (c) => {
      c.canonical.type = "text";
      fr(c).whenPrompt = {
        pre: "Quand a été ",
        verb: "proclamée",
        post: " cette déclaration ?",
      };
      fr(c).wherePrompt = {
        pre: "Où a été ",
        verb: "proclamée",
        post: " cette déclaration ?",
      };
    },
  },
  {
    slug: "independance-d-haiti",
    reason: "[28] type 'treaty'→'text' (déclaration unilatérale)",
    apply: (c) => {
      c.canonical.type = "text";
      fr(c).whenPrompt = {
        pre: "Quand a été ",
        verb: "proclamée",
        post: " cette déclaration ?",
      };
      fr(c).wherePrompt = {
        pre: "Où a été ",
        verb: "proclamée",
        post: " cette déclaration ?",
      };
    },
  },
  // [29] independance-de-l-inde laissé tel quel

  // B.7 — Préfixes timeDisplayLabel
  // [30] stonehenge déjà fait dans [15]
  {
    slug: "la-joconde",
    reason: "[31] tdl 'création: 1503-1519'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "création: 1503-1519";
    },
  },
  // [32] gobekli-tepe déjà fait dans [2]
  {
    slug: "domestication-du-chien",
    reason: "[33] tdl 'diffusion: 25 000-14 000 av. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "diffusion: 25 000-14 000 av. J.-C.";
    },
  },
  {
    slug: "premiers-jeux-olympiques-antiques",
    reason: "[34] tdl 'éditions: 776 av. J.-C. — 393 ap. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "éditions: 776 av. J.-C. — 393 ap. J.-C.";
    },
  },
  {
    slug: "grande-muraille-de-chine",
    reason: "[35] tdl 'construction: 220 av. J.-C. — XVIIᵉ siècle'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 220 av. J.-C. — XVIIᵉ siècle";
    },
  },
  // [36] premiere-croisade laissé
  {
    slug: "angkor-vat",
    reason: "[37] tdl 'construction: 1116-1150'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 1116-1150";
    },
  },
  {
    slug: "marco-polo-en-chine",
    reason: "[38] tdl 'voyage: 1271-1295'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "voyage: 1271-1295";
    },
  },
  {
    slug: "mansa-moussa-empire-mali",
    reason: "[39] tdl 'règne: 1312-1337'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "règne: 1312-1337";
    },
  },
  // [40] peste-noire laissé
  {
    slug: "effondrement-cites-mayas",
    reason: "[41] tdl 'phénomène: 800-950'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "phénomène: 800-950";
    },
  },
  // [42] cortes laissé
  {
    slug: "bronzes-du-benin",
    reason: "[43] tdl 'production: 1400-1700'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "production: 1400-1700";
    },
  },
  {
    slug: "taj-mahal",
    reason: "[44] tdl 'construction: 1632-1653'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 1632-1653";
    },
  },
  // [45] 1ère GM laissé
  {
    slug: "petroglyphes-tassili-n-ajjer",
    reason: "[46] tdl 'réalisation: 10 000-1 500 av. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "réalisation: 10 000-1 500 av. J.-C.";
    },
  },
  {
    slug: "cueva-de-las-manos",
    reason: "[47] tdl 'réalisation: 7 300 av. J.-C. — 700 ap. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "réalisation: 7 300 av. J.-C. — 700 ap. J.-C.";
    },
  },
  {
    slug: "pyramides-de-caral",
    reason: "[48] tdl 'construction: 3000-1800 av. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "construction: 3000-1800 av. J.-C.";
    },
  },
  // [49] phare déjà fait dans [13]
  // [50] mausolée déjà fait dans [12]
  {
    slug: "royaume-d-aksoum",
    reason: "[51] tdl 'extension: Iᵉʳ-Xᵉ siècle'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "extension: Iᵉʳ-Xᵉ siècle";
    },
  },
  // [52] méroé déjà fait dans [14]
  {
    slug: "dynastie-shang",
    reason: "[53] tdl 'règne: 1600-1046 av. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "règne: 1600-1046 av. J.-C.";
    },
  },
  {
    slug: "empire-kouchan",
    reason: "[54] tdl 'extension: 30-375 ap. J.-C.'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "extension: 30-375 ap. J.-C.";
    },
  },
  {
    slug: "empire-du-ghana",
    reason: "[55] tdl 'extension: VIIIᵉ-XIIIᵉ siècle'",
    apply: (c) => {
      fr(c).timeDisplayLabel = "extension: VIIIᵉ-XIIIᵉ siècle";
    },
  },
  // [56] jayavarman déjà fait dans [16]
  // [57] reims déjà fait dans [1]

  // B.8 — whenDelta 1ère GM
  {
    slug: "premiere-guerre-mondiale",
    reason: "[58] whenDelta 2→5 (fenêtre +/- 5 ans plus tolérante)",
    apply: (c) => {
      c.gameplay.whenDelta = 5;
      c.gameplay.balanceNotes =
        "Pivot 1916 = milieu de la guerre 1914-1918. Delta 5 pour fenêtre [1911,1921] confortable au lieu de [1914,1918] strict.";
    },
  },

  // Bonus — Mismatch where/when post 1ère GM (détecté par validator)
  {
    slug: "premiere-guerre-mondiale",
    reason: "[60] wherePrompt.post 'cette guerre principalement ?'→'cette guerre ?'",
    apply: (c) => {
      fr(c).wherePrompt.post = " cette guerre ?";
    },
  },
];

// ----- Exécution -----

const APPROVED = path.join("data", "approved");
const byCard = new Map<string, { patches: Patch[]; reasons: string[] }>();
for (const p of patches) {
  const entry = byCard.get(p.slug) ?? { patches: [], reasons: [] };
  entry.patches.push(p);
  entry.reasons.push(p.reason);
  byCard.set(p.slug, entry);
}

let appliedCount = 0;
let cardsTouched = 0;
const log: string[] = [];

for (const [slug, { patches: ps, reasons }] of byCard) {
  const file = path.join(APPROVED, `${slug}.json`);
  if (!fs.existsSync(file)) {
    log.push(`  SKIP ${slug} — fichier introuvable`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf-8");
  const card = JSON.parse(raw);
  for (const p of ps) {
    p.apply(card);
    appliedCount += 1;
  }
  card.editorial.contentVersion = (card.editorial.contentVersion ?? 1) + 1;
  fs.writeFileSync(file, JSON.stringify(card, null, 2) + "\n");
  cardsTouched += 1;
  log.push(`  ${slug} (v${card.editorial.contentVersion}) — ${reasons.join(" | ")}`);
}

console.log(`Cartes touchées : ${cardsTouched}`);
console.log(`Patches appliqués : ${appliedCount}`);
console.log("Détails :");
for (const line of log) console.log(line);
