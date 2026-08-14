import type { Card as CartaEngine } from '@mediatore/engine';
import { takeMonte } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useAudio } from '../audio/useAudio';
import { Card } from '../components/Card';
import { nomeGiocatore } from '../labels';
import { ordinaCarte } from '../ordine';
import { conAiuti } from '../livello';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onConferma: (scarti: CartaEngine[]) => void;
}

export function DiscardScreen({ session, onConferma }: Props): ReactElement {
  const caller = session.call.caller;
  const [scelte, setScelte] = useState<string[]>([]);
  const audio = useAudio();

  if (caller === null) return <p>nessun chiamante</p>;

  // Le carte del monte si mescolano alla mano al posto che gli spetta, non in
  // coda: si vede subito quali migliorano la mano e quali no.
  const allargata = ordinaCarte(takeMonte(session.hands[caller] ?? [], session.monte), session.trump);
  const idMonte = new Set(session.monte.map((carta) => carta.id));
  const quante = session.config.monteSize;

  function alterna(carta: CartaEngine): void {
    // Stesso tocco del setup: se ne fanno quattro o cinque di fila, e deve
    // restare leggero anche quando si toglie una carta dalla selezione.
    audio.suona('scelta');
    setScelte((precedenti) =>
      precedenti.includes(carta.id)
        ? precedenti.filter((id) => id !== carta.id)
        : [...precedenti, carta.id],
    );
  }

  return (
    <section className="schermata">
      <h2>{nomeGiocatore(caller)} prende il monte</h2>
      {conAiuti(session.livello) && (
        <p className="nota">le carte con il bordo chiaro arrivano dal monte</p>
      )}

      <div className="mano mano-larga">
        {allargata.map((carta) => (
          <Card
            key={carta.id}
            card={carta}
            dalMonte={idMonte.has(carta.id)}
            selected={scelte.includes(carta.id)}
            onClick={alterna}
          />
        ))}
      </div>

      <p className="contatore">
        scartate {scelte.length} di {quante}
      </p>

      <button
        type="button"
        className="bottone-grande"
        disabled={scelte.length !== quante}
        onClick={() =>
          onConferma(allargata.filter((carta) => scelte.includes(carta.id)))
        }
      >
        Conferma
      </button>
    </section>
  );
}
