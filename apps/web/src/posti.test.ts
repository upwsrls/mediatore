import { describe, expect, it } from 'vitest';
import type { Posizione } from './posti';
import { disposizione, eDiLato, inclinazione, sfalsoNelMazzetto } from './posti';

/** Il giro del tavolo a partire da chi sta in basso, nell'ordine di gioco. */
function giroDa(players: number, inBasso: number): Posizione[] {
  const posizioni = disposizione(players, inBasso);
  return Array.from(
    { length: players },
    (_, passo) => posizioni[(inBasso + passo) % players] as Posizione,
  );
}

describe('disposizione', () => {
  // Si gira in senso antiorario: il primo dopo chi guarda gli siede a destra.
  it('mette a destra il primo e a sinistra il secondo, in tre', () => {
    expect(giroDa(3, 0)).toEqual(['basso', 'destra-1', 'sinistra-1']);
  });

  it('riempie anche il posto in alto, in quattro', () => {
    expect(giroDa(4, 0)).toEqual(['basso', 'destra-1', 'alto', 'sinistra-1']);
  });

  it('mette due per lato e nessuno in alto, in cinque', () => {
    expect(giroDa(5, 0)).toEqual([
      'basso',
      'destra-1',
      'destra-2',
      'sinistra-2',
      'sinistra-1',
    ]);
  });

  it('gira il tavolo intorno a chiunque stia in basso', () => {
    for (const players of [3, 4, 5]) {
      const atteso = giroDa(players, 0);
      for (let inBasso = 0; inBasso < players; inBasso += 1) {
        expect(giroDa(players, inBasso)).toEqual(atteso);
        expect(disposizione(players, inBasso)[inBasso]).toBe('basso');
      }
    }
  });

  it('da un posto diverso a ciascuno', () => {
    for (const players of [3, 4, 5]) {
      for (let inBasso = 0; inBasso < players; inBasso += 1) {
        const posizioni = disposizione(players, inBasso);
        expect(posizioni).toHaveLength(players);
        expect(new Set(posizioni).size).toBe(players);
      }
    }
  });

  it('sale lungo il lato destro e scende lungo il sinistro', () => {
    // Chi e' piu' avanti nel giro sta piu' in alto: destra-2 e sinistra-2
    // sono i posti lontani, destra-1 e sinistra-1 quelli vicini a chi guarda.
    const posizioni = disposizione(5, 3);
    expect(posizioni[4]).toBe('destra-1');
    expect(posizioni[0]).toBe('destra-2');
    expect(posizioni[1]).toBe('sinistra-2');
    expect(posizioni[2]).toBe('sinistra-1');
  });

  /**
   * La prova del senso di gioco: presa la disposizione, si segue il turno
   * come lo fa avanzare l'engine e si guarda dove finisce l'evidenza. Deve
   * scendere lungo il lato destro dal basso, passare in alto e tornare giu'
   * a sinistra, cioe' muoversi sempre verso sinistra a schermo.
   */
  it("l'evidenza del turno gira in senso antiorario, come al tavolo", () => {
    const versoSinistra: Record<Posizione, number> = {
      'destra-1': 0,
      'destra-2': 1,
      alto: 2,
      'sinistra-2': 3,
      'sinistra-1': 4,
      basso: 5,
    };

    for (const players of [3, 4, 5]) {
      for (let inBasso = 0; inBasso < players; inBasso += 1) {
        const posizioni = disposizione(players, inBasso);
        const percorso = Array.from(
          { length: players },
          (_, passo) => versoSinistra[posizioni[(inBasso + passo) % players] as Posizione],
        );
        // Il primo e' chi guarda, in basso; da li' in poi si va verso sinistra.
        expect(percorso[0]).toBe(versoSinistra.basso);
        const giro = percorso.slice(1);
        expect(giro).toEqual([...giro].sort((a, b) => (a ?? 0) - (b ?? 0)));
      }
    }
  });

  it('rifiuta i tavoli che non sa apparecchiare', () => {
    expect(() => disposizione(2, 0)).toThrow(/senza disposizione/);
    expect(() => disposizione(6, 0)).toThrow(/senza disposizione/);
  });

  it('rifiuta un posto fuori dal tavolo', () => {
    expect(() => disposizione(4, 4)).toThrow(/inesistente/);
    expect(() => disposizione(4, -1)).toThrow(/inesistente/);
  });
});

describe('eDiLato', () => {
  it('riconosce i posti dove le carte scendono invece di allargarsi', () => {
    expect(eDiLato('sinistra-1')).toBe(true);
    expect(eDiLato('destra-2')).toBe(true);
    expect(eDiLato('alto')).toBe(false);
    expect(eDiLato('basso')).toBe(false);
  });
});

describe('sfalsoNelMazzetto', () => {
  it('sfalsa sempre nello stesso modo la stessa carta', () => {
    expect(sfalsoNelMazzetto('denari-re')).toEqual(sfalsoNelMazzetto('denari-re'));
  });

  it('resta di pochi pixel, e non mette tutte le carte nello stesso punto', () => {
    const carte = ['denari-asso', 'coppe-3', 'spade-7', 'bastoni-re', 'denari-2'];
    const scarti = carte.map((id) => sfalsoNelMazzetto(id));
    for (const { x, y } of scarti) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(4);
      expect(Math.abs(y)).toBeLessThanOrEqual(4);
    }
    // Un mazzetto, non una pila: le carte non finiscono tutte sovrapposte.
    expect(new Set(scarti.map(({ x, y }) => `${x},${y}`)).size).toBeGreaterThan(1);
  });

  it('non sfalsa dove pende: due segni diversi presi dallo stesso id', () => {
    const carte = ['denari-asso', 'coppe-3', 'spade-7', 'bastoni-re', 'denari-2', 'coppe-fante'];
    const coppie = carte.map((id) => `${inclinazione(id)}:${sfalsoNelMazzetto(id).x}`);
    expect(new Set(coppie).size).toBeGreaterThan(1);
  });
});

describe('inclinazione', () => {
  it('da sempre la stessa pendenza alla stessa carta', () => {
    expect(inclinazione('denari-re')).toBe(inclinazione('denari-re'));
  });

  it('resta entro pochi gradi, e non e sempre la stessa', () => {
    const carte = ['denari-asso', 'coppe-3', 'spade-7', 'bastoni-re', 'denari-2'];
    const gradi = carte.map((id) => inclinazione(id));
    for (const grado of gradi) {
      expect(Number.isInteger(grado)).toBe(true);
      expect(Math.abs(grado)).toBeLessThanOrEqual(6);
    }
    expect(new Set(gradi).size).toBeGreaterThan(1);
  });
});
