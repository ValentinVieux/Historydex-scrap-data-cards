// SHA256 d'un fichier image, en hex. Utilisé par push:db pour détecter si
// data/_images-final/<dexNum>.jpg a changé depuis le dernier push.

import { createHash } from "node:crypto";
import fs from "node:fs";

export function sha256File(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256FileIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return sha256File(filePath);
}
