#!/usr/bin/env -S tsx
// Récupère les images canoniques des cartes depuis Wikipedia.
// Pour chaque carte de data/cards/ avec canonical.wikipediaTitle != null :
//   - appelle Wikipedia REST API summary (FR puis EN en fallback)
//   - télécharge l'image (originalimage ou thumbnail)
//   - sauvegarde dans data/_images-cache/<dexNum>.<ext>
//   - écrit/met à jour data/_images-cache/_index.json
//
// Idempotent : skip si fichier local existe déjà (sauf flag --force).
//
// Usage :
//   npm run fetch-images
//   npm run fetch-images -- --force      # re-télécharge tout
//   npm run fetch-images -- --only=001   # une carte précise

import fs from "node:fs";
import path from "node:path";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS, ensureDir, nowIso, nowStamp, writeText } from "./_lib/io.js";
import { downloadBinary, extensionFromContentType, fetchWikipediaImage } from "./_lib/wikipedia.js";

const IMAGES_CACHE = path.join(PATHS.exports, "..", "data", "_images-cache");
const INDEX_FILE = path.join(IMAGES_CACHE, "_index.json");

type IndexEntry = {
  dexNum: string;
  cardId: string;
  wikipediaTitle: string | null;
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  resolvedLang: "fr" | "en" | null;
  attribution: string | null;
  localFile: string | null;
  status: "ok" | "no-wiki-title" | "not-found" | "no-image" | "download-failed" | "error";
  errorMessage?: string;
  fetchedAt: string;
};

function loadIndex(): Record<string, IndexEntry> {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Record<string, IndexEntry>;
  } catch {
    return {};
  }
}

