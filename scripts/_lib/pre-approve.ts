// Vérifie les pré-conditions pour passer une carte de "reviewed" à "approved".
//
// Logique partagée entre :
//   - L'endpoint POST /api/cards/:dexNum/approve du review-server
//   - Le script batch scripts/auto-promote.ts
//
// Critères (cf. plan refonte D7 + .claude/rules/research-rules.md) :
//   - Validation Zod OK (CardSchema.parse)
//   - ≥ 2 publishers distincts dans editorial.sources (deux pages du même éditeur = 1)
//   - ≥ 1 source avec relevance="date"
//   - ≥ 1 source avec relevance="place"
//   - editorial.confidence ≠ "low"
//   - Aucune erreur bloquante d'invariant
//   - (optionnel via flag) Crop d'image appliqué : _index.json[dexNum].crop.finalFile présent
//     ET fichier data/_images-final/<dexNum>.jpg existant sur disque

import fs from "node:fs";
import path from "node:path";
import { CardSchema, type Card } from "../../schemas/card.schema.js";
import { PATHS } from "./io.js";
import { runInvariants } from "./invariants.js";

const IMAGES_FINAL = path.join(PATHS.cards, "..", "_images-final");

export type Blocker = {
  rule: string;
  message: string;
};

export type PreApproveOptions = {
  /** Si true, exige un crop d'image présent (recommandé pour l'app de review). */
  requireImageCrop?: boolean;
  /** Index image en mémoire (cropApplied par dexNum). Si omis, on ne check pas le crop. */
  imageIndex?: Record<string, { crop?: { finalFile?: string | null } | undefined }>;
  /** Si true, ne bloque pas sur "moins de 2 éditeurs distincts" (override review humaine). */
  skipSourceCount?: boolean;
};

// Vérifie toutes les pré-conditions. Retourne la liste des bloqueurs (vide = OK).
export function checkApprovalPreconditions(
  rawCard: unknown,
  options: PreApproveOptions = {},
): Blocker[] {
  const blockers: Blocker[] = [];

  // 1. Validation Zod
  const parsed = CardSchema.safeParse(rawCard);
  if (!parsed.success) {
    return [
      {
        rule: "schema",
        message: `Validation Zod échouée : ${parsed.error.errors
          .slice(0, 3)
          .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
          .join(" ; ")}`,
      },
    ];
  }
  const card: Card = parsed.data;

  // 2. confidence
  if (card.editorial.confidence === "low") {
    blockers.push({
      rule: "approved-no-low-confidence",
      message: "confidence=low (besoin medium ou high)",
    });
  }

  // 3. Publishers distincts (deux pages du même éditeur = 1)
  if (!options.skipSourceCount) {
    const publishers = new Set<string>();
    for (const s of card.editorial.sources) {
      publishers.add(s.publisher.trim().toLowerCase());
    }
    if (publishers.size < 2) {
      blockers.push({
        rule: "approved-needs-sources",
        message: `seulement ${publishers.size} éditeur(s) indépendant(s) (besoin ≥ 2)`,
      });
    }
  }

  // 4. Source date
  if (!card.editorial.sources.some((s) => s.relevance === "date")) {
    blockers.push({
      rule: "approved-needs-date-source",
      message: 'aucune source avec relevance="date"',
    });
  }

  // 5. Source place
  if (!card.editorial.sources.some((s) => s.relevance === "place")) {
    blockers.push({
      rule: "approved-needs-place-source",
      message: 'aucune source avec relevance="place"',
    });
  }

  // 6. Invariants bloquants (note : on simule un file path générique pour
  // runInvariants — l'appelant a déjà le vrai path s'il veut le logger).
  // On filtre les invariants déjà couverts par les steps 3-5 ci-dessus pour
  // éviter de remonter deux fois la même erreur (avec une formulation moins lisible).
  const REDUNDANT_WITH_PRE_APPROVE = new Set([
    "reviewed-needs-sources",
    "reviewed-needs-date-source",
    "reviewed-needs-place-source",
  ]);
  const issues = runInvariants([{ file: "<pre-approve>", data: card }]);
  for (const e of issues.filter(
    (i) => i.severity === "error" && !REDUNDANT_WITH_PRE_APPROVE.has(i.rule),
  )) {
    blockers.push({
      rule: `invariant:${e.rule}`,
      message: e.message.slice(0, 200),
    });
  }

  // 7. Crop d'image (optionnel, requis par l'app de review)
  if (options.requireImageCrop) {
    const entry = options.imageIndex?.[card.dexNum];
    const indexHasCrop = entry?.crop?.finalFile != null;
    const fileExists = fs.existsSync(path.join(IMAGES_FINAL, `${card.dexNum}.jpg`));
    if (!indexHasCrop || !fileExists) {
      blockers.push({
        rule: "approved-needs-cropped-image",
        message:
          "image non rognée (applique un crop dans l'app de review avant d'approuver)",
      });
    }
  }

  return blockers;
}
