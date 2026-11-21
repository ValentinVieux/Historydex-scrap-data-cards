// Registre des liens éditoriaux (séries + relations typées) — catalog/links.json, suivi par git
// (contrairement à data/). Miroir du format de l'app (lib/links/data.ts) qui le lira en base.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LoadedCard } from "./load-cards.js";
import type { Issue } from "./invariants.js";

export const RELATION_KINDS = ["creation", "cause", "suite", "partie", "sujet", "lieu", "perso"] as const;
export const LINKS_FILE = path.resolve("catalog/links.json");

const DEX = z.string().regex(/^\d{3,4}$/);
export const LinksSchema = z.object({
  series: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      icon: z.string().min(1),
      name: z.string().min(2), // FR ; les autres langues vivent côté app (links.seriesNames)
      titleName: z.string().min(2).optional(), // titre à porter quand la série est complète
      dexNums: z.array(DEX).min(3),
    }).strict(),
  ),
  relations: z.array(
    z.object({ from: DEX, to: DEX, kind: z.enum(RELATION_KINDS), why: z.string().optional() }).strict(),
  ),
});
export type Links = z.infer<typeof LinksSchema>;

export function loadLinks(file = LINKS_FILE): Links {
  return LinksSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** Ce que l'app lit (catalogStats.links) : registre restreint aux cartes publiées ;
 *  une série tombée sous 3 cartes publiées n'est pas montrée. Relations au format app [from, to, kind]. */
export function linksPayload(links: Links, published: Set<string>) {
  return {
    series: links.series
      .map((s) => ({ ...s, dexNums: s.dexNums.filter((d) => published.has(d)) }))
      .filter((s) => s.dexNums.length >= 3),
    relations: links.relations
      .filter((r) => published.has(r.from) && published.has(r.to))
      .map((r) => [r.from, r.to, r.kind] as const),
  };
}

/** Contrôles du registre contre le catalogue. Erreur = le lien casserait côté app. */
export function checkLinks(cards: LoadedCard[], file = LINKS_FILE): Issue[] {
  const issues: Issue[] = [];
  const push = (severity: Issue["severity"], rule: string, message: string) => issues.push({ severity, file, rule, message });
  if (!fs.existsSync(file)) return issues; // checkout sans registre : rien à vérifier
  let links: Links;
  try {
    links = loadLinks(file);
  } catch (e) {
    push("error", "links-schema", String(e instanceof Error ? e.message : e).slice(0, 500));
    return issues;
  }
  const byDex = new Map(cards.map((c) => [c.data.dexNum, c.data]));
  const live = (d: string, where: string) => {
    const c = byDex.get(d);
    if (!c) push("error", "links-unknown-card", `${where} : dexNum ${d} absent de data/cards`);
    else if (c.editorial.status === "archived") push("error", "links-archived-card", `${where} : carte ${d} archivée`);
    return c;
  };

  const ids = new Set<string>();
  for (const s of links.series) {
    if (ids.has(s.id)) push("error", "series-duplicate-id", `série « ${s.id} » définie deux fois`);
    ids.add(s.id);
    if (new Set(s.dexNums).size !== s.dexNums.length) push("error", "series-duplicate-card", `série « ${s.id} » : carte répétée`);
    const years = s.dexNums.map((d) => live(d, `série « ${s.id} »`)?.canonical.time.pivotYear);
    for (let i = 1; i < years.length; i++) {
      const a = years[i - 1], b = years[i];
      if (a != null && b != null && b < a)
        push("warning", "series-order", `série « ${s.id} » : ${s.dexNums[i]} (${b}) placé après ${s.dexNums[i - 1]} (${a}) — l'app affiche dans l'ordre du temps`);
    }
  }

  const pairs = new Set<string>();
  for (const r of links.relations) {
    const where = `relation ${r.from}→${r.to} (${r.kind})`;
    if (r.from === r.to) push("error", "relation-self", `${where} : une carte liée à elle-même`);
    const key = [r.from, r.to].sort().join("|") + "|" + r.kind;
    if (pairs.has(key)) push("error", "relation-duplicate", `${where} : doublon`);
    pairs.add(key);
    const a = live(r.from, where), b = live(r.to, where);
    // cause/suite : la source précède la cible (sinon lien inversé ou raccourci téléologique, P3)
    if (a && b && (r.kind === "cause" || r.kind === "suite") && a.canonical.time.pivotYear > b.canonical.time.pivotYear)
      push("warning", "relation-order", `${where} : la source (${a.canonical.time.pivotYear}) est postérieure à la cible (${b.canonical.time.pivotYear})`);
  }
  return issues;
}
