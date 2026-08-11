import type { Card, Suit } from './cards.ts';
import { cardPoints, cardStrength } from './cards.ts';

/** Indice di posto al tavolo. */
export type PlayerId = number;

export interface PlayedCard {
  player: PlayerId;
  card: Card;
}

export interface Trick {
  leader: PlayerId;
  trump: Suit;
  plays: PlayedCard[];
}

/** Predicato di alleanza: l'engine non assume mai come sono formate le squadre. */
export type IsAlly = (a: PlayerId, b: PlayerId) => boolean;

/** Punto della base, assegnato a chi porta a casa la presa. */
export const TRICK_BASE_POINTS = 1;

export function ledSuit(trick: Trick): Suit | null {
  const first = trick.plays[0];
  return first === undefined ? null : first.card.suit;
}

/** 2 = trionfo, 1 = seme di apertura, 0 = seme terzo (non puo' mai vincere). */
function rankTier(card: Card, trump: Suit, led: Suit): number {
  if (card.suit === trump) return 2;
  if (card.suit === led) return 1;
  return 0;
}

export function beats(challenger: Card, incumbent: Card, trump: Suit, led: Suit): boolean {
  const challengerTier = rankTier(challenger, trump, led);
  const incumbentTier = rankTier(incumbent, trump, led);
  if (challengerTier === 0) return false;
  if (challengerTier !== incumbentTier) return challengerTier > incumbentTier;
  return cardStrength(challenger.rank) > cardStrength(incumbent.rank);
}

function winningPlay(trick: Trick): PlayedCard | null {
  const led = ledSuit(trick);
  if (led === null) return null;
  let best: PlayedCard | null = null;
  for (const play of trick.plays) {
    if (best === null || beats(play.card, best.card, trick.trump, led)) best = play;
  }
  return best;
}

export function currentWinner(trick: Trick): PlayerId | null {
  return winningPlay(trick)?.player ?? null;
}

export function trickPoints(trick: Trick): number {
  return trick.plays.reduce((sum, play) => sum + cardPoints(play.card.rank), TRICK_BASE_POINTS);
}

export function legalPlays(hand: Card[], trick: Trick, me: PlayerId, isAlly: IsAlly): Card[] {
  const led = ledSuit(trick);
  const winner = winningPlay(trick);
  if (led === null || winner === null) return [...hand];

  const partnerWinning = isAlly(me, winner.player);
  const sameSuit = hand.filter((card) => card.suit === led);

  if (sameSuit.length > 0) {
    if (partnerWinning) return sameSuit;
    // Se la presa e' gia' stata tagliata nessuna carta del seme puo' superare:
    // si ricade sull'obbligo di rispondere a seme.
    const winning = sameSuit.filter((card) => beats(card, winner.card, trick.trump, led));
    return winning.length > 0 ? winning : sameSuit;
  }

  if (partnerWinning) return [...hand];

  const trumps = hand.filter((card) => card.suit === trick.trump);
  if (trumps.length === 0) return [...hand];

  // Chi non puo' superare il trionfo gia' in tavola non e' obbligato a scartarne uno basso.
  const beating = trumps.filter((card) => beats(card, winner.card, trick.trump, led));
  return beating.length > 0 ? beating : [...hand];
}

export function isLegalPlay(
  card: Card,
  hand: Card[],
  trick: Trick,
  me: PlayerId,
  isAlly: IsAlly,
): boolean {
  return legalPlays(hand, trick, me, isAlly).some((legal) => legal.id === card.id);
}
