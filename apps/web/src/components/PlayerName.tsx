import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { nomeCompatto, nomeGiocatore } from '../labels';
import { etichettaRuolo, ruoloDi } from '../roles';

interface Props {
  seat: number;
  /** null prima che la smazzata inizi: senza squadre non c'e' nessun ruolo. */
  state: HandState | null;
  /** Forma breve per gli spazi stretti: g0 invece di giocatore 0. */
  compatto?: boolean;
  /** Chi distribuisce, solo durante la distribuzione: ruolo di un momento. */
  cartaro?: boolean;
}

/**
 * Unico modo in cui si scrive il nome di un giocatore. L'evidenza del ruolo
 * la decide questo componente: chi lo usa non sa niente delle squadre.
 */
export function PlayerName({
  seat,
  state,
  compatto = false,
  cartaro = false,
}: Props): ReactElement {
  const ruolo = state === null ? 'neutro' : ruoloDi(seat, state);
  const etichetta = etichettaRuolo(ruolo);

  return (
    <span className={`giocatore giocatore-${ruolo}`}>
      {compatto ? nomeCompatto(seat) : nomeGiocatore(seat)}
      {/* Il colore non basta: il ruolo e' scritto anche a parole. */}
      {etichetta !== null && <span className="giocatore-ruolo">{etichetta}</span>}
      {cartaro && <span className="giocatore-cartaro">cartaro</span>}
    </span>
  );
}
