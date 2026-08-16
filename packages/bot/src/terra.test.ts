import type { Alliance, Card, HandState, Rank, Suit } from '@mediatore/engine';
import {
  createDeck,
  createHandState,
  playCard,
  scoreHand,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { completaMettendoATerra, puoMettereATerra } from './terra.ts';
import { vistaDaStato } from './vista.ts';

const MAZZO = createDeck();
const TRIONFO: Suit = 'bastoni';

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

function trionfiNelMonte(...esclusi: Rank[]): Card[] {
  const fuori = new Set<Rank>(esclusi);
  return MAZZO.filter((c) => c.suit === TRIONFO && !fuori.has(c.rank));
}

function tavolo(args: {
  mani: Card[][];
  monte?: Card[];
  leader?: number;
  tricks?: number;
  alliance?: Alliance;
}): HandState {
  const players = args.mani.length;
  const config = tableConfig(players, 'monte');
  return createHandState({
    config: args.tricks !== undefined ? { ...config, tricks: args.tricks } : config,
    dealer: 0,
    trump: TRIONFO,
    alliance: args.alliance ?? { kind: 'monte', caller: 0, chiamata: 'normale' },
    hands: args.mani,
    monte: args.monte ?? [],
    leader: args.leader ?? 0,
  });
}

describe('puoMettereATerra', () => {
  it('si accende con solo i trionfi piu alti rimasti', () => {
    const state = tavolo({
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso')],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso'),
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(true);
  });

  it('resta spento se un avversario ha un trionfo piu alto', () => {
    const state = tavolo({
      mani: [
        [carta(TRIONFO, 'asso'), carta(TRIONFO, 're')],
        [carta(TRIONFO, 7), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso', 're'),
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(false);
  });

  it('si accende con laterali comandanti e nessun trionfo in giro', () => {
    const state = tavolo({
      mani: [
        [carta('coppe', 7), carta('spade', 7)],
        [carta('coppe', 3), carta('spade', 4)],
        [carta('coppe', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(),
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(true);
  });

  it('resta spento se le laterali comandano ma c e un trionfo in giro', () => {
    const state = tavolo({
      mani: [
        [carta('coppe', 7), carta('spade', 7)],
        [carta(TRIONFO, 2), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(2),
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(false);
  });

  it('resta spento se in mezzo alle firme c e una scartina', () => {
    const state = tavolo({
      mani: [
        [carta(TRIONFO, 7), carta('coppe', 2)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(7),
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(false);
  });

  it('resta spento se non e il suo turno', () => {
    const state = tavolo({
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso')],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso'),
      leader: 1,
    });
    expect(puoMettereATerra(vistaDaStato(state, 0))).toBe(false);
  });

  it('resta spento se la presa in corso la puo ancora perdere', () => {
    const aperto = tavolo({
      mani: [
        [carta('coppe', 2), carta(TRIONFO, 7)],
        [carta('coppe', 'asso'), carta('spade', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte: trionfiNelMonte(7),
      leader: 1,
    });
    const inCorso = playCard(aperto, 1, carta('coppe', 'asso').id);
    const dopoIlTerzo = playCard(inCorso, 2, carta('spade', 5).id);
    // Deve rispondere al coppe: il 2 perde dall'asso, il trionfo non si tira.
    expect(dopoIlTerzo.turn).toBe(0);
    expect(puoMettereATerra(vistaDaStato(dopoIlTerzo, 0))).toBe(false);
  });
});

describe('completaMettendoATerra', () => {
  it('gli assegna tutte le basi rimaste e il monte sull ultima', () => {
    const monte = [carta('denari', 'asso'), carta('denari', 3)];
    const state = tavolo({
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso')],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      monte,
      tricks: 2,
    });
    const finale = completaMettendoATerra(state, 0);
    expect(finale.finished).toBe(true);
    expect(finale.completedTricks).toHaveLength(2);
    expect(finale.completedTricks.every((base) => base.winner === 0)).toBe(true);
    const score = scoreHand(finale);
    // 7 e asso di trionfo (5+4), due basi, monte (asso di denari 4 + 1).
    expect(score.perPlayer[0]).toBe(16);
    expect(score.perPlayer[1]).toBe(0);
    expect(score.perPlayer[2]).toBe(0);
  });
});
