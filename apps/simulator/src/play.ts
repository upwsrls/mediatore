import type {
  Alliance,
  CallAction,
  Card,
  HandScore,
  HandState,
  Rng,
  Suit,
  TableConfig,
  Variant,
} from '@mediatore/engine';
import {
  applyCall,
  callableCards,
  cardPoints,
  createCallState,
  createHandState,
  createRng,
  currentCaller,
  deal,
  discardToMonte,
  legalPlaysFor,
  playCard,
  scoreHand,
  settle,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import type { Agent } from './agents.ts';
import { pickOne } from './agents.ts';
import { formatHand } from './format.ts';

/** Il tavolo appena distribuito, come lo vede chi deve decidere se chiamare. */
export interface TavoloDistribuito {
  hands: Card[][];
  config: TableConfig;
  trump: Suit;
  /** Il monte coperto, con in fondo la carta che ha girato il trionfo. */
  monte: Card[];
  dealer: number;
  rng: Rng;
}

export type ChooseCaller = (tavolo: TavoloDistribuito) => number | null;

/** Cosa rimette nel monte chi l'ha preso, viste le carte che si ritrova. */
export type ChooseDiscards = (
  allargata: Card[],
  trump: Suit,
  quanti: number,
  config: TableConfig,
  rng: Rng,
) => Card[];

export interface PlayOptions {
  players: number;
  variant: Variant;
  dealer: number;
  seed: number;
  agents: Agent[];
  chooseCaller?: ChooseCaller;
  chooseDiscards?: ChooseDiscards;
  onEvent?: (e: SimEvent) => void;
}

export type SimEvent =
  | { type: 'deal'; hands: Card[][]; monte: Card[]; trump: Suit }
  | { type: 'call'; player: number; action: CallAction }
  | { type: 'callClosed'; caller: number | null; liscio: boolean }
  | { type: 'monteExchange'; taken: Card[]; discarded: Card[] }
  | { type: 'friendCalled'; cardId: string }
  | { type: 'play'; player: number; card: Card }
  | { type: 'friendRevealed'; player: number }
  | { type: 'trickEnd'; winner: number; points: number }
  | { type: 'handEnd'; score: HandScore; settlement: number[] };

export interface PlayResult {
  config: TableConfig;
  finalState: HandState;
  score: HandScore;
  settlement: number[];
  events: SimEvent[];
}

/** Con probabilita' circa 1/3 chiama un giocatore a caso, altrimenti si va in liscio. */
export const defaultChooseCaller: ChooseCaller = ({ config, rng }) => {
  if (rng() >= 1 / 3) return null;
  return Math.min(config.players - 1, Math.floor(rng() * config.players));
};

/** Le `count` carte che valgono meno, con spareggio affidato all'rng. */
export function cheapestCards(cards: Card[], count: number, rng: Rng): Card[] {
  const pool = [...cards];
  const scelte: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    const minimo = Math.min(...pool.map((card) => cardPoints(card.rank)));
    const scelta = pickOne(
      pool.filter((card) => cardPoints(card.rank) === minimo),
      rng,
    );
    scelte.push(scelta);
    pool.splice(
      pool.findIndex((card) => card.id === scelta.id),
      1,
    );
  }
  return scelte;
}

