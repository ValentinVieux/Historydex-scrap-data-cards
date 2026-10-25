// Générateur MT (PROSE) du catalogue — étape 1/2 du pipeline de traduction éco.
// Moteur : Azure AI Translator (palier gratuit F0 = 2M caractères/mois, permanent).
//
// Traduit fr→<locale> les 5 champs de PROSE d'une carte (title, blurb, body,
// placeLabel, timeDisplayLabel) et écrit un staging `data/_translations/<locale>.jsonl`
// (1 carte/ligne). Les 6 champs STRUCTURÉS where/when {pre,verb,post} ne passent PAS
// par la MT (re-découpage selon l'ordre des mots cible + invariant lead-in) : produits
// par l'étape LLM 2/2 qui lit ce staging, puis un merge écrit display.locales.<loc>.
//
// L'appel moteur est isolé dans translateBatch() : basculer vers DeepL/Google/Amazon
// = réécrire cette seule fonction.
//
// Robustesse F0 : lots ≤ MAX_CHARS, throttle entre lots, backoff sur 429 (honore
// Retry-After), écriture INCRÉMENTALE par chunk → reprise possible (idempotent par dexNum).
//
// Usage :
//   npx tsx scripts/translate-cards-mt.ts es                    # dry-run (coût estimé)
//   npx tsx scripts/translate-cards-mt.ts es --limit 5 --apply  # pilote 5 cartes
//   npx tsx scripts/translate-cards-mt.ts es --apply            # locale complète (reprend où ça s'est arrêté)
//   npx tsx scripts/translate-cards-mt.ts es --no-mt --apply    # DÉFAUT depuis 2026-10-25 : staging sans Azure, l'agent de l'étape 2 traduit tout
//   npx tsx scripts/translate-cards-mt.ts es --dex 774,801 --apply  # RE-traduire ces cartes (FR modifié après traduction)
//   npx tsx scripts/translate-cards-mt.ts es --dex 702,980 --prompts-only --apply  # seules les consignes OÙ/QUAND ont changé :
//        pas d'appel Azure, met à jour frWhere/frWhen des lignes prose staged et purge leurs lignes whenwhere
//
// Requiert dans .env : AZURE_TRANSLATOR_KEY (+ AZURE_TRANSLATOR_REGION si ressource régionale).

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { targetLocales } from "./_lib/card-translations.js";
import { AZ_KEY, AZURE_TO, mtTranslate } from "./_lib/azure-mt.js";

// `teaser` (brève description en jeu) est optionnel côté FR : absent → non envoyé à Azure,
// absent de la prose staged ; merge-translations ne l'écrit alors pas.
const PROSE_FIELDS = ["title", "blurb", "teaser", "body", "placeLabel", "timeDisplayLabel"] as const;
type ProseField = (typeof PROSE_FIELDS)[number];

const CARDS_DIR = path.resolve(process.cwd(), "data", "cards");
const STAGING_DIR = path.resolve(process.cwd(), "data", "_translations");

const CARDS_PER_CHUNK = 20; // ~100 segments / ~15k chars par chunk

type Args = { locale: string; limit: number; apply: boolean; status: "approved" | "reviewed" | "both"; minDex: number; maxDex: number; dex: Set<string> | null; promptsOnly: boolean; noMt: boolean };
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const locale = a.find((x) => !x.startsWith("--")) ?? "";
  const limFlag = a.find((x) => x.startsWith("--limit"));
  const limit = limFlag ? Number(limFlag.split("=")[1] ?? a[a.indexOf(limFlag) + 1]) : Infinity;
  const statusFlag = a.find((x) => x.startsWith("--status"));
  const status = (statusFlag ? (statusFlag.split("=")[1] ?? a[a.indexOf(statusFlag) + 1]) : "approved") as Args["status"];
  // --min-dex : plancher dexNum. Sert à scoper `en` aux cartes neuves (les anciennes
  // ont leur `en` backfillé en DB sans display.locales.en local — ne pas re-traduire).
  const minFlag = a.find((x) => x.startsWith("--min-dex"));
  const minDex = minFlag ? Number(minFlag.split("=")[1] ?? a[a.indexOf(minFlag) + 1]) : 0;
  // --max-dex : plafond dexNum. Sert à scoper un run à une tranche du catalogue
  // (ex. `--status both --max-dex 900` pour inclure les `reviewed` jusqu'à 900 seulement).
  const maxFlag = a.find((x) => x.startsWith("--max-dex"));
  const maxDex = maxFlag ? Number(maxFlag.split("=")[1] ?? a[a.indexOf(maxFlag) + 1]) : Infinity;
  // --dex 774,801 : RE-traduire exactement ces cartes (FR modifié après traduction).
  // Ignore « déjà traduit » et « déjà staged », et purge leurs lignes de staging
  // (prose ET whenwhere) pour que l'ancienne traduction ne soit pas re-mergée.
  const dexFlag = a.find((x) => x === "--dex" || x.startsWith("--dex="));
  const dexRaw = dexFlag ? (dexFlag.split("=")[1] ?? a[a.indexOf(dexFlag) + 1] ?? "") : "";
  const dex = dexRaw ? new Set(dexRaw.split(",").map((s) => s.trim()).filter(Boolean)) : null;
  // --prompts-only (avec --dex) : la prose FR est inchangée, seules les consignes ont bougé →
  // zéro caractère Azure ; on ne régénère que l'étape where/when (sous-agent) puis merge --dex.
  const promptsOnly = a.includes("--prompts-only");
  if (promptsOnly && !dex) {
    console.error("--prompts-only requiert --dex a,b");
    process.exit(1);
  }
  return { locale, limit: Number.isFinite(limit) ? limit : Infinity, apply: a.includes("--apply"), status, minDex: Number.isFinite(minDex) ? minDex : 0, maxDex: Number.isFinite(maxDex) ? maxDex : Infinity, dex, promptsOnly, noMt: a.includes("--no-mt") };
}

