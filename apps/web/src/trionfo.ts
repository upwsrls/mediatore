import { carteUscite, vistaDaStato } from '@mediatore/bot';
import type { Card, DealResult, HandState, TableConfig } from '@mediatore/engine';

/**
 * Il seme si vede solo quando e' stato girato: ultima carta del monte, o
 * ultima carta distribuita nella variante amico. Prima, mentre le carte
 * arrivano, non e' ancora noto a nessuno, e non deve trapelare.
 */
export function trionfoNoto(phase: string): boolean {
  return phase !== 'distribuzione';
}

/**
 * La carta che fissa il trionfo, presa dal risultato di deal().
 * Col monte e' l'ultima carta del monte. Senza monte e' l'ultima carta
 * distribuita, che il mazziere riceve per ultima: resta scoperta in tavola
 * per tutta la chiamata ma e' sempre stata in mano sua, e li' resta.
 * Se il seme non corrisponde al trionfo non mostriamo nulla: meglio nessuna
 * carta scoperta che una carta sbagliata.
 */
export function cartaDelTrionfo(
  dealt: DealResult,
  config: TableConfig,
  dealer: number,
): Card | null {
  const manoMazziere = dealt.hands[dealer] ?? [];
  const candidata =
    config.monteSize > 0
      ? dealt.monte[dealt.monte.length - 1]
      : manoMazziere[manoMazziere.length - 1];

  if (candidata === undefined || candidata.suit !== dealt.trump) return null;
  return candidata;
}

/** Quanti trionfi sono passati per il tavolo e quanti ne restano in gioco. */
export interface ContoDeiTrionfi {
  usciti: number;
  inGiro: number;
}

/** Dieci carte per palo: usciti piu' rimasti fanno sempre questo. */
const TRIONFI_DEL_PALO = 10;

/**
 * Il conto dei trionfi come lo tiene chi gioca: dieci in tutto, meno quelli
 * gia' giocati. Quelli che restano sono in gioco, anche i propri: il totale
 * torna sempre. Dove siano non lo dice, solo quanti.
 *
 * Le uscite si leggono dalla vista di chi guarda: e' quello che si vede
 * stando seduti, senza le mani altrui.
 */
export function contaTrionfi(state: HandState, seat: number): ContoDeiTrionfi {
  const vista = vistaDaStato(state, seat);
  const usciti = carteUscite(vista).filter((carta) => carta.suit === state.trump).length;
  return {
    usciti,
    inGiro: TRIONFI_DEL_PALO - usciti,
  };
}
