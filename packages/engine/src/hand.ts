import type { Card, Suit } from './cards.ts';
import { totalPoints } from './cards.ts';
import type { TableConfig, TipoChiamata } from './deal.ts';
import { firstHand, moltiplicatore, nextSeat } from './deal.ts';
import type { IsAlly, PlayedCard, Trick } from './trick.ts';
import { currentWinner, legalPlays, trickPoints } from './trick.ts';

export type Alliance =
  | { kind: 'monte'; caller: number; chiamata: TipoChiamata }
  | { kind: 'amico'; caller: number; calledCard: string; friend: number | null }
  | { kind: 'liscio' };

/**
 * Col monte il chiamante e' solo contro tutti: gli altri formano una squadra
 * dal primo momento. Nell'amico, invece, finche' il 7 non esce nessuno sa
 * chi sta con chi, quindi non ci sono squadre: e' l'obbligo di superare a
 * costringere l'amico a scoprirsi.
 *
 * Sola, colonna e chi se la sente non cambiano niente qui: il chiamante e'
 * gia' solo contro tutti nella normale. Pesano su monte e pagamenti.
 */
export function isAllyFor(alliance: Alliance): IsAlly {
  if (alliance.kind === 'monte') {
    const { caller } = alliance;
    return (a, b) => a === b || (a !== caller && b !== caller);
  }
  if (alliance.kind === 'amico' && alliance.friend !== null) {
    const { caller, friend } = alliance;
    const inPair = (player: number): boolean => player === caller || player === friend;
    return (a, b) => inPair(a) === inPair(b);
  }
  return (a, b) => a === b;
}

export interface CompletedTrick {
  winner: number;
  cards: PlayedCard[];
  points: number;
}

export interface HandState {
  config: TableConfig;
  dealer: number;
  trump: Suit;
  alliance: Alliance;
  hands: Card[][];
  monte: Card[];
  currentTrick: Trick;
  turn: number;
  completedTricks: CompletedTrick[];
  /** progression[p][t] = punti totali del giocatore p dopo la presa t. */
  progression: number[][];
  finished: boolean;
}

/**
 * Chi apre non e' sempre il primo di mano: nella sola e nella colonna apre il
 * chiamante, nella chi se la sente un avversario. Il leader arriva da
 * apreLaPrimaBase; senza, vale l'apertura regolare.
 */
export function createHandState(args: {
  config: TableConfig;
  dealer: number;
  trump: Suit;
  alliance: Alliance;
  hands: Card[][];
  monte: Card[];
  leader?: number;
}): HandState {
  const turn = args.leader ?? firstHand(args.dealer, args.config.players);
  if (!Number.isInteger(turn) || turn < 0 || turn >= args.config.players) {
    throw new Error(`chi apre non e' un posto del tavolo: ${turn}`);
  }
  return {
    config: args.config,
    dealer: args.dealer,
    trump: args.trump,
    alliance: args.alliance,
    hands: args.hands.map((hand) => [...hand]),
    monte: [...args.monte],
    currentTrick: { leader: turn, trump: args.trump, plays: [] },
    turn,
    completedTricks: [],
    progression: Array.from({ length: args.config.players }, () => []),
    finished: false,
  };
}

export function legalPlaysFor(state: HandState, player: number): Card[] {
  if (state.finished || state.turn !== player) return [];
  const hand = state.hands[player];
  if (hand === undefined) return [];
  return legalPlays(hand, state.currentTrick, player, isAllyFor(state.alliance));
}

function revealFriend(alliance: Alliance, player: number, cardId: string): Alliance {
  if (alliance.kind !== 'amico' || alliance.friend !== null) return alliance;
  return alliance.calledCard === cardId ? { ...alliance, friend: player } : alliance;
}

