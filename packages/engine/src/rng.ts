/** Generatore di float in [0, 1). Deterministico a parita' di seed. */
export type Rng = () => number;

const UINT32 = 0x1_0000_0000;

/** mulberry32: 32 bit di stato, nessuna dipendenza, sequenza riproducibile. */
export function createRng(seed: number): Rng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a a 32 bit: deriva un seed numerico da un id di partita testuale. */
export function seedFromString(s: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Fisher-Yates su una copia: l'array di input non viene mai toccato. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    // Il clamp protegge dagli rng iniettati che possono restituire 1.
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const atI = result[i] as T;
    const atJ = result[j] as T;
    result[i] = atJ;
    result[j] = atI;
  }
  return result;
}
