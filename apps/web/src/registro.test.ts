import { createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import type { Esito } from './registro';
import {
  annotaCarteScoperte,
  apriSmazzata,
  azzeraRegistro,
  chiudiSmazzata,
  contaSmazzate,
  iscriviti,
  registro,
} from './registro';

const MAZZO = createDeck();

function smazzataFinta(carteScoperte = false): void {
  apriSmazzata({
    seed: 7,
    giocatori: 3,
    variante: 'monte',
    mazziere: 0,
    trionfo: 'coppe',
    scoperta: null,
    mani: [MAZZO.slice(0, 2), MAZZO.slice(2, 4), MAZZO.slice(4, 6)],
    monte: [],
    controBot: false,
    postoUmano: null,
    carteScoperte,
    nomi: [],
  });
}

const ESITO: Esito = {
  punti: [10, 5, 5],
  quote: [2, -1, -1],
  chiamanteVince: true,
  pareggio: false,
  cappotto: null,
  cappottoDi: null,
  penalitaSoglia: 0,
  liscioPerde: null,
  scaduta: false,
};

describe('il quaderno delle partite', () => {
  it('tiene le smazzate chiuse', () => {
    smazzataFinta();
    chiudiSmazzata(ESITO, null);
    smazzataFinta();
    chiudiSmazzata(ESITO, null);
    expect(contaSmazzate()).toBe(2);
  });

  it('azzerarlo lo svuota e avvisa chi guarda il contatore', () => {
    let avvisi = 0;
    const smetti = iscriviti(() => {
      avvisi += 1;
    });

    azzeraRegistro();

    expect(contaSmazzate()).toBe(0);
    expect(registro().smazzate).toEqual([]);
    expect(avvisi).toBe(1);
    smetti();
  });

  it('dopo l azzeramento riparte da capo, senza strascichi', () => {
    smazzataFinta();
    chiudiSmazzata(ESITO, null);
    expect(contaSmazzate()).toBe(1);
  });

  it('azzera anche la smazzata rimasta aperta', () => {
    smazzataFinta();
    azzeraRegistro();
    // Chiuderla adesso non deve far ricomparire niente: quel foglio e' stato
    // strappato insieme agli altri.
    chiudiSmazzata(ESITO, null);
    expect(contaSmazzate()).toBe(0);
  });

  it('segna le smazzate giocate a carte scoperte', () => {
    azzeraRegistro();
    smazzataFinta(true);
    chiudiSmazzata(ESITO, null);
    expect(registro().smazzate[0]?.carteScoperte).toBe(true);
  });

  it('le carte scoperte a meta smazzata segnano lo stesso, e il segno non si toglie', () => {
    azzeraRegistro();
    smazzataFinta();
    annotaCarteScoperte();
    chiudiSmazzata(ESITO, null);
    expect(registro().smazzate[0]?.carteScoperte).toBe(true);
  });
});