export function playCard(state: HandState, player: number, cardId: string): HandState {
  if (state.finished) {
    throw new Error("la smazzata e' gia' conclusa: nessuna carta da giocare");
  }
  if (state.turn !== player) {
    throw new Error(`non tocca al giocatore ${player}: deve giocare il giocatore ${state.turn}`);
  }

  const hand = state.hands[player];
  if (hand === undefined) {
    throw new Error(`giocatore inesistente: ${player}`);
  }
  const card = hand.find((c) => c.id === cardId);
  if (card === undefined) {
    throw new Error(`il giocatore ${player} non ha in mano la carta ${cardId}`);
  }
  if (!legalPlaysFor(state, player).some((c) => c.id === cardId)) {
    throw new Error(`giocata non consentita: ${cardId}`);
  }

  const hands = state.hands.map((seatHand, seat) =>
    seat === player ? seatHand.filter((c) => c.id !== cardId) : [...seatHand],
  );
  const plays: PlayedCard[] = [...state.currentTrick.plays, { player, card }];
  // La rivelazione arriva dopo il controllo di legalita': la giocata e' stata
  // valutata con l'amico ancora considerato avversario.
  const alliance = revealFriend(state.alliance, player, cardId);

  if (plays.length < state.config.players) {
    return {
      ...state,
      alliance,
      hands,
      monte: [...state.monte],
      currentTrick: { ...state.currentTrick, plays },
      turn: nextSeat(state.turn, state.config.players),
      completedTricks: [...state.completedTricks],
      progression: state.progression.map((row) => [...row]),
    };
  }

  const completed: Trick = { ...state.currentTrick, plays };
  const winner = currentWinner(completed);
  if (winner === null) {
    throw new Error('presa senza vincitore: stato incoerente');
  }
  const points = trickPoints(completed);
  const isLastTrick = state.completedTricks.length + 1 === state.config.tricks;
  // Chi vince l'ultima presa conquista anche il monte, con la sua base.
  const monteBonus = isLastTrick && state.monte.length > 0 ? totalPoints(state.monte) + 1 : 0;

  const progression = state.progression.map((row, seat) => {
    const previous = row[row.length - 1] ?? 0;
    const gained = seat === winner ? points + monteBonus : 0;
    return [...row, previous + gained];
  });

  return {
    ...state,
    alliance,
    hands,
    monte: [...state.monte],
    currentTrick: { leader: winner, trump: state.trump, plays: [] },
    turn: winner,
    completedTricks: [...state.completedTricks, { winner, cards: plays, points }],
    progression,
    finished: isLastTrick,
  };
}

/**
 * Le basi le ha prese tutte una parte sola. A favore quando le fa il
 * chiamante (o la coppia nell'amico), contro quando il chiamante non ne fa
 * nemmeno una, liscio quando uno solo le prende tutte e l'esito si ribalta.
 */
export type Cappotto = 'favore' | 'contro' | 'liscio';

export interface HandScore {
  perPlayer: number[];
  reachedAtTrick: number[];
  callerSide: number | null;
  opponentSide: number | null;
  threshold: number;
  callerWins: boolean | null;
  tie: boolean;
  /** Nel cappotto liscio non c'e' un perdente da punti: vince chi ha preso tutto. */
  liscioLoser: number | null;
  liscioSecond: number | null;
  cappotto: Cappotto | null;
  /** Attorno a chi gira il cappotto: chi le ha prese tutte o chi non ne ha presa nessuna. */
  cappottoDi: number | null;
  /** Partite in piu' a carico del chiamante che perde con pochi punti: 0, 1 o 2. */
  penalitaSoglia: number;
}

/** Sotto questa non si perde: si sprofonda. */
const SOGLIA_BASSA = 18;

/** La seconda soglia esiste solo a tre, dove le carte in mano sono tante. */
const SOGLIA_ALTA = 25;

/**
 * Chiamare con una mano che non regge si paga a parte: chi perde aggiunge
 * partite alla posta a seconda di quanti punti ha racimolato. Non e' una
 * moltiplicazione, e' un supplemento.
 */
export function penalitaDaSoglia(punti: number, players: number): number {
  if (punti < SOGLIA_BASSA) return players === 3 ? 2 : 1;
  if (players === 3 && punti < SOGLIA_ALTA) return 1;
  return 0;
}

/**
 * Quante prese ha vinto ciascuno. Il cappotto si conta di basi, non di punti:
 * il monte non e' una presa giocata, ma va per forza a chi vince l'ultima, e
 * chi le vince tutte vince anche quella.
 */
function basiVinte(state: HandState): number[] {
  const conteggio = Array.from({ length: state.config.players }, () => 0);
  for (const presa of state.completedTricks) {
    const vinte = conteggio[presa.winner];
    if (vinte === undefined) {
      throw new Error(`presa vinta da un posto inesistente: ${presa.winner}`);
    }
    conteggio[presa.winner] = vinte + 1;
  }
  return conteggio;
}

