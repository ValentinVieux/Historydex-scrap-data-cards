#!/usr/bin/env -S tsx
// Vérifie en une passe les 50 sujets prévus pour les cartes 054-103.
// Sortie : liste des sujets avec leur top match (s'il y en a).

import path from "node:path";
import { listJsonFiles, readJson, PATHS } from "./_lib/io.js";
import fs from "node:fs";

const SUBJECTS: { dexNum: string; slug: string; subject: string }[] = [
  // Préhistoire
  { dexNum: "054", slug: "petroglyphes-tassili-n-ajjer", subject: "Pétroglyphes du Tassili n'Ajjer" },
  { dexNum: "055", slug: "cueva-de-las-manos", subject: "Cueva de las Manos" },
  { dexNum: "056", slug: "pyramides-de-caral", subject: "Pyramides de Caral" },
  // Antiquité
  { dexNum: "057", slug: "cyrus-le-grand-empire-perse", subject: "Cyrus le Grand fonde l'empire perse" },
  { dexNum: "058", slug: "phare-d-alexandrie", subject: "Phare d'Alexandrie" },
  { dexNum: "059", slug: "mausolee-d-halicarnasse", subject: "Mausolée d'Halicarnasse" },
  { dexNum: "060", slug: "royaume-d-aksoum", subject: "Royaume d'Aksoum" },
  { dexNum: "061", slug: "royaume-de-meroe", subject: "Royaume de Méroé" },
  { dexNum: "062", slug: "dynastie-shang", subject: "Dynastie Shang" },
  { dexNum: "063", slug: "empire-kouchan", subject: "Empire kouchan" },
  { dexNum: "064", slug: "bouddhas-de-bamiyan", subject: "Bouddhas de Bâmiyân" },
  // Médiéval
  { dexNum: "065", slug: "empire-du-ghana", subject: "Empire du Ghana" },
  { dexNum: "066", slug: "madrasa-al-azhar-caire", subject: "Madrasa Al-Azhar du Caire" },
  { dexNum: "067", slug: "empire-khmer-jayavarman-vii", subject: "Empire khmer Jayavarman VII" },
  { dexNum: "068", slug: "cathedrale-de-reims", subject: "Cathédrale de Reims" },
  { dexNum: "069", slug: "grand-zimbabwe", subject: "Grand Zimbabwe" },
  { dexNum: "070", slug: "bataille-d-ain-djalout", subject: "Bataille d'Aïn Djalout" },
  { dexNum: "071", slug: "reconquista-chute-de-grenade", subject: "Reconquista chute de Grenade" },
  { dexNum: "072", slug: "colonisation-polynesienne-pacifique", subject: "Colonisation polynésienne du Pacifique" },
  // Moderne
  { dexNum: "073", slug: "construction-kremlin-moscou", subject: "Construction du Kremlin de Moscou" },
  { dexNum: "074", slug: "bataille-de-lepante", subject: "Bataille de Lépante" },
  { dexNum: "075", slug: "edit-de-nantes", subject: "Édit de Nantes" },
  { dexNum: "076", slug: "proces-de-galilee", subject: "Procès de Galilée" },
  { dexNum: "077", slug: "akbar-edit-de-tolerance-mughal", subject: "Akbar édit de tolérance Mughal" },
  { dexNum: "078", slug: "tokugawa-ieyasu-edo", subject: "Tokugawa Ieyasu fonde Edo" },
  { dexNum: "079", slug: "empire-songhai", subject: "Empire songhaï" },
  { dexNum: "080", slug: "premier-voyage-james-cook", subject: "Premier voyage de James Cook" },
  { dexNum: "081", slug: "wedgwood-revolution-industrielle-ceramique", subject: "Wedgwood révolution industrielle céramique" },
  // Contemporain
  { dexNum: "082", slug: "independance-du-bresil", subject: "Indépendance du Brésil" },
  { dexNum: "083", slug: "statue-de-la-liberte", subject: "Statue de la Liberté" },
  { dexNum: "084", slug: "tournoi-de-wimbledon-1877", subject: "Tournoi de Wimbledon premier" },
  { dexNum: "085", slug: "premier-vol-freres-wright", subject: "Premier vol des frères Wright" },
  { dexNum: "086", slug: "relativite-restreinte-einstein-1905", subject: "Théorie de la relativité restreinte d'Einstein" },
  { dexNum: "087", slug: "genocide-armenien", subject: "Génocide arménien" },
  { dexNum: "088", slug: "decouverte-penicilline-fleming", subject: "Découverte de la pénicilline Fleming" },
  { dexNum: "089", slug: "coupe-du-monde-football-1930", subject: "Coupe du monde de football 1930" },
  { dexNum: "090", slug: "marche-du-sel-gandhi", subject: "Marche du sel de Gandhi" },
  { dexNum: "091", slug: "holodomor-famine-ukrainienne", subject: "Holodomor famine ukrainienne" },
  { dexNum: "092", slug: "longue-marche-mao", subject: "Mao et la Longue Marche" },
  { dexNum: "093", slug: "guernica-picasso", subject: "Picasso Guernica" },
  { dexNum: "094", slug: "apollo-11-lune", subject: "Apollo 11 sur la Lune" },
  { dexNum: "095", slug: "revolution-iranienne", subject: "Révolution iranienne" },
  { dexNum: "096", slug: "genocide-tutsis-rwanda", subject: "Génocide des Tutsis au Rwanda" },
  { dexNum: "097", slug: "fin-apartheid-mandela", subject: "Fin de l'apartheid élection Mandela" },
  { dexNum: "098", slug: "tsunami-ocean-indien-2004", subject: "Tsunami de l'océan Indien 2004" },
  { dexNum: "099", slug: "catastrophe-fukushima", subject: "Catastrophe nucléaire de Fukushima" },
  { dexNum: "100", slug: "brexit", subject: "Brexit" },
  { dexNum: "101", slug: "independance-de-l-algerie", subject: "Indépendance de l'Algérie" },
  { dexNum: "102", slug: "krach-boursier-1929", subject: "Krach boursier de 1929" },
  { dexNum: "103", slug: "creation-euro-2002", subject: "Création de l'euro mise en circulation" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

type Existing = {
  source: "approved" | "normalized";
  id: string;
  dexNum: string;
  title: string;
  subjectKey: string;
  aliases: string[];
  fileBase: string;
};

function loadExisting(): Existing[] {
  const out: Existing[] = [];
  for (const dir of [PATHS.approved, PATHS.normalized] as const) {
    const source = dir === PATHS.approved ? "approved" : "normalized";
    for (const f of listJsonFiles(dir)) {
      try {
        const c = readJson<any>(f);
        out.push({
          source,
          id: c.id ?? "",
          dexNum: c.dexNum ?? "",
          title: c.display?.locales?.fr?.title ?? "",
          subjectKey: c.canonical?.subjectKey ?? "",
          aliases: c.canonical?.aliases ?? [],
          fileBase: path.basename(f, ".json"),
        });
      } catch {
        // skip invalid
      }
    }
  }
  return out;
}

function loadRawSlugs(): string[] {
  if (!fs.existsSync(PATHS.raw)) return [];
  return fs
    .readdirSync(PATHS.raw)
    .filter((f) => f.endsWith(".md") || f.endsWith(".json"))
    .map((f) => path.basename(f, path.extname(f)));
}

const existing = loadExisting();
const rawSlugs = loadRawSlugs();

console.log(`Catalogue actuel : ${existing.length} cartes (approved+normalized) + ${rawSlugs.length} fiches raw\n`);
console.log(`Vérification anti-doublon des 50 sujets prévus :\n`);

let totalCertain = 0;
let totalProbable = 0;
const dexConflicts: string[] = [];
const slugConflicts: string[] = [];

for (const s of SUBJECTS) {
  const queryTokens = tokenize(s.subject);
  const queryNorm = normalize(s.subject);

  // Check dexNum + slug conflict
  const dexHit = existing.find((e) => e.dexNum === s.dexNum);
  if (dexHit) {
    dexConflicts.push(`${s.dexNum} (${s.slug}) — DÉJÀ utilisé par ${dexHit.id}`);
  }
  const slugHit = existing.find((e) => e.id === s.slug);
  if (slugHit) {
    slugConflicts.push(`${s.slug} — DÉJÀ utilisé par ${slugHit.id} (dex ${slugHit.dexNum})`);
  }

  let bestScore = 0;
  let bestMatch: Existing | null = null;
  let bestReason = "";

  for (const e of existing) {
    const candidates: { text: string; reason: string }[] = [
      { text: e.title, reason: "title" },
      { text: e.subjectKey, reason: "subjectKey" },
      { text: e.id, reason: "id" },
      ...e.aliases.map((a) => ({ text: a, reason: "alias" })),
    ];
    for (const cand of candidates) {
      const tNorm = normalize(cand.text);
      let score = 0;
      let reason = "";
      if (tNorm === queryNorm) {
        score = 1.0;
        reason = `exact ${cand.reason}`;
      } else if (tNorm && (tNorm.includes(queryNorm) || queryNorm.includes(tNorm))) {
        score = 0.7;
        reason = `substring ${cand.reason}`;
      } else {
        const j = jaccard(queryTokens, tokenize(cand.text));
        if (j >= 0.3) {
          score = j;
          reason = `jaccard ${cand.reason} (${j.toFixed(2)})`;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = e;
        bestReason = reason;
      }
    }
  }

  // Raw slug check
  for (const slug of rawSlugs) {
    const slugTokens = tokenize(slug.replace(/-/g, " "));
    const j = jaccard(queryTokens, slugTokens);
    if (j > bestScore) {
      bestScore = j;
      bestReason = `jaccard raw slug "${slug}" (${j.toFixed(2)})`;
    }
  }

  let flag = "OK";
  if (bestScore >= 0.9) {
    flag = "DOUBLON QUASI-CERTAIN";
    totalCertain++;
  } else if (bestScore >= 0.6) {
    flag = "PROBABLE";
    totalProbable++;
  } else if (bestScore >= 0.3) {
    flag = "possible";
  }

  const matchInfo = bestMatch
    ? ` → ${bestMatch.id} (dex ${bestMatch.dexNum}, ${bestReason})`
    : bestScore > 0
    ? ` → ${bestReason}`
    : "";
  console.log(`[${flag}] ${s.dexNum} ${s.slug.padEnd(45)} score=${bestScore.toFixed(2)}${matchInfo}`);
}

console.log("");
console.log(`Bilan : ${totalCertain} doublon(s) quasi-certain(s), ${totalProbable} probable(s).`);
if (dexConflicts.length > 0) {
  console.log(`\n⚠️  Conflits dexNum :`);
  for (const c of dexConflicts) console.log(`  - ${c}`);
}
if (slugConflicts.length > 0) {
  console.log(`\n⚠️  Conflits slug :`);
  for (const c of slugConflicts) console.log(`  - ${c}`);
}
