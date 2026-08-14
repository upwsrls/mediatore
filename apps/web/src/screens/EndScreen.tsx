import type { HandScore, HandState } from '@mediatore/engine';
import { scoreHand, settle, settleChiSeLaSenteScaduto } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { PartiteRegistrate } from '../components/PartiteRegistrate';
import { PlayerName } from '../components/PlayerName';
import { PuntoDiVista } from '../components/PuntoDiVista';
import { StatusLine } from '../components/StatusLine';
import {
  NOMI_CHIAMATA,
  chiamataDi,
  contoDellaPosta,
  costo,
  spiegazioniSupplementi,
} from '../chiamate';
import { useInCima } from '../inCima';
import { nomeGiocatore } from '../labels';
import { schieramenti } from '../roles';
import type { Session } from '../useHand';
import { ReviewScreen } from './ReviewScreen';

interface Props {
  session: Session;
  /** Null quando la smazzata e' finita senza essere giocata. */
  state: HandState | null;
  /** I secondi che restano prima che la smazzata dopo parta da sola. */
  secondiAllaRipartenza: number;
  onEsci: () => void;
  onCambiaPuntoDiVista: (seat: number) => void;
}

function conSegno(valore: number): string {
  return valore > 0 ? `+${valore}` : `${valore}`;
}

