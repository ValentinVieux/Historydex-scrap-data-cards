// Port pipeline de la classification (lat, lon) → région utilisée par l'app
// HistoryDex côté mode Explorateur (../app/historydex/lib/catalog/countriesGeo.ts).
//
// Objectif : reproduire **exactement** le comportement actuel de l'app pour
// pouvoir auditer le catalogue (data/cards/) et détecter les divergences
// place.region ≠ région calculée. Aucune doctrine "per-anneau" ici tant que
// l'audit n'a pas été validé.
//
// Source data : world-atlas/countries-110m.json (Natural Earth 1:110M).
// Les overrides ISO et la fonction regionFromLatLon doivent rester
// synchronisés avec l'app — tout drift sera attrapé par les tests Phase 5.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import type {
  Topology,
  GeometryCollection,
  GeometryObject,
} from "topojson-specification";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";

export type RegionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const REGION_LABELS: Record<RegionId, string> = {
  1: "Europe occidentale",
  2: "Europe orientale & Balkans",
  3: "Russie & Asie centrale",
  4: "Proche-Orient & Médit. or.",
  5: "Afrique (hors Égypte)",
  6: "Asie de l'Est",
  7: "Asie du Sud",
  8: "Asie SE & Pacifique",
  9: "Amériques précol. & latines",
  10: "Amérique du Nord",
};

export function regionLabel(id: RegionId | null | undefined): string {
  if (id == null) return "(aucune)";
  return REGION_LABELS[id] ?? `(inconnue:${id})`;
}

// ---------- geometry utils (port de _geoUtils.ts) ---------------------------

type LngLat = readonly [number, number];
type Ring = readonly LngLat[];

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function unwrapRing(ring: Ring): LngLat[] {
  if (ring.length === 0) return [];
  const out: LngLat[] = [];
  let prev = normalizeLon(ring[0][0]);
  out.push([prev, ring[0][1]]);
  for (let i = 1; i < ring.length; i++) {
    let lon = normalizeLon(ring[i][0]);
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i][1]]);
    prev = lon;
  }
  return out;
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------- regionFromLatLon (port de lib/game/geo.ts, post-2026-05-29) -----

export function regionFromLatLon(lat: number, lon: number): RegionId | null {
  if (lat > 25 && lon < -50 && lon > -170) return 10;
  if (lat <= 25 && lat > -60 && lon < -30 && lon > -120) return 9;
  if (lat < 20 && lat > -50 && lon > 90 && lon < 180) return 8;
  if (lat < 30 && lat > -50 && lon > -180 && lon < -120) return 8; // Pacifique est (Hawaii, Polynésie)
  if (lat > 18 && lon > 100 && lon < 150) return 6;
  if (lat > 5 && lat < 38 && lon >= 60 && lon < 100) return 7;
  if (lat > 38 && lon > 35 && lon < 150) return 3;
  if (lat > 12 && lat < 42 && lon > 25 && lon < 60) return 4;
  if (lat <= 37 && lat > -36 && lon >= -20 && lon < 60) return 5; // étendu jusqu'à lon<60 (Réunion 55.5, Maurice 57.5)
  if (
    lat >= 37 &&
    lat < 72 &&
    lon > -25 &&
    (lon <= 14 || (lat >= 55 && lon <= 28))
  )
    return 1;
  if (lat > 35 && lat < 60 && lon > 14 && lon <= 40) return 2;
  return null;
}

// ---------- ISO overrides (miroir app countriesGeo.ts, post-2026-05-29) -----

