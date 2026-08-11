import type { Card as CartaEngine, HandState } from '@mediatore/engine';
import { chiVedeIlMonte, legalPlaysFor } from '@mediatore/engine';
import type { CSSProperties, ReactElement } from 'react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { PlayerName } from '../components/PlayerName';
import { StatusLine } from '../components/StatusLine';
import { SuitIcon } from '../components/SuitIcon';
import { DORSO } from '../carte/immagini';
import { chiamataDi } from '../chiamate';
import { SEMI, motivoNonGiocabile, nomeGiocatore, obbligoCorrente, puntiCorrenti } from '../labels';
import { cartePerFila, postiDellaMano } from '../mano';
import { ordinaCarte, secondoOrdine } from '../ordine';
import type { Posizione } from '../posti';
import { disposizione, eDiLato, inclinazione } from '../posti';
import { cartaChiamata, schieramenti } from '../roles';
import { chiTieneLaCarta, ventaglioDelPosto } from '../spia';
import type { Session, TrickPause } from '../useHand';

interface Props {
  session: Session;
  state: HandState;
  pause: TrickPause | null;
  onGioca: (cardId: string) => void;
  onCarteScoperte: (acceso: boolean) => void;
}

export function TableScreen({
  session,
  state,
  pause,
  onGioca,
  onCarteScoperte,
}: Props): ReactElement {
  const [monteAperto, setMonteAperto] = useState(false);

  const { caller, friend } = schieramenti(state);
  const punti = puntiCorrenti(state);
  const numeroPresa = Math.min(state.completedTricks.length + 1, session.config.tricks);

  // I posti si fissano a inizio smazzata e non cambiano piu': in basso resta
  // sempre il punto di vista, gli altri gli girano attorno nell'ordine in cui
  // giocheranno. Chi tocca si vede dall'evidenza del turno, non dalla sedia.
  const posizioni = disposizione(session.config.players, session.puntoDiVista);
  const postoDi = (posizione: Posizione): number => posizioni.indexOf(posizione);

  // Contro i bot sotto c'e' sempre la mano di chi gioca davvero: le carte
  // restano in vista anche mentre pensano gli altri, solo spente. In hotseat
  // invece il telefono gira, quindi si mostra la mano di chi tocca.
  const chiMostra = session.umano ?? state.turn;
  const tocca = state.turn === chiMostra;

  // Le carte restano dove sono state sistemate a inizio smazzata: quelle
  // giocate spariscono e le altre si ricompattano, senza riordinarsi.
  const ordine = session.ordine[chiMostra] ?? [];
  const mano = secondoOrdine(state.hands[chiMostra] ?? [], ordine);
  const posti = postiDellaMano(mano);
  const legali = tocca ? legalPlaysFor(state, chiMostra) : [];
  const legaliIds = new Set(legali.map((carta) => carta.id));
  const obbligo = tocca ? obbligoCorrente(mano, legali, state) : null;

  // Chi puo' guardare il monte lo dice l'engine: nella colonna e nella chi se
  // la sente non lo vede nessuno, nemmeno chi ha dichiarato.
  const chiamata = chiamataDi(state);
  // Una speciale senza monte non ha niente da mostrare: nella variante amico
  // il bottone resta solo per la chiamata normale, che rivede le basi.
  const nienteDaVedere = chiamata !== null && state.monte.length === 0;
  const vedeIlMonte =
    caller === null || nienteDaVedere
      ? null
      : chiamata === null
        ? caller
        : chiVedeIlMonte(chiamata, caller);

  // E comunque solo a presa chiusa, quando tocca a lui. Contro i bot il
  // bottone esiste solo se a vedere il monte e' chi sta davanti allo schermo:
  // le carte dei bot non si guardano.
  const presaChiusa = state.currentTrick.plays.length === 0 && pause === null;
  const monteMio =
    vedeIlMonte !== null && (session.umano === null || vedeIlMonte === session.umano);
  const puoVedereMonte = monteMio && state.turn === vedeIlMonte && presaChiusa;

  // La carta che ha girato il trionfo resta scoperta per tutti fino alla fine,
  // qualunque cosa sia stata dichiarata. L'unica eccezione e' la chiamata
  // normale: li' il monte se lo prende in mano il chiamante, e quello che
  // rimette da parte e' tutto coperto, carta del trionfo compresa.
  const scopertaInTavola = chiamata === 'normale' ? null : session.scoperta;
  const coperteInTavola = state.monte.filter((carta) => carta.id !== scopertaInTavola?.id);

  // La carta chiamata sta in tavola dall'annuncio alla fine, scoperta per
  // tutti: e' la sola cosa che il chiamante dice ad alta voce. Chi ce l'ha in
  // mano lo sa perche' se la vede fra le proprie carte, e nient'altro qui lo
  // lascia capire.
  const annunciata = cartaChiamata(state);

  // A carte scoperte le mani degli altri si guardano, ordinate come le
  // ordinerebbe il gioco. E' roba per gli occhi soltanto: i bot ricevono la
  // loro VistaDelBot come sempre e da qui non passa niente.
  const spia = session.carteScoperte && session.umano !== null;
  const spiate = (seat: number): CartaEngine[] | null =>
    spia && seat !== session.umano ? ordinaCarte(state.hands[seat] ?? [], state.trump) : null;
  // Nell amico l'ultimo segreto e' chi tiene la carta chiamata: il resto del
  // tavolo lo sa dall'annuncio.
  const chiHaLAmico =
    spia && annunciata !== null && friend === null
      ? chiTieneLaCarta(state.hands, annunciata.id)
      : null;

  const inTavola = pause !== null ? pause.cards : state.currentTrick.plays;

  // Due avvisi brevi su una riga sola: il tavolo ha bisogno dell'altezza.
  const noteMonte = [
    chiamata === 'sola' ? 'nella sola non si scambia' : null,
    puoVedereMonte ? null : 'visibile al chiamante a presa chiusa',
  ].filter((nota): nota is string => nota !== null);

  return (
    <section className="schermata tavolo">
      <StatusLine state={state} />

      <header className="intestazione">
        <span>
          trionfo{' '}
          <strong className={SEMI[state.trump].classe}>
            <SuitIcon suit={state.trump} size="riga" /> {state.trump}
          </strong>
        </span>
        <span>
          presa {numeroPresa} di {session.config.tricks}
        </span>
        {/* Acceso, l'interruttore e' anche l'avviso: sta sempre in cima e si
            legge da lontano, cosi' non ci si dimentica di star guardando le
            carte degli altri. */}
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

      {caller === null && (
        <div className="banner banner-liscio">LISCIO — perde chi fa piu punti</div>
      )}
      {friend !== null && (
        <div className="banner banner-amico">AMICO SCOPERTO: {nomeGiocatore(friend)}</div>
      )}

      <div className={spia ? 'tavolo-scena tavolo-spiato' : 'tavolo-scena'}>
        <div className="lato lato-sinistro">
          <Posto
            seat={postoDi('sinistra-2')}
            posizione="sinistra-2"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('sinistra-2'))}
          />
          <Posto
            seat={postoDi('sinistra-1')}
            posizione="sinistra-1"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('sinistra-1'))}
          />
        </div>

        <div className="fila-alto">
          {state.monte.length > 0 && (
            <MonteInTavola
              scoperta={scopertaInTavola}
              coperte={coperteInTavola}
              spiate={spia}
            />
          )}
          {annunciata !== null && <CartaChiamata carta={annunciata} chiLaTiene={chiHaLAmico} />}
          <Posto
            seat={postoDi('alto')}
            posizione="alto"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('alto'))}
          />
        </div>

        <div className="tavolo-centro">
          {inTavola.length === 0 && (
            <p className="nota nota-centro">
              apre <PlayerName seat={state.turn} state={state} />
            </p>
          )}

          {/* Le carte giocate si raccolgono verso il vincitore prima di sparire. */}
          <div
            className={
              pause === null || !pause.raccolta
                ? 'giocate'
                : `giocate giocate-raccolta raccolta-${posizioni[pause.winner] ?? 'basso'}`
            }
          >
            {inTavola.map((giocata) => (
              <div
                key={giocata.card.id}
                className={[
                  'giocata',
                  `giocata-da-${posizioni[giocata.player] ?? 'basso'}`,
                  pause !== null && giocata.player === pause.winner ? 'giocata-vince' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ '--pendenza': `${inclinazione(giocata.card.id)}deg` } as CSSProperties}
              >
                <Card card={giocata.card} size="piccola" />
              </div>
            ))}
          </div>
        </div>

        <div className="lato lato-destro">
          <Posto
            seat={postoDi('destra-2')}
            posizione="destra-2"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('destra-2'))}
          />
          <Posto
            seat={postoDi('destra-1')}
            posizione="destra-1"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('destra-1'))}
          />
        </div>

        <div className="fila-basso">
          <Posto
            seat={postoDi('basso')}
            posizione="basso"
            state={state}
            punti={punti}
            spiate={spiate(postoDi('basso'))}
          />
        </div>

        {/* L annuncio dura un attimo: si appoggia sopra il tavolo invece di
            aprirsi una riga tutta sua, che spingerebbe giu' la mano. */}
        {pause !== null && (
          <div className="banner banner-presa">
            presa a <PlayerName seat={pause.winner} state={state} /> per {pause.points} punti
          </div>
        )}
      </div>

      {monteMio && (
        <div className="riga-bottoni">
          <button
            type="button"
            className="bottone-piccolo"
            disabled={!puoVedereMonte}
            onClick={() => setMonteAperto(true)}
          >
            {friend === null ? 'Vedi il monte' : 'Vedi il monte e le basi'}
          </button>
          {noteMonte.length > 0 && <span className="nota nota-monte">{noteMonte.join(' · ')}</span>}
        </div>
      )}

      <div className="zona-mano">
        {/* Contro i bot la mano e' sempre la propria: non c'e' nessun telefono
            da passare, si aspetta e basta. In hotseat invece si dice a chi
            tocca, perche' lo schermo cambia proprietario a ogni giocata. */}
        <p className="riga-mano">
          {session.umano !== null ? (
            tocca ? (
              'la tua mano'
            ) : (
              <>
                sta giocando <PlayerName seat={state.turn} state={state} />
              </>
            )
          ) : state.turn === session.puntoDiVista ? (
            'la tua mano'
          ) : (
            <>
              mano di <PlayerName seat={state.turn} state={state} /> — passa il telefono
            </>
          )}
        </p>
        {/* Due file sempre: la larghezza delle carte la decide il numero di
            carte iniziali, quindi non balla mentre la mano si svuota. */}
        <div
          className="mano mano-a-file"
          // La misura della carta nasce dalle carte iniziali e non cambia piu'.
          style={{ '--per-fila': cartePerFila(ordine.length) } as CSSProperties}
        >
          {posti.map(({ carta, riga, scarto }) => {
            const giocabile = legaliIds.has(carta.id) && pause === null;
            return (
              <div
                key={carta.id}
                className="posto-carta"
                style={{ '--riga': riga, '--scarto': scarto } as CSSProperties}
              >
                <Card
                  card={carta}
                  disabled={!giocabile}
                  // Mentre pensa un altro non c'e' nessun motivo da spiegare:
                  // non e' la carta a essere sbagliata, e' il turno.
                  motivo={
                    !tocca || legaliIds.has(carta.id)
                      ? undefined
                      : motivoNonGiocabile(carta, legali, state)
                  }
                  onClick={(scelta) => onGioca(scelta.id)}
                />
              </div>
            );
          })}
        </div>
        {obbligo !== null && <p className="obbligo">{obbligo}</p>}
      </div>

      {monteAperto && caller !== null && (
        <ModaleMonte state={state} onChiudi={() => setMonteAperto(false)} />
      )}
    </section>
  );
}

