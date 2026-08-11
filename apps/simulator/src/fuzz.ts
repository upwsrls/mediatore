import type { Variant } from '@mediatore/engine';
import { createRng, firstHand, nextSeat } from '@mediatore/engine';
import { decidiChiamata, scegliScarti } from '@mediatore/bot';
import type { Agent } from './agents.ts';
import { botAgent, greedyAgent, randomAgent } from './agents.ts';
import type { ChooseCaller, ChooseDiscards } from './play.ts';
import { playHand } from './play.ts';

type Scuola = 'bot' | 'greedy';

interface Bilancio {
  quote: number;
  vinte: number;
  perse: number;
  pari: number;
  mani: number;
}

const TAVOLI: readonly (readonly [number, Variant])[] = [
  [3, 'monte'],
  [4, 'monte'],
  [5, 'monte'],
  [5, 'amico'],
];

function numericArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found === undefined) return fallback;
  const value = Number(found.slice(prefix.length));
  if (!Number.isFinite(value) || value < 1) {
    console.error(`valore non valido per ${prefix}: ${found.slice(prefix.length)}`);
    process.exit(1);
  }
  return Math.floor(value);
}

/**
 * Chi chiama secondo il bot: si interroga il tavolo nell'ordine vero, dal
 * primo di mano, e chiama il primo a cui la mano piace. Se non piace a
 * nessuno si va in liscio, come succede al tavolo quando passano tutti.
 */
const chiamaIlBot: ChooseCaller = ({ hands, config, trump, monte, dealer }) => {
  // La carta che ha girato il trionfo sta in fondo al monte ed e' scoperta:
  // la vedono tutti, e chi chiama se la porta in mano. Senza monte non c'e'.
  const scoperta = config.monteSize > 0 ? (monte[monte.length - 1] ?? null) : null;

  let seat = firstHand(dealer, config.players);
  for (let i = 0; i < config.players; i += 1) {
    const mano = hands[seat] ?? [];
    if (decidiChiamata({ mano, trump, scoperta }, config) === 'chiama') return seat;
    seat = nextSeat(seat, config.players);
  }
  return null;
};

const scartaIlBot: ChooseDiscards = (allargata, trump, quanti, config) =>
  scegliScarti(allargata, trump, quanti, config.players);

function agentsFor(players: number, seed: number): Agent[] {
  return Array.from({ length: players }, (_, seat) =>
    seat % 2 === 0 ? greedyAgent(createRng(seed * 31 + seat)) : randomAgent(createRng(seed * 17 + seat)),
  );
}

/**
 * Il bot a tutti i posti. Serve a misurare come gioca le carte: nel modo di
 * regola le carte le giocano greedy e random, e del bot si vede solo chi
 * chiama e cosa lascia nel monte.
 */
function tuttiBot(players: number, seed: number): Agent[] {
  return Array.from({ length: players }, (_, seat) => botAgent(createRng(seed * 31 + seat)));
}

/**
 * Chi siede dove nella sfida. I posti si alternano e a ogni smazzata si
 * scambiano: a tre e a cinque le squadre non sono pari, e senza lo scambio
 * uno dei due si porterebbe dietro il vantaggio del posto.
 */
function schieramento(players: number, seed: number): Scuola[] {
  return Array.from({ length: players }, (_, seat) =>
    (seat + seed) % 2 === 0 ? 'bot' : 'greedy',
  );
}

function agentsSfida(posti: Scuola[], seed: number): Agent[] {
  return posti.map((scuola, seat) =>
    scuola === 'bot'
      ? botAgent(createRng(seed * 31 + seat))
      : greedyAgent(createRng(seed * 17 + seat)),
  );
}

function segna(bilanci: Map<string, Bilancio>, chiave: string, quota: number): void {
  const conto = bilanci.get(chiave) ?? { quote: 0, vinte: 0, perse: 0, pari: 0, mani: 0 };
  conto.quote += quota;
  conto.mani += 1;
  if (quota > 0) conto.vinte += 1;
  else if (quota < 0) conto.perse += 1;
  else conto.pari += 1;
  bilanci.set(chiave, conto);
}

