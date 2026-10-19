// Génère display.locales.fr.teaser — la brève description visible PENDANT l'énigme — pour
// les cartes qui n'en ont pas. Essai validé le 2026-10-19 (8 cartes, maquette) : le blurb est
// écrit pour l'après-réponse et contient presque toujours un indice OÙ/QUAND ; le teaser est
// donc un champ dédié, rédigé sous une règle stricte (editorial-rules § « Teaser ») et contrôlé
// par le détecteur scripts/_lib/teaser-hint.ts (invariant `teaser-hint`).
//
// Trois modes, même règle, même détecteur, même écriture (saveCardFile = Zod + bump
// contentVersion, donc push:db re-pousse le texte et les lignes cardTranslations) :
//
//   A. API Claude (claude-opus-5-5, ANTHROPIC_API_KEY ou profil `ant auth login`) :
//      npm run generate-teasers                                   # dry-run : compte + estimation
//      npm run generate-teasers -- --apply                        # cartes approved+reviewed sans teaser
//      npm run generate-teasers -- --dex 3,115 --apply --force    # (re)générer exactement ces cartes
//      Boucle par carte : proposition → détecteur → si erreur, 2e passe avec le diagnostic →
//      si encore en erreur, carte laissée SANS teaser (warning `teaser-missing`).
//
//   B. Sous-agents (sans clé API) — le brief contient les règles + les fiches compactes :
//      npm run generate-teasers -- --brief data/_teasers/brief-0001.json --limit 60
//      → l'agent écrit data/_teasers/out-0001.jsonl ({"dexNum","teaser"} par ligne), puis :
//      npm run generate-teasers -- --import data/_teasers/out-0001.jsonl --apply
//      Les refus du détecteur vont dans <import>.rejects.jsonl (fiche + proposition + erreurs)
//      pour une 2e passe agent.
//
//   flags communs : --status approved|reviewed|both (both) · --limit N · --dex a,b · --force
//   mode A : --concurrency N (4)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { TEASER_MAX, TEASER_MIN, type Card } from "../schemas/card.schema.js";
import { countryNameFr } from "./_lib/country-fr.js";
import { PATHS, readJson } from "./_lib/io.js";
import { loadCardsFromDir, type LoadedCard } from "./_lib/load-cards.js";
import { saveCardFile } from "./_lib/save-card.js";
import { teaserHints, type TeaserContext } from "./_lib/teaser-hint.js";

const MODEL = "claude-opus-5-5";
// Tarif Opus 5.5 ($/M tokens) — estimation affichée, pas une facture.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

type Args = {
  apply: boolean; force: boolean; status: "approved" | "reviewed" | "both"; limit: number;
  concurrency: number; dex: Set<string> | null; brief: string | null; import: string | null;
};
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const val = (flag: string) => {
    const f = a.find((x) => x === flag || x.startsWith(`${flag}=`));
    if (!f) return undefined;
    return f.includes("=") ? f.split("=")[1] : a[a.indexOf(f) + 1];
  };
  const limit = Number(val("--limit") ?? Infinity);
  const concurrency = Number(val("--concurrency") ?? 4);
  const dexRaw = val("--dex") ?? "";
  return {
    apply: a.includes("--apply"),
    force: a.includes("--force"),
    status: (val("--status") as Args["status"]) ?? "both",
    limit: Number.isFinite(limit) ? limit : Infinity,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 4,
    dex: dexRaw ? new Set(dexRaw.split(",").map((s) => s.trim()).filter(Boolean)) : null,
    brief: val("--brief") ?? null,
    import: val("--import") ?? null,
  };
}