export function playHand(opts: PlayOptions): PlayResult {
  const config = tableConfig(opts.players, opts.variant);
  const rng = createRng(opts.seed);
  const events: SimEvent[] = [];
  const emit = (event: SimEvent): void => {
    events.push(event);
    opts.onEvent?.(event);
  };

  // Senza il seed nel messaggio un fallimento del fuzzer non e' riproducibile.
  const fail = (message: string, state?: HandState): Error => {
    const contesto = [
      `seed=${opts.seed}`,
      `tavolo=${opts.players} ${opts.variant}`,
      `mazziere=${opts.dealer}`,
    ];
    if (state !== undefined) {
      contesto.push(
        `presa=${state.completedTricks.length + 1}/${config.tricks}`,
        `turno=${state.turn}`,
        `mani=[${state.hands.map((hand) => formatHand(hand)).join(' | ')}]`,
      );
    }
    return new Error(`${message} (${contesto.join(' ')})`);
  };

  const dealt = deal(config, opts.dealer, rng);
  emit({ type: 'deal', hands: dealt.hands.map((hand) => [...hand]), monte: [...dealt.monte], trump: dealt.trump });

  const scelto = (opts.chooseCaller ?? defaultChooseCaller)({
    hands: dealt.hands,
    config,
    trump: dealt.trump,
    monte: dealt.monte,
    dealer: opts.dealer,
    rng,
  });

  let call = createCallState(config, opts.dealer);
  while (!call.closed) {
    const interrogato = currentCaller(call);
    if (interrogato === null) {
      throw fail('fase di chiamata senza giocatore da interrogare');
    }
    // Il simulatore per ora dichiara sempre e solo la chiamata normale.
    const action: CallAction =
      interrogato === scelto ? { tipo: 'chiama', chiamata: 'normale' } : { tipo: 'passo' };
    emit({ type: 'call', player: interrogato, action });
    call = applyCall(call, interrogato, action);
  }
  emit({ type: 'callClosed', caller: call.caller, liscio: call.liscio });

  const caller = call.caller;
  const hands = dealt.hands.map((hand) => [...hand]);
  let monte = [...dealt.monte];

  if (caller !== null && config.monteSize > 0) {
    const mano = hands[caller] as Card[];
    const allargata = takeMonte(mano, monte);
    const scarti =
      opts.chooseDiscards?.(allargata, dealt.trump, config.monteSize, config, rng) ??
      cheapestCards(allargata, config.monteSize, rng);
    const scambio = discardToMonte(allargata, scarti, config.monteSize);
    hands[caller] = scambio.hand;
    monte = scambio.monte;
    emit({ type: 'monteExchange', taken: [...dealt.monte], discarded: [...scambio.monte] });
  }

  let alliance: Alliance;
  if (caller === null) {
    alliance = { kind: 'liscio' };
  } else if (config.variant === 'amico') {
    const chiamabili = callableCards(hands[caller] as Card[]);
    const chiamata = pickOne(chiamabili, rng);
    emit({ type: 'friendCalled', cardId: chiamata.id });
    alliance = { kind: 'amico', caller, calledCard: chiamata.id, friend: null };
  } else {
    alliance = { kind: 'monte', caller, chiamata: 'normale' };
  }

  const carteInGioco = [...hands.flat(), ...monte];
  if (new Set(carteInGioco.map((card) => card.id)).size !== 40) {
    throw fail(`carte perse o duplicate: ${carteInGioco.length} carte in tavola`);
  }

  let state = createHandState({
    config,
    dealer: opts.dealer,
    trump: dealt.trump,
    alliance,
    hands,
    monte,
  });

  while (!state.finished) {
    const player = state.turn;
    const legal = legalPlaysFor(state, player);
    if (legal.length === 0) {
      throw fail(`nessuna mossa legale per il posto ${player}`, state);
    }
    const agent = opts.agents[player];
    if (agent === undefined) {
      throw fail(`manca l'agent per il posto ${player}`, state);
    }

    const scelta = agent(legal, state, player);
    if (!legal.some((card) => card.id === scelta.id)) {
      throw fail(
        `l'agent del posto ${player} ha scelto ${scelta.id}, fuori dalle mosse legali` +
          ` [${legal.map((card) => card.id).join(', ')}]`,
        state,
      );
    }

    const precedente = state;
    state = playCard(state, player, scelta.id);
    emit({ type: 'play', player, card: scelta });

    const primaNascosto =
      precedente.alliance.kind === 'amico' && precedente.alliance.friend === null;
    const oraRivelato = state.alliance.kind === 'amico' ? state.alliance.friend : null;
    if (primaNascosto && oraRivelato !== null) {
      emit({ type: 'friendRevealed', player: oraRivelato });
    }

    if (state.completedTricks.length > precedente.completedTricks.length) {
      const presa = state.completedTricks[state.completedTricks.length - 1];
      if (presa === undefined) {
        throw fail('presa completata ma non registrata', state);
      }
      emit({ type: 'trickEnd', winner: presa.winner, points: presa.points });
    }
  }

  if (state.completedTricks.length !== config.tricks) {
    throw fail(
      `prese giocate ${state.completedTricks.length}, attese ${config.tricks}`,
      state,
    );
  }
  if (state.hands.some((hand) => hand.length > 0)) {
    throw fail('smazzata conclusa con carte ancora in mano', state);
  }

  const score = scoreHand(state);
  const totale = score.perPlayer.reduce((sum, points) => sum + points, 0);
  if (totale !== config.maxScore) {
    throw fail(`punti totali ${totale}, attesi ${config.maxScore}`, state);
  }

  const settlement = settle(state, score);
  const saldo = settlement.reduce((sum, quota) => sum + quota, 0);
  if (saldo !== 0) {
    throw fail(`il regolamento non chiude in pari: saldo ${saldo}`, state);
  }

  emit({ type: 'handEnd', score, settlement });

  return { config, finalState: state, score, settlement, events };
}
