import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './cards.ts';
import { createDeck } from './cards.ts';
import type { CallState, TableConfig } from './deal.ts';
import {
  applyCall,
  apreLaPrimaBase,
  callableCards,
  chiVedeIlMonte,
  createCallState,
  currentCaller,
  deal,
  discardToMonte,
  firstHand,
  moltiplicatore,
  nextSeat,
  serveScambioMonte,
  tableConfig,
  takeMonte,
} from './deal.ts';
import type { Rng } from './rng.ts';
import { createRng } from './rng.ts';

const deck = createDeck();

function card(suit: Suit, rank: Rank): Card {
  const found = deck.find((c) => c.suit === suit && c.rank === rank);
  if (found === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return found;
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ids(cards: Card[]): string[] {
  return cards.map((c) => c.id);
}

/** Rng degenere: Fisher-Yates scambia ogni elemento con se stesso, il mazzo resta in ordine. */
const noShuffle: Rng = () => 0.999999;

const CONFIGS = [
  {
    players: 3,
    variant: 'monte',
    handSize: 12,
    monteSize: 4,
    tricks: 12,
    bases: 13,
    maxScore: 73,
    threshold: 37,
  },
  {
    players: 4,
    variant: 'monte',
    handSize: 9,
    monteSize: 4,
    tricks: 9,
    bases: 10,
    maxScore: 70,
    threshold: 36,
  },
  {
    players: 5,
    variant: 'monte',
    handSize: 7,
    monteSize: 5,
    tricks: 7,
    bases: 8,
    maxScore: 68,
    threshold: 35,
  },
  {
    players: 5,
    variant: 'amico',
    handSize: 8,
    monteSize: 0,
    tricks: 8,
    bases: 8,
    maxScore: 68,
    threshold: 35,
  },
] as const satisfies readonly TableConfig[];

describe('tableConfig', () => {
  for (const expected of CONFIGS) {
    it(`descrive il tavolo ${expected.players} ${expected.variant}`, () => {
      expect(tableConfig(expected.players, expected.variant)).toEqual(expected);
    });
  }

  it('distribuisce sempre tutte e 40 le carte', () => {
    for (const c of CONFIGS) {
      const config = tableConfig(c.players, c.variant);
      expect(config.players * config.handSize + config.monteSize).toBe(40);
    }
  });

  it('deriva punteggio massimo e soglia dalle basi', () => {
    for (const c of CONFIGS) {
      const config = tableConfig(c.players, c.variant);
      expect(config.maxScore).toBe(60 + config.bases);
      expect(config.threshold).toBe(Math.floor(config.maxScore / 2) + 1);
    }
  });

  it('conta una base in piu quando c e il monte', () => {
    for (const c of CONFIGS) {
      const config = tableConfig(c.players, c.variant);
      expect(config.bases).toBe(config.monteSize > 0 ? config.tricks + 1 : config.tricks);
    }
  });

  it('rifiuta un numero di giocatori fuori range', () => {
    expect(() => tableConfig(2, 'monte')).toThrow(/non valido/);
    expect(() => tableConfig(6, 'monte')).toThrow(/non valido/);
  });

  it('ammette la variante amico solo in cinque', () => {
    expect(() => tableConfig(3, 'amico')).toThrow(/amico/);
    expect(() => tableConfig(4, 'amico')).toThrow(/amico/);
    expect(() => tableConfig(5, 'amico')).not.toThrow();
  });
});

describe('nextSeat e firstHand', () => {
  it('gira il tavolo e torna al posto 0', () => {
    expect(nextSeat(0, 4)).toBe(1);
    expect(nextSeat(2, 4)).toBe(3);
    expect(nextSeat(3, 4)).toBe(0);
  });

  it('apre sempre con un giocatore diverso dal mazziere', () => {
    for (const players of [3, 4, 5]) {
      for (let dealer = 0; dealer < players; dealer += 1) {
        const opener = firstHand(dealer, players);
        expect(opener).not.toBe(dealer);
        expect(opener).toBeGreaterThanOrEqual(0);
        expect(opener).toBeLessThan(players);
      }
    }
  });
});

describe('deal', () => {
  for (const c of CONFIGS) {
    it(`consegna le mani previste con ${c.players} giocatori in ${c.variant}`, () => {
      const config = tableConfig(c.players, c.variant);
      const result = deal(config, 0, createRng(1234));

      expect(result.hands).toHaveLength(config.players);
      for (const hand of result.hands) {
        expect(hand).toHaveLength(config.handSize);
      }
      expect(result.monte).toHaveLength(config.monteSize);

      const all = [...result.hands.flat(), ...result.monte];
      expect(all).toHaveLength(40);
      expect(new Set(ids(all)).size).toBe(40);
    });
  }

  it('lascia il monte vuoto nella variante amico', () => {
    const result = deal(tableConfig(5, 'amico'), 3, createRng(7));
    expect(result.monte).toEqual([]);
  });

  it('scopre come trionfo il seme dell ultima carta del monte', () => {
    for (const players of [3, 4, 5]) {
      const config = tableConfig(players, 'monte');
      const result = deal(config, 1, createRng(88));
      const scoperta = result.monte[result.monte.length - 1] as Card;
      expect(result.trump).toBe(scoperta.suit);
    }
  });

  it('prende come trionfo il seme dell ultima carta del mazzo in variante amico', () => {
    const result = deal(tableConfig(5, 'amico'), 0, noShuffle);
    const ultima = deck[deck.length - 1] as Card;
    expect(result.trump).toBe(ultima.suit);
  });

  it('riproduce la stessa distribuzione a parita di seed', () => {
    const config = tableConfig(4, 'monte');
    const a = deal(config, 2, createRng(2024));
    const b = deal(config, 2, createRng(2024));
    expect(a.hands.map(ids)).toEqual(b.hands.map(ids));
    expect(ids(a.monte)).toEqual(ids(b.monte));
    expect(a.trump).toBe(b.trump);
  });

  it('cambia distribuzione al cambiare del seed', () => {
    const config = tableConfig(4, 'monte');
    const a = deal(config, 2, createRng(1));
    const b = deal(config, 2, createRng(2));
    expect(a.hands.map(ids)).not.toEqual(b.hands.map(ids));
  });

  it('distribuisce una carta alla volta a giro, non a blocchi', () => {
    const config = tableConfig(4, 'monte');
    const dealer = 0;
    const result = deal(config, dealer, noShuffle);

    // Con il mazzo non mescolato l ordine di consegna e quello di createDeck().
    const order = [1, 2, 3, 0];
    order.forEach((seat, position) => {
      const attese = Array.from(
        { length: config.handSize },
        (_, round) => deck[position + round * config.players] as Card,
      );
      expect(ids(result.hands[seat] as Card[])).toEqual(ids(attese));
    });

    const distribuite = config.players * config.handSize;
    expect(ids(result.monte)).toEqual(ids(deck.slice(distribuite)));
  });

  it('non muta il mazzo di partenza', () => {
    const before = ids(deck);
    deal(tableConfig(4, 'monte'), 0, createRng(3));
    expect(ids(createDeck())).toEqual(before);
  });
});

describe('createCallState', () => {
  it('interroga tutti una volta, dal primo di mano fino al mazziere', () => {
    const config = tableConfig(4, 'monte');
    const state = createCallState(config, 2);
    expect(state.order).toEqual([3, 0, 1, 2]);
    expect(state.order).toHaveLength(config.players);
    expect(new Set(state.order).size).toBe(config.players);
    expect(state.order[0]).toBe(firstHand(2, config.players));
    expect(state.order[state.order.length - 1]).toBe(2);
  });

  it('parte aperto e senza chiamante', () => {
    const state = createCallState(tableConfig(5, 'amico'), 0);
    expect(state).toEqual({
      order: [1, 2, 3, 4, 0],
      index: 0,
      caller: null,
      chiamata: null,
      closed: false,
      liscio: false,
    });
    expect(currentCaller(state)).toBe(1);
  });
});

describe('applyCall', () => {
  const config = tableConfig(4, 'monte');
  const PASSO = { tipo: 'passo' } as const;
  const NORMALE = { tipo: 'chiama', chiamata: 'normale' } as const;

  /** Fa passare chi e' di turno, senza doverne ripetere il nome ogni volta. */
  function passa(state: CallState): CallState {
    return applyCall(state, currentCaller(state) as number, PASSO);
  }

  function passAll(state: CallState): CallState {
    let current = state;
    for (let i = 0; i < config.players; i += 1) {
      current = passa(current);
    }
    return current;
  }

  it('chiude in liscio se passano tutti', () => {
    const finale = passAll(createCallState(config, 0));
    expect(finale.closed).toBe(true);
    expect(finale.liscio).toBe(true);
    expect(finale.caller).toBeNull();
    expect(finale.chiamata).toBeNull();
    expect(currentCaller(finale)).toBeNull();
  });

  it('registra il chiamante quando il terzo interrogato chiama', () => {
    const state = createCallState(config, 0);
    const terzo = state.order[2] as number;

    const dopoDuePassi = passa(passa(state));
    expect(currentCaller(dopoDuePassi)).toBe(terzo);

    const finale = applyCall(dopoDuePassi, terzo, NORMALE);
    expect(finale.caller).toBe(terzo);
    expect(finale.chiamata).toBe('normale');
    expect(finale.closed).toBe(true);
    expect(finale.liscio).toBe(false);
  });

  it('resta aperto finche restano giocatori da interrogare', () => {
    const dopoUnPasso = passa(createCallState(config, 0));
    expect(dopoUnPasso.closed).toBe(false);
    expect(dopoUnPasso.liscio).toBe(false);
    expect(dopoUnPasso.index).toBe(1);
  });

  it('non muta lo stato ricevuto', () => {
    const state = createCallState(config, 1);
    const primo = state.order[0] as number;
    const before = snapshot(state);
    applyCall(state, primo, PASSO);
    applyCall(state, primo, NORMALE);
    applyCall(state, state.order[2] as number, { tipo: 'chiama', chiamata: 'sola' });
    expect(state).toEqual(before);
  });

  it('rifiuta il passo di chi non e di turno', () => {
    const state = createCallState(config, 0);
    const secondo = state.order[1] as number;
    expect(() => applyCall(state, secondo, PASSO)).toThrow(/non tocca al giocatore/);
  });

  it('rifiuta la chiamata normale di chi non e di turno', () => {
    const state = createCallState(config, 0);
    const secondo = state.order[1] as number;
    expect(() => applyCall(state, secondo, NORMALE)).toThrow(/tocca al giocatore/);
  });

  for (const speciale of ['sola', 'colonna', 'chiSeLaSente'] as const) {
    it(`accetta la ${speciale} dal terzo giocatore mentre tocca al primo`, () => {
      const state = createCallState(config, 0);
      const terzo = state.order[2] as number;
      expect(currentCaller(state)).toBe(state.order[0]);

      const finale = applyCall(state, terzo, { tipo: 'chiama', chiamata: speciale });
      expect(finale.caller).toBe(terzo);
      expect(finale.chiamata).toBe(speciale);
      expect(finale.closed).toBe(true);
      expect(finale.liscio).toBe(false);
    });
  }

  it('rifiuta decisioni a fase conclusa, speciali comprese', () => {
    const state = createCallState(config, 0);
    const primo = state.order[0] as number;
    const chiuso = applyCall(state, primo, NORMALE);
    expect(() => applyCall(chiuso, primo, PASSO)).toThrow(/conclusa/);
    expect(() => applyCall(passAll(createCallState(config, 0)), primo, NORMALE)).toThrow(
      /conclusa/,
    );

    // La prima dichiarazione blocca le altre: niente gerarchia, vale chi arriva prima.
    const dopoSola = applyCall(state, primo, { tipo: 'chiama', chiamata: 'sola' });
    const altro = state.order[2] as number;
    expect(() => applyCall(dopoSola, altro, { tipo: 'chiama', chiamata: 'colonna' })).toThrow(
      /conclusa/,
    );
    expect(() =>
      applyCall(dopoSola, altro, { tipo: 'chiama', chiamata: 'chiSeLaSente' }),
    ).toThrow(/conclusa/);
  });
});

describe('moltiplicatore', () => {
  it('vale la posta di ogni dichiarazione', () => {
    expect(moltiplicatore('normale')).toBe(1);
    expect(moltiplicatore('sola')).toBe(3);
    expect(moltiplicatore('colonna')).toBe(4);
    expect(moltiplicatore('chiSeLaSente')).toBe(5);
  });
});

describe('serveScambioMonte', () => {
  it('fa scartare solo nella chiamata normale', () => {
    expect(serveScambioMonte('normale')).toBe(true);
    expect(serveScambioMonte('sola')).toBe(false);
    expect(serveScambioMonte('colonna')).toBe(false);
    expect(serveScambioMonte('chiSeLaSente')).toBe(false);
  });
});

describe('chiVedeIlMonte', () => {
  it('mostra il monte al chiamante nella normale e nella sola', () => {
    expect(chiVedeIlMonte('normale', 2)).toBe(2);
    expect(chiVedeIlMonte('sola', 2)).toBe(2);
  });

  it('non lo mostra a nessuno nella colonna e nella chi se la sente', () => {
    expect(chiVedeIlMonte('colonna', 2)).toBeNull();
    expect(chiVedeIlMonte('chiSeLaSente', 2)).toBeNull();
  });
});

describe('apreLaPrimaBase', () => {
  const dealer = 1;
  const caller = 3;

  for (const players of [3, 4, 5]) {
    const seggi = { dealer, caller: caller % players, players, sceltoDaAvversari: null };

    it(`nella normale a ${players} apre sempre il primo di mano`, () => {
      expect(apreLaPrimaBase({ ...seggi, chiamata: 'normale' })).toBe(firstHand(dealer, players));
    });

    for (const chiamata of ['sola', 'colonna'] as const) {
      it(`nella ${chiamata} a ${players} apre ${players === 3 ? 'il primo di mano' : 'il chiamante'}`, () => {
        const atteso = players === 3 ? firstHand(dealer, players) : seggi.caller;
        expect(apreLaPrimaBase({ ...seggi, chiamata })).toBe(atteso);
      });
    }

    it(`nella chi se la sente a ${players} apre l avversario che si e fatto avanti`, () => {
      const avversario = (seggi.caller + 1) % players;
      expect(
        apreLaPrimaBase({ ...seggi, chiamata: 'chiSeLaSente', sceltoDaAvversari: avversario }),
      ).toBe(avversario);
    });
  }

  it('nella variante amico apre il chiamante, che li e a cinque', () => {
    const config = tableConfig(5, 'amico');
    const seggi = { caller: 3, dealer, players: config.players, sceltoDaAvversari: null };
    expect(apreLaPrimaBase({ ...seggi, chiamata: 'sola' })).toBe(3);
    expect(apreLaPrimaBase({ ...seggi, chiamata: 'colonna' })).toBe(3);
    expect(apreLaPrimaBase({ ...seggi, chiamata: 'normale' })).toBe(firstHand(dealer, 5));
    expect(apreLaPrimaBase({ ...seggi, chiamata: 'chiSeLaSente', sceltoDaAvversari: 0 })).toBe(0);
  });

  it('rifiuta la chi se la sente senza nessuno che apre', () => {
    expect(() =>
      apreLaPrimaBase({ chiamata: 'chiSeLaSente', caller: 0, dealer, players: 4, sceltoDaAvversari: null }),
    ).toThrow(/nessuno si e' fatto avanti/);
  });

  it('rifiuta la chi se la sente aperta dal chiamante stesso', () => {
    expect(() =>
      apreLaPrimaBase({ chiamata: 'chiSeLaSente', caller: 2, dealer, players: 4, sceltoDaAvversari: 2 }),
    ).toThrow(/non il chiamante/);
  });
});

describe('callableCards', () => {
  it('propone tutti e quattro i 7 a chi non ne ha nessuno', () => {
    const hand = [card('denari', 're'), card('coppe', 'asso'), card('spade', 3)];
    const callable = callableCards(hand);
    expect(callable).toHaveLength(4);
    expect(callable.every((c) => c.rank === 7)).toBe(true);
  });

  it('propone solo i 7 che non ha in mano', () => {
    const hand = [card('denari', 7), card('coppe', 7), card('spade', 're')];
    expect(ids(callableCards(hand))).toEqual(ids([card('spade', 7), card('bastoni', 7)]));
  });

  it('ripiega sugli assi a chi ha tutti e quattro i 7', () => {
    const hand = [card('denari', 7), card('coppe', 7), card('spade', 7), card('bastoni', 7)];
    const callable = callableCards(hand);
    expect(callable).toHaveLength(4);
    expect(callable.every((c) => c.rank === 'asso')).toBe(true);
  });

  it('esclude anche gli assi gia in mano', () => {
    const hand = [
      card('denari', 7),
      card('coppe', 7),
      card('spade', 7),
      card('bastoni', 7),
      card('denari', 'asso'),
    ];
    expect(ids(callableCards(hand))).toEqual(
      ids([card('coppe', 'asso'), card('spade', 'asso'), card('bastoni', 'asso')]),
    );
  });

  it('ritorna sempre un array nuovo', () => {
    const hand = [card('denari', 're')];
    expect(callableCards(hand)).not.toBe(callableCards(hand));
  });
});

describe('takeMonte e discardToMonte', () => {
  const config = tableConfig(4, 'monte');
  const result = deal(config, 0, createRng(555));
  const hand = result.hands[1] as Card[];
  const monte = result.monte;

  it('sovradimensiona la mano di chi prende il monte', () => {
    expect(takeMonte(hand, monte)).toHaveLength(config.handSize + config.monteSize);
  });

  it('riporta la mano alla dimensione giusta dopo lo scarto', () => {
    const enlarged = takeMonte(hand, monte);
    const discards = enlarged.slice(0, config.monteSize);
    const exchange = discardToMonte(enlarged, discards, config.monteSize);

    expect(exchange.hand).toHaveLength(config.handSize);
    expect(exchange.monte).toHaveLength(config.monteSize);
    expect(ids(exchange.monte)).toEqual(ids(discards));
    expect(new Set([...ids(exchange.hand), ...ids(exchange.monte)]).size).toBe(
      config.handSize + config.monteSize,
    );
  });

  it('rifiuta un numero di scarti sbagliato', () => {
    const enlarged = takeMonte(hand, monte);
    expect(() => discardToMonte(enlarged, enlarged.slice(0, 3), config.monteSize)).toThrow(
      /esattamente 4/,
    );
    expect(() => discardToMonte(enlarged, enlarged.slice(0, 5), config.monteSize)).toThrow(
      /esattamente 4/,
    );
  });

  it('rifiuta lo scarto di una carta non posseduta', () => {
    const enlarged = takeMonte(hand, monte);
    const estranea = deck.find((c) => !enlarged.some((h) => h.id === c.id)) as Card;
    const discards = [estranea, ...enlarged.slice(0, config.monteSize - 1)];
    expect(() => discardToMonte(enlarged, discards, config.monteSize)).toThrow(estranea.id);
  });

  it('rifiuta scarti con la stessa carta ripetuta', () => {
    const enlarged = takeMonte(hand, monte);
    const primo = enlarged[0] as Card;
    const discards = [primo, primo, ...enlarged.slice(1, config.monteSize - 1)];
    expect(() => discardToMonte(enlarged, discards, config.monteSize)).toThrow(/stessa carta/);
  });

  it('non muta gli input', () => {
    const enlarged = takeMonte(hand, monte);
    const discards = enlarged.slice(0, config.monteSize);
    const enlargedBefore = snapshot(enlarged);
    const discardsBefore = snapshot(discards);
    const handBefore = snapshot(hand);
    const monteBefore = snapshot(monte);

    discardToMonte(enlarged, discards, config.monteSize);

    expect(enlarged).toEqual(enlargedBefore);
    expect(discards).toEqual(discardsBefore);
    expect(hand).toEqual(handBefore);
    expect(monte).toEqual(monteBefore);
  });
});
