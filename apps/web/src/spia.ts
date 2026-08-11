/**
 * Le carte degli altri viste a tavolino: e' un attrezzo per correggere i bot,
 * non un modo di giocare. Qui dentro c'e' solo la geometria del ventaglio,
 * cioe' quanto sta larga una carta scoperta accanto a un posto e di quanto le
 * carte si accavallano quando non ci starebbero tutte intere.
 */
import type { Card } from '@mediatore/engine';
import type { Posizione } from './posti';
import { eDiLato } from './posti';

/** Le foto del mazzo sono alte una volta e mezzo abbondante la larghezza. */
const ALTEZZA_SU_LARGHEZZA = 661 / 400;

export function altezzaCarta(larghezza: number): number {
  return Math.round(larghezza * ALTEZZA_SU_LARGHEZZA);
}

/**
 * La striscia sotto la quale di una carta non si capisce piu' niente. Prima
 * di scendere sotto e' meglio uscire di un filo dallo spazio previsto: le
 * carte devono restare riconoscibili, e' tutto il senso della modalita'.
 */
const STRISCIA_MINIMA = 12;

/**
 * Di quanto avanza ogni carta rispetto a quella prima. Se ci stanno tutte
 * intere avanzano di tutto il loro ingombro e il ventaglio non si accavalla;
 * se no si sovrappongono quanto basta a starci dentro.
 */
export function passoDelVentaglio(quante: number, ingombro: number, spazio: number): number {
  if (quante <= 1) return ingombro;
  const disteso = Math.floor((spazio - ingombro) / (quante - 1));
  return Math.max(STRISCIA_MINIMA, Math.min(ingombro, disteso));
}

export interface Ventaglio {
  larghezza: number;
  /** Quanto ingombra una carta nel verso del ventaglio: la larghezza o l altezza. */
  ingombro: number;
  passo: number;
  /** Ai lati del tavolo il ventaglio scende, sopra e sotto si allarga. */
  inColonna: boolean;
}

/**
 * Le misure sono quelle del telefono piu' stretto che serviamo, prese sul
 * tavolo vero. Ai lati c'e' solo altezza, e quanta dipende da quanti posti si
 * dividono la colonna: a cinque sono due per lato, altrove uno solo.
 */
const LARGHEZZA_DI_LATO = 32;
/** A cinque la colonna e' divisa in due, e le carte devono rimpicciolirsi. */
const LARGHEZZA_DI_MEZZO_LATO = 28;
const LARGHEZZA_IN_RIGA = 34;
const ALTEZZA_DELLA_COLONNA = 236;
const ALTEZZA_DELLA_MEZZA_COLONNA = 118;
const LARGHEZZA_DELLA_FILA = 248;

export function ventaglioDelPosto(
  posizione: Posizione,
  players: number,
  quante: number,
): Ventaglio {
  if (eDiLato(posizione)) {
    const inDue = players === 5;
    const larghezza = inDue ? LARGHEZZA_DI_MEZZO_LATO : LARGHEZZA_DI_LATO;
    const ingombro = altezzaCarta(larghezza);
    const spazio = inDue ? ALTEZZA_DELLA_MEZZA_COLONNA : ALTEZZA_DELLA_COLONNA;
    return {
      larghezza,
      ingombro,
      passo: passoDelVentaglio(quante, ingombro, spazio),
      inColonna: true,
    };
  }

  const larghezza = LARGHEZZA_IN_RIGA;
  return {
    larghezza,
    ingombro: larghezza,
    passo: passoDelVentaglio(quante, larghezza, LARGHEZZA_DELLA_FILA),
    inColonna: false,
  };
}

/**
 * Chi tiene in mano una carta. A carte scoperte serve per l'amico: la carta
 * chiamata si sa da subito, chi ce l'ha e' l'ultimo segreto del tavolo.
 * Torna null quando quella carta non e' piu' in mano a nessuno, perche' e'
 * gia' stata giocata o sta sotto il monte.
 */
export function chiTieneLaCarta(hands: readonly Card[][], cardId: string): number | null {
  const seat = hands.findIndex((mano) => mano.some((carta) => carta.id === cardId));
  return seat < 0 ? null : seat;
}
