// Empreinte du texte FR dont une traduction dérive.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `cardTranslations.sourceContentVersion` (côté DB) enregistre avec quelle
// version FR une traduction a été *poussée*, PAS de quelle version FR elle a été
// *traduite*. Conséquence observée au batch 58 (2026-07-19) : corriger un body FR
// puis incrémenter `editorial.contentVersion` sans retoucher les locales fait
// re-pousser le texte traduit INCHANGÉ sous le nouveau numéro — la divergence
// FR/traduction est blanchie en « à jour » et plus aucun diff ne la rattrape.
//
// La correction : au moment où une traduction est produite (merge-translations),
// on stampe dans la carte le sha256 du texte FR dont elle dérive. Toute édition
// ultérieure du FR change le hash, et l'invariant `translation-stale` le voit.
// Contrairement à un compteur, un hash de contenu ne peut pas être « oublié » :
// il n'y a rien à incrémenter à la main.
//
// Même idiome que les images (`sha256(_images-final/<dexNum>.jpg) ≠ db.imageHash`,
// cf. image-hash.ts).

import { createHash } from "node:crypto";
import type { Card } from "../../schemas/card.schema.js";

// Champs FR dont le contenu traduit dérive réellement. `imageLabel` en est exclu
// (non localisé), `factNotes`/`justification` aussi (jamais traduits).
// Ordre figé : il fait partie de la définition du hash.
function frSourceMaterial(card: Card): string {
  const fr = card.display.locales.fr;
  return JSON.stringify([
    fr.title,
    fr.blurb,
    fr.body,
    fr.placeLabel,
    fr.timeDisplayLabel,
    fr.wherePrompt.pre,
    fr.wherePrompt.verb,
    fr.wherePrompt.post,
    fr.whenPrompt.pre,
    fr.whenPrompt.verb,
    fr.whenPrompt.post,
  ]);
}

/** sha256 (hex, tronqué à 16 car. — largement assez pour de la détection de dérive). */
export function frSourceHash(card: Card): string {
  return createHash("sha256").update(frSourceMaterial(card), "utf8").digest("hex").slice(0, 16);
}

/**
 * Hash DÉDIÉ du teaser FR (`translationMeta.<loc>.teaserHash`). Volontairement hors de
 * `frSourceHash` : le teaser se retraduit seul via translate-teasers.ts (Azure, ~150 car.),
 * sans repasser par prose + where/when + merge. null si la carte n'a pas de teaser.
 */
export function frTeaserHash(card: Card): string | null {
  const t = card.display.locales.fr.teaser;
  if (!t) return null;
  return createHash("sha256").update(t, "utf8").digest("hex").slice(0, 16);
}

/**
 * Locales cibles gérées par le pipeline MT et soumises au contrôle de dérive.
 * `en` est exclu : backfillé directement en base pour 549 cartes anciennes, sans
 * `display.locales.en` local — on ne peut pas connaître sa provenance.
 */
export const HASH_TRACKED_LOCALES = ["es", "de", "it", "pt", "pt-PT", "pl", "tr", "nl", "ja", "ko"] as const;
