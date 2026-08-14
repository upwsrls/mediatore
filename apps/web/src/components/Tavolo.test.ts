import { describe, expect, it } from 'vitest';
import { monteInCima } from './Tavolo';

const scoperta = { id: 'bastoni-7', suit: 'bastoni' as const, rank: 7 as const };
const coperta = { id: 'denari-2', suit: 'denari' as const, rank: 2 as const };
const monte = [coperta, scoperta];

describe('monteInCima', () => {
  it('nella normale sparisce: quelle carte se le e prese il chiamante', () => {
    expect(monteInCima('normale', scoperta, monte)).toBeNull();
  });

  it('nella sola resta solo la carta che attesta il trionfo', () => {
    expect(monteInCima('sola', scoperta, monte)).toEqual({ scoperta, coperte: [] });
  });

  it('nella colonna e nella chi se la sente il monte non si muove', () => {
    const intero = { scoperta, coperte: [coperta] };
    expect(monteInCima('colonna', scoperta, monte)).toEqual(intero);
    expect(monteInCima('chiSeLaSente', scoperta, monte)).toEqual(intero);
  });

  it('nel liscio resta al centro per tutta la smazzata', () => {
    expect(monteInCima(null, scoperta, monte)).toEqual({ scoperta, coperte: [coperta] });
  });

  it('senza monte non c e niente da mettere in cima', () => {
    expect(monteInCima('colonna', scoperta, [])).toBeNull();
  });
});