const ISO_OVERRIDES: Record<number, RegionId> = {
  818: 4, 792: 4, 196: 4, 376: 4, 275: 4, 422: 4, 760: 4, 368: 4,
  400: 4, 784: 4, 682: 4, 634: 4, 414: 4, 512: 4, 887: 4, 48: 4,
  364: 4, // Iran → R4 (était R3, audit 2026-05-29)
  643: 3, 398: 3, 860: 3, 795: 3, 762: 3, 417: 3, 31: 3,
  51: 3, 268: 3, 4: 3,
  496: 3, // Mongolia → R3 (était R6, audit 2026-05-29)
  300: 2, 100: 2, 642: 2, 616: 2, 348: 2, 203: 2, 703: 2, 705: 2,
  191: 2, 70: 2, 499: 2, 688: 2, 807: 2, 8: 2, 498: 2, 804: 2,
  112: 2, 233: 2, 428: 2, 440: 2,
  704: 8, 418: 8, 116: 8, 764: 8, 458: 8, 608: 8, 360: 8, 626: 8,
  96: 8, 702: 8, 36: 8, 554: 8, 598: 8, 90: 8, 548: 8, 242: 8,
  392: 6, 410: 6, 408: 6, 158: 6, 156: 6, 446: 6, 344: 6,
  840: 10, 124: 10,
  484: 9, // Mexico → Latin America
  729: 5, // Sudan (audit 2026-05-29)
  148: 5, // Chad (audit 2026-05-29)
};

// Pays "à territoires détachés" : anneaux non-principaux classés par leur
// propre centroïde (miroir app).
const OVERSEAS_COUNTRIES = new Set<number>([
  840, 250, 826, 724, 620, 528, 208, 578,
]);

// ---------- Surcouche d'îles critiques (miroir app extraIslands.ts) ---------
// Petites îles absentes ou trop fines dans le TopoJSON 1:110M. Chaque entrée est
// un rectangle hitbox injecté dans REGION_POLYGONS_INDEX (comme countriesGeo.ts
// L345-361 côté app) → rend l'île tappable / classable. DOIT rester synchronisé
// avec app/historydex/lib/catalog/extraIslands.ts.
type ExtraIsland = {
  name: string;
  regionId: RegionId;
  ring: ReadonlyArray<readonly [number, number]>; // [lon, lat], fermé
};

function box(
  lonW: number,
  latS: number,
  lonE: number,
  latN: number,
): ReadonlyArray<readonly [number, number]> {
  return [
    [lonW, latS],
    [lonE, latS],
    [lonE, latN],
    [lonW, latN],
    [lonW, latS],
  ];
}

const EXTRA_ISLANDS: readonly ExtraIsland[] = [
  // Pacifique central/est (R8)
  { name: "Polynésie française", regionId: 8, ring: box(-152, -19, -148, -16) },
  { name: "Atoll de Midway", regionId: 8, ring: box(-178.5, 27.5, -176.5, 29) },
  { name: "Île de Pâques (Rapa Nui)", regionId: 8, ring: box(-110, -28, -108.5, -26.5) },
  { name: "Yap (Micronésie)", regionId: 8, ring: box(137, 8.5, 139, 10.5) },
  // Caraïbes & Amériques (R9)
  { name: "Bahamas", regionId: 9, ring: box(-79, 21, -72.5, 27.5) },
  { name: "Martinique", regionId: 9, ring: box(-61.4, 14.3, -60.7, 14.95) },
  { name: "Guadeloupe", regionId: 9, ring: box(-61.85, 15.85, -61.15, 16.55) },
  { name: "Galápagos", regionId: 9, ring: box(-92, -1.5, -89, 0.6) },
  // Atlantique nord proche Europe (R1)
  { name: "Açores", regionId: 1, ring: box(-31.5, 36.8, -25, 39.8) },
  { name: "Madère", regionId: 1, ring: box(-17.5, 32.4, -16.3, 33.2) },
  { name: "Île d'Elbe", regionId: 1, ring: box(10.0, 42.65, 10.55, 42.9) },
  // Atlantique sud / océan Indien africain (R5)
  { name: "Sainte-Hélène", regionId: 5, ring: box(-6.1, -16.2, -5.4, -15.7) },
  { name: "La Réunion", regionId: 5, ring: box(55.1, -21.5, 56, -20.7) },
  { name: "Mayotte", regionId: 5, ring: box(44.9, -13.1, 45.4, -12.6) },
  // Mer de Béring (R3)
  { name: "Île Béring (Commander)", regionId: 3, ring: box(165.7, 54.5, 166.6, 55.5) },
  // Mélanésie / Salomon (R8)
  { name: "Vanikoro (Salomon)", regionId: 8, ring: box(166.7, -11.85, 167.15, -11.4) },
];

