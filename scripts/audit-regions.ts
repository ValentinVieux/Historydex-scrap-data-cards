#!/usr/bin/env -S tsx
// Audit géographique du catalogue : croise place.region (pipeline) avec
// la classification actuelle de l'app (regionFromCountryHit) pour identifier :
//
//   Liste A — cartes îliennes par pays détecté
//   Liste B — cartes orphelines (regionFromCountryHit = null) → eau / hors
//             polygone → cibles de la surcouche îles critiques
//   Liste C — cartes en désaccord : place.region (pipeline) ≠ région app
//             → bugs (ex. Hawaii) ou cartes à reclassifier
//   Liste D — divergences anneau (le centroïde du polygone touché diffère du
//             centroïde de la métropole) — candidats per-anneau pour Phase 2
//
// Sortie : reports/regions-audit-<ts>.md, plus un résumé console.

import path from "node:path";
import {
  countryHit,
  regionFromLatLon,
  regionLabel,
  type CountryHit,
  type RegionId,
} from "./_lib/region-geo.js";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS, ensureDir, nowStamp, writeText } from "./_lib/io.js";

type CardEntry = {
  dexNum: string;
  id: string;
  file: string;
  title: string;
  lat: number;
  lon: number;
  pipelineRegion: RegionId;
  countryCode: string | null;
  placeName: string;
  appRegion: RegionId | null;
  hit: CountryHit | null;
};

