#!/usr/bin/env -S tsx
// Vérifie si un sujet a déjà une carte (ou en cours) avant de lancer une recherche.
// Indispensable à grande échelle (500+ cartes) pour éviter les doublons.
//
// Usage :
//   npm run check-subject -- "Bataille de Marignan"
//   npm run check-subject -- "Mona Lisa"
//
// Cherche dans data/{raw,cards} sur :
//   - id, dexNum
//   - canonical.subjectKey
//   - display.locales.fr.title
//   - canonical.aliases
//   - filenames de data/raw/
//
// Score : 1.00 = exact, 0.7 = substring, sinon Jaccard sur tokens.
// Exit 0 toujours (informatif). Affiche les top matches.

import fs from "node:fs";
import path from "node:path";
import { CardSchema, type Card } from "../schemas/card.schema.js";
import { listJsonFiles, readJson, PATHS } from "./_lib/io.js";

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
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      // pluriel léger : manilles→manille, conquetes→conquete, voyages→voyage
      // (rattrape les variantes de nombre qui faisaient manquer des doublons).
      .map((t) => (t.length >= 4 && t.endsWith("s") ? t.slice(0, -1) : t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

type Source = "raw" | "cards";

type Match = {
  source: Source;
  file: string;
  id?: string;
  dexNum?: string;
  title?: string;
  subjectKey?: string;
  aliases?: string[];
  status?: string;
  score: number;
  reason: string;
};

function scoreCard(query: string, queryTokens: Set<string>, c: Card): { score: number; reason: string } {
  const queryNorm = normalize(query);
  const candidates: { text: string; label: string }[] = [
    { text: c.id, label: "id" },
    { text: c.dexNum, label: "dexNum" },
    { text: c.canonical.subjectKey, label: "subjectKey" },
    { text: c.display.locales.fr.title, label: "title" },
    ...c.canonical.aliases.map((a) => ({ text: a, label: "alias" })),
  ];

  let best = { score: 0, reason: "" };
  for (const { text, label } of candidates) {
    const tNorm = normalize(text);
    if (tNorm === queryNorm) {
      return { score: 1.0, reason: `exact ${label}="${text}"` };
    }
    // Substring : exiger une longueur min. du plus court terme. Sinon les alias en
    // écritures non latines (devanagari, chinois, arabe…) normalisent en "" et
    // `queryNorm.includes("")` matche TOUT → faux 0.70 généralisé (bruit de fond).
    const shorter = Math.min(tNorm.length, queryNorm.length);
    if (shorter >= 4 && (tNorm.includes(queryNorm) || queryNorm.includes(tNorm))) {
      const score = 0.7;
      if (score > best.score) best = { score, reason: `substring ${label}="${text}"` };
    }
    const j = jaccard(queryTokens, tokenize(text));
    if (j > best.score) {
      best = { score: j, reason: `jaccard ${label}="${text}" (${j.toFixed(2)})` };
    }
  }
  return best;
}

function searchCardsDir(query: string, queryTokens: Set<string>, dir: string): Match[] {
  const matches: Match[] = [];
  for (const file of listJsonFiles(dir)) {
    let raw: unknown;
    try {
      raw = readJson(file);
    } catch {
      continue;
    }
    const parsed = CardSchema.safeParse(raw);
    if (!parsed.success) continue;
    const c = parsed.data;
    const { score, reason } = scoreCard(query, queryTokens, c);
    if (score >= 0.3) {
      matches.push({
        source: "cards",
        file,
        id: c.id,
        dexNum: c.dexNum,
        title: c.display.locales.fr.title,
        subjectKey: c.canonical.subjectKey,
        aliases: c.canonical.aliases,
        status: c.editorial.status,
        score,
        reason,
      });
    }
  }
  return matches;
}

function searchRawDir(query: string, queryTokens: Set<string>): Match[] {
  // Les raws sont du markdown — on cherche par nom de fichier (slug).
  const matches: Match[] = [];
  if (!fs.existsSync(PATHS.raw)) return matches;
  const queryNorm = normalize(query);
  for (const f of fs.readdirSync(PATHS.raw)) {
    if (!f.endsWith(".md") && !f.endsWith(".json")) continue;
    const baseName = f.replace(/\.(md|json)$/i, "");
    const fileText = baseName.replace(/-/g, " ");
    const fileTokens = tokenize(fileText);
    const fileNorm = normalize(fileText);
    let score = 0;
    let reason = "";
    if (fileNorm === queryNorm) {
      score = 1.0;
      reason = `exact raw filename`;
    } else if (fileNorm.includes(queryNorm) || queryNorm.includes(fileNorm)) {
      score = 0.7;
      reason = `substring raw filename`;
    } else {
      const j = jaccard(queryTokens, fileTokens);
      if (j >= 0.3) {
        score = j;
        reason = `jaccard raw filename (${j.toFixed(2)})`;
      }
    }
    if (score > 0) {
      matches.push({
        source: "raw",
        file: path.join(PATHS.raw, f),
        score,
        reason,
      });
    }
  }
  return matches;
}

function flagFor(score: number): string {
  if (score >= 0.9) return "DOUBLON QUASI-CERTAIN";
  if (score >= 0.6) return "PROBABLE";
  return "POSSIBLE";
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage : npm run check-subject -- "<sujet>"');
    return 1;
  }
  const query = args.join(" ");
  const queryTokens = tokenize(query);

  const matches = [
    ...searchCardsDir(query, queryTokens, PATHS.cards),
    ...searchRawDir(query, queryTokens),
  ];

  matches.sort((a, b) => b.score - a.score);

  console.log(`Recherche : "${query}"\n`);

  if (matches.length === 0) {
    console.log("=> Aucun match. Sujet probablement nouveau, tu peux lancer la recherche.");
    return 0;
  }

  console.log(`=> ${matches.length} match(es) potentiel(s). Top 10 :\n`);
  const top = matches.slice(0, 10);
  for (const m of top) {
    console.log(`[${flagFor(m.score)}] score=${m.score.toFixed(2)} (${m.source}${m.status ? `:${m.status}` : ""})`);
    console.log(`  fichier  : ${path.relative(process.cwd(), m.file)}`);
    if (m.id) console.log(`  id       : ${m.id}  dexNum=${m.dexNum}`);
    if (m.title) console.log(`  title    : ${m.title}`);
    if (m.subjectKey) console.log(`  subject  : ${m.subjectKey}`);
    if (m.aliases && m.aliases.length > 0) console.log(`  aliases  : ${m.aliases.join(" | ")}`);
    console.log(`  raison   : ${m.reason}`);
    console.log();
  }

  const certain = matches.filter((m) => m.score >= 0.9).length;
  const probable = matches.filter((m) => m.score >= 0.6 && m.score < 0.9).length;
  console.log(`Bilan : ${certain} doublon(s) quasi-certain(s), ${probable} probable(s).`);
  if (certain > 0) {
    console.log("=> Recommandation : NE PAS recréer la carte. Enrichir l'existant si nécessaire.");
  } else if (probable > 0) {
    console.log("=> Recommandation : examine les matches probables avant de lancer la recherche.");
  } else {
    console.log("=> Recommandation : rien de bloquant, mais vérifie que le slug que tu choisiras n'entre pas en collision.");
  }

  return 0;
}

process.exit(main());
