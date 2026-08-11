import type { ReactElement } from 'react';
import { PlayerName } from '../components/PlayerName';
import { costo, quantoVale } from '../chiamate';
import { nomeGiocatore } from '../labels';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onApre: (seat: number) => void;
  onNessuno: () => void;
}

/**
 * Chi se la sente: il chiamante ha dichiarato, ma non decide lui chi apre.
 * La scelta e' degli avversari, e chi si fa avanti resta un avversario.
 */
export function OpeningScreen({ session, onApre, onNessuno }: Props): ReactElement {
  const caller = session.call.caller;
  if (caller === null) return <p>nessun chiamante</p>;

  const avversari = session.hands.map((_, seat) => seat).filter((seat) => seat !== caller);

  return (
    <section className="schermata">
      <div className="riga-stato">
        {nomeGiocatore(caller)} ha detto CHI SE LA SENTE — {quantoVale('chiSeLaSente')}
      </div>

      <h2>chi se la sente di aprire?</h2>
      <p className="nota">
        chi apre gioca la prima carta ma resta un avversario, alleato degli altri contro{' '}
        <PlayerName seat={caller} state={null} />
      </p>

      <ul className="posti">
        {avversari.map((seat) => (
          <li key={seat} className="posto posto-scelta">
            <PlayerName seat={seat} state={null} />
            <button type="button" className="bottone-grande" onClick={() => onApre(seat)}>
              ME LA SENTO IO
            </button>
          </li>
        ))}
      </ul>

      <div className="blocco">
        <p className="etichetta">se non se la sente nessuno</p>
        <p className="nota">
          gli avversari perdono senza giocare e pagano {costo('chiSeLaSente')} a testa
        </p>
        <button type="button" className="bottone-grande bottone-secondario" onClick={onNessuno}>
          nessuno se la sente
        </button>
      </div>
    </section>
  );
}
