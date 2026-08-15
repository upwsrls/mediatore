import type { VistaDelBot } from '@mediatore/bot';
import { alleatoDi, scegliCarta, sonoIlChiamante, vistaDaStato } from '@mediatore/bot';
import type { Card, HandState, Rng } from '@mediatore/engine';
import { playCard, scoreHand, settle } from '@mediatore/engine';
import type { Mondo } from './mondi.ts';

/**
 * Ricostruisce lo stato intero da quello che il bot vede e da una
 * distribuzione immaginata. Il dealer non si vede dalla vista e non serve
 * per finire la smazzata: si mette zero.
 */
export function statoDalMondo(vista: VistaDelBot, mondo: Mondo): HandState {
  const mani = mondo.mani.map((mano, seat) => (seat === vista.io ? [...vista.mano] : [...mano]));
  return {
    config: vista.config,
    dealer: 0,
    trump: vista.trump,
    alliance: { ...vista.alliance },
    hands: mani,
    monte: [...mondo.monte],
    currentTrick: {
      leader: vista.presaInCorso.leader,
      trump: vista.presaInCorso.trump,
      plays: vista.presaInCorso.plays.map((giocata) => ({
        player: giocata.player,
        card: giocata.card,
      })),
    },
    turn: vista.io,
    completedTricks: vista.preseCompletate.map((presa) => ({
      winner: presa.winner,
      cards: presa.cards.map((giocata) => ({ player: giocata.player, card: giocata.card })),
      points: presa.points,
    })),
    progression: vista.progression.map((riga) => [...riga]),
    finished: false,
  };
}

export type ScegliDopo = (vista: VistaDelBot, rng: Rng) => Card;

function eDifensore(vista: VistaDelBot): boolean {
  if (vista.alliance.kind === 'liscio') return false;
  if (sonoIlChiamante(vista)) return false;
  return !alleatoDi(vista, vista.alliance.caller);
}

/**
 * Il chiamante e' solo: la quota basta. Il difensore vince o perde
 * insieme ai compagni, quindi la quota e' la stessa per tutta la
 * squadra e quasi non distingue le mosse. Si aggiungono i punti della
 * sua parte, in scala, cosi' una mossa che porta a casa due punti in
 * piu' si vede anche quando l'esito non cambia.
 */
export function punteggioDellaSimulazione(vista: VistaDelBot, state: HandState): number {
  const score = scoreHand(state);
  const quota = settle(state, score)[vista.io] ?? 0;
  if (!eDifensore(vista)) return quota;
  const punti = score.opponentSide ?? 0;
  return quota + punti / 60;
}

/**
 * Da una distribuzione e da una carta scelta, gioca fino in fondo.
 * Di serie tutti usano le regole del bot; chi chiama puo' far giocare
 * i compagni in un altro modo.
 *
 * Ogni giocatore simulato riceve la propria VistaDelBot, come al tavolo.
 */
export function simulaSmazzata(
  vista: VistaDelBot,
  mondo: Mondo,
  carta: Card,
  rng: Rng,
  scegliDopo: ScegliDopo = scegliCarta,
): number {
  let state = playCard(statoDalMondo(vista, mondo), vista.io, carta.id);
  while (!state.finished) {
    const turno = state.turn;
    const vistaDelTurno = vistaDaStato(state, turno);
    const scelta = scegliDopo(vistaDelTurno, rng);
    state = playCard(state, turno, scelta.id);
  }
  return punteggioDellaSimulazione(vista, state);
}