export const TEASER_RULES = `Tu rédiges le « teaser » des cartes du jeu HistoryDex : une brève description affichée au joueur PENDANT qu'il doit deviner OÙ et QUAND se situe le sujet de la carte. Le joueur ne voit que l'image, le titre et ce teaser. Le teaser doit l'aider à comprendre DE QUOI il s'agit — jamais à répondre.

Règles absolues :
1. Dis ce que c'est (portrait, charte, bataille navale, épidémie, machine, cité…) et pourquoi ça compte (enjeu, conséquence, portée), en une ou deux phrases, entre 90 et 180 caractères.
2. AUCUN indice de lieu : ni toponyme, ni pays, ville, fleuve, mer, continent, ni adjectif de nationalité ou de peuple (« chinois », « romain », « européenne », « viking », « maya »).
3. AUCUN indice de date : ni année, siècle, millénaire, décennie, ni mot d'époque ou de style (« antique », « médiéval », « gothique », « baroque », « moderne », « Renaissance », « guerre froide »).
4. AUCUN nom de personne (peintre, roi, général, savant, pape) ni de dynastie, d'empire ou de peuple nommé : un nom situe l'œuvre pour qui le connaît.
5. Les mots du TITRE sont autorisés (le joueur le voit déjà), mais ne répète pas le titre.
6. Un ordre de grandeur en toutes lettres est possible s'il ne date rien (« un tiers des habitants », « des millions de vies »). Jamais de chiffres arabes.
7. Ton neutre et pédagogique, présent de narration, vocabulaire courant compris par un adolescent. Pas d'adjectifs emphatiques (« célèbre », « légendaire », « incroyable »).
8. L'époque peut rester déductible par la nature du sujet (un pas sur la Lune, un laboratoire) : c'est acceptable. Ce qui est interdit, c'est de l'énoncer.

Exemples validés :
- Titre « La Joconde » → Portrait d'une femme au sourire énigmatique, peint à l'huile sur un panneau de bois. L'un des visages les plus reproduits de l'histoire de l'art.
- Titre « Bataille d'Actium » → Choc de deux flottes de guerre dont l'issue met fin à une longue guerre civile et donne à un seul homme le pouvoir sur un immense État.
- Titre « Confucius » → Maître à penser dont les leçons sur le respect, la vertu et le bon gouvernement ont façonné des sociétés entières pendant des siècles.
- Titre « Peste noire en Europe » → Épidémie qui emporte entre un tiers et la moitié des habitants d'un continent en quelques années, et bouleverse durablement toute la société.
- Titre « Magna Carta » → Texte par lequel de grands seigneurs révoltés imposent à leur roi des limites écrites à son pouvoir. Il inspire encore les constitutions d'aujourd'hui.`;

const SYSTEM = `${TEASER_RULES}\n\nRéponds UNIQUEMENT par le texte du teaser, sans guillemets ni commentaire.`;

function ctxOf(c: Card): TeaserContext {
  const fr = c.display.locales.fr;
  return { title: fr.title, placeLabel: fr.placeLabel, countryCode: c.canonical.place.countryCode, region: c.canonical.place.region };
}

function cardBrief(c: Card): string {
  const fr = c.display.locales.fr;
  const country = countryNameFr(c.canonical.place.countryCode) ?? "—";
  const forbidden = [...new Set([fr.placeLabel, country].join(" ").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 4))];
  return [
    `Titre : ${fr.title}`,
    `Type de carte : ${c.canonical.type}`,
    `Consigne OÙ : ${fr.wherePrompt.pre}${fr.wherePrompt.verb}${fr.wherePrompt.post}`,
    `Consigne QUAND : ${fr.whenPrompt.pre}${fr.whenPrompt.verb}${fr.whenPrompt.post}`,
    `Réponse OÙ (à ne PAS révéler) : ${fr.placeLabel} — ${country}`,
    `Réponse QUAND (à ne PAS révéler) : ${fr.timeDisplayLabel}`,
    `Blurb actuel (après-réponse, contient des indices à retirer) : ${fr.blurb}`,
    `Body (après-réponse) : ${fr.body}`,
    `Mots du lieu-réponse à éviter : ${forbidden.join(", ")}`,
  ].join("\n");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/^["“«]\s*|\s*["”»]$/g, "").trim();

/** Écrit le teaser dans le fichier carte (relecture fraîche, Zod, bump contentVersion). */
function persist(file: string, teaser: string): string | null {
  const raw = readJson<Card>(file);
  raw.display.locales.fr.teaser = teaser;
  const saved = saveCardFile(file, raw);
  return saved.ok ? null : saved.errors.map((e) => `${e.path}: ${e.message}`).join(" | ");
}

