import type {
  Alliance,
  CallAction,
  CallState,
  Card,
  HandState,
  PlayedCard,
  Rng,
  Suit,
  TableConfig,
  Variant,
} from '@mediatore/engine';
import {
  applyCall,
  apreLaPrimaBase,
  callableCards,
  createCallState,
  createHandState,
  createRng,
  currentCaller,
  deal,
  discardToMonte,
  legalPlaysFor,
  nextSeat,
  playCard,
  scoreHand,
  serveScambioMonte,
  settle,
  settleChiSeLaSenteScaduto,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import { scegliCarta, scegliScarti, vistaDaStato } from '@mediatore/bot';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cartaDellAmico,
  decisioneDiChiamata,
  pausaCarta,
  pausaChiamata,
  pausaScarto,
} from './automa';
import { precaricaMazzo } from './carte/immagini';
import { CARTA_DISTRIBUITA_MS, carteDaDistribuire } from './distribuzione';
import { fissaNomiDelTavolo } from './labels';
import { pescaNomi } from './nomi';
import { ordineDiMano } from './ordine';
import * as registro from './registro';
import { cartaDelTrionfo } from './trionfo';

/**
 * La distribuzione e' una fase vera, non un timeout dentro un componente:
 * dura il tempo delle carte, una alla volta, e il tavolo si guarda mentre
 * arrivano. Finita, sullo stesso tavolo si chiama.
 */
export type Phase =
  | 'distribuzione'
  | 'call'
  | 'discard'
  /** Chi se la sente: gli avversari scelgono chi apre prima di giocare. */
  | 'apertura'
  | 'friend'
  | 'play'
  | 'end';

export interface Session {
  phase: Phase;
  config: TableConfig;
  dealer: number;
  /**
   * Da quale posto si guarda il tavolo. Si fissa quando nasce la smazzata e
   * non cambia piu' fino alla fine: al tavolo vero nessuno cambia sedia a
   * ogni giocata. E' solo visualizzazione, l'engine non lo vede nemmeno.
   * Col server sara' sempre l'utente collegato e sparira' da qui.
   */
  puntoDiVista: number;
  /**
   * Il posto dell'unica persona in carne e ossa, quando si gioca contro i
   * bot. Null in hotseat, dove sono tutti veri e il telefono gira.
   */
  umano: number | null;
  /**
   * Le mani di tutti scoperte a schermo. E' un attrezzo per vedere dove
   * sbagliano i bot, e vale solo per gli occhi di chi guarda: i bot
   * continuano a decidere dalla loro VistaDelBot, che le mani altrui non le
   * contiene nemmeno.
   */
  carteScoperte: boolean;
  /** Come si chiamano quelli seduti qui. Vuoto in hotseat: li' sono numeri. */
  nomi: string[];
  seed: number;
  trump: Suit;
  /**
   * La carta che scopre il trionfo, mostrata a tutti durante la chiamata.
   * Col monte e' l'ultima del monte, senza monte e' l'ultima carta del
   * mazziere: in quel caso resta comunque in mano sua, qui non la spostiamo.
   */
  scoperta: Card | null;
  hands: Card[][];
  /**
   * Quante carte sono gia' arrivate a tavola durante la distribuzione. Le
   * mani sono complete fin dall'inizio — le fa l'engine in un colpo solo —
   * ma a schermo si scoprono a una a una, e questo dice a che punto sta il
   * giro. Da qui in poi vale sempre quanto la mano intera.
   */
  distribuite: number;
  monte: Card[];
  call: CallState;
  state: HandState | null;
  /**
   * Ordine di sistemazione della mano di ogni giocatore, fissato una volta
   * sola quando nasce HandState. Vuoto prima di allora.
   */
  ordine: string[][];
  /**
   * Chi se la sente senza che nessuno si sia fatto avanti: la smazzata
   * finisce senza essere giocata, quindi non c'e' nessun HandState da contare.
   */
  scaduta: boolean;
}

