#!/usr/bin/env -S tsx
// Vérifie en une passe les 50 sujets prévus pour les cartes 104-153.

import path from "node:path";
import fs from "node:fs";
import { listJsonFiles, readJson, PATHS } from "./_lib/io.js";

const SUBJECTS: { dexNum: string; slug: string; subject: string }[] = [
  // Préhistoire
  { dexNum: "104", slug: "statuette-lion-homme", subject: "Statuette du Lion-Homme du Hohlenstein-Stadel" },
  { dexNum: "105", slug: "megalithes-de-carnac", subject: "Mégalithes de Carnac" },
  { dexNum: "106", slug: "domestication-du-ble-croissant-fertile", subject: "Domestication du blé Croissant fertile" },
  // Antiquité
  { dexNum: "107", slug: "bataille-de-salamine", subject: "Bataille de Salamine" },
  { dexNum: "108", slug: "bataille-de-cannae", subject: "Bataille de Cannae" },
  { dexNum: "109", slug: "mort-de-socrate", subject: "Mort de Socrate" },
  { dexNum: "110", slug: "narmer-premiere-dynastie-pharaonique", subject: "Narmer fonde la première dynastie pharaonique" },
  { dexNum: "111", slug: "civilisation-de-l-indus-mohenjo-daro", subject: "Civilisation de l'Indus Mohenjo-Daro" },
  { dexNum: "112", slug: "qin-shi-huang-unifie-la-chine", subject: "Qin Shi Huang unifie la Chine" },
  { dexNum: "113", slug: "civilisation-olmeque", subject: "Civilisation olmèque" },
  { dexNum: "114", slug: "pierre-de-rosette", subject: "Pierre de Rosette" },
  { dexNum: "115", slug: "bataille-d-actium", subject: "Bataille d'Actium" },
  // Médiéval
  { dexNum: "116", slug: "bataille-de-tours-poitiers", subject: "Bataille de Tours Poitiers" },
  { dexNum: "117", slug: "sainte-sophie-constantinople", subject: "Sainte-Sophie de Constantinople" },
  { dexNum: "118", slug: "grand-schisme-1054", subject: "Grand Schisme de 1054" },
  { dexNum: "119", slug: "gengis-khan-empire-mongol", subject: "Gengis Khan fonde l'Empire mongol" },
  { dexNum: "120", slug: "vikings-rus-de-kiev", subject: "Vikings et la Rus' de Kiev" },
  { dexNum: "121", slug: "bataille-de-manzikert", subject: "Bataille de Manzikert" },
  { dexNum: "122", slug: "mosquee-omeyyades-damas", subject: "Mosquée des Omeyyades de Damas" },
  { dexNum: "123", slug: "bataille-de-bouvines", subject: "Bataille de Bouvines" },
  // Moderne
  { dexNum: "124", slug: "concile-de-trente", subject: "Concile de Trente" },
  { dexNum: "125", slug: "massacre-saint-barthelemy", subject: "Massacre de la Saint-Barthélemy" },
  { dexNum: "126", slug: "lavoisier-decouverte-oxygene", subject: "Lavoisier découvre l'oxygène" },
  { dexNum: "127", slug: "bourse-d-amsterdam-1602", subject: "Naissance de la Bourse d'Amsterdam" },
  { dexNum: "128", slug: "catherine-la-grande", subject: "Catherine la Grande" },
  { dexNum: "129", slug: "bataille-d-austerlitz", subject: "Bataille d'Austerlitz" },
  { dexNum: "130", slug: "boston-tea-party", subject: "Boston Tea Party" },
  { dexNum: "131", slug: "constitution-americaine-1787", subject: "Constitution américaine 1787" },
  { dexNum: "132", slug: "tanzimat-edit-de-gulhane", subject: "Tanzimat Édit de Gulhane Empire ottoman" },
  { dexNum: "133", slug: "fondation-saint-petersbourg-pierre-le-grand", subject: "Pierre le Grand fonde Saint-Pétersbourg" },
  // Contemporain
  { dexNum: "134", slug: "canal-de-suez", subject: "Canal de Suez" },
  { dexNum: "135", slug: "darwin-origine-des-especes", subject: "Darwin De l'origine des espèces" },
  { dexNum: "136", slug: "croix-rouge-solferino", subject: "Naissance de la Croix-Rouge Solferino" },
  { dexNum: "137", slug: "tableau-periodique-mendeleiev", subject: "Tableau périodique de Mendeleïev" },
  { dexNum: "138", slug: "olympia-de-manet", subject: "Olympia de Manet" },
  { dexNum: "139", slug: "premier-tour-de-france-1903", subject: "Premier Tour de France 1903" },
  { dexNum: "140", slug: "canal-de-panama", subject: "Canal de Panama" },
  { dexNum: "141", slug: "christ-redempteur-rio", subject: "Statue du Christ Rédempteur Rio" },
  { dexNum: "142", slug: "mont-rushmore", subject: "Mont Rushmore" },
  { dexNum: "143", slug: "bataille-de-stalingrad", subject: "Bataille de Stalingrad" },
  { dexNum: "144", slug: "bataille-de-midway", subject: "Bataille de Midway" },
  { dexNum: "145", slug: "conference-de-bandung", subject: "Conférence de Bandung" },
  { dexNum: "146", slug: "creation-onu-charte-san-francisco", subject: "Création de l'ONU Charte San Francisco" },
  { dexNum: "147", slug: "creation-etat-d-israel", subject: "Création de l'État d'Israël" },
  { dexNum: "148", slug: "eniac-premier-ordinateur", subject: "ENIAC premier ordinateur électronique" },
  { dexNum: "149", slug: "premiere-transplantation-cardiaque-barnard", subject: "Première transplantation cardiaque Barnard" },
  { dexNum: "150", slug: "marche-sur-washington-mlk", subject: "Marche sur Washington I Have a Dream" },
  { dexNum: "151", slug: "mere-teresa-calcutta", subject: "Mère Teresa de Calcutta" },
  { dexNum: "152", slug: "catastrophe-de-tchernobyl", subject: "Catastrophe de Tchernobyl" },
  { dexNum: "153", slug: "naissance-de-wikipedia", subject: "Naissance de Wikipédia" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter((t) => t.length >= 3));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

type Existing = { source: "approved" | "normalized"; id: string; dexNum: string; title: string; subjectKey: string; aliases: string[] };

const existing: Existing[] = [];
for (const dir of [PATHS.approved, PATHS.normalized] as const) {
  const source = dir === PATHS.approved ? "approved" : "normalized";
  for (const f of listJsonFiles(dir)) {
    try {
      const c = readJson<any>(f);
      existing.push({
        source, id: c.id ?? "", dexNum: c.dexNum ?? "",
        title: c.display?.locales?.fr?.title ?? "",
        subjectKey: c.canonical?.subjectKey ?? "",
        aliases: c.canonical?.aliases ?? [],
      });
    } catch {}
  }
}

const rawSlugs = fs.existsSync(PATHS.raw)
  ? fs.readdirSync(PATHS.raw).filter((f) => f.endsWith(".md") || f.endsWith(".json")).map((f) => path.basename(f, path.extname(f)))
  : [];

console.log(`Catalogue actuel : ${existing.length} cartes (approved+normalized) + ${rawSlugs.length} fiches raw\n`);
console.log(`Vérification anti-doublon des 50 sujets prévus (104-153) :\n`);

let totalCertain = 0, totalProbable = 0;
const dexConflicts: string[] = [], slugConflicts: string[] = [];

for (const s of SUBJECTS) {
  const queryTokens = tokenize(s.subject);
  const queryNorm = normalize(s.subject);

  const dexHit = existing.find((e) => e.dexNum === s.dexNum);
  if (dexHit) dexConflicts.push(`${s.dexNum} → conflit avec ${dexHit.id}`);
  const slugHit = existing.find((e) => e.id === s.slug);
  if (slugHit) slugConflicts.push(`${s.slug} → conflit avec ${slugHit.id}`);

  let bestScore = 0;
  let bestMatch: Existing | null = null;
  let bestReason = "";

  for (const e of existing) {
    const candidates = [
      { text: e.title, reason: "title" },
      { text: e.subjectKey, reason: "subjectKey" },
      { text: e.id, reason: "id" },
      ...e.aliases.map((a) => ({ text: a, reason: "alias" })),
    ];
    for (const cand of candidates) {
      const tNorm = normalize(cand.text);
      let score = 0, reason = "";
      if (tNorm === queryNorm) { score = 1.0; reason = `exact ${cand.reason}`; }
      else if (tNorm && (tNorm.includes(queryNorm) || queryNorm.includes(tNorm))) { score = 0.7; reason = `substring ${cand.reason}`; }
      else {
        const j = jaccard(queryTokens, tokenize(cand.text));
        if (j >= 0.3) { score = j; reason = `jaccard ${cand.reason} (${j.toFixed(2)})`; }
      }
      if (score > bestScore) { bestScore = score; bestMatch = e; bestReason = reason; }
    }
  }
  for (const slug of rawSlugs) {
    const j = jaccard(queryTokens, tokenize(slug.replace(/-/g, " ")));
    if (j > bestScore) { bestScore = j; bestReason = `jaccard raw "${slug}" (${j.toFixed(2)})`; }
  }

  let flag = "OK";
  if (bestScore >= 0.9) { flag = "DOUBLON QUASI-CERTAIN"; totalCertain++; }
  else if (bestScore >= 0.6) { flag = "PROBABLE"; totalProbable++; }
  else if (bestScore >= 0.3) flag = "possible";

  const matchInfo = bestMatch ? ` → ${bestMatch.id} (${bestReason})` : bestScore > 0 ? ` → ${bestReason}` : "";
  console.log(`[${flag}] ${s.dexNum} ${s.slug.padEnd(48)} score=${bestScore.toFixed(2)}${matchInfo}`);
}

console.log("");
console.log(`Bilan : ${totalCertain} doublon(s) quasi-certain(s), ${totalProbable} probable(s).`);
if (dexConflicts.length > 0) { console.log(`\n⚠️  Conflits dexNum :`); for (const c of dexConflicts) console.log(`  - ${c}`); }
if (slugConflicts.length > 0) { console.log(`\n⚠️  Conflits slug :`); for (const c of slugConflicts) console.log(`  - ${c}`); }
