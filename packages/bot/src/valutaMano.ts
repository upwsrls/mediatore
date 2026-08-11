import type { Card, Rank, Suit, TableConfig } from '@mediatore/engine';
import { SUITS, cardPoints, cardStrength } from '@mediatore/engine';
import type { Parametri } from './parametri.ts';
import { PARAMETRI_DI_SERIE } from './parametri.ts';
import { tavoloDi } from './tavolo.ts';

/**
 * Se chiamare o passare, guardando la mano appena distribuita.
 *
 * Contare i trionfi non basta: con quattro trionfi e il solo asso lo stesso
 * giocatore ha chiamato una volta e passato un'altra, quindi il numero da
 * solo non e' quello che decide. Quello che separa le mani chiamate dalle
 * mani passate e' due cose messe insieme.
 *
 * La prima e' quante prese sono gia' sue prima di giocare: non "quanti
 * trionfi ho" ma "quante basi porto a casa comunque vada". La seconda e' la
 * forza dei trionfi, cioe' se sono alti o se sono numeri.
 *
 * I punti in mano non c'entrano quasi niente: fra chiamate e passi la
 * differenza media e' di due decimi di punto. Una mano ricca di assi e re in
 * pali che non comanda si passa, e infatti l'ha passata.
 */

/** Quel che serve sapere per decidere: la mano, il trionfo e cosa c'e' scoperto. */
export interface VistaDiChiamata {
  mano: readonly Card[];
  trump: Suit;
  /**
   * La carta che ha girato il trionfo, scoperta sopra il monte. Chi non la
   * conosce la lascia fuori: si decide senza, come si faceva prima.
   */
  scoperta?: Card | null;
}

/** Il 7 comanda, poi l'asso, poi il re: oltre il terzo gradino nessuno tiene. */
const CATENA: readonly Rank[] = [7, 'asso', 're'];

/**
 * Quanto vale ogni gradino della catena, secondo il palo.
 *
 * Nel trionfo il 7 e' una presa e basta, nessuno puo' ucciderlo, e l'asso
 * dietro al 7 e' una seconda presa piena. In un palo laterale invece anche
 * il 7 puo' finire sotto un taglio di chi e' privo di quel palo: nove volte
 * su dieci la presa e' sua, non dieci.
 */
const VALORE_NEL_TRIONFO: readonly number[] = [1, 1, 0.9];
const VALORE_NEL_PALO: readonly number[] = [0.9, 0.9, 0.8];

/**
 * L'asso di trionfo senza il 7 e' quasi una base: a portarglielo via c'e'
 * una carta sola, e deve capitare che i trionfi rimasti stiano tutti da una
 * parte. L'asso di un palo laterale senza il proprio 7 invece non e' niente:
 * il 7 lo batte e in giro c'e' di sicuro.
 */
const ASSO_SCOPERTO = 0.95;

/**
 * Con quanti trionfi una base laterale si difende davvero. Il 7 di un palo
 * cade sotto il taglio di chi e' privo di quel palo: per riprendersi la mano
 * dopo, e per togliere di mezzo i tagli, i trionfi servono.
 */
const TRIONFI_PER_DIFENDERE = 4;

/** Al minimo le basi laterali valgono la meta': sotto non si scende. */
const RIDUZIONE_MASSIMA = 0.5;

/**
 * Quanto resta di una base laterale, secondo i trionfi che ha in mano.
 *
 * Con un trionfo solo vale la meta', da quattro in su vale tutta. E' la
 * correzione al conto che leggeva 5,3 basi in una mano con tre 7 laterali e
 * un trionfo: quella mano il giocatore vero l'ha passata, perche' quei 7 se
 * li taglia il primo che e' privo del palo e poi la mano non torna piu'.
 */
function scudoDeiTrionfi(trionfi: number): number {
  const scoperto = Math.max(0, TRIONFI_PER_DIFENDERE - trionfi) / (TRIONFI_PER_DIFENDERE - 1);
  return 1 - RIDUZIONE_MASSIMA * Math.min(1, scoperto);
}

const ha = (carte: readonly Card[], suit: Suit, rank: Rank): boolean =>
  carte.some((carta) => carta.suit === suit && carta.rank === rank);

/** Le basi che quel palo porta in dote, seguendo la catena dall'alto. */
function basiDelPalo(carte: readonly Card[], suit: Suit, eIlTrionfo: boolean): number {
  const valori = eIlTrionfo ? VALORE_NEL_TRIONFO : VALORE_NEL_PALO;
  if (!ha(carte, suit, 7)) {
    return eIlTrionfo && ha(carte, suit, 'asso') ? ASSO_SCOPERTO : 0;
  }

  let basi = 0;
  for (const [gradino, rank] of CATENA.entries()) {
    if (!ha(carte, suit, rank)) break;
    basi += valori[gradino] ?? 0;
  }
  return basi;
}

