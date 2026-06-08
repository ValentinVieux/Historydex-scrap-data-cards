// Cœur du push intelligent vers InstantDB.
//
// Charge les cartes locales (data/cards/ filtrées sur editorial.status = approved),
// fetch les cartes existantes en DB, calcule le diff via contentVersion (texte)
// et SHA256 de l'image finale (image), puis push uniquement le delta.
//
// Lib découplée — réutilisée par :
//   - scripts/push-db.ts (CLI : npm run push:db)
//   - scripts/review-server.ts (endpoint POST /api/push-db pour le bouton UI)

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { encode as encodeBlurhash } from "blurhash";
import { id } from "@instantdb/admin";

import { loadCardsFromDir } from "./load-cards.js";
import { runInvariants } from "./invariants.js";
import { PATHS } from "./io.js";
import { countryNameFr } from "./country-fr.js";
import { sha256FileIfExists } from "./image-hash.js";
import { db } from "./instantdb-client.js";
import type { Card } from "../../schemas/card.schema.js";
import { normalizeForSearch } from "./normalize.js";
import { cardTranslationId } from "./ids.js";
import {
  targetLocales,
  localeTextOf,
  buildTranslationRow,
  validateTranslatedLocale,
  type CardTranslationRow,
} from "./card-translations.js";

const IMAGES_FINAL = path.join(PATHS.cards, "..", "_images-final");

// ── Types ────────────────────────────────────────────────────────────────

export type FlatCard = {
  dexNum: string;
  title: string;
  normalizedTitle: string;
  type: string;
  era: string;
  region: number;
  country: string;
  tag: "ponctuelle" | "periodique";
  pivotYear: number;
  startYear?: number;
  endYear?: number;
  whenDelta: number;
  lat: number;
  lon: number;
  whereRadiusKm: number;
  whereVerb: string;
  whereConsignePre: string;
  whereConsignePost: string;
  whenPromptVerb: string;
  whenPromptPre: string;
  whenPromptPost: string;
  timeDisplayLabel?: string;
  blurb: string;
  body: string;
  imageLabel: string;
  publishedAt: number;
  contentVersion: number;
  imageHash?: string;
};

export type DbCardSnapshot = {
  id: string;
  dexNum: string;
  contentVersion?: number | null;
  imageHash?: string | null;
  hasImage: boolean;
  hasThumb: boolean;
  hasBlurhash: boolean;
};

export type DiffEntry = {
  dexNum: string;
  title: string;
  reason: string; // "new" | "text v3→v4" | "image hash changed" | …
};

export type Diff = {
  toCreate: FlatCard[]; // dexNum absent de la DB
  toUpdateText: Array<{ flat: FlatCard; dbId: string; fromVersion: number | null; toVersion: number }>;
  toUploadImage: Array<{ dexNum: string; cardId: string; localHash: string; needsLink: boolean }>;
  // Traductions (locales non-source) à (ré)écrire : ligne manquante ou
  // sourceContentVersion ≠ contentVersion du FR. cardId="" pour les cartes en
  // création (résolu après le push texte, comme les images).
  toPushTranslations: Array<{ dexNum: string; cardId: string; locale: string; row: CardTranslationRow }>;
  unchanged: number;
  // Pour le rapport.
  warnings: string[];
  countryFallbacks: string[];
  translationRejects: string[]; // "[dexNum/locale] …" — validation échouée, NON écrite
};

export type PushOptions = {
  dryRun: boolean;
  maxDex?: number; // ne pousse que les cartes dexNum ≤ maxDex (numérique)
  /** Callback de progression — utile pour le polling depuis l'app. */
  onProgress?: (status: PushProgress) => void;
};

export type PushProgress = {
  phase: "diff" | "text" | "image" | "done";
  processed: number;
  total: number;
  lastDexNum?: string;
  errors: string[];
};

// normalizeForSearch est importé de ./normalize.js (partagé avec card-translations.js).

// ── Conversion Card → FlatCard (mapping pipeline → DB) ───────────────────

