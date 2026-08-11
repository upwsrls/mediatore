import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { PlayerName } from '../components/PlayerName';
import { StatusLine } from '../components/StatusLine';

interface Props {
  state: HandState;
  onChiudi: () => void;
}

export function ReviewScreen({ state, onChiudi }: Props): ReactElement {
  const [indice, setIndice] = useState(0);
  const prese = state.completedTricks;
  const presa = prese[indice];

  if (presa === undefined) {
    return (
      <section className="schermata">
        <p>nessuna presa da rivedere</p>
        <button type="button" className="bottone-grande" onClick={onChiudi}>
          Torna al conteggio
        </button>
      </section>
    );
  }

  return (
    <section className="schermata">
      <StatusLine state={state} />
      <h2>
        presa {indice + 1} di {prese.length}
      </h2>

      <div className="presa-rivista">
        {presa.cards.map((giocata) => (
          <div
            key={giocata.card.id}
            className={giocata.player === presa.winner ? 'giocata giocata-vince' : 'giocata'}
          >
            <span className="giocata-nome">
              <PlayerName seat={giocata.player} state={state} compatto />
            </span>
            <Card card={giocata.card} size="piccola" />
          </div>
        ))}
      </div>

      <p className="esito">
        presa a <PlayerName seat={presa.winner} state={state} /> per {presa.points} punti
      </p>

      <div className="riga-bottoni">
        <button
          type="button"
          className="bottone-piccolo"
          disabled={indice === 0}
          onClick={() => setIndice(indice - 1)}
        >
          precedente
        </button>
        <button
          type="button"
          className="bottone-piccolo"
          disabled={indice >= prese.length - 1}
          onClick={() => setIndice(indice + 1)}
        >
          successiva
        </button>
      </div>

      <button type="button" className="bottone-grande" onClick={onChiudi}>
        Torna al conteggio
      </button>
    </section>
  );
}