type Card = {
  dexNum: string;
  editorial: { status: string };
  canonical: { time: { tag: "ponctuelle" | "periodique" } };
  display: { locales: Record<string, Record<string, unknown> | null> };
  _file: string;
};

function loadCards(): Card[] {
  return fs
    .readdirSync(CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const c = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), "utf8")) as Card;
      c._file = f;
      return c;
    });
}

// Moteur MT : scripts/_lib/azure-mt.ts (partagé avec translate-teasers.ts).

const fmt = (n: number) => n.toLocaleString("en-US");

async function main() {
  const { locale, limit, apply, status, minDex, maxDex, dex, promptsOnly, noMt } = parseArgs();
  if (!locale || !targetLocales().includes(locale)) {
    console.error(`locale invalide. Cibles: ${targetLocales().join(", ")} (cf. supported-locales.json)`);
    process.exit(1);
  }
  const target = AZURE_TO[locale];
  if (!target) {
    console.error(`pas de code Azure pour '${locale}' — ajouter à AZURE_TO`);
    process.exit(1);
  }

  const wantStatus = (s: string) => (status === "both" ? s === "approved" || s === "reviewed" : s === status);
  const all = loadCards();

  fs.mkdirSync(STAGING_DIR, { recursive: true });
  const outFile = path.join(STAGING_DIR, `${locale}.jsonl`);
  const readLines = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean) : []);
  const notRetranslated = (l: string) => !dex || !dex.has(JSON.parse(l).dexNum as string);
  const existing = readLines(outFile).filter(notRetranslated); // --dex : anciennes lignes prose purgées
  const seen = new Set(existing.map((l) => JSON.parse(l).dexNum as string));
  const wwFile = path.join(STAGING_DIR, `${locale}.whenwhere.jsonl`);
  const wwKept = dex ? readLines(wwFile).filter(notRetranslated) : null; // --dex : idem where/when

  // À traduire = bon statut, pas déjà traduit en amont (display.locales[loc]), pas déjà staged.
  // Avec --dex : exactement ces cartes (statut respecté), sans les deux garde-fous « déjà ».
  const todo = all
    .filter((c) => wantStatus(c.editorial?.status) && c.display?.locales?.fr)
    .filter((c) => (dex ? dex.has(c.dexNum) : !c.display?.locales?.[locale] && !seen.has(c.dexNum) && Number(c.dexNum) >= minDex && Number(c.dexNum) <= maxDex))
    .slice(0, limit);

  if (promptsOnly && dex) {
    // Prose inchangée : on réécrit frWhere/frWhen/tag des lignes prose déjà staged (c'est ce
    // que lit le sous-agent where/when) et on purge les lignes whenwhere de ces cartes.
    const rawLines = readLines(outFile);
    const byDex = new Map(all.map((c) => [c.dexNum, c] as const));
    let updated = 0;
    const staged = new Set<string>();
    const rewritten = rawLines.map((l) => {
      const row = JSON.parse(l) as { dexNum: string; tag: string; frWhere: unknown; frWhen: unknown };
      if (!dex.has(row.dexNum)) return l;
      const c = byDex.get(row.dexNum);
      if (!c) return l;
      const fr = c.display.locales.fr as Record<string, unknown>;
      row.frWhere = fr.wherePrompt;
      row.frWhen = fr.whenPrompt;
      row.tag = c.canonical.time.tag;
      staged.add(row.dexNum);
      updated++;
      return JSON.stringify(row);
    });
    const notStaged = [...dex].filter((d) => !staged.has(d));
    const purgedWW = wwKept ? readLines(wwFile).length - wwKept.length : 0;
    console.log(`locale=${locale} · --prompts-only : ${updated} ligne(s) prose mises à jour (frWhere/frWhen/tag), ${purgedWW} ligne(s) whenwhere à purger (0 caractère Azure)`);
    if (notStaged.length) console.log(`  ⚠ sans prose staged pour ${locale} (relancer --dex SANS --prompts-only pour celles-ci) : ${notStaged.join(",")}`);
    if (!apply) {
      console.log("\n(DRY-RUN — aucune écriture. Relancer avec --apply.)");
      return;
    }
    fs.writeFileSync(outFile, rewritten.join("\n") + "\n");
    if (wwKept) fs.writeFileSync(wwFile, wwKept.length ? wwKept.join("\n") + "\n" : "");
    console.log(`✓ staging ${locale} prêt pour l'étape where/when (sous-agent) puis merge-translations.ts ${locale} --dex …`);
    return;
  }

  let chars = 0;
  for (const c of todo) {
    const fr = c.display.locales.fr as Record<string, unknown>;
    for (const f of PROSE_FIELDS) chars += String(fr[f] ?? "").length;
  }

  console.log(`locale=${locale} (Azure ${target}) · status=${status} · à traduire: ${todo.length} (déjà staged: ${seen.size})`);
  console.log(`prose à facturer: ~${fmt(chars)} caractères (palier gratuit Azure F0 = 2 000 000/mois)`);
  if (dex) console.log(`--dex : retraduction ciblée de ${todo.length}/${dex.size} carte(s) au statut ${status} — purge de leurs lignes dans ${locale}.jsonl et ${locale}.whenwhere.jsonl à l'écriture`);

  if (!apply) {
    console.log("\n(DRY-RUN — aucun appel réseau. Relancer avec --apply.)");
    return;
  }
  if (!AZ_KEY && !noMt) {
    console.error("\nAZURE_TRANSLATOR_KEY manquante dans .env.");
    process.exit(1);
  }
  if (!todo.length) {
    console.log("\nRien à faire (tout est déjà staged).");
    return;
  }

  if (wwKept) fs.writeFileSync(wwFile, wwKept.length ? wwKept.join("\n") + "\n" : ""); // purge where/when (--dex)
  const allLines = [...existing];
  let done = 0;
  for (let i = 0; i < todo.length; i += CARDS_PER_CHUNK) {
    const chunk = todo.slice(i, i + CARDS_PER_CHUNK);
    const flat: { ci: number; field: ProseField; text: string }[] = [];
    chunk.forEach((c, ci) => {
      const fr = c.display.locales.fr as Record<string, unknown>;
      for (const f of PROSE_FIELDS) {
        const text = String(fr[f] ?? "");
        if (text) flat.push({ ci, field: f, text }); // teaser absent → pas de segment
      }
    });
    // --no-mt : chemin par défaut depuis le 2026-10-25 — l'agent de l'étape 2 traduit TOUT depuis
    // le FR (titre + prose via `fixes`). Prose staged vide : un champ oublié par l'agent reste ""
    // et validateTranslatedLocale le rejette au merge (jamais de FR ni de MT publié par défaut).
    const translated = noMt ? flat.map(() => "") : await mtTranslate(flat.map((x) => x.text), target);
    const prose: Record<string, string>[] = chunk.map(() => ({}));
    flat.forEach((x, k) => {
      prose[x.ci]![x.field] = translated[k] ?? "";
    });
    for (let ci = 0; ci < chunk.length; ci++) {
      const c = chunk[ci]!;
      const fr = c.display.locales.fr as Record<string, unknown>;
      allLines.push(
        JSON.stringify({ dexNum: c.dexNum, file: c._file, tag: c.canonical.time.tag, prose: prose[ci], frWhere: fr.wherePrompt, frWhen: fr.whenPrompt }),
      );
    }
    fs.writeFileSync(outFile, allLines.join("\n") + "\n"); // persiste après CHAQUE chunk → reprise
    done += chunk.length;
    console.log(`  …${done}/${todo.length} cartes staged`);
  }

  console.log(`\n✓ ${done} cartes traduites (prose) → ${path.relative(process.cwd(), outFile)} (${allLines.length} au total)`);
  console.log(`Étape suivante : pass LLM where/when → merge dans display.locales.${locale} → npm run push:db`);
}

void main();
