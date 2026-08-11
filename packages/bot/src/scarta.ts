import type { Card, Suit } from '@mediatore/engine';
import { RANKS, cardPoints, cardStrength } from '@mediatore/engine';
import type { Parametri } from './parametri.ts';
import { PARAMETRI_DI_SERIE } from './parametri.ts';
import { contaTrionfi } from './valutaMano.ts';

/**
 * Cosa rimettere nel monte dopo averlo preso.
 *
 * Due cose sole, viste fare in tutte le mani chiamate: prima si svuota un
 * seme, perche' da li' in poi quel seme si taglia; poi si riempie con le
 * carte meno utili. I punti nel monte si accettano solo con tanti trionfi in
 * mano, perche' allora si conta di vincere l'ultima presa e di riprenderselo
 * intero: chi ha pochi trionfi quei punti non li rivede piu'.
 *
 * Due regole non si violano mai: non si scartano trionfi, e non si scarta una
 * carta padrona di un seme che si tiene.
 */

/**
 * Fin qui un seme e' corto: le carte alte non si difendono, se le porta via
 * chi taglia o chi ha di piu'. Sono quelle che conviene mettere da parte.
 */
const SEME_CORTO = 3;

/**
 * Quanti punti si accetta di lasciare nel monte, secondo i trionfi in mano.
 * Osservato: con 6 trionfi ne ha messi 8, asso e cavallo di un seme corto;
 * con 5 ne ha messi 3, e solo per restare senza un seme; con pochi trionfi
 * non si e' mai trovato a doverlo fare, e infatti non ha senso.
 */
const PUNTI_NEL_MONTE: readonly number[] = [0, 0, 0, 0, 3, 4, 8, 10];

/** A quanti trionfi si apre la tabella qui sopra, com'e' scritta. */
const TRIONFI_DI_SERIE = 4;

/**
 * Con piu' avversari il monte e' piu' difficile da riprendere, quindi la
 * stessa generosita' costa di piu': si chiede un trionfo in piu' per la
 * stessa tolleranza. DA TARARE: a tre e' osservato, a quattro e cinque no.
 *
 * I parametri spostano la tabella invece di riscriverla: alzando la soglia
 * la stessa scala di tolleranza parte da piu' trionfi, e il tetto la taglia.
 */
export function puntiTollerati(
  trionfi: number,
  players: number,
  parametri: Parametri = PARAMETRI_DI_SERIE,
): number {
  const spostamento = parametri.scarto.trionfiPerPuntiNelMonte - TRIONFI_DI_SERIE;
  const scala = (players >= 4 ? trionfi - 1 : trionfi) - spostamento;
  const indice = Math.max(0, Math.min(scala, PUNTI_NEL_MONTE.length - 1));
  return Math.min(PUNTI_NEL_MONTE[indice] ?? 0, parametri.scarto.puntiMassimiNelMonte);
}

const punti = (carte: readonly Card[]): number =>
  carte.reduce((somma, carta) => somma + cardPoints(carta.rank), 0);

/**
 * Padrona: in quel seme non e' rimasto in giro niente che la superi, perche'
 * tutto quello che la supera ce l'ho io. Qui si guarda solo la propria mano,
 * che e' tutto quello che si sa prima di giocare.
 */
export function ePadronaInMano(carta: Card, mano: readonly Card[]): boolean {
  return RANKS.filter((rank) => cardStrength(rank) > cardStrength(carta.rank)).every((rank) =>
    mano.some((mia) => mia.suit === carta.suit && mia.rank === rank),
  );
}

/** Quanto dispiace lasciarla andare quando non c'e' un motivo migliore. */
function inutilita(carta: Card): number {
  return -(cardPoints(carta.rank) * 10 + cardStrength(carta.rank));
}

/**
 * I semi che si possono svuotare, dal piu' corto: quello e' l'ordine in cui
 * conviene provarci, perche' costa meno slot.
 */
function semiDaSvuotare(carte: readonly Card[], trump: Suit): Suit[] {
  const delSeme = (seme: Suit): Card[] => carte.filter((carta) => carta.suit === seme);
  const semi = [...new Set(carte.map((carta) => carta.suit))].filter((seme) => seme !== trump);
  return semi.sort(
    (a, b) =>
      delSeme(a).length - delSeme(b).length || punti(delSeme(a)) - punti(delSeme(b)),
  );
}

export function scegliScarti(
  manoAllargata: readonly Card[],
  trump: Suit,
  quanti: number,
  players: number,
  parametri: Parametri = PARAMETRI_DI_SERIE,
): Card[] {
  if (quanti <= 0) return [];

  const trionfi = contaTrionfi(manoAllargata, trump);
  let budget = puntiTollerati(trionfi, players, parametri);

  const fuoriTrionfo = manoAllargata.filter((carta) => carta.suit !== trump);
  // Mano di soli trionfi: qualcosa va lasciato comunque, e allora vanno i
  // trionfi piu' deboli. Non capita quasi mai, ma capita.
  if (fuoriTrionfo.length <= quanti) {
    const mancanti = [...manoAllargata]
      .filter((carta) => carta.suit === trump)
      .sort((a, b) => cardStrength(a.rank) - cardStrength(b.rank));
    return [...fuoriTrionfo, ...mancanti].slice(0, quanti);
  }

  const scarti: Card[] = [];
  const scelta = (carta: Card): boolean => scarti.some((c) => c.id === carta.id);
  const restanti = (): Card[] => fuoriTrionfo.filter((carta) => !scelta(carta));
  const quanteRestano = (seme: Suit): number =>
    manoAllargata.filter((carta) => carta.suit === seme && !scelta(carta)).length;

  // 1. Svuotare un seme, il piu' corto per primo: da li' in poi si taglia.
  for (const seme of semiDaSvuotare(fuoriTrionfo, trump)) {
    const carte = restanti().filter((carta) => carta.suit === seme);
    if (carte.length === 0 || carte.length > quanti - scarti.length) continue;
    // Una padrona non si butta nemmeno per un seme vuoto: quella la presa la
    // vince da sola.
    if (carte.some((carta) => ePadronaInMano(carta, manoAllargata))) continue;
    const costo = punti(carte);
    if (costo > Math.min(budget, parametri.scarto.prezzoDelVuoto)) continue;
    budget -= costo;
    scarti.push(...carte);
  }

  // 2. Riempire con le meno utili, scaricando prima i punti dei semi corti.
  while (scarti.length < quanti) {
    const pool = restanti();
    const liberi = pool.filter((carta) => !ePadronaInMano(carta, manoAllargata));
    const candidati = liberi.length > 0 ? liberi : pool;

    const daScaricare = candidati.filter(
      (carta) =>
        cardPoints(carta.rank) > 0 &&
        cardPoints(carta.rank) <= budget &&
        quanteRestano(carta.suit) <= SEME_CORTO,
    );

    const scelto =
      daScaricare.length > 0
        ? // Nel seme corto se ne va prima la carta piu' cara: e' quella che
          // rischia di piu' di finire sotto un taglio.
          daScaricare.reduce((a, b) => (cardPoints(b.rank) > cardPoints(a.rank) ? b : a))
        : candidati.reduce((a, b) => (inutilita(b) > inutilita(a) ? b : a));

    budget -= cardPoints(scelto.rank);
    scarti.push(scelto);
  }

  return scarti;
}
