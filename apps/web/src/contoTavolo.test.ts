import { describe, expect, it } from 'vitest';
import { accodaQuote, sommaDelConto, totaliVuoti } from './contoTavolo';

describe('conto del tavolo', () => {
  it('parte da zero su ogni posto', () => {
    expect(totaliVuoti(4)).toEqual([0, 0, 0, 0]);
  });

  it('accumula per posto, non per nome', () => {
    const dopo = accodaQuote([2, -1, -1], [3, -1, -2]);
    expect(dopo).toEqual([5, -2, -3]);
    expect(sommaDelConto(dopo)).toBe(0);
  });

  it('un posto nuovo comincia da zero', () => {
    expect(accodaQuote([1, -1], [0, 0, 0])).toEqual([1, -1, 0]);
  });

  it('la somma dei totali resta zero se le quote tornano', () => {
    const dopo = accodaQuote(accodaQuote([3, -1, -2], [1, 2, -3]), [-4, -1, 5]);
    expect(sommaDelConto(dopo)).toBe(0);
  });
});
