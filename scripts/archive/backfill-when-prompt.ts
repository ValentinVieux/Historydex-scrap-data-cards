#!/usr/bin/env -S tsx
// Backfill : injecte un `whenPrompt` (consigne WHEN) dans toutes les cartes
// existantes qui n'en ont pas. La structure est inférée depuis `wherePrompt`
// + le `tag` (ponctuelle vs periodique).
//
// Usage :
//   npx tsx scripts/backfill-when-prompt.ts --dry-run   # affiche le diff sans écrire
//   npx tsx scripts/backfill-when-prompt.ts             # applique sur les cartes sans whenPrompt
//   npx tsx scripts/backfill-when-prompt.ts --force     # ré-applique même si déjà présent
//
// Heuristique : voir tables dans .claude/rules/editorial-rules.md (section whenPrompt).

import fs from "node:fs";
import path from "node:path";
import { CardSchema } from "../schemas/card.schema.js";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";

type WherePrompt = { pre: string; verb: string; post: string };
type WhenPrompt = WherePrompt;

type RawCard = {
  id?: string;
  dexNum?: string;
  canonical?: { time?: { tag?: string }; type?: string };
  display?: { locales?: { fr?: { wherePrompt?: WherePrompt; whenPrompt?: WhenPrompt } } };
};

type Verdict = {
  file: string;
  dexNum: string;
  id: string;
  action: "skip-has-when" | "fill-clean" | "fill-warning" | "fill-force" | "skip-no-where";
  before: WhenPrompt | null;
  after: WhenPrompt | null;
  warning?: string;
};

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

// Mappe le préfixe `wherePrompt.pre` → préfixe `whenPrompt.pre` selon le tag.
// Renvoie `null` si le motif n'est pas reconnu (fallback + warning).
function mapPre(
  wherePre: string,
  tag: "ponctuelle" | "periodique",
): { pre: string; matched: boolean } {
  const trimmed = wherePre.trim();
  if (tag === "ponctuelle") {
    if (trimmed === "Où a été") return { pre: "Quand a été ", matched: true };
    if (trimmed === "Où s'est") return { pre: "Quand s'est ", matched: true };
    if (trimmed === "Où est") return { pre: "Quand est ", matched: true };
    if (trimmed === "Où se situe") return { pre: "Quand a vécu ", matched: true };
    if (trimmed === "Où a") return { pre: "Quand a ", matched: true };
    return { pre: "Quand a été ", matched: false };
  }
  // periodique
  if (trimmed === "Où a été") return { pre: "Sur quelle période a été ", matched: true };
  if (trimmed === "Où s'est") return { pre: "Sur quelle période s'est ", matched: true };
  if (trimmed === "Où est") return { pre: "Sur quelle période s'est ", matched: true };
  if (trimmed === "Où se situe") return { pre: "Sur quelle période a existé ", matched: true };
  if (trimmed === "Où a") return { pre: "Sur quelle période a ", matched: true };
  return { pre: "Sur quelle période s'est ", matched: false };
}

// Pour les cartes périodiques, certains verbes ponctuels n'ont pas de sens
// dans la durée. On adapte quand on peut, sinon on garde + warning.
function adaptVerbForPeriodique(verb: string): { verb: string; warning?: string } {
  const v = verb.trim().toLowerCase();
  // Verbes qui collent déjà à une durée — on garde tel quel.
  const durativeOk = new Set([
    "apparu", "apparue", "développé", "développée", "diffusé", "diffusée",
    "propagé", "propagée", "étendu", "étendue", "régné", "régnée",
    "originaire", "dirigée", "dirigé", "gouvernée", "gouverné",
    "associé", "associée", "symbolisé", "symbolisée",
  ]);
  if (durativeOk.has(v)) return { verb };
  // Reformulations courantes vers du duratif.
  const remap: Record<string, string> = {
    "construit": "bâti",
    "érigé": "bâti",
    "peint": "peinte",
    "peinte": "peinte",
    "sculpté": "sculptée",
    "sculptée": "sculptée",
    "écrit": "rédigé",
    "rédigé": "rédigé",
    "publié": "diffusé",
    "inventé": "développé",
    "découvert": "exploré",
    "déroulée": "déroulée",
    "livrée": "livrée",
    "signé": "élaboré",
    "ratifié": "appliqué",
  };
  if (remap[v]) {
    if (remap[v] === v) return { verb }; // identité, pas de warning
    return { verb: remap[v]!, warning: `verbe "${verb}" remappé en "${remap[v]}" (periodique)` };
  }
  return { verb, warning: `verbe "${verb}" inhabituel pour une carte periodique — relire` };
}

