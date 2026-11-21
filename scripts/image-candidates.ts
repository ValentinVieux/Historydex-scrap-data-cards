#!/usr/bin/env -S tsx
// Collecte les images candidates d'une carte pour le choix automatique (étape 1/2).
//
// Sources : images de l'article Wikipedia FR + EN (image principale en tête), puis
// recherche Commons (espace File:) sur le titre EN. Tout passe par l'API Commons
// `imageinfo` : un fichier hébergé localement (fair use, non libre) n'y existe pas → écarté.
// Filtres : licence libre (PD / CC0 / CC BY[-SA]), raster, ≥ 800×584 (crop final 1.37 sans
// upscale), nom de fichier hors drapeaux/blasons/cartes/logos/signatures.
//
// Sortie, par carte : data/_images-candidates/<dex>/{1..n}.jpg (1600 px max),
// candidates.json (métadonnées + attribution), sheet.jpg (planche contact numérotée), et
// data/_images-candidates/brief-<stamp>.json pour le sous-agent juge.
// Étape 2 : scripts/apply-image-picks.ts.
//
//   npx tsx scripts/image-candidates.ts --dex 1047,1048   [--max 12] [--force] [--query "Moby Dick Taber"]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadCardsFromDir } from "./_lib/load-cards.js";
import { PATHS, ensureDir, nowStamp } from "./_lib/io.js";
import { USER_AGENT, downloadBinary } from "./_lib/wikipedia.js";

const OUT = path.join(PATHS.exports, "..", "data", "_images-candidates");
const MIN_W = 800;
const MIN_H = 584;
const DENY = /(flag|drapeau|coat[_ ]of[_ ]arms|blason|armoiries|wappen|escudo|\bmap\b|carte|locator|location|logo|icon|seal|sceau|signature|autograph|stub|symbol|disambig|commons-logo|wiki|portal|nuvola|crystal|tango|emblem|pictogram)/i;
const FREE = /(public domain|^pd\b|^pd-|cc0|cc[- ]by)/i;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

const argv = process.argv.slice(2);
const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const dexSet = new Set((val("--dex") ?? "").split(",").filter(Boolean));
const MAX = Number(val("--max") ?? 12);
const FORCE = argv.includes("--force");
const QUERY = val("--query"); // recherche Commons ciblée (ex. "Moby Dick Taber"), passée en tête
if (!dexSet.size) { console.error("usage: image-candidates.ts --dex a,b [--max 10] [--force]"); process.exit(1); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api(host: string, params: Record<string, string>): Promise<any> {
  const u = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) u.searchParams.set(k, v);
  await sleep(300); // ponytail: politesse fixe, file d'attente par hôte si on parallélise un jour
  const res = await fetch(u, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${host} ${res.status}`);
  return res.json();
}

type Cand = { file: string; origin: string; width: number; height: number; url: string; thumb: string;
  license: string; artist: string; descUrl: string; local?: string };

async function articleFiles(lang: "fr" | "en", title: string): Promise<{ files: string[]; enTitle: string | null }> {
  const j = await api(`${lang}.wikipedia.org`, { action: "query", titles: title, redirects: "1",
    prop: "pageimages|images|langlinks", piprop: "name", imlimit: "100", lllang: "en" });
  const p = j.query?.pages?.[0];
  if (!p || p.missing) return { files: [], enTitle: null };
  const lead = p.pageimage ? [`File:${p.pageimage}`] : [];
  const rest = (p.images ?? []).map((i: any) => "File:" + i.title.replace(/^[^:]+:/, ""));
  return { files: [...lead, ...rest], enTitle: p.langlinks?.[0]?.title ?? (lang === "en" ? p.title : null) };
}

async function commonsInfo(files: string[]): Promise<Cand[]> {
  const out: Cand[] = [];
  for (let i = 0; i < files.length; i += 40) {
    const j = await api("commons.wikimedia.org", { action: "query", titles: files.slice(i, i + 40).join("|"),
      prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600" });
    for (const p of j.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue; // absent de Commons = fichier local non libre
      const md = ii.extmetadata ?? {};
      const strip = (s?: { value?: string }) => (s?.value ?? "").replace(/<[^>]+>/g, "").trim();
      out.push({ file: p.title, origin: "", width: ii.width, height: ii.height, url: ii.url,
        thumb: ii.thumburl ?? ii.url, license: strip(md.LicenseShortName), artist: strip(md.Artist).slice(0, 200),
        descUrl: ii.descriptionurl, ...{ mime: ii.mime } } as Cand & { mime: string });
    }
  }
  return out;
}

async function sheet(cands: Cand[], dir: string): Promise<void> {
  const W = 400, H = 300, COLS = 4, rows = Math.ceil(cands.length / COLS);
  const tiles = await Promise.all(cands.map(async (c, i) => {
    const img = await sharp(path.join(dir, c.local!)).resize(W, H, { fit: "contain", background: "#222" }).toBuffer();
    const label = Buffer.from(`<svg width="${W}" height="${H}"><rect x="0" y="0" width="150" height="34" fill="#000" opacity="0.75"/>` +
      `<text x="8" y="25" font-size="22" font-family="Arial" fill="#ff0">#${i + 1} ${c.width}×${c.height}</text></svg>`);
    return { input: await sharp(img).composite([{ input: label }]).toBuffer(), left: (i % COLS) * W, top: Math.floor(i / COLS) * H };
  }));
  await sharp({ create: { width: COLS * W, height: rows * H, channels: 3, background: "#111" } })
    .composite(tiles).jpeg({ quality: 80 }).toFile(path.join(dir, "sheet.jpg"));
}

