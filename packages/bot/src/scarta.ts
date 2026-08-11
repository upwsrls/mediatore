import type { Card, Suit } from '@mediatore/engine';
import { RANKS, SUITS, cardPoints, cardStrength } from '@mediatore/engine';
import type { Parametri } from './parametri.ts';
import { PARAMETRI_DI_SERIE } from './parametri.ts';
import { contaTrionfi } from './valutaMano.ts';

/**
 * Cosa rimettere nel monte dopo averlo preso.
 *
 * Prima si guarda la forma della mano, perche' i pali laterali non sono tutti
 * uguali e non si scartano allo stesso modo. Ordinati per lunghezza:
 *
 * - il palo PIU' LUNGO non si accorcia. Quello e' una fonte di prese, non un
 *   peso: dopo due o tre giri gli altri ne sono privi e tutto quello che
 *   resta in mano prende da solo, fante e 6 compresi.
 * - dai pali di MEZZA LUNGHEZZA si tolgono le scartine, lasciando le carte
 *   di comando — maniglia e asso — il piu' possibile secche: cosi' quel palo
 *   si esaurisce in fretta, si diventa privi e si puo' uccidere. Restare
 *   lunghi dove si ha il comando espone il comando al taglio, perche' ogni
 *   giro in piu' e' un'occasione perche' un avversario resti privo e uccida.
 * - un palo corto si svuota del tutto, che da li' in poi si taglia: e' la
 *   cosa vista fare in tutte le mani chiamate, e vale per ogni palo tranne
 *   quello lungo.
 *
 * Poi si riempie con le carte meno utili. I punti nel monte si accettano solo
 * con tanti trionfi in mano, perche' allora si conta di vincere l'ultima presa
 * e di riprenderselo intero: chi ha pochi trionfi quei punti non li rivede
 * piu'.
 *
 * Due regole non si violano mai: non si scartano trionfi, e non si scarta una
 * carta padrona di un seme che si tiene.
 */

/**
 * Fin qui un seme e' corto: le carte alte non si difendono, se le porta via
 * chi taglia o chi ha di piu'. Sono quelle che conviene mettere da parte.
 */
const SEME_CORTO = 3;

/** Di ogni palo ce ne sono dieci: quelle che non ho stanno in giro. */
const CARTE_PER_PALO = 10;

/**
 * Da qui in su un palo laterale si guarda come una fonte, non come un peso.
 * Sotto le quattro carte non c'e' niente da difendere: quello che avanza dopo
 * i giri e' zero o quasi, e il conto dei giri, che da' per fornito ogni
 * avversario, a quel punto e' troppo generoso per fidarsene.
 */
const PALO_LUNGO = 4;

/** Quanto rende un palo: i giri per esaurirlo, e le prese che avanzano dopo. */
export interface FonteDiPrese {
  /** I giri che servono perche' di quel palo non ne resti a nessun altro. */
  giri: number;
  /** Le carte che restano in mano dopo quei giri: prese, una per carta. */
  firme: number;
}

/**
 * La stima che si fa al tavolo prima di scartare. Di ogni palo ce ne sono
 * dieci: quelle che non ho stanno negli altri, e ogni giro che tiro ne toglie
 * una a ciascuno di loro. Con sette bastoni su dieci e tre giocatori gli altri
 * ne hanno tre in due: due giri e sono a secco, e le cinque carte che mi
 * restano sono firme, anche il fante e il 6. Accorciare quel palo a quattro
 * lascia una firma sola: la fonte e' distrutta.
 */
export function fonteDiPrese(quante: number, players: number): FonteDiPrese {
  const inGiro = Math.max(0, CARTE_PER_PALO - quante);
  const altri = Math.max(1, players - 1);
  const giri = Math.min(quante, Math.ceil(inGiro / altri));
  return { giri, firme: Math.max(0, quante - giri) };
}

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
 * Il palo lungo, quello da non accorciare: il piu' lungo dei laterali, purche'
 * sia abbastanza lungo da rendere qualcosa dopo i giri che servono a ripulire
 * gli altri. Con tre carte su dieci non resta niente in mano e non c'e' nessuna
 * fonte da difendere; da quattro in su si', e piu' e' lungo piu' e' intoccabile.
 *
 * A pari lunghezza si tiene quello che vale di piu': stesse firme, piu' punti.
 */
function paloDaNonAccorciare(
  carte: readonly Card[],
  trump: Suit,
  players: number,
): Suit | null {
  const delSeme = (seme: Suit): Card[] => carte.filter((carta) => carta.suit === seme);
  let fonte: Suit | null = null;
  for (const seme of SUITS) {
    if (seme === trump) continue;
    const mie = delSeme(seme);
    if (mie.length < PALO_LUNGO || fonteDiPrese(mie.length, players).firme === 0) continue;
    if (fonte === null) {
      fonte = seme;
      continue;
    }
    const attuale = delSeme(fonte);
    const meglio =
      mie.length > attuale.length ||
      (mie.length === attuale.length && punti(mie) > punti(attuale));
    if (meglio) fonte = seme;
  }
  return fonte;
}

/**
 * I semi che si possono svuotare, dal piu' corto: quello e' l'ordine in cui
 * conviene provarci, perche' costa meno slot. Il palo lungo non e' della lista:
 * il vuoto per uccidere si fa con un palo che non porta prese, non con la
 * propria fonte.
 */
function semiDaSvuotare(carte: readonly Card[], trump: Suit, fonte: Suit | null): Suit[] {
  const delSeme = (seme: Suit): Card[] => carte.filter((carta) => carta.suit === seme);
  const semi = [...new Set(carte.map((carta) => carta.suit))].filter(
    (seme) => seme !== trump && seme !== fonte,
  );
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

  const fonte = paloDaNonAccorciare(fuoriTrionfo, trump, players);

  const scarti: Card[] = [];
  const scelta = (carta: Card): boolean => scarti.some((c) => c.id === carta.id);
  const restanti = (): Card[] => fuoriTrionfo.filter((carta) => !scelta(carta));
  const quanteRestano = (seme: Suit): number =>
    manoAllargata.filter((carta) => carta.suit === seme && !scelta(carta)).length;

  // 1. Svuotare un seme, il piu' corto per primo: da li' in poi si taglia.
  for (const seme of semiDaSvuotare(fuoriTrionfo, trump, fonte)) {
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
    const disponibili = liberi.length > 0 ? liberi : pool;

    // Il palo lungo si tocca per ultimo: finche' fuori da lui c'e' qualcosa che
    // sta nel budget si prende quella, e il palo lungo resta intero. Quando
    // fuori restano solo punti che il budget non copre, allora si': una carta
    // in meno nel palo lungo costa una firma, ma quei punti lasciati nel monte
    // non li rivede piu' nessuno.
    const dagliAltriPali =
      fonte === null
        ? []
        : disponibili.filter(
            (carta) => carta.suit !== fonte && cardPoints(carta.rank) <= budget,
          );
    const candidati = dagliAltriPali.length > 0 ? dagliAltriPali : disponibili;

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
