import type { CallAction, CallState, Card as CartaEngine } from '@mediatore/engine';
import { currentCaller } from '@mediatore/engine';
import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { PlayerName } from '../components/PlayerName';
import { SuitIcon } from '../components/SuitIcon';
import { MonteInTavola, PostoTavolo } from '../components/Tavolo';
import { DORSO } from '../carte/immagini';
import { NOMI_CHIAMATA, SPECIALI, costo } from '../chiamate';
import { CARTA_DISTRIBUITA_MS, chiRiceve, quanteNeHa } from '../distribuzione';
import { SEMI, nomeGiocatore } from '../labels';
import { cartePerFila, postiDellaMano } from '../mano';
import { ordinaCarte } from '../ordine';
import type { Posizione } from '../posti';
import { disposizione } from '../posti';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onDecide: (player: number, action: CallAction) => void;
}

/**
 * Quanto resta a schermo l'annuncio della chiamata. Al tavolo si dice a voce
 * alta una volta e poi si sta al gioco: quel che deve restare — chi ha
 * chiamato — resta scritto in oro sul suo nome.
 */
const ANNUNCIO_MS = 2000;

/**
 * L'annuncio della chiamata: il nome e cosa ha detto. Prima che la chiamata si
 * chiuda non c'e' niente da annunciare.
 */
function annuncioDellaChiamata(call: CallState): string | null {
  if (call.caller === null) return null;
  const nome = nomeGiocatore(call.caller);
  const chiamata = call.chiamata ?? 'normale';
  return chiamata === 'normale'
    ? `${nome} chiama`
    : `${nome}: ${NOMI_CHIAMATA[chiamata].toUpperCase()}`;
}

/**
 * Il tavolo prima del gioco: le carte che arrivano, la chiamata che si fa
 * subito dopo e l'attesa di chi ha chiamato, che prende il monte o si cerca
 * l'amico. Tutto senza cambiare schermata. E' lo stesso tavolo di quando si
 * gioca — stessi posti, stessa mano in due file — con in mezzo il mazzo
 * invece delle giocate e sotto i bottoni della chiamata invece delle carte
 * da giocare.
 */
