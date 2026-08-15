import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { VistaDelBot } from '@mediatore/bot';
import { scegliCarta } from '@mediatore/bot';
import { createRng } from '@mediatore/engine';
import type { Compito, EsitoCompito, VersoPrincipale, VersoWorker } from './lavoro.ts';
import { MONDI_COMPAGNI_DI_SERIE, OPZIONI_DI_SERIE, pensa } from './pensa.ts';
import type { OpzioniPensatore } from './pensa.ts';
import type { Tavolo, TavoloId } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

/**
 * Il bot pensante contro quello di serie, sugli stessi mazzi, posti
 * alternati e scambiati. Stampa il saldo per ruolo e per tavolo, e
 * quanto impiega in media per mossa.
 *
 *   node --experimental-strip-types packages/pensatore/src/sfida.ts
 *   --smazzate=N --mondi=N --mondi-compagni=N --tempo=ms --seed=N --tavolo=3|4|5|amico|tutti
 */

const GIOCHI_PER_WORKER = 4;

export interface ContoRuolo {
  saldo: number;
  posti: number;
}

export interface ContoTavolo {
  saldo: number;
  posti: number;
  chiamante: ContoRuolo;
  difensore: ContoRuolo;
}

export interface Sfida {
  saldo: number;
  posti: number;
  mani: number;
  chiamante: ContoRuolo;
  difensore: ContoRuolo;
  perTavolo: Record<TavoloId, ContoTavolo>;
  mossePensanti: number;
  tempoPensanteMs: number;
}

function vuotoRuolo(): ContoRuolo {
  return { saldo: 0, posti: 0 };
}

function vuotoTavolo(): ContoTavolo {
  return { saldo: 0, posti: 0, chiamante: vuotoRuolo(), difensore: vuotoRuolo() };
}

function sfidaVuota(): Sfida {
  return {
    saldo: 0,
    posti: 0,
    mani: 0,
    chiamante: vuotoRuolo(),
    difensore: vuotoRuolo(),
    perTavolo: {
      '3': vuotoTavolo(),
      '4': vuotoTavolo(),
      '5': vuotoTavolo(),
      amico: vuotoTavolo(),
    },
    mossePensanti: 0,
    tempoPensanteMs: 0,
  };
}

function primaSquadra(seat: number, seed: number): boolean {
  return (seat + seed) % 2 === 0;
}

function accanto(ruolo: ContoRuolo, quota: number): void {
  ruolo.saldo += quota;
  ruolo.posti += 1;
}

function registra(sfida: Sfida, compito: Compito, esito: EsitoCompito): void {
  const conto = sfida.perTavolo[compito.tavolo];
  const eSuo = (seat: number): boolean => primaSquadra(seat, compito.seed) !== compito.rovescio;
  sfida.mani += 1;
  sfida.mossePensanti += esito.mossePensanti;
  sfida.tempoPensanteMs += esito.tempoPensanteMs;

  esito.quote.forEach((quota, seat) => {
    if (!eSuo(seat)) return;
    sfida.saldo += quota;
    sfida.posti += 1;
    conto.saldo += quota;
    conto.posti += 1;
    if (esito.chiamante === null) return;
    const amico = esito.alliance.kind === 'amico' ? esito.alliance.friend : null;
    const dellaParte = seat === esito.chiamante || seat === amico;
    if (dellaParte) {
      accanto(sfida.chiamante, quota);
      accanto(conto.chiamante, quota);
    } else {
      accanto(sfida.difensore, quota);
      accanto(conto.difensore, quota);
    }
  });
}

export function media(conto: { saldo: number; posti: number }): number {
  return conto.posti === 0 ? 0 : conto.saldo / conto.posti;
}

function avviaWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    execArgv: process.execArgv,
  });
}

