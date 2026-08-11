import { createInterface } from 'node:readline';
import type { Alliance, Card, CallAction, TableConfig, Variant } from '@mediatore/engine';
import {
  applyCall,
  callableCards,
  createCallState,
  createHandState,
  createRng,
  currentCaller,
  deal,
  discardToMonte,
  legalPlaysFor,
  playCard,
  scoreHand,
  settle,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import { greedyAgent, pickOne } from './agents.ts';
import { formatCard, formatHand, formatScore, formatTrick } from './format.ts';
import { cheapestCards } from './play.ts';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY === true,
});

// L'iteratore mette in pausa lo stream fra una riga e l'altra: cosi' l'input
// reindirizzato da file o pipe non perde righe come farebbe rl.question.
const righe = rl[Symbol.asyncIterator]();

class InputEsaurito extends Error {}

async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const riga = await righe.next();
  if (riga.done === true) {
    throw new InputEsaurito('input terminato');
  }
  return riga.value;
}

/** Ripete la domanda finche' non arriva un numero valido: mai uno stack trace. */
async function askIndex(prompt: string, count: number): Promise<number> {
  for (;;) {
    const risposta = (await ask(`${prompt} [1-${count}]: `)).trim();
    const valore = Number(risposta);
    if (Number.isInteger(valore) && valore >= 1 && valore <= count) return valore - 1;
    console.log(`  risposta non valida: digita un numero fra 1 e ${count}`);
  }
}

/** Per ora si chiama solo normale: le dichiarazioni speciali arriveranno dopo. */
async function askCall(): Promise<CallAction> {
  for (;;) {
    const risposta = (await ask('chiami o passi? [chiama/passo]: ')).trim().toLowerCase();
    if (risposta === 'chiama' || risposta === 'c') return { tipo: 'chiama', chiamata: 'normale' };
    if (risposta === 'passo' || risposta === 'p') return { tipo: 'passo' };
    console.log('  risposta non valida: scrivi "chiama" oppure "passo"');
  }
}

function stringArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function numericArg(name: string, fallback: number): number {
  const valore = Number(stringArg(name, String(fallback)));
  return Number.isFinite(valore) ? Math.floor(valore) : fallback;
}

async function chooseDiscards(allargata: Card[], config: TableConfig): Promise<Card[]> {
  console.log(`\nhai preso il monte. Devi scartare ${config.monteSize} carte.`);
  for (;;) {
    allargata.forEach((card, index) => {
      console.log(`  ${index + 1}. ${formatCard(card)}`);
    });
    const risposta = await ask(`scegli ${config.monteSize} numeri separati da spazio: `);
    const indici = risposta
      .trim()
      .split(/\s+/)
      .map((token) => Number(token) - 1);

    const validi =
      indici.length === config.monteSize &&
      indici.every((i) => Number.isInteger(i) && i >= 0 && i < allargata.length);
    if (!validi) {
      console.log(`  servono esattamente ${config.monteSize} numeri validi, riprova`);
      continue;
    }

    const scarti = indici.map((i) => allargata[i] as Card);
    try {
      discardToMonte(allargata, scarti, config.monteSize);
      return scarti;
    } catch (error) {
      console.log(`  ${error instanceof Error ? error.message : String(error)}, riprova`);
    }
  }
}

