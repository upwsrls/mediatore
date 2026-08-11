import type { Parametri } from '@mediatore/bot';
import { decidiChiamata, scegliCarta, scegliScarti, vistaDaStato } from '@mediatore/bot';
import type { Card, HandState, Rng } from '@mediatore/engine';
import { beats, cardPoints, currentWinner, ledSuit, legalPlaysFor } from '@mediatore/engine';
import type { Giocatore } from './smazzata.ts';

/**
 * Chi si siede al tavolo di prova.
 *
 * Il bot coi parametri passati e' quello che si sta tarando. Gli altri due
 * servono solo alla verifica finale: sono i soliti avversari di comodo, e
 * riguardano SOLO la carta da giocare. Chiamata e scarto restano quelli del
 * bot di serie, altrimenti non chiamerebbero mai e il confronto misurerebbe
 * un'altra cosa.
 */

function unaFra<T>(elementi: readonly T[], rng: Rng): T {
  const primo = elementi[0];
  if (primo === undefined) throw new Error('nessun elemento fra cui scegliere');
  const indice = Math.min(elementi.length - 1, Math.floor(rng() * elementi.length));
  return elementi[indice] ?? primo;
}

function laPiuMagra(carte: readonly Card[], rng: Rng): Card {
  const minimo = Math.min(...carte.map((carta) => cardPoints(carta.rank)));
  return unaFra(
    carte.filter((carta) => cardPoints(carta.rank) === minimo),
    rng,
  );
}

function comeChiamaIlBot(parametri: Parametri): Pick<Giocatore, 'chiama' | 'scarta'> {
  return {
    chiama: (mano, trump, scoperta, config) =>
      decidiChiamata({ mano, trump, scoperta }, config, parametri) === 'chiama',
    scarta: (allargata, trump, quanti, config) =>
      scegliScarti(allargata, trump, quanti, config.players, parametri),
  };
}

/** Il bot vero, con i numeri che gli si vogliono provare addosso. */
export function botCon(parametri: Parametri): Giocatore {
  return {
    ...comeChiamaIlBot(parametri),
    gioca: (state, io, rng) => scegliCarta(vistaDaStato(state, io), rng, parametri),
  };
}

/** Prende la presa spendendo il meno possibile, altrimenti butta la piu' magra. */
export function greedy(parametri: Parametri): Giocatore {
  return {
    ...comeChiamaIlBot(parametri),
    gioca: (state, io, rng) => {
      const legali = legalPlaysFor(state, io);
      const seme = ledSuit(state.currentTrick);
      const vincitore = currentWinner(state.currentTrick);
      const inTesta =
        vincitore === null
          ? null
          : (state.currentTrick.plays.find((giocata) => giocata.player === vincitore)?.card ?? null);
      const vincenti =
        seme === null || inTesta === null
          ? []
          : legali.filter((carta) => beats(carta, inTesta, state.trump, seme));
      return laPiuMagra(vincenti.length > 0 ? vincenti : legali, rng);
    },
  };
}

/** A caso fra le mosse legali: il fondo sotto cui non si scende. */
export function random(parametri: Parametri): Giocatore {
  return {
    ...comeChiamaIlBot(parametri),
    gioca: (state: HandState, io: number, rng: Rng) => unaFra(legalPlaysFor(state, io), rng),
  };
}