function saveIndex(idx: Record<string, IndexEntry>): void {
  ensureDir(IMAGES_CACHE);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processCard(
  card: { id: string; dexNum: string; canonical: { wikipediaTitle?: string | null } },
  index: Record<string, IndexEntry>,
  options: { force: boolean },
): Promise<IndexEntry> {
  const wt = card.canonical.wikipediaTitle ?? null;
  const baseEntry: IndexEntry = {
    dexNum: card.dexNum,
    cardId: card.id,
    wikipediaTitle: wt,
    sourceUrl: null,
    sourcePageUrl: null,
    resolvedLang: null,
    attribution: null,
    localFile: null,
    status: "no-wiki-title",
    fetchedAt: nowIso(),
  };

  if (!wt) {
    return baseEntry;
  }

  // Si une entrée existe déjà avec un fichier local valide, skip (sauf --force).
  const previous = index[card.dexNum];
  if (
    !options.force &&
    previous?.status === "ok" &&
    previous.localFile &&
    fs.existsSync(path.join(IMAGES_CACHE, previous.localFile))
  ) {
    return previous;
  }

  console.log(`[${card.dexNum}] ${card.id} — Wikipedia: ${wt}`);
  let resolved;
  try {
    resolved = await fetchWikipediaImage(wt);
  } catch (err) {
    console.warn(`  ↳ erreur API : ${(err as Error).message}`);
    return { ...baseEntry, status: "error", errorMessage: (err as Error).message };
  }

  if (!resolved) {
    console.warn(`  ↳ pas trouvé (FR ni EN)`);
    return { ...baseEntry, status: "not-found" };
  }

  if (!resolved.imageUrl) {
    console.warn(`  ↳ page trouvée mais pas d'image`);
    return { ...baseEntry, status: "no-image", sourcePageUrl: resolved.sourcePageUrl };
  }

  // Téléchargement
  let dl;
  try {
    dl = await downloadBinary(resolved.imageUrl);
  } catch (err) {
    console.warn(`  ↳ download fail : ${(err as Error).message}`);
    return {
      ...baseEntry,
      status: "download-failed",
      errorMessage: (err as Error).message,
      sourceUrl: resolved.imageUrl,
      sourcePageUrl: resolved.sourcePageUrl,
      attribution: resolved.attribution,
      resolvedLang: resolved.resolvedLang,
    };
  }

  const ext = extensionFromContentType(dl.contentType);
  const localFile = `${card.dexNum}.${ext}`;
  ensureDir(IMAGES_CACHE);
  fs.writeFileSync(path.join(IMAGES_CACHE, localFile), dl.buffer);

  const sizeKB = Math.round(dl.buffer.length / 1024);
  console.log(`  ↳ OK ${ext.toUpperCase()} ${sizeKB} KB (${resolved.resolvedLang})`);

  return {
    ...baseEntry,
    status: "ok",
    sourceUrl: resolved.imageUrl,
    sourcePageUrl: resolved.sourcePageUrl,
    attribution: resolved.attribution,
    resolvedLang: resolved.resolvedLang,
    localFile,
  };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlyDex = onlyArg ? onlyArg.slice("--only=".length) : null;

  ensureDir(IMAGES_CACHE);
  ensureDir(PATHS.reports);

  // Toutes les cartes vivent dans data/cards/, distinguées par editorial.status.
  // On scanne tout — fetch-images ne dépend pas du statut éditorial.
  const all = loadCardsFromDir(PATHS.cards);
  const cards = all.cards.map((c) => c.data);
  if (onlyDex) {
    const f = cards.filter((c) => c.dexNum === onlyDex);
    if (f.length === 0) {
      console.error(`Aucune carte avec dexNum=${onlyDex} dans data/cards/`);
      return 1;
    }
    cards.length = 0;
    cards.push(...f);
  }

  const index = loadIndex();
  console.log(`${cards.length} carte(s) à traiter${force ? " (--force)" : ""}.\n`);

  let stats = { ok: 0, skipped: 0, noTitle: 0, notFound: 0, noImage: 0, errors: 0 };

  for (const card of cards) {
    const before = index[card.dexNum];
    const entry = await processCard(card, index, { force });
    index[card.dexNum] = entry;

    if (
      !force &&
      before?.status === "ok" &&
      entry.status === "ok" &&
      entry.localFile === before.localFile
    ) {
      stats.skipped++;
    } else if (entry.status === "ok") {
      stats.ok++;
      // Politesse Wikipedia : 1s entre downloads frais
      await sleep(1000);
    } else if (entry.status === "no-wiki-title") {
      stats.noTitle++;
    } else if (entry.status === "not-found") {
      stats.notFound++;
      await sleep(1000);
    } else if (entry.status === "no-image") {
      stats.noImage++;
      await sleep(1000);
    } else {
      stats.errors++;
      await sleep(1000);
    }
  }

  saveIndex(index);

  // Rapport
  const lines: string[] = [];
  lines.push(`# Images report — ${nowIso()}`);
  lines.push("");
  lines.push(`- Cartes traitées : **${cards.length}**`);
  lines.push(`- Téléchargées (ok)   : ${stats.ok}`);
  lines.push(`- Déjà en cache (skipped) : ${stats.skipped}`);
  lines.push(`- Sans wikipediaTitle : ${stats.noTitle}`);
  lines.push(`- Page Wikipedia non trouvée : ${stats.notFound}`);
  lines.push(`- Page sans image : ${stats.noImage}`);
  lines.push(`- Erreurs : ${stats.errors}`);
  lines.push("");
  lines.push("## Détail par carte");
  lines.push("");
  lines.push("| dexNum | id | status | lang | source |");
  lines.push("|---|---|---|---|---|");
  for (const dex of Object.keys(index).sort()) {
    const e = index[dex]!;
    const src = e.sourcePageUrl ? `[lien](${e.sourcePageUrl})` : "—";
    lines.push(`| ${e.dexNum} | ${e.cardId} | ${e.status} | ${e.resolvedLang ?? "—"} | ${src} |`);
  }

  const reportFile = path.join(PATHS.reports, `images-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));

  console.log("");
  console.log(`Bilan : ${stats.ok} OK, ${stats.skipped} skipped, ${stats.noTitle} sans wiki, ${stats.notFound} 404, ${stats.noImage} sans image, ${stats.errors} erreurs.`);
  console.log(`Cache : ${path.relative(process.cwd(), IMAGES_CACHE)}`);
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
