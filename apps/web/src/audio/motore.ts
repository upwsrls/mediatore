/**
 * Chi fa suonare il catalogo. E' l'unico posto dell'app che sappia cos'e' un
 * oscillatore: fuori di qui si chiede un nome e basta.
 *
 * Tre cose non deve fare mai: chiedere il permesso, farsi sentire quando e'
 * spento, e rompere il gioco. Se il browser non collabora — audio negato,
 * contesto morto, file che non arriva — il tavolo va avanti in silenzio e
 * nessuno se ne accorge. Per questo qui dentro non esce nemmeno un errore.
 */
import type { Ricetta, Suono, Voce } from './suoni';
import { SUONI, conRespiro } from './suoni';

const CHIAVE = 'mediatore:audio';

/** Il volume di casa: le ricette stanno sotto l'uno, questo le tiene a bada. */
const VOLUME_DI_CASA = 0.6;

/** Quanto ci mette una voce a spegnersi: senza coda si sente il clic. */
const CODA = 0.02;

let acceso = leggiPreferenza();
let contesto: AudioContext | null = null;
let padrone: GainNode | null = null;
let rumore: AudioBuffer | null = null;
let sveglia: (() => void) | null = null;
const registrati = new Map<string, AudioBuffer>();
const ascoltatori = new Set<() => void>();

function leggiPreferenza(): boolean {
  try {
    // Parte acceso: chi non lo vuole lo spegne una volta e resta spento.
    return localStorage.getItem(CHIAVE) !== 'spento';
  } catch {
    return true;
  }
}

export function audioAcceso(): boolean {
  return acceso;
}

/** Per l'interruttore a schermo: si aggiorna da solo quando cambia. */
export function iscriviti(ascoltatore: () => void): () => void {
  ascoltatori.add(ascoltatore);
  return () => {
    ascoltatori.delete(ascoltatore);
  };
}

export function accendi(valore: boolean): void {
  acceso = valore;
  try {
    localStorage.setItem(CHIAVE, valore ? 'acceso' : 'spento');
  } catch {
    // Memoria piena o modo privato: vale per questa sessione e amen.
  }
  if (valore) apri();
  for (const ascoltatore of ascoltatori) ascoltatore();
}

/**
 * Il browser non lascia suonare niente finche' chi guarda non ha toccato lo
 * schermo, e non c'e' niente da chiedergli: si aspetta il primo tocco, quello
 * che c'e' comunque — una scelta del setup — e da li' in poi l'impianto e'
 * acceso. Si puo' chiamare quante volte si vuole: attacca un ascolto solo.
 */
export function svegliaAlPrimoTocco(): void {
  if (sveglia !== null || typeof window === 'undefined') return;
  const tocchi = ['pointerdown', 'keydown', 'touchstart'] as const;
  const alTocco = (): void => {
    // Finche' non e' sveglio davvero si resta in ascolto: il primo tocco puo'
    // non bastare, e insistere non costa niente a nessuno.
    if (apri()?.state === 'running') sveglia?.();
  };
  sveglia = () => {
    for (const tocco of tocchi) window.removeEventListener(tocco, alTocco);
    sveglia = null;
  };
  for (const tocco of tocchi) window.addEventListener(tocco, alTocco);
}

/**
 * Il contesto audio, aperto alla prima occasione utile e poi tenuto. Se il
 * browser lo consegna sospeso — cioe' quasi sempre, finche' non si tocca —
 * si prova a svegliarlo e si tira avanti: chi chiede un suono con l'impianto
 * ancora addormentato lo sente appena si alza, che sono millisecondi.
 */
function apri(): AudioContext | null {
  if (contesto !== null) {
    if (contesto.state === 'suspended') void contesto.resume().catch(() => undefined);
    return contesto;
  }
  try {
    // Sul telefono l'audio "ambient" e' quello che il tasto del silenzioso
    // spegne: e' il modo che il browser da' per rispettare la levetta, dove
    // la espone. Dove non la espone, questa riga non fa niente.
    const sessione = (navigator as { audioSession?: { type: string } }).audioSession;
    if (sessione !== undefined) sessione.type = 'ambient';

    contesto = new AudioContext();
    padrone = contesto.createGain();
    padrone.gain.value = VOLUME_DI_CASA;
    padrone.connect(contesto.destination);
    if (contesto.state === 'suspended') void contesto.resume().catch(() => undefined);
    return contesto;
  } catch {
    contesto = null;
    padrone = null;
    return null;
  }
}

