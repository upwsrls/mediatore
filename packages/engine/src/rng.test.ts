import { describe, expect, it } from 'vitest';
import type { Rng } from './rng.ts';
import { createRng, seedFromString, shuffle } from './rng.ts';

function draw(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe('createRng', () => {
  it('produce la stessa sequenza a parita di seed', () => {
    expect(draw(createRng(42), 20)).toEqual(draw(createRng(42), 20));
  });

  it('produce sequenze diverse con seed diversi', () => {
    expect(draw(createRng(1), 10)).not.toEqual(draw(createRng(2), 10));
  });

  it('resta nell intervallo [0, 1) su 10000 estrazioni', () => {
    const rng = createRng(seedFromString('mediatore'));
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('avanza lo stato a ogni chiamata', () => {
    const rng = createRng(7);
    const values = draw(rng, 100);
    expect(new Set(values).size).toBe(100);
  });

  it('accetta seed negativi e zero', () => {
    expect(draw(createRng(0), 5)).toHaveLength(5);
    expect(draw(createRng(-123), 5)).toEqual(draw(createRng(-123), 5));
  });
});

describe('seedFromString', () => {
  it('e deterministico', () => {
    expect(seedFromString('partita-1')).toBe(seedFromString('partita-1'));
  });

  it('distingue le maiuscole', () => {
    expect(seedFromString('abc')).not.toBe(seedFromString('ABC'));
  });

  it('distingue stringhe diverse', () => {
    expect(seedFromString('partita-1')).not.toBe(seedFromString('partita-2'));
  });

  it('ritorna un intero a 32 bit senza segno', () => {
    for (const s of ['', 'a', 'partita-1', 'Mediatore \u00e8 un gioco']) {
      const seed = seedFromString(s);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});

describe('shuffle', () => {
  it('non muta l array di input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const result = shuffle(input, createRng(99));
    expect(input).toEqual(copy);
    expect(result).not.toBe(input);
  });

  it('produce la stessa permutazione a parita di seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(shuffle(input, createRng(2024))).toEqual(shuffle(input, createRng(2024)));
  });

  it('produce permutazioni diverse con seed diversi', () => {
    const input = Array.from({ length: 40 }, (_, i) => i);
    expect(shuffle(input, createRng(1))).not.toEqual(shuffle(input, createRng(2)));
  });

  it('e una permutazione: stessa lunghezza e stesso multiset', () => {
    const input = [3, 3, 1, 2, 2, 2, 9];
    const result = shuffle(input, createRng(5));
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('regge array vuoto e array di un solo elemento', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(['sola'], createRng(1))).toEqual(['sola']);
  });

  it('non ha bias grossolani su 20000 shuffle di [0, 1, 2]', () => {
    const rng = createRng(seedFromString('bias'));
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i += 1) {
      const key = shuffle([0, 1, 2], rng).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThanOrEqual(2500);
    }
  });
});
