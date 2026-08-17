import { describe, expect, it } from 'vitest';
import { fotografiaDelTavolo, type Session } from './useHand';

describe('fotografiaDelTavolo', () => {
  it('scrive fase, turno e carte in mano di ognuno', () => {
    const session = {
      phase: 'play',
      hands: [],
      terra: null,
      state: {
        turn: 2,
        hands: [[{ id: 'c1' }], [], [{ id: 'c3' }]],
        currentTrick: {
          plays: [
            { player: 0, card: { id: 'c0' } },
            { player: 1, card: { id: 'c2' } },
          ],
        },
        completedTricks: new Array(7),
      },
    } as unknown as Session;

    expect(fotografiaDelTavolo(session, null)).toEqual({
      fase: 'play',
      turno: 2,
      carteInMano: [
        { posto: 0, quante: 1, carte: ['c1'] },
        { posto: 1, quante: 0, carte: [] },
        { posto: 2, quante: 1, carte: ['c3'] },
      ],
      inTavola: [
        { posto: 0, carta: 'c0' },
        { posto: 1, carta: 'c2' },
      ],
      basiFatte: 7,
      terra: null,
      pausa: null,
    });
  });
});
