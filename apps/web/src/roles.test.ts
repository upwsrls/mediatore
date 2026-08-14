import type { Alliance, HandState } from '@mediatore/engine';
import { createDeck, createHandState, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  avvisoSoglia,
  basiDellaSquadra,
  cappottoInCorsa,
  cartaChiamata,
  haCompagniDiSquadra,
  riassuntoSmazzata,
  ruoloDi,
} from './roles';

/** Un tavolo qualunque: qui contano solo le prese gia' chiuse e i punti fatti. */
function conPrese(
  vincitori: number[],
  alliance: Alliance,
  players = 4,
  variant: 'monte' | 'amico' = 'monte',
  punti: number[] = [],
): HandState {
  const config = tableConfig(players, variant);
  const base = createHandState({
    config,
    dealer: 0,
    trump: 'bastoni',
    alliance,
    hands: Array.from({ length: players }, () => []),
    monte: [],
  });
  return {
    ...base,
    completedTricks: vincitori.map((winner) => ({ winner, cards: [], points: 0 })),
    progression: Array.from({ length: players }, (_, seat) => [punti[seat] ?? 0]),
  };
}

const chiamante: Alliance = { kind: 'monte', caller: 1, chiamata: 'normale' };

describe('cartaChiamata', () => {
  const SETTE_DI_COPPE = 'coppe-7';
  const conAmico = (friend: number | null): Alliance => ({
    kind: 'amico',
    caller: 1,
    calledCard: SETTE_DI_COPPE,
    friend,
  });

  it('e scoperta appena il chiamante l ha annunciata', () => {
    expect(cartaChiamata(conPrese([], conAmico(null), 5, 'amico'))?.id).toBe(SETTE_DI_COPPE);
  });

  it('resta scoperta anche dopo che l amico si e rivelato', () => {
    expect(cartaChiamata(conPrese([], conAmico(3), 5, 'amico'))?.id).toBe(SETTE_DI_COPPE);
  });

  it('non c e niente da mostrare dove non si chiama una carta', () => {
    expect(cartaChiamata(conPrese([], chiamante))).toBeNull();
    expect(cartaChiamata(conPrese([], { kind: 'liscio' }))).toBeNull();
  });

  it('non dice chi ce l ha in mano: legge l alleanza, non le mani', () => {
    // Stessa carta chiamata, mani diverse: quello che si vede non cambia.
    const carte = createDeck().filter((carta) => carta.id === SETTE_DI_COPPE);
    const inMano = conPrese([], conAmico(null), 5, 'amico');
    const conCarta: HandState = {
      ...inMano,
      hands: inMano.hands.map((_, seat) => (seat === 3 ? carte : [])),
    };

    expect(cartaChiamata(conCarta)).toEqual(cartaChiamata(inMano));
    // E chi la tiene resta uno qualunque, finche' non la gioca.
    expect(ruoloDi(3, conCarta)).toBe('neutro');
    expect(riassuntoSmazzata(conCarta)).not.toContain('giocatore 3');
  });
});

describe('basiDellaSquadra', () => {
  const vincitori = (state: HandState, seat: number): number[] =>
    basiDellaSquadra(state, seat).map((base) => base.winner);

  it('nel liscio ognuno vede solo le proprie', () => {
    const stato = conPrese([0, 1, 0, 2], { kind: 'liscio' });
    expect(vincitori(stato, 0)).toEqual([0, 0]);
    expect(vincitori(stato, 1)).toEqual([1]);
    expect(vincitori(stato, 2)).toEqual([2]);
    expect(vincitori(stato, 3)).toEqual([]);
    expect(haCompagniDiSquadra(stato, 0)).toBe(false);
  });

  it('il chiamante del monte vede solo le sue, gli avversari le loro', () => {
    const stato = conPrese([1, 0, 2, 1], chiamante);
    expect(vincitori(stato, 1)).toEqual([1, 1]);
    expect(vincitori(stato, 0)).toEqual([0, 2]);
    expect(vincitori(stato, 2)).toEqual([0, 2]);
    expect(vincitori(stato, 3)).toEqual([0, 2]);
    expect(vincitori(stato, 1)).not.toContain(0);
    expect(vincitori(stato, 0)).not.toContain(1);
    expect(haCompagniDiSquadra(stato, 1)).toBe(false);
    expect(haCompagniDiSquadra(stato, 0)).toBe(true);
  });

  it('prima della rivelazione ognuno vede solo le proprie, amico compreso', () => {
    const nascosto: Alliance = {
      kind: 'amico',
      caller: 0,
      calledCard: 'A-denari',
      friend: null,
    };
    const stato = conPrese([0, 2, 1, 0], nascosto, 5, 'amico');
    expect(vincitori(stato, 0)).toEqual([0, 0]);
    expect(vincitori(stato, 2)).toEqual([2]);
    expect(vincitori(stato, 1)).toEqual([1]);
    expect(vincitori(stato, 3)).toEqual([]);
    // L'amico non vede le basi del chiamante: se le vedesse, si riconoscerebbe.
    expect(vincitori(stato, 2)).not.toContain(0);
    expect(haCompagniDiSquadra(stato, 0)).toBe(false);
    expect(haCompagniDiSquadra(stato, 2)).toBe(false);
    expect(haCompagniDiSquadra(stato, 1)).toBe(false);
  });

  it('dopo la rivelazione la coppia vede le sue basi, gli altri le loro', () => {
    const coppia: Alliance = { kind: 'amico', caller: 0, calledCard: 'A-denari', friend: 2 };
    const stato = conPrese([0, 2, 1, 3], coppia, 5, 'amico');
    expect(vincitori(stato, 0)).toEqual([0, 2]);
    expect(vincitori(stato, 2)).toEqual([0, 2]);
    expect(vincitori(stato, 1)).toEqual([1, 3]);
    expect(vincitori(stato, 3)).toEqual([1, 3]);
    expect(vincitori(stato, 4)).toEqual([1, 3]);
    expect(vincitori(stato, 0)).not.toContain(1);
    expect(vincitori(stato, 1)).not.toContain(0);
    expect(vincitori(stato, 1)).not.toContain(2);
    expect(haCompagniDiSquadra(stato, 0)).toBe(true);
    expect(haCompagniDiSquadra(stato, 2)).toBe(true);
    expect(haCompagniDiSquadra(stato, 1)).toBe(true);
  });
});

