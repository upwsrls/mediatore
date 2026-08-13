import type { Card } from '@mediatore/engine';

/** Dove sta una carta nel ventaglio: quale fila e quanto scarta dal centro. */
export interface PostoCarta {
  carta: Card;
  riga: 0 | 1;
  /** Colonne di distanza dal centro della propria fila: puo' essere mezza. */
  scarto: number;
}

/**
 * La mano sta su due file, mai su una sola che scorre. Il taglio si rifa a
 * ogni giocata sulle carte rimaste, cosi' le file restano bilanciate: sette
 * carte fanno quattro e tre, sei fanno tre e tre. La carta in piu' va sopra.
 */
export function cartePerFila(carte: number): number {
  return Math.ceil(Math.max(carte, 0) / 2);
}

export function dividiInFile(
  mano: readonly Card[],
  ingombro: number = mano.length,
): { sopra: Card[]; sotto: Card[] } {
  const meta = cartePerFila(Math.max(ingombro, mano.length));
  return { sopra: mano.slice(0, meta), sotto: mano.slice(meta) };
}

/**
 * Ogni fila si centra per conto suo attorno allo zero. Ne viene fuori una
 * piramide da sola: quando sotto c'e' una carta in meno, quelle di sotto
 * cadono negli spazi fra quelle di sopra; quando sono pari, si incolonnano.
 * L'ordine delle carte non lo tocca nessuno: e' quello di inizio smazzata.
 *
 * L'`ingombro` dice su quante carte si centrano le file, e di suo e' la mano
 * stessa: giocando, le rimaste si ricompattano e si ricentrano. Mentre si
 * distribuisce invece si passa la mano intera, cosi' le carte che arrivano
 * riempiono i posti che avranno alla fine e non si spostano tutte a ogni
 * carta — si muove solo chi deve far largo a quella appena entrata.
 */
export function postiDellaMano(
  mano: readonly Card[],
  ingombro: number = mano.length,
): PostoCarta[] {
  const pieno = Math.max(ingombro, mano.length);
  const meta = cartePerFila(pieno);
  const { sopra, sotto } = dividiInFile(mano, pieno);

  const fila = (carte: Card[], riga: 0 | 1, quanteInFila: number): PostoCarta[] =>
    carte.map((carta, colonna) => ({ carta, riga, scarto: colonna - (quanteInFila - 1) / 2 }));

  return [...fila(sopra, 0, meta), ...fila(sotto, 1, pieno - meta)];
}
