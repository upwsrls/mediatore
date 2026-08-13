import type { HandState } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { nomeCompatto, nomeGiocatore } from '../labels';
import type { Ruolo } from '../roles';
import { etichettaRuolo, ruoloDi } from '../roles';

interface Props {
  seat: number;
  /** null prima che la smazzata inizi: senza squadre non c'e' nessun ruolo. */
  state: HandState | null;
  /** Forma breve per gli spazi stretti: g0 invece di giocatore 0. */
  compatto?: boolean;
  /** Chi distribuisce, solo durante la distribuzione: ruolo di un momento. */
  cartaro?: boolean;
  /**
   * Ha chiamato, ma la smazzata non e' ancora cominciata e non c'e' nessuno
   * stato da cui leggere le squadre: fra la chiamata e la prima carta questo
   * e' l'unico modo di dire che l'evidenza gli tocca gia'.
   */
  chiamante?: boolean;
}

/**
 * Unico modo in cui si scrive il nome di un giocatore. L'evidenza del ruolo
 * la decide questo componente: chi lo usa non sa niente delle squadre.
 */
export function PlayerName({
  seat,
  state,
  compatto = false,
  cartaro = false,
  chiamante = false,
}: Props): ReactElement {
  const ruolo: Ruolo =
    state === null ? (chiamante ? 'chiamante' : 'neutro') : ruoloDi(seat, state);
  const etichetta = etichettaRuolo(ruolo);
  /*
   * Il chiamante la parola non la mostra: l'oro pieno sul nome dice gia' che e'
   * lui, e sui posti di lato quei pixel servono alle carte. Resta scritta per
   * chi ascolta lo schermo, che il colore da solo non gli dice niente.
   * L'amico invece la tiene sotto gli occhi: il suo oro tenue e l'oro pieno del
   * chiamante stanno a 1,6:1 di contrasto, troppo vicini perche' si distinguano
   * senza leggere.
   */
  const soloLetta = ruolo === 'chiamante';

  return (
    <span className={`giocatore giocatore-${ruolo}`}>
      {compatto ? nomeCompatto(seat) : nomeGiocatore(seat)}
      {etichetta !== null && (
        <span className={soloLetta ? 'giocatore-ruolo solo-letta' : 'giocatore-ruolo'}>
          {etichetta}
        </span>
      )}
      {cartaro && <span className="giocatore-cartaro">cartaro</span>}
    </span>
  );
}
