import type { HandScore, HandState, Variant } from '@mediatore/engine';
import { createHandState, moltiplicatore, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  contoDellaPosta,
  costo,
  posta,
  quantoVale,
  sogliaDi,
  sogliaPiuBassa,
  spiegazioniSupplementi,
} from './chiamate';

describe('posta', () => {
  it('segue i moltiplicatori dell engine', () => {
    expect(posta('normale')).toBe(moltiplicatore('normale'));
    expect(posta('sola')).toBe(moltiplicatore('sola'));
    expect(posta('colonna')).toBe(moltiplicatore('colonna'));
    expect(posta('chiSeLaSente')).toBe(moltiplicatore('chiSeLaSente'));
  });

  it('parte dalla partita semplice quando non c e nessuna dichiarazione', () => {
    expect(posta(null)).toBe(moltiplicatore('normale'));
  });

  it('aggiunge una partita col cappotto', () => {
    expect(posta(null, true)).toBe(2);
    expect(posta('colonna', true)).toBe(5);
    expect(posta('chiSeLaSente', true)).toBe(6);
  });
});

describe('quantoVale', () => {
  it('ha una parola per ogni posta possibile, dalla semplice al sestuplo', () => {
    expect(quantoVale('normale')).toBe('vale semplice');
    expect(quantoVale('normale', true)).toBe('vale doppio');
    expect(quantoVale('sola')).toBe('vale triplo');
    expect(quantoVale('colonna')).toBe('vale quadruplo');
    expect(quantoVale('chiSeLaSente')).toBe('vale quintuplo');
    expect(quantoVale('chiSeLaSente', true)).toBe('vale sestuplo');
  });

  it('non cade mai sul ripiego generico nell arco raggiungibile', () => {
    const dette = (['normale', 'sola', 'colonna', 'chiSeLaSente'] as const).flatMap(
      (chiamata) => [quantoVale(chiamata), quantoVale(chiamata, true)],
    );
    expect(dette.every((detta) => !detta.includes('volte'))).toBe(true);
  });
});

describe('contoDellaPosta', () => {
  it('mostra da dove escono i numeri, addendo per addendo', () => {
    expect(contoDellaPosta('colonna', true, 0)).toBe('4x + 1x = 5x');
    expect(contoDellaPosta('normale', false, 2)).toBe('1x + 2x = 3x');
    expect(contoDellaPosta('colonna', true, 1)).toBe('4x + 1x + 1x = 6x');
    expect(contoDellaPosta(null, true, 0)).toBe('1x + 1x = 2x');
  });

  it('non scrive somme quando non c e niente da sommare', () => {
    expect(contoDellaPosta('normale', false, 0)).toBe('1x');
    expect(contoDellaPosta('colonna', false, 0)).toBe('4x');
  });
});

describe('sogliaDi', () => {
  it('trova il gradino che ha fatto scattare la penalita', () => {
    expect(sogliaDi(2, 3)).toBe(18);
    expect(sogliaDi(1, 3)).toBe(25);
    expect(sogliaDi(1, 4)).toBe(18);
    expect(sogliaDi(1, 5)).toBe(18);
  });

  it('non inventa soglie quando non c e penalita', () => {
    expect(sogliaDi(0, 3)).toBeNull();
  });

  it('la piu bassa e sempre il 18, a ogni tavolo', () => {
    expect([3, 4, 5].map(sogliaPiuBassa)).toEqual([18, 18, 18]);
  });
});

describe('spiegazioniSupplementi', () => {
  function tavolo(players: number, variant: Variant = 'monte'): HandState {
    return createHandState({
      config: tableConfig(players, variant),
      dealer: 0,
      trump: 'bastoni',
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      hands: Array.from({ length: players }, () => []),
      monte: [],
    });
  }

  function punteggio(cappotto: HandScore['cappotto'], penalitaSoglia: number): HandScore {
    return {
      perPlayer: [],
      reachedAtTrick: [],
      callerSide: 0,
      opponentSide: 0,
      threshold: 0,
      callerWins: false,
      tie: false,
      liscioLoser: null,
      liscioSecond: null,
      cappotto,
      cappottoDi: cappotto === null ? null : 1,
      penalitaSoglia,
    };
  }

  it('tace quando non c e nessun supplemento', () => {
    expect(spiegazioniSupplementi(punteggio(null, 0), tavolo(4))).toEqual([]);
  });

  it('dice il cappotto dalla parte giusta', () => {
    expect(spiegazioniSupplementi(punteggio('favore', 0), tavolo(4))).toEqual([
      'cappotto: tutte le basi',
    ]);
    expect(spiegazioniSupplementi(punteggio('contro', 0), tavolo(4))).toEqual([
      'cappotto: nemmeno una base',
    ]);
  });

  it('nomina la soglia giusta per il tavolo', () => {
    expect(spiegazioniSupplementi(punteggio(null, 1), tavolo(3))).toEqual([
      'sotto i 25 punti: una partita in piu',
    ]);
    expect(spiegazioniSupplementi(punteggio(null, 2), tavolo(3))).toEqual([
      'sotto i 18 punti: due partite in piu',
    ]);
    expect(spiegazioniSupplementi(punteggio(null, 1), tavolo(4))).toEqual([
      'sotto i 18 punti: una partita in piu',
    ]);
  });

  it('nell amico chiarisce che i punti sono della coppia', () => {
    expect(spiegazioniSupplementi(punteggio(null, 1), tavolo(5, 'amico'))).toEqual([
      'sotto i 18 punti della coppia: una partita in piu',
    ]);
  });

  it('elenca tutti i supplementi insieme, nell ordine del conto', () => {
    expect(spiegazioniSupplementi(punteggio('contro', 1), tavolo(4))).toEqual([
      'cappotto: nemmeno una base',
      'sotto i 18 punti: una partita in piu',
    ]);
  });
});

describe('costo', () => {
  it('scrive la posta in cifre', () => {
    expect(costo('sola')).toBe('3x');
    expect(costo('sola', true)).toBe('4x');
  });
});
