import type { ReactElement } from 'react';
import { Card } from '../components/Card';
import { PlayerName } from '../components/PlayerName';
import type { Session } from '../useHand';

interface Props {
  session: Session;
}

/**
 * Fase di distribuzione. Per ora e' solo un'attesa con i posti a tavola:
 * il cartaro si vede qui e solo qui, perche' finita la distribuzione il suo
 * ruolo e' esaurito e l'unica evidenza torna a essere il turno.
 */
export function DealingScreen({ session }: Props): ReactElement {
  const posti = session.hands.map((_, seat) => seat);

  return (
    <section className="schermata">
      <h2>si distribuisce</h2>
      <p className="nota">
        {session.config.handSize} carte a testa, una alla volta, a partire dalla destra del cartaro
      </p>

      <ul className="posti">
        {posti.map((seat) => (
          <li key={seat} className="posto">
            <PlayerName seat={seat} state={null} cartaro={seat === session.dealer} />
            {/* Le carte ci sono gia' tutte, ma qui nessuno le ha ancora viste. */}
            <span className="mazzetto">
              {(session.hands[seat] ?? []).map((carta) => (
                <Card key={carta.id} card={carta} size="piccola" coperta />
              ))}
            </span>
          </li>
        ))}
      </ul>

      {/* Niente trionfo qui: si scopre a distribuzione finita, insieme alla chiamata. */}
    </section>
  );
}
