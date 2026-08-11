import type { Card, Suit } from '@mediatore/engine';
import { SUITS, cardStrength } from '@mediatore/engine';

/**
 * Come si sistemano le carte in mano: prima il trionfo, poi denari, coppe,
 * spade e bastoni; dentro ogni seme dalla piu' forte alla piu' debole.
 * Ordinamento di sola presentazione: l'engine non sa nulla dell'ordine.
 */
export function ordinaCarte(cards: readonly Card[], trump: Suit): Card[] {
  const semi = [trump, ...SUITS.filter((suit) => suit !== trump)];
  return [...cards].sort(
    (a, b) =>
      semi.indexOf(a.suit) - semi.indexOf(b.suit) || cardStrength(b.rank) - cardStrength(a.rank),
  );
}

/**
 * L'ordine si fissa una volta sola, a mano definitiva, e da li' non cambia
 * piu': e' una lista di id, non di carte, proprio perche' le carte se ne
 * vanno mentre l'ordine resta.
 */
export function ordineDiMano(cards: readonly Card[], trump: Suit): string[] {
  return ordinaCarte(cards, trump).map((carta) => carta.id);
}

/**
 * Le carte ancora in mano, nelle posizioni relative decise a inizio smazzata:
 * giocare una carta ricompatta le altre, non le rimescola.
 * Una carta fuori dall'ordine finisce in coda invece di sparire: se mai
 * succedesse, meglio una mano sistemata male che una carta invisibile.
 */
export function secondoOrdine(cards: readonly Card[], ordine: readonly string[]): Card[] {
  const perId = new Map(cards.map((carta) => [carta.id, carta]));
  const sistemate: Card[] = [];
  for (const id of ordine) {
    const carta = perId.get(id);
    if (carta !== undefined) {
      sistemate.push(carta);
      perId.delete(id);
    }
  }
  return [...sistemate, ...perId.values()];
}
