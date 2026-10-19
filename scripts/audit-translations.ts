// Audit ADVISOIRE des traductions (hors `validate`, comme verify-geo).
//
// Cherche les erreurs que la traduction automatique introduit et que rien ne
// relit aujourd'hui : les 4414 lignes de cardTranslations n'ont jamais été
// auditées, alors que le FR l'a été carte par carte (honesty-audit, 58 batches).
//
// Deux détecteurs, volontairement mécaniques (ni agent, ni LLM) :
//
//   1. NOMBRES PERDUS — tout nombre présent dans le FR doit se retrouver dans la
//      traduction. Normalisation en chiffres nus, donc insensible aux séparateurs
//      (« 15 000 » = « 15.000 » = « 15,000 »). Attrape les faits amputés ou
//      déformés au passage. Fort rappel, quelques faux positifs (reformulations
//      qui écrivent le nombre en toutes lettres).
//
//   2. PIÈGES CONNUS — noms propres historiques rendus comme des mots communs.
//      C'est la famille « Unter dem Lied » (dynastie Song → le mot *song*) et
//      « Mio Figlio » (sanctuaire Mỹ Sơn → *mon fils*). Précision totale, rappel
//      limité à ce que la table contient : l'enrichir à chaque trouvaille.
//
//   3. VERBES POLYSÉMIQUES — un verbe FR à double sens (« doubler » un cap = le
//      contourner) rendu dans son AUTRE sens (es *duplicar*, de *verdoppeln*, ja 倍増 =
//      multiplier par deux). Cas 774 du 2026-10-18 : 9 locales sur 11. Scanne aussi les
//      consignes OÙ/QUAND (c'est là que le verbe vit). Même logique que les pièges :
//      précision totale, rappel = la table POLYSEMY.
//
//   npx tsx scripts/audit-translations.ts               # tout le catalogue
//   npx tsx scripts/audit-translations.ts --dex 529     # une carte
//   npx tsx scripts/audit-translations.ts --numbers-only

import fs from "node:fs";
import { HASH_TRACKED_LOCALES } from "./_lib/translation-hash.js";

const CARDS_DIR = "data/cards";
const argv = process.argv.slice(2);
const ONLY_DEX = argv.includes("--dex") ? argv[argv.indexOf("--dex") + 1] : null;
const NUMBERS_ONLY = argv.includes("--numbers-only");
const TRAPS_ONLY = argv.includes("--traps-only");
const POLYSEMY_ONLY = argv.includes("--polysemy-only");

// Nom propre FR → rendu fautif par locale. Ajouter une entrée à chaque trouvaille.
const TRAPS: Array<{ fr: string; bad: Partial<Record<string, string[]>>; note: string }> = [
  {
    fr: "My Son",
    bad: { it: ["Mio Figlio"], es: ["Mi Hijo"], de: ["Mein Sohn"], pt: ["Meu Filho"] },
    note: "sanctuaire cham Mỹ Sơn traduit comme le lien de parenté",
  },
  {
    fr: "Song",
    bad: { de: ["dem Lied", "des Liedes", "das Lied"], it: ["la canzone"], es: ["la canción"], pt: ["a canção"] },
    note: "dynastie Song traduite comme le mot « chanson »",
  },
  {
    fr: "shivaïsme",
    bad: { it: ["scaevismo"], es: ["escaevismo"], pt: ["escaevismo"] },
    note: "shivaïsme rendu par un terme inexistant",
  },
  {
    fr: "Tang",
    bad: { de: ["die Zange"], it: ["le tenaglie"] },
    note: "dynastie Tang confondue avec un nom commun",
  },
  {
    fr: "Ming",
    bad: { de: ["das Meinige"] },
    note: "dynastie Ming",
  },
];

// Verbe FR polysémique → rendus fautifs (l'AUTRE sens) par locale. `fr` = regex sur le
// texte FR (consignes + blurb + body) ; `bad` = sous-chaînes (insensibles à la casse)
// cherchées dans la traduction. Ajouter une entrée à chaque trouvaille (revue de clarté
// 2026-10-18, docs/2026-10-18-prompt-revue-clarte-consignes.md).
const POLYSEMY: Array<{ fr: RegExp; bad: Partial<Record<string, string[]>>; note: string }> = [
  {
    // Forme VERBALE + contexte nautique (cap / pointe / promontoire à ≤ 40 car.). Sans le
    // contexte, « double la superficie » (Louisiane, 356) ou « double hélice » (adjectif)
    // déclenchaient à tort : là, duplicar / verdoppeln / podwójna sont les bons rendus.
    fr: /\bdoubl(?:é|ée|és|ées|er|ent|a|ait)\b[^.;]{0,40}\b(?:cap|pointe|promontoire)\b|\b(?:cap|pointe|promontoire)\b[^.;]{0,40}\bdoubl(?:é|ée|és|ées|er|ent|a|ait)\b/i,
    bad: {
      es: ["duplic"], pt: ["duplic"], "pt-PT": ["duplic"], it: ["raddoppi"], de: ["verdoppel"],
      pl: ["podwoi", "podwaja"], tr: ["iki katına"], nl: ["verdubbel"], ja: ["倍増", "二倍"], ko: ["두 배"],
    },
    note: "« doubler un cap » (le contourner) rendu au sens « multiplier par deux »",
  },
];

