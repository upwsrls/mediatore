import type { Card, Rank, Suit } from '@mediatore/engine';
import { createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { ordinaCarte, ordineDiMano, secondoOrdine } from './ordine';

const mazzo = createDeck();

function carta(suit: Suit, rank: Rank): Card {
  const trovata = mazzo.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

const nomi = (carte: Card[]): string[] => carte.map((c) => c.id);

describe('ordinaCarte', () => {
  it('mette il trionfo davanti a tutto', () => {
    const mano = [carta('coppe', 3), carta('spade', 7), carta('denari', 2)];
    expect(nomi(ordinaCarte(mano, 'spade'))).toEqual(['spade-7', 'denari-2', 'coppe-3']);
  });

  it('tiene denari, coppe, spade e bastoni in quest ordine', () => {
    const mano = [carta('bastoni', 4), carta('spade', 4), carta('coppe', 4), carta('denari', 4)];
    expect(nomi(ordinaCarte(mano, 'denari'))).toEqual([
      'denari-4',
      'coppe-4',
      'spade-4',
      'bastoni-4',
    ]);
  });

  it('dentro il seme va dalla piu forte alla piu debole', () => {
    const mano = [
      carta('coppe', 2),
      carta('coppe', 'asso'),
      carta('coppe', 7),
      carta('coppe', 're'),
      carta('coppe', 'fante'),
      carta('coppe', 6),
    ];
    expect(nomi(ordinaCarte(mano, 'denari'))).toEqual([
      'coppe-7',
      'coppe-asso',
      'coppe-re',
      'coppe-fante',
      'coppe-6',
      'coppe-2',
    ]);
  });

  it('non tocca la mano che riceve', () => {
    const mano = [carta('bastoni', 2), carta('denari', 7)];
    const copia = [...mano];
    ordinaCarte(mano, 'denari');
    expect(mano).toEqual(copia);
  });

  it('rimette in fila lo stesso mazzo comunque arrivi', () => {
    const alcune = [
      carta('bastoni', 5),
      carta('denari', 'cavallo'),
      carta('spade', 7),
      carta('coppe', 'asso'),
    ];
    const atteso = nomi(ordinaCarte(alcune, 'spade'));
    expect(nomi(ordinaCarte([...alcune].reverse(), 'spade'))).toEqual(atteso);
  });
});

describe('secondoOrdine', () => {
  it('tiene le posizioni decise a inizio smazzata mentre le carte se ne vanno', () => {
    const ordine = ordineDiMano(
      [carta('spade', 7), carta('denari', 3), carta('coppe', 're')],
      'spade',
    );
    const rimaste = [carta('coppe', 're'), carta('spade', 7)];
    expect(nomi(secondoOrdine(rimaste, ordine))).toEqual(['spade-7', 'coppe-re']);
  });

  it('mette in coda una carta che nell ordine non c e, invece di perderla', () => {
    const ordine = ordineDiMano([carta('spade', 7)], 'spade');
    const rimaste = [carta('denari', 2), carta('spade', 7)];
    expect(nomi(secondoOrdine(rimaste, ordine))).toEqual(['spade-7', 'denari-2']);
  });
});
