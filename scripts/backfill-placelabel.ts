// One-shot : backfill de `placeLabel` (cards + cardTranslations) en DB depuis
// les JSON locaux (data/cards/). Nécessaire parce que push:db ne diffe que sur
// contentVersion — les cartes déjà en DB ne recevraient jamais la nouvelle
// colonne sans re-bump artificiel. Idempotent : ne réécrit que les valeurs
// manquantes ou divergentes.
//
// Les lignes cardTranslations `en` (backfillées côté app, absentes des JSON)
// restent sans placeLabel — l'app retombe sur la colonne source (fallback voulu).
//
// Usage :
//   npx tsx scripts/backfill-placelabel.ts            # dry-run (liste les updates)
//   npx tsx scripts/backfill-placelabel.ts --apply    # écrit en DB

import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS } from "./_lib/io.js";
import { db } from "./_lib/instantdb-client.js";
import { localeTextOf } from "./_lib/card-translations.js";

const apply = process.argv.includes("--apply");

async function main() {
  const all = loadCardsFromDir(PATHS.cards);
  if (all.issues.length > 0) {
    console.warn(`⚠️ ${all.issues.length} fichier(s) local(aux) invalide(s) — ignorés.`);
  }
  const byDex = new Map(
    all.cards
      .filter((c) => c.data.editorial.status === "approved")
      .map((c) => [c.data.dexNum, c.data] as const),
  );

  const res = await db.query({ cards: { translations: {} } });
  const dbCards = (res.cards ?? []) as Array<{
    id: string;
    dexNum?: string;
    placeLabel?: string | null;
    translations?: Array<{ id: string; locale?: string; placeLabel?: string | null }> | null;
  }>;

  const ops: Parameters<typeof db.transact>[0] = [];
  let cardsSet = 0;
  let transSet = 0;
  let noLocal = 0;

  for (const dbc of dbCards) {
    const local = dbc.dexNum ? byDex.get(dbc.dexNum) : undefined;
    if (!local) {
      noLocal++;
      continue;
    }
    const frLabel = local.display.locales.fr.placeLabel;
    if (dbc.placeLabel !== frLabel) {
      ops.push(db.tx.cards[dbc.id]!.update({ placeLabel: frLabel }));
      cardsSet++;
      console.log(`cards[${dbc.dexNum}] placeLabel → "${frLabel}"`);
    }
    for (const t of dbc.translations ?? []) {
      if (!t.locale) continue;
      const label = localeTextOf(local, t.locale)?.placeLabel;
      if (label && t.placeLabel !== label) {
        ops.push(db.tx.cardTranslations[t.id]!.update({ placeLabel: label }));
        transSet++;
        console.log(`cardTranslations[${dbc.dexNum}/${t.locale}] placeLabel → "${label}"`);
      }
    }
  }

  console.log(
    `\n${cardsSet} cards + ${transSet} cardTranslations à mettre à jour ` +
      `(${noLocal} carte(s) DB sans JSON local approved — ignorées).`,
  );
  if (!apply) {
    console.log("Dry-run — relance avec --apply pour écrire.");
    return;
  }
  const CHUNK = 100;
  for (let i = 0; i < ops.length; i += CHUNK) {
    await db.transact(ops.slice(i, i + CHUNK));
    console.log(`transact ${Math.min(i + CHUNK, ops.length)}/${ops.length}`);
  }
  console.log("Backfill terminé.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
