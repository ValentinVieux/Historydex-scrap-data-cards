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
//
// Requiert dans .env : AZURE_TRANSLATOR_KEY (+ AZURE_TRANSLATOR_REGION si ressource régionale).

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { targetLocales } from "./_lib/card-translations.js";

const PROSE_FIELDS = ["title", "blurb", "body", "placeLabel", "timeDisplayLabel"] as const;
type ProseField = (typeof PROSE_FIELDS)[number];

const AZURE_TO: Record<string, string> = { es: "es", de: "de", it: "it", en: "en", pt: "pt" };

const CARDS_DIR = path.resolve(process.cwd(), "data", "cards");
const STAGING_DIR = path.resolve(process.cwd(), "data", "_translations");

// Limites Azure : ≤ 1000 éléments ET ≤ 50 000 caractères/requête. On reste bien en dessous
// pour ménager le palier F0 (throttlé), et on traite les cartes par petits chunks.
const MAX_ELEMS = 900;
const MAX_CHARS = 25_000;
const CARDS_PER_CHUNK = 20; // ~100 segments / ~15k chars par chunk
const THROTTLE_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Args = { locale: string; limit: number; apply: boolean; status: "approved" | "reviewed" | "both" };
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const locale = a.find((x) => !x.startsWith("--")) ?? "";
  const limFlag = a.find((x) => x.startsWith("--limit"));
  const limit = limFlag ? Number(limFlag.split("=")[1] ?? a[a.indexOf(limFlag) + 1]) : Infinity;
  const statusFlag = a.find((x) => x.startsWith("--status"));
  const status = (statusFlag ? (statusFlag.split("=")[1] ?? a[a.indexOf(statusFlag) + 1]) : "approved") as Args["status"];
  return { locale, limit: Number.isFinite(limit) ? limit : Infinity, apply: a.includes("--apply"), status };
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

// ── Moteur MT : Azure AI Translator (avec backoff 429 + throttle) ────────────
const AZ_KEY = process.env.AZURE_TRANSLATOR_KEY ?? "";
const AZ_REGION = process.env.AZURE_TRANSLATOR_REGION ?? "";
const AZ_ENDPOINT = (process.env.AZURE_TRANSLATOR_ENDPOINT ?? "https://api.cognitive.microsofttranslator.com").replace(/\/$/, "");

async function translateBatch(batch: string[], target: string): Promise<string[]> {
  const url = `${AZ_ENDPOINT}/translate?api-version=3.0&from=fr&to=${target}&textType=plain`;
  const headers: Record<string, string> = { "Ocp-Apim-Subscription-Key": AZ_KEY, "Content-Type": "application/json" };
  if (AZ_REGION) headers["Ocp-Apim-Subscription-Region"] = AZ_REGION;
  const body = JSON.stringify(batch.map((t) => ({ Text: t })));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: "POST", headers, body });
    if (res.ok) {
      const data = (await res.json()) as { translations: { text: string }[] }[];
      return data.map((d) => d.translations[0]?.text ?? "");
    }
    if (res.status === 429 && attempt < 8) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 2_000 * 2 ** attempt);
      console.log(`  ⏳ 429 (limite F0) — attente ${Math.round(wait / 1000)}s…`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Azure ${res.status}: ${await res.text()}`);
  }
}

/** Traduit fr→target en respectant les limites de lot + throttle. */
async function mtTranslate(texts: string[], target: string): Promise<string[]> {
  const out: string[] = [];
  let batch: string[] = [];
  let batchChars = 0;
  const flush = async () => {
    if (!batch.length) return;
    out.push(...(await translateBatch(batch, target)));
    batch = [];
    batchChars = 0;
    await sleep(THROTTLE_MS);
  };
  for (const t of texts) {
    if (batch.length >= MAX_ELEMS || batchChars + t.length > MAX_CHARS) await flush();
    batch.push(t);
    batchChars += t.length;
  }
  await flush();
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-US");

async function main() {
  const { locale, limit, apply, status } = parseArgs();
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
  const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean) : [];
  const seen = new Set(existing.map((l) => JSON.parse(l).dexNum as string));

  // À traduire = bon statut, pas déjà traduit en amont (display.locales[loc]), pas déjà staged.
  const todo = all
    .filter((c) => wantStatus(c.editorial?.status) && !c.display?.locales?.[locale] && c.display?.locales?.fr && !seen.has(c.dexNum))
    .slice(0, limit);

  let chars = 0;
  for (const c of todo) {
    const fr = c.display.locales.fr as Record<string, unknown>;
    for (const f of PROSE_FIELDS) chars += String(fr[f] ?? "").length;
  }

  console.log(`locale=${locale} (Azure ${target}) · status=${status} · à traduire: ${todo.length} (déjà staged: ${seen.size})`);
  console.log(`prose à facturer: ~${fmt(chars)} caractères (palier gratuit Azure F0 = 2 000 000/mois)`);

  if (!apply) {
    console.log("\n(DRY-RUN — aucun appel réseau. Relancer avec --apply.)");
    return;
  }
  if (!AZ_KEY) {
    console.error("\nAZURE_TRANSLATOR_KEY manquante dans .env.");
    process.exit(1);
  }
  if (!todo.length) {
    console.log("\nRien à faire (tout est déjà staged).");
    return;
  }

  const allLines = [...existing];
  let done = 0;
  for (let i = 0; i < todo.length; i += CARDS_PER_CHUNK) {
    const chunk = todo.slice(i, i + CARDS_PER_CHUNK);
    const flat: { ci: number; field: ProseField; text: string }[] = [];
    chunk.forEach((c, ci) => {
      const fr = c.display.locales.fr as Record<string, unknown>;
      for (const f of PROSE_FIELDS) flat.push({ ci, field: f, text: String(fr[f] ?? "") });
    });
    const translated = await mtTranslate(flat.map((x) => x.text), target);
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