export interface TrickPause {
  winner: number;
  points: number;
  cards: PlayedCard[];
  /** Le carte sono ancora ferme in tavola, oppure hanno gia' preso il volo. */
  raccolta: boolean;
}

/**
 * Quanto restano ferme e visibili le carte a presa completa. Chi chiude la
 * presa gioca la carta che decide chi vince: deve poterla guardare come tutte
 * le altre. Il conto parte da quando la carta e' comparsa a schermo, non da
 * quando e' stata giocata: per questo sta in un effetto, non nella giocata.
 */
const CARTE_FERME_MS = 1500;

/** Poi le carte volano verso chi ha vinto: va d accordo con la transizione CSS. */
const RACCOLTA_MS = 600;

/**
 * Quanto dura il conteggio finale prima che la smazzata dopo parta da sola.
 * Il tavolo non aspetta nessuno: sono il tempo di leggere le quote, non di
 * ripensarci, e non si allungano. Si tara solo da qui.
 */
export const SECONDI_PRIMA_DI_RIPARTIRE = 10;

/**
 * Il seed non si chiede piu' al giocatore, ma resta il modo per riprodurre
 * una smazzata segnalata: per questo finisce in console.
 */
function nuovoSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function messaggio(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}

/**
 * Il posto della persona vera quando si gioca contro i bot. E' sempre il
 * primo, e da li' si guarda il tavolo: nessuno cambia sedia a casa sua.
 */
const POSTO_DELL_UMANO = 0;

/**
 * Dal seed della smazzata escono anche la compagnia e le sue mosse, su due
 * sequenze separate: cosi' lo stesso seed rifa' lo stesso tavolo senza che
 * il numero di decisioni dei bot sposti le carte.
 */
const SEME_DEI_NOMI = 0x5eed_1;
const SEME_DELLE_MOSSE = 0x5eed_2;

function nuovaSessione(
  players: number,
  variant: Variant,
  seed: number,
  dealer: number,
  puntoDiVista: number,
  controBot: boolean,
  carteScoperte: boolean,
  // Chi era gia' seduto: la compagnia non cambia fra una smazzata e l'altra,
  // si cambia solo cambiando tavolo.
  giaSeduti: string[] = [],
): Session {
  const config = tableConfig(players, variant);
  const dealt = deal(config, dealer, createRng(seed));
  console.info(`smazzata seed=${seed}`);

  // Contro i bot il tavolo ha dei nomi, in hotseat restano i numeri: da qui
  // in poi nessuno schermo sa piu' che differenza ci sia.
  const nomi = !controBot
    ? []
    : giaSeduti.length === players
      ? giaSeduti
      : pescaNomi(players, createRng(seed ^ SEME_DEI_NOMI));
  fissaNomiDelTavolo(nomi);

  registro.apriSmazzata({
    seed,
    giocatori: players,
    variante: variant,
    mazziere: dealer,
    trionfo: dealt.trump,
    scoperta: cartaDelTrionfo(dealt, config, dealer),
    mani: dealt.hands,
    monte: dealt.monte,
    controBot,
    postoUmano: controBot ? POSTO_DELL_UMANO : null,
    // A carte scoperte si guarda solo contro i bot: in hotseat le carte
    // girano gia' per conto loro.
    carteScoperte: controBot && carteScoperte,
    nomi,
  });
  return {
    phase: 'distribuzione',
    config,
    dealer,
    // Se il tavolo si stringe, chi guardava da un posto che non c'e' piu'
    // torna al primo: capita solo cambiando tavolo, mai a smazzata avviata.
    puntoDiVista: controBot ? POSTO_DELL_UMANO : puntoDiVista < players ? puntoDiVista : 0,
    umano: controBot ? POSTO_DELL_UMANO : null,
    carteScoperte: controBot && carteScoperte,
    nomi,
    seed,
    trump: dealt.trump,
    scoperta: cartaDelTrionfo(dealt, config, dealer),
    hands: dealt.hands,
    distribuite: 0,
    monte: dealt.monte,
    call: createCallState(config, dealer),
    state: null,
    ordine: [],
    scaduta: false,
  };
}