// ---------- Build polygon index --------------------------------------------

type IndexedRing = {
  ring: LngLat[];
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
};

type CountryFeatureMeta = {
  isoNum: number | null;
  rawName: string;
};

type RegionPolygonEntry = {
  region: RegionId;
  meta: CountryFeatureMeta;
  outer: IndexedRing;
  holes: IndexedRing[];
  // Index de l'anneau "Polygon" dans la MultiPolygon du feature (0 = principal).
  ringIndex: number;
  // Centroïde de la bbox de cet anneau (utilisé par l'audit pour discuter le
  // mapping per-anneau Phase 2).
  bboxCentroid: { lat: number; lon: number };
};

function indexRing(ring: LngLat[]): IndexedRing {
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return { ring, lonMin, lonMax, latMin, latMax };
}

function ringContains(
  indexed: IndexedRing,
  lat: number,
  lon: number,
): boolean {
  if (lat < indexed.latMin || lat > indexed.latMax) return false;
  const center = (indexed.lonMin + indexed.lonMax) / 2;
  const normalizedLon = normalizeLon(lon);
  const testLon =
    normalizedLon + Math.round((center - normalizedLon) / 360) * 360;
  if (testLon < indexed.lonMin || testLon > indexed.lonMax) return false;
  return pointInRing(testLon, lat, indexed.ring);
}

type RingArr = LngLat[];
type PolygonArr = RingArr[];

function ringFromPositions(coords: Position[]): RingArr {
  const out: RingArr = [];
  for (const [lon, lat] of coords) out.push([lon, lat]);
  return out;
}

function collectPolygons(geom: Geometry, sink: PolygonArr[]): void {
  if (geom.type === "Polygon") {
    const poly = geom.coordinates.map((ring) => ringFromPositions(ring));
    if (poly.length > 0) sink.push(poly);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      const rings = poly.map((ring) => ringFromPositions(ring));
      if (rings.length > 0) sink.push(rings);
    }
  } else if (geom.type === "GeometryCollection") {
    for (const sub of geom.geometries) collectPolygons(sub, sink);
  }
}

const require = createRequire(import.meta.url);
const TOPO_PATH = require.resolve("world-atlas/countries-110m.json");
const countriesTopo = JSON.parse(readFileSync(TOPO_PATH, "utf8")) as Topology<{
  countries: GeometryCollection<GeometryObject>;
}>;

function ringBboxCentroid(unwrappedRing: LngLat[]): {
  lat: number;
  lon: number;
} {
  let lonMin = Infinity,
    lonMax = -Infinity,
    latMin = Infinity,
    latMax = -Infinity;
  for (const [lon, lat] of unwrappedRing) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return {
    lat: (latMin + latMax) / 2,
    lon: normalizeLon((lonMin + lonMax) / 2),
  };
}