async function main(): Promise<void> {
  const players = numericArg('players', 4);
  const variant = stringArg('variant', 'monte') as Variant;
  const seed = numericArg('seed', 1);
  const seat = numericArg('seat', 0);

  if (variant !== 'monte' && variant !== 'amico') {
    console.log(`variante non riconosciuta: ${variant} (ammesse monte, amico)`);
    rl.close();
    return;
  }

  let config: TableConfig;
  try {
    config = tableConfig(players, variant);
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    rl.close();
    return;
  }
  if (seat < 0 || seat >= config.players) {
    console.log(`posto non valido: ${seat} (ammessi 0-${config.players - 1})`);
    rl.close();
    return;
  }

  const rng = createRng(seed);
  const dealer = 0;
  const dealt = deal(config, dealer, rng);
  const hands = dealt.hands.map((hand) => [...hand]);
  let monte = [...dealt.monte];
  const bots = Array.from({ length: config.players }, () => greedyAgent(rng));

  console.log(`\ntavolo a ${config.players}, variante ${config.variant}, seme ${dealt.trump}`);
  console.log(`sei il giocatore p${seat}, mazziere p${dealer}`);
  console.log(`la tua mano: ${formatHand(hands[seat] as Card[])}\n`);

  let call = createCallState(config, dealer);
  while (!call.closed) {
    const interrogato = currentCaller(call);
    if (interrogato === null) break;
    let action: CallAction;
    if (interrogato === seat) {
      action = await askCall();
    } else {
      action = rng() < 0.25 ? { tipo: 'chiama', chiamata: 'normale' } : { tipo: 'passo' };
      console.log(`p${interrogato} ${action.tipo}`);
    }
    call = applyCall(call, interrogato, action);
  }

  const caller = call.caller;
  console.log(caller === null ? '\nnessuno ha chiamato: si gioca in liscio\n' : `\nha chiamato p${caller}\n`);

  if (caller !== null && config.monteSize > 0) {
    const allargata = takeMonte(hands[caller] as Card[], monte);
    const scarti =
      caller === seat ? await chooseDiscards(allargata, config) : cheapestCards(allargata, config.monteSize, rng);
    const scambio = discardToMonte(allargata, scarti, config.monteSize);
    hands[caller] = scambio.hand;
    monte = scambio.monte;
    if (caller === seat) {
      console.log(`la tua mano dopo lo scambio: ${formatHand(scambio.hand)}\n`);
    }
  }

  let alliance: Alliance;
  if (caller === null) {
    alliance = { kind: 'liscio' };
  } else if (config.variant === 'amico') {
    const chiamabili = callableCards(hands[caller] as Card[]);
    let chiamata: Card;
    if (caller === seat) {
      console.log('quale carta chiami come amico?');
      chiamabili.forEach((card, index) => console.log(`  ${index + 1}. ${formatCard(card)}`));
      chiamata = chiamabili[await askIndex('scegli', chiamabili.length)] as Card;
    } else {
      chiamata = pickOne(chiamabili, rng);
    }
    console.log(`\np${caller} chiama ${formatCard(chiamata)}\n`);
    if (caller !== seat && (hands[seat] as Card[]).some((card) => card.id === chiamata.id)) {
      console.log('hai tu la carta chiamata: sei l amico del chiamante, ma gli altri non lo sanno ancora\n');
    }
    alliance = { kind: 'amico', caller, calledCard: chiamata.id, friend: null };
  } else {
    alliance = { kind: 'monte', caller, chiamata: 'normale' };
  }

  let state = createHandState({ config, dealer, trump: dealt.trump, alliance, hands, monte });

  while (!state.finished) {
    const player = state.turn;
    const legal = legalPlaysFor(state, player);
    let scelta: Card;

    if (player === seat) {
      const numeroPresa = state.completedTricks.length + 1;
      console.log(`--- presa ${numeroPresa}/${config.tricks}, trionfo ${state.trump} ---`);
      console.log(`in tavola: ${formatTrick(state.currentTrick)}`);
      const legalIds = new Set(legal.map((card) => card.id));
      const mano = (state.hands[seat] as Card[])
        .map((card) => (legalIds.has(card.id) ? formatCard(card) : `(${formatCard(card)})`))
        .join(' ');
      console.log(`la tua mano: ${mano}   le carte fra parentesi non sono giocabili`);
      legal.forEach((card, index) => console.log(`  ${index + 1}. ${formatCard(card)}`));
      scelta = legal[await askIndex('che carta giochi?', legal.length)] as Card;
    } else {
      const agent = bots[player];
      if (agent === undefined) {
        console.log(`manca l agent per il posto ${player}`);
        rl.close();
        return;
      }
      scelta = agent(legal, state, player);
      console.log(`p${player} gioca ${formatCard(scelta)}`);
    }

    const precedente = state;
    state = playCard(state, player, scelta.id);

    if (
      precedente.alliance.kind === 'amico' &&
      precedente.alliance.friend === null &&
      state.alliance.kind === 'amico' &&
      state.alliance.friend !== null
    ) {
      console.log(`>>> p${state.alliance.friend} si rivela: e l amico del chiamante`);
    }

    if (state.completedTricks.length > precedente.completedTricks.length) {
      const presa = state.completedTricks[state.completedTricks.length - 1];
      console.log(`presa a p${presa?.winner} per ${presa?.points} punti\n`);
    }
  }

  const score = scoreHand(state);
  console.log('--- fine smazzata ---');
  console.log(formatScore(score, settle(state, score)));
  rl.close();
}

main().catch((error: unknown) => {
  if (error instanceof InputEsaurito) {
    console.log('\ninput terminato, partita interrotta');
    rl.close();
    return;
  }
  console.log(`errore inatteso: ${error instanceof Error ? error.message : String(error)}`);
  rl.close();
  process.exitCode = 1;
});
