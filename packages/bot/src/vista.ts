import type {
  Alliance,
  Card,
  CompletedTrick,
  HandState,
  PlayerId,
  Suit,
  TableConfig,
  Trick,
} from '@mediatore/engine';
import { chiVedeIlMonte, isAllyFor, legalPlaysFor } from '@mediatore/engine';

/**
 * Tutto quello che un giocatore vede stando seduto al tavolo, e nient'altro.
 *
 * Le mani degli altri non compaiono qui e non ci devono comparire mai: un bot
 * che sbircia gioca in un modo che al tavolo si riconosce subito. Per questo
 * la vista non e' un HandState alleggerito ma un tipo suo, e il bot riceve
 * solo questo: le carte altrui non gli sono proprio raggiungibili.
 */
export interface VistaDelBot {
  io: PlayerId;
  config: TableConfig;
  trump: Suit;
  /** Chi ha chiamato e come: si dice a voce alta prima di giocare. */
  alliance: Alliance;
  mano: readonly Card[];
  /** Le mosse consentite, gia' filtrate dall'engine. */
  legali: readonly Card[];
  presaInCorso: Trick;
  preseCompletate: readonly CompletedTrick[];
  /** Quante carte restano a ciascuno: si contano guardando i mazzetti. */
  carteInMano: readonly number[];
  /** Il monte solo a chi le regole lasciano guardarlo, altrimenti vuoto. */
  monteVisibile: readonly Card[];
  /** Quante carte coperte ci sono nel monte: quello lo vedono tutti. */
  monteCoperto: number;
  /** I punti si contano a voce alta presa per presa: li sa tutto il tavolo. */
  progression: readonly (readonly number[])[];
}

/**
 * Chi ha diritto di sapere cosa c'e' nel monte. Nella chiamata normale il
 * chiamante quelle carte le ha scartate lui, nella sola gli e' concesso di
 * guardarle: in tutti e due i casi le sa. Per gli altri, e nelle dichiarazioni
 * che lasciano il monte coperto, restano carte ignote come quelle in mano.
 */
function monteAllaPortata(alliance: Alliance, io: PlayerId): boolean {
  if (alliance.kind !== 'monte') return false;
  return chiVedeIlMonte(alliance.chiamata, alliance.caller) === io;
}

/**
 * Il filtro fra il gioco e il bot: da qui in poi le mani altrui non esistono.
 */
export function vistaDaStato(state: HandState, io: PlayerId): VistaDelBot {
  return {
    io,
    config: state.config,
    trump: state.trump,
    alliance: state.alliance,
    mano: [...(state.hands[io] ?? [])],
    legali: legalPlaysFor(state, io),
    presaInCorso: {
      leader: state.currentTrick.leader,
      trump: state.currentTrick.trump,
      plays: state.currentTrick.plays.map((play) => ({ ...play })),
    },
    preseCompletate: state.completedTricks,
    carteInMano: state.hands.map((mano) => mano.length),
    monteVisibile: monteAllaPortata(state.alliance, io) ? [...state.monte] : [],
    monteCoperto: state.monte.length,
    progression: state.progression,
  };
}

export function sonoIlChiamante(vista: VistaDelBot): boolean {
  return vista.alliance.kind !== 'liscio' && vista.alliance.caller === vista.io;
}

/**
 * Chi gioca dalla mia parte. Nell'amico c'e' una cosa che l'engine non puo'
 * sapere e io si': se ho in mano la carta chiamata sono l'amico, e quindi sto
 * col chiamante anche prima di scoprirmi. E' esattamente quello che sa il
 * giocatore vero, quindi il bot lo puo' usare.
 */
export function alleatoDi(vista: VistaDelBot, altro: PlayerId): boolean {
  if (altro === vista.io) return true;
  const { alliance } = vista;
  if (alliance.kind === 'amico' && alliance.friend === null) {
    const sonoLAmico = vista.mano.some((carta) => carta.id === alliance.calledCard);
    if (sonoLAmico) return altro === alliance.caller;
  }
  return isAllyFor(alliance)(vista.io, altro);
}

/** I punti che un posto ha gia' portato a casa: si contano dopo ogni presa. */
export function puntiDi(vista: VistaDelBot, seat: PlayerId): number {
  const riga = vista.progression[seat];
  if (riga === undefined) return 0;
  return riga[riga.length - 1] ?? 0;
}

/** I punti della mia parte: da solo o in coppia, e' quello che conta. */
export function puntiDeiMiei(vista: VistaDelBot): number {
  let somma = 0;
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (alleatoDi(vista, seat)) somma += puntiDi(vista, seat);
  }
  return somma;
}

export function preseRimaste(vista: VistaDelBot): number {
  return vista.config.tricks - vista.preseCompletate.length;
}
