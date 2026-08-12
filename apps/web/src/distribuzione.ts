import { nextSeat } from '@mediatore/engine';

/**
 * Il tempo che ci mette il tavolo a vedere arrivare le carte.
 *
 * Le mani l'engine le ha gia' fatte tutte in un colpo solo, ma al tavolo le
 * carte arrivano una alla volta, in senso antiorario a partire dal primo di
 * mano — quello alla destra del cartaro — per tanti giri quante sono le carte
 * a testa. Qui c'e' solo quell'ordine e quel ritmo: chi ha ricevuto cosa lo
 * sa gia' l'engine, e da qui non passa nemmeno una carta.
 */

/** Quanto passa fra una carta e l'altra: a tre sono poco piu' di quattro secondi. */
export const CARTA_DISTRIBUITA_MS = 120;

/** Quante carte fa in tutto la distribuzione: il monte non si distribuisce. */
export function carteDaDistribuire(players: number, handSize: number): number {
  return players * handSize;
}

/** A chi tocca la carta numero `indice`, contando da zero. */
export function chiRiceve(indice: number, dealer: number, players: number): number {
  return (nextSeat(dealer, players) + indice) % players;
}

/**
 * Quante carte ha davanti un posto quando ne sono state date `distribuite`.
 * E' il conto che fa chi guarda: i mazzetti degli altri crescono di un dorso
 * per giro, e chi viene prima nel giro ne ha una in piu' fino a fine giro.
 */
export function quanteNeHa(
  distribuite: number,
  seat: number,
  dealer: number,
  players: number,
): number {
  const primo = nextSeat(dealer, players);
  // Quanti ne vengono serviti prima di lui nel primo giro.
  const quantiPrima = (((seat - primo) % players) + players) % players;
  if (distribuite <= quantiPrima) return 0;
  return Math.floor((distribuite - quantiPrima - 1) / players) + 1;
}
