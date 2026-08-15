import { scegliCartaPensando } from '@mediatore/pensatore';
import { createRng } from '@mediatore/engine';
import { MONDI_DEL_TAVOLO, TEMPO_DEL_TAVOLO_MS } from './pensa.lavoro.ts';
import type { DomandaAlPensatore, RispostaDelPensatore } from './pensa.lavoro.ts';

/**
 * Il pensatore sta su un filo suo: i quaranta millisecondi di una mossa
 * non devono inchiodare la pagina. Chiamata e scarto non passano di qui.
 */

interface Filo {
  postMessage: (dati: RispostaDelPensatore) => void;
  addEventListener: (
    tipo: 'message',
    ascolta: (evento: MessageEvent<DomandaAlPensatore>) => void,
  ) => void;
}

const filo = globalThis as unknown as Filo;

filo.addEventListener('message', (evento) => {
  const { id, vista, seed } = evento.data;
  const carta = scegliCartaPensando(
    vista,
    { mondi: MONDI_DEL_TAVOLO, tempoMs: TEMPO_DEL_TAVOLO_MS, mondiCompagni: 0 },
    createRng(seed),
  );
  filo.postMessage({ id, cartaId: carta.id });
});
