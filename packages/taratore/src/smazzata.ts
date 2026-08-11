import type {
  Alliance,
  Card,
  HandState,
  Rng,
  Suit,
  TableConfig,
  Variant,
} from '@mediatore/engine';
import {
  applyCall,
  callableCards,
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

/**
 * Una smazzata giocata dall'inizio alla fine, senza nessuno che guardi. Il
 * taratore ne ha bisogno a centinaia di migliaia, e ogni posto deve poter
 * decidere con i suoi numeri: per questo non si riusa il simulatore, che i
 * parametri li ha uguali per tutti.
 */

export type TavoloId = '3' | '4' | '5' | 'amico';

export interface Tavolo {
  id: TavoloId;
  players: number;
  variant: Variant;
  etichetta: string;
}

export const TAVOLI: readonly Tavolo[] = [
  { id: '3', players: 3, variant: 'monte', etichetta: '3 monte' },
  { id: '4', players: 4, variant: 'monte', etichetta: '4 monte' },
  { id: '5', players: 5, variant: 'monte', etichetta: '5 monte' },
  { id: 'amico', players: 5, variant: 'amico', etichetta: '5 amico' },
];

/** Come un posto decide: chiamata, scarto al monte e carta da giocare. */
export interface Giocatore {
  chiama: (
    mano: readonly Card[],
    trump: Suit,
    /** La carta scoperta sopra il monte, che chi chiama si porta in mano. */
    scoperta: Card | null,
    config: TableConfig,
  ) => boolean;
  scarta: (allargata: Card[], trump: Suit, quanti: number, config: TableConfig) => Card[];
  gioca: (state: HandState, io: number, rng: Rng) => Card;
}

export interface EsitoSmazzata {
  /** Quanto ha incassato o pagato ciascun posto: la somma fa sempre zero. */
  quote: readonly number[];
  chiamante: number | null;
  /** Vero se il chiamante ha vinto, falso se ha perso, null se pari o liscio. */
  chiamanteVince: boolean | null;
}

/**
 * Chi sta con chi. Nell'amico la carta chiamata non e' fra i numeri da
 * tarare: si prende sempre la prima chiamabile, cosi' non aggiunge rumore
 * alla misura.
 */
function schieramento(caller: number | null, variant: Variant, hands: Card[][]): Alliance {
  if (caller === null) return { kind: 'liscio' };
  if (variant !== 'amico') return { kind: 'monte', caller, chiamata: 'normale' };

  const chiamabile = callableCards(hands[caller] ?? [])[0];
  if (chiamabile === undefined) {
    throw new Error(`il posto ${caller} non ha nessuna carta da chiamare`);
  }
  return { kind: 'amico', caller, calledCard: chiamabile.id, friend: null };
}

export function giocaSmazzata(args: {
  tavolo: Tavolo;
  dealer: number;
  seed: number;
  posti: readonly Giocatore[];
}): EsitoSmazzata {
  const { tavolo, dealer, seed, posti } = args;
  const config = tableConfig(tavolo.players, tavolo.variant);
  const rng = createRng(seed);
  const dealt = deal(config, dealer, rng);

  const giocatore = (seat: number): Giocatore => {
    const trovato = posti[seat];
    if (trovato === undefined) throw new Error(`manca il giocatore del posto ${seat}`);
    return trovato;
  };

  // In fondo al monte c'e' la carta che ha girato il trionfo: sta scoperta e
  // la vedono tutti. Senza monte quella carta resta in mano al mazziere.
  const scoperta =
    config.monteSize > 0 ? (dealt.monte[dealt.monte.length - 1] ?? null) : null;

  let call = createCallState(config, dealer);
  while (!call.closed) {
    const interrogato = currentCaller(call);
    if (interrogato === null) throw new Error('chiamata senza nessuno da interrogare');
    const mano = dealt.hands[interrogato] ?? [];
    const vuole = giocatore(interrogato).chiama(mano, dealt.trump, scoperta, config);
    call = applyCall(
      call,
      interrogato,
      vuole ? { tipo: 'chiama', chiamata: 'normale' } : { tipo: 'passo' },
    );
  }

  const caller = call.caller;
  const hands = dealt.hands.map((mano) => [...mano]);
  let monte = [...dealt.monte];

  if (caller !== null && config.monteSize > 0) {
    const allargata = takeMonte(hands[caller] as Card[], monte);
    const scarti = giocatore(caller).scarta(allargata, dealt.trump, config.monteSize, config);
    const scambio = discardToMonte(allargata, scarti, config.monteSize);
    hands[caller] = scambio.hand;
    monte = scambio.monte;
  }

  let state = createHandState({
    config,
    dealer,
    trump: dealt.trump,
    alliance: schieramento(caller, config.variant, hands),
    hands,
    monte,
  });

  // Un rng per posto: le scelte a pari merito restano casuali ma ripetibili.
  const casi = Array.from({ length: config.players }, (_, seat) =>
    createRng(seed * 31 + seat * 7 + 1),
  );

  while (!state.finished) {
    const turno = state.turn;
    const caso = casi[turno];
    if (caso === undefined) throw new Error(`manca l'rng del posto ${turno}`);
    const scelta = giocatore(turno).gioca(state, turno, caso);
    if (!legalPlaysFor(state, turno).some((carta) => carta.id === scelta.id)) {
      throw new Error(
        `il posto ${turno} ha scelto ${scelta.id}, fuori dalle mosse legali` +
          ` (seed=${seed} tavolo=${tavolo.etichetta})`,
      );
    }
    state = playCard(state, turno, scelta.id);
  }

  const score = scoreHand(state);
  const quote = settle(state, score);
  const saldo = quote.reduce((somma, quota) => somma + quota, 0);
  if (saldo !== 0) {
    throw new Error(`il regolamento non chiude in pari: saldo ${saldo} (seed=${seed})`);
  }

  return {
    quote,
    chiamante: caller,
    chiamanteVince: score.tie ? null : (score.callerWins ?? null),
  };
}
