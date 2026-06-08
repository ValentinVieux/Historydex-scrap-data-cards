#!/usr/bin/env -S tsx
// Bulk fix des erreurs Zod systématiques détectées dans data/normalized/ après
// le passage des card-editors :
//   - canonical.factNotes string → array
//   - editorial.notes string → array
//   - canonical.place.geoKind "point" → "earth"
//   - bouddhas-de-bamiyan : era antiq → ajout note d'exception

import fs from "node:fs";
import path from "node:path";
import { listJsonFiles, PATHS, readJson } from "./_lib/io.js";
import { CardSchema } from "../schemas/card.schema.js";

const verdicts: { file: string; fixes: string[]; afterValid: boolean; errors?: string[] }[] = [];

for (const file of listJsonFiles(PATHS.normalized)) {
  const raw = readJson<any>(file);
  const fixes: string[] = [];

  // Fix 1: factNotes string → array
  if (typeof raw.canonical?.factNotes === "string") {
    raw.canonical.factNotes = [raw.canonical.factNotes];
    fixes.push("factNotes: string → array");
  }

  // Fix 2: editorial.notes string → array
  if (typeof raw.editorial?.notes === "string") {
    raw.editorial.notes = [raw.editorial.notes];
    fixes.push("editorial.notes: string → array");
  }

  // Fix 3: geoKind invalid enum
  const geoKind = raw.canonical?.place?.geoKind;
  if (geoKind && !["earth", "extraterrestrial", "abstract"].includes(geoKind)) {
    raw.canonical.place.geoKind = "earth";
    fixes.push(`geoKind: "${geoKind}" → "earth"`);
  }

  // Fix 4: bouddhas-de-bamiyan era exception note
  if (raw.id === "bouddhas-de-bamiyan") {
    const hasEraNote = raw.editorial?.notes?.some((n: string) =>
      typeof n === "string" && (n.toLowerCase().includes("ère") || n.toLowerCase().includes("era")),
    );
    if (!hasEraNote) {
      raw.editorial.notes.push(
        "Exception era : le pivotYear 600 dépasse la borne antiq (476) mais reste cohérent avec le contexte tardo-antique de l'art bouddhique du Gandhara — choix éditorial assumé.",
      );
      fixes.push("ajout note d'exception era antiq pivot 600");
    }
  }

  if (fixes.length === 0) continue;

  const parsed = CardSchema.safeParse(raw);
  if (parsed.success) {
    fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n", "utf8");
    verdicts.push({ file, fixes, afterValid: true });
  } else {
    verdicts.push({
      file,
      fixes,
      afterValid: false,
      errors: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
    });
  }
}

verdicts.sort((a, b) => a.file.localeCompare(b.file));

console.log(`${verdicts.length} fichiers fixés :\n`);
for (const v of verdicts) {
  const slug = path.basename(v.file, ".json");
  const ok = v.afterValid ? "✓" : "✗ ENCORE INVALIDE";
  console.log(`${ok} ${slug}`);
  for (const f of v.fixes) console.log(`    - ${f}`);
  if (v.errors) {
    for (const e of v.errors) console.log(`    ! ${e}`);
  }
}

const okCount = verdicts.filter((v) => v.afterValid).length;
console.log(`\nValides après fix : ${okCount}/${verdicts.length}`);