function chiediAiWorker(worker: Worker, messaggio: VersoWorker): Promise<VersoPrincipale> {
  return new Promise((risolvi, rifiuta) => {
    const pulisci = (): void => {
      worker.off('message', suMessaggio);
      worker.off('error', suErrore);
      worker.off('exit', suUscita);
    };
    const suMessaggio = (risposta: VersoPrincipale): void => {
      pulisci();
      risolvi(risposta);
    };
    const suErrore = (errore: Error): void => {
      pulisci();
      rifiuta(errore);
    };
    const suUscita = (codice: number): void => {
      pulisci();
      rifiuta(new Error(`un worker e' uscito con codice ${codice}`));
    };
    worker.once('message', suMessaggio);
    worker.once('error', suErrore);
    worker.once('exit', suUscita);
    worker.postMessage(messaggio);
  });
}

export async function misuraSfida(args: {
  seed: number;
  smazzate: number;
  opzioni: OpzioniPensatore;
  tavoli?: readonly Tavolo[];
  worker?: number;
}): Promise<Sfida> {
  const tavoli = args.tavoli ?? TAVOLI;
  const compiti: Compito[] = [];
  for (const tavolo of tavoli) {
    for (let i = 0; i < args.smazzate; i += 1) {
      const seed = args.seed + i;
      const dealer = i % tavolo.players;
      for (const rovescio of [false, true]) {
        compiti.push({ tavolo: tavolo.id, dealer, seed, rovescio });
      }
    }
  }

  const quanti = Math.max(1, args.worker ?? availableParallelism());
  const squadra = Array.from({ length: Math.min(quanti, compiti.length) }, () => avviaWorker());
  const sfida = sfidaVuota();

  try {
    for (let i = 0; i < compiti.length; ) {
      const fette: Compito[][] = squadra.map(() => []);
      let assegnati = 0;
      while (assegnati < squadra.length * GIOCHI_PER_WORKER && i + assegnati < compiti.length) {
        const compito = compiti[i + assegnati];
        const fetta = fette[assegnati % squadra.length];
        if (compito === undefined || fetta === undefined) {
          throw new Error('spartizione dei compiti rotta');
        }
        fetta.push(compito);
        assegnati += 1;
      }
      i += assegnati;

      const risposte = await Promise.all(
        squadra.map((worker, k) => {
          const suoi = fette[k] ?? [];
          if (suoi.length === 0) return Promise.resolve({ tipo: 'fatto' as const, esiti: [] });
          const messaggio: VersoWorker = {
            tipo: 'lavora',
            opzioni: args.opzioni,
            compiti: suoi,
          };
          return chiediAiWorker(worker, messaggio);
        }),
      );

      for (const risposta of risposte) {
        if (risposta.tipo === 'errore') throw new Error(risposta.messaggio);
        for (const esito of risposta.esiti) registra(sfida, esito.compito, esito);
      }
    }
  } finally {
    await Promise.all(
      squadra.map((uno) => {
        uno.postMessage({ tipo: 'chiudi' } satisfies VersoWorker);
        return uno.terminate();
      }),
    );
  }

  return sfida;
}

/**
 * Quanti mondi (stessa distribuzione, tutte le carte legali) sta in 500 ms
 * su una mossa vera a meta' smazzata.
 */
export function mondiInTempo(tempoMs: number, seed: number): { mondi: number; tempoMs: number } {
  const tavolo = TAVOLI[1] ?? TAVOLI[0];
  if (tavolo === undefined) throw new Error('manca un tavolo');
  let vistaTrovata: VistaDelBot | null = null;
  giocaSmazzata({
    tavolo,
    dealer: 0,
    seed,
    scegli: (vista, rng) => {
      if (vistaTrovata === null && vista.legali.length >= 2 && vista.preseCompletate.length >= 2) {
        vistaTrovata = vista;
      }
      return scegliCarta(vista, rng);
    },
  });
  if (vistaTrovata === null) {
    throw new Error('nessuna mossa con almeno due carte legali a meta smazzata');
  }
  const conto = pensa(
    vistaTrovata,
    { mondi: 10_000, tempoMs, mondiCompagni: 0 },
    createRng(seed * 17 + 3),
  );
  return { mondi: conto.mondi, tempoMs: conto.tempoMs };
}

function argomento(nome: string): string | null {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato === undefined ? null : trovato.slice(prefisso.length);
}

