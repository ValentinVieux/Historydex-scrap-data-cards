#!/usr/bin/env -S tsx
// CLI : push intelligent vers InstantDB.
//
// Charge les cartes locales à editorial.status="approved", diff vs DB, push
// uniquement le delta. Toute la logique vit dans scripts/_lib/push-db.ts
// (réutilisée par l'endpoint POST /api/push-db du review-server).
//
// Usage :
//   npm run push:db                       # diff + push delta
//   npm run push:db -- --dry-run          # diff seulement, sans push
//   npm run push:db -- --max-dex 120      # ne pousse que dexNum ≤ 120
//   npm run push:db -- --next 50          # publie les 50 prochaines cartes approuvées absentes de la base (hebdo)
//   npm run push:db -- --allow-untranslated  # pousse même si des cartes n'ont
//                                            # pas toutes leurs locales cibles
//
// Pré-requis :
//   - .env avec EXPO_PUBLIC_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN
//   - Schéma DB à jour (contentVersion + imageHash sur l'entité cards).
//     Si ce n'est pas le cas : cd ../app/historydex && npx instant-cli push schema

import { computeDiff, pushDelta, type PushProgress } from "./_lib/push-db.js";
import { db } from "./_lib/instantdb-client.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS } from "./_lib/io.js";
import { linksPayload, loadLinks } from "./_lib/links.js";

function parseArgs(): { dryRun: boolean; maxDex: number | undefined; retranslate: boolean; allowUntranslated: boolean; next: number | undefined } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  // Force le ré-envoi des cardTranslations même si la version correspond (la
  // détection de "stale" est sinon version-only → un fix de contenu dérivé comme
  // `country` ne repartirait pas). Idempotent (cardTranslationId).
  const retranslate = args.includes("--retranslate");
  // Bypass du gate traduction (pousse même si des cartes manquent une locale cible).
  const allowUntranslated = args.includes("--allow-untranslated");
  const maxDexArg = args.find((a) => a === "--max-dex" || a.startsWith("--max-dex="));
  let maxDex: number | undefined;
  if (maxDexArg) {
    let val: string | undefined;
    if (maxDexArg.includes("=")) {
      val = maxDexArg.split("=")[1];
    } else {
      const idx = args.indexOf(maxDexArg);
      val = args[idx + 1];
    }
    if (!val || !/^\d+$/.test(val)) {
      console.error(`--max-dex demande une valeur entière (reçu: ${val ?? "rien"})`);
      process.exit(2);
    }
    maxDex = parseInt(val, 10);
  }
  // --next N : publie les N prochaines cartes approuvées absentes de la base
  // (publication hebdomadaire). Résolu en --max-dex dans main().
  const nextIdx = args.indexOf("--next");
  const next = nextIdx >= 0 ? Number(args[nextIdx + 1]) : undefined;
  if (next != null && !(Number.isInteger(next) && next > 0)) {
    console.error(`--next demande un entier > 0 (reçu: ${args[nextIdx + 1] ?? "rien"})`);
    process.exit(2);
  }
  return { dryRun, maxDex, retranslate, allowUntranslated, next };
}

function fmtDexList(arr: Array<{ dexNum: string }>, limit = 5): string {
  const head = arr.slice(0, limit).map((x) => x.dexNum).join(", ");
  return arr.length > limit ? `${head}, … (+${arr.length - limit})` : head;
}