/**
 * Le prese gia' vinte prima di cominciare. E' il conto che fa il giocatore
 * vero quando guarda la mano: non quanti trionfi ha, ma quante basi sono
 * gia' sue. La scoperta, se c'e', entra nel conto come se fosse in mano,
 * perche' chi chiama il monte se lo prende.
 *
 * Nel trionfo le basi valgono per intero: quelle non le uccide nessuno. Nei
 * pali laterali valgono meno quanto meno trionfi ci sono a difenderle.
 */
export function basiSicure(
  mano: readonly Card[],
  trump: Suit,
  scoperta: Card | null = null,
): number {
  const carte = scoperta === null ? mano : [...mano, scoperta];
  const scudo = scudoDeiTrionfi(contaTrionfi(carte, trump));

  return SUITS.reduce((somma, suit) => {
    const basi = basiDelPalo(carte, suit, suit === trump);
    return somma + (suit === trump ? basi : basi * scudo);
  }, 0);
}

/**
 * Quanto vale la carta scoperta IN QUESTA mano, che non e' quanto vale in
 * se'. Un 7 di trionfo scoperto e' una base in piu'; un asso scoperto vale
 * come una base intera se in mano c'e' gia' il 7 di quel palo, e niente se
 * non c'e'; un 3 di coppe non aggiunge nulla e la mano deve reggersi da sola.
 *
 * Le altre carte del monte sono coperte e non si ragionano: quello e' rischio
 * che si accetta, non informazione che si usa.
 */
export function valoreDellaScoperta(
  mano: readonly Card[],
  trump: Suit,
  scoperta: Card | null,
): number {
  if (scoperta === null) return 0;
  return basiSicure(mano, trump, scoperta) - basiSicure(mano, trump);
}

export function contaTrionfi(mano: readonly Card[], trump: Suit): number {
  return mano.filter((carta) => carta.suit === trump).length;
}

/**
 * Quanto pesano i trionfi che si hanno: 10 il 7, 9 l'asso, 8 il re, giu'
 * fino a 1 per il 2. Quattro trionfi bassi non sono quattro trionfi alti, e
 * i dati lo dicono forte: fra mani chiamate e mani passate la forza cambia
 * di sei punti e mezzo a tre giocatori, di nove a cinque.
 */
export function forzaDeiTrionfi(mano: readonly Card[], trump: Suit): number {
  return mano
    .filter((carta) => carta.suit === trump)
    .reduce((somma, carta) => somma + cardStrength(carta.rank) + 1, 0);
}

/** Da un palo corto o vuoto si comincia a tagliare presto. */
function paliDi(mano: readonly Card[], trump: Suit): { vuoti: number; corti: number } {
  const laterali = SUITS.filter((suit) => suit !== trump);
  const quante = (suit: Suit): number => mano.filter((carta) => carta.suit === suit).length;
  return {
    vuoti: laterali.filter((suit) => quante(suit) === 0).length,
    corti: laterali.filter((suit) => quante(suit) === 1).length,
  };
}

/**
 * Il voto della mano. Le basi sicure comandano, la forza dei trionfi dice se
 * quelle basi si riescono a difendere, la lunghezza e i pali corti dicono da
 * dove si comincia a tagliare. I punti in mano entrano per pochissimo,
 * perche' e' pochissimo quello che spiegano.
 *
 * Solo le basi guardano la scoperta: il resto e' la mano com'e' adesso,
 * perche' chi prende il monte poi ne rimette dentro altrettante e la forma
 * della mano cambia comunque.
 */
export function valutaChiamata(
  mano: readonly Card[],
  trump: Suit,
  scoperta: Card | null,
  config: TableConfig,
  parametri: Parametri = PARAMETRI_DI_SERIE,
): number {
  const pesi = parametri.chiamata.pesi;
  // Senza monte non c'e' niente da prendere: la carta che gira il trionfo
  // resta in mano al mazziere, e chi chiama gioca solo con quello che ha.
  const dalMonte = config.monteSize > 0 ? scoperta : null;
  const pali = paliDi(mano, trump);
  const punti = mano.reduce((somma, carta) => somma + cardPoints(carta.rank), 0);

  return (
    pesi.basiSicure * (basiSicure(mano, trump) + valoreDellaScoperta(mano, trump, dalMonte)) +
    pesi.forzaDeiTrionfi * forzaDeiTrionfi(mano, trump) +
    pesi.lunghezzaDelTrionfo * contaTrionfi(mano, trump) +
    pesi.paliVuoti * pali.vuoti +
    pesi.paliCorti * pali.corti +
    pesi.puntiInMano * punti
  );
}

/**
 * La decisione. Il bot chiama solo normale: sola, colonna e chi se la sente
 * non le dichiara mai, perche' nessuno gli ha ancora insegnato quando valgono.
 */
export function decidiChiamata(
  vista: VistaDiChiamata,
  config: TableConfig,
  parametri: Parametri = PARAMETRI_DI_SERIE,
): 'chiama' | 'passo' {
  const voto = valutaChiamata(vista.mano, vista.trump, vista.scoperta ?? null, config, parametri);
  return voto >= parametri.chiamata.soglie[tavoloDi(config)] ? 'chiama' : 'passo';
}
