import { describe, expect, it } from 'vitest';
import type { Card, Variant } from '@mediatore/engine';
import { createRng } from '@mediatore/engine';
import type { Agent } from './agents.ts';
import { greedyAgent, randomAgent } from './agents.ts';
import type { PlayResult } from './play.ts';
import { playHand } from './play.ts';

const TAVOLI: readonly (readonly [number, Variant])[] = [
  [3, 'monte'],
  [4, 'monte'],
  [5, 'monte'],
  [5, 'amico'],
];

function agentsFor(players: number, seed: number): Agent[] {
  return Array.from({ length: players }, (_, seat) =>
    seat % 2 === 0
      ? greedyAgent(createRng(seed * 31 + seat))
      : randomAgent(createRng(seed * 17 + seat)),
  );
}

function run(players: number, variant: Variant, seed: number): PlayResult {
  return playHand({
    players,
    variant,
    dealer: seed % players,
    seed,
    agents: agentsFor(players, seed),
  });
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const RISULTATI = SEEDS.flatMap((seed) =>
  TAVOLI.map(([players, variant]) => ({ players, variant, seed, result: run(players, variant, seed) })),
);

describe('playHand: 200 smazzate simulate', () => {
  it('gioca tutte le configurazioni senza eccezioni', () => {
    expect(RISULTATI).toHaveLength(200);
  });

  it('rispetta le invarianti in ogni run', () => {
    for (const { result } of RISULTATI) {
      const { config, finalState, score, settlement } = result;
      expect(finalState.finished).toBe(true);
      expect(finalState.completedTricks).toHaveLength(config.tricks);
      expect(finalState.hands.every((hand) => hand.length === 0)).toBe(true);
      expect(score.perPlayer.reduce((sum, points) => sum + points, 0)).toBe(config.maxScore);
      expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
      expect(settlement).toHaveLength(config.players);
    }
  });

  it('non perde ne duplica carte', () => {
    for (const { result } of RISULTATI) {
      const deal = result.events.find((e) => e.type === 'deal');
      if (deal?.type !== 'deal') throw new Error('evento deal mancante');
      const tutte: Card[] = [...deal.hands.flat(), ...deal.monte];
      expect(tutte).toHaveLength(40);
      expect(new Set(tutte.map((card) => card.id)).size).toBe(40);
    }
  });

  it('fa giocare a ogni agent solo carte legali', () => {
    for (const { result } of RISULTATI) {
      const giocate = result.events.filter((e) => e.type === 'play');
      expect(giocate).toHaveLength(result.config.players * result.config.tricks);
    }
  });
});

describe('riproducibilita', () => {
  it('produce lo stesso risultato a parita di seed', () => {
    for (const [players, variant] of TAVOLI) {
      const a = run(players, variant, 12345);
      const b = run(players, variant, 12345);
      expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
      expect(a.score).toEqual(b.score);
      expect(a.settlement).toEqual(b.settlement);
    }
  });

  it('produce risultati diversi con seed diversi', () => {
    const a = run(5, 'monte', 1);
    const b = run(5, 'monte', 2);
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });
});

describe('invariante sugli agent', () => {
  it('fa fallire un agent che gioca una carta non legale', () => {
    const barare: Agent = (legal, state, me) => {
      const mano = state.hands[me] as Card[];
      const illegale = mano.find((card) => !legal.some((c) => c.id === card.id));
      return illegale ?? (legal[0] as Card);
    };

    // Il posto 1 rifiuta di rispondere a seme appena puo'.
    const agents = agentsFor(4, 7);
    agents[1] = barare;

    expect(() =>
      playHand({ players: 4, variant: 'monte', dealer: 0, seed: 7, agents }),
    ).toThrow(/fuori dalle mosse legali/);
  });

  it('mette il seed nel messaggio di errore, altrimenti il fallimento non e riproducibile', () => {
    const agents = agentsFor(4, 99);
    agents[1] = (legal, state, me) => {
      const mano = state.hands[me] as Card[];
      return mano.find((card) => !legal.some((c) => c.id === card.id)) ?? (legal[0] as Card);
    };

    expect(() =>
      playHand({ players: 4, variant: 'monte', dealer: 0, seed: 99, agents }),
    ).toThrow(/seed=99/);
  });
});

describe('copertura dei rami di gioco', () => {
  const lisci = RISULTATI.filter(({ result }) => result.finalState.alliance.kind === 'liscio');
  const conChiamata = RISULTATI.filter(({ result }) => result.finalState.alliance.kind !== 'liscio');
  const amico = RISULTATI.filter(({ result }) => result.finalState.alliance.kind === 'amico');

  it('esercita sia le smazzate chiamate sia i lisci', () => {
    expect(lisci.length).toBeGreaterThan(0);
    expect(conChiamata.length).toBeGreaterThan(0);
  });

  it('esercita lo scambio col monte', () => {
    const scambi = RISULTATI.filter(({ result }) =>
      result.events.some((e) => e.type === 'monteExchange'),
    );
    expect(scambi.length).toBeGreaterThan(0);
  });

  it('rivela l amico in ogni smazzata giocata in quella variante', () => {
    expect(amico.length).toBeGreaterThan(0);
    for (const { result } of amico) {
      const alliance = result.finalState.alliance;
      const rivelato = alliance.kind === 'amico' ? alliance.friend : null;
      // Nella variante amico tutte e 40 le carte vengono distribuite e giocate,
      // quindi la carta chiamata esce sempre: il caso "mai rivelato" non e'
      // raggiungibile in una smazzata completa.
      expect(rivelato).not.toBeNull();
      expect(result.events.some((e) => e.type === 'friendRevealed')).toBe(true);
    }
  });
});
