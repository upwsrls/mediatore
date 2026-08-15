import { parentPort } from 'node:worker_threads';
import { scegliCarta } from '@mediatore/bot';
import { scegliCartaPensando } from './pensa.ts';
import type { ScegliCarta } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';
import type { Compito, EsitoCompito, VersoPrincipale, VersoWorker } from './lavoro.ts';

/**
 * Gioca le smazzate che gli arrivano. Il bot pensante siede nei posti
 * della sua squadra, l'altro e' il bot di serie.
 */

const porta = parentPort;
if (porta === null) throw new Error('il worker e partito senza un principale');

function primaSquadra(seat: number, seed: number): boolean {
  return (seat + seed) % 2 === 0;
}

function giocaCompito(compito: Compito, versoPensante: ScegliCarta): EsitoCompito {
  const tavolo = TAVOLI.find((t) => t.id === compito.tavolo);
  if (tavolo === undefined) throw new Error(`tavolo inesistente: ${compito.tavolo}`);

  let mossePensanti = 0;
  let tempoPensanteMs = 0;
  const pensante: ScegliCarta = (vista, rng) => {
    const inizio = process.hrtime.bigint();
    const carta = versoPensante(vista, rng);
    tempoPensanteMs += Number(process.hrtime.bigint() - inizio) / 1_000_000;
    mossePensanti += 1;
    return carta;
  };

  const eSuo = (seat: number): boolean => primaSquadra(seat, compito.seed) !== compito.rovescio;
  const scegli = Array.from({ length: tavolo.players }, (_, seat) =>
    eSuo(seat) ? pensante : scegliCarta,
  );

  const esito = giocaSmazzata({
    tavolo,
    dealer: compito.dealer,
    seed: compito.seed,
    scegli,
  });
  return {
    compito,
    quote: esito.quote,
    chiamante: esito.chiamante,
    alliance: esito.alliance,
    mossePensanti,
    tempoPensanteMs,
  };
}

porta.on('message', (messaggio: VersoWorker) => {
  if (messaggio.tipo === 'chiudi') {
    porta.close();
    return;
  }

  try {
    const versoPensante: ScegliCarta = (vista, rng) =>
      scegliCartaPensando(vista, messaggio.opzioni, rng);
    const esiti = messaggio.compiti.map((compito) => giocaCompito(compito, versoPensante));
    const fatto: VersoPrincipale = { tipo: 'fatto', esiti };
    porta.postMessage(fatto);
  } catch (errore) {
    const testo = errore instanceof Error ? errore.message : String(errore);
    const segnala: VersoPrincipale = { tipo: 'errore', messaggio: testo };
    porta.postMessage(segnala);
  }
});
