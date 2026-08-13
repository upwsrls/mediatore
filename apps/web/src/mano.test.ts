import type { Card } from '@mediatore/engine';
import { createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { cartePerFila, dividiInFile, postiDellaMano } from './mano';

const mazzo = createDeck();
const nomi = (carte: Card[]): string[] => carte.map((c) => c.id);

/** Le prime n carte del mazzo bastano: qui conta solo dove finiscono. */
const prime = (n: number): Card[] => mazzo.slice(0, n);

describe('cartePerFila', () => {
  it('divide a meta quando le carte sono pari', () => {
    expect(cartePerFila(12)).toBe(6);
    expect(cartePerFila(6)).toBe(3);
    expect(cartePerFila(4)).toBe(2);
  });

  it('da la carta in piu alla fila di sopra quando sono dispari', () => {
    expect(cartePerFila(7)).toBe(4);
    expect(cartePerFila(5)).toBe(3);
  });

  it('regge anche la mano vuota', () => {
    expect(cartePerFila(0)).toBe(0);
  });
});

describe('dividiInFile', () => {
  it('tiene le file bilanciate a ogni giocata', () => {
    const attese: Array<[number, number]> = [
      [7, 4],
      [6, 3],
      [5, 3],
      [4, 2],
    ];
    for (const [carte, sopra] of attese) {
      const file = dividiInFile(prime(carte));
      expect([file.sopra.length, file.sotto.length]).toEqual([sopra, carte - sopra]);
    }
  });

  it('non cambia l ordine delle carte, solo dove si spezza', () => {
    const mano = prime(9);
    const file = dividiInFile(mano);
    expect(nomi([...file.sopra, ...file.sotto])).toEqual(nomi(mano));
  });
});

describe('postiDellaMano', () => {
  it('incolonna le due file quando hanno lo stesso numero di carte', () => {
    const posti = postiDellaMano(prime(6));
    expect(posti.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1, 0, 1]);
    expect(posti.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1, 0, 1]);
  });

  it('sfalsa di mezza colonna la fila corta, e viene una piramide', () => {
    const posti = postiDellaMano(prime(7));
    expect(posti.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(posti.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1, 0, 1]);
  });

  it('tiene le carte nell ordine ricevuto', () => {
    const mano = prime(5);
    expect(nomi(postiDellaMano(mano).map((p) => p.carta))).toEqual(nomi(mano));
  });

  it('mette l ultima carta rimasta al centro della fila di sopra', () => {
    expect(postiDellaMano(prime(1))).toEqual([{ carta: mazzo[0], riga: 0, scarto: 0 }]);
  });

  it('con l ingombro della mano intera le carte che arrivano riempiono i posti finali', () => {
    // Mentre si distribuisce la mano cresce dentro l'ingombro che avra' alla
    // fine: i posti sono quelli di sempre, e le prime carte occupano i primi.
    const intera = postiDellaMano(prime(9));
    for (let arrivate = 1; arrivate <= 9; arrivate += 1) {
      expect(postiDellaMano(prime(arrivate), 9)).toEqual(intera.slice(0, arrivate));
    }
  });

  it('con l ingombro piu piccolo della mano vale la mano', () => {
    // Il chiamante col monte si ritrova con piu' carte di quelle di partenza:
    // se l'ingombro fosse rimasto indietro, le ultime finirebbero fuori posto.
    expect(postiDellaMano(prime(7), 3)).toEqual(postiDellaMano(prime(7)));
  });
});
