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
 * Una smazzata dall'inizio alla fine. Chiamata e scarto restano del bot
 * di serie: qui si confronta solo la carta da giocare.
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

export type ScegliCarta = (vista: VistaDelBot, rng: Rng) => Card;

export interface EsitoSmazzata {
  quote: readonly number[];
  chiamante: number | null;
  chiamanteVince: boolean | null;
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

  while (!state.finished) {
    const turno = state.turn;
    const caso = casi[turno];
    if (caso === undefined) throw new Error(`manca l'rng del posto ${turno}`);
    const vista = vistaDaStato(state, turno);
    const scelta = scegliDi(turno)(vista, caso);
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
    alliance: state.alliance,
  };
}