/** Ordina i posti dal peggiore: piu' punti, poi chi li ha raggiunti prima, poi indice minore. */
function liscioRanking(perPlayer: number[], reachedAtTrick: number[]): number[] {
  return perPlayer
    .map((points, seat) => ({ points, reached: reachedAtTrick[seat] ?? -1, seat }))
    .sort((a, b) => b.points - a.points || a.reached - b.reached || a.seat - b.seat)
    .map((entry) => entry.seat);
}

export function scoreHand(state: HandState): HandScore {
  if (!state.finished) {
    throw new Error("la smazzata non e' ancora conclusa: impossibile contare i punti");
  }

  const perPlayer = state.progression.map((row) => row[row.length - 1] ?? 0);
  const reachedAtTrick = state.progression.map((row) => {
    let last = -1;
    let previous = 0;
    row.forEach((cumulative, trickIndex) => {
      if (cumulative > previous) last = trickIndex;
      previous = cumulative;
    });
    return last;
  });

  const threshold = state.config.threshold;
  const sumOf = (seats: number[]): number =>
    seats.reduce((sum, seat) => sum + (perPlayer[seat] ?? 0), 0);

  const tricks = state.config.tricks;
  const basi = basiVinte(state);
  const preseContate = basi.reduce((somma, quante) => somma + quante, 0);
  if (preseContate !== tricks) {
    throw new Error(`prese contate ${preseContate} invece di ${tricks}: stato incoerente`);
  }
  const leHaPreseTutte = (seats: number[]): boolean =>
    tricks > 0 && seats.reduce((somma, seat) => somma + (basi[seat] ?? 0), 0) === tricks;

  if (state.alliance.kind === 'liscio') {
    // Chi prende tutte le basi nel liscio non perde per aver fatto piu' punti:
    // l'esito si ribalta e vince lui, quindi non c'e' nessun perdente da punti.
    const cappottista = basi.findIndex((_, seat) => leHaPreseTutte([seat]));
    if (cappottista !== -1) {
      return {
        perPlayer,
        reachedAtTrick,
        callerSide: null,
        opponentSide: null,
        threshold,
        callerWins: null,
        tie: false,
        liscioLoser: null,
        liscioSecond: null,
        cappotto: 'liscio',
        cappottoDi: cappottista,
        penalitaSoglia: 0,
      };
    }

    const ranking = liscioRanking(perPlayer, reachedAtTrick);
    return {
      perPlayer,
      reachedAtTrick,
      callerSide: null,
      opponentSide: null,
      threshold,
      callerWins: null,
      tie: false,
      liscioLoser: ranking[0] ?? null,
      liscioSecond: state.config.players === 5 ? (ranking[1] ?? null) : null,
      cappotto: null,
      cappottoDi: null,
      // Senza chiamante non c'e' nessuno da punire per aver chiamato.
      penalitaSoglia: 0,
    };
  }

  const callerTeam =
    state.alliance.kind === 'amico' && state.alliance.friend !== null
      ? [state.alliance.caller, state.alliance.friend]
      : [state.alliance.caller];
  const opponents = perPlayer
    .map((_, seat) => seat)
    .filter((seat) => !callerTeam.includes(seat));

  const callerSide = sumOf(callerTeam);
  const opponentSide = sumOf(opponents);
  const tie = callerSide === opponentSide;

  // Chi non fa nemmeno una base non e' stato compagno di nessuno: il chiamante
  // a secco paga il cappotto anche se l'amico ha preso, e viene prima del
  // cappotto della coppia.
  const caller = state.alliance.caller;
  const cappotto: Cappotto | null =
    (basi[caller] ?? 0) === 0 ? 'contro' : leHaPreseTutte(callerTeam) ? 'favore' : null;

  const callerWins = tie ? false : callerSide >= threshold;
  // Le soglie puniscono solo chi chiama e perde: chi vince ha gia' fatto il
  // suo, e in pareggio non paga nessuno. Nell'amico i punti sono quelli della
  // coppia, ma valgono solo se il chiamante ha portato a casa almeno una base:
  // a secco non sono punti suoi, e il cappotto contro e' gia' il massimo.
  const puntiNonSuoi = state.alliance.kind === 'amico' && cappotto === 'contro';
  const penalitaSoglia =
    callerWins || tie || puntiNonSuoi
      ? 0
      : penalitaDaSoglia(callerSide, state.config.players);

  return {
    perPlayer,
    reachedAtTrick,
    callerSide,
    opponentSide,
    threshold,
    callerWins,
    tie,
    liscioLoser: null,
    liscioSecond: null,
    cappotto,
    cappottoDi: cappotto === null ? null : caller,
    penalitaSoglia,
  };
}

