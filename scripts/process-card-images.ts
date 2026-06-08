#!/usr/bin/env -S tsx
// Batch auto-crop des images de cartes au ratio paysage 1.37 (800×584).
//
// Pour chaque carte de data/cards/ ayant une image source dans
// data/_images-cache/, applique sharp.resize(800, 584, fit:"cover",
// position:"attention") et écrit data/_images-final/<dexNum>.jpg.
//
// Met à jour data/_images-cache/_index.json avec un bloc `crop`.
// Génère reports/images-process-<ts>.md.
//
// Usage :
//   npm run process-images
//   npm run process-images -- --only=001,007         # subset
//   npm run process-images -- --force                # re-traite même si _images-final existe
//                                                    # MAIS skip toujours reviewed=true (sacré)
//   npm run process-images -- --force-reviewed       # ⚠️ DESTRUCTIF : écrase aussi les reviews
//                                                    # humaines (perd manualExtract + bytes)
//
// L'algo `position:"attention"` est l'heuristique de saillance de sharp.
// Pour un crop de meilleure qualité piloté par un LLM, utiliser le bouton
// 🤖 Claude dans `npm run review-images` (mode à la demande, par carte).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { loadCardsFromDir } from "./_lib/load-cards.js";
import { ensureDir, nowIso, nowStamp, PATHS, writeText } from "./_lib/io.js";

const IMAGES_CACHE = path.join(PATHS.exports, "..", "data", "_images-cache");
const IMAGES_FINAL = path.join(PATHS.exports, "..", "data", "_images-final");
const INDEX_FILE = path.join(IMAGES_CACHE, "_index.json");

const TARGET_RATIO = 1.37;
const TARGET_WIDTH = 800;
const TARGET_HEIGHT = Math.round(TARGET_WIDTH / TARGET_RATIO); // 584

type IndexEntry = {
  dexNum: string;
  cardId: string;
  wikipediaTitle: string | null;
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  resolvedLang: "fr" | "en" | null;
  attribution: string | null;
  localFile: string | null;
  status: string;
  fetchedAt: string;
  errorMessage?: string;
  crop?: {
    cropDecisionVersion: number;
    source: string;
    ratio: number;
    finalFile: string | null;
    reviewed: boolean;
    cropAppliedAt: string;
    method?: string;
    [key: string]: unknown;
  };
};

function loadIndex(): Record<string, IndexEntry> {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Record<
      string,
      IndexEntry
    >;
  } catch {
    return {};
  }
}

function saveIndex(idx: Record<string, IndexEntry>): void {
  ensureDir(IMAGES_CACHE);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", "utf8");
}

type Outcome =
  | { dexNum: string; cardId: string; status: "ok"; finalFile: string; sizeKB: number }
  | { dexNum: string; cardId: string; status: "skipped"; reason: string }
  | { dexNum: string; cardId: string; status: "error"; error: string };

