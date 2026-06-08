// Identifiants déterministes pour InstantDB — PORT de
// app/historydex/lib/ids.ts (cardTranslationId). DOIT rester IDENTIQUE à l'app :
// le même (cardId, locale) doit produire le même id des deux côtés (push amont ici
// ET backfill app-side) → upsert idempotent, pas de doublon, sans index unique.

function uuidToBytes(uuid: string): number[] | null {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    bytes.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  }
  return bytes;
}

function bytesToUuid(b: number[]): string {
  const h = b.map((x) => x.toString(16).padStart(2, "0"));
  return (
    h.slice(0, 4).join("") +
    "-" +
    h.slice(4, 6).join("") +
    "-" +
    h.slice(6, 8).join("") +
    "-" +
    h.slice(8, 10).join("") +
    "-" +
    h.slice(10, 16).join("")
  );
}

// 16 octets déterministes dérivés d'une courte chaîne (locale) : seed FNV-1a 32 bits
// puis expansion par xorshift32. Identique à l'app.
function localeBytes(locale: string): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < locale.length; i++) {
    h ^= locale.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let state = h >>> 0 || 1;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bytes.push(state & 0xff);
  }
  return bytes;
}

/**
 * Deterministic InstantDB id for a (cardId, locale) cardTranslation row.
 * Renvoie null si `cardId` n'est pas un UUID ou si `locale` est vide.
 */
export function cardTranslationId(cardId: string, locale: string): string | null {
  const a = uuidToBytes(cardId);
  if (!a || !locale) return null;
  const b = localeBytes(locale);
  const x = a.map((v, i) => v ^ b[i]!);
  // Force RFC-4122 version (4) + variant bits → UUID syntaxiquement valide.
  x[6] = (x[6]! & 0x0f) | 0x40;
  x[8] = (x[8]! & 0x3f) | 0x80;
  return bytesToUuid(x);
}
