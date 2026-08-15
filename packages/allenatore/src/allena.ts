import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { misuraAccordo } from './accordo.ts';
import { PAROLE } from './caratteristiche.ts';
import {
  caricaCheckpoint,
  checkpointVuoto,
  salvaCheckpoint,
  salvaMigliori,
} from './checkpoint.ts';
import type { Checkpoint } from './checkpoint.ts';
import { applicaGradienti } from './gradiente.ts';
import type { Avversario, Compito, VersoPrincipale, VersoWorker } from './lavoro.ts';
import { estremiDeiPesi } from './pesi.ts';
import { media, mettiAllaProva } from './prova.ts';
import type { Prova } from './prova.ts';
import { TAVOLI } from './smazzata.ts';

/**
 * Addestra il bot. Di serie gioca contro il bot insegnato dalle partite
 * vere, un posto alla volta, alternando. I pesi migliori di ogni prova
 * si tengono da parte, anche se dopo l'addestramento peggiora.
 *
 *   node --experimental-strip-types packages/allenatore/src/allena.ts
 *   --smazzate=N --seed=N --pesi=file --worker=N --prova=N
 *   --avversario=serie|se-stesso --passo=N
 */

const PASSO_INIZIALE = 0.0125;
const DECADIMENTO = 20_000;
const PROVA_OGNI = 20_000;
const SALVA_OGNI = 200;
/** Quante smazzate fa un worker prima di rimandare i gradienti. */
const GIOCHI_PER_WORKER = 16;
const SMAZZATE_DI_PROVA = 40;
const SEED_DELLE_PROVE = 10_000_003;
const ACCORDO_MINIMO = 80;

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

function argomentoReale(nome: string, difetto: number): number {
  const grezzo = argomento(nome);
  if (grezzo === null) return difetto;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore) || valore <= 0) {
    console.error(`valore non valido per --${nome}: ${grezzo}`);
    process.exit(1);
  }
  return valore;
}

function avversarioRichiesto(): Avversario {
  const grezzo = argomento('avversario') ?? 'serie';
  if (grezzo === 'serie' || grezzo === 'se-stesso') return grezzo;
  console.error(`avversario non valido: ${grezzo} (ammessi serie, se-stesso)`);
  process.exit(1);
}

function quantiWorker(): number {
  const grezzo = argomento('worker');
  if (grezzo === null) return Math.max(1, availableParallelism());
  const valore = Number(grezzo);
  if (!Number.isInteger(valore) || valore < 1) {
    console.error(`valore non valido per --worker: ${grezzo}`);
    process.exit(1);
  }
  return valore;
}

function passoDi(smazzate: number, passoIniziale: number): number {
  return passoIniziale / (1 + smazzate / DECADIMENTO);
}

function num(valore: number, decimali = 3): string {
  const segno = valore > 0 ? '+' : '';
  return `${segno}${valore.toFixed(decimali)}`.replace('.', ',');
}

function percento(valore: number): string {
  return `${valore.toFixed(1)}%`.replace('.', ',');
}

function rigaProva(prova: Prova): string {
  return (
    `saldo ${num(prova.saldo, 1)}` +
    ` (chiamante ${num(media(prova.chiamante), 3)}` +
    `, difensore ${num(media(prova.difensore), 3)} a posto)`
  );
}