function main(): void {
  const runs = numericArg('runs', 2000);
  const seedBase = numericArg('seed', 1);
  const sfida = process.argv.includes('--sfida');
  // Di regola chiamata e scarto passano dal bot: e' la logica che si misura.
  // Con --chiamataACaso si torna al chiamante estratto a sorte, che e' il
  // metro di paragone da cui si e' partiti.
  const aCaso = process.argv.includes('--chiamataACaso');
  const soloBot = process.argv.includes('--tuttiBot');
  const inizio = process.hrtime.bigint();

  const bilanci = new Map<string, Bilancio>();

  const perTavolo = new Map<string, number>();
  const chiamatePerTavolo = new Map<string, number>();
  const vintePerTavolo = new Map<string, number>();
  const capofila = new Map<number, number>();
  let totali = 0;
  let lisci = 0;
  let amicoRivelato = 0;
  let amicoMaiRivelato = 0;
  let chiamanteVince = 0;
  let chiamantePerde = 0;
  let pareggi = 0;

  for (let i = 0; i < runs; i += 1) {
    const seed = seedBase + i;
    for (const [players, variant] of TAVOLI) {
      const etichetta = `${players} ${variant}`;
      const dealer = i % players;
      const posti = schieramento(players, seed);
      try {
        const result = playHand({
          players,
          variant,
          dealer,
          seed,
          agents: sfida
            ? agentsSfida(posti, seed)
            : soloBot
              ? tuttiBot(players, seed)
              : agentsFor(players, seed),
          ...(aCaso ? {} : { chooseCaller: chiamaIlBot, chooseDiscards: scartaIlBot }),
        });

        totali += 1;
        perTavolo.set(etichetta, (perTavolo.get(etichetta) ?? 0) + 1);

        const alliance = result.finalState.alliance;

        if (sfida) {
          const tipo = alliance.kind === 'liscio' ? 'liscio' : 'chiamata';
          result.settlement.forEach((quota, seat) => {
            const scuola = posti[seat] ?? 'greedy';
            segna(bilanci, scuola, quota);
            segna(bilanci, `${scuola} in ${tipo}`, quota);
          });
        }

        if (alliance.kind === 'liscio') {
          lisci += 1;
        } else if (alliance.kind === 'amico') {
          if (alliance.friend === null) amicoMaiRivelato += 1;
          else amicoRivelato += 1;
        }

        if (alliance.kind !== 'liscio') {
          chiamatePerTavolo.set(etichetta, (chiamatePerTavolo.get(etichetta) ?? 0) + 1);
        }

        if (result.score.tie) pareggi += 1;
        else if (result.score.callerWins === true) {
          chiamanteVince += 1;
          vintePerTavolo.set(etichetta, (vintePerTavolo.get(etichetta) ?? 0) + 1);
        } else if (result.score.callerWins === false) chiamantePerde += 1;

        const massimo = Math.max(...result.score.perPlayer);
        const primo = result.score.perPlayer.indexOf(massimo);
        capofila.set(primo, (capofila.get(primo) ?? 0) + 1);
      } catch (error) {
        const messaggio = error instanceof Error ? error.message : String(error);
        console.error(`run fallito: seed=${seed} tavolo=${etichetta} mazziere=${dealer}`);
        console.error(messaggio);
        process.exit(1);
      }
    }
  }

  const durataMs = Number(process.hrtime.bigint() - inizio) / 1_000_000;
  const quota = (valore: number): string =>
    `${valore} (${totali === 0 ? 0 : ((valore / totali) * 100).toFixed(1)}%)`;

  const chiGioca = sfida ? 'bot contro greedy' : soloBot ? 'bot a tutti i posti' : 'greedy e random';
  console.log(`smazzate simulate: ${totali} in ${durataMs.toFixed(0)} ms (carte giocate da ${chiGioca})`);
  console.log('per tavolo:');
  for (const [etichetta, conteggio] of perTavolo) {
    const chiamate = chiamatePerTavolo.get(etichetta) ?? 0;
    const vinte = vintePerTavolo.get(etichetta) ?? 0;
    const percento = (valore: number, su: number): string =>
      su === 0 ? '0%' : `${((valore / su) * 100).toFixed(1)}%`;
    console.log(
      `  ${etichetta}: ${conteggio} smazzate, chiama ${percento(chiamate, conteggio)},` +
        ` chiamante vince ${percento(vinte, chiamate)}`,
    );
  }
  console.log(`chiamate: ${quota(totali - lisci)} (chiamante ${aCaso ? 'a caso' : 'dal bot'})`);
  console.log(`lisci: ${quota(lisci)}`);
  const chiamate = totali - lisci;
  const suChiamate = (valore: number): string =>
    `${valore} (${chiamate === 0 ? 0 : ((valore / chiamate) * 100).toFixed(1)}% delle chiamate)`;
  console.log(`  il chiamante vince: ${suChiamate(chiamanteVince)}`);
  console.log(`amico rivelato: ${amicoRivelato}, amico mai rivelato: ${amicoMaiRivelato}`);
  console.log(
    `esiti: chiamante vince ${chiamanteVince}, chiamante perde ${chiamantePerde}, pareggi ${pareggi}`,
  );
  console.log('capofila per posto:');
  for (const seat of [...capofila.keys()].sort((a, b) => a - b)) {
    console.log(`  p${seat}: ${capofila.get(seat) ?? 0}`);
  }

  if (sfida) {
    console.log('sfida bot contro greedy, conto per posto e per smazzata:');
    for (const [chi, conto] of [...bilanci.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const percento = (valore: number): string =>
        conto.mani === 0 ? '0%' : `${((valore / conto.mani) * 100).toFixed(1)}%`;
      const media = conto.mani === 0 ? 0 : conto.quote / conto.mani;
      console.log(
        `  ${chi}: vince ${percento(conto.vinte)}, perde ${percento(conto.perse)},` +
          ` pari ${percento(conto.pari)} — saldo ${conto.quote > 0 ? '+' : ''}${conto.quote}` +
          ` (${media >= 0 ? '+' : ''}${media.toFixed(3)} a mano su ${conto.mani} mani)`,
      );
    }
  }

  if (lisci === 0 || lisci === totali) {
    console.log('ATTENZIONE: simulazione degenere, i rami chiamata e liscio non sono entrambi esercitati');
  }
}

main();
