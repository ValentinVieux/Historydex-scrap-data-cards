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
//
// Pré-requis :
//   - .env avec EXPO_PUBLIC_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN
//   - Schéma DB à jour (contentVersion + imageHash sur l'entité cards).
//     Si ce n'est pas le cas : cd ../app/historydex && npx instant-cli push schema

import { computeDiff, pushDelta, type PushProgress } from "./_lib/push-db.js";

function parseArgs(): { dryRun: boolean; maxDex: number | undefined; retranslate: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  // Force le ré-envoi des cardTranslations même si la version correspond (la
  // détection de "stale" est sinon version-only → un fix de contenu dérivé comme
  // `country` ne repartirait pas). Idempotent (cardTranslationId).
  const retranslate = args.includes("--retranslate");
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
  return { dryRun, maxDex, retranslate };
}

function fmtDexList(arr: Array<{ dexNum: string }>, limit = 5): string {
  const head = arr.slice(0, limit).map((x) => x.dexNum).join(", ");
  return arr.length > limit ? `${head}, … (+${arr.length - limit})` : head;
}

async function main(): Promise<number> {
  const { dryRun, maxDex, retranslate } = parseArgs();

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

  const result = await pushDelta(diff, { dryRun: false, onProgress });

  if (result.errors.length > 0) {
    console.error(`\n✗ ${result.errors.length} erreur(s) durant le push :`);
    for (const e of result.errors) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`\n✓ ${result.pushed} item(s) poussé(s). Rien d'autre à faire.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("\n✗ Échec push:db :", err);
    process.exit(1);
  });
