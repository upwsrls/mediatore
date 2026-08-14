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
  /**
   * Ha dato le carte: pallino rosso accanto al nome, dalla prima carta che
   * esce all'ultimo punto contato. Non e' un ruolo come il chiamante, e'
   * un'informazione di servizio, e si riconosce sempre nello stesso modo.
   */
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
      {/*
       * Il pallino e nient'altro, dalla distribuzione alla fine: la parola
       * CARTARO sui posti di lato sforava il tavolo di una trentina di pixel, e
       * dove il pallino resta tutta la smazzata non serve piu' a niente. Chi
       * ascolta lo schermo la sente comunque: il colore da solo non dice nulla.
       */}
      {cartaro && (
        <span className="pallino-cartaro">
          <span className="solo-letta">cartaro</span>
        </span>
      )}
    </span>
  );
}
