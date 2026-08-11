import type { Parametri } from '@mediatore/bot';
import { conGioco, conScarto } from './parametri.ts';
import type { TavoloId } from './smazzata.ts';

/**
 * Cosa si prova e dentro quali limiti.
 *
 * Gli intervalli sono stretti apposta. Un intervallo enorme esplorato male
 * dice meno di uno stretto esplorato bene, e i valori assurdi si sa gia' che
 * perdono: nessuno mette dodici punti nel monte. Quello che resta da capire
 * e' dove sta il confine.
 *
 * Della chiamata qui non c'e' niente. Pesi e soglie vengono da 65 decisioni
 * di un giocatore vero, su tutti e quattro i tavoli: quello e' un dato, non
 * un numero da cercare, e il taratore non ha titolo per smentirlo.
 */

export type Valore = number | boolean;

export interface Coordinata {
  nome: string;
  /** Come si dice a voce, per il riepilogo finale. */
  titolo: string;
  /** I tavoli dove questo numero conta qualcosa: misurarlo altrove e' rumore. */
  tavoli: readonly TavoloId[];
  valori: readonly Valore[];
  leggi: (parametri: Parametri) => Valore;
  scrivi: (parametri: Parametri, valore: Valore) => Parametri;
  mostra: (valore: Valore) => string;
}

function numero(valore: Valore): number {
  if (typeof valore !== 'number') throw new Error(`atteso un numero, ricevuto ${String(valore)}`);
  return valore;
}

const secco = (valore: Valore): string => String(numero(valore));

export const GRIGLIA: readonly Coordinata[] = [
  {
    nome: 'scarto.trionfiPerPuntiNelMonte',
    titolo: 'trionfi da cui si accetta di mettere punti nel monte',
    // Nell'amico il monte non c'e': misurarlo li' non direbbe niente.
    tavoli: ['3', '4', '5'],
    valori: [3, 4, 5, 6],
    leggi: (parametri) => parametri.scarto.trionfiPerPuntiNelMonte,
    scrivi: (parametri, valore) =>
      conScarto(parametri, { trionfiPerPuntiNelMonte: numero(valore) }),
    mostra: secco,
  },
  {
    nome: 'scarto.puntiMassimiNelMonte',
    titolo: 'punti che al massimo si lasciano nel monte',
    tavoli: ['3', '4', '5'],
    valori: [0, 2, 4, 6, 8, 10],
    leggi: (parametri) => parametri.scarto.puntiMassimiNelMonte,
    scrivi: (parametri, valore) => conScarto(parametri, { puntiMassimiNelMonte: numero(valore) }),
    mostra: secco,
  },
  {
    nome: 'scarto.prezzoDelVuoto',
    titolo: 'punti che si pagano pur di restare senza un seme',
    tavoli: ['3', '4', '5'],
    valori: [0, 1, 2, 3, 5, 8, 10],
    leggi: (parametri) => parametri.scarto.prezzoDelVuoto,
    scrivi: (parametri, valore) => conScarto(parametri, { prezzoDelVuoto: numero(valore) }),
    mostra: secco,
  },
  {
    nome: 'gioco.rischioPerCaricare',
    titolo: 'quanto rischio si accetta per vincere con una carta a punti',
    tavoli: ['3', '4', '5', 'amico'],
    valori: [0, 0.05, 0.1, 0.2, 0.35, 0.6],
    leggi: (parametri) => parametri.gioco.rischioPerCaricare,
    scrivi: (parametri, valore) => conGioco(parametri, { rischioPerCaricare: numero(valore) }),
    mostra: (valore) => numero(valore).toFixed(2),
  },
];
