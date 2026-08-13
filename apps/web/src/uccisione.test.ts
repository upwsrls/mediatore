import type { Card, HandState, Rank, Suit } from '@mediatore/engine';
import {
  createDeck,
  createHandState,
  legalPlaysFor,
  playCard,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { uccide } from './uccisione';

const MAZZO = createDeck();
const TRIONFO: Suit = 'coppe';

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((altra) => altra.suit === suit && altra.rank === rank);
  if (trovata === undefined) throw new Error(`carta inventata: ${suit} ${String(rank)}`);
  return trovata;
}

/**
 * Cinque giocatori, trionfo coppe, come la partita in cui il suono sbagliato si
 * e' sentito. Al posto 0 le spade per aprire, al posto 1 nessuna spada: e'
 * quello che puo' tagliare. Al posto 2 le spade ci sono, e allora non puo'.
 */
function tavolo(): HandState {
  return createHandState({
    config: tableConfig(5, 'monte'),
    dealer: 4,
    trump: TRIONFO,
    alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
    hands: [
      [carta('spade', 'asso'), carta('spade', 5), carta(TRIONFO, 4)],
      [carta(TRIONFO, 3), carta(TRIONFO, 5), carta('denari', 2)],
      [carta('spade', 2), carta(TRIONFO, 6), carta('bastoni', 2)],
      [carta('denari', 3), carta(TRIONFO, 7), carta('bastoni', 3)],
      [carta('denari', 4), carta(TRIONFO, 'asso'), carta('bastoni', 4)],
    ],
    monte: [],
    leader: 0,
  });
}

describe('uccide', () => {
  it('base aperta a spade, trionfo coppe: chi gioca coppe sta tagliando', () => {
    const state = playCard(tavolo(), 0, carta('spade', 'asso').id);
    expect(state.turn).toBe(1);
    expect(uccide(state, carta(TRIONFO, 3).id)).toBe(true);
  });

  it('base aperta a COPPE con trionfo coppe: chi risponde coppe non taglia niente', () => {
    // Il caso del suono sbagliato: aperta a trionfo, ogni risposta a seme e' di
    // trionfo, e nessuno sta uccidendo. Si sente il fruscio normale.
    const state = playCard(tavolo(), 0, carta(TRIONFO, 4).id);
    expect(state.currentTrick.plays[0]?.card.suit).toBe(state.trump);
    expect(uccide(state, carta(TRIONFO, 3).id)).toBe(false);
  });

  it('chi apre non uccide mai, nemmeno aprendo a trionfo', () => {
    const state = tavolo();
    expect(uccide(state, carta(TRIONFO, 4).id)).toBe(false);
    expect(uccide(state, carta('spade', 'asso').id)).toBe(false);
  });

  it('chi ha ancora il palo aperto non taglia: quello e un rifiuto, non un taglio', () => {
    // Il palo aperto in mano lo rende un colpo che l'engine non lascia nemmeno
    // giocare. Il suono lo esclude per conto suo, senza appoggiarsi a quello.
    let state = playCard(tavolo(), 0, carta('spade', 'asso').id);
    state = playCard(state, 1, carta(TRIONFO, 3).id);
    expect(state.turn).toBe(2);
    const legali = legalPlaysFor(state, 2).map((c) => c.id);
    expect(legali).toEqual([carta('spade', 2).id]);
    expect(uccide(state, carta(TRIONFO, 6).id)).toBe(false);
  });
});
