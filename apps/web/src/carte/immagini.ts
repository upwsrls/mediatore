import type { Card } from '@mediatore/engine';
import { createDeck } from '@mediatore/engine';

/**
 * Le foto del mazzo stanno in public/carte e prendono il nome dall id
 * della carta nell engine: provenienza e licenza in public/carte/LICENZE.md.
 */
export function immagineCarta(card: Card): string {
  return `/carte/${card.id}.webp`;
}

export const DORSO = '/carte/retro.webp';

let precaricate = false;

/**
 * Le quaranta carte pesano poco ma il gioco e' fatto di scoperte improvvise:
 * caricarle durante la distribuzione evita che compaiano a scatti.
 * Il browser tiene le immagini in cache, quindi si fa una volta sola.
 */
export function precaricaMazzo(): void {
  if (precaricate || typeof Image === 'undefined') return;
  precaricate = true;
  for (const carta of createDeck()) {
    new Image().src = immagineCarta(carta);
  }
  new Image().src = DORSO;
}
