#!/usr/bin/env -S tsx
// Petit serveur Express pour reviewer + recadrer les images du catalogue.
//
// Usage :
//   npm run review-images
//   ouvre http://localhost:5174 dans le navigateur
//
// Endpoints :
//   GET   /                              → app statique
//   GET   /api/cards                     → liste des cartes + statut crop
//   GET   /api/cards/:dexNum             → détail complet (image + métadonnées)
//   GET   /images/source/:dexNum         → image source (cache local)
//   GET   /images/final/:dexNum          → image finale rognée (si elle existe)
//   POST  /api/cards/:dexNum/crop        → applique un crop manuel et sauvegarde
//   POST  /api/cards/:dexNum/center      → applique un crop centré au ratio cible
//   POST  /api/cards/:dexNum/approve     → marque la carte comme reviewed
//   POST  /api/cards/:dexNum/reset       → revient à l'état initial (supprime crop)
//   PATCH /api/cards/:dexNum/metadata    → édite display.locales.fr.* (incl. wherePrompt, whenPrompt)
//                                          + display.imageLabel + canonical.place.lat/lon
//                                          + gameplay.whereRadiusKm
//   PATCH /api/cards/:dexNum/source-meta → édite attribution / sourceUrl / sourcePageUrl
//                                          dans _index.json (pas le fichier carte)
//   POST  /api/cards/:dexNum/upload      → remplace l'image source (multipart/form-data)

import express from "express";
import type { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCardsFromDir } from "./_lib/load-cards.js";
import { ensureDir, nowIso, PATHS } from "./_lib/io.js";
import { countryNameFr } from "./_lib/country-fr.js";
import { loadCardFile, saveCardFile } from "./_lib/save-card.js";
import { runInvariants } from "./_lib/invariants.js";
import { regionFromCountryHitWithSnap } from "./_lib/region-geo.js";
import { checkApprovalPreconditions } from "./_lib/pre-approve.js";
import { REGION_LABELS } from "../schemas/card.schema.js";
import {
  applyCrop,
  fallbackCenterCrop,
  imageDimensions,
} from "./_lib/image-crop.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_CACHE = path.join(PATHS.exports, "..", "data", "_images-cache");
const IMAGES_FINAL = path.join(PATHS.exports, "..", "data", "_images-final");
const INDEX_FILE = path.join(IMAGES_CACHE, "_index.json");
const APP_DIR = path.join(__dirname, "review-app");

// Ratio cible des images carte (largeur / hauteur).
// Calé sur le frame d'image dans HDCard zoomée du repo voisin :
//   image area = (cardW - 28) × (cardH × 0.48)
//   avec cardH = cardW / 0.72 (modal SessionCardZoomModal, cardW=320 sur phone)
//   → ratio ≈ 1.37 paysage. HDMiniCard est à ~1.40, HDCard petite à ~1.25.
//   1.37 est le meilleur compromis — fits le modal exactement, ~6% letterbox
//   sur les petites vignettes de collection.
const TARGET_RATIO = 1.37;
const TARGET_MAX_WIDTH = 800; // → hauteur ≈ 584 px
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type CacheEntry = {
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
  crop?: CropEntry;
  // Historique audit : crops précédents avant écrasement (limite 5).
  // Permet de comparer le crop courant avec ce qui était là avant la review,
  // utile pour analyser les corrections humaines vs auto-attention/vision.
  previousCrops?: CropEntry[];
};

const PREVIOUS_CROPS_LIMIT = 5;

function archivePreviousCrop(entry: CacheEntry): void {
  if (!entry.crop) return;
  const arr = entry.previousCrops ?? [];
  arr.unshift({ ...entry.crop });
  entry.previousCrops = arr.slice(0, PREVIOUS_CROPS_LIMIT);
}

type CropEntry = {
  cropDecisionVersion: number;
  source: "manual" | "centered" | "vision" | "kept-original";
  model?: string;
  subjectBoundingBox?: { x: number; y: number; width: number; height: number };
  focalPoint?: { x: number; y: number };
  centeringScoreIfCentered?: number;
  subjectVisible?: boolean;
  issues?: string[];
  reasoning?: string;
  manualExtract?: { left: number; top: number; width: number; height: number };
  ratio: number;
  finalFile: string | null;
  reviewed: boolean;
  cropAppliedAt: string;
  reviewedAt?: string;
};

function loadIndex(): Record<string, CacheEntry> {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveIndex(idx: Record<string, CacheEntry>): void {
  ensureDir(IMAGES_CACHE);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2) + "\n", "utf8");
}

// Trouve un fichier source sur disque pour ce dexNum, en regardant d'abord
// l'index puis en scannant _images-cache/ pour <dexNum>.<ext>. Permet de
// reconnaître des images posées à la main par l'utilisateur (cas où le
// fetch automatique a échoué — status "no-wiki-title", "not-found", etc.).
const SOURCE_EXTS = ["jpg", "jpeg", "png", "webp"];

