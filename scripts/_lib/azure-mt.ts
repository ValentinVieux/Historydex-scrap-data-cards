// Moteur MT : Azure AI Translator (fr → cible), avec backoff 429 + throttle.
// Partagé par translate-cards-mt.ts (prose complète) et translate-teasers.ts (teaser seul).
// Basculer vers DeepL/Google/Amazon = réécrire translateBatch() ici, et nulle part ailleurs.
//
// Robustesse palier F0 (2M caractères/mois, throttlé) : lots ≤ MAX_CHARS, pause entre lots,
// backoff sur 429 (honore Retry-After).
//
// Requiert dans .env : AZURE_TRANSLATOR_KEY (+ AZURE_TRANSLATOR_REGION si ressource régionale).

import "dotenv/config";

export const AZURE_TO: Record<string, string> = {
  es: "es", de: "de", it: "it", en: "en", pt: "pt",
  "pt-PT": "pt-pt", pl: "pl", tr: "tr", nl: "nl", ja: "ja", ko: "ko",
};

// Limites Azure : ≤ 1000 éléments ET ≤ 50 000 caractères/requête. On reste bien en dessous
// pour ménager le palier F0 (throttlé).
const MAX_ELEMS = 900;
const MAX_CHARS = 25_000;
const THROTTLE_MS = 1200;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const AZ_KEY = process.env.AZURE_TRANSLATOR_KEY ?? "";
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
export async function mtTranslate(texts: string[], target: string): Promise<string[]> {
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