/**
 * Chi apre la prima base non si decide qui: lo dice l'engine, che sa che
 * nella sola e nella colonna apre il chiamante ma a tre no, e che nella chi
 * se la sente apre l'avversario che si e' fatto avanti.
 */
function avviaGioco(
  sessione: Session,
  alliance: Alliance,
  sceltoDaAvversari: number | null = null,
): Session {
  const leader = apreLaPrimaBase({
    // Nel liscio non c'e' chiamante: con 'normale' conta solo il mazziere.
    chiamata: sessione.call.chiamata ?? 'normale',
    caller: sessione.call.caller ?? sessione.dealer,
    dealer: sessione.dealer,
    players: sessione.config.players,
    sceltoDaAvversari,
  });

  return {
    ...sessione,
    phase: 'play',
    state: createHandState({
      config: sessione.config,
      dealer: sessione.dealer,
      trump: sessione.trump,
      alliance,
      hands: sessione.hands,
      monte: sessione.monte,
      leader,
    }),
    // Le mani qui sono quelle definitive: per il chiamante col monte lo
    // scambio e' gia' avvenuto, quindi le carte prese entrano al posto giusto.
    ordine: sessione.hands.map((mano) => ordineDiMano(mano, sessione.trump)),
  };
}

export interface UseHand {
  session: Session | null;
  error: string | null;
  pause: TrickPause | null;
  /**
   * I secondi che restano prima che il tavolo riparta da solo. Vale solo a
   * smazzata finita: fuori da li' e' il conteggio pieno, mai mostrato.
   */
  secondiAllaRipartenza: number;
  start: (
    players: number,
    variant: Variant,
    puntoDiVista: number,
    controBot: boolean,
    carteScoperte: boolean,
  ) => void;
  /** Solo a smazzata finita: durante il gioco il tavolo non si tocca. */
  cambiaPuntoDiVista: (seat: number) => void;
  /** Scoprire e ricoprire le carte degli altri, anche a smazzata avviata. */
  cambiaCarteScoperte: (acceso: boolean) => void;
  /** Il giocatore va detto: le dichiarazioni speciali arrivano anche fuori turno. */
  decidi: (player: number, action: CallAction) => void;
  confermaScarti: (scarti: Card[]) => void;
  apre: (seat: number) => void;
  nessunoSeLaSente: () => void;
  scegliAmico: (card: Card) => void;
  gioca: (cardId: string) => void;
  ricomincia: () => void;
  chiudiErrore: () => void;
}

