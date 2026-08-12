import type { Card as CartaEngine, HandState } from '@mediatore/engine';
import type { CSSProperties, ReactElement } from 'react';
import { Card } from './Card';
import { PlayerName } from './PlayerName';
import { DORSO } from '../carte/immagini';
import type { Posizione } from '../posti';
import { eDiLato } from '../posti';
import { ventaglioDelPosto } from '../spia';

/**
 * I pezzi del tavolo che si vedono uguali prima e durante il gioco: i posti
 * attorno, i mazzetti coperti, il monte in cima. La distribuzione e la
 * chiamata li usano senza avere ancora una smazzata da mostrare, il gioco li
 * usa quando c'e' anche uno stato; per questo qui dentro non si entra mai a
 * chiedere niente all'engine, si riceve tutto gia' pronto.
 */

interface PostoProps {
  /** -1 quando quel posto del tavolo non e' occupato: a tre nessuno sta in alto. */
  seat: number;
  posizione: Posizione;
  /** Serve solo al ruolo scritto accanto al nome: null finche' non si gioca. */
  state: HandState | null;
  /** Quante carte ha in mano adesso: durante la distribuzione crescono. */
  carte: number;
  diTurno: boolean;
  /** I punti fatti finora. Null prima che la smazzata cominci. */
  punti: number | null;
  /** Chi distribuisce, e solo mentre distribuisce: ruolo di un momento. */
  cartaro?: boolean;
  /** Ha chiamato, ma la smazzata non e' ancora cominciata: vedi PlayerName. */
  chiamante?: boolean;
  /** Le sue carte, quando si gioca a carte scoperte. Null: solo il mazzetto. */
  spiate: CartaEngine[] | null;
  players: number;
}

/**
 * Un posto a tavola: nome, quante carte gli restano e a che punto sta. Chi e'
 * di turno si riconosce dal bordo acceso, non solo dal fatto che sta in basso.
 */
export function PostoTavolo({
  seat,
  posizione,
  state,
  carte,
  diTurno,
  punti,
  cartaro = false,
  chiamante = false,
  spiate,
  players,
}: PostoProps): ReactElement | null {
  if (seat < 0) return null;

  const diLato = eDiLato(posizione);

  return (
    <div
      className={`posto-tavolo posto-${posizione}${diTurno ? ' posto-turno' : ''}`}
      aria-current={diTurno ? 'true' : undefined}
    >
      <span className="posto-nome">
        <PlayerName seat={seat} state={state} cartaro={cartaro} chiamante={chiamante} />
      </span>
      {spiate === null ? (
        <Dorsi quante={carte} verticale={diLato} />
      ) : (
        <ManoSpiata carte={spiate} posizione={posizione} players={players} />
      )}
      {punti !== null && <span className="posto-punti">{punti}</span>}
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
export function Dorsi({
  quante,
  verticale,
}: {
  quante: number;
  verticale: boolean;
}): ReactElement {
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
export function MonteInTavola({
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