function flatten(card: Card, publishedAt: number): { flat: FlatCard; warnings: string[]; countryFallback: string | null } {
  const fr = card.display.locales.fr;
  const warnings: string[] = [];
  let countryFallback: string | null = null;

  let country = countryNameFr(card.canonical.place.countryCode);
  if (country == null) {
    country = card.canonical.place.placeCanonicalName;
    countryFallback = `country fallback used (countryCode=${card.canonical.place.countryCode ?? "null"} unmapped) → "${country}"`;
    warnings.push(countryFallback);
  }

  const flat: FlatCard = {
    dexNum: card.dexNum,
    title: fr.title,
    normalizedTitle: normalizeForSearch(fr.title),
    type: card.canonical.type,
    era: card.gameplay.era,
    region: card.canonical.place.region,
    country,
    tag: card.canonical.time.tag,
    pivotYear: card.canonical.time.pivotYear,
    whenDelta: card.gameplay.whenDelta,
    lat: card.canonical.place.lat,
    lon: card.canonical.place.lon,
    whereRadiusKm: card.gameplay.whereRadiusKm,
    whereVerb: fr.wherePrompt.verb,
    whereConsignePre: fr.wherePrompt.pre,
    whereConsignePost: fr.wherePrompt.post,
    whenPromptVerb: fr.whenPrompt.verb,
    whenPromptPre: fr.whenPrompt.pre,
    whenPromptPost: fr.whenPrompt.post,
    timeDisplayLabel: fr.timeDisplayLabel,
    blurb: fr.blurb,
    body: fr.body,
    imageLabel: card.display.imageLabel,
    publishedAt,
    contentVersion: card.editorial.contentVersion,
  };

  if (card.canonical.time.tag === "periodique") {
    if (card.canonical.time.startYear != null) flat.startYear = card.canonical.time.startYear;
    if (card.canonical.time.endYear != null) flat.endYear = card.canonical.time.endYear;
  }

  return { flat, warnings, countryFallback };
}

// ── 1. Charge le state local + DB et calcule le diff ─────────────────────

