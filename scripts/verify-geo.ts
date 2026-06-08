#!/usr/bin/env -S tsx
// Audit géographique advisoire : recoupe (lat,lon) de chaque carte avec le lieu
// nommé géocodé via Nominatim. Produit reports/geo-verify-<ts>.md trié par écart.
//
// NON bloquant (exit 0 sauf erreur interne) : le géocodage des lieux anciens est
// faillible. C'est un signal pour l'agent card-qa / l'humain, pas une vérité.
//
// Usage :
//   npm run verify-geo                 # tout le catalogue (≈1 s/carte)
//   npm run verify-geo -- --card stonehenge
//   npm run verify-geo -- --max-dex 50 # cercle 1 seulement
//   npm run verify-geo -- --force      # ignore le cache disque
import path from "node:path";
import { loadCardsFromDir, basenameNoExt } from "./_lib/load-cards.js";
import { PATHS, nowStamp, writeText } from "./_lib/io.js";
import { geocode, haversineKm } from "./_lib/geocode.js";

// Seuil d'alerte (km) par placeKind : serré pour les lieux ponctuels (attrape une
// erreur "bonne région / mauvaise ville" type Stonehenge à ~85 km), large pour les
// zones diffuses (où un point unique géocodé a peu de sens).
const FLAG_KM: Record<string, number> = {
  birth_place: 75,
  death_place: 75,
  creation_place: 75,
  construction_site: 75,
  signature_place: 75,
  current_exhibition: 75,
  discovery_site: 75,
  publication_place: 120,
  landing_site: 150,
  battle_site: 150,
  capital_or_power_center: 600,
  diffusion_area: 800,
  origin_area: 800,
  symbolic_location: 600,
  other: 400,
};
const threshold = (placeKind: string): number => FLAG_KM[placeKind] ?? 300;

function parseArgs() {
  const args = process.argv.slice(2);
  let card: string | null = null;
  let maxDex: number | null = null;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--card") card = args[++i] ?? null;
    else if (args[i] === "--max-dex") maxDex = parseInt(args[++i] ?? "", 10);
    else if (args[i] === "--force") force = true;
  }
  return { card, maxDex, force };
}

type Row = {
  dexNum: string;
  id: string;
  placeKind: string;
  query: string;
  cardLat: number;
  cardLon: number;
  geoLat: number | null;
  geoLon: number | null;
  dist: number | null;
  threshold: number;
  status: "flag" | "ok" | "notfound";
  displayName: string | null;
};

async function main(): Promise<number> {
  const { card, maxDex, force } = parseArgs();
  const { cards } = loadCardsFromDir(PATHS.cards);

  let selected = cards.filter((c) => c.data.canonical.place.geoKind === "earth");
  if (card) selected = selected.filter((c) => c.data.id === card || basenameNoExt(c.file) === card);
  if (maxDex != null && !isNaN(maxDex)) selected = selected.filter((c) => Number(c.data.dexNum) <= maxDex);
  selected.sort((a, b) => Number(a.data.dexNum) - Number(b.data.dexNum));

  console.log(`Géocodage de ${selected.length} carte(s) via Nominatim (≥1 s/req, cache disque)…`);

  const rows: Row[] = [];
  for (const { data } of selected) {
    const place = data.canonical.place;
    // Requêtes de géocodage : placeCanonicalName + placeLabel UNIQUEMENT — jamais
    // wikipediaTitle, qui est le nom du SUJET (personne « Shen Kuo », œuvre « Tao Te
    // King ») et géocode vers n'importe quoi. On nettoie les parenthèses
    // (« Damas (vieille ville) » → « Damas », qui sinon échoue dans Nominatim) et on
    // ajoute le 1er segment avant virgule (« Nankin (Nanjing), capitale Ming » → « Nankin »).
    const clean = (s: string) => s.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
    const candSet = new Set<string>();
    for (const raw of [place.placeCanonicalName, data.display.locales.fr.placeLabel]) {
      if (!raw || raw.trim().length === 0) continue;
      const c = clean(raw);
      if (c.length > 1) candSet.add(c);
      const first = clean(raw.split(",")[0] ?? "");
      if (first.length > 1) candSet.add(first);
    }
    const candidates = [...candSet];

    let usedQuery = candidates[0] ?? place.placeCanonicalName;
    let geoLat: number | null = null;
    let geoLon: number | null = null;
    let displayName: string | null = null;
    for (const q of candidates) {
      const r = await geocode(q, { force, countryCode: place.countryCode });
      usedQuery = q;
      if (r.found) {
        geoLat = r.lat;
        geoLon = r.lon;
        displayName = r.displayName;
        break;
      }
    }

    const th = threshold(place.placeKind);
    if (geoLat == null || geoLon == null) {
      rows.push({ dexNum: data.dexNum, id: data.id, placeKind: place.placeKind, query: usedQuery, cardLat: place.lat, cardLon: place.lon, geoLat: null, geoLon: null, dist: null, threshold: th, status: "notfound", displayName: null });
      continue;
    }
    const dist = haversineKm(place.lat, place.lon, geoLat, geoLon);
    rows.push({ dexNum: data.dexNum, id: data.id, placeKind: place.placeKind, query: usedQuery, cardLat: place.lat, cardLon: place.lon, geoLat, geoLon, dist, threshold: th, status: dist > th ? "flag" : "ok", displayName });
  }

  const flagged = rows.filter((r) => r.status === "flag").sort((a, b) => (b.dist ?? 0) - (a.dist ?? 0));
  const notfound = rows.filter((r) => r.status === "notfound");
  const okCount = rows.filter((r) => r.status === "ok").length;

  const lines: string[] = [];
  lines.push(`# Geo-verify report — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- Cartes géocodées : **${rows.length}**  (ok=${okCount}, flag=${flagged.length}, non géocodées=${notfound.length})`);
  lines.push("");
  lines.push("## ⚠️ Écarts à arbitrer (distance carte ↔ lieu géocodé > seuil)");
  lines.push("");
  if (flagged.length === 0) {
    lines.push("_(aucun)_");
  } else {
    lines.push("| dex | carte | placeKind | écart km | seuil | requête géocodée | lieu OSM trouvé |");
    lines.push("|---|---|---|---:|---:|---|---|");
    for (const r of flagged) {
      lines.push(`| ${r.dexNum} | ${r.id} | ${r.placeKind} | **${Math.round(r.dist!)}** | ${r.threshold} | ${r.query} | ${r.displayName ?? ""} |`);
    }
  }
  lines.push("");
  lines.push("## Non géocodées (lieu ancien/abstrait — vérification humaine)");
  lines.push("");
  if (notfound.length === 0) {
    lines.push("_(aucune)_");
  } else {
    for (const r of notfound) lines.push(`- ${r.dexNum} ${r.id} (${r.placeKind}) — requête : « ${r.query} »`);
  }
  lines.push("");

  const reportFile = path.join(PATHS.reports, `geo-verify-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));

  console.log(`OK=${okCount}  FLAG=${flagged.length}  non-géocodées=${notfound.length}`);
  if (flagged.length > 0) {
    console.log("\n=== ÉCARTS (à arbitrer) ===");
    for (const r of flagged) console.log(`  [${Math.round(r.dist!)} km > ${r.threshold}] ${r.dexNum} ${r.id} (${r.placeKind}) — « ${r.query} » → ${r.displayName ?? "?"}`);
  }
  console.log(`\nRapport : ${path.relative(process.cwd(), reportFile)}`);
  return 0;
}

main().then((code) => process.exit(code));