interface PostoProps {
  /** -1 quando quel posto del tavolo non e' occupato: a tre nessuno sta in alto. */
  seat: number;
  posizione: Posizione;
  state: HandState;
  punti: number[];
  /** Le sue carte, quando si gioca a carte scoperte. Null: solo il mazzetto. */
  spiate: CartaEngine[] | null;
}

/**
 * Un posto a tavola: nome, quante carte gli restano e a che punto sta. Chi e'
 * di turno si riconosce dal bordo acceso, non solo dal fatto che sta in basso.
 */
function Posto({ seat, posizione, state, punti, spiate }: PostoProps): ReactElement | null {
  if (seat < 0) return null;

  const diTurno = seat === state.turn;
  const carte = state.hands[seat]?.length ?? 0;
  const diLato = eDiLato(posizione);

  return (
    <div
      className={`posto-tavolo posto-${posizione}${diTurno ? ' posto-turno' : ''}`}
      aria-current={diTurno ? 'true' : undefined}
    >
      <span className="posto-nome">
        <PlayerName seat={seat} state={state} />
      </span>
      {spiate === null ? (
        <Dorsi quante={carte} verticale={diLato} />
      ) : (
        <ManoSpiata carte={spiate} posizione={posizione} players={state.config.players} />
      )}
      <span className="posto-punti">{punti[seat] ?? 0}</span>
    </div>
  );
}

