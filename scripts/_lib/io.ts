import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, "..", "..");

export const PATHS = {
  candidates: path.join(ROOT, "data", "candidates"),
  raw: path.join(ROOT, "data", "raw"),
  cards: path.join(ROOT, "data", "cards"),
  batches: path.join(ROOT, "data", "_batches"),
  exports: path.join(ROOT, "exports"),
  exportsInstantDB: path.join(ROOT, "exports", "instantdb"),
  reports: path.join(ROOT, "reports"),
} as const;

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

export function readJson<T = unknown>(file: string): T {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf8");
}

export function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function nowIso(): string {
  return new Date().toISOString();
}
