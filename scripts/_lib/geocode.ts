// Géocodage advisoire via Nominatim (OpenStreetMap) pour recouper les coordonnées
// d'une carte avec le lieu nommé. Respecte la policy d'usage : max 1 req/s,
// User-Agent identifiable. Met les résultats en cache disque (idempotent) pour
// éviter de re-géocoder — y compris les "non trouvés".
//
// ⚠️ Advisoire seulement : les lieux anciens (Tenochtitlan, Sumer, Constantinople)
// géocodent mal ou pas du tout. C'est l'agent card-qa / l'humain qui tranche à
// partir du rapport `npm run verify-geo`. Ce module n'est PAS appelé par `validate`.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, ensureDir } from "./io.js";

const USER_AGENT = "HistoryDex-Pipeline/0.1 (https://github.com/historydex; contact via issues)";
const CACHE_DIR = path.join(ROOT, "data", "_geo-cache");
const MIN_INTERVAL_MS = 1100; // policy Nominatim : ≤ 1 requête / seconde

export type GeocodeResult = {
  query: string;
  found: boolean;
  lat: number | null;
  lon: number | null;
  displayName: string | null;
};

let lastCallAt = 0;

function cacheFile(query: string, countryCode?: string | null): string {
  const key = `${query.toLowerCase().trim()}::${(countryCode ?? "").toLowerCase()}`;
  const h = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(CACHE_DIR, `${h}.json`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Géocode une requête texte. Lit le cache disque si présent (sauf `force`).
 * Les erreurs réseau ne sont pas cachées (peuvent réussir plus tard).
 */
export async function geocode(
  query: string,
  opts: { force?: boolean; countryCode?: string | null } = {},
): Promise<GeocodeResult> {
  const file = cacheFile(query, opts.countryCode);
  if (!opts.force && fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as GeocodeResult;
    } catch {
      // cache corrompu → re-géocode
    }
  }

  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  // countrycodes= restreint au pays de la carte → évite les homonymes
  // (ex. "Salisbury Plain" en Géorgie du Sud vs en Angleterre).
  const cc = opts.countryCode ? `&countrycodes=${opts.countryCode.toLowerCase()}` : "";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}${cc}`;
  let result: GeocodeResult;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    result =
      arr.length === 0
        ? { query, found: false, lat: null, lon: null, displayName: null }
        : { query, found: true, lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), displayName: arr[0].display_name };
  } catch (err) {
    // ne pas cacher une erreur réseau transitoire
    return { query, found: false, lat: null, lon: null, displayName: `__error__: ${(err as Error).message}` };
  }

  ensureDir(CACHE_DIR);
  fs.writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
  return result;
}

/** Distance haversine en km entre deux points (degrés). */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
