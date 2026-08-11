import { scegliCarta, vistaDaStato } from '@mediatore/bot';
import type { Card, HandState, Rng } from '@mediatore/engine';
import { beats, cardPoints, currentWinner, ledSuit } from '@mediatore/engine';

/** Sceglie sempre una carta fra quelle passate in `legal`. */
export type Agent = (legal: Card[], state: HandState, me: number) => Card;

export function pickOne<T>(items: T[], rng: Rng): T {
  if (items.length === 0) {
    throw new Error('nessun elemento fra cui scegliere');
  }
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index] as T;
}

export function randomAgent(rng: Rng): Agent {
  return (legal) => pickOne(legal, rng);
}

export function firstLegalAgent(): Agent {
  return (legal) => {
    const card = legal[0];
    if (card === undefined) {
      throw new Error('nessuna mossa legale disponibile');
    }
    return card;
  };
}

function cheapest(cards: Card[], rng: Rng): Card {
  const minimo = Math.min(...cards.map((card) => cardPoints(card.rank)));
  return pickOne(
    cards.filter((card) => cardPoints(card.rank) === minimo),
    rng,
  );
}

/** Carta attualmente vincente nella presa, null se la presa e' ancora vuota. */
function winningCard(state: HandState): Card | null {
  const winner = currentWinner(state.currentTrick);
  if (winner === null) return null;
  return state.currentTrick.plays.find((play) => play.player === winner)?.card ?? null;
}

/**
 * Euristica minima: prende la presa spendendo il meno possibile, altrimenti
 * scarta la carta che vale meno. Non aggiunge regole, usa solo beats().
 */
export function greedyAgent(rng: Rng): Agent {
  return (legal, state) => {
    const led = ledSuit(state.currentTrick);
    const incumbent = winningCard(state);
    const vincenti =
      led === null || incumbent === null
        ? []
        : legal.filter((card) => beats(card, incumbent, state.trump, led));
    return cheapest(vincenti.length > 0 ? vincenti : legal, rng);
  };
}

/**
 * Il giocatore vero di @mediatore/bot. Lo stato completo non glielo passa
 * nessuno: si ferma alla vista, che le mani altrui non le contiene.
 */
export function botAgent(rng: Rng): Agent {
  return (_legal, state, me) => scegliCarta(vistaDaStato(state, me), rng);
}
