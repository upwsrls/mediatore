import type { ReactElement, ReactNode } from 'react';
import { useAudio } from '../audio/useAudio';
import { SEMI } from '../labels';
import type { Livello } from '../livello';
import { livelloOpposto } from '../livello';
import { trionfoNoto } from '../trionfo';
import type { Session } from '../useHand';
import { SuitIcon } from './SuitIcon';

interface Props {
  session: Session;
  /** Quante basi, o a che punto siamo: la riga c'e' sempre, anche prima del gioco. */
  basi: string;
  extra?: ReactNode;
  onCarteScoperte: (acceso: boolean) => void;
  onLivello: (livello: Livello) => void;
}

/**
 * La riga in cima al tavolo: trionfo, basi, e le pillole. E' la stessa dalla
 * prima carta che esce dal mazzo all'ultima base, cosi' distribuzione,
 * chiamata e gioco sono lo stesso tavolo. Il seme resta riservato ma
 * invisibile finche' non si gira: ultima del monte, o ultima carta all'amico.
 */
export function IntestazioneTavolo({
  session,
  basi,
  extra,
  onCarteScoperte,
  onLivello,
}: Props): ReactElement {
  const audio = useAudio();
  const spia = session.carteScoperte && session.umano !== null;
  const noto = trionfoNoto(session.phase);

  return (
    <header className="intestazione">
      <span>
        trionfo{' '}
        <strong
          className={`${SEMI[session.trump].classe}${noto ? '' : ' intestazione-seme-ignoto'}`}
          aria-hidden={!noto}
        >
          <SuitIcon suit={session.trump} size="riga" /> {session.trump}
        </strong>
      </span>
      <span>{basi}</span>
      {extra}
      <button
        type="button"
        className="spia"
        aria-pressed={audio.acceso}
        title={audio.acceso ? 'spegni i suoni del tavolo' : 'riaccendi i suoni del tavolo'}
        onClick={() => audio.cambia(!audio.acceso)}
      >
        {audio.acceso ? 'audio' : 'muto'}
      </button>
      <button
        type="button"
        className="spia"
        title={`passa a ${livelloOpposto(session.livello)}`}
        onClick={() => onLivello(livelloOpposto(session.livello))}
      >
        {session.livello}
      </button>
      {session.umano !== null && (
        <button
          type="button"
          className={spia ? 'spia spia-accesa' : 'spia'}
          aria-pressed={spia}
          onClick={() => onCarteScoperte(!spia)}
        >
          {spia ? 'carte scoperte' : 'vedi le carte'}
        </button>
      )}
    </header>
  );
}
