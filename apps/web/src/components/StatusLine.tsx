import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { avvisoCappotto, avvisoSoglia, riassuntoSmazzata } from '../roles';

interface Props {
  state: HandState;
  /**
   * Gli avvisi che contano al posto di chi gioca: il cappotto in corsa dice che
   * le basi sono andate tutte da una parte, la soglia che il chiamante sta
   * sotto. Sono punteggio travestito, e da esperto tacciono: al bar quelle cose
   * le sai solo se hai contato. Resta il riassunto, che al tavolo si dice a
   * voce alta.
   *
   * A smazzata finita non c'e' niente da spegnere: i due avvisi si zittiscono
   * da soli quando non resta piu' una base da giocare.
   */
  aiuti?: boolean;
}

/** Riga fissa in alto: si aggiorna da sola quando l'amico si scopre. */
export function StatusLine({ state, aiuti = true }: Props): ReactElement {
  const cappotto = aiuti ? avvisoCappotto(state) : null;
  const soglia = aiuti ? avvisoSoglia(state) : null;

  return (
    <div className="riga-stato">
      {riassuntoSmazzata(state)}
      {/* Sparisce da solo alla prima base che finisce agli altri. */}
      {cappotto !== null && <span className="cappotto-in-corsa">{cappotto}</span>}
      {/* E questo appena il chiamante rimette il naso sopra la soglia. */}
      {soglia !== null && <span className="sotto-soglia">{soglia}</span>}
    </div>
  );
}
