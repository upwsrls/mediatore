import type { Card, PlayerId, Suit } from '@mediatore/engine';
import { cardStrength, createDeck, ledSuit } from '@mediatore/engine';
import type { VistaDelBot } from './vista.ts';
import { alleatoDi } from './vista.ts';

const MAZZO = createDeck();

/*
 * Il conto delle carte si rifa uguale per ogni carta che il bot valuta: la
 * memoria di una vista si calcola una volta sola e si tiene da parte. La
 * vista nasce e muore dentro una decisione, quindi la cache muore con lei.
 */
const usciteDi = new WeakMap<VistaDelBot, Card[]>();
const nonVisteDi = new WeakMap<VistaDelBot, Card[]>();
const semiFinitiDi = new WeakMap<VistaDelBot, Set<string>>();

function tutteLeGiocate(vista: VistaDelBot): Card[] {
  const carte: Card[] = [];
  for (const presa of vista.preseCompletate) {
    for (const giocata of presa.cards) carte.push(giocata.card);
  }
  for (const giocata of vista.presaInCorso.plays) carte.push(giocata.card);
  return carte;
}

/** Le carte che sono passate per il tavolo, prese chiuse e presa in corso. */
export function carteUscite(vista: VistaDelBot): Card[] {
  const memoria = usciteDi.get(vista);
  if (memoria !== undefined) return [...memoria];
  const carte = tutteLeGiocate(vista);
  usciteDi.set(vista, carte);
  return [...carte];
}

/**
 * Quelle che possono ancora fare male: stanno nelle mani degli altri o sotto
 * il monte coperto. Le mie non ci sono, e nemmeno il monte che mi e' concesso
 * di guardare: quelle non mi sorprendono piu'.
 */
export function carteNonAncoraViste(vista: VistaDelBot): Card[] {
  const memoria = nonVisteDi.get(vista);
  if (memoria !== undefined) return [...memoria];

  const viste = new Set<string>();
  for (const carta of tutteLeGiocate(vista)) viste.add(carta.id);
  for (const carta of vista.mano) viste.add(carta.id);
  for (const carta of vista.monteVisibile) viste.add(carta.id);

  const carte = MAZZO.filter((carta) => !viste.has(carta.id));
  nonVisteDi.set(vista, carte);
  return [...carte];
}

/** I trionfi ancora in giro, i miei esclusi: sono quelli da temere. */
export function trionfiRimasti(vista: VistaDelBot): Card[] {
  return carteNonAncoraViste(vista).filter((carta) => carta.suit === vista.trump);
}

/**
 * La carta piu' forte di quel seme che puo' ancora comparire. Se torna null
 * vuol dire che in quel seme comando io: e' cosi' che si sa se una carta e'
 * padrona.
 */
export function cartaPiuAltaRimasta(vista: VistaDelBot, seme: Suit): Card | null {
  let migliore: Card | null = null;
  for (const carta of carteNonAncoraViste(vista)) {
    if (carta.suit !== seme) continue;
    if (migliore === null || cardStrength(carta.rank) > cardStrength(migliore.rank)) {
      migliore = carta;
    }
  }
  return migliore;
}

/**
 * Quanti trionfi possono ancora uscire dalle mani degli avversari.
 *
 * Dieci trionfi in tutto, meno quelli che ho in mano, meno quelli gia'
 * passati per il tavolo, meno quelli che so per certo dove stanno perche' li
 * vedo nel monte. Di quelli che restano, tenerne puo' solo chi e' ancora in
 * condizione di averne: chi una volta non ha risposto a trionfo ne e' privo
 * per il resto della smazzata, e piu' carte di quante ne ha in mano nessuno
 * ne nasconde.
 *
 * E' il conto che il giocatore vero tiene a mente per sapere quando smettere
 * di arrassarsi: appena questo numero e' zero, tirare ancora trionfo vuol
 * dire regalare prese vuote e lasciare che gli altri, dovendo scartare,
 * buttino il ciarpame e si tengano i punti.
 */
export function trionfiAvversariRimasti(vista: VistaDelBot): number {
  const inGiro = trionfiRimasti(vista).length;
  if (inGiro === 0) return 0;

  let capienza = 0;
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (alleatoDi(vista, seat)) continue;
    if (eSemeFinito(vista, seat, vista.trump)) continue;
    capienza += vista.carteInMano[seat] ?? 0;
  }
  return Math.min(inGiro, capienza);
}

/**
 * Firma: una carta che la presa la vince di sicuro.
 *
 * Un trionfo e' firma quando e' il piu' alto rimasto in gioco, perche' sopra
 * non c'e' piu' niente. Una carta laterale invece non basta che comandi il
 * suo palo: finche' in giro resta un trionfo, chi di quel palo e' privo la
 * uccide, e la maniglia di coppe finisce sotto un 2 di trionfo.
 *
 * E' proprio l'arrassata a fare le firme laterali: tolti i trionfi agli
 * altri, la piu' alta di un palo non la puo' piu' ammazzare nessuno.
 */
export function eFirma(vista: VistaDelBot, carta: Card): boolean {
  const sopra = cartaPiuAltaRimasta(vista, carta.suit);
  if (sopra !== null && cardStrength(sopra.rank) > cardStrength(carta.rank)) return false;
  if (carta.suit === vista.trump) return true;
  return trionfiAvversariRimasti(vista) === 0;
}

/**
 * Chi non risponde a seme quel seme non ce l'ha piu': e' la cosa che un
 * giocatore vero si segna a mente e non dimentica per il resto della smazzata.
 */
function semiFiniti(vista: VistaDelBot): Set<string> {
  const memoria = semiFinitiDi.get(vista);
  if (memoria !== undefined) return memoria;

  const finiti = new Set<string>();
  const presa = (plays: readonly { player: PlayerId; card: Card }[]): void => {
    const prima = plays[0];
    if (prima === undefined) return;
    const seme = prima.card.suit;
    for (const giocata of plays.slice(1)) {
      if (giocata.card.suit !== seme) finiti.add(`${giocata.player}|${seme}`);
    }
  };

  for (const chiusa of vista.preseCompletate) presa(chiusa.cards);
  presa(vista.presaInCorso.plays);

  semiFinitiDi.set(vista, finiti);
  return finiti;
}

export function eSemeFinito(vista: VistaDelBot, giocatore: PlayerId, seme: Suit): boolean {
  return semiFiniti(vista).has(`${giocatore}|${seme}`);
}

/** Il seme di apertura della presa in corso, null se la presa e' ancora vuota. */
export function semeDiMano(vista: VistaDelBot): Suit | null {
  return ledSuit(vista.presaInCorso);
}