/** Un secondo di rumore bianco, fatto una volta e riusato da tutte le carte. */
function fruscioDiCasa(ctx: AudioContext): AudioBuffer {
  if (rumore !== null) return rumore;
  const campioni = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, campioni, ctx.sampleRate);
  const dati = buffer.getChannelData(0);
  for (let i = 0; i < campioni; i += 1) dati[i] = Math.random() * 2 - 1;
  rumore = buffer;
  return buffer;
}

function inviluppo(ctx: AudioContext, voce: Voce, volume: number, inizio: number): GainNode {
  const gain = ctx.createGain();
  const fine = inizio + voce.durata;
  gain.gain.setValueAtTime(0, inizio);
  gain.gain.linearRampToValueAtTime(volume, inizio + CODA);
  gain.gain.exponentialRampToValueAtTime(0.0001, fine);
  gain.gain.setValueAtTime(0, fine);
  return gain;
}

function suonaVoce(ctx: AudioContext, uscita: GainNode, voce: Voce, colpo?: number): void {
  const inizio = ctx.currentTime + (voce.ritardo ?? 0);
  const fine = inizio + voce.durata;
  // Il respiro sposta un po' altezza e volume, sempre allo stesso modo per lo
  // stesso colpo: e' quello che distingue una carta dall'altra nel giro.
  const { hz, volume } = conRespiro(voce, colpo);
  const gain = inviluppo(ctx, voce, volume, inizio);
  gain.connect(uscita);

  if (voce.forma === 'fruscio') {
    const fonte = ctx.createBufferSource();
    fonte.buffer = fruscioDiCasa(ctx);
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = hz;
    filtro.Q.value = 0.8;
    fonte.connect(filtro).connect(gain);
    fonte.start(inizio);
    fonte.stop(fine);
    return;
  }

  const oscillatore = ctx.createOscillator();
  oscillatore.type = voce.onda ?? 'sine';
  oscillatore.frequency.setValueAtTime(hz, inizio);
  if (voce.hzFinale !== undefined) {
    oscillatore.frequency.exponentialRampToValueAtTime(voce.hzFinale, fine);
  }
  oscillatore.connect(gain);
  oscillatore.start(inizio);
  oscillatore.stop(fine);
}

/**
 * Il suono registrato: si scarica la prima volta, poi resta in memoria. Se
 * non arriva, silenzio — un file che manca non deve fermare una smazzata.
 */
function suonaFile(ctx: AudioContext, uscita: GainNode, file: string): void {
  const gia = registrati.get(file);
  if (gia !== undefined) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = gia;
    fonte.connect(uscita);
    fonte.start();
    return;
  }
  void fetch(file)
    .then((risposta) => risposta.arrayBuffer())
    .then((dati) => ctx.decodeAudioData(dati))
    .then((buffer) => {
      registrati.set(file, buffer);
      // Il primo colpo arriva in ritardo di quanto ci mette a scaricarsi: lo
      // si suona lo stesso, che e' meglio di un buco.
      const fonte = ctx.createBufferSource();
      fonte.buffer = buffer;
      fonte.connect(uscita);
      fonte.start();
    })
    .catch(() => undefined);
}

function esegui(ctx: AudioContext, nome: Suono, colpo?: number): void {
  // Fra la richiesta e il risveglio del contesto puo' esserci passato di
  // mezzo l'interruttore: chi ha appena spento non deve sentire l'ultimo.
  if (!acceso || padrone === null) return;
  const ricetta: Ricetta = SUONI[nome];
  if (ricetta.tipo === 'registrato') {
    suonaFile(ctx, padrone, ricetta.file);
    return;
  }
  for (const voce of ricetta.voci) suonaVoce(ctx, padrone, voce, colpo);
}

/**
 * Quello che il resto dell'app conosce dell'audio: un nome, e via. Il colpo si
 * passa solo ai suoni che si ripetono in fila — la carta che si distribuisce —
 * ed e' il suo numero: chi chiede sa quale carta e', non cosa ci faccia il
 * motore.
 */
export function suona(nome: Suono, colpo?: number): void {
  if (!acceso) return;
  try {
    const ctx = apri();
    if (ctx === null || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      // Il primo tocco: il contesto nasce addormentato e ci mette una manciata
      // di millisecondi ad alzarsi. Il suono non si butta, si aspetta il
      // risveglio e si suona allora — altrimenti il tocco che accende
      // l'impianto sarebbe l'unico a non sentirsi.
      void ctx
        .resume()
        .then(() => esegui(ctx, nome, colpo))
        .catch(() => undefined);
      return;
    }
    esegui(ctx, nome, colpo);
  } catch {
    // Mai un errore a schermo per un suono.
  }
}
