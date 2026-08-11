import type { Card, PlayerId, Trick } from '@mediatore/engine';
import { beats, cardPoints, currentWinner, nextSeat, trickPoints } from '@mediatore/engine';
import { carteNonAncoraViste, eSemeFinito, semeDiMano } from './memoria.ts';
import type { VistaDelBot } from './vista.ts';
import { preseRimaste } from './vista.ts';

/** Quanto vale la presa cosi' com'e' adesso, punto della base compreso. */
export function puntiInTavola(trick: Trick): number {
  return trickPoints(trick);
}

/** La carta che sta vincendo, null se nessuno ha ancora giocato. */
export function cartaVincente(vista: VistaDelBot): Card | null {
  const vincitore = currentWinner(vista.presaInCorso);
  if (vincitore === null) return null;
  return vista.presaInCorso.plays.find((giocata) => giocata.player === vincitore)?.card ?? null;
}

/**
 * Se giocassi questa carta, adesso comanderei io. Attenzione: dice solo com'e'
 * il tavolo in questo momento, chi deve ancora giocare puo' passarmi sopra.
 */
export function possoVincere(vista: VistaDelBot, carta: Card): boolean {
  const seme = semeDiMano(vista);
  const migliore = cartaVincente(vista);
  if (seme === null || migliore === null) return true;
  return beats(carta, migliore, vista.trump, seme);
}

/** Chi deve ancora giocare dopo di me in questa presa. */
export function giocatoriDopoDiMe(vista: VistaDelBot): PlayerId[] {
  const mancanti = vista.config.players - vista.presaInCorso.plays.length - 1;
  const seats: PlayerId[] = [];
  let seat = vista.io;
  for (let i = 0; i < mancanti; i += 1) {
    seat = nextSeat(seat, vista.config.players);
    seats.push(seat);
  }
  return seats;
}

/**
 * La probabilita' che un giocatore, pescando alla cieca fra le carte ignote,
 * ne abbia almeno una di quelle che mi superano. Non e' un calcolo esatto —
 * le carte ignote sono divise fra piu' mani — ma e' il conto che si fa a
 * mente al tavolo: piu' carte mi possono superare, piu' e' probabile che
 * qualcuno ce l'abbia.
 */
function probabilitaCheNeAbbia(superiori: number, ignote: number, inMano: number): number {
  if (superiori <= 0 || inMano <= 0 || ignote <= 0) return 0;
  const quante = Math.min(inMano, ignote);
  let scampo = 1;
  for (let i = 0; i < quante; i += 1) {
    const restanti = ignote - i;
    const innocue = ignote - superiori - i;
    if (innocue <= 0) return 1;
    scampo *= innocue / restanti;
  }
  return 1 - scampo;
}

/**
 * Da 0 a 1: quanto e' probabile che uno di quelli che giocano dopo di me passi
 * sopra questa carta. Chi ha gia' mostrato di non avere un seme non lo puo'
 * tirare fuori adesso, e questo il bot se lo ricorda.
 */
export function rischioDiPerdere(vista: VistaDelBot, carta: Card): number {
  const dopo = giocatoriDopoDiMe(vista);
  if (dopo.length === 0) return 0;

  const seme = semeDiMano(vista) ?? carta.suit;
  const ignote = carteNonAncoraViste(vista);
  if (ignote.length === 0) return 0;

  const superiori = ignote.filter((altra) => beats(altra, carta, vista.trump, seme));
  if (superiori.length === 0) return 0;

  let scampo = 1;
  for (const altro of dopo) {
    const suePossibili = superiori.filter((altra) => !eSemeFinito(vista, altro, altra.suit));
    const inMano = vista.carteInMano[altro] ?? 0;
    scampo *= 1 - probabilitaCheNeAbbia(suePossibili.length, ignote.length, inMano);
  }
  return Math.min(1, Math.max(0, 1 - scampo));
}

/**
 * Quanto c'e' davvero in palio: nell'ultima presa ci si porta via anche il
 * monte, e quello cambia il conto. Se il monte e' coperto se ne stima il
 * valore come farebbe chiunque, sulla media delle carte non ancora viste.
 */
export function postaDellaPresa(vista: VistaDelBot): number {
  const inTavola = puntiInTavola(vista.presaInCorso);
  if (preseRimaste(vista) !== 1 || vista.monteCoperto === 0) return inTavola;

  if (vista.monteVisibile.length > 0) {
    const punti = vista.monteVisibile.reduce((somma, carta) => somma + cardPoints(carta.rank), 0);
    return inTavola + punti + 1;
  }

  const ignote = carteNonAncoraViste(vista);
  const media =
    ignote.length === 0
      ? 0
      : ignote.reduce((somma, carta) => somma + cardPoints(carta.rank), 0) / ignote.length;
  return inTavola + media * vista.monteCoperto + 1;
}
