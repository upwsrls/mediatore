import type { Alliance, HandState } from '@mediatore/engine';
import { createDeck, createHandState, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  avvisoCappotto,
  avvisoSoglia,
  cappottoInCorsa,
  cartaChiamata,
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

describe('avvisoCappotto', () => {
  it('nel liscio dice di chi si tratta: nessuno lo ha annunciato', () => {
    expect(avvisoCappotto(conPrese([2, 2], { kind: 'liscio' }))).toBe(
      'giocatore 2: cappotto in corsa',
    );
  });

  it('col chiamante il nome sta gia nella riga, e non lo ripete', () => {
    expect(avvisoCappotto(conPrese([1, 1], chiamante))).toBe('cappotto in corsa');
  });

  it('non dice niente quando non c e nessuna corsa', () => {
    expect(avvisoCappotto(conPrese([1, 3], chiamante))).toBeNull();
  });
});

describe('avvisoSoglia', () => {
  /** A quattro le prese sono nove: sei chiuse vuol dire tre da giocare. */
  const seiPrese = [0, 1, 2, 3, 0, 1];

  it('avvisa il chiamante sotto i 18 quando restano tre prese', () => {
    expect(avvisoSoglia(conPrese(seiPrese, chiamante, 4, 'monte', [0, 12, 0, 0]))).toBe(
      'attenzione: sotto i 18 punti',
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
      'attenzione: sotto i 18 punti',
    );
  });
});