function buildWhenPrompt(
  where: WherePrompt,
  tag: "ponctuelle" | "periodique",
): { whenPrompt: WhenPrompt; warnings: string[] } {
  const warnings: string[] = [];
  const { pre, matched } = mapPre(where.pre, tag);
  if (!matched) warnings.push(`pre "${where.pre}" non reconnu — fallback "${pre}"`);

  let verb = where.verb;
  if (tag === "periodique") {
    const { verb: v, warning } = adaptVerbForPeriodique(where.verb);
    verb = v;
    if (warning) warnings.push(warning);
  }
  return { whenPrompt: { pre, verb, post: where.post }, warnings };
}

function processFile(file: string): Verdict {
  const raw = readJson<RawCard>(file);
  const dexNum = raw.dexNum ?? "?";
  const id = raw.id ?? "?";
  const fr = raw.display?.locales?.fr;
  const where = fr?.wherePrompt;
  const tag = raw.canonical?.time?.tag;
  const existing = fr?.whenPrompt ?? null;

  if (!where || (tag !== "ponctuelle" && tag !== "periodique")) {
    return {
      file, dexNum, id,
      action: "skip-no-where",
      before: existing, after: null,
      warning: "wherePrompt ou tag manquant — saute",
    };
  }

  if (existing && !FORCE) {
    return { file, dexNum, id, action: "skip-has-when", before: existing, after: existing };
  }

  const { whenPrompt, warnings } = buildWhenPrompt(where, tag);

  // Mute le JSON et valide via Zod (le schéma exige maintenant whenPrompt).
  // On reconstruit l'objet display.locales.fr en y injectant whenPrompt.
  const candidate = JSON.parse(JSON.stringify(raw)) as RawCard;
  candidate.display!.locales!.fr!.whenPrompt = whenPrompt;
  const parsed = CardSchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(" ; ");
    return {
      file, dexNum, id,
      action: "skip-no-where",
      before: existing, after: whenPrompt,
      warning: `validation Zod échouée après injection : ${msg}`,
    };
  }

  if (!DRY) {
    fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
  }

  return {
    file, dexNum, id,
    action: warnings.length > 0 ? "fill-warning" : (FORCE && existing ? "fill-force" : "fill-clean"),
    before: existing, after: whenPrompt,
    warning: warnings.length > 0 ? warnings.join(" | ") : undefined,
  };
}

function main(): number {
  const files = [
    ...listJsonFiles(PATHS.approved),
    ...listJsonFiles(PATHS.normalized),
  ];
  if (files.length === 0) {
    console.log("Aucun fichier carte trouvé dans data/approved ni data/normalized.");
    return 0;
  }

  console.log(
    `${DRY ? "[DRY-RUN] " : ""}${files.length} carte(s) à examiner${FORCE ? " (--force activé)" : ""}.\n`,
  );

  const verdicts = files.map(processFile);

  const filled = verdicts.filter((v) => v.action.startsWith("fill"));
  const skippedHas = verdicts.filter((v) => v.action === "skip-has-when");
  const skippedNoWhere = verdicts.filter((v) => v.action === "skip-no-where");
  const warnings = verdicts.filter((v) => v.warning);

  for (const v of filled) {
    const tag = v.warning ? "[WARN]" : "[OK]  ";
    const rel = path.relative(process.cwd(), v.file);
    console.log(`${tag} ${v.dexNum} ${v.id}`);
    console.log(`         pre  : "${v.after?.pre}"`);
    console.log(`         verb : "${v.after?.verb}"`);
    console.log(`         post : "${v.after?.post}"`);
    if (v.warning) console.log(`         ⚠️   ${v.warning}`);
    console.log(`         → ${rel}`);
  }
  for (const v of skippedNoWhere) {
    console.log(`[SKIP] ${v.dexNum} ${v.id} — ${v.warning ?? ""}`);
  }

  console.log("");
  console.log(`Résumé : ${filled.length} pré-remplie(s), ${skippedHas.length} déjà présente(s), ${skippedNoWhere.length} sautée(s).`);
  if (warnings.length > 0) {
    console.log(`         ${warnings.length} carte(s) à relire (warning).`);
  }
  if (DRY) {
    console.log("\n(dry-run : aucun fichier écrit)");
  }
  return 0;
}

process.exit(main());
