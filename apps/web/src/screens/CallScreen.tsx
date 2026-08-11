import type { CallAction, Card as CartaEngine } from '@mediatore/engine';
import { currentCaller } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { SuitIcon } from '../components/SuitIcon';
import { NOMI_CHIAMATA, SPECIALI, costo } from '../chiamate';
import { SEMI, nomeGiocatore } from '../labels';
import { ordinaCarte } from '../ordine';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onDecide: (player: number, action: CallAction) => void;
}

export function CallScreen({ session, onDecide }: Props): ReactElement {
  // Chi dichiara fuori turno: finche' non e' scelto vale chi e' di turno,
  // cosi' la riga non impone una scelta a chi sta solo chiamando normale.
  const [dichiarante, setDichiarante] = useState<number | null>(null);

  const diTurno = currentCaller(session.call);
  if (diTurno === null) return <p>fase di chiamata conclusa</p>;

  // Contro i bot si guarda sempre e solo la propria mano, anche mentre
  // decide un altro: le carte di chi sta pensando non sono affari nostri.
  const umano = session.umano;
  const chiMostra = umano ?? diTurno;
  const tocca = diTurno === chiMostra;

  const chiDichiara = umano ?? dichiarante ?? diTurno;
  const posti = session.hands.map((_, seat) => seat);
  const senzaMonte = session.config.monteSize === 0;

  // Stesso criterio dell'ordine definitivo: qui la mano non e' ancora cambiata,
  // quindi le carte sono gia' nella posizione che avranno per tutta la smazzata.
  const mano: CartaEngine[] = ordinaCarte(session.hands[chiMostra] ?? [], session.trump);
  const conMonte = session.config.monteSize > 0;
  const scoperta = session.scoperta;

  return (
    <section className="schermata">
      <header className="intestazione">
        <span>
          trionfo{' '}
          <strong className={SEMI[session.trump].classe}>
            <SuitIcon suit={session.trump} size="riga" /> {session.trump}
          </strong>
        </span>
      </header>

      {scoperta !== null && conMonte && (
        <div className="blocco blocco-scoperta">
          <p className="etichetta">carta scoperta del monte</p>
          <Card card={scoperta} size="piccola" />
        </div>
      )}

      {scoperta !== null && !conMonte && (
        <div className="blocco blocco-scoperta">
          <p className="etichetta">trionfo — ultima carta del mazziere</p>
          <Card card={scoperta} scoperta />
          <p className="nota">
            e in mano a {nomeGiocatore(session.dealer)}, che l ha ricevuta per ultima: resta
            in tavola finche la chiamata non si chiude, poi se la riprende
          </p>
        </div>
      )}

      {/* Al proprio turno il nome non serve: si e' seduti li'. */}
      <h2>{umano !== null && tocca ? 'tocca a te' : `tocca a ${nomeGiocatore(diTurno)}`}</h2>
      <p className="nota">
        {umano === null
          ? 'passa il telefono, poi decidi'
          : tocca
            ? 'chiami o passi'
            : 'sta pensando'}
      </p>

      <div className="mano">
        {mano.map((carta) => (
          // Solo il mazziere ha in mano la carta scoperta: il confronto per id
          // basta a marcarla quando tocca a lui.
          <Card key={carta.id} card={carta} scoperta={!conMonte && scoperta?.id === carta.id} />
        ))}
      </div>

      {tocca && (
        <div className="riga-bottoni">
          <button
            type="button"
            className="bottone-grande"
            onClick={() => onDecide(diTurno, { tipo: 'chiama', chiamata: 'normale' })}
          >
            CHIAMA
          </button>
          <button
            type="button"
            className="bottone-grande bottone-secondario"
            onClick={() => onDecide(diTurno, { tipo: 'passo' })}
          >
            PASSO
          </button>
        </div>
      )}

      <div className="blocco dichiarazioni">
        <div className="riga-dichiara">
          <span className="etichetta">dichiara fuori turno</span>
          {/* Lo schermo e' di tutti: senza il nome non si sa chi ha parlato.
              Contro i bot invece parla sempre e solo chi sta qui davanti. */}
          {umano === null && (
            <label className="selettore">
              chi dichiara
              <select
                value={chiDichiara}
                onChange={(evento) => setDichiarante(Number(evento.target.value))}
              >
                {posti.map((seat) => (
                  <option key={seat} value={seat}>
                    {nomeGiocatore(seat)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="riga-bottoni">
          {SPECIALI.map((chiamata) => (
            <button
              key={chiamata}
              type="button"
              className="bottone-grande bottone-dichiarazione"
              onClick={() => onDecide(chiDichiara, { tipo: 'chiama', chiamata })}
            >
              <span className="costo">{costo(chiamata)}</span>
              <span className="nome-dichiarazione">{NOMI_CHIAMATA[chiamata]}</span>
            </button>
          ))}
        </div>

        <p className="nota">
          si dichiarano in qualsiasi momento, anche senza aspettare il proprio turno, e la
          prima dichiarata blocca le altre.{' '}
          {senzaMonte
            ? 'Chi dichiara rinuncia al compagno: nessun 7 da chiamare, si gioca solo contro quattro'
            : 'In tutte e tre si gioca soli contro tutti'}
        </p>
      </div>
    </section>
  );
}
