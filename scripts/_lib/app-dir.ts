// Emplacement du repo APP (HistoryDex) vu depuis ce repo pipeline.
//
// Historiquement `../app/historydex` (dossier frère). Sur le poste Windows de 2026-11,
// l'app vit dans `../Historydex` (C:\projets\HistoryDex\Historydex). Ordre :
//   1. `HISTORYDEX_APP_DIR` (chemin explicite, ex. un worktree de l'app) ;
//   2. le premier dossier existant parmi `../app/historydex`, `../Historydex` ;
//   3. à défaut `../app/historydex` (les appelants gèrent l'absence).
// `SUPPORTED_LOCALES_JSON` (card-translations.ts) reste prioritaire pour la seule liste
// des langues (pointer un worktree app non mergé sans déplacer le reste).
import fs from "node:fs";
import path from "node:path";

const LEGACY: readonly string[] = ["..", "app", "historydex"];
const CANDIDATES: readonly (readonly string[])[] = [LEGACY, ["..", "Historydex"]];

export function appRepoDir(cwd: string = process.cwd()): string {
  const fromEnv = process.env.HISTORYDEX_APP_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  for (const parts of CANDIDATES) {
    const p = path.resolve(cwd, ...parts);
    if (fs.existsSync(path.join(p, "package.json"))) return p;
  }
  return path.resolve(cwd, ...LEGACY);
}
