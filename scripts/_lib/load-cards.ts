import path from "node:path";
import { CardSchema, type Card } from "../../schemas/card.schema.js";
import { listJsonFiles, readJson } from "./io.js";

export type LoadedCard = {
  file: string;
  data: Card;
};

export type LoadIssue = {
  file: string;
  errors: string[];
};

export type LoadResult = {
  cards: LoadedCard[];
  issues: LoadIssue[];
};

// Charge toutes les cartes JSON valides d'un dossier (data/cards/).
// Les fichiers invalides sont remontés dans `issues` plutôt que jetés —
// `validate-catalog` les transforme en erreurs schéma.
export function loadCardsFromDir(dir: string): LoadResult {
  const files = listJsonFiles(dir);
  const cards: LoadedCard[] = [];
  const issues: LoadIssue[] = [];

  for (const file of files) {
    let raw: unknown;
    try {
      raw = readJson(file);
    } catch (err) {
      issues.push({ file, errors: [(err as Error).message] });
      continue;
    }
    const parsed = CardSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({
        file,
        errors: parsed.error.errors.map(
          (e) => `${e.path.join(".") || "(root)"}: ${e.message}`,
        ),
      });
      continue;
    }
    cards.push({ file, data: parsed.data });
  }
  return { cards, issues };
}

export function basenameNoExt(file: string): string {
  return path.basename(file, path.extname(file));
}
