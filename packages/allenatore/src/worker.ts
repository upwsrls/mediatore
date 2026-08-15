import { parentPort } from 'node:worker_threads';
import { gradienteDellaSmazzata } from './gradiente.ts';
import type { VersoPrincipale, VersoWorker } from './lavoro.ts';
import { TAVOLI } from './smazzata.ts';

/**
 * Gioca le smazzate che gli arrivano, sugli pesi del principale, e rimanda
 * i gradienti. Non tocca il file dei pesi: quello lo scrive solo chi coordina.
 */

const porta = parentPort;
if (porta === null) throw new Error('il worker e partito senza un principale');

porta.on('message', (messaggio: VersoWorker) => {
  if (messaggio.tipo === 'chiudi') {
    porta.close();
    return;
  }

  try {
    const gradienti = messaggio.compiti.map((compito) => {
      const tavolo = TAVOLI[compito.tavolo];
      if (tavolo === undefined) {
        throw new Error(`tavolo inesistente: ${compito.tavolo}`);
      }
      return gradienteDellaSmazzata({
        pesi: messaggio.pesi,
        tavolo,
        dealer: compito.dealer,
        seed: compito.seed,
        indice: compito.indice,
        avversario: messaggio.avversario,
      });
    });
    const fatto: VersoPrincipale = { tipo: 'fatto', gradienti };
    porta.postMessage(fatto);
  } catch (errore) {
    const messaggioErrore = errore instanceof Error ? errore.message : String(errore);
    const segnala: VersoPrincipale = { tipo: 'errore', messaggio: messaggioErrore };
    porta.postMessage(segnala);
  }
});