export function DealingScreen({ session, onDecide }: Props): ReactElement {
  // Chi dichiara fuori turno: finche' non e' scelto vale chi e' di turno,
  // cosi' la riga non impone una scelta a chi sta solo chiamando normale.
  const [dichiarante, setDichiarante] = useState<number | null>(null);

  const distribuendo = session.phase === 'distribuzione';
  const players = session.config.players;
  const posizioni = disposizione(players, session.puntoDiVista);
  const postoDi = (posizione: Posizione): number => posizioni.indexOf(posizione);

  const diTurno = currentCaller(session.call);

  // Contro i bot sotto c'e' sempre la mano di chi gioca davvero. In hotseat il
  // telefono cambia mani: mentre si distribuisce lo tiene chi siede in basso,
  // poi passa a chi deve decidere.
  const chiMostra =
    session.umano ?? (distribuendo ? session.puntoDiVista : (diTurno ?? session.puntoDiVista));
  const tocca = !distribuendo && diTurno !== null && diTurno === chiMostra;

  // Durante la distribuzione ognuno ha davanti quelle che gli sono arrivate.
  const quante = (seat: number): number =>
    distribuendo
      ? quanteNeHa(session.distribuite, seat, session.dealer, players)
      : (session.hands[seat]?.length ?? 0);

  // Mentre arrivano le carte stanno nell'ordine in cui sono state date: il
  // trionfo si scopre alla fine, e prima di allora nemmeno il modo in cui la
  // mano e' sistemata deve lasciarlo capire. Alla chiamata si sistemano, e da
  // li' in poi restano cosi' per tutta la smazzata.
  const tutte = session.hands[chiMostra] ?? [];
  const mano = distribuendo ? tutte : ordinaCarte(tutte, session.trump);
  const posti = postiDellaMano(mano).slice(0, quante(chiMostra));

  // L'ultima carta uscita dal mazzo e' quella che si vede volare.
  const inVolo =
    distribuendo && session.distribuite > 0
      ? chiRiceve(session.distribuite - 1, session.dealer, players)
      : null;

  const conMonte = session.config.monteSize > 0;
  const scoperta = session.scoperta;
  const chiDichiara = session.umano ?? dichiarante ?? diTurno ?? session.puntoDiVista;

  // Chi ha chiamato sceglie gli scarti o l'amico: al tavolo si resta seduti e
  // si aspetta, come si aspetta il turno di chiunque altro. Delle sue carte
  // non trapela niente, perche' qui sotto c'e' sempre e solo la propria mano.
  const chiamante = session.call.caller;
  const annuncio = annuncioDellaChiamata(session.call);
  const [annunciando, setAnnunciando] = useState(false);
  useEffect(() => {
    if (annuncio === null) {
      setAnnunciando(false);
      return undefined;
    }
    setAnnunciando(true);
    const timer = setTimeout(() => setAnnunciando(false), ANNUNCIO_MS);
    return () => clearTimeout(timer);
  }, [annuncio]);

  const sedia = (posizione: Posizione): ReactElement | null => {
    const seat = postoDi(posizione);
    return (
      <PostoTavolo
        seat={seat}
        posizione={posizione}
        // Squadre non ce ne sono ancora: i nomi restano tutti neutri.
        state={null}
        carte={quante(seat)}
        diTurno={!distribuendo && seat === diTurno}
        punti={null}
        // Il cartaro si vede finche' distribuisce: finito il giro il suo
        // ruolo e' esaurito e l'unica evidenza torna a essere il turno.
        cartaro={distribuendo && seat === session.dealer}
        // L'oro sul chiamante si accende appena chiama e non si spegne piu':
        // da qui passa alla schermata del gioco, che lo legge dalle squadre.
        chiamante={seat === chiamante}
        spiate={null}
        players={players}
      />
    );
  };

  return (
    <section className="schermata tavolo tavolo-prima-del-gioco">
      <header className="intestazione">
        {distribuendo ? (
          <>
            <span>si distribuisce</span>
            <span>{session.config.handSize} carte a testa</span>
          </>
        ) : (
          <>
            <span>
              trionfo{' '}
              <strong className={SEMI[session.trump].classe}>
                <SuitIcon suit={session.trump} size="riga" /> {session.trump}
              </strong>
            </span>
            <span>
              {session.umano !== null && tocca
                ? 'chiami o passi'
                : session.umano === null
                  ? 'passa il telefono'
                  : 'sta pensando'}
            </span>
          </>
        )}
      </header>

      <div className="tavolo-scena">
        <div className="lato lato-sinistro">
          {sedia('sinistra-2')}
          {sedia('sinistra-1')}
        </div>

        <div className="fila-alto">
          {/* Il monte compare a carte finite: prima di allora e' ancora nel
              mazzo, e la carta del trionfo non l'ha girata nessuno. */}
          {!distribuendo && (
            <div className="compare">
              {conMonte ? (
                <MonteInTavola
                  scoperta={scoperta}
                  coperte={session.monte.filter((carta) => carta.id !== scoperta?.id)}
                  spiate={false}
                />
              ) : (
                scoperta !== null && <TrionfoDelCartaro carta={scoperta} cartaro={session.dealer} />
              )}
            </div>
          )}
          {sedia('alto')}
        </div>

        <div className="tavolo-centro">
          {distribuendo ? (
            // Il mazzo in mezzo al tavolo, e da li' le carte che partono.
            <div className="mazzo">
              <span className="mazzo-dorso" style={{ backgroundImage: `url(${DORSO})` }} />
              {inVolo !== null && (
                <span
                  // Ogni carta e' un elemento nuovo: e' la sua comparsa a far
                  // partire il volo, e a volo finito lascia il posto alla dopo.
                  key={session.distribuite}
                  className={`carta-in-volo volo-verso-${posizioni[inVolo] ?? 'basso'}`}
                  style={
                    {
                      backgroundImage: `url(${DORSO})`,
                      '--volo-ms': `${CARTA_DISTRIBUITA_MS}ms`,
                    } as CSSProperties
                  }
                />
              )}
            </div>
          ) : diTurno !== null ? (
            <p className="nota nota-centro">
              chiama <PlayerName seat={diTurno} state={null} />
            </p>
          ) : (
            // Detto una volta, il tempo di sentirlo, e poi via: chi ha chiamato
            // resta scritto in oro sul suo nome, che e' il posto giusto.
            annunciando && <p className="nota-centro annuncio-chiamata compare">{annuncio}</p>
          )}
        </div>

        <div className="lato lato-destro">
          {sedia('destra-2')}
          {sedia('destra-1')}
        </div>

        <div className="fila-basso">{sedia('basso')}</div>
      </div>

      <div className="zona-mano">
        <p className="riga-mano">
          {distribuendo || session.umano !== null
            ? 'la tua mano'
            : `mano di ${nomeGiocatore(chiMostra)} — passa il telefono`}
        </p>
        {/* Le carte si appoggiano dove staranno a mano finita: la misura la
            decidono quelle iniziali, quindi non balla mentre la mano cresce. */}
        <div
          className="mano mano-a-file"
          style={{ '--per-fila': cartePerFila(session.config.handSize) } as CSSProperties}
        >
          {posti.map(({ carta, riga, scarto }) => (
            <div
              key={carta.id}
              className="posto-carta"
              style={{ '--riga': riga, '--scarto': scarto } as CSSProperties}
            >
              {/* Senza onClick la carta e' inerte: durante la chiamata si
                  guarda e basta, non si gioca. Senza monte il trionfo e'
                  l'ultima carta del cartaro, e si marca solo da quando e'
                  stata girata: prima sarebbe come dirlo in anticipo. */}
              <Card
                card={carta}
                scoperta={!distribuendo && !conMonte && scoperta?.id === carta.id}
              />
            </div>
          ))}
        </div>
      </div>

      {/* I bottoni compaiono a carte finite e spariscono appena la chiamata si
          chiude. Il posto pero' se lo prendono da subito, anche mentre non si
          vedono: cosi' la mano nasce dov'e' e non fa un salto proprio quando
          c'e' da guardarla. */}
      {diTurno !== null && (
        <div
          className={
            distribuendo ? 'chiamata-al-tavolo chiamata-in-attesa' : 'chiamata-al-tavolo compare'
          }
        >
          <div className="riga-bottoni">
            <button
              type="button"
              className="bottone-grande"
              disabled={!tocca}
              onClick={() => onDecide(diTurno, { tipo: 'chiama', chiamata: 'normale' })}
            >
              CHIAMA
            </button>
            <button
              type="button"
              className="bottone-grande bottone-secondario"
              disabled={!tocca}
              onClick={() => onDecide(diTurno, { tipo: 'passo' })}
            >
              PASSO
            </button>
          </div>

          {/* Lo schermo e' di tutti: senza il nome non si sa chi ha parlato.
              Contro i bot invece parla sempre e solo chi sta qui davanti. */}
          {session.umano === null && (
            <div className="riga-dichiara">
              <label className="selettore">
                chi dichiara
                <select
                  value={chiDichiara}
                  onChange={(evento) => setDichiarante(Number(evento.target.value))}
                >
                  {session.hands.map((_, seat) => (
                    <option key={seat} value={seat}>
                      {nomeGiocatore(seat)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="riga-bottoni riga-speciali">
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

          <p className="nota nota-dichiarazioni">
            si dichiarano anche fuori turno, e la prima blocca le altre
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Senza monte il trionfo lo gira l'ultima carta del cartaro, che resta in
 * mano sua: in tavola se ne vede la copia, con scritto di chi e'.
 */
function TrionfoDelCartaro({
  carta,
  cartaro,
}: {
  carta: CartaEngine;
  cartaro: number;
}): ReactElement {
  return (
    <div className="tavolo-riquadro">
      <span className="riquadro-parte">
        <Card card={carta} size="piccola" scoperta />
        <span className="riquadro-etichetta">trionfo</span>
        <span className="monte-conteggio">in mano a {nomeGiocatore(cartaro)}</span>
      </span>
    </div>
  );
}
