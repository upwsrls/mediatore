import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { avvisoSoglia, riassuntoSmazzata } from '../roles';

interface Props {
  state: HandState;
  /**
   * L'avviso della soglia, che conta al posto di chi gioca: il chiamante sta
   * sotto e si sta per pagare il supplemento. E' punteggio travestito, e da
   * esperto tace: al bar quelle cose le sai solo se hai contato. Resta il
   * riassunto, che al tavolo si dice a voce alta.
   *
   * A smazzata finita non c'e' niente da spegnere: l'avviso si zittisce da
   * solo quando non resta piu' una base da giocare.
   */
  aiuti?: boolean;
}

/** Riga fissa in alto: si aggiorna da sola quando l'amico si scopre. */
export function StatusLine({ state, aiuti = true }: Props): ReactElement {
  const soglia = aiuti ? avvisoSoglia(state) : null;

  return (
    <div className="riga-stato">
      <span className="riga-stato-riassunto">{riassuntoSmazzata(state)}</span>
      {/* Sparisce appena il chiamante rimette il naso sopra la soglia. */}
      {soglia !== null && <span className="sotto-soglia">{soglia}</span>}
    </div>
  );
}