async function main(): Promise<number> {
  const { dryRun, retranslate, allowUntranslated, next } = parseArgs();
  let { maxDex } = parseArgs();
  if (next != null) {
    // Les N plus petits dexNum approuvés absents de la base → borne --max-dex.
    // ponytail: un second computeDiff (lecture DB en double), acceptable une fois par semaine.
    const all = await computeDiff({});
    const pending = all.toCreate.map((c) => Number(c.dexNum)).sort((a, b) => a - b);
    if (pending.length === 0) {
      console.log("[push:db] --next : aucune carte approuvée en attente de publication.");
      return 0;
    }
    maxDex = pending[Math.min(next, pending.length) - 1];
    console.log(`[push:db] --next ${next} : ${Math.min(next, pending.length)} carte(s) à publier (${pending[0]}…${maxDex}), ${Math.max(0, pending.length - next)} restante(s) ensuite.`);
  }

  console.log(`[push:db] ${dryRun ? "DRY-RUN — aucun changement réel ne sera poussé." : "Push effectif vers InstantDB."}`);
  if (maxDex != null) console.log(`[push:db] Restriction --max-dex ${maxDex}`);
  if (retranslate) console.log(`[push:db] --retranslate : ré-envoi forcé de TOUTES les traductions présentes.`);

  console.log("\nCalcul du diff…");
  const diff = await computeDiff({ maxDex, forceTranslations: retranslate });

  // Rapport diff.
  console.log("\nDiff vs DB :");
  console.log(`  · ${diff.toCreate.length.toString().padStart(4)} cartes à créer    : ${fmtDexList(diff.toCreate) || "—"}`);
  console.log(`  · ${diff.toUpdateText.length.toString().padStart(4)} mises à jour texte: ${fmtDexList(diff.toUpdateText.map((u) => ({ dexNum: u.flat.dexNum }))) || "—"}`);
  console.log(`  · ${diff.toUploadImage.length.toString().padStart(4)} images à uploader : ${fmtDexList(diff.toUploadImage) || "—"}`);
  console.log(`  · ${diff.unchanged.toString().padStart(4)} cartes inchangées (skip)`);
  const transByLoc = diff.toPushTranslations.reduce(
    (m, t) => m.set(t.locale, (m.get(t.locale) ?? 0) + 1),
    new Map<string, number>(),
  );
  const transStr = [...transByLoc].map(([l, n]) => `${l}:${n}`).join(", ") || "—";
  console.log(`  · ${diff.toPushTranslations.length.toString().padStart(4)} traductions à pousser : ${transStr}`);
  if (diff.translationRejects.length > 0) {
    console.log(`  · ${diff.translationRejects.length.toString().padStart(4)} traductions REJETÉES (validation) :`);
    for (const r of diff.translationRejects.slice(0, 15)) console.log(`       ${r}`);
    if (diff.translationRejects.length > 15) console.log(`       … +${diff.translationRejects.length - 15}`);
  }
  if (diff.untranslated.length > 0) {
    console.warn(
      `\n⚠️  ${diff.untranslated.length} carte(s) approuvée(s) sans toutes leurs traductions ` +
        `(partiraient en FR seul) :`,
    );
    for (const u of diff.untranslated.slice(0, 15)) console.warn(`       ${u.dexNum} → manque ${u.missing.join(", ")}`);
    if (diff.untranslated.length > 15) console.warn(`       … +${diff.untranslated.length - 15}`);
    console.warn(
      allowUntranslated
        ? "   → --allow-untranslated : le push continuera malgré tout."
        : "   → lance `/translate-cards-mt` avant le push (ou --allow-untranslated pour forcer). Le push réel sera REFUSÉ.",
    );
  }

  if (diff.countryFallbacks.length > 0) {
    console.warn(`\n⚠️  ${diff.countryFallbacks.length} country fallback(s) :`);
    for (const c of diff.countryFallbacks) console.warn(`     ${c}`);
    console.warn("   → ajoute le countryCode dans scripts/_lib/country-fr.ts pour propre.");
  }

  if (diff.warnings.length > 0) {
    console.warn(`\n⚠️  ${diff.warnings.length} avertissement(s) :`);
    for (const w of diff.warnings) console.warn(`     ${w}`);
  }

  const totalToDo =
    diff.toCreate.length + diff.toUpdateText.length + diff.toUploadImage.length + diff.toPushTranslations.length;
  if (totalToDo === 0) {
    console.log("\n✓ Rien à pousser.");
    return 0;
  }

  if (dryRun) {
    console.log("\n(dry-run : aucun push effectué. Relance sans --dry-run pour pousser.)");
    return 0;
  }

  // Push effectif avec progression simple.
  console.log("\nPush en cours…");
  let lastPhase = "";
  const onProgress = (p: PushProgress) => {
    if (p.phase !== lastPhase) {
      lastPhase = p.phase;
      console.log(`  [${p.phase}] ${p.processed}/${p.total}${p.lastDexNum ? ` (dexNum ${p.lastDexNum})` : ""}`);
    } else if (p.phase === "image" && p.lastDexNum) {
      // Tick par image (ligne dédiée pour suivre les uploads).
      process.stdout.write(`    · ${p.lastDexNum} … `);
    }
  };

  const result = await pushDelta(diff, { dryRun: false, onProgress, allowUntranslated });

  if (result.errors.length > 0) {
    console.error(`\n✗ ${result.errors.length} erreur(s) durant le push :`);
    for (const e of result.errors) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`\n✓ ${result.pushed} item(s) poussé(s). Rien d'autre à faire.`);
  return 0;
}

