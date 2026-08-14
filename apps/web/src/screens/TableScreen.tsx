import type { Card as CartaEngine, HandState } from '@mediatore/engine';
import { chiVedeIlMonte, legalPlaysFor, totalPoints } from '@mediatore/engine';
import type { CSSProperties, ReactElement } from 'react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { IntestazioneTavolo } from '../components/IntestazioneTavolo';
import { PlayerName } from '../components/PlayerName';
import { StatusLine } from '../components/StatusLine';
import { MonteScopertoInTavola, chiSiPrendeIlMonte } from '../components/MonteScopertoInTavola';
import { MonteInTavola, PostoTavolo } from '../components/Tavolo';
import { chiamataDi } from '../chiamate';
import { motivoNonGiocabile, nomeGiocatore, obbligoCorrente, puntiCorrenti } from '../labels';
import { cartePerFila, eFilaUnica, postiDellaMano } from '../mano';
import { ordinaCarte, secondoOrdine } from '../ordine';
import type { Posizione } from '../posti';
import { disposizione, inclinazione, sfalsoNelMazzetto } from '../posti';
import type { Livello } from '../livello';
import { conAiuti } from '../livello';
import { basiDellaSquadra, cartaChiamata, schieramenti } from '../roles';
import { chiTieneLaCarta } from '../spia';
import { contaTrionfi } from '../trionfo';
import type { Session, TrickPause } from '../useHand';

interface Props {
  session: Session;
  state: HandState;
  pause: TrickPause | null;
  onGioca: (cardId: string) => void;
  onCarteScoperte: (acceso: boolean) => void;
  onLivello: (livello: Livello) => void;
}

