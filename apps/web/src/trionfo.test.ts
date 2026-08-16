import type { Card, HandState, Rank, Suit } from '@mediatore/engine';
import { createDeck, createHandState, playCard, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { contaTrionfi, trionfoNoto } from './trionfo';

const MAZZO = createDeck();
const TRIONFO: Suit = 'bastoni';

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((altra) => altra.suit === suit && altra.rank === rank);
  if (trovata === undefined) throw new Error(`carta inventata: ${suit} ${String(rank)}`);
  return trovata;
}

/** Tre giocatori, trionfo bastoni: al posto 0 tre trionfi, agli altri due. */
function tavolo(monte: Card[] = []): HandState {
  return createHandState({
    config: tableConfig(3, 'monte'),
    dealer: 0,
    trump: TRIONFO,
    alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
    hands: [
      [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta(TRIONFO, 2), carta('coppe', 3)],
      [carta(TRIONFO, 3), carta(TRIONFO, 4), carta('coppe', 4), carta('coppe', 5)],
      [carta(TRIONFO, 5), carta(TRIONFO, 6), carta('coppe', 6), carta('coppe', 7)],
    ],
    monte,
    leader: 0,
  });
}

describe('trionfoNoto', () => {
  it('resta ignoto per tutta la distribuzione', () => {
    expect(trionfoNoto('distribuzione')).toBe(false);
  });

  it('si conosce appena le carte sono finite: col monte e nell amico', () => {
    // Stesso istante in cui si gira l'ultima del monte, o arriva l'ultima
    // carta al cartaro: la fase passa a call e da li' il seme e' di tutti.
    expect(trionfoNoto('call')).toBe(true);
    expect(trionfoNoto('play')).toBe(true);
    expect(trionfoNoto('monte')).toBe(true);
  });
});

describe('contaTrionfi', () => {
  it('prima di giocare conta in giro tutti quelli che non ha in mano', () => {
    // Dieci trionfi, tre in mano: sette girano fra gli altri e nel coperto.
    expect(contaTrionfi(tavolo(), 0)).toEqual({ usciti: 0, inGiro: 7 });
  });

  it('sposta fra gli usciti quelli giocati, base per base', () => {
    let state = tavolo();
    for (const mossa of [carta(TRIONFO, 7), carta(TRIONFO, 3), carta(TRIONFO, 5)]) {
      state = playCard(state, state.turn, mossa.id);
    }

    const conto = contaTrionfi(state, 0);
    expect(conto).toEqual({ usciti: 3, inGiro: 5 });
    // Il conto torna sempre: usciti, in giro e i propri fanno dieci.
    expect(conto.usciti + conto.inGiro + 2).toBe(10);
  });

  it('conta le carte in tavola subito, senza aspettare che la base si chiuda', () => {
    const state = playCard(tavolo(), 0, carta(TRIONFO, 7).id);
    expect(contaTrionfi(state, 0)).toEqual({ usciti: 1, inGiro: 7 });
  });

  it('a chi ha in mano il monte i trionfi del monte non girano piu', () => {
    // Il chiamante della normale le sue carte del monte le ha viste: quelle
    // non sono piu' fra le sorprese. Per gli altri restano nel conto.
    const state = tavolo([carta(TRIONFO, 're'), carta('coppe', 2), carta('spade', 2)]);
    expect(contaTrionfi(state, 0).inGiro).toBe(6);
    expect(contaTrionfi(state, 1).inGiro).toBe(8);
  });
});