// Relevé de la file de publication hebdo → pushWatermarks.cardQueue, lu par le site de stats
// (app : lib/admin/contentRunway.ts, section « Le contenu »). Runs réels seulement, best-effort :
// un échec ici ne fait pas échouer le push.
const PUSH_WATERMARK_ID = "b0a70000-0000-4000-8000-c00000000002"; // miroir de ../app/historydex/scripts/send-new-card-push.ts
const WEEKLY_LOT = 50; // miroir de scripts/weekly-publish.cmd (--next 50)

/** Prochain lundi 9 h (heure locale du PC, cf. tâche planifiée) en 'YYYY-MM-DD'. */
function nextPublishKey(now = new Date()): string {
  const d = new Date(now);
  const add = (8 - d.getDay()) % 7; // 0 = lundi
  d.setDate(d.getDate() + (add === 0 && d.getHours() >= 9 ? 7 : add));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function recordQueue(): Promise<void> {
  try {
    const d = await computeDiff({});
    const incomplete = new Set(d.untranslated.map((u) => u.dexNum));
    const pending = d.toCreate.map((c) => c.dexNum).sort((a, b) => Number(a) - Number(b));
    const ready = pending.filter((n) => !incomplete.has(n));
    const lot = ready.slice(0, WEEKLY_LOT);
    const inPrep = loadCardsFromDir(PATHS.cards).cards.filter((c) => c.data.editorial.status === "reviewed").length;
    const cardQueue = {
      ready: ready.length,
      incomplete: pending.length - ready.length,
      inPrep,
      lotSize: WEEKLY_LOT,
      nextLot: lot.length ? `${lot[0]}–${lot[lot.length - 1]}` : null,
      nextPublishKey: nextPublishKey(),
      updatedAt: Date.now(),
    };
    await db.transact([db.tx.pushWatermarks[PUSH_WATERMARK_ID]!.update({ cardQueue })]);
    console.log(`[push:db] File relevée pour le site de stats : ${cardQueue.ready} prêtes, ${cardQueue.inPrep} en préparation.`);
  } catch (err) {
    console.warn(`[push:db] File de publication non relevée (site de stats) : ${(err as Error).message}`);
  }
}

// Registre des séries/relations (catalog/links.json) → catalogStats.links, lu par l'app
// (lib/links). Filtré aux cartes PUBLIÉES : une série ne montre que ce que le joueur peut
// collectionner (elle grandit avec la publication hebdo). Écrit seulement si le contenu
// change. Best-effort, runs réels seulement.
const CATALOG_STATS_ID = "ca7a1057-0000-4000-8000-c00000000001"; // miroir de scripts/_lib/push-db.ts

async function syncLinks(): Promise<void> {
  try {
    const res = await db.query({
      cards: { $: { fields: ["dexNum"], limit: 100_000 } },
      catalogStats: { $: { where: { id: CATALOG_STATS_ID }, fields: ["links"] } },
    });
    const published = new Set((res.cards ?? []).map((c) => String((c as { dexNum: string }).dexNum)));
    const payload = linksPayload(loadLinks(), published);
    const current = (res.catalogStats?.[0] as { links?: { series?: unknown; relations?: unknown } } | undefined)?.links;
    if (JSON.stringify({ series: current?.series, relations: current?.relations }) === JSON.stringify(payload)) return;
    await db.transact([db.tx.catalogStats[CATALOG_STATS_ID]!.update({ links: { ...payload, updatedAt: Date.now() } })]);
    console.log(`[push:db] Séries publiées : ${payload.series.length} séries, ${payload.relations.length} relations.`);
  } catch (err) {
    console.warn(`[push:db] Séries non publiées : ${(err as Error).message}`);
  }
}

main()
  .then(async (code) => {
    if (code === 0 && !parseArgs().dryRun) await syncLinks();
    if (code === 0 && !parseArgs().dryRun) await recordQueue();
    process.exit(code);
  })
  .catch((err) => {
    console.error("\n✗ Échec push:db :", err);
    process.exit(1);
  });
