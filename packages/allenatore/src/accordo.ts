import type { VistaDelBot } from '@mediatore/bot';
import type { Card, Rng } from '@mediatore/engine';
import { createRng } from '@mediatore/engine';
import { scegliCartaDiSerie, scegliCartaPesata } from './scegli.ts';
import type { Pesi } from './pesi.ts';
import { PESI_INIZIALI } from './pesi.ts';
import type { Tavolo } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

/**
 * Quanto i due bot, sugli stessi mazzi e nelle stesse situazioni, scelgono
 * la stessa carta. Sotto l'80% i pesi iniziali sono sbagliati.
 */

export interface Accordo {
  decisioni: number;
  uguali: number;
  percento: number;
}

/**
 * Cammina la smazzata col bot di serie e, a ogni bivio, chiede anche al
 * pesato. L'rng del confronto e' lo stesso, cosi' i pareggi non contano
 * come disaccordi.
 */
export function accordoSuSmazzata(args: {
  tavolo: Tavolo;
  dealer: number;
  seed: number;
  pesi?: Pesi;
}): Accordo {
  const pesi = args.pesi ?? PESI_INIZIALI;
  const diSerie = giocaSmazzata({
    tavolo: args.tavolo,
    dealer: args.dealer,
    seed: args.seed,
    scegli: scegliCartaDiSerie,
  });

  let decisioni = 0;
  let uguali = 0;
  let n = 0;

  for (const mossa of diSerie.mosse) {
    if (mossa.vista.legali.length < 2) continue;
    decisioni += 1;
    const rngSerie = createRng(args.seed * 1009 + n);
    const rngPesato = createRng(args.seed * 1009 + n);
    n += 1;
    const una = scegliCartaDiSerie(mossa.vista, rngSerie);
    const altra = scegliCartaPesata(mossa.vista, pesi, rngPesato);
    if (una.id === altra.id) uguali += 1;
  }

  return {
    decisioni,
    uguali,
    percento: decisioni === 0 ? 100 : (uguali / decisioni) * 100,
  };
}

export function misuraAccordo(args: {
  seed?: number;
  smazzate?: number;
  pesi?: Pesi;
  tavoli?: readonly Tavolo[];
}): Accordo {
  const seedBase = args.seed ?? 1;
  const quante = args.smazzate ?? 80;
  const tavoli = args.tavoli ?? TAVOLI;
  let decisioni = 0;
  let uguali = 0;

  for (const tavolo of tavoli) {
    for (let i = 0; i < quante; i += 1) {
      const seed = seedBase + i;
      const parte = accordoSuSmazzata({
        tavolo,
        dealer: i % tavolo.players,
        seed,
        ...(args.pesi !== undefined ? { pesi: args.pesi } : {}),
      });
      decisioni += parte.decisioni;
      uguali += parte.uguali;
    }
  }

  return {
    decisioni,
    uguali,
    percento: decisioni === 0 ? 100 : (uguali / decisioni) * 100,
  };
}

/**
 * Raccoglie le decisioni del bot di serie, per calibrare i pesi. Ogni
 * elemento e' una vista e la carta che il bot attuale ha scelto.
 */
export interface DecisioneDaImitare {
  vista: VistaDelBot;
  scelta: Card;
}

export function raccogliDecisioni(args: {
  seed: number;
  smazzate: number;
  tavoli?: readonly Tavolo[];
}): DecisioneDaImitare[] {
  const tavoli = args.tavoli ?? TAVOLI;
  const raccolte: DecisioneDaImitare[] = [];
  for (const tavolo of tavoli) {
    for (let i = 0; i < args.smazzate; i += 1) {
      const esito = giocaSmazzata({
        tavolo,
        dealer: i % tavolo.players,
        seed: args.seed + i,
        scegli: scegliCartaDiSerie,
      });
      for (const mossa of esito.mosse) {
        if (mossa.vista.legali.length < 2) continue;
        raccolte.push({ vista: mossa.vista, scelta: mossa.scelta });
      }
    }
  }
  return raccolte;
}

/** Una smazzata intera: se la funzione di scelta riceve le mani altrui, esplode. */
export function giocaControllandoLaVista(
  scegli: (vista: VistaDelBot, rng: Rng) => Card,
): void {
  const tavolo = TAVOLI[0];
  if (tavolo === undefined) throw new Error('manca il tavolo a tre');
  giocaSmazzata({
    tavolo,
    dealer: 0,
    seed: 1,
    scegli: (vista, rng) => {
      if ('hands' in vista) {
        throw new Error('la vista non deve contenere le mani degli altri');
      }
      return scegli(vista, rng);
    },
  });
}