function resolveSourceFile(
  dexNum: string,
  entry: CacheEntry | undefined,
): string | null {
  if (entry?.localFile) {
    const p = path.join(IMAGES_CACHE, entry.localFile);
    if (fs.existsSync(p)) return p;
  }
  for (const ext of SOURCE_EXTS) {
    const p = path.join(IMAGES_CACHE, `${dexNum}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readSourceBuffer(
  entry: CacheEntry,
  dexNum?: string,
): Buffer | null {
  const p = resolveSourceFile(dexNum ?? entry.dexNum, entry);
  if (!p) return null;
  return fs.readFileSync(p);
}

// Lit la source ET applique son orientation EXIF dans les pixels (sharp
// `.rotate()` sans argument), puis ré-encode en JPEG (orientation remise à 1).
// Point de normalisation unique : le navigateur (qui auto-oriente un <img>) et
// sharp côté serveur (qui ignore l'EXIF par défaut) partagent ainsi le MÊME
// repère pixel. Sans ça, une image à orientation ≠ 1 (cf. Lucy / dexNum 281,
// orientation 6) s'affiche droite dans le navigateur mais est croppée/cuite
// couchée par sharp. `.jpeg()` normalise aussi le format pour un Content-Type
// stable côté endpoint source.
async function readOrientedSourceBuffer(
  entry: CacheEntry,
  dexNum?: string,
): Promise<Buffer | null> {
  const raw = readSourceBuffer(entry, dexNum);
  if (!raw) return null;
  return sharp(raw).rotate().jpeg({ quality: 90 }).toBuffer();
}

async function writeFinal(dexNum: string, buffer: Buffer): Promise<string> {
  ensureDir(IMAGES_FINAL);
  const filename = `${dexNum}.jpg`;
  fs.writeFileSync(path.join(IMAGES_FINAL, filename), buffer);
  return filename;
}

function buildCardSummary(
  card: {
    id: string;
    dexNum: string;
    display: { locales: { fr: { title: string } } };
    editorial: { status: string };
  },
  entry: CacheEntry | undefined,
): {
  dexNum: string;
  cardId: string;
  title: string;
  editorialStatus: string;
  hasSource: boolean;
  sourceStatus: string;
  hasFinal: boolean;
  reviewed: boolean;
  cropSource: string | null;
  centeringScore: number | null;
  issues: string[];
} {
  // hasFinal = soit l'index pointe sur un finalFile présent, soit
  // l'utilisateur a déposé _images-final/<dexNum>.jpg manuellement.
  const finalFromIndex = entry?.crop?.finalFile
    ? fs.existsSync(path.join(IMAGES_FINAL, entry.crop.finalFile))
    : false;
  const finalFromDisk = fs.existsSync(
    path.join(IMAGES_FINAL, `${card.dexNum}.jpg`),
  );
  const hasFinal = finalFromIndex || finalFromDisk;
  const hasSource = resolveSourceFile(card.dexNum, entry) !== null;
  return {
    dexNum: card.dexNum,
    cardId: card.id,
    title: card.display.locales.fr.title,
    editorialStatus: card.editorial.status,
    hasSource,
    sourceStatus: hasSource && entry?.status !== "ok"
      ? "manual"
      : entry?.status ?? "missing",
    hasFinal,
    reviewed: entry?.crop?.reviewed ?? false,
    cropSource: entry?.crop?.source ?? null,
    centeringScore: entry?.crop?.centeringScoreIfCentered ?? null,
    issues: entry?.crop?.issues ?? [],
  };
}

// Helpers de validation des body PATCH ──────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // multer en mémoire pour les uploads d'image (taille raisonnable, on
  // re-écrit immédiatement sur disque dans _images-cache).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_UPLOAD_MIMES.has(file.mimetype)) {
        cb(new Error(`Type de fichier non supporté : ${file.mimetype}. Attendu : JPEG, PNG ou WebP.`));
        return;
      }
      cb(null, true);
    },
  });

  // Health check.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Liste des cartes : single-folder data/cards/. Le statut éditorial vit
  // dans card.editorial.status (la séparation par dossier a été supprimée).
  app.get("/api/cards", (_req, res) => {
    const all = loadCardsFromDir(PATHS.cards);
    const index = loadIndex();
    const summaries = all.cards
      .map((c) => buildCardSummary(c.data, index[c.data.dexNum]))
      .sort((a, b) => Number(a.dexNum) - Number(b.dexNum));
    res.json({ count: summaries.length, cards: summaries });
  });

  // Détail d'une carte — payload enrichi : tout ce qui est éditable ou
  // utile pour valider visuellement la cohérence carte/image/géo.
  app.get("/api/cards/:dexNum", (req, res) => {
    const { dexNum } = req.params;
    let loaded;
    try {
      loaded = loadCardFile(dexNum);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
      return;
    }
    const card = loaded.card;
    const fr = card.display.locales.fr;
    const index = loadIndex();
    const entry = index[dexNum];
    res.json({
      dexNum,
      cardId: card.id,

      // Image source / crop
      sourceUrl: entry?.sourceUrl ?? null,
      sourcePageUrl: entry?.sourcePageUrl ?? null,
      attribution: entry?.attribution ?? null,
      sourceStatus: entry?.status ?? "missing",
      hasSource: resolveSourceFile(dexNum, entry) !== null,
      crop: entry?.crop ?? null,
      targetRatio: TARGET_RATIO,
      targetMaxWidth: TARGET_MAX_WIDTH,

      // Identité
      type: card.canonical.type,
      subjectKey: card.canonical.subjectKey,
      aliases: card.canonical.aliases,
      wikipediaTitle: card.canonical.wikipediaTitle ?? null,
      era: card.gameplay.era,
      region: card.canonical.place.region,
      regionLabel: REGION_LABELS[card.canonical.place.region] ?? null,
      countryCode: card.canonical.place.countryCode,
      countryName: countryNameFr(card.canonical.place.countryCode),

      // Texte affiché (éditable)
      title: fr.title,
      blurb: fr.blurb,
      body: fr.body,
      imageLabel: card.display.imageLabel,
      placeLabel: fr.placeLabel,
      timeDisplayLabel: fr.timeDisplayLabel,
      wherePrompt: fr.wherePrompt,
      whenPrompt: fr.whenPrompt,

      // Temporalité
      time: {
        tag: card.canonical.time.tag,
        timeKind: card.canonical.time.timeKind,
        pivotYear: card.canonical.time.pivotYear,
        startYear: card.canonical.time.startYear ?? null,
        endYear: card.canonical.time.endYear ?? null,
        justification: card.canonical.time.justification,
      },

      // Géo (lat/lon/whereRadiusKm éditables, le reste read-only)
      place: {
        lat: card.canonical.place.lat,
        lon: card.canonical.place.lon,
        placeKind: card.canonical.place.placeKind,
        placeCanonicalName: card.canonical.place.placeCanonicalName,
        geoKind: card.canonical.place.geoKind,
        justification: card.canonical.place.justification,
      },

      // Gameplay
      gameplay: {
        whenDelta: card.gameplay.whenDelta,
        whereRadiusKm: card.gameplay.whereRadiusKm,
        difficultyWhen: card.gameplay.difficultyWhen,
        difficultyWhere: card.gameplay.difficultyWhere,
        eligibleForWhen: card.gameplay.eligibleForWhen,
        eligibleForWhere: card.gameplay.eligibleForWhere,
        balanceNotes: card.gameplay.balanceNotes,
      },

      // Édito
      editorial: {
        status: card.editorial.status,
        confidence: card.editorial.confidence,
        contentVersion: card.editorial.contentVersion,
        sourcesCount: card.editorial.sources.length,
        warnings: card.editorial.warnings,
        notes: card.editorial.notes,
      },
    });
  });

  // Image source.
  app.get("/images/source/:dexNum", async (req, res) => {
    const { dexNum } = req.params;
    const index = loadIndex();
    const entry = index[dexNum];
    const p = resolveSourceFile(dexNum, entry);
    if (!p) {
      res.status(404).end();
      return;
    }
    // Sert la source AUTO-ORIENTÉE (orientation EXIF cuite dans les pixels) :
    // le navigateur affiche droit ET son repère naturalWidth/Height matche
    // celui que le crop serveur utilisera. Cf. readOrientedSourceBuffer.
    const buf = await sharp(fs.readFileSync(p))
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(buf);
  });

  // Image finale (rognée).
  app.get("/images/final/:dexNum", (req, res) => {
    const { dexNum } = req.params;
    const p = path.join(IMAGES_FINAL, `${dexNum}.jpg`);
    if (!fs.existsSync(p)) {
      res.status(404).end();
      return;
    }
    // Cache busting via timestamp pour que les modifs s'affichent direct.
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(p);
  });

  // Crop manuel : reçoit { left, top, width, height } en pixels source.
  app.post("/api/cards/:dexNum/crop", async (req, res) => {
    try {
      const { dexNum } = req.params;
      const { left, top, width, height } = req.body as Record<string, unknown>;
      if (
        typeof left !== "number" ||
        typeof top !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number" ||
        width <= 0 ||
        height <= 0
      ) {
        res.status(400).json({ error: "left/top/width/height (numbers) requis" });
        return;
      }
      const index = loadIndex();
      const entry = index[dexNum];
      if (!entry) {
        res.status(404).json({ error: "carte absente du cache" });
        return;
      }
      // Buffer auto-orienté : le crop opère dans le même repère que le
      // navigateur (sinon une image EXIF orientation ≠ 1 est croppée couchée).
      const sourceBuffer = await readOrientedSourceBuffer(entry);
      if (!sourceBuffer) {
        res.status(404).json({ error: "image source introuvable" });
        return;
      }
      const dims = await imageDimensions(sourceBuffer);
      // Clamp aux bornes de l'image source.
      const clampedLeft = Math.max(0, Math.min(Math.round(left), dims.width - 1));
      const clampedTop = Math.max(0, Math.min(Math.round(top), dims.height - 1));
      const clampedWidth = Math.max(
        1,
        Math.min(Math.round(width), dims.width - clampedLeft),
      );
      const clampedHeight = Math.max(
        1,
        Math.min(Math.round(height), dims.height - clampedTop),
      );

      // Resize au max-width tout en respectant le ratio que l'utilisateur a dessiné.
      const userRatio = clampedWidth / clampedHeight;
      let finalWidth = clampedWidth;
      let finalHeight = clampedHeight;
      if (clampedWidth > TARGET_MAX_WIDTH) {
        finalWidth = TARGET_MAX_WIDTH;
        finalHeight = Math.round(TARGET_MAX_WIDTH / userRatio);
      }

      const buffer = await applyCrop(sourceBuffer, {
        extract: {
          left: clampedLeft,
          top: clampedTop,
          width: clampedWidth,
          height: clampedHeight,
        },
        finalWidth,
        finalHeight,
        sourceWidth: dims.width,
        sourceHeight: dims.height,
      });
      const finalFile = await writeFinal(dexNum, buffer);

      const previousCrop = entry.crop;
      archivePreviousCrop(entry);
      entry.crop = {
        cropDecisionVersion: 1,
        source: "manual",
        manualExtract: {
          left: clampedLeft,
          top: clampedTop,
          width: clampedWidth,
          height: clampedHeight,
        },
        // Conserve les infos vision si on les a déjà eues.
        subjectBoundingBox: previousCrop?.subjectBoundingBox,
        focalPoint: previousCrop?.focalPoint,
        centeringScoreIfCentered: previousCrop?.centeringScoreIfCentered,
        subjectVisible: previousCrop?.subjectVisible,
        issues: previousCrop?.issues,
        reasoning: previousCrop?.reasoning,
        model: previousCrop?.model,
        ratio: userRatio,
        finalFile,
        reviewed: true,
        cropAppliedAt: nowIso(),
        reviewedAt: nowIso(),
      };
      saveIndex(index);
      res.json({ ok: true, crop: entry.crop, finalUrl: `/images/final/${dexNum}` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Crop centré (fallback simple : sharp 'cover' au ratio cible).
  app.post("/api/cards/:dexNum/center", async (req, res) => {
    try {
      const { dexNum } = req.params;
      const index = loadIndex();
      const entry = index[dexNum];
      if (!entry) {
        res.status(404).json({ error: "carte absente du cache" });
        return;
      }
      const sourceBuffer = await readOrientedSourceBuffer(entry);
      if (!sourceBuffer) {
        res.status(404).json({ error: "image source introuvable" });
        return;
      }
      const buffer = await fallbackCenterCrop(
        sourceBuffer,
        TARGET_RATIO,
        TARGET_MAX_WIDTH,
      );
      const finalFile = await writeFinal(dexNum, buffer);
      const previousCrop = entry.crop;
      archivePreviousCrop(entry);
      entry.crop = {
        cropDecisionVersion: 1,
        source: "centered",
        subjectBoundingBox: previousCrop?.subjectBoundingBox,
        focalPoint: previousCrop?.focalPoint,
        centeringScoreIfCentered: previousCrop?.centeringScoreIfCentered,
        subjectVisible: previousCrop?.subjectVisible,
        issues: previousCrop?.issues,
        reasoning: previousCrop?.reasoning,
        model: previousCrop?.model,
        ratio: TARGET_RATIO,
        finalFile,
        reviewed: true,
        cropAppliedAt: nowIso(),
        reviewedAt: nowIso(),
      };
      saveIndex(index);
      res.json({ ok: true, crop: entry.crop, finalUrl: `/images/final/${dexNum}` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });


  // Approve : passe editorial.status à "approved" si toutes les pré-conditions
  // sont remplies (cf. D1 du plan refonte). Marque aussi crop.reviewed=true
  // pour rétro-compatibilité avec le workflow existant.
  //
  // Pré-conditions vérifiées (cf. _lib/pre-approve.ts) :
  //   - Validation Zod OK
  //   - ≥ 2 publishers distincts dans editorial.sources
  //   - ≥ 1 source relevance="date", ≥ 1 source relevance="place"
  //   - confidence ≠ low
  //   - Aucune erreur bloquante d'invariant
  //   - Crop d'image appliqué (finalFile présent + fichier sur disque)
  //
  // 422 avec la liste des bloqueurs si une pré-condition échoue.
  app.post("/api/cards/:dexNum/approve", (req, res) => {
    const { dexNum } = req.params;
    let loaded;
    try {
      loaded = loadCardFile(dexNum);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
      return;
    }
    // Idempotent : si déjà approved, no-op (pas de bump contentVersion).
    if (loaded.card.editorial.status === "approved") {
      res.json({
        ok: true,
        status: "approved",
        contentVersion: loaded.card.editorial.contentVersion,
        noop: true,
      });
      return;
    }

    const index = loadIndex();
    const blockers = checkApprovalPreconditions(loaded.card, {
      requireImageCrop: true,
      imageIndex: index,
      // Le reviewer humain a déjà jugé la carte → on n'impose pas le minimum
      // de 2 éditeurs distincts ici (auto-promote.ts reste strict).
      skipSourceCount: true,
    });
    if (blockers.length > 0) {
      res.status(422).json({
        ok: false,
        error: "Pré-conditions d'approbation non remplies",
        blockers,
      });
      return;
    }

    // Flip editorial.status. saveCardFile bump contentVersion + valide Zod.
    const candidate = JSON.parse(JSON.stringify(loaded.card)) as typeof loaded.card;
    candidate.editorial.status = "approved";
    const result = saveCardFile(loaded.file, candidate);
    if (!result.ok) {
      res.status(500).json({ error: "Échec sauvegarde", issues: result.errors });
      return;
    }

    // Marque le crop comme reviewed (rétro-compat workflow image).
    const entry = index[dexNum];
    if (entry?.crop) {
      entry.crop.reviewed = true;
      entry.crop.reviewedAt = nowIso();
      saveIndex(index);
    }

    res.json({
      ok: true,
      status: "approved",
      contentVersion: result.card.editorial.contentVersion,
    });
  });

  // Unapprove : flip editorial.status à "reviewed". Pas de pré-conditions.
  // Utile quand on repère une erreur sur une carte déjà approuvée.
  app.post("/api/cards/:dexNum/unapprove", (req, res) => {
    const { dexNum } = req.params;
    let loaded;
    try {
      loaded = loadCardFile(dexNum);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
      return;
    }
    if (loaded.card.editorial.status !== "approved") {
      res.status(400).json({
        error: `Carte au statut "${loaded.card.editorial.status}", pas approved — rien à dé-approuver.`,
      });
      return;
    }
    const candidate = JSON.parse(JSON.stringify(loaded.card)) as typeof loaded.card;
    candidate.editorial.status = "reviewed";
    const result = saveCardFile(loaded.file, candidate);
    if (!result.ok) {
      res.status(500).json({ error: "Échec sauvegarde", issues: result.errors });
      return;
    }
    res.json({
      ok: true,
      status: "reviewed",
      contentVersion: result.card.editorial.contentVersion,
    });
  });

  // Reset : supprime le crop et la carte revient à "pending".
  app.post("/api/cards/:dexNum/reset", (req, res) => {
    const { dexNum } = req.params;
    const index = loadIndex();
    const entry = index[dexNum];
    if (!entry) {
      res.status(404).json({ error: "carte absente du cache" });
      return;
    }
    if (entry.crop?.finalFile) {
      const p = path.join(IMAGES_FINAL, entry.crop.finalFile);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    archivePreviousCrop(entry);
    delete entry.crop;
    saveIndex(index);
    res.json({ ok: true });
  });

  // PATCH métadonnées : édition des champs textuels + géo + radius.
  // Tout passe par CardSchema.parse() — refus 400 sinon.
  app.patch("/api/cards/:dexNum/metadata", (req, res) => {
    const { dexNum } = req.params;
    let loaded;
    try {
      loaded = loadCardFile(dexNum);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
      return;
    }
    const card = loaded.card;
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Apply mutations (pas de spread profond, on touche les sous-objets explicitement).
    if (isString(body.title)) card.display.locales.fr.title = body.title;
    if (isString(body.blurb)) card.display.locales.fr.blurb = body.blurb;
    if (isString(body.body)) card.display.locales.fr.body = body.body;
    if (isString(body.imageLabel)) card.display.imageLabel = body.imageLabel;
    if (isString(body.placeLabel)) card.display.locales.fr.placeLabel = body.placeLabel;
    if (isString(body.timeDisplayLabel))
      card.display.locales.fr.timeDisplayLabel = body.timeDisplayLabel;

    if (body.wherePrompt && typeof body.wherePrompt === "object") {
      const wp = body.wherePrompt as Record<string, unknown>;
      if (isString(wp.pre)) card.display.locales.fr.wherePrompt.pre = wp.pre;
      if (isString(wp.verb)) card.display.locales.fr.wherePrompt.verb = wp.verb;
      if (isString(wp.post)) card.display.locales.fr.wherePrompt.post = wp.post;
    }

    if (body.whenPrompt && typeof body.whenPrompt === "object") {
      const wp = body.whenPrompt as Record<string, unknown>;
      if (isString(wp.pre)) card.display.locales.fr.whenPrompt.pre = wp.pre;
      if (isString(wp.verb)) card.display.locales.fr.whenPrompt.verb = wp.verb;
      if (isString(wp.post)) card.display.locales.fr.whenPrompt.post = wp.post;
    }

    if (isFiniteNumber(body.lat)) card.canonical.place.lat = body.lat;
    if (isFiniteNumber(body.lon)) card.canonical.place.lon = body.lon;
    // place.region est DÉRIVÉE de (lat, lon), jamais saisie à la main : c'est la
    // région qu'un tap correct produit en Explorateur (regionFromCountryHitWithSnap,
    // MÊME fonction que le scoring du jeu). Toute valeur divergente rend la carte
    // injouable (cf. invariant region-latlon-mismatch). On re-dérive donc à chaque
    // édition de coordonnées. Cartes non terrestres (Lune/abstrait) ou pins sans
    // pays tappable ≤150 km (snap null) → on garde la region éditoriale existante.
    if (isFiniteNumber(body.lat) || isFiniteNumber(body.lon)) {
      const place = card.canonical.place;
      if ((place.geoKind ?? "earth") === "earth") {
        const derived = regionFromCountryHitWithSnap(place.lat, place.lon);
        if (derived !== null) place.region = derived;
      }
    }
    if (isFiniteNumber(body.whereRadiusKm)) {
      // whereRadiusKm doit être un entier positif (cf. schema)
      card.gameplay.whereRadiusKm = Math.max(1, Math.round(body.whereRadiusKm));
    }
    // whenDelta n'est PAS éditable depuis l'UI (D4 du plan refonte).
    // Il est dérivé mécaniquement de gameplay.era via HD_ERA_WHEN_DELTAS, et
    // l'invariant whenDelta-era-mismatch bloque toute divergence. Si body.whenDelta
    // arrive, on l'ignore silencieusement (l'UI doit l'afficher en read-only).

    // Temporalité — tag, timeKind, années, justification.
    // Zod validera notamment que tag = "periodique" implique startYear/endYear non null
    // et que startYear ≤ pivotYear ≤ endYear.
    if (isString(body.tag)) card.canonical.time.tag = body.tag as "ponctuelle" | "periodique";
    if (isString(body.timeKind))
      card.canonical.time.timeKind = body.timeKind as
        | "single_year"
        | "approximate_year"
        | "range"
        | "symbolic_pivot"
        | "debated";
    if (isFiniteNumber(body.pivotYear))
      card.canonical.time.pivotYear = Math.round(body.pivotYear);
    // startYear / endYear : seulement si la clé est explicitement dans body.
    // null = effacer (tag passe à ponctuelle), nombre = setter, absent = ne touche pas.
    if ("startYear" in body) {
      card.canonical.time.startYear = isFiniteNumber(body.startYear)
        ? Math.round(body.startYear)
        : null;
    }
    if ("endYear" in body) {
      card.canonical.time.endYear = isFiniteNumber(body.endYear)
        ? Math.round(body.endYear)
        : null;
    }
    if (isString(body.timeJustification))
      card.canonical.time.justification = body.timeJustification;

    const result = saveCardFile(loaded.file, card);
    if (!result.ok) {
      res.status(400).json({ error: "Validation Zod échouée", issues: result.errors });
      return;
    }
    // Invariants catalog (au-delà du schéma Zod) : on les remonte en
    // warnings/errors dans la réponse, sans bloquer la sauvegarde — l'utilisateur
    // peut être en cours d'édition multi-étape.
    const invariantIssues = runInvariants([
      { file: loaded.file, data: result.card },
    ]).filter((i) => i.cardId === result.card.id || !i.cardId);
    res.json({
      ok: true,
      contentVersion: result.card.editorial.contentVersion,
      invariantWarnings: invariantIssues
        .filter((i) => i.severity === "warning")
        .map((i) => ({ rule: i.rule, message: i.message })),
      invariantErrors: invariantIssues
        .filter((i) => i.severity === "error")
        .map((i) => ({ rule: i.rule, message: i.message })),
    });
  });

  // PATCH source-meta : édite les champs descriptifs de l'image dans
  // _index.json (n'écrit pas dans data/approved/).
  app.patch("/api/cards/:dexNum/source-meta", (req, res) => {
    const { dexNum } = req.params;
    const index = loadIndex();
    const entry = index[dexNum];
    if (!entry) {
      res.status(404).json({ error: "carte absente du cache" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (isString(body.attribution)) entry.attribution = body.attribution;
    if (body.sourceUrl === null || isString(body.sourceUrl)) entry.sourceUrl = body.sourceUrl ?? null;
    if (body.sourcePageUrl === null || isString(body.sourcePageUrl))
      entry.sourcePageUrl = body.sourcePageUrl ?? null;
    saveIndex(index);
    res.json({
      ok: true,
      attribution: entry.attribution,
      sourceUrl: entry.sourceUrl,
      sourcePageUrl: entry.sourcePageUrl,
    });
  });

  // POST upload : remplace l'image source par un fichier local. Reset le crop.
  app.post(
    "/api/cards/:dexNum/upload",
    (req, res, next) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) {
          const message = err instanceof Error ? err.message : "upload error";
          res.status(400).json({ error: message });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const { dexNum } = req.params;
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) {
          res.status(400).json({ error: "Champ 'file' manquant ou fichier vide." });
          return;
        }
        const index = loadIndex();
        let entry = index[dexNum];

        // Si la carte n'a pas encore d'entrée cache, on en crée une minimale.
        if (!entry) {
          // Vérifie qu'au moins la carte existe pour ce dexNum.
          try {
            loadCardFile(dexNum);
          } catch (err) {
            res.status(404).json({ error: (err as Error).message });
            return;
          }
          entry = {
            dexNum,
            cardId: dexNum,
            wikipediaTitle: null,
            sourceUrl: null,
            sourcePageUrl: null,
            resolvedLang: null,
            attribution: null,
            localFile: null,
            status: "ok",
            fetchedAt: nowIso(),
          };
          index[dexNum] = entry;
        }

        // WebP et AVIF sont acceptés à l'upload mais convertis immédiatement
        // en JPEG : le pipeline downstream (_images-final/<dexNum>.jpg, seed,
        // push:db) attend du JPEG en cache et en final.
        let outBuffer: Buffer;
        let ext: "jpg" | "png";
        if (file.mimetype === "image/webp" || file.mimetype === "image/avif") {
          // .rotate() : cuit l'orientation EXIF avant la conversion (sinon une
          // image orientée serait re-encodée couchée, cf. bug Lucy/281).
          outBuffer = await sharp(file.buffer).rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
          ext = "jpg";
        } else {
          outBuffer = file.buffer;
          ext = file.mimetype === "image/png" ? "png" : "jpg";
        }
        const newLocalFile = `${dexNum}.${ext}`;

        // Nettoie l'ancien fichier source s'il avait une autre extension.
        ensureDir(IMAGES_CACHE);
        if (entry.localFile && entry.localFile !== newLocalFile) {
          const oldPath = path.join(IMAGES_CACHE, entry.localFile);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // best-effort, on ignore
            }
          }
        }
        // Nettoie le crop final s'il existe (devient stale).
        const finalPath = path.join(IMAGES_FINAL, `${dexNum}.jpg`);
        if (fs.existsSync(finalPath)) {
          try {
            fs.unlinkSync(finalPath);
          } catch {
            // best-effort
          }
        }

        // Écrit le nouveau fichier.
        fs.writeFileSync(path.join(IMAGES_CACHE, newLocalFile), outBuffer);

        // MAJ entrée index — on garde le cardId existant si présent.
        const attribution = isString(req.body?.attribution)
          ? req.body.attribution
          : entry.attribution;
        const sourcePageUrl = isString(req.body?.sourcePageUrl)
          ? req.body.sourcePageUrl
          : null;

        entry.localFile = newLocalFile;
        entry.attribution = attribution ?? "Image personnalisée";
        entry.sourcePageUrl = sourcePageUrl;
        entry.sourceUrl = null;
        entry.wikipediaTitle = null;
        entry.resolvedLang = null;
        entry.status = "ok";
        entry.fetchedAt = nowIso();
        // Source image changée → les anciens crops ne sont plus comparables.
        delete entry.crop;
        delete entry.previousCrops;

        saveIndex(index);
        res.json({
          ok: true,
          localFile: newLocalFile,
          attribution: entry.attribution,
          sourcePageUrl: entry.sourcePageUrl,
        });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  // ── Push to DB ────────────────────────────────────────────────────────
  //
  // Deux endpoints :
  //   POST /api/push-db   { dryRun: boolean } → lance un dry-run (renvoie le diff
  //                                              JSON) ou un push réel (réponse
  //                                              200 immédiate, suivi via polling).
  //   GET  /api/push-db/progress              → état courant du push réel en mémoire.
  //
  // Le push réel est long (~1 image/sec à cause du rate-limit InstantDB) ; un
  // seul push en cours à la fois (sinon 409 conflict). L'état est volatile :
  // si le serveur redémarre pendant un push, le frontend perd le suivi.

  type PushState = {
    runningSince: number | null;
    phase: "idle" | "diff" | "text" | "image" | "done" | "error";
    processed: number;
    total: number;
    lastDexNum: string | null;
    summary: { created: number; updatedText: number; uploadedImage: number; unchanged: number } | null;
    errors: string[];
    finishedAt: number | null;
  };
  const pushState: PushState = {
    runningSince: null,
    phase: "idle",
    processed: 0,
    total: 0,
    lastDexNum: null,
    summary: null,
    errors: [],
    finishedAt: null,
  };

  app.post("/api/push-db", async (req, res) => {
    const { dryRun } = (req.body ?? {}) as { dryRun?: boolean };

    // Lazy import : ne charge les modules InstantDB que si l'utilisateur clique
    // sur Push (évite de crasher au démarrage du serveur si .env est absent).
    let computeDiff: typeof import("./_lib/push-db.js")["computeDiff"];
    let pushDelta: typeof import("./_lib/push-db.js")["pushDelta"];
    try {
      ({ computeDiff, pushDelta } = await import("./_lib/push-db.js"));
    } catch (err) {
      res.status(500).json({
        error:
          "Module push-db indisponible — vérifie que .env contient EXPO_PUBLIC_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN.",
        detail: (err as Error).message,
      });
      return;
    }

    // Calcul du diff (toujours, pour le dry-run et avant le push réel).
    let diff;
    try {
      diff = await computeDiff();
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const diffSummary = {
      created: diff.toCreate.length,
      updatedText: diff.toUpdateText.length,
      uploadedImage: diff.toUploadImage.length,
      unchanged: diff.unchanged,
    };
    const diffDetail = {
      ...diffSummary,
      newDexNums: diff.toCreate.map((c) => c.dexNum),
      updatedDexNums: diff.toUpdateText.map((u) => ({
        dexNum: u.flat.dexNum,
        from: u.fromVersion,
        to: u.toVersion,
      })),
      imageDexNums: diff.toUploadImage.map((i) => i.dexNum),
      countryFallbacks: diff.countryFallbacks,
      warnings: diff.warnings,
    };

    if (dryRun) {
      res.json({ ok: true, dryRun: true, diff: diffDetail });
      return;
    }

    // Push réel : refuse si un push est déjà en cours.
    if (pushState.runningSince != null && pushState.phase !== "done" && pushState.phase !== "error") {
      res.status(409).json({
        error: "Un push est déjà en cours.",
        progress: { ...pushState },
      });
      return;
    }

    // Reset l'état + démarre en arrière-plan. Le frontend poll /progress.
    pushState.runningSince = Date.now();
    pushState.phase = "diff";
    pushState.processed = 0;
    pushState.total = diff.toCreate.length + diff.toUpdateText.length + diff.toUploadImage.length;
    pushState.lastDexNum = null;
    pushState.summary = null;
    pushState.errors = [];
    pushState.finishedAt = null;

    // Démarre le push asynchrone, ne bloque pas la réponse.
    void (async () => {
      try {
        const result = await pushDelta(diff, {
          dryRun: false,
          onProgress: (p) => {
            pushState.phase = p.phase;
            pushState.processed = p.processed;
            pushState.total = p.total;
            pushState.lastDexNum = p.lastDexNum ?? pushState.lastDexNum;
            pushState.errors = p.errors;
          },
        });
        pushState.summary = diffSummary;
        pushState.errors = result.errors;
        pushState.phase = result.errors.length > 0 ? "error" : "done";
        pushState.finishedAt = Date.now();
      } catch (err) {
        pushState.phase = "error";
        pushState.errors = [(err as Error).message];
        pushState.finishedAt = Date.now();
      }
    })();

    res.json({ ok: true, dryRun: false, started: true, diff: diffDetail });
  });

  app.get("/api/push-db/progress", (_req, res) => {
    res.json({ ...pushState });
  });

  // Statique.
  app.use(express.static(APP_DIR));

  const port = Number(process.env.PORT ?? 5174);

  // On retourne une promesse qui ne résout que sur fermeture du serveur ou
  // signal d'arrêt. Sinon, sur Windows + npm + tsx, le wrapper npm rend la
  // main au prompt PowerShell dès que main() résout — le serveur continue
  // à tourner mais c'est trompeur ("on dirait un crash").
  await new Promise<void>((resolve) => {
    const server = app.listen(port, () => {
      console.log(`HistoryDex image review → http://localhost:${port}`);
      console.log(
        `  Source : ${path.relative(process.cwd(), IMAGES_CACHE)}\n  Final  : ${path.relative(process.cwd(), IMAGES_FINAL)}`,
      );
      console.log("  (Ctrl+C pour arrêter)");
    });
    server.on("close", resolve);
    const shutdown = (signal: string) => {
      console.log(`\nReçu ${signal}, arrêt du serveur…`);
      server.close(() => resolve());
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
