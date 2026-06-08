// Helper pour relire et réécrire un fichier de carte (data/cards/<slug>.json)
// avec validation Zod systématique.
//
// Utilisé par review-server.ts pour persister les modifs de métadonnées
// faites depuis l'UI de review (textes, geo, gameplay).

import fs from "node:fs";
import path from "node:path";
import { CardSchema, type Card } from "../../schemas/card.schema.js";
import { PATHS, readJson } from "./io.js";

export type LoadedCardFile = {
  file: string;
  card: Card;
};

function findFileForDexNum(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(dir, name);
    try {
      const raw = readJson<{ dexNum?: unknown }>(full);
      if (typeof raw.dexNum === "string") out.set(raw.dexNum, full);
    } catch {
      // fichier illisible : on ignore, validateCatalog le signalera
    }
  }
  return out;
}

// Charge le fichier d'une carte par dexNum depuis data/cards/.
// Lève si introuvable ou invalide.
export function loadCardFile(dexNum: string): LoadedCardFile {
  const cardsMap = findFileForDexNum(PATHS.cards);
  const cardPath = cardsMap.get(dexNum);
  if (!cardPath) {
    throw new Error(`Aucun fichier carte trouvé pour dexNum=${dexNum}`);
  }
  const parsed = CardSchema.parse(readJson(cardPath));
  return { file: cardPath, card: parsed };
}

export type SaveError = {
  ok: false;
  errors: Array<{ path: string; message: string }>;
};

export type SaveOk = { ok: true; card: Card };

// Valide via Zod puis écrit. Bump editorial.contentVersion.
// Retourne les erreurs Zod plutôt que de les lever pour que le serveur
// puisse les mapper en réponse 400 propre.
export function saveCardFile(file: string, candidate: unknown): SaveOk | SaveError {
  // Bump contentVersion si le candidat est un objet avec editorial.contentVersion.
  if (
    candidate &&
    typeof candidate === "object" &&
    "editorial" in candidate &&
    candidate.editorial &&
    typeof candidate.editorial === "object" &&
    "contentVersion" in candidate.editorial &&
    typeof (candidate.editorial as { contentVersion: unknown }).contentVersion === "number"
  ) {
    (candidate.editorial as { contentVersion: number }).contentVersion += 1;
  }

  const parsed = CardSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((e) => ({
        path: e.path.join(".") || "(root)",
        message: e.message,
      })),
    };
  }
  fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
  return { ok: true, card: parsed.data };
}
