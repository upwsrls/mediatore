import type {
  CallAction,
  CallState,
  Card,
  HandScore,
  HandState,
  Suit,
  TipoChiamata,
  Variant,
} from '@mediatore/engine';
import { currentWinner, isAllyFor, legalPlaysFor } from '@mediatore/engine';
import type { Livello } from './livello';

/**
 * Il quaderno delle partite: si segna come gioca chi sta al tavolo, per
 * poterlo studiare dopo e insegnarlo al bot.
 *
 * E' uno strumento di lavoro locale, non un pezzo del gioco: non decide
 * niente, non blocca niente, e se la memoria del browser non collabora
 * l'app va avanti come se il quaderno non ci fosse. Quando arrivera' il
 * server questa registrazione andra' ripensata da capo.
 */

export const VERSIONE_REGISTRO = 1;

const CHIAVE = 'mediatore:registro:v1';

export type Ruolo = 'chiamante' | 'compagno' | 'avversario' | 'liscio';

export interface Giocata {
  tipo: 'giocata';
  giocatore: number;
  ruolo: Ruolo;
  presa: number;
  mano: string[];
  legali: string[];
  scelta: string;
  /** Chi ha giocato cosa prima di lui in questa presa. */
  inTavola: { giocatore: number; carta: string }[];
  staVincendo: number | null;
  puntiFinora: number[];
  msPerDecidere: number;
}

export interface Chiamata {
  tipo: 'chiamata';
  giocatore: number;
  mano: string[];
  trionfo: Suit;
  giocatori: number;
  scelta: 'passo' | TipoChiamata;
  giaPassati: number[];
  msPerDecidere: number;
}

export interface Scarto {
  tipo: 'scarto';
  giocatore: number;
  manoAllargata: string[];
  scartate: string[];
  msPerDecidere: number;
}

export interface SceltaAmico {
  tipo: 'amico';
  giocatore: number;
  mano: string[];
  cartaChiamata: string;
  msPerDecidere: number;
}

export interface SceltaApertura {
  tipo: 'apertura';
  giocatore: number;
  mano: string[];
  msPerDecidere: number;
}

export type Decisione = Giocata | Chiamata | Scarto | SceltaAmico | SceltaApertura;

export interface Esito {
  punti: number[];
  quote: number[];
  chiamanteVince: boolean | null;
  pareggio: boolean;
  cappotto: string | null;
  cappottoDi: number | null;
  penalitaSoglia: number;
  liscioPerde: number | null;
  /** Chi se la sente senza nessuno che si e' fatto avanti: non si e' giocato. */
  scaduta: boolean;
}

export interface Smazzata {
  seed: number;
  giocatori: number;
  variante: Variant;
  mazziere: number;
  trionfo: Suit;
  /** La carta che ha scoperto il trionfo, quando c'e'. */
  scoperta: string | null;
  /**
   * Le mani di tutti come sono state distribuite. Serve a chi studia le
   * partite, non al bot: il bot le mani altrui non le vede nemmeno.
   */
  maniIniziali: string[][];
  monteIniziale: string[];
  /**
   * Giocata contro i bot: le decisioni della persona vera sono state prese
   * senza vedere le carte di nessuno, quindi valgono di piu' di quelle di
   * chi comanda tutto il tavolo. Chi studia il file filtra per postoUmano.
   */
  controBot: boolean;
  postoUmano: number | null;
  /**
   * Giocata a carte scoperte, con le mani di tutti sotto gli occhi. Serve a
   * correggere i bot, non a studiare come gioca una persona: chi vede le
   * carte degli altri non gioca come al tavolo. Chi studia il file la salta.
   */
  carteScoperte: boolean;
  /**
   * Gli aiuti che il tavolo teneva a schermo: da principiante i punti di tutti
   * e il conto dei trionfi, da esperto niente. Chi studia le partite deve
   * sapere se quelle decisioni sono state prese contando a mente o leggendo.
   */
  livello: Livello;
  /** Come si chiamavano i posti, quando avevano un nome. */
  nomi: string[];
  chiamante: number | null;
  chiamata: TipoChiamata | null;
  cartaDellAmico: string | null;
  amicoScoperto: number | null;
  decisioni: Decisione[];
  esito: Esito | null;
}

