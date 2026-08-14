import type { CallAction, CallState, Card as CartaEngine } from '@mediatore/engine';
import { currentCaller } from '@mediatore/engine';
import type { CSSProperties, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { IntestazioneTavolo } from '../components/IntestazioneTavolo';
import { MonteScopertoInTavola } from '../components/MonteScopertoInTavola';
import { MonteInTavola, PostoTavolo, monteInCima } from '../components/Tavolo';
import { DORSO } from '../carte/immagini';
import { NOMI_CHIAMATA, SPECIALI, costo } from '../chiamate';
import { CARTA_DISTRIBUITA_MS, chiRiceve, quanteNeHa } from '../distribuzione';
import { nomeGiocatore } from '../labels';
import type { Livello } from '../livello';
import { cartePerFila, postiDellaMano } from '../mano';
import { ordinaCarte } from '../ordine';
import type { Posizione } from '../posti';
import { disposizione } from '../posti';
import type { Session } from '../useHand';

interface Props {
  session: Session;
  onDecide: (player: number, action: CallAction) => void;
  onCarteScoperte: (acceso: boolean) => void;
  onLivello: (livello: Livello) => void;
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
export function DealingScreen({
  session,
  onDecide,
  onCarteScoperte,
  onLivello,
}: Props): ReactElement {
  // Chi dichiara fuori turno: finche' non e' scelto vale chi e' di turno,
  // cosi' la riga non impone una scelta a chi sta solo chiamando normale.
  const [dichiarante, setDichiarante] = useState<number | null>(null);

  const distribuendo = session.phase === 'distribuzione';
  // Nessuno ha aperto: il monte si scopre qui, sullo stesso tavolo della
  // chiamata, senza i bottoni e senza aspettare un gioco che non c'e' stato.
  const scopreIlMonte = session.phase === 'monte';
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

  // Le carte si sistemano man mano che arrivano, come al tavolo: ognuna entra
  // al posto che le spetta e le altre si spostano per farle largo, con la
  // stessa transizione con cui la mano si ricompatta giocando.
  //
  // Per palo e per forza, ma senza il trionfo in testa: mentre si distribuisce
  // non l'ha ancora girato nessuno, e una mano che tiene un palo per primo lo
  // direbbe in anticipo. Il trionfo passa davanti quando si scopre, cioe'
  // quando comincia la chiamata, e da li' l'ordine e' quello di sempre.
  const tutte = session.hands[chiMostra] ?? [];
  // Le arrivate sono le prime della mano: quello e' l'ordine in cui l'engine
  // le ha date, e il giro del tavolo le consegna in quello stesso ordine.
  const arrivate = distribuendo ? tutte.slice(0, quante(chiMostra)) : tutte;
  const mano = ordinaCarte(arrivate, distribuendo ? null : session.trump);
  const perFila = cartePerFila(session.config.handSize);
  const posti = postiDellaMano(mano, perFila, session.config.handSize);

  // L'ultima carta uscita dal mazzo e' quella che si vede volare.
  const inVolo =
    distribuendo && session.distribuite > 0
      ? chiRiceve(session.distribuite - 1, session.dealer, players)
      : null;

  const conMonte = session.config.monteSize > 0;
  const scoperta = session.scoperta;
  const chiDichiara = session.umano ?? dichiarante ?? diTurno ?? session.puntoDiVista;
  const spia = session.carteScoperte && session.umano !== null;

  // Chi ha chiamato sceglie gli scarti o l'amico: al tavolo si resta seduti e
  // si aspetta, come si aspetta il turno di chiunque altro. Delle sue carte
  // non trapela niente, perche' qui sotto c'e' sempre e solo la propria mano.
  const chiamante = session.call.caller;
  // Stessa regola del tavolo di gioco: in cima resta il monte finche' non
  // se lo prende qualcuno. Durante la chiamata non se l'e' preso nessuno.
  const inCima =
    !distribuendo && !scopreIlMonte && conMonte
      ? monteInCima(
          chiamante === null ? null : (session.call.chiamata ?? 'normale'),
          scoperta,
          session.monte,
        )
      : null;
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
        // Chi ha dato le carte si sa dal pallino, e si sa uguale da qui alla
        // fine: sopra la sua testa non c'e' niente da leggere.
        cartaro={seat === session.dealer}
        // L'oro sul chiamante si accende appena chiama e non si spegne piu':
        // da qui passa alla schermata del gioco, che lo legge dalle squadre.
        chiamante={seat === chiamante}
        spiate={
          spia && session.umano !== null && seat !== session.umano
            ? ordinaCarte(
                (session.hands[seat] ?? []).slice(0, quante(seat)),
                distribuendo ? null : session.trump,
              )
            : null
        }
        players={players}
      />
    );
  };

  return (
    <section
      className={
        scopreIlMonte
          ? 'schermata tavolo tavolo-prima-del-gioco tavolo-col-monte'
          : 'schermata tavolo tavolo-prima-del-gioco'
      }
    >
      <div className="riga-stato">{statoPrimaDelGioco(session, tocca, diTurno)}</div>

      <IntestazioneTavolo
        session={session}
        basi={scopreIlMonte ? 'il monte' : `base 1 di ${session.config.tricks}`}
        onCarteScoperte={onCarteScoperte}
        onLivello={onLivello}
      />

      <div className={spia ? 'tavolo-scena tavolo-spiato' : 'tavolo-scena'}>
        <div className="lato lato-sinistro">
          {sedia('sinistra-2')}
          {sedia('sinistra-1')}
        </div>

        <div className="fila-alto">
          {inCima !== null && (
            <div className="compare">
              <MonteInTavola
                scoperta={inCima.scoperta}
                coperte={inCima.coperte}
                spiate={spia}
              />
            </div>
          )}
          {!distribuendo &&
            !scopreIlMonte &&
            !conMonte &&
            chiamante === null &&
            scoperta !== null && (
              <div className="compare">
                <TrionfoDelCartaro carta={scoperta} cartaro={session.dealer} />
              </div>
            )}
          {sedia('alto')}
        </div>

        <div className="tavolo-centro">
          {scopreIlMonte ? (
            <MonteScopertoInTavola
              monte={session.monte}
              trump={session.trump}
              state={null}
              preso={null}
            />
          ) : distribuendo ? (
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
          ) : (
            // Finite le carte il centro resta vuoto: di chi sia il turno lo dice
            // il bordo acceso attorno al posto, come per tutto il resto del
            // gioco, e chi e' di turno non sta chiamando — sta ancora decidendo.
            // L'unica cosa che si scrive qui e' la chiamata di chi ha chiamato
            // davvero: detta una volta, il tempo di sentirla, e poi via, che poi
            // resta scritta in oro sul suo nome.
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
        {session.umano === null && (
          <p className="riga-mano">
            {distribuendo || scopreIlMonte
              ? `mano di ${nomeGiocatore(chiMostra)}`
              : `mano di ${nomeGiocatore(chiMostra)} — passa il telefono`}
          </p>
        )}
        {/* Le carte si appoggiano dove staranno a mano finita: la misura la
            decidono quelle iniziali, quindi non balla mentre la mano cresce. */}
        <div className="mano mano-a-file" style={{ '--per-fila': perFila } as CSSProperties}>
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
      {diTurno !== null && !scopreIlMonte && (
        <div
          className={
            distribuendo ? 'chiamata-al-tavolo chiamata-in-attesa' : 'chiamata-al-tavolo compare'
          }
        >
          {(tocca || distribuendo) && diTurno !== null && (
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
 * Chi sta facendo cosa, prima che si giochi. Quando tocca a chi guarda
 * resta la stessa frase di sempre: chiami o passi.
 */
function statoPrimaDelGioco(session: Session, tocca: boolean, diTurno: number | null): string {
  if (session.phase === 'distribuzione') return 'si distribuisce';
  if (session.phase === 'monte') return 'il monte si scopre';
  const chiamante = session.call.caller;
  if (session.phase === 'discard' && chiamante !== null) {
    return `${nomeGiocatore(chiamante)} scarta al monte`;
  }
  if (session.phase === 'friend' && chiamante !== null) {
    return `${nomeGiocatore(chiamante)} sceglie l'amico`;
  }
  if (tocca) return 'chiami o passi';
  if (diTurno !== null) return `${nomeGiocatore(diTurno)} sta decidendo`;
  return 'si chiama';
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