// ── Mode A : API Claude ───────────────────────────────────────────────────────
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const cost = (u: Usage) => (u.input * PRICE.input + u.output * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6;

async function propose(client: Anthropic, messages: Anthropic.Beta.BetaMessageParam[]): Promise<string> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
  usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
  if (res.stop_reason === "refusal") throw new Error(`refus du modèle (${res.stop_details?.category ?? "?"})`);
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
  return clean(text);
}

/** Propose un teaser, re-demande une fois avec le diagnostic si le détecteur voit une erreur. */
async function generateFor(client: Anthropic, c: Card): Promise<{ teaser: string; warnings: string[] } | { error: string }> {
  const ctx = ctxOf(c);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: cardBrief(c) }];
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await propose(client, messages);
    const hints = teaserHints(last, ctx);
    const errors = hints.filter((h) => h.severity === "error").map((h) => h.message);
    if (errors.length === 0) return { teaser: last, warnings: hints.map((h) => h.message) };
    messages.push(
      { role: "assistant", content: last },
      { role: "user", content: `Ta proposition contient encore des indices ou sort des bornes (${TEASER_MIN}-${TEASER_MAX} caractères) :\n- ${errors.join("\n- ")}\nRéécris-la en respectant toutes les règles. Réponds uniquement par le teaser.` },
    );
  }
  return { error: `toujours en erreur après 2 passes — dernière proposition : « ${last} »` };
}