function argomentoNumerico(nome: string, difetto: number): number {
  const grezzo = argomento(nome);
  if (grezzo === null) return difetto;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore) || valore < 0) {
    console.error(`valore non valido per --${nome}: ${grezzo}`);
    process.exit(1);
  }
  return Math.floor(valore);
}

function tavoliRichiesti(): readonly Tavolo[] {
  const grezzo = argomento('tavolo') ?? 'tutti';
  if (grezzo === 'tutti') return TAVOLI;
  const trovato = TAVOLI.find((tavolo) => tavolo.id === grezzo);
  if (trovato === undefined) {
    console.error(`tavolo non valido: ${grezzo} (ammessi 3, 4, 5, amico, tutti)`);
    process.exit(1);
  }
  return [trovato];
}

function num(valore: number, decimali = 3): string {
  const segno = valore > 0 ? '+' : '';
  return `${segno}${valore.toFixed(decimali)}`.replace('.', ',');
}

function stampaSfida(sfida: Sfida): void {
  const tempoMedio =
    sfida.mossePensanti === 0 ? 0 : sfida.tempoPensanteMs / sfida.mossePensanti;
  console.log(`mani ${sfida.mani}  saldo ${num(sfida.saldo, 1)}  (${num(media(sfida), 3)} a posto)`);
  console.log(
    `  chiamante ${num(media(sfida.chiamante), 3)} a posto (${sfida.chiamante.posti} posti)` +
      `  difensore ${num(media(sfida.difensore), 3)} a posto (${sfida.difensore.posti} posti)`,
  );
  console.log('  per tavolo:');
  for (const tavolo of TAVOLI) {
    const conto = sfida.perTavolo[tavolo.id];
    if (conto.posti === 0) continue;
    console.log(
      `    ${tavolo.etichetta}: ${num(media(conto), 3)} a posto` +
        ` — chiamante ${num(media(conto.chiamante), 3)},` +
        ` difensore ${num(media(conto.difensore), 3)}`,
    );
  }
  console.log(
    `  tempo: ${tempoMedio.toFixed(0)} ms a mossa pensante` +
      ` (${sfida.mossePensanti} mosse, ${(sfida.tempoPensanteMs / 1000).toFixed(1)} s)`,
  );
}

async function main(): Promise<void> {
  const soloTempo = process.argv.includes('--solo-tempo');
  const tempoMs = argomentoNumerico('tempo', OPZIONI_DI_SERIE.tempoMs);
  const seed = argomentoNumerico('seed', 1);

  if (soloTempo) {
    const misura = mondiInTempo(tempoMs, seed);
    console.log(
      `in ${misura.tempoMs.toFixed(0)} ms ha simulato ${misura.mondi} mondi` +
        ` (tutte le carte legali su ciascuna distribuzione)`,
    );
    return;
  }

  const smazzate = argomentoNumerico('smazzate', 250);
  const mondi = argomentoNumerico('mondi', OPZIONI_DI_SERIE.mondi);
  const mondiCompagni = argomentoNumerico('mondi-compagni', MONDI_COMPAGNI_DI_SERIE);
  const worker = argomentoNumerico('worker', availableParallelism());
  const tavoli = tavoliRichiesti();
  const scala = process.argv.includes('--scala');
  const elencoMondi = scala ? [20, 50, 100, 200] : [mondi];

  for (const quanti of elencoMondi) {
    console.log(
      `sfida: ${smazzate} mazzi a tavolo, ${quanti} mondi, ${tempoMs} ms a mossa,` +
        ` compagni ${mondiCompagni}, seed ${seed}, ${worker} worker`,
    );
    const sfida = await misuraSfida({
      seed,
      smazzate,
      opzioni: { mondi: quanti, tempoMs, mondiCompagni },
      tavoli,
      worker,
    });
    stampaSfida(sfida);
    if (elencoMondi.length > 1) console.log('');
  }
}

const eIlPrincipale = process.argv[1]?.endsWith('sfida.ts') === true;
if (eIlPrincipale) {
  await main();
}
