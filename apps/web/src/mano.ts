import type { Card } from '@mediatore/engine';

/** Dove sta una carta nel ventaglio: quale fila e quanto scarta dal centro. */
export interface PostoCarta {
  carta: Card;
  riga: 0 | 1;
  /** Colonne di distanza dal centro della propria fila: puo' essere mezza. */
  scarto: number;
}

/**
 * Quante carte regge una fila. Si fissa a inizio smazzata sulla meta' della
 * mano, perche' la mano sta su due file e non scorre mai: 12 carte fanno 6 per
 * fila, 9 ne fanno 5, 7 ne fanno 4. Da questo numero esce la larghezza della
 * carta, e per tutta la smazzata non si muove piu': le carte non si allargano
 * mentre la mano si svuota.
 */
export function cartePerFila(carteIniziali: number): number {
  return Math.ceil(Math.max(carteIniziali, 0) / 2);
}

/**
 * Piu' di sei carte in fila diventano un ventaglio lungo e piatto, difficile
 * da leggere in un colpo d'occhio: da sette in su la mano si spezza comunque.
 */
export const FILA_UNICA_FINO_A = 6;

/**
 * Da quante carte in giu' la mano sta su una fila sola: il minore fra sei e le
 * carte per fila del tavolo. Il secondo e' il vincolo vero, perche' la
 * larghezza della carta e' tagliata su quelle: a 5 giocatori una fila da sei
 * sarebbe meta' piu' larga dello schermo, e le carte uscirebbero fuori. Cosi'
 * la fila unica arriva a 6 carte in tre, a 5 in quattro, a 4 in cinque.
 */
export function sogliaFilaUnica(perFila: number): number {
  return Math.min(FILA_UNICA_FINO_A, Math.max(perFila, 0));
}

/** Vero quando le carte rimaste ci stanno davvero tutte su una fila sola. */
export function eFilaUnica(rimaste: number, perFila: number): boolean {
  return Math.max(rimaste, 0) <= sogliaFilaUnica(perFila);
}

/**
 * Quante carte prende la fila di sopra: tutte quando ci stanno, se no la
 * meta' arrotondata per eccesso. Il taglio si rifa a ogni giocata sulle carte
 * rimaste, cosi' le file restano bilanciate: sette carte fanno quattro e tre,
 * sei fanno tre e tre. La carta in piu' va sopra.
 */
function quanteSopra(carte: number, perFila: number): number {
  return eFilaUnica(carte, perFila) ? carte : Math.ceil(carte / 2);
}

export function dividiInFile(
  mano: readonly Card[],
  perFila: number,
  ingombro: number = mano.length,
): { sopra: Card[]; sotto: Card[] } {
  const meta = quanteSopra(Math.max(ingombro, mano.length), perFila);
  return { sopra: mano.slice(0, meta), sotto: mano.slice(meta) };
}

/**
 * Ogni fila si centra per conto suo attorno allo zero. Ne viene fuori una
 * piramide da sola: quando sotto c'e' una carta in meno, quelle di sotto
 * cadono negli spazi fra quelle di sopra; quando sono pari, si incolonnano.
 * Con poche carte la fila di sotto resta vuota e sopra si centra tutto.
 * L'ordine delle carte non lo tocca nessuno: e' quello di inizio smazzata.
 *
 * Il `perFila` e' quello fissato a inizio smazzata, non quello che basterebbe
 * alle carte rimaste: e' lui che dice fin dove la fila unica ci sta.
 *
 * L'`ingombro` dice su quante carte si centrano le file, e di suo e' la mano
 * stessa: giocando, le rimaste si ricompattano e si ricentrano. Mentre si
 * distribuisce invece si passa la mano intera, cosi' le carte che arrivano
 * riempiono i posti che avranno alla fine e non si spostano tutte a ogni
 * carta — si muove solo chi deve far largo a quella appena entrata.
 */
export function postiDellaMano(
  mano: readonly Card[],
  perFila: number,
  ingombro: number = mano.length,
): PostoCarta[] {
  const pieno = Math.max(ingombro, mano.length);
  const meta = quanteSopra(pieno, perFila);
  const { sopra, sotto } = dividiInFile(mano, perFila, pieno);

  const fila = (carte: Card[], riga: 0 | 1, quanteInFila: number): PostoCarta[] =>
    carte.map((carta, colonna) => ({ carta, riga, scarto: colonna - (quanteInFila - 1) / 2 }));

  return [...fila(sopra, 0, meta), ...fila(sotto, 1, pieno - meta)];
}