export interface Registro {
  versione: number;
  sessioneIniziata: string;
  smazzate: Smazzata[];
}

const ids = (carte: readonly Card[]): string[] => carte.map((carta) => carta.id);

/* ---- il quaderno ---- */

const iniziata = new Date().toISOString();
let smazzate: Smazzata[] = leggiDallaMemoria();
let inCorso: Smazzata | null = null;
const ascoltatori = new Set<() => void>();

function leggiDallaMemoria(): Smazzata[] {
  try {
    const salvato = localStorage.getItem(CHIAVE);
    if (salvato === null) return [];
    const letto = JSON.parse(salvato) as Registro;
    return Array.isArray(letto.smazzate) ? letto.smazzate : [];
  } catch {
    // Memoria piena, modo privato, dati vecchi illeggibili: si riparte da zero
    // senza far pesare niente a chi sta giocando.
    return [];
  }
}

function salva(): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(registro()));
  } catch {
    // Vedi sopra: il gioco viene prima del quaderno. Chi sta studiando le
    // partite pero' deve sapere che da qui in poi restano solo in pagina.
    console.warn('registro: non riesco a salvare, scarica le partite prima di ricaricare');
  }
}

function avvisa(): void {
  for (const ascoltatore of ascoltatori) ascoltatore();
}

export function registro(): Registro {
  return { versione: VERSIONE_REGISTRO, sessioneIniziata: iniziata, smazzate };
}

export function contaSmazzate(): number {
  return smazzate.length;
}

/** Per il contatore a schermo: si aggiorna quando una smazzata si chiude. */
export function iscriviti(ascoltatore: () => void): () => void {
  ascoltatori.add(ascoltatore);
  return () => {
    ascoltatori.delete(ascoltatore);
  };
}

export function apriSmazzata(dati: {
  seed: number;
  giocatori: number;
  variante: Variant;
  mazziere: number;
  trionfo: Suit;
  scoperta: Card | null;
  mani: Card[][];
  monte: Card[];
  controBot: boolean;
  postoUmano: number | null;
  carteScoperte: boolean;
  livello: Livello;
  nomi: string[];
}): void {
  inCorso = {
    seed: dati.seed,
    giocatori: dati.giocatori,
    variante: dati.variante,
    mazziere: dati.mazziere,
    trionfo: dati.trionfo,
    scoperta: dati.scoperta?.id ?? null,
    maniIniziali: dati.mani.map((mano) => ids(mano)),
    monteIniziale: ids(dati.monte),
    controBot: dati.controBot,
    postoUmano: dati.postoUmano,
    carteScoperte: dati.carteScoperte,
    livello: dati.livello,
    nomi: dati.nomi,
    chiamante: null,
    chiamata: null,
    cartaDellAmico: null,
    amicoScoperto: null,
    decisioni: [],
    esito: null,
  };
}

export function annota(decisione: Decisione): void {
  inCorso?.decisioni.push(decisione);
}

/** Chi ha chiamato e cosa: si sa solo a chiamata chiusa. */
export function annotaChiamante(caller: number | null, chiamata: TipoChiamata | null): void {
  if (inCorso === null) return;
  inCorso.chiamante = caller;
  inCorso.chiamata = chiamata;
}

/**
 * Le carte sono state scoperte a smazzata avviata. Il segno non si toglie
 * piu' spegnendo l'interruttore: chi ha visto ha visto, e da quel momento le
 * sue giocate non dicono piu' come si gioca al tavolo.
 */
export function annotaCarteScoperte(): void {
  if (inCorso === null) return;
  inCorso.carteScoperte = true;
}

/**
 * Il livello e' cambiato a smazzata avviata. Come per le carte scoperte resta
 * il segno piu' generoso: chi ha letto i punti e i trionfi non puo' fingere di
 * averli tenuti a mente, quindi da principiante non si torna piu' indietro.
 */