async function processOne(
  card: { id: string; dexNum: string },
  index: Record<string, IndexEntry>,
  options: { force: boolean; forceReviewed: boolean },
): Promise<Outcome> {
  const entry = index[card.dexNum];
  if (!entry) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "skipped",
      reason: "no-cache-entry",
    };
  }
  if (entry.status !== "ok" || !entry.localFile) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "skipped",
      reason: `cache-status-${entry.status}`,
    };
  }
  const sourcePath = path.join(IMAGES_CACHE, entry.localFile);
  if (!fs.existsSync(sourcePath)) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "skipped",
      reason: "source-file-missing",
    };
  }

  const finalFile = `${card.dexNum}.jpg`;
  const finalPath = path.join(IMAGES_FINAL, finalFile);

  // SACRED : ne JAMAIS écraser une review humaine. --force ne suffit pas, il
  // faut --force-reviewed (rare, destructif). Les manualExtract et les bytes
  // du crop final ne sont pas récupérables.
  if (entry.crop?.reviewed && !options.forceReviewed) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "skipped",
      reason: "already-reviewed (use --force-reviewed pour écraser)",
    };
  }

  const alreadyDone = fs.existsSync(finalPath) && entry.crop?.finalFile === finalFile;
  if (alreadyDone && !options.force) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "skipped",
      reason: "already-processed",
    };
  }

  try {
    const buffer = await sharp(sourcePath)
      // .rotate() : applique l'orientation EXIF (ce chemin lit le cache brut,
      // sans passer par le serveur) — sinon une source orientée ≠ 1 (cf. Lucy
      // /281, orientation 6) serait cuite couchée.
      .rotate()
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: "cover",
        position: "attention",
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    ensureDir(IMAGES_FINAL);
    fs.writeFileSync(finalPath, buffer);

    entry.crop = {
      cropDecisionVersion: 1,
      source: "auto-attention",
      ratio: TARGET_RATIO,
      finalFile,
      reviewed: false,
      cropAppliedAt: nowIso(),
      method: `sharp.resize(${TARGET_WIDTH}, ${TARGET_HEIGHT}, position:'attention')`,
    };

    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "ok",
      finalFile,
      sizeKB: Math.round(buffer.length / 1024),
    };
  } catch (err) {
    return {
      dexNum: card.dexNum,
      cardId: card.id,
      status: "error",
      error: (err as Error).message,
    };
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || args.includes("--force-reviewed");
  const forceReviewed = args.includes("--force-reviewed");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlySet = onlyArg
    ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()))
    : null;

  if (forceReviewed) {
    console.warn(
      "⚠️  --force-reviewed activé : les crops manuels validés humainement seront ÉCRASÉS.\n" +
        "   Les bytes des images et les coordonnées manualExtract sont DÉFINITIVEMENT perdus.\n",
    );
  }

  ensureDir(IMAGES_FINAL);
  ensureDir(PATHS.reports);

  // On scanne toutes les cartes de data/cards/, sans filtre de statut (le batch
  // process est utile aussi sur des cartes status=reviewed avant approbation).
  const all = loadCardsFromDir(PATHS.cards);
  let cards = all.cards.map((c) => c.data);
  if (onlySet) {
    cards = cards.filter((c) => onlySet.has(c.dexNum));
    if (cards.length === 0) {
      console.error(`Aucune carte avec dexNum ∈ {${[...onlySet].join(", ")}}`);
      return 1;
    }
  }

  const index = loadIndex();
  console.log(
    `${cards.length} carte(s) à traiter${force ? " (--force)" : ""} → ${TARGET_WIDTH}×${TARGET_HEIGHT} JPG q85 paysage ${TARGET_RATIO}.`,
  );
  console.log(`Algo : sharp.resize attention.\n`);

  const outcomes: Outcome[] = [];
  let stats = { ok: 0, skipped: 0, errors: 0 };

  for (const card of cards) {
    const outcome = await processOne(card, index, { force, forceReviewed });
    outcomes.push(outcome);
    if (outcome.status === "ok") {
      stats.ok++;
      console.log(
        `[${outcome.dexNum}] ${outcome.cardId} → ${outcome.finalFile} (${outcome.sizeKB} KB)`,
      );
    } else if (outcome.status === "skipped") {
      stats.skipped++;
      console.log(`[${outcome.dexNum}] ${outcome.cardId} skipped (${outcome.reason})`);
    } else {
      stats.errors++;
      console.warn(`[${outcome.dexNum}] ${outcome.cardId} ERROR: ${outcome.error}`);
    }
  }

  saveIndex(index);

  // Report markdown.
  const lines: string[] = [];
  lines.push(`# Process images report — ${nowIso()}`);
  lines.push("");
  lines.push(`- Cible : **${TARGET_WIDTH}×${TARGET_HEIGHT}** JPG q85 paysage ${TARGET_RATIO}`);
  lines.push(`- Algo : sharp.resize(fit:"cover", position:"attention")`);
  lines.push(`- Cartes traitées : **${cards.length}**`);
  lines.push(`- OK : ${stats.ok}`);
  lines.push(`- Skipped : ${stats.skipped}`);
  lines.push(`- Erreurs : ${stats.errors}`);
  lines.push("");
  lines.push("## Détail");
  lines.push("");
  lines.push("| dexNum | id | status | détail |");
  lines.push("|---|---|---|---|");
  for (const o of outcomes) {
    if (o.status === "ok") {
      lines.push(`| ${o.dexNum} | ${o.cardId} | ok | ${o.finalFile} (${o.sizeKB} KB) |`);
    } else if (o.status === "skipped") {
      lines.push(`| ${o.dexNum} | ${o.cardId} | skipped | ${o.reason} |`);
    } else {
      lines.push(`| ${o.dexNum} | ${o.cardId} | error | ${o.error.replace(/\|/g, "\\|")} |`);
    }
  }

  const reportFile = path.join(PATHS.reports, `images-process-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n") + "\n");

  console.log(
    `\nBilan : ${stats.ok} OK · ${stats.skipped} skipped · ${stats.errors} erreurs`,
  );
  console.log(`Final : ${path.relative(process.cwd(), IMAGES_FINAL)}`);
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);

  return stats.errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
