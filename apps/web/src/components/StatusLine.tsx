import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { avvisoCappotto, avvisoSoglia, riassuntoSmazzata } from '../roles';

interface Props {
  state: HandState;
}

/** Riga fissa in alto: si aggiorna da sola quando l'amico si scopre. */
export function StatusLine({ state }: Props): ReactElement {
  const cappotto = avvisoCappotto(state);
  const soglia = avvisoSoglia(state);

  return (
    <div className="riga-stato">
      {riassuntoSmazzata(state)}
      {/* Sparisce da solo alla prima presa che finisce agli altri. */}
      {cappotto !== null && <span className="cappotto-in-corsa">{cappotto}</span>}
      {/* E questo appena il chiamante rimette il naso sopra la soglia. */}
      {soglia !== null && <span className="sotto-soglia">{soglia}</span>}
    </div>
  );
}
