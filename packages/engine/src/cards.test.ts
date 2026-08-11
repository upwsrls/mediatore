import { describe, expect, it } from 'vitest';
import type { Rank } from './cards.ts';
import { RANKS, SUITS, cardPoints, cardStrength, createDeck, totalPoints } from './cards.ts';

const STRENGTH_ORDER: readonly Rank[] = [7, 'asso', 're', 'cavallo', 'fante', 6, 5, 4, 3, 2];

describe('createDeck', () => {
  it('produce 40 carte', () => {
    expect(createDeck()).toHaveLength(40);
  });

  it('non contiene id duplicati', () => {
    const ids = createDeck().map((card) => card.id);
    expect(new Set(ids).size).toBe(40);
  });

  it('assegna 10 carte a ogni seme', () => {
    const deck = createDeck();
    for (const suit of SUITS) {
      expect(deck.filter((card) => card.suit === suit)).toHaveLength(10);
    }
  });

  it('copre ogni combinazione seme/rank con id `${suit}-${rank}`', () => {
    const ids = new Set(createDeck().map((card) => card.id));
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(ids.has(`${suit}-${rank}`)).toBe(true);
      }
    }
  });
});

describe('totalPoints', () => {
  it('vale 60 sul mazzo completo', () => {
    expect(totalPoints(createDeck())).toBe(60);
  });

  it('vale 15 su un seme completo', () => {
    const deck = createDeck();
    for (const suit of SUITS) {
      expect(totalPoints(deck.filter((card) => card.suit === suit))).toBe(15);
    }
  });

  it('vale 0 su un insieme vuoto', () => {
    expect(totalPoints([])).toBe(0);
  });
});

describe('cardPoints', () => {
  it('assegna 0 al 6 e 5 al 7', () => {
    expect(cardPoints(6)).toBe(0);
    expect(cardPoints(7)).toBe(5);
  });

  it('assegna i punti delle figure e dell asso', () => {
    expect(cardPoints('asso')).toBe(4);
    expect(cardPoints('re')).toBe(3);
    expect(cardPoints('cavallo')).toBe(2);
    expect(cardPoints('fante')).toBe(1);
  });

  it('assegna 0 alle cartacce', () => {
    for (const rank of [2, 3, 4, 5, 6] as const) {
      expect(cardPoints(rank)).toBe(0);
    }
  });
});

describe('cardStrength', () => {
  it('decresce strettamente lungo l ordine di presa', () => {
    for (let i = 1; i < STRENGTH_ORDER.length; i += 1) {
      const stronger = STRENGTH_ORDER[i - 1] as Rank;
      const weaker = STRENGTH_ORDER[i] as Rank;
      expect(cardStrength(stronger)).toBeGreaterThan(cardStrength(weaker));
    }
  });

  it('non produce mai due valori uguali per rank diversi', () => {
    const values = RANKS.map((rank) => cardStrength(rank));
    expect(new Set(values).size).toBe(RANKS.length);
  });

  it('copre tutti i rank dichiarati', () => {
    expect([...STRENGTH_ORDER].sort()).toEqual([...RANKS].sort());
  });
});
