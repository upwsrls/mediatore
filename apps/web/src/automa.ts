import type { CallAction, Card, Rng, Suit, TableConfig } from '@mediatore/engine';
import { decidiChiamata } from '@mediatore/bot';

/**
 * Quello che il bot decide fuori dalle carte giocate.
 *
 * La chiamata e lo scarto del monte ora vengono da packages/bot, che li ha
 * imparati da partite vere: qui resta solo il passaggio da 'chiama' alla
 * mossa che l'engine si aspetta. La carta dell'amico e' l'unica cosa ancora
 * senza un criterio studiato, e si vede dal commento che ha sopra.
 */

/**
 * Chiamare o passare. La scoperta del monte entra nel conto perche' e' sul
 * tavolo, sotto gli occhi di tutti, e chi chiama se la prende: deciderne
 * senza sarebbe giocare con meno di quello che si vede.
 *
 * Mai una speciale: sola, colonna e chi se la sente il bot non le dichiara,
 * perche' nessuno gli ha insegnato quando valgono.
 */
export function decisioneDiChiamata(
  mano: readonly Card[],
  trump: Suit,
  scoperta: Card | null,
  config: TableConfig,
): CallAction {
  return decidiChiamata({ mano, trump, scoperta }, config) === 'chiama'
    ? { tipo: 'chiama', chiamata: 'normale' }
    : { tipo: 'passo' };
}

/**
 * Il 7 da chiamare: quello del seme in cui il bot e' piu' lungo, che e' il
 * solo ragionamento che si puo' fare senza sapere niente degli altri.
 */
export function cartaDellAmico(
  mano: readonly Card[],
  chiamabili: readonly Card[],
  caso: Rng,
): Card {
  const lunghezza = (seme: Suit): number => mano.filter((carta) => carta.suit === seme).length;
  const massimo = Math.max(...chiamabili.map((carta) => lunghezza(carta.suit)));
  const migliori = chiamabili.filter((carta) => lunghezza(carta.suit) === massimo);
  return migliori[Math.floor(caso() * migliori.length)] ?? (chiamabili[0] as Card);
}

/* ---- i tempi ---- */

/**
 * Nessuno gioca all'istante. La pausa cresce col numero di strade aperte:
 * con una mossa sola si fa in fretta, con la mano piena ci si pensa.
 */
function attesa(minimo: number, massimo: number, scelte: number, caso: Rng): number {
  const arco = massimo - minimo;
  // Da una scelta sola a sei in su: oltre non cambia piu' niente.
  const peso = Math.min(1, Math.max(0, scelte - 1) / 5);
  const basso = minimo + arco * 0.5 * peso;
  const alto = minimo + arco * (0.5 + 0.5 * peso);
  return Math.round(basso + caso() * (alto - basso));
}

export function pausaCarta(scelte: number, caso: Rng): number {
  return attesa(700, 1800, scelte, caso);
}

export function pausaChiamata(carteInMano: number, caso: Rng): number {
  // Qui le strade sono due, chiamare o passare: a pesare e' la mano da
  // guardare, che a tre giocatori e' il doppio che a cinque.
  return attesa(900, 2200, carteInMano / 2, caso);
}

export function pausaScarto(quante: number, caso: Rng): number {
  // Piu' carte ci sono da lasciare andare, piu' la scelta si fa pesante.
  return attesa(1500, 3000, quante, caso);
}

/**
 * Il pensiero parte insieme alla pausa e si gioca quando sono finiti
 * tutti e due. Cosi' i quaranta millisecondi del pensatore stanno DENTRO
 * i 700-1800 ms gia' previsti, e non si aggiungono dopo. Se per qualche
 * motivo il pensiero dura di piu', si gioca appena e' pronto.
 */
export function dopoPausaEPensiero<T>(
  pensiero: Promise<T>,
  pausaMs: number,
  adesso: () => number = () => performance.now(),
  ritarda: (ms: number, fai: () => void) => () => void = (ms, fai) => {
    const timer = setTimeout(fai, ms);
    return () => clearTimeout(timer);
  },
): { pronta: Promise<T>; annulla: () => void } {
  const inizio = adesso();
  let ferma: (() => void) | undefined;
  let annullato = false;
  const pronta = new Promise<T>((risolvi, rifiuta) => {
    void pensiero.then((risultato) => {
      if (annullato) return;
      const rimasto = Math.max(0, pausaMs - (adesso() - inizio));
      ferma = ritarda(rimasto, () => {
        if (!annullato) risolvi(risultato);
      });
    }, rifiuta);
  });
  return {
    pronta,
    annulla: () => {
      annullato = true;
      ferma?.();
    },
  };
}
