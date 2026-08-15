import type { VistaDelBot } from '@mediatore/bot';
import { decidiChiamata, scegliScarti, vistaDaStato } from '@mediatore/bot';
import type { Alliance, Card, Rng, Suit, TableConfig, Variant } from '@mediatore/engine';
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
 * Una smazzata giocata dall'inizio alla fine. Chiamata e scarto al monte
 * restano quelli del bot di serie: qui si addestra solo la carta da giocare.
 *
 * Ogni posto riceve la propria VistaDelBot e nient'altro. Lo stato intero
 * non esce da questo file se non per costruire quella vista.
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

/**
 * Come si sceglie la carta: solo la vista, come al tavolo. Chi gli passasse
 * lo HandState intero lo vedrebbe dal tipo, e i test lo tengono fermo.
 */
export type ScegliCarta = (vista: VistaDelBot, rng: Rng) => Card;

export interface MossaRegistrata {
  posto: number;
  vista: VistaDelBot;
  scelta: Card;
}

export interface EsitoSmazzata {
  quote: readonly number[];
  chiamante: number | null;
  /** Vero se il chiamante ha vinto, falso se ha perso, null se pari o liscio. */
  chiamanteVince: boolean | null;
  mosse: readonly MossaRegistrata[];
  alliance: Alliance;
}

function schieramento(caller: number | null, variant: Variant, hands: Card[][], rng: Rng): Alliance {
  if (caller === null) return { kind: 'liscio' };
  if (variant !== 'amico') return { kind: 'monte', caller, chiamata: 'normale' };

  const chiamabili = callableCards(hands[caller] ?? []);
  const prima = chiamabili[0];
  if (prima === undefined) {
    throw new Error(`il posto ${caller} non ha nessuna carta da chiamare`);
  }
  const indice = Math.min(chiamabili.length - 1, Math.floor(rng() * chiamabili.length));
  const chiamata = chiamabili[indice] ?? prima;
  return { kind: 'amico', caller, calledCard: chiamata.id, friend: null };
}

function chiamaComeIlBot(
  mano: readonly Card[],
  trump: Suit,
  scoperta: Card | null,
  config: TableConfig,
): boolean {
  return decidiChiamata({ mano, trump, scoperta }, config) === 'chiama';
}

/**
 * Chiama e scarta il bot di serie, poi ogni posto gioca le carte con la
 * funzione passata — che vede solo la propria vista.
 */
export function giocaSmazzata(args: {
  tavolo: Tavolo;
  dealer: number;
  seed: number;
  scegli: ScegliCarta | readonly ScegliCarta[];
}): EsitoSmazzata {
  const { tavolo, dealer, seed } = args;
  const config = tableConfig(tavolo.players, tavolo.variant);
  const rng = createRng(seed);
  const dealt = deal(config, dealer, rng);

  const scegliDi = (seat: number): ScegliCarta => {
    if (typeof args.scegli === 'function') return args.scegli;
    const trovato = args.scegli[seat];
    if (trovato === undefined) throw new Error(`manca chi gioca al posto ${seat}`);
    return trovato;
  };

  const scoperta =
    config.monteSize > 0 ? (dealt.monte[dealt.monte.length - 1] ?? null) : null;

  let call = createCallState(config, dealer);
  while (!call.closed) {
    const interrogato = currentCaller(call);
    if (interrogato === null) throw new Error('chiamata senza nessuno da interrogare');
    const mano = dealt.hands[interrogato] ?? [];
    const vuole = chiamaComeIlBot(mano, dealt.trump, scoperta, config);
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
    const scarti = scegliScarti(allargata, dealt.trump, config.monteSize, config.players);
    const scambio = discardToMonte(allargata, scarti, config.monteSize);
    hands[caller] = scambio.hand;
    monte = scambio.monte;
  }

  let state = createHandState({
    config,
    dealer,
    trump: dealt.trump,
    alliance: schieramento(caller, config.variant, hands, rng),
    hands,
    monte,
  });

  const casi = Array.from({ length: config.players }, (_, seat) =>
    createRng(seed * 31 + seat * 7 + 1),
  );
  const mosse: MossaRegistrata[] = [];

  while (!state.finished) {
    const turno = state.turn;
    const caso = casi[turno];
    if (caso === undefined) throw new Error(`manca l'rng del posto ${turno}`);

    // Il filtro: da qui in poi le mani altrui non esistono.
    const vista = vistaDaStato(state, turno);
    const scelta = scegliDi(turno)(vista, caso);
    if (!legalPlaysFor(state, turno).some((carta) => carta.id === scelta.id)) {
      throw new Error(
        `il posto ${turno} ha scelto ${scelta.id}, fuori dalle mosse legali` +
          ` (seed=${seed} tavolo=${tavolo.etichetta})`,
      );
    }
    mosse.push({ posto: turno, vista, scelta });
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
    mosse,
    alliance: state.alliance,
  };
}
