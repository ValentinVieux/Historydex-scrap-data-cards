#!/usr/bin/env -S tsx
// Wipe complet de la table `cards` ET du storage `$files` en InstantDB.
//
// ⚠️ DESTRUCTIF ET IRRÉVERSIBLE. Toutes les cartes ET tous les fichiers
// (originaux + thumbnails) en production sont supprimés. Il faut taper
// "WIPE" à la main pour confirmer.
//
// Usage typique : juste avant le premier `npm run push:db` après la refonte,
// pour repartir d'une base propre avec contentVersion + imageHash sur toutes
// les cartes (et sans fichiers orphelins en storage).
//
// Usage :
//   npm run wipe-db

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db } from "./_lib/instantdb-client.js";

// Borne haute par transaction. InstantDB peut refuser une transaction trop
// grosse — on découpe par lots si la DB en contient beaucoup.
const BATCH_SIZE = 500;

async function deleteInBatches<T extends { id: string }>(
  entities: T[],
  txFor: (id: string) => unknown,
  label: string,
): Promise<void> {
  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const slice = entities.slice(i, i + BATCH_SIZE);
    const ops = slice.map((e) => txFor(e.id));
    await db.transact(ops as Parameters<typeof db.transact>[0]);
    console.log(`  · ${label} : ${Math.min(i + BATCH_SIZE, entities.length)} / ${entities.length}`);
  }
}

async function main(): Promise<number> {
  console.log("⚠️  WIPE DB — opération destructive et irréversible.\n");

  // 1. Compte ce qui va être supprimé.
  const [cardsResult, filesResult] = await Promise.all([
    db.query({ cards: {} }),
    db.query({ $files: {} }),
  ]);
  const cards = (cardsResult.cards ?? []) as Array<{ id: string; dexNum?: string }>;
  const files = (filesResult.$files ?? []) as Array<{ id: string; path?: string }>;

  console.log(`Cartes actuellement en DB : ${cards.length}`);
  console.log(`Fichiers en storage       : ${files.length}`);
  if (cards.length === 0 && files.length === 0) {
    console.log("\nRien à wiper. Sortie.");
    return 0;
  }
  if (cards.length > 0) {
    console.log(`  · cartes (max 5) : ${cards.slice(0, 5).map((c) => c.dexNum ?? c.id).join(", ")}`);
  }
  if (files.length > 0) {
    console.log(`  · fichiers (max 5) : ${files.slice(0, 5).map((f) => f.path ?? f.id).join(", ")}`);
  }

  // 2. Double confirmation : taper WIPE à la main.
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `\nTape "WIPE" (en majuscules) pour confirmer la suppression de ${cards.length} carte(s) et ${files.length} fichier(s) :\n> `,
  );
  rl.close();

  if (answer.trim() !== "WIPE") {
    console.log("\nConfirmation invalide. Rien supprimé.");
    return 1;
  }

  // 3. Suppression. Cartes d'abord (libère les liens vers $files), puis
  //    fichiers. Par lots pour éviter des transactions trop grosses.
  if (cards.length > 0) {
    console.log(`\nSuppression de ${cards.length} carte(s)…`);
    await deleteInBatches(cards, (id) => db.tx.cards[id]!.delete(), "cards");
  }
  if (files.length > 0) {
    console.log(`\nSuppression de ${files.length} fichier(s) storage…`);
    await deleteInBatches(files, (id) => db.tx.$files[id]!.delete(), "$files");
  }

  console.log(`\n✓ ${cards.length} carte(s) + ${files.length} fichier(s) supprimés. DB propre.`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("\n✗ Échec wipe-db :", err);
  process.exit(1);
});