/**
 * Le carte di un bot, scoperte accanto al suo posto. Restano larghe abbastanza
 * da riconoscersi: quando non ci starebbero tutte si accavallano a ventaglio,
 * come una mano tenuta stretta, invece di rimpicciolirsi fino a sparire.
 */
function ManoSpiata({
  carte,
  posizione,
  players,
}: {
  carte: CartaEngine[];
  posizione: Posizione;
  players: number;
}): ReactElement {
  const { larghezza, ingombro, passo, inColonna } = ventaglioDelPosto(
    posizione,
    players,
    carte.length,
  );

  return (
    <span
      className={inColonna ? 'mano-spiata mano-spiata-in-colonna' : 'mano-spiata'}
      style={
        {
          '--larghezza-spiata': `${larghezza}px`,
          '--ingombro-spiato': `${ingombro}px`,
          '--passo-spiato': `${passo}px`,
        } as CSSProperties
      }
    >
      {carte.map((carta) => (
        <Card key={carta.id} card={carta} />
      ))}
    </span>
  );
}

/** Le carte che restano in mano a un altro: si contano, non si guardano. */
function Dorsi({ quante, verticale }: { quante: number; verticale: boolean }): ReactElement {
  return (
    <span
      className={verticale ? 'dorsi dorsi-in-colonna' : 'dorsi'}
      aria-label={`${quante} carte in mano`}
    >
      {Array.from({ length: quante }, (_, i) => (
        <span key={i} className="dorso" style={{ backgroundImage: `url(${DORSO})` }} />
      ))}
    </span>
  );
}

