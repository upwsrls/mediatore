import type { Card as CartaEngine, HandState, Suit } from '@mediatore/engine';
import { totalPoints } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { Card } from './Card';
import { PlayerName } from './PlayerName';
import { ordinaCarte } from '../ordine';

/**
 * Il monte a carte in tavola, a smazzata chiusa: non c'e' piu' niente da
 * tenere nascosto, e quelle carte stanno al centro perche' le guardino tutti,
 * prima che si conti. Chi vince l'ultima base se le porta via tutte.
 *
 * Le carte stanno nell'ordine in cui si tiene una mano.
 */
export function MonteScopertoInTavola({
  monte,
  trump,
  state,
  preso,
  nascondiCarte = false,
}: {
  monte: readonly CartaEngine[];
  trump: Suit;
  /** Serve al ruolo scritto accanto al nome: null se la smazzata non si e' giocata. */
  state: HandState | null;
  /** Chi se l'e' preso, o null se nessuno. */
  preso: number | null;
  /**
   * Le carte stanno gia' in tavola come una base, pronte a raccogliersi:
   * qui resta solo chi se l'e' preso e quanto valeva.
   */
  nascondiCarte?: boolean;
}): ReactElement | null {
  if (monte.length === 0) return null;

  const puntiDelleCarte = totalPoints([...monte]);
  const didascalia = (
    <>
      <p>
        {preso === null ? (
          'non lo ha preso nessuno: la smazzata non si e giocata'
        ) : (
          <>
            lo ha preso <PlayerName seat={preso} state={state} />, che ha vinto l ultima base
          </>
        )}
      </p>
      {preso !== null && (
        <p className="nota">
          valeva {puntiDelleCarte + 1}:{' '}
          {puntiDelleCarte === 0
            ? 'carte senza punti, piu 1 della base'
            : `${puntiDelleCarte} di carte piu 1 della base`}
        </p>
      )}
    </>
  );

  return (
    <div className={nascondiCarte ? 'monte-al-centro monte-al-centro-solo-testo' : 'monte-al-centro'}>
      <p className="etichetta">monte</p>
      {!nascondiCarte && (
        <div className="mano mano-larga">
          {ordinaCarte(monte, trump).map((carta) => (
            <Card key={carta.id} card={carta} size="piccola" />
          ))}
        </div>
      )}
      {nascondiCarte ? <div className="monte-didascalia">{didascalia}</div> : didascalia}
    </div>
  );
}

/** Chi ha vinto l'ultima base, e quindi si e' preso il monte. */
export function chiSiPrendeIlMonte(state: HandState | null): number | null {
  return state?.completedTricks[state.completedTricks.length - 1]?.winner ?? null;
}
