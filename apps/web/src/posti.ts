/**
 * Dove sedere i giocatori attorno al tavolo. Chi guarda sta sempre in basso,
 * gli altri gli girano attorno partendo dalla sua DESTRA e salendo, che e'
 * l'ordine di gioco: al Mediatore si gira in senso antiorario, e dopo di te
 * tocca a quello che hai alla destra. Cosi' l'evidenza del turno gira come al
 * tavolo vero, e la carta di chi sta a destra entra in tavola da destra.
 */
export type Posizione =
  | 'basso'
  | 'sinistra-1'
  | 'sinistra-2'
  | 'alto'
  | 'destra-1'
  | 'destra-2';

/**
 * I posti da assegnare agli altri, nell'ordine di gioco a partire da chi
 * segue quello in basso. Il numero uno e' il piu' vicino a chi guarda, quindi
 * il giro sale lungo il lato destro, passa in alto e scende lungo il sinistro.
 */
const GIRO: Record<number, Posizione[]> = {
  3: ['destra-1', 'sinistra-1'],
  4: ['destra-1', 'alto', 'sinistra-1'],
  5: ['destra-1', 'destra-2', 'sinistra-2', 'sinistra-1'],
};

/**
 * La posizione di ogni posto del tavolo, indicizzata come i posti
 * dell'engine. Chi sta in basso e' di solito il giocatore di turno.
 */
export function disposizione(players: number, inBasso: number): Posizione[] {
  const giro = GIRO[players];
  if (giro === undefined) {
    throw new Error(`tavolo senza disposizione: ${players} giocatori`);
  }
  if (!Number.isInteger(inBasso) || inBasso < 0 || inBasso >= players) {
    throw new Error(`posto inesistente al tavolo: ${inBasso}`);
  }

  const posizioni: Posizione[] = new Array(players).fill('basso');
  for (let passo = 1; passo < players; passo += 1) {
    posizioni[(inBasso + passo) % players] = giro[passo - 1] as Posizione;
  }
  return posizioni;
}

/** I lati hanno il nome scritto per lungo: in verticale ci stanno in poco. */
export function eDiLato(posizione: Posizione): boolean {
  return posizione.startsWith('sinistra') || posizione.startsWith('destra');
}

const PENDENZA_MASSIMA = 6;

/**
 * Di quanto sta storta una carta appoggiata sul tavolo. Deriva dall'id, non
 * dal caso: la stessa carta pende sempre allo stesso modo, cosi' non balla a
 * ogni ridisegno di React.
 */
export function inclinazione(cardId: string): number {
  let somma = 0;
  for (let i = 0; i < cardId.length; i += 1) {
    somma = (somma * 31 + cardId.charCodeAt(i)) % 9973;
  }
  return (somma % (PENDENZA_MASSIMA * 2 + 1)) - PENDENZA_MASSIMA;
}
