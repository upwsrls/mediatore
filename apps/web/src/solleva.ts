/**
 * Due tocchi per giocare: il primo solleva, il secondo sulla stessa parte.
 * Un tocco su un'altra carta cambia idea; non e' un doppio tocco veloce.
 */
export function toccoDellaMano(
  sollevata: string | null,
  toccata: string,
): { sollevata: string | null; gioca: boolean } {
  if (sollevata === toccata) return { sollevata: null, gioca: true };
  return { sollevata: toccata, gioca: false };
}
