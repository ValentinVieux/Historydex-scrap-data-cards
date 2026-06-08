// Helpers Sharp pour rogner une image autour d'un sujet identifié.
// Coordonnées normalisées (proportions ∈ [0,1]) pour rester indépendant de la
// résolution source.

import sharp from "sharp";

export type Point = { x: number; y: number };
export type BBox = { x: number; y: number; width: number; height: number };

export type CropPlan = {
  // Fenêtre de crop appliquée à l'image source, en pixels.
  extract: { left: number; top: number; width: number; height: number };
  // Dimensions finales après resize (≤ maxWidth).
  finalWidth: number;
  finalHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function isValidPoint(p: unknown): p is Point {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    o.x >= 0 &&
    o.x <= 1 &&
    o.y >= 0 &&
    o.y <= 1
  );
}

export function isValidBBox(b: unknown): b is BBox {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  if (
    typeof o.x !== "number" ||
    typeof o.y !== "number" ||
    typeof o.width !== "number" ||
    typeof o.height !== "number"
  ) {
    return false;
  }
  if (o.width <= 0 || o.height <= 0) return false;
  if (o.x < 0 || o.y < 0) return false;
  if (o.x + o.width > 1.0001 || o.y + o.height > 1.0001) return false;
  return true;
}

/**
 * Calcule la fenêtre de crop optimale pour un ratio cible.
 *
 * Stratégie :
 *  1. Choisit la plus grande fenêtre au `targetRatio` qui tient dans la source.
 *  2. La translate pour couvrir entièrement la `bbox` du sujet si possible.
 *  3. À défaut, centre la fenêtre sur le `focalPoint`.
 *  4. Clamp dans les bornes de l'image source.
 */
export function planCrop(
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: Point,
  bbox: BBox | null,
  targetRatio: number,
  maxWidth: number,
): CropPlan {
  const sourceRatio = sourceWidth / sourceHeight;

  // Plus grande fenêtre au ratio cible qui tient dans la source.
  let cropW: number;
  let cropH: number;
  if (sourceRatio > targetRatio) {
    // Source plus large que cible → fenêtre limitée par la hauteur.
    cropH = sourceHeight;
    cropW = Math.round(cropH * targetRatio);
  } else {
    // Source plus haute que cible → fenêtre limitée par la largeur.
    cropW = sourceWidth;
    cropH = Math.round(cropW / targetRatio);
  }

  // Position initiale : centrée sur le focal point.
  const focalX = focalPoint.x * sourceWidth;
  const focalY = focalPoint.y * sourceHeight;
  let left = Math.round(focalX - cropW / 2);
  let top = Math.round(focalY - cropH / 2);

  // Si une bbox est fournie, on essaie de la couvrir intégralement.
  if (bbox) {
    const bx = bbox.x * sourceWidth;
    const by = bbox.y * sourceHeight;
    const bw = bbox.width * sourceWidth;
    const bh = bbox.height * sourceHeight;

    // Force la fenêtre à inclure la bbox (sans dépasser la source).
    if (left > bx) left = Math.round(bx);
    if (top > by) top = Math.round(by);
    if (left + cropW < bx + bw) left = Math.round(bx + bw - cropW);
    if (top + cropH < by + bh) top = Math.round(by + bh - cropH);
  }

  // Clamp dans les bornes de l'image source.
  left = Math.max(0, Math.min(left, sourceWidth - cropW));
  top = Math.max(0, Math.min(top, sourceHeight - cropH));

  // Resize si la fenêtre est plus large que la cible max.
  let finalWidth = cropW;
  let finalHeight = cropH;
  if (cropW > maxWidth) {
    finalWidth = maxWidth;
    finalHeight = Math.round(maxWidth / targetRatio);
  }

  return {
    extract: { left, top, width: cropW, height: cropH },
    finalWidth,
    finalHeight,
    sourceWidth,
    sourceHeight,
  };
}

/**
 * Applique un plan de crop à un buffer d'image source et renvoie un buffer JPG
 * (quality 85) au ratio cible.
 */
export async function applyCrop(
  sourceBuffer: Buffer,
  plan: CropPlan,
): Promise<Buffer> {
  return sharp(sourceBuffer)
    // .rotate() (sans argument) applique l'orientation EXIF avant l'extract.
    // No-op si le buffer est déjà droit (cas review-server, déjà orienté) ;
    // filet de sécurité si applyCrop reçoit une source brute orientée ≠ 1.
    .rotate()
    .extract(plan.extract)
    .resize(plan.finalWidth, plan.finalHeight, { fit: "fill" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Fallback : copie l'image source au ratio cible via sharp 'cover' (centrage
 * géométrique). Utilisé quand l'agent vision échoue ou que la décision est
 * "kept-original".
 */
export async function fallbackCenterCrop(
  sourceBuffer: Buffer,
  targetRatio: number,
  maxWidth: number,
): Promise<Buffer> {
  const meta = await sharp(sourceBuffer).metadata();
  const sw = meta.width ?? maxWidth;
  const sh = meta.height ?? Math.round(maxWidth / targetRatio);
  const plan = planCrop(
    sw,
    sh,
    { x: 0.5, y: 0.5 },
    null,
    targetRatio,
    maxWidth,
  );
  return applyCrop(sourceBuffer, plan);
}

/**
 * Renvoie les dimensions (width, height) d'un buffer image.
 */
export async function imageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Unable to read image dimensions");
  }
  return { width: meta.width, height: meta.height };
}

/**
 * Downscale un buffer JPG/PNG à une largeur max (côté long). Utilisé avant
 * envoi à l'API vision pour économiser des tokens d'image.
 */
export async function downscaleForVision(
  buffer: Buffer,
  maxLongEdge: number,
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? maxLongEdge;
  const h = meta.height ?? maxLongEdge;
  if (Math.max(w, h) <= maxLongEdge) {
    // Re-encode en JPG quality 80 pour normaliser le format.
    return sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  }
  if (w >= h) {
    return sharp(buffer)
      .resize({ width: maxLongEdge })
      .jpeg({ quality: 80 })
      .toBuffer();
  }
  return sharp(buffer)
    .resize({ height: maxLongEdge })
    .jpeg({ quality: 80 })
    .toBuffer();
}
