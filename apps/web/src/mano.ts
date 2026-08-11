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

export function dividiInFile(mano: readonly Card[]): { sopra: Card[]; sotto: Card[] } {
  const meta = cartePerFila(mano.length);
  return { sopra: mano.slice(0, meta), sotto: mano.slice(meta) };
}

/**
 * Ogni fila si centra per conto suo attorno allo zero. Ne viene fuori una
 * piramide da sola: quando sotto c'e' una carta in meno, quelle di sotto
 * cadono negli spazi fra quelle di sopra; quando sono pari, si incolonnano.
 * L'ordine delle carte non lo tocca nessuno: e' quello di inizio smazzata.
 */
export function postiDellaMano(mano: readonly Card[]): PostoCarta[] {
  const { sopra, sotto } = dividiInFile(mano);

  const fila = (carte: Card[], riga: 0 | 1): PostoCarta[] =>
    carte.map((carta, colonna) => ({ carta, riga, scarto: colonna - (carte.length - 1) / 2 }));

  return [...fila(sopra, 0), ...fila(sotto, 1)];
}
