// Sauvegarde datée de data/ (gitignoré, source du catalogue) dans OneDrive, synchronisé entre les postes.
// Usage : npm run backup:data            → OneDrive/Historydex/pipeline-data/data-AAAA-MM-JJ_HHMM.tar.gz
// Restauration : tar -xzf <archive> -C <racine du pipeline>   (recrée data/)
// ponytail: archives complètes (≈ 62 Mo brut), on garde les KEEP plus récentes ; passer à un dépôt git privé si l'historique fin devient utile.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEEP = 20;
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dest = process.env.PIPELINE_BACKUP_DIR ?? join(homedir(), "OneDrive", "Historydex", "pipeline-data");

if (!existsSync(join(root, "data", "cards"))) {
  console.error("data/cards absent : rien à sauvegarder (restaurer d'abord, cf. CLAUDE.md § Sauvegarde).");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
const file = join(dest, `data-${stamp}.tar.gz`);
// Caches régénérables exclus (images téléchargées) ; tout le reste part.
// Windows : le tar système (bsdtar) ; le tar GNU de Git Bash lit « C: » comme un hôte distant.
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
execFileSync(tar, ["-czf", file, "--exclude=data/_images-cache", "-C", root, "data"], { stdio: "inherit" });
console.log(`✓ ${file} (${(statSync(file).size / 1e6).toFixed(1)} Mo)`);

const old = readdirSync(dest).filter((f) => /^data-.*\.tar\.gz$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) rmSync(join(dest, f));
if (old.length) console.log(`(${old.length} ancienne(s) archive(s) supprimée(s), ${KEEP} gardées)`);