async function runApi(todo: LoadedCard[], args: Args) {
  console.log(`estimation : ~$${(todo.length * 0.012).toFixed(2)} (≈ 1 500 tokens entrée + 150 sortie par carte, effort low)`);
  if (!args.apply) {
    console.log("\n(DRY-RUN — aucun appel API. Relancer avec --apply.)");
    return;
  }
  if (!todo.length) return;

  // Le SDK résout lui-même la clé : ANTHROPIC_API_KEY (.env) → ANTHROPIC_AUTH_TOKEN →
  // profil `ant auth login`. Une AuthenticationError est remontée par carte ci-dessous.
  const client = new Anthropic({ maxRetries: 5 });
  let next = 0;
  let ok = 0;
  const failed: string[] = [];
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= todo.length) return;
      const { file, data: c } = todo[i]!;
      const label = `${c.dexNum} ${c.display.locales.fr.title}`;
      try {
        const r = await generateFor(client, c);
        if ("error" in r) {
          failed.push(`${label} — ${r.error}`);
          console.log(`  ✗ ${label} — ${r.error}`);
          continue;
        }
        const err = persist(file, r.teaser);
        if (err) {
          failed.push(`${label} — Zod : ${err}`);
          continue;
        }
        ok++;
        console.log(`  ✓ ${label} — ${r.teaser}${r.warnings.length ? `\n      ⚠ ${r.warnings.join(" · ")}` : ""}`);
      } catch (err) {
        const msg = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : (err as Error).message;
        failed.push(`${label} — ${msg}`);
        console.log(`  ✗ ${label} — ${msg}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, todo.length) }, worker));

  console.log(`\n✓ ${ok}/${todo.length} teasers écrits · ${failed.length} échec(s)`);
  console.log(`tokens : entrée ${usage.input} · sortie ${usage.output} · cache lu ${usage.cacheRead} / écrit ${usage.cacheWrite} → ~$${cost(usage).toFixed(2)}`);
  if (failed.length) {
    console.log(`\nÀ rédiger à la main (app de review, champ teaser) :`);
    for (const f of failed) console.log(`  - ${f}`);
  }
  console.log(`\nÉtapes suivantes : npm run validate · npx tsx scripts/translate-teasers.ts all --apply · npm run push:db -- --dry-run`);
}

// ── Mode B : brief pour sous-agent / import de ses propositions ──────────────
function writeBrief(todo: LoadedCard[], out: string) {
  const payload = {
    rules: TEASER_RULES,
    output: "Une ligne JSON par carte : {\"dexNum\":\"003\",\"teaser\":\"…\"} — rien d'autre dans le fichier.",
    cards: todo.map(({ data: c }) => ({ dexNum: c.dexNum, title: c.display.locales.fr.title, brief: cardBrief(c) })),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`✓ brief écrit : ${out} (${todo.length} cartes)`);
}

function importProposals(file: string, byDex: Map<string, LoadedCard>, args: Args) {
  const lines = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  let ok = 0;
  const rejects: Array<{ dexNum: string; title: string; brief: string; proposal: string; errors: string[] }> = [];
  const unknown: string[] = [];
  for (const line of lines) {
    let row: { dexNum?: string; teaser?: string };
    try {
      row = JSON.parse(line);
    } catch {
      unknown.push(line.slice(0, 60));
      continue;
    }
    const loaded = row.dexNum ? byDex.get(row.dexNum) : undefined;
    if (!loaded || typeof row.teaser !== "string") {
      unknown.push(line.slice(0, 60));
      continue;
    }
    const c = loaded.data;
    if (c.display.locales.fr.teaser && !args.force) continue; // déjà fait (idempotent)
    const teaser = clean(row.teaser);
    const hints = teaserHints(teaser, ctxOf(c));
    const errors = hints.filter((h) => h.severity === "error").map((h) => h.message);
    const label = `${c.dexNum} ${c.display.locales.fr.title}`;
    if (errors.length) {
      rejects.push({ dexNum: c.dexNum, title: c.display.locales.fr.title, brief: cardBrief(c), proposal: teaser, errors });
      console.log(`  ✗ ${label} — ${errors.join(" · ")}\n      « ${teaser} »`);
      continue;
    }
    const warnings = hints.map((h) => h.message);
    if (args.apply) {
      const err = persist(loaded.file, teaser);
      if (err) {
        rejects.push({ dexNum: c.dexNum, title: c.display.locales.fr.title, brief: cardBrief(c), proposal: teaser, errors: [`Zod : ${err}`] });
        continue;
      }
    }
    ok++;
    console.log(`  ✓ ${label} — ${teaser}${warnings.length ? `\n      ⚠ ${warnings.join(" · ")}` : ""}`);
  }
  console.log(`\n${args.apply ? "écrits" : "acceptés (dry-run)"} : ${ok} · refusés par le détecteur : ${rejects.length} · lignes inconnues : ${unknown.length}`);
  const rejectsFile = `${file}.rejects.jsonl`;
  if (rejects.length) {
    fs.writeFileSync(rejectsFile, rejects.map((r) => JSON.stringify(r)).join("\n") + "\n");
    console.log(`→ ${rejectsFile} (fiche + proposition + erreurs) pour une 2e passe agent`);
  } else if (fs.existsSync(rejectsFile)) {
    fs.unlinkSync(rejectsFile); // un ré-import propre efface les refus d'une passe précédente
  }
  if (unknown.length) console.log(`lignes ignorées : ${unknown.join(" | ")}`);
}

function main() {
  const args = parseArgs();
  const loaded = loadCardsFromDir(PATHS.cards);
  if (loaded.issues.length) console.warn(`⚠ ${loaded.issues.length} fichier(s) invalide(s) ignoré(s) (npm run validate pour le détail)`);
  const byDex = new Map(loaded.cards.map((l) => [l.data.dexNum, l] as const));
  if (args.import) {
    importProposals(args.import, byDex, args);
    return;
  }
  const wantStatus = (s: string) => (args.status === "both" ? s === "approved" || s === "reviewed" : s === args.status);
  const todo = loaded.cards
    .filter(({ data: c }) => (args.dex ? args.dex.has(c.dexNum) : wantStatus(c.editorial.status)))
    .filter(({ data: c }) => args.force || !c.display.locales.fr.teaser)
    .sort((a, b) => Number(a.data.dexNum) - Number(b.data.dexNum))
    .slice(0, args.limit);
  console.log(`cartes à traiter : ${todo.length} (status=${args.status}${args.dex ? `, dex=${[...args.dex].join(",")}` : ""}${args.force ? ", force" : ""})`);
  if (args.brief) {
    writeBrief(todo, args.brief);
    return;
  }
  void runApi(todo, args);
}

main();
