import type { Suit } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { SEMI } from '../labels';

interface Props {
  suit: Suit;
  size?: 'grande' | 'piccola' | 'riga';
}

/**
 * Il seme disegnato, non un carattere tipografico che gli somiglia.
 * L immagine e' decorativa: il nome del seme e' sempre scritto accanto o
 * nell aria-label di chi la usa, quindi non serve ripeterlo a chi ascolta.
 */
export function SuitIcon({ suit, size = 'grande' }: Props): ReactElement {
  return <img className={`seme-icona seme-icona-${size}`} src={SEMI[suit].icona} alt="" />;
}