function build(): RegionPolygonEntry[] {
  const fc = feature(countriesTopo, countriesTopo.objects.countries) as
    | FeatureCollection
    | Feature;
  const features: Feature[] =
    fc.type === "FeatureCollection" ? fc.features : [fc];
  const indexedPolygons: RegionPolygonEntry[] = [];

  for (const f of features) {
    if (!f.geometry) continue;
    const polygons: PolygonArr[] = [];
    collectPolygons(f.geometry, polygons);
    if (polygons.length === 0) continue;

    const idNum =
      typeof f.id === "number"
        ? f.id
        : typeof f.id === "string"
          ? Number(f.id)
          : NaN;
    const isoNum = Number.isFinite(idNum) ? idNum : null;
    const rawName =
      typeof f.properties?.name === "string" ? f.properties.name : "";
    const isoOverride =
      isoNum !== null && ISO_OVERRIDES[isoNum] ? ISO_OVERRIDES[isoNum] : null;
    const hasOverseas = isoNum !== null && OVERSEAS_COUNTRIES.has(isoNum);

    // Anneau principal = celui avec le plus de sommets.
    let mainRingIdx = 0;
    let mainRingLen = polygons[0][0]?.length ?? 0;
    for (let i = 1; i < polygons.length; i++) {
      const outer = polygons[i][0];
      if (outer && outer.length > mainRingLen) {
        mainRingIdx = i;
        mainRingLen = outer.length;
      }
    }

    let mainRegion: RegionId | null = isoOverride;
    if (mainRegion === null) {
      const c = ringBboxCentroid(unwrapRing(polygons[mainRingIdx][0]));
      mainRegion = regionFromLatLon(c.lat, c.lon);
    }
    if (mainRegion === null) continue;

    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      const unwrapped = poly.map((ring) => unwrapRing(ring));
      const outer = unwrapped[0];
      if (!outer || outer.length < 3) continue;

      let ringRegion: RegionId = mainRegion;
      if (i !== mainRingIdx && hasOverseas) {
        const c = ringBboxCentroid(outer);
        const fromCentroid = regionFromLatLon(c.lat, c.lon);
        if (fromCentroid !== null) ringRegion = fromCentroid;
      }

      const idx = indexRing(outer);
      indexedPolygons.push({
        region: ringRegion,
        meta: { isoNum, rawName },
        outer: idx,
        holes: unwrapped
          .slice(1)
          .filter((r) => r.length >= 3)
          .map((r) => indexRing(r)),
        ringIndex: i,
        bboxCentroid: {
          lat: (idx.latMin + idx.latMax) / 2,
          lon: normalizeLon((idx.lonMin + idx.lonMax) / 2),
        },
      });
    }
  }

  // Surcouche d'îles critiques (miroir app) : append après les pays → un point
  // dans un vrai pays matche d'abord le pays ; les boîtes ne servent que pour
  // les points hors de tout polygone-pays (îles/océan).
  for (const isl of EXTRA_ISLANDS) {
    const ring = unwrapRing(isl.ring);
    if (ring.length < 3) continue;
    const idx = indexRing(ring);
    indexedPolygons.push({
      region: isl.regionId,
      meta: { isoNum: null, rawName: isl.name },
      outer: idx,
      holes: [],
      ringIndex: 0,
      bboxCentroid: {
        lat: (idx.latMin + idx.latMax) / 2,
        lon: normalizeLon((idx.lonMin + idx.lonMax) / 2),
      },
    });
  }

  return indexedPolygons;
}

const REGION_POLYGONS_INDEX = build();

// ---------- Public API ------------------------------------------------------

export type CountryHit = {
  region: RegionId;
  isoNum: number | null;
  rawName: string;
  ringIndex: number;
  ringBboxCentroid: { lat: number; lon: number };
};

export function regionFromCountryHit(
  lat: number,
  lon: number,
): RegionId | null {
  const hit = countryHit(lat, lon);
  return hit ? hit.region : null;
}

// ---------- Snap nearest (miroir app countriesGeo.ts:428-490) ---------------
// L'app résout le tap explorateur via `regionFromCountryHitWithSnap` : si le
// point ne tombe dans aucun polygone (eau, détroit, île trop petite à 1:110M),
// elle le rattache au pays le plus proche dans un rayon EXPLORER_SNAP_KM. La
// région **réellement scorée en jeu** est donc celle-ci, pas `countryHit` seul.
// C'est exactement l'angle mort de l'audit "orphelin" : un pin maritime (ex.
// Bosphore pour Istanbul) renvoyait null et sautait le test de désaccord, alors
// que le snap le résout à R4 → carte injouable si place.region ≠ R4.
export const EXPLORER_SNAP_KM = 150;

