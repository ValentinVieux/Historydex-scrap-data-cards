#!/usr/bin/env -S tsx
// Convertit un fichier JSON brut (data/raw/<slug>.json) en une carte normalisée
// validée par le schéma Zod, écrite dans data/cards/<slug>.json avec
// editorial.status = "reviewed" (relue par le pipeline, attend validation humaine).
//
// Le format raw est tolérant : tout champ manquant est signalé clairement.
// Cet utilitaire est un secours en ligne de commande — la production des cartes
// passe surtout par le skill `normalize-card-data` qui fait pareil mais piloté par Claude.
//
// Usage :
//   npm run normalize -- data/raw/stonehenge.json
//   tsx scripts/normalize-card.ts data/raw/stonehenge.json

import fs from "node:fs";
import path from "node:path";
import { CardSchema } from "../schemas/card.schema.js";
import { PATHS, ensureDir, readJson, writeJson } from "./_lib/io.js";

function fail(msg: string): never {
  console.error(`ERREUR : ${msg}`);
  process.exit(1);
}

function main(): number {
  const arg = process.argv[2];
  if (!arg) {
    fail("Usage : tsx scripts/normalize-card.ts <path-to-raw-json>");
  }
  const inputPath = path.resolve(arg);
  if (!fs.existsSync(inputPath)) {
    fail(`Fichier introuvable : ${inputPath}`);
  }

  const raw = readJson(inputPath);
  const parsed = CardSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("La carte ne valide pas le schéma. Champs en cause :");
    for (const e of parsed.error.errors) {
      console.error(`  - ${e.path.join(".") || "(root)"}: ${e.message}`);
    }
    fail("Corrige le fichier raw et relance.");
  }

  const card = parsed.data;
  ensureDir(PATHS.cards);
  const outPath = path.join(PATHS.cards, `${card.id}.json`);
  writeJson(outPath, card);
  console.log(`Carte normalisée : ${path.relative(process.cwd(), outPath)}`);
  return 0;
}

process.exit(main());
