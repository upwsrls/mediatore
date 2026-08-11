import type { Card, DealResult, TableConfig } from '@mediatore/engine';

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
