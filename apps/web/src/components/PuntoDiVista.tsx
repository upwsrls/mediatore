import type { ReactElement } from 'react';
import { nomeGiocatore } from '../labels';

interface Props {
  players: number;
  valore: number;
  onCambia: (seat: number) => void;
}

/**
 * Da quale posto si guarda il tavolo. E' un attrezzo dell'hotseat, non una
 * regola: col server il punto di vista sara' sempre l'utente collegato e
 * questo selettore sparira'. Si usa solo fra una smazzata e l'altra.
 */
export function PuntoDiVista({ players, valore, onCambia }: Props): ReactElement {
  return (
    <label className="punto-di-vista">
      <span>guarda il tavolo dal posto di</span>
      <select value={valore} onChange={(evento) => onCambia(Number(evento.target.value))}>
        {Array.from({ length: players }, (_, seat) => (
          <option key={seat} value={seat}>
            {nomeGiocatore(seat)}
          </option>
        ))}
      </select>
    </label>
  );
}
