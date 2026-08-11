import type { Card, Suit } from './cards.ts';
import { createDeck, totalPoints } from './cards.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';

export type Variant = 'monte' | 'amico';

export interface TableConfig {
  players: number;
  variant: Variant;
  handSize: number;
  monteSize: number;
  tricks: number;
  bases: number;
  maxScore: number;
  threshold: number;
}

/** Punti complessivi delle carte del mazzo, base delle prese esclusa. */
const DECK_POINTS = totalPoints(createDeck());

function layout(players: number, variant: Variant): { handSize: number; monteSize: number } {
  if (variant === 'amico') return { handSize: 8, monteSize: 0 };
  switch (players) {
    case 3:
      return { handSize: 12, monteSize: 4 };
    case 4:
      return { handSize: 9, monteSize: 4 };
    default:
      return { handSize: 7, monteSize: 5 };
  }
}

export function tableConfig(players: number, variant: Variant): TableConfig {
  if (!Number.isInteger(players) || players < 3 || players > 5) {
    throw new Error(`numero di giocatori non valido: ${players} (ammessi 3, 4 o 5)`);
  }
  if (variant === 'amico' && players !== 5) {
    throw new Error(`la variante "amico" richiede 5 giocatori, ricevuti ${players}`);
  }

  const { handSize, monteSize } = layout(players, variant);
  const tricks = handSize;
  const bases = monteSize > 0 ? tricks + 1 : tricks;
  const maxScore = DECK_POINTS + bases;

  return {
    players,
    variant,
    handSize,
    monteSize,
    tricks,
    bases,
    maxScore,
    threshold: Math.floor(maxScore / 2) + 1,
  };
}

/** Il senso antiorario del tavolo e' modellato come incremento dell'indice. */
export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players;
}

export function firstHand(dealer: number, players: number): number {
  return nextSeat(dealer, players);
}

export interface DealResult {
  hands: Card[][];
  monte: Card[];
  trump: Suit;
}

export function deal(config: TableConfig, dealer: number, rng: Rng): DealResult {
  const deck = shuffle(createDeck(), rng);
  const hands: Card[][] = Array.from({ length: config.players }, () => []);

  let seat = firstHand(dealer, config.players);
  let cursor = 0;
  for (let round = 0; round < config.handSize; round += 1) {
    for (let i = 0; i < config.players; i += 1) {
      const hand = hands[seat] as Card[];
      hand.push(deck[cursor] as Card);
      seat = nextSeat(seat, config.players);
      cursor += 1;
    }
  }

  const monte = deck.slice(cursor);
  const lastCard = (config.variant === 'monte' ? monte[monte.length - 1] : deck[deck.length - 1]) as
    | Card
    | undefined;
  if (lastCard === undefined) {
    throw new Error('mazzo esaurito: impossibile determinare il trionfo');
  }

  return { hands, monte, trump: lastCard.suit };
}

/**
 * Oltre alla chiamata normale ci sono tre dichiarazioni piu' impegnative.
 * Cambiano che fine fa il monte, chi apre la prima base e quanto si paga;
 * non cambiano ne' il numero di basi ne' la soglia.
 */
export type TipoChiamata = 'normale' | 'sola' | 'colonna' | 'chiSeLaSente';

export type CallAction = { tipo: 'passo' } | { tipo: 'chiama'; chiamata: TipoChiamata };

export interface CallState {
  order: number[];
  index: number;
  caller: number | null;
  chiamata: TipoChiamata | null;
  closed: boolean;
  liscio: boolean;
}

export function createCallState(config: TableConfig, dealer: number): CallState {
  const order: number[] = [];
  let seat = firstHand(dealer, config.players);
  for (let i = 0; i < config.players; i += 1) {
    order.push(seat);
    seat = nextSeat(seat, config.players);
  }
  return { order, index: 0, caller: null, chiamata: null, closed: false, liscio: false };
}

export function currentCaller(state: CallState): number | null {
  if (state.closed) return null;
  return state.order[state.index] ?? null;
}

/** Le speciali si dichiarano fuori turno, la normale no. */
function fuoriTurno(chiamata: TipoChiamata): boolean {
  return chiamata !== 'normale';
}

/**
 * Il turno vale per chi passa e per chi chiama normale. Una speciale invece
 * puo' arrivare da chiunque e in qualsiasi momento: e' la prima a essere
 * dichiarata che chiude la fase, senza gerarchia fra le tre.
 */
