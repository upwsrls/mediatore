export type { Card, Rank, Suit } from './cards.ts';
export { RANKS, SUITS, cardPoints, cardStrength, createDeck, totalPoints } from './cards.ts';
export type {
  CallAction,
  CallState,
  DealResult,
  MonteExchange,
  TableConfig,
  TipoChiamata,
  Variant,
} from './deal.ts';
export {
  applyCall,
  apreLaPrimaBase,
  callableCards,
  chiVedeIlMonte,
  createCallState,
  currentCaller,
  deal,
  discardToMonte,
  firstHand,
  moltiplicatore,
  nextSeat,
  serveScambioMonte,
  tableConfig,
  takeMonte,
} from './deal.ts';
export type { Alliance, Cappotto, CompletedTrick, HandScore, HandState } from './hand.ts';
export {
  createHandState,
  isAllyFor,
  legalPlaysFor,
  penalitaDaSoglia,
  playCard,
  scoreHand,
  settle,
  settleChiSeLaSenteScaduto,
} from './hand.ts';
export type { Rng } from './rng.ts';
export { createRng, seedFromString, shuffle } from './rng.ts';
export type { IsAlly, PlayedCard, PlayerId, Trick } from './trick.ts';
export {
  TRICK_BASE_POINTS,
  beats,
  currentWinner,
  isLegalPlay,
  ledSuit,
  legalPlays,
  trickPoints,
} from './trick.ts';
