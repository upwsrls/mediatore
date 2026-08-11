import type { ReactElement } from 'react';
import { Card } from '../components/Card';
import { SuitIcon } from '../components/SuitIcon';
import { SEMI } from '../labels';
import { ordinaCarte } from '../ordine';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  titolo: string;
  nota: string;
}

/**
 * Quando a decidere e' un altro non c'e' niente da fare se non aspettare, e
 * intanto si guardano le proprie carte. Serve anche a non mostrare per
 * sbaglio la mano di chi sta scegliendo: qui sotto c'e' solo la propria.
 */
export function WaitScreen({ session, titolo, nota }: Props): ReactElement {
  const mano = ordinaCarte(session.hands[session.umano ?? 0] ?? [], session.trump);

  return (
    <section className="schermata">
      <header className="intestazione">
        <span>
          trionfo{' '}
          <strong className={SEMI[session.trump].classe}>
            <SuitIcon suit={session.trump} size="riga" /> {session.trump}
          </strong>
        </span>
      </header>

      <h2>{titolo}</h2>
      <p className="nota">{nota}</p>

      <div className="blocco">
        <p className="etichetta">la tua mano</p>
        <div className="mano mano-larga">
          {mano.map((carta) => (
            <Card key={carta.id} card={carta} size="piccola" />
          ))}
        </div>
      </div>
    </section>
  );
}
