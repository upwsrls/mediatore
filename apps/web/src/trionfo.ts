import { carteUscite, trionfiRimasti, vistaDaStato } from '@mediatore/bot';
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

/** Quanti trionfi sono passati per il tavolo e quanti ne girano ancora. */
export interface ContoDeiTrionfi {
  usciti: number;
  inGiro: number;
}

/**
 * Il conto dei trionfi come lo tiene chi gioca: dieci in tutto, meno quelli
 * giocati, meno quelli che ha in mano. Quello che resta gira fra gli altri, e
 * dove sia non lo dice: solo quanti.
 *
 * E' lo stesso conto del bot, preso da dove sta: la memoria del bot vede
 * esattamente quello che vede un giocatore seduto a quel posto, quindi da qui
 * non trapela niente delle mani altrui.
 */
export function contaTrionfi(state: HandState, seat: number): ContoDeiTrionfi {
  const vista = vistaDaStato(state, seat);
  return {
    usciti: carteUscite(vista).filter((carta) => carta.suit === state.trump).length,
    inGiro: trionfiRimasti(vista).length,
  };
}