const promptsOf = (l: { wherePrompt?: Record<string, string>; whenPrompt?: Record<string, string> }) =>
  `${l.wherePrompt?.pre ?? ""}${l.wherePrompt?.verb ?? ""}${l.wherePrompt?.post ?? ""} ${l.whenPrompt?.pre ?? ""}${l.whenPrompt?.verb ?? ""}${l.whenPrompt?.post ?? ""}`;

/**
 * Chiffres nus d'un texte : « 15 000 », « 15.000 » et « 15,000 » donnent tous "15000".
 *
 * On recolle d'abord les groupes de milliers (séparateur = UN caractère suivi
 * d'exactement 3 chiffres), puis on extrait les suites de chiffres. Sans la
 * contrainte des 3 chiffres, « en 1896, 241 athlètes » se fusionnait en "1896241".
 */
function numbersOf(text: string): Set<string> {
  let t = text;
  const grouped = new RegExp('(\\d)' + "[.,\\u0020\\u00A0\\u202F]" + '(\\d{3})(?!\\d)', 'g');
  for (let i = 0; i < 4; i++) t = t.replace(grouped, '$1$2');
  const out = new Set<string>();
  for (const m of t.matchAll(/\d+/g)) out.add(m[0]);
  return out;
}

type Finding = { dex: string; title: string; locale: string; kind: string; detail: string };
const findings: Finding[] = [];
let scanned = 0;

for (const f of fs.readdirSync(CARDS_DIR)) {
  if (!f.endsWith(".json")) continue;
  const card = JSON.parse(fs.readFileSync(`${CARDS_DIR}/${f}`, "utf8"));
  if (ONLY_DEX && String(card.dexNum) !== ONLY_DEX) continue;
  const fr = card.display.locales?.fr;
  if (!fr) continue;

  const frText = `${fr.title} ${fr.blurb} ${fr.body}`;
  const frNums = numbersOf(frText);
  let cardHasLocale = false;

  for (const locale of HASH_TRACKED_LOCALES) {
    const loc = card.display.locales?.[locale];
    if (!loc) continue;
    cardHasLocale = true;
    const locText = `${loc.title} ${loc.blurb} ${loc.body}`;

    if (!TRAPS_ONLY && !POLYSEMY_ONLY) {
      const locNums = numbersOf(locText);
      const missing = [...frNums].filter((n) => !locNums.has(n));
      if (missing.length > 0) {
        findings.push({
          dex: card.dexNum, title: fr.title, locale,
          kind: "nombre-perdu",
          detail: `absent(s) de la traduction : ${missing.join(", ")}`,
        });
      }
    }

    if (!NUMBERS_ONLY && !TRAPS_ONLY) {
      const frAll = `${frText} ${promptsOf(fr)}`;
      const locAll = `${locText} ${promptsOf(loc)}`.toLowerCase();
      for (const p of POLYSEMY) {
        if (!p.fr.test(frAll)) continue;
        for (const bad of p.bad[locale] ?? []) {
          if (locAll.includes(bad.toLowerCase())) {
            findings.push({ dex: card.dexNum, title: fr.title, locale, kind: "verbe-polysemique", detail: `« ${bad} » — ${p.note}` });
          }
        }
      }
    }

    if (!NUMBERS_ONLY && !POLYSEMY_ONLY) {
      for (const trap of TRAPS) {
        if (!frText.includes(trap.fr)) continue;
        for (const bad of trap.bad[locale] ?? []) {
          if (locText.includes(bad)) {
            findings.push({
              dex: card.dexNum, title: fr.title, locale,
              kind: "piege-mt",
              detail: `« ${bad} » — ${trap.note}`,
            });
          }
        }
      }
    }
  }
  if (cardHasLocale) scanned++;
}

findings.sort((a, b) => Number(a.dex) - Number(b.dex) || a.locale.localeCompare(b.locale));

const traps = findings.filter((x) => x.kind === "piege-mt");
const nums = findings.filter((x) => x.kind === "nombre-perdu");
const poly = findings.filter((x) => x.kind === "verbe-polysemique");
const affected = new Set(findings.map((x) => x.dex));

console.log(`Cartes traduites scannées : ${scanned}`);
console.log(`Pièges MT (certains)      : ${traps.length}`);
console.log(`Verbes polysémiques       : ${poly.length}`);
console.log(`Nombres perdus (à trier)  : ${nums.length}`);
console.log(`Cartes concernées         : ${affected.size}\n`);

if (traps.length) {
  console.log("=== PIÈGES MT — à corriger, pas de faux positif ===");
  for (const t of traps) console.log(`  [${t.dex}/${t.locale}] ${t.title} :: ${t.detail}`);
  console.log("");
}
if (poly.length) {
  console.log("=== VERBES POLYSÉMIQUES — contresens MT, à retraduire (translate-cards-mt --dex) ===");
  for (const p of poly) console.log(`  [${p.dex}/${p.locale}] ${p.title} :: ${p.detail}`);
  console.log("");
}
if (nums.length) {
  console.log("=== NOMBRES PERDUS — à trier (une reformulation en toutes lettres est légitime) ===");
  for (const n of nums.slice(0, 60)) console.log(`  [${n.dex}/${n.locale}] ${n.title} :: ${n.detail}`);
  if (nums.length > 60) console.log(`  … +${nums.length - 60}`);
}
