import { createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { altezzaCarta, chiTieneLaCarta, passoDelVentaglio, ventaglioDelPosto } from './spia';

const MAZZO = createDeck();

describe('il ventaglio delle carte scoperte', () => {
  it('quando ci stanno tutte non le accavalla', () => {
    expect(passoDelVentaglio(5, 34, 250)).toBe(34);
  });

  it('le stringe quel tanto che basta a starci', () => {
    // Dodici carte da 34 in 250: la prima intera, le altre a scaglioni di 19.
    const passo = passoDelVentaglio(12, 34, 250);
    expect(passo).toBe(19);
    expect(34 + 11 * passo).toBeLessThanOrEqual(250);
  });

  it("piuttosto che sparire esce dallo spazio: sotto la striscia minima non scende", () => {
    const passo = passoDelVentaglio(12, 34, 60);
    expect(passo).toBe(12);
  });

  it('con una carta sola non c e niente da accavallare', () => {
    expect(passoDelVentaglio(1, 34, 250)).toBe(34);
  });

  it('ai lati il ventaglio scende, sopra e sotto si allarga', () => {
    expect(ventaglioDelPosto('sinistra-1', 3, 12).inColonna).toBe(true);
    expect(ventaglioDelPosto('alto', 4, 9).inColonna).toBe(false);
    expect(ventaglioDelPosto('basso', 4, 9).inColonna).toBe(false);
  });

  it('di lato conta l altezza della carta, non la larghezza', () => {
    const ventaglio = ventaglioDelPosto('destra-1', 3, 12);
    expect(ventaglio.ingombro).toBe(altezzaCarta(ventaglio.larghezza));
    expect(ventaglio.passo).toBeLessThan(ventaglio.ingombro);
  });

  it('a cinque i lati sono in due a dividersi la colonna, e le carte si stringono', () => {
    const inDue = ventaglioDelPosto('sinistra-1', 5, 7);
    const dasolo = ventaglioDelPosto('sinistra-1', 3, 7);
    expect(inDue.passo).toBeLessThan(dasolo.passo);
  });
});

describe('chi tiene la carta chiamata', () => {
  const mani = [MAZZO.slice(0, 3), MAZZO.slice(3, 6), MAZZO.slice(6, 9)];

  it('la trova nella mano di chi ce l ha', () => {
    expect(chiTieneLaCarta(mani, MAZZO[4]?.id ?? '')).toBe(1);
  });

  it("torna null quando quella carta non e' piu' in mano a nessuno", () => {
    expect(chiTieneLaCarta(mani, MAZZO[30]?.id ?? '')).toBeNull();
  });
});
