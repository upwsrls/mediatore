export type Suit = 'denari' | 'coppe' | 'spade' | 'bastoni';

export type Rank = 2 | 3 | 4 | 5 | 6 | 'fante' | 'cavallo' | 're' | 'asso' | 7;

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export const SUITS: readonly Suit[] = ['denari', 'coppe', 'spade', 'bastoni'];

export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 'fante', 'cavallo', 're', 'asso', 7];

const POINTS: Record<Rank, number> = {
  7: 5,
  asso: 4,
  re: 3,
  cavallo: 2,
  fante: 1,
  6: 0,
  5: 0,
  4: 0,
  3: 0,
  2: 0,
};

/** Ordine di presa dentro lo stesso seme, dal piu' forte al piu' debole. */
const STRENGTH_ORDER: readonly Rank[] = [7, 'asso', 're', 'cavallo', 'fante', 6, 5, 4, 3, 2];

const STRENGTH: Record<Rank, number> = STRENGTH_ORDER.reduce<Record<Rank, number>>(
  (acc, rank, index) => {
    acc[rank] = STRENGTH_ORDER.length - 1 - index;
    return acc;
  },
  {} as Record<Rank, number>,
);

export function cardPoints(rank: Rank): number {
  return POINTS[rank];
}

export function cardStrength(rank: Rank): number {
  return STRENGTH[rank];
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

export function totalPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card.rank), 0);
}