/**
 * Il monte sul tavolo: sta in cima, fuori dal giro delle carte giocate e
 * dentro un riquadro tratteggiato suo, cosi' non lo si scambia mai per una
 * giocata. La carta che ha girato il trionfo resta scoperta li' per tutta la
 * smazzata; le altre si contano soltanto.
 */
function MonteInTavola({
  scoperta,
  coperte,
  spiate,
}: {
  scoperta: CartaEngine | null;
  coperte: CartaEngine[];
  /** A carte scoperte anche il monte del chiamante si guarda. */
  spiate: boolean;
}): ReactElement {
  const conteggio = `${coperte.length} ${coperte.length === 1 ? 'carta coperta' : 'carte coperte'}`;

  return (
    <div className="tavolo-riquadro">
      <span className="riquadro-etichetta">monte</span>

      {coperte.length > 0 && (
        <span className="riquadro-parte" aria-label={spiate ? 'monte scoperto' : conteggio}>
          {spiate ? (
            <span className="monte-spiato">
              {coperte.map((carta) => (
                <Card key={carta.id} card={carta} />
              ))}
            </span>
          ) : (
            <span className="dorsi">
              {coperte.map((carta) => (
                <span
                  key={carta.id}
                  className="dorso"
                  style={{ backgroundImage: `url(${DORSO})` }}
                />
              ))}
            </span>
          )}
          <span className="monte-conteggio">{spiate ? 'sotto il monte' : conteggio}</span>
        </span>
      )}

      {scoperta !== null && (
        <span className="riquadro-parte">
          <Card card={scoperta} size="piccola" />
          <span className="riquadro-etichetta">trionfo</span>
        </span>
      )}
    </div>
  );
}

/**
 * La carta chiamata, scoperta in cima al tavolo dall'annuncio fino alla fine.
 * Sta accanto al monte perche' e' della stessa natura: roba del tavolo, non
 * di un giocatore. Qui non compare mai chi la tiene in mano, nemmeno dopo che
 * l'amico si e' scoperto: a dirlo ci pensa il banner, come ha sempre fatto.
 */
function CartaChiamata({
  carta,
  chiLaTiene,
}: {
  carta: CartaEngine;
  /** Solo a carte scoperte: al tavolo chi ha l amico non lo sa nessuno. */
  chiLaTiene: number | null;
}): ReactElement {
  return (
    <div className="tavolo-riquadro">
      <span className="riquadro-parte">
        <Card card={carta} size="piccola" />
        <span className="riquadro-etichetta">carta chiamata</span>
        {chiLaTiene !== null && (
          <span className="monte-conteggio">in mano a {nomeGiocatore(chiLaTiene)}</span>
        )}
      </span>
    </div>
  );
}

interface ModaleProps {
  state: HandState;
  onChiudi: () => void;
}

function ModaleMonte({ state, onChiudi }: ModaleProps): ReactElement {
  const { friend, conIlChiamante } = schieramenti(state);
  const basi = state.completedTricks.filter((presa) => conIlChiamante.includes(presa.winner));
  const puntiBasi = basi.reduce((somma, presa) => somma + presa.points, 0);

  return (
    <div className="modale" role="dialog">
      <div className="modale-contenuto">
        <h3>il monte</h3>
        {state.monte.length === 0 ? (
          <p className="nota">in questa variante non c e monte</p>
        ) : (
          <div className="mano mano-larga">
            {/* Anche il monte si guarda come una mano: stesso ordine, cosi' si
                capisce al volo cosa c'era sotto. */}
            {ordinaCarte(state.monte, state.trump).map((carta) => (
              <Card key={carta.id} card={carta} size="piccola" />
            ))}
          </div>
        )}

        <h3>
          basi {friend === null ? 'del chiamante' : 'della coppia'}: {basi.length} prese,{' '}
          {puntiBasi} punti
        </h3>
        <div className="basi">
          {basi.map((presa, indice) => (
            <div key={indice} className="base">
              <span className="giocata-nome">
                <PlayerName seat={presa.winner} state={state} compatto /> · {presa.points}
              </span>
              <div className="mano">
                {presa.cards.map((giocata) => (
                  <Card key={giocata.card.id} card={giocata.card} size="piccola" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="bottone-grande" onClick={onChiudi}>
          Chiudi
        </button>
      </div>
    </div>
  );
}
