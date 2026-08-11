import type { Parametri } from '@mediatore/bot';
import { botCon } from './avversari.ts';
import type { Giocatore, Tavolo, TavoloId } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

/**
 * Quanto vale una combinazione di numeri.
 *
 * Il confronto e' appaiato due volte. Primo: ogni combinazione gioca gli
 * STESSI mazzi, cosi' la differenza viene dai parametri e non da un mazzo
 * piu' fortunato. Secondo: ogni mazzo si gioca due volte, la seconda coi
 * posti rovesciati, perche' a tre e a cinque le posizioni non sono
 * equivalenti e chi siede in certi posti parte avvantaggiato.
 *
 * Il rovescio non e' un dettaglio: senza, ogni posto tarato finisce sempre
 * alla stessa distanza dal mazziere e il vantaggio del posto si scambia per
 * merito dei numeri. Con il rovescio, due bot identici pareggiano esatto.
 */

export interface Sommario {
  /** Saldo medio di un posto tarato, per mano giocata. */
  saldoMedio: number;
  /** In quante mani ha chiamato il bot tarato, in percentuale. */
  percentualeChiamate: number;
  /** Delle sue chiamate, quante ne ha vinte, in percentuale. */
  percentualeVinte: number;
  /** I mazzi distribuiti: ognuno giocato due volte, a posti scambiati. */
  mazzi: number;
  /** Le mani giocate, cioe' il doppio dei mazzi. */
  mani: number;
  chiamate: number;
}

export interface Risultato extends Sommario {
  perTavolo: ReadonlyMap<TavoloId, Sommario>;
}

interface Conto {
  quote: number;
  posti: number;
  mazzi: number;
  mani: number;
  chiamate: number;
  vinte: number;
}

const vuoto = (): Conto => ({ quote: 0, posti: 0, mazzi: 0, mani: 0, chiamate: 0, vinte: 0 });

function sommario(conto: Conto): Sommario {
  return {
    saldoMedio: conto.posti === 0 ? 0 : conto.quote / conto.posti,
    percentualeChiamate: conto.mani === 0 ? 0 : (conto.chiamate / conto.mani) * 100,
    percentualeVinte: conto.chiamate === 0 ? 0 : (conto.vinte / conto.chiamate) * 100,
    mazzi: conto.mazzi,
    mani: conto.mani,
    chiamate: conto.chiamate,
  };
}

/**
 * Come si spartiscono i posti in un mazzo. Alla seconda mano la spartizione
 * si rovescia, cosi' ogni posto viene giocato una volta per parte.
 */
function primaSquadra(seat: number, seed: number): boolean {
  return (seat + seed) % 2 === 0;
}

export interface OpzioniMisura {
  /** I numeri da provare. */
  parametri: Parametri;
  /** L'avversario: di regola il bot com'e' adesso. */
  riferimento: Giocatore;
  seedBase: number;
  /** Quanti mazzi per ogni tavolo: ognuno vale due mani, a posti scambiati. */
  smazzate: number;
  tavoli?: readonly TavoloId[];
}

export function misura(opzioni: OpzioniMisura): Risultato {
  const scelti = opzioni.tavoli;
  const tavoli: readonly Tavolo[] =
    scelti === undefined ? TAVOLI : TAVOLI.filter((tavolo) => scelti.includes(tavolo.id));

  const inProva = botCon(opzioni.parametri);
  const totale = vuoto();
  const perTavolo = new Map<TavoloId, Conto>();

  for (const tavolo of tavoli) {
    const conto = vuoto();
    for (let i = 0; i < opzioni.smazzate; i += 1) {
      const seed = opzioni.seedBase + i;
      const dealer = i % tavolo.players;
      conto.mazzi += 1;

      for (const rovescio of [false, true]) {
        const eSuo = (seat: number): boolean => primaSquadra(seat, seed) !== rovescio;
        const posti = Array.from({ length: tavolo.players }, (_, seat) =>
          eSuo(seat) ? inProva : opzioni.riferimento,
        );

        const esito = giocaSmazzata({ tavolo, dealer, seed, posti });

        conto.mani += 1;
        for (let seat = 0; seat < tavolo.players; seat += 1) {
          if (!eSuo(seat)) continue;
          conto.quote += esito.quote[seat] ?? 0;
          conto.posti += 1;
        }

        if (esito.chiamante !== null && eSuo(esito.chiamante)) {
          conto.chiamate += 1;
          if (esito.chiamanteVince === true) conto.vinte += 1;
        }
      }
    }

    perTavolo.set(tavolo.id, conto);
    totale.quote += conto.quote;
    totale.posti += conto.posti;
    totale.mazzi += conto.mazzi;
    totale.mani += conto.mani;
    totale.chiamate += conto.chiamate;
    totale.vinte += conto.vinte;
  }

  return {
    ...sommario(totale),
    perTavolo: new Map([...perTavolo].map(([id, conto]) => [id, sommario(conto)])),
  };
}
