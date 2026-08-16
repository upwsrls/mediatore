/**
 * Il conto del tavolo, per posto: chi esce chiude, chi arriva parte da zero.
 * I nomi non c'entrano — coi bot cambiano a ogni tavolo nuovo.
 */

export function totaliVuoti(posti: number): number[] {
  return Array.from({ length: posti }, () => 0);
}

/** Aggiunge le quote di una giocata al totale accumulato. */
export function accodaQuote(totali: readonly number[], quote: readonly number[]): number[] {
  const posti = Math.max(totali.length, quote.length);
  return Array.from({ length: posti }, (_, i) => (totali[i] ?? 0) + (quote[i] ?? 0));
}

export function sommaDelConto(valori: readonly number[]): number {
  return valori.reduce((totale, n) => totale + n, 0);
}