export function TableScreen({
  session,
  state,
  pause,
  onGioca,
  onCarteScoperte,
  onLivello,
}: Props): ReactElement {
  const [monteAperto, setMonteAperto] = useState(false);
  const [basiAperte, setBasiAperte] = useState(false);
  // A smazzata chiusa il monte si scopre al centro, il tempo di guardarlo:
  // il mucchietto coperto in cima e il bottone per vederlo non servono piu'.
  const scopreIlMonte = session.phase === 'monte';

  const { caller, friend } = schieramenti(state);
  const punti = puntiCorrenti(state);
  const numeroBase = Math.min(state.completedTricks.length + 1, session.config.tricks);

  // Gli aiuti del principiante: i punti di tutti a vista e il conto dei
  // trionfi. Da esperto il tavolo tace e i conti li tiene chi gioca.
  const aiuti = conAiuti(session.livello);

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
  // Le carte per fila si fissano sulle carte di partenza: da loro esce la
  // larghezza della carta, e fin dove le rimaste ci stanno su una fila sola.
  const perFila = cartePerFila(ordine.length);
  const posti = postiDellaMano(mano, perFila);
  const legali = tocca ? legalPlaysFor(state, chiMostra) : [];
  const legaliIds = new Set(legali.map((carta) => carta.id));
  const obbligo = tocca ? obbligoCorrente(mano, legali, state) : null;

  // Chi puo' guardare il monte lo dice l'engine: nella colonna e nella chi se
  // la sente non lo vede nessuno, nemmeno chi ha dichiarato.
  const chiamata = chiamataDi(state);
  // Una speciale senza monte non ha niente da mostrare: il bottone del
  // monte sparisce, le basi si guardano dall'altro.
  const nienteDaVedere = chiamata !== null && state.monte.length === 0;
  const vedeIlMonte =
    caller === null || nienteDaVedere
      ? null
      : chiamata === null
        ? caller
        : chiVedeIlMonte(chiamata, caller);

  // E comunque solo a base chiusa, quando tocca a lui. Contro i bot il
  // bottone esiste solo se a vedere il monte e' chi sta davanti allo schermo:
  // le carte dei bot non si guardano.
  const baseChiusa = state.currentTrick.plays.length === 0 && pause === null;
  const monteMio =
    vedeIlMonte !== null && (session.umano === null || vedeIlMonte === session.umano);
  const puoVedereMonte = monteMio && state.turn === vedeIlMonte && baseChiusa;

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

  const preso = chiSiPrendeIlMonte(state);
  const carteDelMonte = ordinaCarte(state.monte, state.trump).map((card) => ({
    player: preso ?? 0,
    card,
  }));
  const inTavola = scopreIlMonte
    ? pause?.eIlMonte === true
      ? pause.cards
      : carteDelMonte
    : pause !== null
      ? pause.cards
      : state.currentTrick.plays;

  // Ogni sedia del tavolo si monta allo stesso modo: qui dentro si guarda chi
  // ci sta seduto, fuori resta solo la pianta del tavolo.
  const sedia = (posizione: Posizione): ReactElement | null => {
    const seat = postoDi(posizione);
    return (
      <PostoTavolo
        seat={seat}
        posizione={posizione}
        state={state}
        carte={state.hands[seat]?.length ?? 0}
        diTurno={seat === state.turn}
        // Chi ha dato le carte resta segnato da un pallino: si gioca sapendo
        // da dove e' partito il giro, e col mazziere che ruota cambia posto.
        cartaro={seat === state.dealer}
        punti={aiuti ? (punti[seat] ?? 0) : null}
        spiate={spiate(seat)}
        players={session.config.players}
      />
    );
  };

  // Due avvisi brevi su una riga sola: il tavolo ha bisogno dell'altezza.
  const noteMonte = [
    chiamata === 'sola' ? 'nella sola non si scambia' : null,
    puoVedereMonte ? null : 'visibile al chiamante a base chiusa',
  ].filter((nota): nota is string => nota !== null);

  return (
    <section className="schermata tavolo">
      <StatusLine state={state} aiuti={aiuti} />

      <IntestazioneTavolo
        session={session}
        basi={scopreIlMonte ? 'il monte' : `base ${numeroBase} di ${session.config.tricks}`}
        extra={aiuti ? <ContoDeiTrionfi state={state} seat={chiMostra} /> : undefined}
        onCarteScoperte={onCarteScoperte}
        onLivello={onLivello}
      />

      {/* Il liscio lo dice la riga di stato in cima, che e' dove si guarda per
          sapere come si sta giocando: qui sopra il tavolo era la stessa frase
          due volte, e rubava una striscia di altezza alle carte. */}
      <div className={spia ? 'tavolo-scena tavolo-spiato' : 'tavolo-scena'}>
        <div className="lato lato-sinistro">
          {sedia('sinistra-2')}
          {sedia('sinistra-1')}
        </div>

        <div className="fila-alto">
          {/* Appena qualcuno chiama, quelle carte se le e' prese lui: il
              riquadro in cima farebbe credere che ci sia ancora un monte
              da prendere. Nel liscio non se l'e' preso nessuno, e resta. */}
          {!scopreIlMonte && caller === null && state.monte.length > 0 && (
            <MonteInTavola
              scoperta={scopertaInTavola}
              coperte={coperteInTavola}
              spiate={spia}
            />
          )}
          {annunciata !== null && <CartaChiamata carta={annunciata} chiLaTiene={chiHaLAmico} />}
          {sedia('alto')}
        </div>

        {/* Il centro resta vuoto finche' non parte la prima carta: chi apre lo
            dice gia' il bordo acceso attorno al suo posto, e qui in mezzo lo
            spazio serve alle giocate. Vuoto non si affloscia: il pavimento del
            centro e' alto `--centro` comunque, cosi' le carte non fanno saltare
            il tavolo quando arrivano. */}
        <div className="tavolo-centro">
          {scopreIlMonte && (pause === null || !pause.raccolta) && (
            <MonteScopertoInTavola
              monte={state.monte}
              trump={state.trump}
              state={state}
              preso={preso}
              nascondiCarte
            />
          )}
          {/* Le carte giocate si raccolgono verso il vincitore prima di sparire.
              Il monte usa la stessa raccolta: sta fermo in mezzo, poi si
              stringe in un mazzetto e scivola verso chi ha vinto l'ultima base. */}
          <div
            className={
              pause === null || !pause.raccolta
                ? 'giocate'
                : `giocate giocate-raccolta raccolta-${posizioni[pause.winner] ?? 'basso'}`
            }
          >
            {inTavola.map((giocata, indice) => {
              const sfalso = sfalsoNelMazzetto(giocata.card.id);
              const dalMonte = scopreIlMonte || pause?.eIlMonte === true;
              return (
                <div
                  key={giocata.card.id}
                  className={[
                    'giocata',
                    dalMonte ? 'giocata-dal-monte' : `giocata-da-${posizioni[giocata.player] ?? 'basso'}`,
                    pause !== null &&
                    (dalMonte
                      ? pause.raccolta && indice === inTavola.length - 1
                      : giocata.player === pause.winner)
                      ? 'giocata-vince'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    {
                      '--pendenza': `${inclinazione(giocata.card.id)}deg`,
                      '--sfalso-x': `${sfalso.x}px`,
                      '--sfalso-y': `${sfalso.y}px`,
                      '--monte-x': `${scartoDelMonte(indice, inTavola.length)}px`,
                    } as CSSProperties
                  }
                >
                  <Card card={giocata.card} size="piccola" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="lato lato-destro">
          {sedia('destra-2')}
          {sedia('destra-1')}
        </div>

        <div className="fila-basso">{sedia('basso')}</div>

        {/* L annuncio dura un attimo: si appoggia sopra il tavolo invece di
            aprirsi una riga tutta sua, che spingerebbe giu' la mano. */}
        {pause !== null && pause.eIlMonte !== true && (
          <div className="banner banner-base">
            base a <PlayerName seat={pause.winner} state={state} /> per {pause.points} punti
          </div>
        )}
      </div>

      {!scopreIlMonte && (
        <div className="riga-sguardi">
          <div className="sguardo-monte">
            {monteMio && (
              <>
                <button
                  type="button"
                  className="bottone-piccolo"
                  disabled={!puoVedereMonte}
                  onClick={() => {
                    setBasiAperte(false);
                    setMonteAperto(true);
                  }}
                >
                  Monte
                </button>
                {noteMonte.length > 0 && (
                  <span className="nota nota-monte">{noteMonte.join(' · ')}</span>
                )}
              </>
            )}
          </div>
          <div className="sguardo-basi">
            <button
              type="button"
              className="bottone-piccolo"
              disabled={!baseChiusa}
              onClick={() => {
                setMonteAperto(false);
                setBasiAperte(true);
              }}
            >
              Basi
            </button>
          </div>
        </div>
      )}

      <div className="zona-mano">
        {/* Contro i bot la mano e' sempre la propria: non c'e' nessun telefono
            da passare, si aspetta e basta. In hotseat invece si dice a chi
            tocca, perche' lo schermo cambia proprietario a ogni giocata. */}
        <p className="riga-mano">
          {scopreIlMonte
            ? session.umano !== null
              ? 'la tua mano'
              : `mano di ${nomeGiocatore(chiMostra)}`
            : session.umano !== null ? (
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
        {/* Due file finche' le carte sono tante, una sola da quando ci stanno
            tutte in fila. La larghezza delle carte la decide il numero di carte
            iniziali, quindi non balla mentre la mano si svuota. */}
        <div
          className={
            eFilaUnica(mano.length, perFila)
              ? 'mano mano-a-file mano-a-fila-unica'
              : 'mano mano-a-file'
          }
          // La misura della carta nasce dalle carte iniziali e non cambia piu'.
          style={{ '--per-fila': perFila } as CSSProperties}
        >
          {posti.map(({ carta, riga, scarto }) => {
            const giocabile = !scopreIlMonte && legaliIds.has(carta.id) && pause === null;
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
        {/* La riga dell'obbligo c'e' sempre, anche quando non ha niente da
            dire: se comparisse solo al bisogno quei quindici pixel li cederebbe
            il centro del tavolo, e il tavolo si accorcerebbe proprio mentre si
            guardano le carte per scegliere. Vuota resta invisibile, e allora
            non la legge nemmeno lo schermo che parla. */}
        <p className={obbligo === null ? 'obbligo obbligo-in-attesa' : 'obbligo'}>
          {obbligo ?? '\u00a0'}
        </p>
      </div>

      {monteAperto && caller !== null && (
        <ModaleMonte state={state} onChiudi={() => setMonteAperto(false)} />
      )}
      {basiAperte && (
        <ModaleBasi state={state} seat={chiMostra} onChiudi={() => setBasiAperte(false)} />
      )}
    </section>
  );
}

/**
 * Quanto scarta dal centro una carta del monte, in fila. Poche decine di
 * pixel: abbastanza da leggerle tutte, poco abbastanza che cinque ci stiano
 * in mezzo al tavolo. La raccolta le riporta poi tutte nello stesso punto.
 */
function scartoDelMonte(indice: number, quante: number): number {
  return (indice - (quante - 1) / 2) * 28;
}

/**
 * Il conto dei trionfi, l'aiuto del principiante: quanti sono passati e quanti
 * ne girano ancora. Quanti, mai dove: dove stanno e' il mestiere di chi gioca.
 */
function ContoDeiTrionfi({ state, seat }: { state: HandState; seat: number }): ReactElement {
  const { usciti, inGiro } = contaTrionfi(state, seat);
  return (
    <span className="conto-trionfi">
      trionfi: {usciti} usciti, {inGiro} in giro
    </span>
  );
}

/**
 * La carta chiamata, scoperta in cima al tavolo dall'annuncio fino alla fine.
 * Sta accanto al monte perche' e' della stessa natura: roba del tavolo, non
 * di un giocatore. Qui non compare mai chi la tiene in mano, nemmeno dopo che
 * l'amico si e' scoperto: a dirlo ci pensa l'oro con la scritta AMICO accanto
 * al suo nome, che e' il posto giusto.
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
  // Stesso conto dell'engine quando assegna il monte: i punti delle carte
  // piu uno della base. Nella colonna e nella chi se la sente questa
  // finestra non si apre: li' il monte non lo vede nessuno.
  const puntiDelleCarte = totalPoints(state.monte);
  const valore = puntiDelleCarte + 1;

  return (
    <div className="modale" role="dialog">
      <div className="modale-contenuto">
        <h3>{state.monte.length === 0 ? 'Monte' : `Monte: ${valore} punti`}</h3>
        {state.monte.length === 0 ? (
          <p className="nota">in questa variante non c e monte</p>
        ) : (
          <>
            <div className="mano mano-larga">
              {/* Anche il monte si guarda come una mano: stesso ordine, cosi' si
                  capisce al volo cosa c'era sotto. */}
              {ordinaCarte(state.monte, state.trump).map((carta) => (
                <Card key={carta.id} card={carta} size="piccola" />
              ))}
            </div>
            <p className="nota">
              {valore}:{' '}
              {puntiDelleCarte === 0
                ? 'carte senza punti, piu 1 della base'
                : `${puntiDelleCarte} di carte piu 1 della base`}
            </p>
          </>
        )}

        <button type="button" className="bottone-grande" onClick={onChiudi}>
          Chiudi
        </button>
      </div>
    </div>
  );
}

function ModaleBasi({
  state,
  seat,
  onChiudi,
}: {
  state: HandState;
  seat: number;
  onChiudi: () => void;
}): ReactElement {
  const basi = basiDellaSquadra(state, seat);
  const puntiBasi = basi.reduce((somma, base) => somma + base.points, 0);

  return (
    <div className="modale" role="dialog">
      <div className="modale-contenuto">
        <h3>
          Basi: {basi.length}, {puntiBasi} punti
        </h3>
        {basi.length === 0 ? (
          <p className="nota">nessuna base ancora</p>
        ) : (
          <div className="basi">
            {basi.map((base, indice) => (
              <div key={indice} className="base">
                <span className="giocata-nome">
                  <PlayerName seat={base.winner} state={state} compatto /> · {base.points}
                </span>
                <div className="mano">
                  {base.cards.map((giocata) => (
                    <Card key={giocata.card.id} card={giocata.card} size="piccola" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="bottone-grande" onClick={onChiudi}>
          Chiudi
        </button>
      </div>
    </div>
  );
}
