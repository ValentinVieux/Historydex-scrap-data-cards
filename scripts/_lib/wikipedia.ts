// Helper pour interroger Wikipedia REST API summary.
// Documentation : https://fr.wikipedia.org/api/rest_v1/

const USER_AGENT = "HistoryDex-Pipeline/0.1 (https://github.com/historydex; contact via issues)";

export type WikipediaImage = {
  imageUrl: string;             // URL originalimage.source
  thumbnailUrl: string | null;  // URL thumbnail.source si dispo
  sourcePageUrl: string;        // URL canonique de la page Wikipedia
  attribution: string;          // ex: "Wikipedia FR · Mona Lisa (CC BY-SA)"
  resolvedLang: "fr" | "en";    // langue effectivement résolue
};

type WikipediaSummary = {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

async function fetchSummary(title: string, lang: "fr" | "en"): Promise<WikipediaSummary | null> {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Wikipedia ${lang} API ${res.status} pour "${title}"`);
  }
  return (await res.json()) as WikipediaSummary;
}

/**
 * Récupère l'image canonique d'une page Wikipedia. Essaie d'abord en FR, fallback EN.
 * Retourne null si aucune image trouvée.
 */
export async function fetchWikipediaImage(title: string): Promise<WikipediaImage | null> {
  const langs: ("fr" | "en")[] = ["fr", "en"];
  for (const lang of langs) {
    let summary: WikipediaSummary | null;
    try {
      summary = await fetchSummary(title, lang);
    } catch (err) {
      // Erreur réseau / API : log et continue (peut-être que l'autre lang marchera)
      console.warn(`  ↳ ${lang} : ${(err as Error).message}`);
      continue;
    }
    if (!summary) continue;

    const original = summary.originalimage?.source;
    const thumb = summary.thumbnail?.source ?? null;
    const pageUrl = summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;

    if (!original && !thumb) {
      // page existe mais pas d'image : essayer l'autre langue
      continue;
    }

    return {
      imageUrl: original ?? thumb!,
      thumbnailUrl: thumb,
      sourcePageUrl: pageUrl,
      attribution: `Wikipedia ${lang.toUpperCase()} — ${summary.title ?? title}`,
      resolvedLang: lang,
    };
  }
  return null;
}

/**
 * Télécharge un binaire (image) depuis une URL avec le User-Agent Wikipedia conforme.
 * Retourne le buffer + le content-type observé.
 */
export async function downloadBinary(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Téléchargement échoué (${res.status}) : ${url}`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}

export function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("gif")) return "gif";
  return "bin";
}