function main(): number {
  ensureDir(PATHS.cards);
  ensureDir(PATHS.reports);

  const result = loadCardsFromDir(PATHS.cards);
  if (result.cards.length === 0) {
    console.error(`No cards found in ${PATHS.cards}`);
    return 1;
  }

  const entries: CardEntry[] = result.cards.map(({ file, data }) => {
    const place = data.canonical.place;
    const hit = countryHit(place.lat, place.lon);
    return {
      dexNum: data.dexNum,
      id: data.id,
      file,
      title: data.display.locales.fr.title,
      lat: place.lat,
      lon: place.lon,
      pipelineRegion: place.region as RegionId,
      countryCode: place.countryCode ?? null,
      placeName: place.placeCanonicalName ?? "",
      appRegion: hit ? hit.region : null,
      hit,
    };
  });

  // ---------- Liste A — cartes regroupées par pays détecté ------------------
  // Groupe par (rawName, ringIndex) pour isoler les "morceaux" d'un pays
  // (US métropole vs Hawaii vs Alaska ; France métropole vs Guyane).
  const byCountryRing = new Map<string, CardEntry[]>();
  for (const e of entries) {
    if (!e.hit) continue;
    const key = `${e.hit.rawName}#${e.hit.ringIndex}`;
    const arr = byCountryRing.get(key) ?? [];
    arr.push(e);
    byCountryRing.set(key, arr);
  }
  const groupedCountryRings = Array.from(byCountryRing.entries())
    .map(([key, list]) => ({
      key,
      list,
      rawName: list[0].hit!.rawName,
      ringIndex: list[0].hit!.ringIndex,
      centroid: list[0].hit!.ringBboxCentroid,
      region: list[0].hit!.region,
    }))
    .sort((a, b) => {
      if (a.rawName !== b.rawName) return a.rawName.localeCompare(b.rawName);
      return a.ringIndex - b.ringIndex;
    });

  // ---------- Liste B — cartes orphelines (hors polygone) -------------------
  const orphans = entries
    .filter((e) => e.appRegion === null)
    .sort((a, b) => a.dexNum.localeCompare(b.dexNum));

  // ---------- Liste C — désaccord pipeline ≠ app ---------------------------
  const disagreements = entries
    .filter((e) => e.appRegion !== null && e.appRegion !== e.pipelineRegion)
    .sort((a, b) => a.dexNum.localeCompare(b.dexNum));

  // ---------- Liste D — anneau pourrait suggérer une autre région ----------
  // Pour chaque entrée hit, on compare la région courante (hit.region) à ce
  // que dirait regionFromLatLon(ring centroid). Si différent, c'est candidat
  // pour la doctrine per-anneau Phase 2.
  type RingDiverg = {
    rawName: string;
    ringIndex: number;
    countryRegion: RegionId;
    centroid: { lat: number; lon: number };
    proposedFromCentroid: RegionId | null;
    affectedCards: CardEntry[];
  };
  const ringMap = new Map<string, RingDiverg>();
  for (const e of entries) {
    if (!e.hit) continue;
    const centroidRegion = regionFromLatLon(
      e.hit.ringBboxCentroid.lat,
      e.hit.ringBboxCentroid.lon,
    );
    if (centroidRegion === e.hit.region) continue;
    const key = `${e.hit.rawName}#${e.hit.ringIndex}`;
    const existing = ringMap.get(key);
    if (existing) {
      existing.affectedCards.push(e);
    } else {
      ringMap.set(key, {
        rawName: e.hit.rawName,
        ringIndex: e.hit.ringIndex,
        countryRegion: e.hit.region,
        centroid: e.hit.ringBboxCentroid,
        proposedFromCentroid: centroidRegion,
        affectedCards: [e],
      });
    }
  }
  const ringDivergences = Array.from(ringMap.values()).sort(
    (a, b) => b.affectedCards.length - a.affectedCards.length,
  );

  // ---------- Markdown report -----------------------------------------------
  const lines: string[] = [];
  lines.push(`# Regions audit — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    `- Total cartes : **${entries.length}** (dont **${orphans.length}** orphelines, **${disagreements.length}** en désaccord pipeline≠app)`,
  );
  lines.push("");

  // Distribution
  lines.push("## Distribution (région pipeline vs région app actuelle)");
  lines.push("");
  lines.push("| Region | Label | Pipeline | App actuelle | Δ |");
  lines.push("|---:|---|---:|---:|---:|");
  for (let id = 1; id <= 10; id++) {
    const r = id as RegionId;
    const pipelineCount = entries.filter((e) => e.pipelineRegion === r).length;
    const appCount = entries.filter((e) => e.appRegion === r).length;
    const delta = appCount - pipelineCount;
    lines.push(
      `| ${id} | ${regionLabel(r)} | ${pipelineCount} | ${appCount} | ${delta >= 0 ? "+" : ""}${delta} |`,
    );
  }
  const orphanCount = orphans.length;
  lines.push(`| – | _orpheline (null)_ | – | ${orphanCount} | – |`);
  lines.push("");

  // Liste C
  lines.push("## Liste C — désaccord pipeline ≠ app actuelle");
  lines.push("");
  lines.push(
    "Cartes dont `place.region` (pipeline) diffère de `regionFromCountryHit(lat,lon)` (app). Chacune doit être résolue : soit la carte est mal classée côté pipeline, soit la classification app est buggée (ex. Hawaii via ISO USA).",
  );
  lines.push("");
  if (disagreements.length === 0) {
    lines.push("_(aucune)_");
  } else {
    lines.push("| Dex | Titre | Lieu | (lat,lon) | Pipeline | App | Pays/anneau détecté |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const e of disagreements) {
      lines.push(
        `| ${e.dexNum} | ${e.title} | ${e.placeName || "–"} | ${e.lat.toFixed(2)}, ${e.lon.toFixed(2)} | R${e.pipelineRegion} ${regionLabel(e.pipelineRegion)} | R${e.appRegion} ${regionLabel(e.appRegion!)} | ${e.hit!.rawName} #${e.hit!.ringIndex} |`,
      );
    }
  }
  lines.push("");

  // Liste B
  lines.push("## Liste B — cartes orphelines (regionFromCountryHit = null)");
  lines.push("");
  lines.push(
    "Le tap sur ces coordonnées **ne valide aucun pays** côté app (eau, île trop petite pour 1:110M, ou lieu abstrait). Candidates pour la surcouche îles critiques (Phase 3) ou pour le snap nearest (Phase 4).",
  );
  lines.push("");
  if (orphans.length === 0) {
    lines.push("_(aucune)_");
  } else {
    lines.push("| Dex | Titre | Lieu | (lat,lon) | Pipeline | Pays canonique |");
    lines.push("|---|---|---|---|---|---|");
    for (const e of orphans) {
      lines.push(
        `| ${e.dexNum} | ${e.title} | ${e.placeName || "–"} | ${e.lat.toFixed(2)}, ${e.lon.toFixed(2)} | R${e.pipelineRegion} ${regionLabel(e.pipelineRegion)} | ${e.countryCode ?? "–"} |`,
      );
    }
  }
  lines.push("");

  // Liste D
  lines.push("## Liste D — anneaux divergents (candidats per-anneau Phase 2)");
  lines.push("");
  lines.push(
    "Pour chaque polygone (pays + ringIndex) où le centroïde de l'anneau pointe vers une région différente de celle attribuée au pays par l'app. Indique combien de cartes du catalogue sont actuellement attribuées à ces anneaux. La colonne « Proposé (centroïde) » est purement informative.",
  );
  lines.push("");
  if (ringDivergences.length === 0) {
    lines.push("_(aucune)_");
  } else {
    lines.push(
      "| Pays | Ring# | Centroïde anneau | Actuelle (pays) | Proposé (centroïde) | Cartes touchées |",
    );
    lines.push("|---|---:|---|---|---|---:|");
    for (const d of ringDivergences) {
      lines.push(
        `| ${d.rawName} | ${d.ringIndex} | ${d.centroid.lat.toFixed(2)}, ${d.centroid.lon.toFixed(2)} | R${d.countryRegion} ${regionLabel(d.countryRegion)} | ${d.proposedFromCentroid === null ? "null" : `R${d.proposedFromCentroid} ${regionLabel(d.proposedFromCentroid)}`} | ${d.affectedCards.length} |`,
      );
    }
    lines.push("");
    // Détail des cartes par divergence
    for (const d of ringDivergences) {
      lines.push(
        `### ${d.rawName} #${d.ringIndex} — ${d.affectedCards.length} carte(s)`,
      );
      lines.push("");
      for (const c of d.affectedCards) {
        lines.push(
          `- **${c.dexNum}** ${c.title} — ${c.placeName} (${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}) → pipeline R${c.pipelineRegion}`,
        );
      }
      lines.push("");
    }
  }

  // Liste A (à la fin, gros volume)
  lines.push("## Liste A — cartes regroupées par pays + ringIndex");
  lines.push("");
  lines.push(
    "Sert à voir d'un coup d'œil les îles habitées par le catalogue. Un pays avec plusieurs ringIndex = morceaux détachés (US métropole vs Hawaii vs Alaska, France métropole vs Guyane, etc.).",
  );
  lines.push("");
  for (const g of groupedCountryRings) {
    lines.push(
      `### ${g.rawName} #${g.ringIndex} (R${g.region} ${regionLabel(g.region)}, centroïde ${g.centroid.lat.toFixed(2)},${g.centroid.lon.toFixed(2)}) — ${g.list.length} carte(s)`,
    );
    for (const c of g.list) {
      lines.push(
        `- ${c.dexNum} ${c.title} — ${c.placeName || "–"} (${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}) | pipeline R${c.pipelineRegion}`,
      );
    }
    lines.push("");
  }

  const reportFile = path.join(PATHS.reports, `regions-audit-${nowStamp()}.md`);
  writeText(reportFile, lines.join("\n"));

  // Console summary
  console.log(`Cartes auditées : ${entries.length}`);
  console.log(`Liste B — orphelines (null)   : ${orphans.length}`);
  console.log(`Liste C — désaccords (≠)      : ${disagreements.length}`);
  console.log(
    `Liste D — anneaux divergents  : ${ringDivergences.length} (${ringDivergences.reduce((s, d) => s + d.affectedCards.length, 0)} cartes touchées)`,
  );
  console.log(`Rapport : ${path.relative(process.cwd(), reportFile)}`);

  return 0;
}

process.exit(main());