function compitoDi(indice: number, seedBase: number): Compito {
  const tavolo = TAVOLI[indice % TAVOLI.length];
  if (tavolo === undefined) throw new Error('manca il tavolo');
  return {
    indice,
    seed: seedBase + indice,
    tavolo: indice % TAVOLI.length,
    dealer: indice % tavolo.players,
  };
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

async function unGiro(
  squadra: readonly Worker[],
  checkpoint: Checkpoint,
  obiettivo: number,
  avversario: Avversario,
): Promise<Checkpoint> {
  const daFare = Math.min(squadra.length * GIOCHI_PER_WORKER, obiettivo - checkpoint.smazzate);
  if (daFare <= 0) return checkpoint;

  const compiti = Array.from({ length: daFare }, (_, i) =>
    compitoDi(checkpoint.smazzate + i, checkpoint.seed),
  );
  const fette: Compito[][] = squadra.map(() => []);
  for (let i = 0; i < compiti.length; i += 1) {
    const compito = compiti[i];
    const fetta = fette[i % squadra.length];
    if (compito === undefined || fetta === undefined) throw new Error('spartizione dei compiti rotta');
    fetta.push(compito);
  }
  const risposte = await Promise.all(
    squadra.map((worker, i) => {
      const suoi = fette[i] ?? [];
      if (suoi.length === 0) return Promise.resolve({ tipo: 'fatto' as const, gradienti: [] });
      const messaggio: VersoWorker = {
        tipo: 'lavora',
        pesi: checkpoint.pesi,
        avversario,
        compiti: suoi,
      };
      return chiediAiWorker(worker, messaggio);
    }),
  );
  const gradienti = [];
  for (const risposta of risposte) {
    if (risposta.tipo === 'errore') throw new Error(risposta.messaggio);
    for (const gradiente of risposta.gradienti) gradienti.push(gradiente);
  }

  const passo = passoDi(checkpoint.smazzate, checkpoint.passoIniziale);
  return {
    ...checkpoint,
    smazzate: checkpoint.smazzate + gradienti.length,
    passo,
    pesi: applicaGradienti(checkpoint.pesi, gradienti, passo),
  };
}

function stampaEstremi(pesi: Checkpoint['pesi']): void {
  const { alte, basse } = estremiDeiPesi(pesi, 6);
  console.log('cosa ha imparato, in parole:');
  console.log('  i pesi piu alti:');
  for (const { nome, peso } of alte) {
    console.log(`    ${num(peso, 2).padStart(8)}  ${PAROLE[nome]}`);
  }
  console.log('  i pesi piu bassi:');
  for (const { nome, peso } of basse) {
    console.log(`    ${num(peso, 2).padStart(8)}  ${PAROLE[nome]}`);
  }
}

function stampaProva(prova: Prova): void {
  console.log(`saldo del bot addestrato contro quello attuale: ${num(prova.saldo, 1)}`);
  console.log(
    `  per ruolo: chiamante ${num(media(prova.chiamante), 3)} a posto` +
      ` (${prova.chiamante.posti} posti),` +
      ` difensore ${num(media(prova.difensore), 3)} a posto` +
      ` (${prova.difensore.posti} posti)`,
  );
  console.log('  per tavolo:');
  for (const tavolo of TAVOLI) {
    const conto = prova.perTavolo[tavolo.id];
    console.log(
      `    ${tavolo.etichetta}: ${num(media(conto), 3)} a posto` +
        ` — chiamante ${num(media(conto.chiamante), 3)},` +
        ` difensore ${num(media(conto.difensore), 3)}`,
    );
  }
}

async function addestra(
  checkpointIniziale: Checkpoint,
  obiettivo: number,
  dove: string,
  worker: number,
  provaOgni: number,
  avversario: Avversario,
): Promise<Checkpoint> {
  const squadra = Array.from({ length: worker }, () => avviaWorker());
  let checkpoint = checkpointIniziale;
  let tempoGioco = 0;

  try {
    while (checkpoint.smazzate < obiettivo) {
      const prima = checkpoint.smazzate;
      const inizio = process.hrtime.bigint();
      checkpoint = await unGiro(squadra, checkpoint, obiettivo, avversario);
      tempoGioco += Number(process.hrtime.bigint() - inizio) / 1_000_000;
      if (checkpoint.smazzate === prima) {
        throw new Error('un giro non ha prodotto smazzate: i worker sono fermi');
      }

      const attraversa = (ogni: number): boolean =>
        Math.floor(prima / ogni) !== Math.floor(checkpoint.smazzate / ogni);
      const toccaProva = attraversa(provaOgni) || checkpoint.smazzate === obiettivo;
      const toccaSalva = attraversa(SALVA_OGNI) || checkpoint.smazzate === obiettivo;

      if (toccaProva) {
        const prova = mettiAllaProva({
          pesi: checkpoint.pesi,
          seed: SEED_DELLE_PROVE,
          smazzate: SMAZZATE_DI_PROVA,
        });
        const eNuovoRecord =
          checkpoint.migliori === null || prova.saldo > checkpoint.migliori.saldo;
        const migliori = eNuovoRecord
          ? { smazzate: checkpoint.smazzate, saldo: prova.saldo, pesi: { ...checkpoint.pesi } }
          : checkpoint.migliori;
        if (eNuovoRecord && migliori !== null) salvaMigliori(dove, migliori);
        checkpoint = { ...checkpoint, ultimaProva: prova, migliori };
        const alSecondo = tempoGioco === 0 ? 0 : (checkpoint.smazzate - checkpointIniziale.smazzate) / (tempoGioco / 1000);
        console.log(
          `smazzate ${checkpoint.smazzate}  passo ${num(checkpoint.passo, 4)}` +
            `  ${alSecondo.toFixed(0)}/s  prova: ${rigaProva(prova)}` +
            (eNuovoRecord ? '  *migliore*' : ''),
        );
      }

      if (toccaSalva) salvaCheckpoint(dove, checkpoint);
    }
  } finally {
    await Promise.all(
      squadra.map((uno) => {
        uno.postMessage({ tipo: 'chiudi' } satisfies VersoWorker);
        return uno.terminate();
      }),
    );
  }

  const fatte = checkpoint.smazzate - checkpointIniziale.smazzate;
  const alSecondo = tempoGioco === 0 ? 0 : fatte / (tempoGioco / 1000);
  console.log(
    `addestramento: ${fatte} smazzate in ${(tempoGioco / 1000).toFixed(1)} s` +
      ` (${alSecondo.toFixed(0)} smazzate/s, ${worker} worker)`,
  );
  return checkpoint;
}

async function main(): Promise<void> {
  const smazzate = argomentoNumerico('smazzate', 0);
  const seed = argomentoNumerico('seed', 1);
  const filePesi = argomento('pesi');
  const worker = quantiWorker();
  const provaOgni = Math.max(1, argomentoNumerico('prova', PROVA_OGNI));
  const avversario = avversarioRichiesto();
  const passoChiesto = argomento('passo');
  const riprende = filePesi !== null;

  let checkpoint = riprende
    ? caricaCheckpoint(filePesi)
    : checkpointVuoto(seed, PASSO_INIZIALE);
  if (passoChiesto !== null) {
    const passoIniziale = argomentoReale('passo', PASSO_INIZIALE);
    checkpoint = { ...checkpoint, passoIniziale, passo: passoDi(checkpoint.smazzate, passoIniziale) };
  }

  if (!riprende) {
    console.log('accordo fra bot pesato e bot attuale, stessi mazzi:');
    const accordo = misuraAccordo({ seed: 7, smazzate: 60 });
    console.log(
      `  ${percento(accordo.percento)}` +
        ` (${accordo.uguali} su ${accordo.decisioni} decisioni)`,
    );
    if (accordo.percento < ACCORDO_MINIMO) {
      console.error(
        `accordo sotto l'80%: i pesi iniziali sono sbagliati, non addestro.`,
      );
      process.exit(1);
    }
    if (smazzate === 0) {
      console.log('niente --smazzate: mi fermo qui, senza addestrare.');
      return;
    }
  } else if (smazzate === 0) {
    console.log(
      `ripreso da ${filePesi}: ${checkpoint.smazzate} smazzate gia fatte, passo ${num(checkpoint.passo, 4)}`,
    );
    if (checkpoint.ultimaProva !== null) {
      console.log(`ultima prova: ${rigaProva(checkpoint.ultimaProva)}`);
    }
    if (checkpoint.migliori !== null) {
      console.log(
        `pesi migliori: a ${checkpoint.migliori.smazzate} smazzate,` +
          ` saldo ${num(checkpoint.migliori.saldo, 1)}`,
      );
    }
    stampaEstremi(checkpoint.pesi);
    return;
  }

  const obiettivo = checkpoint.smazzate + smazzate;
  const dove = filePesi ?? 'pesi.json';
  console.log(
    `addestro da ${checkpoint.smazzate} a ${obiettivo}, seed ${checkpoint.seed},` +
      ` ${worker} worker, avversario ${avversario}, passo ${num(checkpoint.passoIniziale, 4)},` +
      ` prova ogni ${provaOgni}, salvo su ${dove}`,
  );

  checkpoint = await addestra(checkpoint, obiettivo, dove, worker, provaOgni, avversario);

  console.log('');
  console.log('riepilogo');
  const provaFinale =
    checkpoint.ultimaProva ??
    mettiAllaProva({
      pesi: checkpoint.pesi,
      seed: SEED_DELLE_PROVE,
      smazzate: SMAZZATE_DI_PROVA,
    });
  checkpoint = { ...checkpoint, ultimaProva: provaFinale };
  console.log('pesi finali:');
  stampaProva(provaFinale);
  stampaEstremi(checkpoint.pesi);
  if (checkpoint.migliori !== null) {
    console.log('');
    console.log(
      `pesi migliori: a ${checkpoint.migliori.smazzate} smazzate,` +
        ` saldo ${num(checkpoint.migliori.saldo, 1)}`,
    );
    stampaEstremi(checkpoint.migliori.pesi);
  }
  salvaCheckpoint(dove, checkpoint);
}

await main();
