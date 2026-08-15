import type { VistaDelBot } from '@mediatore/bot';
import { alleatoDi, possoVincere } from '@mediatore/bot';
import type { Card } from '@mediatore/engine';
import { cardPoints, currentWinner, ledSuit } from '@mediatore/engine';
import type { Ruolo } from './tipi.ts';

export const RUOLI: readonly Ruolo[] = ['chiamante', 'difensore', 'amico', 'liscio'];

/**
 * Cosa c'era sul tavolo, detto come si direbbe a voce. Le azioni stanno
 * da un'altra parte: qui si raggruppa la situazione, non la scelta.
 */
export function situazioneDellaGiocata(vista: VistaDelBot): string {
  const seme = ledSuit(vista.presaInCorso);
  const vincitore = currentWinner(vista.presaInCorso);
  if (vincitore === null) return 'apro la presa';

  const diChi = alleatoDi(vista, vincitore) ? 'presa del compagno' : "presa dell'avversario";
  const privo = seme !== null && !vista.mano.some((carta) => carta.suit === seme);
  if (privo) return `privo del palo, ${diChi}`;

  const potevo = vista.legali.some((carta) => possoVincere(vista, carta));
  if (potevo) return `${diChi}, potevo vincerla`;
  return `${diChi}, non la prendo`;
}

export function azioneDellaGiocata(vista: VistaDelBot, carta: Card): string {
  const seme = ledSuit(vista.presaInCorso);
  const vincitore = currentWinner(vista.presaInCorso);
  const punti = cardPoints(carta.rank);
  const eTrionfo = carta.suit === vista.trump;
  const taglia = seme !== null && carta.suit !== seme && eTrionfo;

  if (vincitore === null) {
    if (eTrionfo) return 'esce di trionfo';
    if (carta.rank === 'asso' || carta.rank === 7) return 'esce di base';
    if (punti >= 2) return 'esce di figura';
    return 'esce';
  }

  if (possoVincere(vista, carta)) return 'prende';
  if (alleatoDi(vista, vincitore) && punti >= 2) return 'carica';
  if (taglia) return 'taglia';
  if (punti === 0) return 'scarta';
  return 'ci mette punti';
}

export function situazioneDellaChiamata(giocatori: number, variante: string): string {
  if (variante === 'amico') return 'chiamata a 5 amico';
  return `chiamata a ${giocatori}`;
}

export function azioneDellaChiamata(scelta: string): string {
  if (scelta === 'passo') return 'passo';
  if (scelta === 'normale') return 'chiama';
  if (scelta === 'chiSeLaSente') return 'chi se la sente';
  return scelta;
}

export function azioneDelloScarto(scartate: readonly Card[]): string {
  if (scartate.some((carta) => carta.rank === 'asso' || carta.rank === 7)) {
    return 'scarta una base';
  }
  if (scartate.some((carta) => cardPoints(carta.rank) >= 2)) return 'scarta figure';
  return 'scarta scartine';
}
