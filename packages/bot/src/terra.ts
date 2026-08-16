import type { Card, HandState } from '@mediatore/engine';
import {
  beats,
  currentWinner,
  isAllyFor,
  ledSuit,
  legalPlays,
  legalPlaysFor,
  playCard,
} from '@mediatore/engine';
import { eFirma, trionfiRimasti } from './memoria.ts';
import { possoVincere } from './valuta.ts';
import type { VistaDelBot } from './vista.ts';

/**
 * Tutte le basi che restano sono sue, qualunque cosa facciano gli altri.
 *
 * Non basta che le carte siano alte: deve vincerle tutte, anche se gli
 * altri giocano nel modo peggiore per lui. Per questo si riusa eFirma e
 * si stringe sulle laterali: un trionfo in mano a chiunque altro — alleato
 * compreso — puo' ancora tagliare, e allora non si mette a terra.
 *
 * Nel dubbio resta spento: meglio una base giocata a mano che punti
 * presi senza averli fatti.
 */
export function puoMettereATerra(vista: VistaDelBot): boolean {
  if (vista.mano.length === 0) return false;
  if (!vista.mano.every((carta) => eFirmaPerTerra(vista, carta))) return false;
  if (vista.presaInCorso.plays.length === 0) return true;

  // Gia' ha giocato in questa base: puo' chiudere solo se la sta vincendo.
  if (vista.presaInCorso.plays.some((giocata) => giocata.player === vista.io)) {
    return currentWinner(vista.presaInCorso) === vista.io;
  }

  // Fuori turno le mosse legali dell'engine sono vuote: si ricalcolano
  // come se toccasse a lui, perche' le firme si mettono a terra quando
  // si vuole, non quando arriva il giro.
  const giocabili =
    vista.legali.length > 0
      ? vista.legali
      : legalPlays([...vista.mano], vista.presaInCorso, vista.io, isAllyFor(vista.alliance));
  return giocabili.some((carta) => possoVincere(vista, carta));
}

/**
 * Firma che tiene anche contro gli alleati. eFirma ignora i loro trionfi,
 * perche' le prese della coppia restano di parte: qui le basi devono
 * essere sue, una per una, e un taglio del compagno gliele porta via.
 */
function eFirmaPerTerra(vista: VistaDelBot, carta: Card): boolean {
  if (!eFirma(vista, carta)) return false;
  if (carta.suit === vista.trump) return true;
  // eFirma guarda solo i trionfi avversari: qui conta anche un taglio
  // del compagno, o un trionfo ancora ignoto sotto il monte.
  return trionfiRimasti(vista).length === 0;
}

/**
 * Chiude la smazzata giocando le carte rimaste: lui vince ogni base, gli
 * altri scartano quello che devono. L'engine assegna punti e monte come
 * su ogni ultima presa, senza scorciatoie.
 */
export function completaMettendoATerra(state: HandState, player: number): HandState {
  let corrente = state;
  while (!corrente.finished) {
    const diTurno = corrente.turn;
    const legali = legalPlaysFor(corrente, diTurno);
    const scelta = diTurno === player ? cartaPerTerra(corrente, legali) : (legali[0] as Card);
    corrente = playCard(corrente, diTurno, scelta.id);
  }
  return corrente;
}

function cartaPerTerra(state: HandState, legali: readonly Card[]): Card {
  const prima = legali[0];
  if (prima === undefined) {
    throw new Error('metti a terra: nessuna carta da giocare');
  }
  const trick = state.currentTrick;
  if (trick.plays.length === 0) return prima;
  const vincitore = currentWinner(trick);
  const migliore = trick.plays.find((giocata) => giocata.player === vincitore)?.card;
  const seme = ledSuit(trick);
  if (migliore === undefined || seme === null) return prima;
  return (
    legali.find((carta) => beats(carta, migliore, state.trump, seme)) ?? prima
  );
}