function Quote({ settlement, state }: { settlement: number[]; state: HandState | null }): ReactElement {
  return (
    <ul className="lista">
      {settlement.map((quota, seat) => (
        <li key={seat}>
          <PlayerName seat={seat} state={state} />: <strong>{conSegno(quota)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function EndScreen({
  session,
  state,
  secondiAllaRipartenza,
  onEsci,
  onCambiaPuntoDiVista,
}: Props): ReactElement {
  const [rivedi, setRivedi] = useState(false);
  // Le basi da rivedere sono un'altra scena, e si guardano dalla prima riga:
  // aprirle a meta' pagina, dove si era arrivati leggendo il conteggio, sarebbe
  // come aprire un quaderno a caso.
  useInCima(rivedi ? 'rivedi' : 'conteggio');

  if (state === null) {
    return (
      <FineScaduta
        session={session}
        secondiAllaRipartenza={secondiAllaRipartenza}
        onEsci={onEsci}
        onCambiaPuntoDiVista={onCambiaPuntoDiVista}
      />
    );
  }

  const score = scoreHand(state);
  const settlement = settle(state, score);
  const somma = settlement.reduce((totale, quota) => totale + quota, 0);
  // Solo una smazzata col monte ha una dichiarazione e quindi una posta.
  const dichiarazione = state.alliance.kind === 'monte' ? state.alliance : null;
  const { caller, friend } = schieramenti(state);

  // Le prese si rivedono sopra il conteggio, ma il conto alla rovescia scorre
  // anche qui: a zero si riparte comunque, che si stia guardando o no.
  if (rivedi) {
    return (
      <>
        <ContoAllaRovescia secondi={secondiAllaRipartenza} />
        <ReviewScreen state={state} onChiudi={() => setRivedi(false)} />
      </>
    );
  }

  return (
    <section className="schermata schermata-conteggio">
      <StatusLine state={state} />
      <h2>fine smazzata</h2>

      {/* Il colpo piu' raro del gioco: se c'e' stato, si vede prima di tutto. */}
      {score.cappotto !== null && (
        <Cappotto score={score} state={state} settlement={settlement} />
      )}

      <div className="blocco">
        <p className="etichetta">punti</p>
        <ul className="lista">
          {score.perPlayer.map((punti, seat) => (
            <li key={seat}>
              <PlayerName seat={seat} state={state} />: <strong>{punti}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="blocco">
        {score.callerSide === null ? (
          <>
            <p className="etichetta">liscio</p>
            <EsitoLiscio score={score} state={state} />
          </>
        ) : (
          <>
            <p className="etichetta">chiamata</p>
            <p>
              chiamante {score.callerSide} contro avversari {score.opponentSide}, soglia{' '}
              {score.threshold}
            </p>
            {/* Col cappotto decidono le basi: i punti possono dire il contrario. */}
            <p className="esito">
              {score.cappotto === 'contro'
                ? 'il chiamante perde: nemmeno una base'
                : score.cappotto === 'favore'
                  ? 'il chiamante vince: tutte le basi'
                  : score.tie
                    ? 'pareggio esatto: nessuno paga'
                    : score.callerWins
                      ? 'il chiamante vince'
                      : 'il chiamante perde'}
            </p>
          </>
        )}
      </div>

      <div className="blocco">
        <p className="etichetta">quote</p>
        {/* Da dove escono gli importi: dichiarazione e supplementi, addendo per
            addendo. Col cappotto il conto sta gia' scritto la' sopra, intero. */}
        {score.cappotto === null &&
          caller !== null &&
          (dichiarazione !== null || score.penalitaSoglia > 0) && (
          <>
            <p className="posta-applicata">
              {NOMI_CHIAMATA[chiamataDi(state) ?? 'normale']},{' '}
              {contoDellaPosta(chiamataDi(state), false, score.penalitaSoglia)} —{' '}
              {score.tie
                ? 'pareggio esatto: nessuno paga'
                : riepilogoQuote(settlement, caller, friend)}
            </p>
            <Supplementi score={score} state={state} />
          </>
        )}
        <Quote settlement={settlement} state={state} />
        <p className="nota">somma delle quote: {somma}</p>
      </div>

      <ContoAllaRovescia secondi={secondiAllaRipartenza} />

      <div className="riga-bottoni">
        <button
          type="button"
          className="bottone-grande bottone-secondario"
          onClick={() => setRivedi(true)}
        >
          Rivedi la smazzata
        </button>
        <button type="button" className="bottone-grande bottone-secondario" onClick={onEsci}>
          Esci dal tavolo
        </button>
      </div>
      {/* Il posto si cambia solo qui, a smazzata chiusa: mai mentre si gioca.
          Contro i bot il posto e' uno solo e non si sceglie. */}
      {session.umano === null && (
        <PuntoDiVista
          players={session.config.players}
          valore={session.puntoDiVista}
          onCambia={onCambiaPuntoDiVista}
        />
      )}
      <p className="nota">
        ha distribuito <PlayerName seat={session.dealer} state={state} />
      </p>
      <PartiteRegistrate />
    </section>
  );
}

/**
 * Il tavolo riparte da solo, e questo e' l'unico avviso che ne da': deve
 * leggersi al primo sguardo, perche' i secondi che restano sono tutto quello
 * che il giocatore puo' decidere in questa schermata.
 */
function ContoAllaRovescia({ secondi }: { secondi: number }): ReactElement {
  return (
    <p className="conto-alla-rovescia" role="timer">
      tornerete al tavolo fra <strong>{secondi}</strong>
    </p>
  );
}

/**
 * "giocatore 0: +9 · gli altri: -3 a testa". Chi sta con il chiamante prende
 * meta' quota, quindi va nominato a parte: gli avversari invece pagano pari.
 */
function riepilogoQuote(settlement: number[], caller: number, friend: number | null): string {
  const parti = [`${nomeGiocatore(caller)}: ${conSegno(settlement[caller] ?? 0)}`];
  if (friend !== null) {
    parti.push(`${nomeGiocatore(friend)}: ${conSegno(settlement[friend] ?? 0)}`);
  }
  const altrui = settlement.find((_, seat) => seat !== caller && seat !== friend) ?? 0;
  parti.push(`gli altri: ${conSegno(altrui)} a testa`);
  return parti.join(' · ');
}

/**
 * Nel cappotto liscio non c'e' nessun perdente da punti: liscioLoser e'
 * vuoto apposta, e leggerlo come se fosse un posto accuserebbe giocatore 0.
 */
function EsitoLiscio({ score, state }: { score: HandScore; state: HandState }): ReactElement {
  if (score.cappotto === 'liscio' && score.cappottoDi !== null) {
    return (
      <p>
        <PlayerName seat={score.cappottoDi} state={state} /> ha preso tutte le basi: il
        cappotto ribalta il liscio, quindi incassa invece di pagare
      </p>
    );
  }
  if (score.liscioLoser === null) return <p>nessuno paga</p>;
  return (
    <p>
      paga <PlayerName seat={score.liscioLoser} state={state} />
      {score.liscioSecond !== null && (
        <>
          , secondo <PlayerName seat={score.liscioSecond} state={state} />
        </>
      )}
    </p>
  );
}

/** L'annuncio del cappotto, con il conto in chiaro di dove esce la posta. */
function Cappotto({
  score,
  state,
  settlement,
}: {
  score: HandScore;
  state: HandState;
  settlement: number[];
}): ReactElement | null {
  const chi = score.cappottoDi;
  if (score.cappotto === null || chi === null) return null;

  const chiamata = chiamataDi(state);
  const nomePosta = state.alliance.kind === 'liscio' ? 'liscio' : NOMI_CHIAMATA[chiamata ?? 'normale'];
  // Nel cappotto a favore della coppia l'amico e' per forza gia' scoperto.
  const amico = score.cappotto === 'favore' ? schieramenti(state).friend : null;

  return (
    <div className="blocco blocco-cappotto">
      <p className="titolo-cappotto">cappotto</p>
      <p className="racconto-cappotto">
        {score.cappotto === 'contro' ? (
          <>
            <PlayerName seat={chi} state={state} /> non ha preso nemmeno una base
          </>
        ) : score.cappotto === 'liscio' ? (
          <>
            <PlayerName seat={chi} state={state} /> ha preso tutte le basi e vince
          </>
        ) : amico !== null ? (
          <>
            <PlayerName seat={chi} state={state} /> e <PlayerName seat={amico} state={state} />{' '}
            hanno preso tutte le basi
          </>
        ) : (
          <>
            <PlayerName seat={chi} state={state} /> ha preso tutte le basi
          </>
        )}
      </p>
      <p className="posta-applicata">
        {nomePosta.toUpperCase()} + CAPPOTTO — {contoDellaPosta(chiamata, true, score.penalitaSoglia)}
      </p>
      <p className="posta-applicata">{riepilogoQuote(settlement, chi, amico)}</p>
      <Supplementi score={score} state={state} />
    </div>
  );
}

/**
 * Perche' la posta e' salita: una riga per supplemento, cosi' il conto scritto
 * sopra si legge addendo per addendo invece che a memoria.
 */
function Supplementi({ score, state }: { score: HandScore; state: HandState }): ReactElement | null {
  const spiegazioni = spiegazioniSupplementi(score, state);
  if (spiegazioni.length === 0) return null;

  return (
    <ul className="supplementi">
      {spiegazioni.map((riga) => (
        <li key={riga}>{riga}</li>
      ))}
    </ul>
  );
}

/**
 * Chi se la sente senza nessuno che si e' fatto avanti: non c'e' stata una
 * smazzata da contare, solo un conto da pagare.
 */
function FineScaduta({
  session,
  secondiAllaRipartenza,
  onEsci,
  onCambiaPuntoDiVista,
}: Omit<Props, 'state'>): ReactElement {
  const caller = session.call.caller;
  if (caller === null) return <p>nessun chiamante</p>;

  const settlement = settleChiSeLaSenteScaduto(session.config, caller);

  return (
    <section className="schermata schermata-conteggio">
      <div className="riga-stato">
        {nomeGiocatore(caller)} ha detto CHI SE LA SENTE — non se l e sentita nessuno
      </div>
      <h2>fine smazzata</h2>

      <div className="blocco">
        <p className="etichetta">esito</p>
        <p>
          nessun avversario ha aperto: gli avversari perdono senza giocare e le carte non
          si contano
        </p>
      </div>

      <div className="blocco">
        <p className="etichetta">quote</p>
        <p className="posta-applicata">
          {NOMI_CHIAMATA.chiSeLaSente}, {costo('chiSeLaSente')} —{' '}
          {riepilogoQuote(settlement, caller, null)}
        </p>
        <Quote settlement={settlement} state={null} />
        <p className="nota">
          somma delle quote: {settlement.reduce((totale, quota) => totale + quota, 0)}
        </p>
      </div>

      <ContoAllaRovescia secondi={secondiAllaRipartenza} />

      <div className="riga-bottoni">
        <button type="button" className="bottone-grande bottone-secondario" onClick={onEsci}>
          Esci dal tavolo
        </button>
      </div>
      {session.umano === null && (
        <PuntoDiVista
          players={session.config.players}
          valore={session.puntoDiVista}
          onCambia={onCambiaPuntoDiVista}
        />
      )}
      <p className="nota">
        ha distribuito <PlayerName seat={session.dealer} state={null} />
      </p>
      <PartiteRegistrate />
    </section>
  );
}
