import { tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  CARTA_DISTRIBUITA_MS,
  carteDaDistribuire,
  chiRiceve,
  quanteNeHa,
} from './distribuzione';

describe('chiRiceve', () => {
  it('comincia dal primo di mano, che sta alla destra del cartaro', () => {
    expect(chiRiceve(0, 0, 4)).toBe(1);
    expect(chiRiceve(0, 3, 4)).toBe(0);
    expect(chiRiceve(0, 2, 5)).toBe(3);
  });

  it('gira sempre nello stesso verso, giro dopo giro', () => {
    const giro = [0, 1, 2, 3, 4, 5].map((indice) => chiRiceve(indice, 0, 3));
    expect(giro).toEqual([1, 2, 0, 1, 2, 0]);
  });
});

describe('quanteNeHa', () => {
  it('a carte non ancora distribuite non ne ha nessuno', () => {
    for (let seat = 0; seat < 4; seat += 1) {
      expect(quanteNeHa(0, seat, 0, 4)).toBe(0);
    }
  });

  it('durante il primo giro le ha solo chi e gia stato servito', () => {
    // Cartaro al posto 0: si parte dal 1, quindi con due carte date ne hanno
    // una il posto 1 e una il posto 2, e gli altri niente.
    expect(quanteNeHa(2, 1, 0, 4)).toBe(1);
    expect(quanteNeHa(2, 2, 0, 4)).toBe(1);
    expect(quanteNeHa(2, 3, 0, 4)).toBe(0);
    expect(quanteNeHa(2, 0, 0, 4)).toBe(0);
  });

  it('a giro chiuso ne hanno tutti lo stesso numero', () => {
    for (const players of [3, 4, 5]) {
      for (let giri = 1; giri <= 3; giri += 1) {
        for (let seat = 0; seat < players; seat += 1) {
          expect(quanteNeHa(giri * players, seat, 2 % players, players)).toBe(giri);
        }
      }
    }
  });

  it('la somma dei mazzetti e sempre quante ne sono uscite dal mazzo', () => {
    for (const players of [3, 4, 5]) {
      const { handSize } = tableConfig(players, 'monte');
      const quante = carteDaDistribuire(players, handSize);
      for (let date = 0; date <= quante; date += 1) {
        const somma = Array.from({ length: players }, (_, seat) =>
          quanteNeHa(date, seat, 1, players),
        ).reduce((totale, mazzetto) => totale + mazzetto, 0);
        expect(somma).toBe(date);
      }
    }
  });

  it('alla fine ognuno ha la sua mano intera, e nessuno ne ha di piu', () => {
    for (const players of [3, 4, 5]) {
      const { handSize } = tableConfig(players, 'monte');
      const quante = carteDaDistribuire(players, handSize);
      for (let seat = 0; seat < players; seat += 1) {
        expect(quanteNeHa(quante, seat, 0, players)).toBe(handSize);
      }
    }
  });
});

describe('il ritmo della distribuzione', () => {
  it('sta nei quattro o cinque secondi, che e quanto ci mette una mano vera', () => {
    for (const players of [3, 4, 5]) {
      const { handSize } = tableConfig(players, 'monte');
      const durata = carteDaDistribuire(players, handSize) * CARTA_DISTRIBUITA_MS;
      expect(durata).toBeGreaterThan(3000);
      expect(durata).toBeLessThan(6000);
    }
  });
});
