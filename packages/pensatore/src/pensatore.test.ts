import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { VistaDelBot } from '@mediatore/bot';
import { eSemeFinito, scegliCarta, vistaDaStato } from '@mediatore/bot';
import type { Card, Rank, Suit } from '@mediatore/engine';
import {
  createDeck,
  createHandState,
  createRng,
  playCard,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { mondiPossibili } from './mondi.ts';
import { misuraCarte, scegliCartaPensando } from './pensa.ts';
import { simulaSmazzata, statoDalMondo } from './simula.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

const MAZZO = createDeck();

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

function legge(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

function vistaAMeta(seed: number): VistaDelBot {
  let trovata: VistaDelBot | null = null;
  const tavolo = TAVOLI[0];
  if (tavolo === undefined) throw new Error('manca il tavolo a tre');
  giocaSmazzata({
    tavolo,
    dealer: 0,
    seed,
    scegli: (vista, rng) => {
      if (trovata === null && vista.legali.length >= 2 && vista.preseCompletate.length >= 1) {
        trovata = vista;
      }
      return scegliCarta(vista, rng);
    },
  });
  if (trovata === null) throw new Error(`nessuna vista a meta smazzata (seed ${seed})`);
  return trovata;
}

describe('i mondi rispettano quello che si e visto', () => {
  it('ogni giocatore riceve esattamente le carte che ha, e il monte le sue', () => {
    const vista = vistaAMeta(11);
    const mondi = mondiPossibili(vista, 20, createRng(3));
    expect(mondi.length).toBe(20);
    for (const mondo of mondi) {
      expect(mondo.mani).toHaveLength(vista.config.players);
      expect(mondo.mani[vista.io]?.map((c) => c.id).sort()).toEqual(
        [...vista.mano].map((c) => c.id).sort(),
      );
      for (let seat = 0; seat < vista.config.players; seat += 1) {
        expect(mondo.mani[seat]?.length).toBe(vista.carteInMano[seat]);
      }
      expect(mondo.monte.length).toBe(vista.monteCoperto);
    }
  });

  it('chi non ha risposto a un palo non riceve carte di quel palo', () => {
    const tavolo = TAVOLI[0];
    if (tavolo === undefined) throw new Error('manca il tavolo a tre');
    const trovati: { vista: VistaDelBot; seat: number; palo: Suit }[] = [];
    giocaSmazzata({
      tavolo,
      dealer: 0,
      seed: 21,
      scegli: (vista, rng) => {
        if (trovati.length === 0) {
          for (let seat = 0; seat < vista.config.players; seat += 1) {
            if (seat === vista.io) continue;
            for (const palo of ['denari', 'coppe', 'spade', 'bastoni'] as const) {
              if (!eSemeFinito(vista, seat, palo)) continue;
              trovati.push({ vista, seat, palo });
              break;
            }
          }
        }
        return scegliCarta(vista, rng);
      },
    });
    const caso = trovati[0];
    if (caso === undefined) throw new Error('nessun vuoto in questa smazzata');
    const mondi = mondiPossibili(caso.vista, 24, createRng(5));
    expect(mondi.length).toBe(24);
    for (const mondo of mondi) {
      const mano = mondo.mani[caso.seat] ?? [];
      expect(mano.some((c) => c.suit === caso.palo)).toBe(false);
    }
  });

  it('la carta chiamata dell amico, se e nascosta, sta in una mano', () => {
    const tavolo = TAVOLI.find((t) => t.id === 'amico');
    if (tavolo === undefined) throw new Error('manca il tavolo amico');
    const viste: VistaDelBot[] = [];
    giocaSmazzata({
      tavolo,
      dealer: 0,
      seed: 8,
      scegli: (vistaOra, rng) => {
        if (viste.length > 0) return scegliCarta(vistaOra, rng);
        if (vistaOra.alliance.kind !== 'amico') return scegliCarta(vistaOra, rng);
        const chiamata = vistaOra.alliance.calledCard;
        if (!vistaOra.mano.some((c) => c.id === chiamata)) viste.push(vistaOra);
        return scegliCarta(vistaOra, rng);
      },
    });
    const vista = viste[0];
    if (vista === undefined) throw new Error('nessuna vista amico con la carta nascosta');
    if (vista.alliance.kind !== 'amico') throw new Error('attesa una chiamata amico');
    const chiamata = vista.alliance.calledCard;
    const mondi = mondiPossibili(vista, 16, createRng(8));
    expect(mondi.length).toBeGreaterThan(0);
    for (const mondo of mondi) {
      expect(mondo.mani.flat().some((c) => c.id === chiamata)).toBe(true);
      expect(mondo.monte.some((c) => c.id === chiamata)).toBe(false);
    }
  });

  it('lo stesso seme produce gli stessi mondi', () => {
    const vista = vistaAMeta(4);
    const una = mondiPossibili(vista, 8, createRng(9));
    const altra = mondiPossibili(vista, 8, createRng(9));
    expect(una).toEqual(altra);
  });
});

describe('la simulazione', () => {
  it('chiude in pari e torna la quota del bot', () => {
    const vista = vistaAMeta(6);
    const mondi = mondiPossibili(vista, 4, createRng(2));
    expect(mondi.length).toBeGreaterThan(0);
    for (const mondo of mondi) {
      const state = statoDalMondo(vista, mondo);
      expect(state.turn).toBe(vista.io);
      expect(state.hands[vista.io]?.map((c) => c.id).sort()).toEqual(
        [...vista.mano].map((c) => c.id).sort(),
      );
      const legale = vista.legali[0];
      if (legale === undefined) throw new Error('manca una legale');
      const quota = simulaSmazzata(vista, mondo, legale, createRng(1));
      expect(Number.isFinite(quota)).toBe(true);
    }
  });

  it('ogni giocatore simulato riceve la vista, non lo stato', () => {
    expect(legge('./simula.ts')).toMatch(/vistaDaStato/);
    expect(legge('./simula.ts')).toMatch(/scegliCarta/);
    expect(legge('./pensa.ts')).not.toMatch(/HandState/);
    expect(legge('./mondi.ts')).not.toMatch(/HandState/);
  });

  it('il difensore fa pensare i compagni, il chiamante no', () => {
    expect(legge('./pensa.ts')).toMatch(/eCompagnoDaSimulare/);
    expect(legge('./pensa.ts')).toMatch(/mondiCompagni: 0/);
  });

  it('il punteggio del difensore guarda i punti della sua parte, non solo la quota', () => {
    expect(legge('./simula.ts')).toMatch(/opponentSide/);
    expect(legge('./simula.ts')).toMatch(/punteggioDellaSimulazione/);
  });

  it('il tempo si legge anche in pagina, non solo in node', () => {
    expect(legge('./pensa.ts')).toMatch(/performance\.now/);
    expect(legge('./pensa.ts')).not.toMatch(/process\.hrtime/);
  });
});

describe('la scelta pensante', () => {
  it('con una sola mossa legale la gioca senza simulare', () => {
    const state = createHandState({
      config: tableConfig(3, 'monte'),
      dealer: 0,
      trump: 'coppe',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      hands: [
        [carta('denari', 2), carta('coppe', 3)],
        [carta('denari', 3), carta('coppe', 4)],
        [carta('denari', 're'), carta('coppe', 7)],
      ],
      monte: [],
      leader: 0,
    });
    const dopo = playCard(playCard(state, 0, 'denari-2'), 1, 'denari-3');
    const vista = vistaDaStato(dopo, 2);
    expect(vista.legali).toHaveLength(1);
    const scelta = scegliCartaPensando(vista, { mondi: 50, tempoMs: 500 }, createRng(1));
    expect(scelta.id).toBe('denari-re');
  });

  it('sulle stesse carte e lo stesso seme sceglie uguale', () => {
    const vista = vistaAMeta(13);
    const opzioni = { mondi: 6, tempoMs: 20_000 };
    const una = scegliCartaPensando(vista, opzioni, createRng(4));
    const altra = scegliCartaPensando(vista, opzioni, createRng(4));
    expect(una.id).toBe(altra.id);
  });

  it('sceglie sempre una carta legale', () => {
    const vista = vistaAMeta(15);
    const scelta = scegliCartaPensando(vista, { mondi: 4, tempoMs: 20_000 }, createRng(7));
    expect(vista.legali.some((carta) => carta.id === scelta.id)).toBe(true);
  });

  it('la misura tiene una riga per ogni carta legale', () => {
    const vista = vistaAMeta(15);
    const misura = misuraCarte(vista, { mondi: 4, tempoMs: 20_000 }, createRng(7));
    expect(misura.perCarta.map((c) => c.carta.id).sort()).toEqual(
      [...vista.legali].map((c) => c.id).sort(),
    );
    expect(misura.mondi).toBe(4);
    expect(misura.perCarta.every((c) => c.vinte <= misura.mondi)).toBe(true);
  });
});

describe('la casualita passa dall rng', () => {
  it('il sorgente non chiama Math.random', () => {
    for (const file of [
      './mondi.ts',
      './simula.ts',
      './pensa.ts',
      './smazzata.ts',
      './sfida.ts',
      './diagnosi.ts',
    ]) {
      expect(legge(file)).not.toMatch(/Math\.random/);
    }
  });
});
