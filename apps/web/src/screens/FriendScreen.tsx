import type { Card as CartaEngine } from '@mediatore/engine';
import { callableCards } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { Card } from '../components/Card';
import { nomeGiocatore } from '../labels';
import { ordinaCarte } from '../ordine';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onScegli: (card: CartaEngine) => void;
}

export function FriendScreen({ session, onScegli }: Props): ReactElement {
  const caller = session.call.caller;
  if (caller === null) return <p>nessun chiamante</p>;

  // Sistemate come in mano: si sceglie fra decine di carte, e cercarle a caso
  // sullo schermo e' il modo piu' rapido per chiamare quella sbagliata.
  const mano = ordinaCarte(session.hands[caller] ?? [], session.trump);
  const chiamabili = ordinaCarte(callableCards(session.hands[caller] ?? []), session.trump);

  return (
    <section className="schermata">
      <h2>{nomeGiocatore(caller)} chiama l amico</h2>
      <p className="nota">
        chi ha in mano la carta scelta diventa l alleato, ma nessuno lo sapra fino a quando
        quella carta non viene giocata
      </p>

      <div className="mano mano-larga">
        {chiamabili.map((carta) => (
          <Card key={carta.id} card={carta} onClick={onScegli} />
        ))}
      </div>

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