export async function computeDiff(opts: { maxDex?: number; forceTranslations?: boolean } = {}): Promise<Diff> {
  // a) Local : data/cards/ filtré sur status=approved.
  const all = loadCardsFromDir(PATHS.cards);
  if (all.issues.length > 0) {
    throw new Error(
      `data/cards/ contient ${all.issues.length} fichier(s) invalide(s) — corrige-les avant push:db.`,
    );
  }
  const approved = all.cards.filter((c) => c.data.editorial.status === "approved").map((c) => c.data);

  // Vérification invariants bloquants.
  const issues = runInvariants(all.cards.filter((c) => c.data.editorial.status === "approved"));
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    throw new Error(
      `Refus de push : ${blocking.length} erreur(s) bloquante(s) sur des cartes approved. Run \`npm run validate\` pour le détail.`,
    );
  }

  // Optionnel : filtre par dexNum numérique.
  const maxDexNum = opts.maxDex ?? Infinity;
  const selected = approved.filter((c) => {
    const n = parseInt(c.dexNum, 10);
    return Number.isFinite(n) ? n <= maxDexNum : true;
  });

  // b) DB : fetch toutes les cartes existantes avec leurs métadonnées + traductions.
  const dbResult = await db.query({ cards: { image: {}, thumb: {}, translations: {} } });
  const dbCardsRaw = (dbResult.cards ?? []) as Array<{
    id: string;
    dexNum?: string;
    contentVersion?: number | null;
    imageHash?: string | null;
    blurhash?: string | null;
    image?: { id: string } | null;
    thumb?: { id: string } | null;
    translations?: Array<{ locale?: string; sourceContentVersion?: number | null }> | null;
  }>;
  const dbByDex = new Map<string, DbCardSnapshot>();
  // dexNum → (locale → sourceContentVersion de la ligne en DB), pour le delta trad.
  const dbTransByDex = new Map<string, Map<string, number | null>>();
  for (const c of dbCardsRaw) {
    if (!c.dexNum) continue;
    dbByDex.set(c.dexNum, {
      id: c.id,
      dexNum: c.dexNum,
      contentVersion: c.contentVersion ?? null,
      imageHash: c.imageHash ?? null,
      hasImage: !!c.image?.id,
      hasThumb: !!c.thumb?.id,
      hasBlurhash: !!c.blurhash,
    });
    const tmap = new Map<string, number | null>();
    for (const t of c.translations ?? []) {
      if (t.locale) tmap.set(t.locale, t.sourceContentVersion ?? null);
    }
    dbTransByDex.set(c.dexNum, tmap);
  }

  // c) Diff.
  const publishedAt = Date.now();
  const locales = targetLocales();
  const toCreate: FlatCard[] = [];
  const toUpdateText: Diff["toUpdateText"] = [];
  const toUploadImage: Diff["toUploadImage"] = [];
  const toPushTranslations: Diff["toPushTranslations"] = [];
  let unchanged = 0;
  const warnings: string[] = [];
  const countryFallbacks: string[] = [];
  const translationRejects: string[] = [];

  for (const card of selected) {
    const { flat, warnings: w, countryFallback } = flatten(card, publishedAt);
    warnings.push(...w);
    if (countryFallback) countryFallbacks.push(`[${card.dexNum}] ${countryFallback}`);

    const localHash = sha256FileIfExists(path.join(IMAGES_FINAL, `${card.dexNum}.jpg`));
    if (localHash) flat.imageHash = localHash;
    else warnings.push(`[${card.dexNum}] image locale manquante (data/_images-final/${card.dexNum}.jpg) — texte poussé sans image`);

    const dbCard = dbByDex.get(card.dexNum);

    if (!dbCard) {
      toCreate.push(flat);
      if (localHash) {
        toUploadImage.push({
          dexNum: card.dexNum,
          cardId: "", // résolu après la création (le push texte l'attribue)
          localHash,
          needsLink: true,
        });
      }
      continue;
    }

    let textDirty = false;
    if (dbCard.contentVersion == null || flat.contentVersion > dbCard.contentVersion) {
      toUpdateText.push({
        flat,
        dbId: dbCard.id,
        fromVersion: dbCard.contentVersion ?? null,
        toVersion: flat.contentVersion,
      });
      textDirty = true;
    }

    let imageDirty = false;
    if (localHash) {
      const dbHash = dbCard.imageHash;
      const missingAsset = !dbCard.hasImage || !dbCard.hasThumb || !dbCard.hasBlurhash;
      if (dbHash !== localHash || missingAsset) {
        toUploadImage.push({
          dexNum: card.dexNum,
          cardId: dbCard.id,
          localHash,
          needsLink: !dbCard.hasImage || !dbCard.hasThumb,
        });
        imageDirty = true;
      }
    }

    // Traductions : pour chaque locale cible remplie en amont (display.locales.<loc>),
    // (ré)écrire si la ligne manque OU si sa sourceContentVersion ≠ contentVersion FR.
    const existingTrans = dbTransByDex.get(card.dexNum) ?? new Map<string, number | null>();
    const cardIdForTrans = dbCard ? dbCard.id : ""; // "" = création (cardId résolu au push)
    for (const locale of locales) {
      const loc = localeTextOf(card, locale);
      if (!loc) continue; // pas encore traduit en amont → repli FR côté app
      const v = validateTranslatedLocale(loc, card.canonical.time.tag, locale);
      if (!v.ok) {
        translationRejects.push(`[${card.dexNum}/${locale}] ${v.issues.join(" | ")}`);
        continue;
      }
      const stale = opts.forceTranslations || !existingTrans.has(locale) || existingTrans.get(locale) !== card.editorial.contentVersion;
      if (stale) {
        toPushTranslations.push({
          dexNum: card.dexNum,
          cardId: cardIdForTrans,
          locale,
          row: buildTranslationRow(card, locale, loc),
        });
      }
    }

    if (!textDirty && !imageDirty) unchanged++;
  }

  return {
    toCreate,
    toUpdateText,
    toUploadImage,
    toPushTranslations,
    unchanged,
    warnings,
    countryFallbacks,
    translationRejects,
  };
}

