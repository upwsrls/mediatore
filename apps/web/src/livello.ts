/**
 * Il livello del tavolo. Non e' una difficolta' — le regole, le carte e i bot
 * sono gli stessi — sono gli aiuti che il tavolo tiene a schermo:
 *
 * principiante: i punti di ognuno che salgono base dopo base, e il conto dei
 *   trionfi usciti, quello che al tavolo si tiene a mente;
 * esperto: niente. I punti si contano da soli e si vedono alla fine, come al
 *   bar, e i trionfi li conta chi gioca.
 *
 * Col server sara' una scelta del tavolo, fissata prima di distribuire: per
 * ora si cambia anche a smazzata avviata, che serve a provare.
 */
export type Livello = 'principiante' | 'esperto';

export const LIVELLI: readonly Livello[] = ['principiante', 'esperto'];

/** Unico posto in cui si decide se il tavolo aiuta o sta a guardare. */
export function conAiuti(livello: Livello): boolean {
  return livello === 'principiante';
}

/** L'altro dei due: il comando sul tavolo non fa che rimbalzare fra i due. */
export function livelloOpposto(livello: Livello): Livello {
  return livello === 'principiante' ? 'esperto' : 'principiante';
}