export function annotaLivello(livello: Livello): void {
  if (inCorso === null || livello !== 'principiante') return;
  inCorso.livello = 'principiante';
}

export function annotaAmico(cartaChiamata: string): void {
  if (inCorso === null) return;
  inCorso.cartaDellAmico = cartaChiamata;
}

export function chiudiSmazzata(esito: Esito, amicoScoperto: number | null): void {
  if (inCorso === null) return;
  inCorso.esito = esito;
  inCorso.amicoScoperto = amicoScoperto;
  smazzate = [...smazzate, inCorso];
  inCorso = null;
  salva();
  avvisa();
}

/**
 * Butta via il quaderno: le smazzate in pagina, quella eventualmente aperta e
 * la copia nella memoria del browser. Non si torna indietro, per questo chi
 * preme il bottone se lo sente chiedere due volte.
 */
export function azzeraRegistro(): void {
  smazzate = [];
  inCorso = null;
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    console.warn('registro: non riesco a svuotare la memoria del browser');
  }
  avvisa();
}

export function scaricaPartite(): void {
  const testo = JSON.stringify(registro(), null, 2);
  const oggi = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `mediatore-partite-${oggi}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // L'indirizzo si libera dopo, non subito: c'e' chi lo legge a scaricamento
  // avviato e si ritroverebbe con niente in mano.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- il contesto di ogni decisione ---- */

/**
 * Il ruolo com'era noto in quel momento, non a smazzata finita: finche'
 * l'amico non si scopre risulta un avversario come gli altri, che e' quello
 * che sapeva chi ha giocato. Chi studia le partite trova in testa alla
 * smazzata chi era davvero.
 */
export function ruoloDiChiGioca(state: HandState, giocatore: number): Ruolo {
  const alliance = state.alliance;
  if (alliance.kind === 'liscio') return 'liscio';
  if (alliance.caller === giocatore) return 'chiamante';
  return isAllyFor(alliance)(giocatore, alliance.caller) ? 'compagno' : 'avversario';
}

/**
 * La fotografia del momento in cui si sceglie la carta: va presa PRIMA di
 * giocarla, perche' e' quello che il giocatore aveva davanti agli occhi.
 */
export function decisioneGiocata(state: HandState, cartaId: string, ms: number): Giocata {
  const giocatore = state.turn;
  const vincitore = currentWinner(state.currentTrick);
  return {
    tipo: 'giocata',
    giocatore,
    ruolo: ruoloDiChiGioca(state, giocatore),
    presa: state.completedTricks.length + 1,
    mano: ids(state.hands[giocatore] ?? []),
    legali: ids(legalPlaysFor(state, giocatore)),
    scelta: cartaId,
    inTavola: state.currentTrick.plays.map((giocata) => ({
      giocatore: giocata.player,
      carta: giocata.card.id,
    })),
    staVincendo: vincitore,
    puntiFinora: state.progression.map((riga) => riga[riga.length - 1] ?? 0),
    msPerDecidere: ms,
  };
}

export function decisioneChiamata(dati: {
  giocatore: number;
  mano: Card[];
  call: CallState;
  azione: CallAction;
  trionfo: Suit;
  giocatori: number;
  ms: number;
}): Chiamata {
  return {
    tipo: 'chiamata',
    giocatore: dati.giocatore,
    mano: ids(dati.mano),
    trionfo: dati.trionfo,
    giocatori: dati.giocatori,
    scelta: dati.azione.tipo === 'passo' ? 'passo' : dati.azione.chiamata,
    giaPassati: dati.call.order.slice(0, dati.call.index),
    msPerDecidere: dati.ms,
  };
}

export function esitoDaPunteggio(score: HandScore, quote: number[]): Esito {
  return {
    punti: score.perPlayer,
    quote,
    chiamanteVince: score.callerWins,
    pareggio: score.tie,
    cappotto: score.cappotto,
    cappottoDi: score.cappottoDi,
    penalitaSoglia: score.penalitaSoglia,
    liscioPerde: score.liscioLoser,
    scaduta: false,
  };
}