// ── 2. Push delta ────────────────────────────────────────────────────────

// Image processing helpers, alignés sur app/historydex/scripts/seed-card-images.ts
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 292;
const THUMB_QUALITY = 75;

// Timeout par opération réseau dans la boucle image. Empêche un upload bloqué
// (rate-limit, lenteur réseau) de figer la barre de progression UI à 100 %.
const IMAGE_OP_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function processRealImage(localPath: string): Promise<Buffer> {
  return sharp(localPath).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

async function makeThumb(srcBuffer: Buffer): Promise<Buffer> {
  return sharp(srcBuffer)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover", position: "attention" })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
}

async function makeBlurhash(srcBuffer: Buffer): Promise<string> {
  const { data, info } = await sharp(srcBuffer)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: "cover" })
    .toBuffer({ resolveWithObject: true });
  return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

// Push effectif. Si dryRun, retourne le diff sans toucher la DB.
export async function pushDelta(diff: Diff, options: PushOptions): Promise<{ pushed: number; errors: string[] }> {
  const { dryRun, onProgress } = options;
  const errors: string[] = [];
  const totalSteps =
    diff.toCreate.length +
    diff.toUpdateText.length +
    diff.toUploadImage.length +
    diff.toPushTranslations.length;
  let processed = 0;

  if (dryRun) {
    onProgress?.({ phase: "done", processed: 0, total: totalSteps, errors });
    return { pushed: 0, errors };
  }

  // a) Phase texte : un seul transact pour les "new" + les "update".
  onProgress?.({ phase: "text", processed: 0, total: totalSteps, errors });

  const idByDex = new Map<string, string>();
  const textOps: ReturnType<typeof db.tx.cards[string]["update"]>[] = [];

  for (const flat of diff.toCreate) {
    const newId = id();
    idByDex.set(flat.dexNum, newId);
    // db.tx.cards[id] est un proxy InstantDB qui ne retourne jamais undefined,
    // mais TS infère undefined avec noUncheckedIndexedAccess.
    textOps.push(db.tx.cards[newId]!.update(flat));
  }
  for (const u of diff.toUpdateText) {
    idByDex.set(u.flat.dexNum, u.dbId);
    textOps.push(db.tx.cards[u.dbId]!.update(u.flat));
  }
  if (textOps.length > 0) {
    try {
      await db.transact(textOps);
    } catch (err) {
      errors.push(`Phase texte échouée : ${(err as Error).message}`);
      onProgress?.({ phase: "done", processed, total: totalSteps, errors });
      return { pushed: processed, errors };
    }
  }
  processed += diff.toCreate.length + diff.toUpdateText.length;

  // a.bis) Phase traductions : lignes cardTranslations (locales non-source),
  // keyées par cardTranslationId (idempotent), liées à la carte. cardId résolu
  // via idByDex pour les cartes tout juste créées.
  if (diff.toPushTranslations.length > 0) {
    const transOps: ReturnType<(typeof db.tx.cardTranslations)[string]["update"]>[] = [];
    for (const t of diff.toPushTranslations) {
      const cardId = t.cardId || idByDex.get(t.dexNum);
      if (!cardId) {
        errors.push(`[${t.dexNum}/${t.locale}] cardId introuvable — traduction non poussée.`);
        continue;
      }
      const transId = cardTranslationId(cardId, t.locale);
      if (!transId) {
        errors.push(`[${t.dexNum}/${t.locale}] cardId non-UUID — traduction ignorée.`);
        continue;
      }
      transOps.push(db.tx.cardTranslations[transId]!.update(t.row).link({ card: cardId }));
    }
    if (transOps.length > 0) {
      // Chunk : un seul transact de ~1600 ops dépasse la limite InstantDB
      // ("too many parameters in the transaction"). 100 ops/transact (comme la
      // phase texte) reste largement sous la borne.
      const CHUNK = 100;
      try {
        for (let i = 0; i < transOps.length; i += CHUNK) {
          const slice = transOps.slice(i, i + CHUNK);
          await db.transact(slice);
          processed += slice.length;
        }
      } catch (err) {
        errors.push(`Phase traductions échouée : ${(err as Error).message}`);
      }
    }
  }

  // Si aucune image à pousser, on passe directement à "done" plutôt que de
  // laisser la phase à "text" avec processed=totalSteps (UI affichait alors
  // "Push texte — 100 %" et donnait l'impression de figer).
  if (diff.toUploadImage.length === 0) {
    onProgress?.({ phase: "done", processed, total: totalSteps, errors });
    return { pushed: processed, errors };
  }

  onProgress?.({ phase: "text", processed, total: totalSteps, errors });

  // b) Phase images : séquentiel à cause du rate-limit upload InstantDB.
  for (const img of diff.toUploadImage) {
    const cardId = img.cardId || idByDex.get(img.dexNum);
    if (!cardId) {
      errors.push(`[${img.dexNum}] impossible d'identifier la carte côté DB après push texte.`);
      onProgress?.({ phase: "image", processed, total: totalSteps, lastDexNum: img.dexNum, errors });
      continue;
    }

    // Signale au polling quelle image est en cours, sans incrémenter processed.
    onProgress?.({
      phase: "image",
      processed,
      total: totalSteps,
      lastDexNum: img.dexNum,
      errors,
    });

    try {
      const finalPath = path.join(IMAGES_FINAL, `${img.dexNum}.jpg`);
      if (!fs.existsSync(finalPath)) {
        // Invariant : computeDiff filtre déjà sur sha256FileIfExists != null,
        // donc on ne devrait jamais atteindre cette branche. Throw plutôt que
        // de pousser silencieusement un placeholder (cause historique de
        // cartes "titre + n°" sur fond beige en DB).
        throw new Error(
          `image locale absente (${finalPath}) — invariant push violé, ne devrait pas arriver via computeDiff`,
        );
      }

      const originalBuffer = await processRealImage(finalPath);
      const thumbBuffer = await makeThumb(originalBuffer);
      const blurhash = await makeBlurhash(originalBuffer);
      const originalStoragePath = `cards/${img.dexNum}.jpg`;
      const thumbStoragePath = `cards/thumbs/${img.dexNum}.webp`;

      // Upload original + thumb en parallèle, avec timeout pour éviter le
      // blocage silencieux (rate-limit, lenteur réseau).
      const [origFile, thumbFile] = await withTimeout(
        Promise.all([
          db.storage.uploadFile(originalStoragePath, originalBuffer, {
            contentType: "image/jpeg",
          }),
          db.storage.uploadFile(thumbStoragePath, thumbBuffer, {
            contentType: "image/webp",
          }),
        ]),
        IMAGE_OP_TIMEOUT_MS,
        `uploadFile ${img.dexNum}`,
      );

      // Link + persist blurhash + imageHash en une transaction.
      await withTimeout(
        db.transact([
          db.tx.cards[cardId]!.link({ image: origFile.data.id, thumb: thumbFile.data.id }),
          db.tx.cards[cardId]!.update({ blurhash, imageHash: img.localHash }),
        ]),
        IMAGE_OP_TIMEOUT_MS,
        `transact link ${img.dexNum}`,
      );

      processed += 1;
    } catch (err) {
      errors.push(`[${img.dexNum}] upload image échoué : ${(err as Error).message}`);
    }

    // Publie la progression après chaque image (succès ou échec) — c'est ce
    // rapport qui fait avancer la barre image par image côté UI.
    onProgress?.({
      phase: "image",
      processed,
      total: totalSteps,
      lastDexNum: img.dexNum,
      errors,
    });

    // Politesse rate-limit.
    await new Promise((r) => setTimeout(r, 200));
  }

  onProgress?.({ phase: "done", processed, total: totalSteps, errors });
  return { pushed: processed, errors };
}
