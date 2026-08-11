import type { ReactElement } from 'react';
import { useState, useSyncExternalStore } from 'react';
import { azzeraRegistro, contaSmazzate, iscriviti, scaricaPartite } from '../registro';

/**
 * Il quaderno delle partite, a portata di mano ma in disparte: serve a
 * studiare come si gioca, non a giocare. Sparisce finche' non c'e' niente
 * da scaricare.
 */
export function PartiteRegistrate(): ReactElement | null {
  const quante = useSyncExternalStore(iscriviti, contaSmazzate, contaSmazzate);
  const [chiedeConferma, setChiedeConferma] = useState(false);

  if (quante === 0) return null;

  // Azzerare butta via partite che non tornano piu': la conferma si chiede
  // qui dentro, senza finestre di sistema, che in una PWA stonano.
  if (chiedeConferma) {
    return (
      <p className="nota nota-registro">
        <span>
          {quante === 1
            ? 'butto via la partita registrata?'
            : `butto via tutte e ${quante} le partite registrate?`}
        </span>
        <span className="registro-bottoni">
          <button
            type="button"
            className="bottone-piccolo"
            onClick={() => {
              azzeraRegistro();
              setChiedeConferma(false);
            }}
          >
            si, azzera
          </button>
          <button
            type="button"
            className="bottone-piccolo"
            onClick={() => setChiedeConferma(false)}
          >
            no, lascia stare
          </button>
        </span>
      </p>
    );
  }

  return (
    <p className="nota nota-registro">
      <span>
        {quante} {quante === 1 ? 'partita registrata' : 'partite registrate'}
      </span>
      <span className="registro-bottoni">
        <button type="button" className="bottone-piccolo" onClick={scaricaPartite}>
          scarica le partite
        </button>
        <button
          type="button"
          className="bottone-piccolo"
          onClick={() => setChiedeConferma(true)}
        >
          azzera il registro
        </button>
      </span>
    </p>
  );
}
