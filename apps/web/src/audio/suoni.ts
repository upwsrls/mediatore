import type { TipoChiamata } from '@mediatore/engine';

/**
 * Il catalogo dei suoni del tavolo: qui c'e' un nome per ogni cosa che al
 * tavolo si sente, e la ricetta per farla sentire. Le schermate e il gioco
 * chiedono `suona('cartaGiocata')` e non sanno altro: come quel suono venga
 * fuori si decide qui dentro e solo qui dentro.
 *
 * Adesso sono segnaposto sintetizzati, che non pesano niente e funzionano
 * anche senza rete. Quando arriveranno i suoni veri — il fruscio della carta,
 * il mazzo che si mescola — si cambia la ricetta in
 * `{ tipo: 'registrato', file: '/suoni/carta.webm' }`: una riga, in questo
 * file, e nessun altro pezzo dell'app se ne accorge.
 */
export type Suono =
  /** La carta che si appoggia in tavola. */
  | 'cartaGiocata'
  /** Il taglio col trionfo: al tavolo si esclama e si getta la carta. */
  | 'uccisione'
  /** Una carta che vola al suo posto durante la distribuzione. */
  | 'cartaDistribuita'
  /** La base si chiude e va a chi l'ha vinta. */
  | 'baseVinta'
  /** L'ultima base si porta via anche il monte. */
  | 'monteRaccolto'
  | 'chiamata'
  | 'chiamataSola'
  | 'chiamataColonna'
  | 'chiamataChiSeLaSente'
  /** L'amico esce allo scoperto giocando la carta chiamata. */
  | 'amicoScoperto'
  /** Tutte le basi da una parte sola: la cosa piu' rara e piu' cara. */
  | 'cappotto'
  /** Le carte si posano e si contano: la smazzata e' finita. */
  | 'smazzataChiusa'
  /** Il proprio turno che arriva. */
  | 'toccaATe'
  /** Gli ultimi secondi prima che il tavolo riparta da solo. */
  | 'contoAllaRovescia'
  /** Una scelta del setup che cambia davvero: giocatori, variante, livello. */
  | 'scelta'
  /** Ci si alza e si va a giocare. */
  | 'vaiAlTavolo';

/**
 * Una voce del suono. Il `tono` e' un oscillatore, il `fruscio` una manciata
 * di rumore filtrato: e' quello che assomiglia alla carta, e infatti le carte
 * sono tutte fruscio.
 */
export interface Voce {
  forma: 'tono' | 'fruscio';
  /** Il tono la usa come nota, il fruscio come centro del filtro. */
  hz: number;
  /** Dove scivola la nota, quando scivola. */
  hzFinale?: number;
  onda?: OscillatorType;
  /** Secondi. Corte, sempre: al tavolo niente suona a lungo. */
  durata: number;
  /** Da 0 a 1, prima del volume di casa. */
  volume: number;
  /** Secondi dall'inizio del suono: e' cosi' che si fanno le sequenze. */
  ritardo?: number;
  /**
   * Quanto ogni colpo puo' scostarsi dal precedente, in frazione: 0.2 vuol
   * dire fino a un quinto in piu' o in meno, di altezza e di volume. Serve ai
   * suoni che si ripetono tante volte di fila — le carte che si distribuiscono
   * — perche' lo stesso identico colpo trentasei volte non e' un mazzo, e' un
   * campione ripetuto. Chi suona passa il numero del colpo e lo scarto viene
   * da li': stessa carta, stesso fruscio, a ogni ridisegno.
   */
  respiro?: number;
}

/**
 * Lo scarto di un colpo: sempre lo stesso per lo stesso numero, e sparso
 * abbastanza da non sentirsi la regola sotto. Il sale distingue le due cose
 * che si scostano, cosi' l'altezza e il volume non salgono insieme.
 */