export function useHand(): UseHand {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pause, setPause] = useState<TrickPause | null>(null);
  const [secondiAllaRipartenza, setSecondiAllaRipartenza] = useState(
    SECONDI_PRIMA_DI_RIPARTIRE,
  );

  /**
   * Da quando la scelta e' davanti al giocatore. Riparte a ogni cambio di
   * situazione e a raccolta finita, cosi' l'attesa fra una presa e l'altra
   * non finisce nel tempo di chi deve giocare la carta dopo.
   */
  const daQuandoTocca = useRef(Date.now());
  useEffect(() => {
    daQuandoTocca.current = Date.now();
  }, [session, pause]);
  const quantoCiHaMesso = (): number => Date.now() - daQuandoTocca.current;

  /** Le mosse dei bot e le loro esitazioni escono tutte da qui. */
  const casoBot = useRef<Rng>(createRng(0));

  // Prima si guarda: tutte le carte ferme, il tavolo bloccato, il vincitore
  // in evidenza.
  useEffect(() => {
    if (pause === null || pause.raccolta) return undefined;
    const timer = setTimeout(() => {
      setPause((prev) => (prev === null ? null : { ...prev, raccolta: true }));
    }, CARTE_FERME_MS);
    return () => clearTimeout(timer);
  }, [pause]);

  // Poi si raccoglie, e solo a volo finito si passa alla presa dopo.
  useEffect(() => {
    if (pause === null || !pause.raccolta) return undefined;
    const timer = setTimeout(() => {
      setPause(null);
      setSession((prev) =>
        prev !== null && prev.state?.finished === true ? { ...prev, phase: 'end' } : prev,
      );
    }, RACCOLTA_MS);
    return () => clearTimeout(timer);
  }, [pause]);

  // Le carte arrivano una alla volta, e non si salta: la distribuzione fa
  // parte del gioco come al tavolo. All'ultima si scopre il monte e comincia
  // la chiamata, sullo stesso tavolo.
  useEffect(() => {
    if (session?.phase !== 'distribuzione') return undefined;
    // Le foto devono essere pronte prima che la prima carta si scopra.
    precaricaMazzo();
    const timer = setTimeout(() => {
      setSession((prev) => {
        if (prev === null || prev.phase !== 'distribuzione') return prev;
        const quante = carteDaDistribuire(prev.config.players, prev.config.handSize);
        const distribuite = Math.min(prev.distribuite + 1, quante);
        return distribuite < quante
          ? { ...prev, distribuite }
          : { ...prev, distribuite, phase: 'call' };
      });
    }, CARTA_DISTRIBUITA_MS);
    return () => clearTimeout(timer);
  }, [session?.phase, session?.seed, session?.distribuite]);

  const start = useCallback(
    (
      players: number,
      variant: Variant,
      puntoDiVista: number,
      controBot: boolean,
      carteScoperte: boolean,
    ) => {
      try {
        const seed = nuovoSeed();
        casoBot.current = createRng(seed ^ SEME_DELLE_MOSSE);
        setSession(
          nuovaSessione(players, variant, seed, 0, puntoDiVista, controBot, carteScoperte),
        );
        setError(null);
        setPause(null);
      } catch (errore) {
        setError(messaggio(errore));
      }
    },
    [],
  );

  /**
   * Spostarsi di posto a smazzata in corso vorrebbe dire alzarsi da tavola
   * mentre si gioca: il cambio vale solo fra una smazzata e l'altra e da qui
   * in poi lo eredita ogni smazzata nuova.
   */
  const cambiaPuntoDiVista = useCallback((seat: number) => {
    setSession((prev) => {
      if (prev === null || prev.phase !== 'end') return prev;
      if (seat < 0 || seat >= prev.config.players) return prev;
      return { ...prev, puntoDiVista: seat };
    });
  }, []);

  /**
   * Scoprire le carte e' solo un modo di guardare il tavolo: non tocca ne'
   * l'engine ne' quello che sanno i bot. La smazzata pero' resta segnata nel
   * registro, perche' chi ha visto le mani degli altri non gioca piu' come
   * giocherebbe al tavolo, e quelle decisioni non vanno studiate.
   */
  const cambiaCarteScoperte = useCallback((acceso: boolean) => {
    if (acceso) registro.annotaCarteScoperte();
    setSession((prev) =>
      prev === null || prev.umano === null ? prev : { ...prev, carteScoperte: acceso },
    );
  }, []);

  const decidi = useCallback(
    (player: number, action: CallAction) => {
      if (session === null) return;
      let call: CallState;
      try {
        call = applyCall(session.call, player, action);
      } catch (errore) {
        setError(messaggio(errore));
        return;
      }
      setError(null);
      registro.annota(
        registro.decisioneChiamata({
          giocatore: player,
          mano: session.hands[player] ?? [],
          call: session.call,
          azione: action,
          trionfo: session.trump,
          giocatori: session.config.players,
          ms: quantoCiHaMesso(),
        }),
      );

      if (!call.closed) {
        setSession({ ...session, call });
        return;
      }

      const caller = call.caller;
      registro.annotaChiamante(caller, call.chiamata);
      const aggiornata: Session = { ...session, call };
      try {
        if (caller === null) {
          setSession(avviaGioco(aggiornata, { kind: 'liscio' }));
          return;
        }

        // Una speciale batte la variante: anche nell'amico si rinuncia al
        // compagno e si gioca soli contro tutti, che e' l'alleanza del monte.
        const chiamata = call.chiamata ?? 'normale';
        if (chiamata === 'chiSeLaSente') {
          setSession({ ...aggiornata, phase: 'apertura' });
          return;
        }
        if (chiamata !== 'normale') {
          // Sola e colonna: niente da scambiare e nessun 7 da chiamare.
          setSession(avviaGioco(aggiornata, { kind: 'monte', caller, chiamata }));
          return;
        }

        if (session.config.variant === 'amico') {
          setSession({ ...aggiornata, phase: 'friend' });
          return;
        }
        if (serveScambioMonte(chiamata) && session.config.monteSize > 0) {
          setSession({ ...aggiornata, phase: 'discard' });
          return;
        }
        setSession(avviaGioco(aggiornata, { kind: 'monte', caller, chiamata }));
      } catch (errore) {
        setError(messaggio(errore));
      }
    },
    [session],
  );

  const confermaScarti = useCallback(
    (scarti: Card[]) => {
      if (session === null) return;
      const caller = session.call.caller;
      if (caller === null) return;

      const allargata = takeMonte(session.hands[caller] ?? [], session.monte);
      try {
        const scambio = discardToMonte(allargata, scarti, session.config.monteSize);
        const hands = session.hands.map((mano, seat) => (seat === caller ? scambio.hand : mano));
        setError(null);
        registro.annota({
          tipo: 'scarto',
          giocatore: caller,
          manoAllargata: allargata.map((carta) => carta.id),
          scartate: scarti.map((carta) => carta.id),
          msPerDecidere: quantoCiHaMesso(),
        });
        setSession(
          avviaGioco({ ...session, hands, monte: scambio.monte }, {
            kind: 'monte',
            caller,
            chiamata: session.call.chiamata ?? 'normale',
          }),
        );
      } catch (errore) {
        setError(messaggio(errore));
      }
    },
    [session],
  );

  /** Chi se la sente: un avversario si fa avanti e apre, restando avversario. */
  const apre = useCallback(
    (seat: number) => {
      if (session === null) return;
      const caller = session.call.caller;
      if (caller === null) return;
      try {
        setError(null);
        registro.annota({
          tipo: 'apertura',
          giocatore: seat,
          mano: (session.hands[seat] ?? []).map((carta) => carta.id),
          msPerDecidere: quantoCiHaMesso(),
        });
        setSession(
          avviaGioco(session, { kind: 'monte', caller, chiamata: 'chiSeLaSente' }, seat),
        );
      } catch (errore) {
        setError(messaggio(errore));
      }
    },
    [session],
  );

  /**
   * Nessuno si e' fatto avanti. Col server sara' un tempo scaduto, per ora e'
   * un bottone: la smazzata finisce senza essere giocata.
   */
  const nessunoSeLaSente = useCallback(() => {
    if (session === null || session.call.caller === null) return;
    setError(null);
    const quote = settleChiSeLaSenteScaduto(session.config, session.call.caller);
    registro.chiudiSmazzata(
      {
        // Non si e' giocato: le carte non si contano nemmeno.
        punti: [],
        quote,
        chiamanteVince: true,
        pareggio: false,
        cappotto: null,
        cappottoDi: null,
        penalitaSoglia: 0,
        liscioPerde: null,
        scaduta: true,
      },
      null,
    );
    setSession({ ...session, phase: 'end', scaduta: true });
  }, [session]);

  const scegliAmico = useCallback(
    (card: Card) => {
      if (session === null) return;
      const caller = session.call.caller;
      if (caller === null) return;
      setError(null);
      registro.annota({
        tipo: 'amico',
        giocatore: caller,
        mano: (session.hands[caller] ?? []).map((carta) => carta.id),
        cartaChiamata: card.id,
        msPerDecidere: quantoCiHaMesso(),
      });
      registro.annotaAmico(card.id);
      setSession(
        avviaGioco(session, { kind: 'amico', caller, calledCard: card.id, friend: null }),
      );
    },
    [session],
  );

  const gioca = useCallback(
    (cardId: string) => {
      if (session?.state == null || pause !== null) return;
      const corrente = session.state;
      let prossimo: HandState;
      try {
        prossimo = playCard(corrente, corrente.turn, cardId);
      } catch (errore) {
        setError(messaggio(errore));
        return;
      }

      setError(null);
      // La fotografia va presa sullo stato di prima: e' quello che chi ha
      // scelto aveva davanti.
      registro.annota(registro.decisioneGiocata(corrente, cardId, quantoCiHaMesso()));
      if (prossimo.finished) {
        const score = scoreHand(prossimo);
        registro.chiudiSmazzata(
          registro.esitoDaPunteggio(score, settle(prossimo, score)),
          prossimo.alliance.kind === 'amico' ? prossimo.alliance.friend : null,
        );
      }
      if (prossimo.completedTricks.length > corrente.completedTricks.length) {
        const presa = prossimo.completedTricks[prossimo.completedTricks.length - 1];
        if (presa !== undefined) {
          setPause({
            winner: presa.winner,
            points: presa.points,
            cards: presa.cards,
            raccolta: false,
          });
        }
      }
      setSession({ ...session, state: prossimo });
    },
    [session, pause],
  );

  const nuovaSmazzata = useCallback(() => {
    if (session === null) return;
    try {
      const seed = nuovoSeed();
      casoBot.current = createRng(seed ^ SEME_DELLE_MOSSE);
      setSession(
        nuovaSessione(
          session.config.players,
          session.config.variant,
          seed,
          nextSeat(session.dealer, session.config.players),
          session.puntoDiVista,
          session.umano !== null,
          session.carteScoperte,
          session.nomi,
        ),
      );
      setError(null);
      setPause(null);
    } catch (errore) {
      setError(messaggio(errore));
    }
  }, [session]);

  /**
   * Chi riparte deve conoscere l'ultima smazzata, ma il conto alla rovescia non
   * deve dipendere da lei: se si rimettesse in moto a ogni cambio di sessione —
   * cambiare posto, per esempio — i dieci secondi non finirebbero mai.
   */
  const riparti = useRef(nuovaSmazzata);
  useEffect(() => {
    riparti.current = nuovaSmazzata;
  }, [nuovaSmazzata]);

  /**
   * Il conteggio finale dura quanto un conto alla rovescia, e poi il tavolo
   * riparte da solo: nessuna pausa e nessun modo di allungarlo, come al tavolo
   * vero, dove le carte si rimescolano mentre ancora si commenta. Il battito
   * serve al numero a schermo, il tempo alla ripartenza: se si esce dal tavolo,
   * o se lo schermo se ne va per qualsiasi ragione, muoiono insieme e non
   * resta nessun timer a far nascere una smazzata senza tavolo.
   *
   * Il conto parte una volta per smazzata, e il seed e' quello che la
   * distingue: il resto della sessione — il posto da cui si guarda, per dirne
   * una — cambia senza rimettere in moto niente.
   */
  useEffect(() => {
    if (session?.phase !== 'end') return undefined;
    setSecondiAllaRipartenza(SECONDI_PRIMA_DI_RIPARTIRE);
    const battito = setInterval(() => {
      setSecondiAllaRipartenza((rimasti) => (rimasti > 0 ? rimasti - 1 : 0));
    }, 1000);
    const ripartenza = setTimeout(
      () => riparti.current(),
      SECONDI_PRIMA_DI_RIPARTIRE * 1000,
    );
    return () => {
      clearInterval(battito);
      clearTimeout(ripartenza);
      setSecondiAllaRipartenza(SECONDI_PRIMA_DI_RIPARTIRE);
    };
  }, [session?.phase, session?.seed]);

  /**
   * La regia dei bot: quando tocca a uno di loro si sceglie la mossa e la si
   * fa passare dagli stessi gesti dell'umano, dopo una pausa. Il tempo di
   * riflessione non e' un vezzo: un tavolo che risponde all'istante non
   * somiglia a un tavolo.
   *
   * Se la situazione cambia prima che il tempo scada l'attesa si annulla e
   * riparte: e' l'effetto stesso a garantirlo, non serve altro.
   */
  useEffect(() => {
    if (session === null || session.umano === null || pause !== null) return undefined;
    const umano = session.umano;
    const caso = casoBot.current;
    const caller = session.call.caller;

    if (session.phase === 'call') {
      const diTurno = currentCaller(session.call);
      if (diTurno === null || diTurno === umano) return undefined;
      const mano = session.hands[diTurno] ?? [];
      const timer = setTimeout(
        () =>
          decidi(
            diTurno,
            decisioneDiChiamata(mano, session.trump, session.scoperta, session.config),
          ),
        pausaChiamata(mano.length, caso),
      );
      return () => clearTimeout(timer);
    }

    if (session.phase === 'discard' && caller !== null && caller !== umano) {
      const allargata = takeMonte(session.hands[caller] ?? [], session.monte);
      const quante = session.config.monteSize;
      const timer = setTimeout(
        () => confermaScarti(scegliScarti(allargata, session.trump, quante, session.config.players)),
        pausaScarto(quante, caso),
      );
      return () => clearTimeout(timer);
    }

    if (session.phase === 'friend' && caller !== null && caller !== umano) {
      const mano = session.hands[caller] ?? [];
      const timer = setTimeout(
        () => scegliAmico(cartaDellAmico(mano, callableCards(mano), caso)),
        pausaChiamata(mano.length, caso),
      );
      return () => clearTimeout(timer);
    }

    // Chi se la sente: si fa avanti un avversario. Se a dichiararla e' stato
    // un bot l'avversario e' l'umano, e la scelta resta sua.
    if (session.phase === 'apertura' && caller === umano) {
      const avversari = session.hands
        .map((_, seat) => seat)
        .filter((seat) => seat !== caller);
      const scelto = avversari[Math.floor(caso() * avversari.length)];
      if (scelto === undefined) return undefined;
      const timer = setTimeout(() => apre(scelto), pausaChiamata(session.config.handSize, caso));
      return () => clearTimeout(timer);
    }

    const state = session.state;
    if (session.phase === 'play' && state !== null && !state.finished && state.turn !== umano) {
      const legali = legalPlaysFor(state, state.turn);
      // Il bot guarda il tavolo come lo guarderebbe da seduto: la sua mano,
      // le carte uscite, niente di piu'. Le mani degli altri non le vede.
      const carta = scegliCarta(vistaDaStato(state, state.turn), caso);
      const timer = setTimeout(() => gioca(carta.id), pausaCarta(legali.length, caso));
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [session, pause, decidi, confermaScarti, scegliAmico, apre, gioca]);

  const ricomincia = useCallback(() => {
    // Ci si alza da tavola: la compagnia resta li', il tavolo dopo avra' la
    // sua. Senza questo i nomi vecchi finirebbero nella schermata iniziale.
    fissaNomiDelTavolo([]);
    setSession(null);
    setError(null);
    setPause(null);
  }, []);

  const chiudiErrore = useCallback(() => setError(null), []);

  return {
    session,
    error,
    pause,
    secondiAllaRipartenza,
    start,
    cambiaPuntoDiVista,
    cambiaCarteScoperte,
    decidi,
    confermaScarti,
    apre,
    nessunoSeLaSente,
    scegliAmico,
    gioca,
    ricomincia,
    chiudiErrore,
  };
}