/**
 * Nessuno ha detto "me la sento io" entro il tempo: gli avversari perdono
 * senza giocare, e pagano la chi se la sente piena.
 */
export function settleChiSeLaSenteScaduto(config: TableConfig, caller: number): number[] {
  const players = config.players;
  if (!Number.isInteger(caller) || caller < 0 || caller >= players) {
    throw new Error(`chiamante inesistente al tavolo: ${caller}`);
  }
  const posta = moltiplicatore('chiSeLaSente');
  const settlement = Array.from({ length: players }, () => -posta);
  settlement[caller] = posta * (players - 1);
  return settlement;
}

export function settle(state: HandState, score: HandScore): number[] {
  const players = state.config.players;
  const settlement = Array.from({ length: players }, () => 0);

  // Cappotto e soglie aggiungono partite: si sommano alla posta della
  // dichiarazione, non la moltiplicano. Liscio e amico partono sempre dalla
  // posta semplice.
  const dichiarata = state.alliance.kind === 'monte' ? moltiplicatore(state.alliance.chiamata) : 1;
  const posta = dichiarata + (score.cappotto === null ? 0 : 1) + score.penalitaSoglia;
  const paga = (seat: number, quota: number): void => {
    settlement[seat] = quota * posta;
  };

  /** Uno riscuote (o paga) da tutti gli altri: verso 1 incassa, -1 sborsa. */
  const soloControTutti = (uno: number, verso: number): number[] => {
    paga(uno, verso * (players - 1));
    for (let seat = 0; seat < players; seat += 1) {
      if (seat !== uno) paga(seat, -verso);
    }
    return settlement;
  };

  /** La coppia dell'amico: il chiamante vale due quote, il compagno una. */
  const coppiaControTutti = (uno: number, socio: number, verso: number): number[] => {
    paga(uno, verso * 2);
    paga(socio, verso);
    for (let seat = 0; seat < players; seat += 1) {
      if (seat !== uno && seat !== socio) paga(seat, -verso);
    }
    return settlement;
  };

  const cappottoDi = score.cappottoDi;
  if (score.cappotto !== null && cappottoDi === null) {
    throw new Error('cappotto senza un giocatore attorno a cui girare: stato incoerente');
  }

  // Il cappotto si conta di basi, non di punti: decide da solo, anche quando i
  // punti direbbero pareggio o darebbero il contrario.
  if (score.cappotto === 'liscio' && cappottoDi !== null) {
    return soloControTutti(cappottoDi, 1);
  }
  if (score.cappotto === 'contro' && cappottoDi !== null) {
    // Chi non fa nemmeno una base paga tutti, compreso il compagno che aveva.
    return soloControTutti(cappottoDi, -1);
  }

  if (score.tie) return settlement;

  if (state.alliance.kind === 'liscio') {
    const loser = score.liscioLoser;
    if (loser === null) {
      throw new Error('liscio senza perdente: stato incoerente');
    }

    if (players === 5) {
      const second = score.liscioSecond;
      if (second === null) {
        throw new Error('liscio a cinque senza secondo perdente: stato incoerente');
      }
      paga(loser, -2);
      paga(second, -1);
      for (let seat = 0; seat < players; seat += 1) {
        if (seat !== loser && seat !== second) paga(seat, 1);
      }
      return settlement;
    }

    return soloControTutti(loser, -1);
  }

  if (score.callerWins === null) {
    throw new Error('esito della chiamata non determinato: stato incoerente');
  }
  // Il cappotto a favore e' una vittoria: cambia solo quanto vale, gia' nella posta.
  const sign = score.callerWins ? 1 : -1;
  const caller = state.alliance.caller;
  const friend = state.alliance.kind === 'amico' ? state.alliance.friend : null;

  // Chiamante solo contro tutti: vale anche per l'amico mai rivelato.
  if (friend === null) return soloControTutti(caller, sign);
  return coppiaControTutti(caller, friend, sign);
}