const EARTH_KM = 6371;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance planaire approximative en km d'un point à la bbox d'un anneau
// (0 si le point est dans la bbox). Prefilter rapide avant le calcul vertex.
function distanceToBboxKm(lat: number, lon: number, outer: IndexedRing): number {
  const normLon = normalizeLon(lon);
  const center = (outer.lonMin + outer.lonMax) / 2;
  const testLon = normLon + Math.round((center - normLon) / 360) * 360;
  const clampedLat = Math.max(outer.latMin, Math.min(outer.latMax, lat));
  const clampedLon = Math.max(outer.lonMin, Math.min(outer.lonMax, testLon));
  const dLat = (lat - clampedLat) * 111.32;
  const dLon = (testLon - clampedLon) * 111.32 * Math.cos((lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function minVertexDistanceKm(
  lat: number,
  lon: number,
  ring: readonly LngLat[],
): number {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = haversineKm(lat, lon, ring[i][1], ring[i][0]);
    if (d < m) m = d;
  }
  return m;
}

// Comme `regionFromCountryHit` mais si le tap est hors polygone, cherche le
// pays/île le plus proche dans un rayon `maxKm` (défaut EXPLORER_SNAP_KM) et
// retourne sa région. C'est la région que le scoring explorateur de l'app
// (`evalWhere` → `answer.regionId === card.region`) compare réellement.
export function regionFromCountryHitWithSnap(
  lat: number,
  lon: number,
  maxKm: number = EXPLORER_SNAP_KM,
): RegionId | null {
  const exact = regionFromCountryHit(lat, lon);
  if (exact !== null) return exact;

  let bestKm = maxKm;
  let bestRegion: RegionId | null = null;
  for (const entry of REGION_POLYGONS_INDEX) {
    const distBbox = distanceToBboxKm(lat, lon, entry.outer);
    if (distBbox >= bestKm) continue;
    const minVertex = minVertexDistanceKm(lat, lon, entry.outer.ring);
    if (minVertex < bestKm) {
      bestKm = minVertex;
      bestRegion = entry.region;
    }
  }
  return bestRegion;
}

export function countryHit(lat: number, lon: number): CountryHit | null {
  const normalizedLon = normalizeLon(lon);
  for (const entry of REGION_POLYGONS_INDEX) {
    if (!ringContains(entry.outer, lat, normalizedLon)) continue;
    let insideHole = false;
    for (const hole of entry.holes) {
      if (ringContains(hole, lat, normalizedLon)) {
        insideHole = true;
        break;
      }
    }
    if (insideHole) continue;
    return {
      region: entry.region,
      isoNum: entry.meta.isoNum,
      rawName: entry.meta.rawName,
      ringIndex: entry.ringIndex,
      ringBboxCentroid: entry.bboxCentroid,
    };
  }
  return null;
}

// Pour l'audit : indique aussi quelle région **l'anneau** lui-même
// "voudrait" si on appliquait la doctrine per-anneau (ISO override > centroïde
// de l'anneau). Ne change rien au comportement courant : sert juste à produire
// la Liste C de divergences.
export function regionByAnneauPreview(
  hit: CountryHit,
): { byAnneau: RegionId | null; reason: "iso-override" | "anneau-centroid" } {
  if (hit.isoNum !== null && ISO_OVERRIDES[hit.isoNum]) {
    return { byAnneau: ISO_OVERRIDES[hit.isoNum], reason: "iso-override" };
  }
  const c = hit.ringBboxCentroid;
  return {
    byAnneau: regionFromLatLon(c.lat, c.lon),
    reason: "anneau-centroid",
  };
}