function scarto(colpo: number, sale: number): number {
  const x = Math.sin(colpo * 12.9898 + sale * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * La voce come esce davvero, col respiro applicato. Senza respiro, o senza il
 * numero del colpo, e' la voce scritta nel catalogo e basta.
 */
export function conRespiro(voce: Voce, colpo: number | undefined): { hz: number; volume: number } {
  const respiro = voce.respiro;
  if (respiro === undefined || colpo === undefined) {
    return { hz: voce.hz, volume: voce.volume };
  }
  return {
    hz: voce.hz * (1 + respiro * scarto(colpo, 1)),
    volume: voce.volume * (1 + respiro * scarto(colpo, 2)),
  };
}

export type Ricetta =
  | { tipo: 'sintetizzato'; voci: readonly Voce[] }
  /** Il posto pronto per i suoni veri, quando ci saranno. */
  | { tipo: 'registrato'; file: string };

const sintetizzato = (...voci: Voce[]): Ricetta => ({ tipo: 'sintetizzato', voci });

/**
 * Le ricette. Il criterio: quello che conta di piu' suona piu' pieno e piu'
 * lungo — uccisione e cappotto stanno in cima, il tocco del conto alla
 * rovescia in fondo — e niente supera il mezzo secondo, che un tavolo non e'
 * una sala da concerto.
 */
export const SUONI: Record<Suono, Ricetta> = {
  // Una carta appoggiata: un soffio corto e chiaro, il gesto piu' frequente
  // della smazzata e quindi il piu' discreto di tutti.
  cartaGiocata: sintetizzato({ forma: 'fruscio', hz: 1800, durata: 0.07, volume: 0.18 }),

  // Il taglio: piu' secco e piu' pieno, con sotto il tonfo della carta
  // sbattuta. E' il momento piu' rumoroso della mano, e si deve sentire che
  // e' un'altra cosa dall'appoggiare una carta.
  uccisione: sintetizzato(
    { forma: 'fruscio', hz: 2600, durata: 0.09, volume: 0.42 },
    { forma: 'tono', onda: 'triangle', hz: 150, hzFinale: 80, durata: 0.18, volume: 0.34 },
  ),

  // Il giro di carte non e' un suono solo: e' un soffio per ogni carta, che
  // comincia e finisce col suo volo. Trentasei di fila non devono stancare,
  // quindi ognuno e' piu' leggero della carta appoggiata in partita, e ognuno
  // suona un filo diverso dal precedente — il respiro — come un mazzo vero.
  cartaDistribuita: sintetizzato({
    forma: 'fruscio',
    hz: 1600,
    durata: 0.1,
    volume: 0.1,
    respiro: 0.2,
  }),

  // La base si chiude: due note che salgono, come le carte che vanno via.
  baseVinta: sintetizzato(
    { forma: 'tono', onda: 'sine', hz: 520, durata: 0.1, volume: 0.16 },
    { forma: 'tono', onda: 'sine', hz: 780, durata: 0.12, volume: 0.16, ritardo: 0.08 },
  ),

  // L'ultima base tira su anche il monte: il fruscio delle carte raccolte e
  // tre note che salgono sopra.
  monteRaccolto: sintetizzato(
    { forma: 'fruscio', hz: 1100, durata: 0.22, volume: 0.2 },
    { forma: 'tono', onda: 'sine', hz: 440, durata: 0.12, volume: 0.18, ritardo: 0.06 },
    { forma: 'tono', onda: 'sine', hz: 660, durata: 0.12, volume: 0.18, ritardo: 0.16 },
    { forma: 'tono', onda: 'sine', hz: 880, durata: 0.16, volume: 0.2, ritardo: 0.26 },
  ),

  // Le quattro dichiarazioni, in ordine di posta: la normale e' una nota
  // sola, la chi se la sente e' un accordo che si sente in tutto il bar.
  chiamata: sintetizzato({ forma: 'tono', onda: 'sine', hz: 660, durata: 0.14, volume: 0.18 }),
  chiamataSola: sintetizzato(
    { forma: 'tono', onda: 'triangle', hz: 550, durata: 0.18, volume: 0.22 },
    { forma: 'tono', onda: 'triangle', hz: 825, durata: 0.18, volume: 0.2, ritardo: 0.06 },
  ),
  chiamataColonna: sintetizzato(
    { forma: 'tono', onda: 'triangle', hz: 440, durata: 0.24, volume: 0.26 },
    { forma: 'tono', onda: 'triangle', hz: 660, durata: 0.22, volume: 0.24, ritardo: 0.06 },
    { forma: 'tono', onda: 'triangle', hz: 880, durata: 0.2, volume: 0.22, ritardo: 0.12 },
  ),
  chiamataChiSeLaSente: sintetizzato(
    { forma: 'tono', onda: 'sawtooth', hz: 330, durata: 0.3, volume: 0.3 },
    { forma: 'tono', onda: 'triangle', hz: 495, durata: 0.28, volume: 0.26, ritardo: 0.06 },
    { forma: 'tono', onda: 'triangle', hz: 660, durata: 0.26, volume: 0.24, ritardo: 0.12 },
    { forma: 'tono', onda: 'triangle', hz: 990, durata: 0.24, volume: 0.22, ritardo: 0.18 },
  ),

  // L'amico si scopre: una nota che sale, la sorpresa di chi era nascosto.
  amicoScoperto: sintetizzato(
    { forma: 'tono', onda: 'sine', hz: 700, hzFinale: 1050, durata: 0.24, volume: 0.22 },
    { forma: 'tono', onda: 'sine', hz: 1400, durata: 0.14, volume: 0.14, ritardo: 0.16 },
  ),

  // Il cappotto: l'unica fanfara del catalogo, perche' e' l'unica cosa che
  // capita una volta ogni tante serate.
  cappotto: sintetizzato(
    { forma: 'tono', onda: 'triangle', hz: 523, durata: 0.16, volume: 0.3 },
    { forma: 'tono', onda: 'triangle', hz: 659, durata: 0.16, volume: 0.3, ritardo: 0.12 },
    { forma: 'tono', onda: 'triangle', hz: 784, durata: 0.16, volume: 0.3, ritardo: 0.24 },
    { forma: 'tono', onda: 'triangle', hz: 1047, durata: 0.42, volume: 0.34, ritardo: 0.36 },
  ),

  // Il conteggio che si apre. Non festeggia: la smazzata puo' essere finita
  // bene o male, e chi ha perso non vuole una fanfara. Due note basse che
  // SCENDONO — al contrario della base vinta e del cappotto, che salgono —
  // come le carte che si posano sul tavolo quando non c'e' piu' niente da
  // giocare.
  smazzataChiusa: sintetizzato(
    { forma: 'tono', onda: 'triangle', hz: 330, durata: 0.16, volume: 0.22 },
    { forma: 'tono', onda: 'triangle', hz: 220, durata: 0.3, volume: 0.24, ritardo: 0.12 },
  ),

  // Roba di servizio: si devono sentire e dimenticare.
  toccaATe: sintetizzato(
    { forma: 'tono', onda: 'sine', hz: 880, durata: 0.06, volume: 0.12 },
    { forma: 'tono', onda: 'sine', hz: 1320, durata: 0.08, volume: 0.12, ritardo: 0.07 },
  ),
  contoAllaRovescia: sintetizzato({
    forma: 'tono',
    onda: 'sine',
    hz: 1000,
    durata: 0.05,
    volume: 0.09,
  }),

  // Il setup: un tocco per la scelta che cambia — e non suona ritoccare quella
  // gia' presa — e qualcosa di piu' pieno per il momento in cui si entra
  // davvero. Sono due note che non si confondono: una si posa, l'altra sale.
  scelta: sintetizzato({ forma: 'tono', onda: 'sine', hz: 740, durata: 0.05, volume: 0.1 }),
  vaiAlTavolo: sintetizzato(
    { forma: 'tono', onda: 'triangle', hz: 392, durata: 0.14, volume: 0.26 },
    { forma: 'tono', onda: 'triangle', hz: 587, durata: 0.2, volume: 0.26, ritardo: 0.09 },
  ),
};

/** La dichiarazione ha il suo suono: piu' sale la posta, piu' e' pieno. */
export function suonoDellaChiamata(chiamata: TipoChiamata): Suono {
  if (chiamata === 'sola') return 'chiamataSola';
  if (chiamata === 'colonna') return 'chiamataColonna';
  if (chiamata === 'chiSeLaSente') return 'chiamataChiSeLaSente';
  return 'chiamata';
}