describe('cappottoInCorsa', () => {
  it('e in corsa se il chiamante ha vinto tutte le prese chiuse', () => {
    expect(cappottoInCorsa(conPrese([1, 1, 1], chiamante))).toBe(1);
  });

  it('sparisce appena il chiamante lascia una presa agli altri', () => {
    expect(cappottoInCorsa(conPrese([1, 3, 1], chiamante))).toBeNull();
  });

  it('tace prima che sia stata chiusa una presa', () => {
    expect(cappottoInCorsa(conPrese([], chiamante))).toBeNull();
  });

  it('tace a smazzata finita: li non e piu una corsa ma un risultato', () => {
    const tutte = Array.from({ length: tableConfig(4, 'monte').tricks }, () => 1);
    expect(cappottoInCorsa(conPrese(tutte, chiamante))).toBeNull();
  });

  it('conta anche le prese dell amico, una volta che si e scoperto', () => {
    const coppia: Alliance = { kind: 'amico', caller: 1, calledCard: 'A-denari', friend: 3 };
    expect(cappottoInCorsa(conPrese([1, 3, 1], coppia, 5, 'amico'))).toBe(1);
  });

  it('nel liscio segue chiunque abbia vinto tutto finora', () => {
    expect(cappottoInCorsa(conPrese([2, 2, 2], { kind: 'liscio' }))).toBe(2);
  });

  it('nel liscio non basta che le prese siano andate a pochi', () => {
    expect(cappottoInCorsa(conPrese([2, 2, 3], { kind: 'liscio' }))).toBeNull();
  });
});

describe('avvisoSoglia', () => {
  /** A quattro le prese sono nove: sei chiuse vuol dire tre da giocare. */
  const seiPrese = [0, 1, 2, 3, 0, 1];

  it('avvisa il chiamante sotto i 18 quando restano tre prese', () => {
    expect(avvisoSoglia(conPrese(seiPrese, chiamante, 4, 'monte', [0, 12, 0, 0]))).toBe(
      'sotto i 18',
    );
  });

  it('tace appena il chiamante supera la soglia', () => {
    expect(avvisoSoglia(conPrese(seiPrese, chiamante, 4, 'monte', [0, 18, 0, 0]))).toBeNull();
  });

  it('tace finche le prese da giocare sono ancora tante', () => {
    expect(avvisoSoglia(conPrese([0, 1, 2, 3, 0], chiamante, 4, 'monte', [0, 2, 0, 0]))).toBeNull();
  });

  it('tace a smazzata finita, quando non c e piu niente da fare', () => {
    const tutte = Array.from({ length: tableConfig(4, 'monte').tricks }, (_, i) => i % 4);
    expect(avvisoSoglia(conPrese(tutte, chiamante, 4, 'monte', [0, 2, 0, 0]))).toBeNull();
  });

  it('non riguarda il liscio, dove non c e nessuna soglia', () => {
    expect(avvisoSoglia(conPrese(seiPrese, { kind: 'liscio' }, 4, 'monte', [0, 2, 0, 0]))).toBeNull();
  });

  it('nell amico somma i punti della coppia scoperta', () => {
    const coppia: Alliance = { kind: 'amico', caller: 1, calledCard: 'A-denari', friend: 3 };
    const cinquePrese = [0, 1, 2, 3, 4];
    expect(avvisoSoglia(conPrese(cinquePrese, coppia, 5, 'amico', [0, 10, 0, 10, 0]))).toBeNull();
    expect(avvisoSoglia(conPrese(cinquePrese, coppia, 5, 'amico', [0, 10, 0, 5, 0]))).toBe(
      'sotto i 18',
    );
  });

  it('a tre nomina i 25 e poi i 18, le due soglie del tavolo', () => {
    const novePrese = [0, 1, 2, 0, 1, 2, 0, 1, 2];
    const aTre = { kind: 'monte' as const, caller: 1, chiamata: 'normale' as const };
    expect(avvisoSoglia(conPrese(novePrese, aTre, 3, 'monte', [0, 20, 0]))).toBe('sotto i 25');
    expect(avvisoSoglia(conPrese(novePrese, aTre, 3, 'monte', [0, 12, 0]))).toBe('sotto i 18');
    expect(avvisoSoglia(conPrese(novePrese, aTre, 3, 'monte', [0, 25, 0]))).toBeNull();
  });
});
