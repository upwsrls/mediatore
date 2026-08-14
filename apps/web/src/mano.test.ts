import type { Card } from '@mediatore/engine';
import { createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { cartePerFila, dividiInFile, eFilaUnica, postiDellaMano, sogliaFilaUnica } from './mano';

const mazzo = createDeck();
const nomi = (carte: Card[]): string[] => carte.map((c) => c.id);

/** Le prime n carte del mazzo bastano: qui conta solo dove finiscono. */
const prime = (n: number): Card[] => mazzo.slice(0, n);

/** I tre tavoli veri: carte di partenza e carte che regge una fila. */
const TAVOLI = [
  { giocatori: 3, iniziali: 12, perFila: 6 },
  { giocatori: 4, iniziali: 9, perFila: 5 },
  { giocatori: 5, iniziali: 7, perFila: 4 },
];

describe('cartePerFila', () => {
  it('taglia sulla meta delle carte di partenza, tavolo per tavolo', () => {
    for (const tavolo of TAVOLI) {
      expect(cartePerFila(tavolo.iniziali), `${tavolo.giocatori} giocatori`).toBe(tavolo.perFila);
    }
  });

  it('da la carta in piu alla fila di sopra quando sono dispari', () => {
    expect(cartePerFila(7)).toBe(4);
    expect(cartePerFila(5)).toBe(3);
  });

  it('regge anche la mano vuota', () => {
    expect(cartePerFila(0)).toBe(0);
  });
});

describe('sogliaFilaUnica', () => {
  it('non chiede a una fila piu carte di quante ne regge', () => {
    // La larghezza della carta e' tagliata sulle carte per fila: chiedere a una
    // fila di tenerne di piu' significa mandarle fuori dallo schermo.
    for (const tavolo of TAVOLI) {
      expect(sogliaFilaUnica(tavolo.perFila), `${tavolo.giocatori} giocatori`).toBe(
        Math.min(6, tavolo.perFila),
      );
      expect(sogliaFilaUnica(tavolo.perFila)).toBeLessThanOrEqual(tavolo.perFila);
    }
  });

  it('si ferma a sei anche quando la fila ne terrebbe di piu', () => {
    expect(sogliaFilaUnica(6)).toBe(6);
    expect(sogliaFilaUnica(8)).toBe(6);
    expect(sogliaFilaUnica(10)).toBe(6);
  });
});

describe('eFilaUnica', () => {
  it('la mano si mette in fila appena ci sta, tavolo per tavolo', () => {
    const attese: Record<number, number> = { 3: 6, 4: 5, 5: 4 };
    for (const tavolo of TAVOLI) {
      const soglia = attese[tavolo.giocatori] as number;
      for (let rimaste = 0; rimaste <= tavolo.iniziali; rimaste += 1) {
        expect(eFilaUnica(rimaste, tavolo.perFila), `${tavolo.giocatori}g, ${rimaste} carte`).toBe(
          rimaste <= soglia,
        );
      }
    }
  });
});

describe('dividiInFile', () => {
  it('tiene le file bilanciate a ogni giocata', () => {
    // A 5 giocatori la fila ne regge quattro: sette carte fanno quattro e tre.
    const attese: Array<[number, number]> = [
      [7, 4],
      [6, 3],
      [5, 3],
    ];
    for (const [carte, sopra] of attese) {
      const file = dividiInFile(prime(carte), 4);
      expect([file.sopra.length, file.sotto.length], `${carte}`).toEqual([sopra, carte - sopra]);
    }
  });

  it('appena le carte ci stanno in fila non spezza niente', () => {
    for (const carte of [4, 3, 2, 1]) {
      const file = dividiInFile(prime(carte), 4);
      expect([file.sopra.length, file.sotto.length], `${carte}`).toEqual([carte, 0]);
    }
    // In tre la fila ne regge sei, e sei carte ci stanno tutte.
    const sei = dividiInFile(prime(6), 6);
    expect([sei.sopra.length, sei.sotto.length]).toEqual([6, 0]);
  });

  it('non cambia l ordine delle carte, solo dove si spezza', () => {
    const mano = prime(9);
    const file = dividiInFile(mano, 5);
    expect(nomi([...file.sopra, ...file.sotto])).toEqual(nomi(mano));
  });
});

describe('postiDellaMano', () => {
  it('incolonna le due file quando hanno lo stesso numero di carte', () => {
    const posti = postiDellaMano(prime(8), 4);
    expect(posti.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(posti.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
  });

  it('sfalsa di mezza colonna la fila corta, e viene una piramide', () => {
    const posti = postiDellaMano(prime(7), 4);
    expect(posti.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(posti.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1, 0, 1]);
  });

  it('in cinque passa a una fila a quattro carte', () => {
    const cinque = postiDellaMano(prime(5), 4);
    expect(cinque.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1, 0, 1]);
    expect(cinque.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-0.5, 0.5]);

    const quattro = postiDellaMano(prime(4), 4);
    expect(quattro.every((p) => p.riga === 0)).toBe(true);
    expect(quattro.map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
  });

  it('in quattro passa a una fila a cinque carte', () => {
    const sei = postiDellaMano(prime(6), 5);
    expect(sei.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1, 0, 1]);
    expect(sei.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1, 0, 1]);

    const cinque = postiDellaMano(prime(5), 5);
    expect(cinque.every((p) => p.riga === 0)).toBe(true);
    expect(cinque.map((p) => p.scarto)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('in tre passa a una fila a sei carte', () => {
    const sette = postiDellaMano(prime(7), 6);
    expect(sette.filter((p) => p.riga === 0).map((p) => p.scarto)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(sette.filter((p) => p.riga === 1).map((p) => p.scarto)).toEqual([-1, 0, 1]);

    const sei = postiDellaMano(prime(6), 6);
    expect(sei.every((p) => p.riga === 0)).toBe(true);
    expect(sei.map((p) => p.scarto)).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
  });

  it('nessuna fila tiene piu carte di quante il tavolo ne regge', () => {
    // E' il vincolo che tiene le carte dentro lo schermo: la larghezza e'
    // tagliata sulle carte per fila, e nessuna fila puo' sforarle.
    for (const tavolo of TAVOLI) {
      for (let rimaste = 0; rimaste <= tavolo.iniziali; rimaste += 1) {
        const posti = postiDellaMano(prime(rimaste), tavolo.perFila);
        for (const riga of [0, 1]) {
          const quante = posti.filter((p) => p.riga === riga).length;
          const dove = `${tavolo.giocatori}g, ${rimaste} carte, fila ${riga}`;
          expect(quante, dove).toBeLessThanOrEqual(tavolo.perFila);
        }
      }
    }
  });

  it('le ultime carte restano in fila e centrate', () => {
    expect(postiDellaMano(prime(3), 4).map((p) => p.scarto)).toEqual([-1, 0, 1]);
    expect(postiDellaMano(prime(2), 4).map((p) => p.scarto)).toEqual([-0.5, 0.5]);
    for (const carte of [3, 2]) {
      expect(postiDellaMano(prime(carte), 4).every((p) => p.riga === 0), `${carte}`).toBe(true);
    }
  });

  it('tiene le carte nell ordine ricevuto', () => {
    const mano = prime(5);
    expect(nomi(postiDellaMano(mano, 4).map((p) => p.carta))).toEqual(nomi(mano));
  });

  it('mette l ultima carta rimasta al centro della fila di sopra', () => {
    expect(postiDellaMano(prime(1), 4)).toEqual([{ carta: mazzo[0], riga: 0, scarto: 0 }]);
  });

  it('con l ingombro della mano intera le carte che arrivano riempiono i posti finali', () => {
    // Mentre si distribuisce la mano cresce dentro l'ingombro che avra' alla
    // fine: i posti sono quelli di sempre, e le prime carte occupano i primi.
    const intera = postiDellaMano(prime(9), 5);
    for (let arrivate = 1; arrivate <= 9; arrivate += 1) {
      expect(postiDellaMano(prime(arrivate), 5, 9)).toEqual(intera.slice(0, arrivate));
    }
  });

  it('con l ingombro piu piccolo della mano vale la mano', () => {
    // Il chiamante col monte si ritrova con piu' carte di quelle di partenza:
    // se l'ingombro fosse rimasto indietro, le ultime finirebbero fuori posto.
    expect(postiDellaMano(prime(7), 4, 3)).toEqual(postiDellaMano(prime(7), 4));
  });
});