export function applyCall(state: CallState, player: number, action: CallAction): CallState {
  if (state.closed) {
    throw new Error("la fase di chiamata e' gia' conclusa: nessuna decisione da registrare");
  }
  const diTurno = currentCaller(state);
  if (diTurno === null) {
    throw new Error('nessun giocatore da interrogare nella fase di chiamata');
  }

  if (action.tipo === 'chiama') {
    if (!state.order.includes(player)) {
      throw new Error(`giocatore fuori dal tavolo: ${player}`);
    }
    if (!fuoriTurno(action.chiamata) && player !== diTurno) {
      throw new Error(
        `la chiamata normale tocca al giocatore ${diTurno}, non al giocatore ${player}`,
      );
    }
    return {
      order: [...state.order],
      index: state.index,
      caller: player,
      chiamata: action.chiamata,
      closed: true,
      liscio: false,
    };
  }

  if (player !== diTurno) {
    throw new Error(`non tocca al giocatore ${player}: deve rispondere il giocatore ${diTurno}`);
  }

  const index = state.index + 1;
  const exhausted = index >= state.order.length;
  return {
    order: [...state.order],
    index,
    caller: null,
    chiamata: null,
    closed: exhausted,
    liscio: exhausted,
  };
}

/** Quanto vale la posta: normale 1, sola 3, colonna 4, chi se la sente 5. */
export function moltiplicatore(chiamata: TipoChiamata): number {
  switch (chiamata) {
    case 'normale':
      return 1;
    case 'sola':
      return 3;
    case 'colonna':
      return 4;
    default:
      return 5;
  }
}

/** Solo nella normale il chiamante prende il monte e scarta. */
export function serveScambioMonte(chiamata: TipoChiamata): boolean {
  return chiamata === 'normale';
}

/**
 * Chi puo' guardare il monte: nella sola il chiamante lo vede senza toccarlo,
 * nella colonna e nella chi se la sente resta coperto in mezzo al tavolo.
 */
export function chiVedeIlMonte(chiamata: TipoChiamata, caller: number): number | null {
  return chiamata === 'normale' || chiamata === 'sola' ? caller : null;
}

/**
 * Chi gioca la prima carta. Nella sola e nella colonna apre il chiamante,
 * ma a tre l'apertura resta al primo di mano regolare; nella chi se la sente
 * apre l'avversario che si e' fatto avanti.
 */
export function apreLaPrimaBase(args: {
  chiamata: TipoChiamata;
  caller: number;
  dealer: number;
  players: number;
  sceltoDaAvversari: number | null;
}): number {
  const { chiamata, caller, dealer, players, sceltoDaAvversari } = args;

  if (chiamata === 'chiSeLaSente') {
    if (sceltoDaAvversari === null) {
      throw new Error('chi se la sente senza avversario che apre: nessuno si e\' fatto avanti');
    }
    if (sceltoDaAvversari === caller) {
      throw new Error("ad aprire la chi se la sente dev'essere un avversario, non il chiamante");
    }
    if (!Number.isInteger(sceltoDaAvversari) || sceltoDaAvversari < 0 || sceltoDaAvversari >= players) {
      throw new Error(`posto inesistente al tavolo: ${sceltoDaAvversari}`);
    }
    return sceltoDaAvversari;
  }

  if (chiamata === 'normale' || players === 3) return firstHand(dealer, players);
  return caller;
}

const DECK = createDeck();

export function callableCards(hand: Card[]): Card[] {
  const held = new Set(hand.map((card) => card.id));
  const sevens = DECK.filter((card) => card.rank === 7 && !held.has(card.id));
  if (sevens.length > 0) return sevens;
  return DECK.filter((card) => card.rank === 'asso' && !held.has(card.id));
}

export interface MonteExchange {
  hand: Card[];
  monte: Card[];
}

export function takeMonte(hand: Card[], monte: Card[]): Card[] {
  return [...hand, ...monte];
}

export function discardToMonte(
  enlargedHand: Card[],
  discards: Card[],
  monteSize: number,
): MonteExchange {
  if (discards.length !== monteSize) {
    throw new Error(
      `bisogna scartare esattamente ${monteSize} carte, ricevute ${discards.length}`,
    );
  }

  const discardIds = new Set(discards.map((card) => card.id));
  if (discardIds.size !== discards.length) {
    throw new Error("gli scarti contengono la stessa carta piu' volte");
  }

  const heldIds = new Set(enlargedHand.map((card) => card.id));
  for (const card of discards) {
    if (!heldIds.has(card.id)) {
      throw new Error(`carta non presente in mano: ${card.id}`);
    }
  }

  return {
    hand: enlargedHand.filter((card) => !discardIds.has(card.id)),
    monte: [...discards],
  };
}