async function main() {
  const cards = loadCardsFromDir(PATHS.cards).cards.map((c) => c.data).filter((c) => dexSet.has(c.dexNum));
  ensureDir(OUT);
  const brief: any[] = [];
  for (const card of cards) {
    const dir = path.join(OUT, card.dexNum);
    const fr = card.display.locales.fr;
    const entry = { dexNum: card.dexNum, title: fr.title, type: card.canonical.type, imageLabel: card.display.imageLabel,
      answerWhere: fr.placeLabel, answerWhen: fr.timeDisplayLabel, sheet: path.join(dir, "sheet.jpg"), dir, candidates: [] as Cand[] };
    if (!FORCE && fs.existsSync(path.join(dir, "candidates.json"))) {
      entry.candidates = JSON.parse(fs.readFileSync(path.join(dir, "candidates.json"), "utf8"));
      brief.push(entry); console.log(`[${card.dexNum}] déjà collecté (${entry.candidates.length})`); continue;
    }
    const wt = card.canonical.wikipediaTitle ?? fr.title;
    try {
      const frA = await articleFiles("fr", wt);
      const enTitle = frA.enTitle ?? wt;
      const enA = await articleFiles("en", enTitle);
      // ponytail: indice de recherche par type, à enrichir si un type ramène surtout du bruit
      const hint = ({ text: "illustration", person: "portrait", war: "painting", treaty: "painting", explor: "painting",
        paint: "painting", relig: "painting", cata: "painting" } as Record<string, string>)[card.canonical.type] ?? "";
      const searches = [];
      for (const q of [...(QUERY ? [QUERY] : []), ...(hint ? [`"${enTitle}" ${hint}`, `"${enTitle}"`] : [`"${enTitle}"`])]) {
        const r = await api("commons.wikimedia.org", { action: "query", list: "search", srnamespace: "6",
          srsearch: `${q} filetype:bitmap`, srlimit: "12" });
        searches.push(...(r.query?.search ?? []).map((s: any) => s.title));
      }
      const origin = new Map<string, string>();
      const tag = (fs_: string[], o: string) => fs_.forEach((f) => { if (!origin.has(f)) origin.set(f, o); });
      if (QUERY) tag(searches.slice(0, 12), "commons-query");
      tag(frA.files.slice(0, 1), "wiki-fr-lead"); tag(enA.files.slice(0, 1), "wiki-en-lead");
      tag(frA.files, "wiki-fr"); tag(enA.files, "wiki-en");
      tag(searches, "commons-search");
      const infos = await commonsInfo([...origin.keys()]);
      const order = [...origin.keys()];
      const kept = infos
        .filter((c: any) => MIMES.has(c.mime) && c.width >= MIN_W && c.height >= MIN_H && !DENY.test(c.file) && FREE.test(c.license))
        .map((c) => ({ ...c, origin: origin.get(c.file)! }))
        .sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file))
        .slice(0, MAX);
      fs.rmSync(dir, { recursive: true, force: true }); ensureDir(dir);
      let n = 0;
      for (const c of kept) {
        try {
          const dl = await downloadBinary(c.thumb);
          c.local = `${++n}.jpg`;
          await sharp(dl.buffer).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(path.join(dir, c.local));
        } catch (err) { console.warn(`  ↳ ${c.file} : ${(err as Error).message}`); }
      }
      entry.candidates = kept.filter((c) => c.local);
      fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(entry.candidates, null, 2));
      if (entry.candidates.length) await sheet(entry.candidates, dir);
      console.log(`[${card.dexNum}] ${fr.title} — ${infos.length} fichiers Commons, ${entry.candidates.length} retenus`);
    } catch (err) {
      console.warn(`[${card.dexNum}] erreur : ${(err as Error).message}`);
    }
    brief.push(entry);
  }
  const briefFile = path.join(OUT, `brief-${nowStamp()}.json`);
  fs.writeFileSync(briefFile, JSON.stringify(brief.map(({ candidates, ...e }) => ({ ...e,
    candidates: candidates.map((c: Cand, i: number) => ({ n: i + 1, file: c.file, origin: c.origin, width: c.width, height: c.height })) })), null, 1));
  const empty = brief.filter((b) => !b.candidates.length).map((b) => b.dexNum);
  console.log(`\n✓ brief : ${path.relative(process.cwd(), briefFile)}${empty.length ? ` · sans candidate : ${empty.join(", ")}` : ""}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
