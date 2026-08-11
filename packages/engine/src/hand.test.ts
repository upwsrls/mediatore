import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './cards.ts';
import { createDeck, totalPoints } from './cards.ts';
import type { TableConfig, TipoChiamata, Variant } from './deal.ts';
import { apreLaPrimaBase, firstHand, nextSeat, tableConfig } from './deal.ts';
import type { Alliance, HandState } from './hand.ts';
import {
  createHandState,
  isAllyFor,
  legalPlaysFor,
  penalitaDaSoglia,
  playCard,
  scoreHand,
  settle,
  settleChiSeLaSenteScaduto,
} from './hand.ts';

const TRUMP: Suit = 'bastoni';

const deck = createDeck();

function card(suit: Suit, rank: Rank): Card {
  const found = deck.find((c) => c.suit === suit && c.rank === rank);
  if (found === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return found;
}

function ids(cards: Card[]): string[] {
  return cards.map((c) => c.id);
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Il chiamante solo contro tutti. Salvo diverso avviso la chiamata e' normale. */
function alleanzaMonte(caller: number, chiamata: TipoChiamata = 'normale'): Alliance {
  return { kind: 'monte', caller, chiamata };
}

/**
 * Tavolo ridotto per scenari brevi. Il campo variant non viene letto da hand.ts:
 * il modo di gioco e' portato da Alliance.
 */
function miniConfig(
  players: number,
  tricks: number,
  monteSize = 0,
  threshold = 5,
  variant: Variant = 'monte',
): TableConfig {
  const bases = monteSize > 0 ? tricks + 1 : tricks;
  return {
    players,
    variant,
    handSize: tricks,
    monteSize,
    tricks,
    bases,
    maxScore: 60 + bases,
    threshold,
  };
}

/**
 * Stato gia' concluso con una progressione scritta a mano, per i test di
 * conteggio. Le basi non si deducono dai punti, quindi chi le ha vinte si dice
 * a parte: per difetto se le dividono tutti, cosi' nessuno fa cappotto.
 */
function scoredState(
  progression: number[][],
  alliance: Alliance,
  threshold = 5,
  variant: Variant = 'monte',
  vincitoriDelleBasi?: number[],
): HandState {
  const players = progression.length;
  const basi = vincitoriDelleBasi ?? Array.from({ length: players }, (_, seat) => seat);
  return {
    config: miniConfig(players, basi.length, 0, threshold, variant),
    dealer: players - 1,
    trump: TRUMP,
    alliance,
    hands: Array.from({ length: players }, () => []),
    monte: [],
    currentTrick: { leader: 0, trump: TRUMP, plays: [] },
    turn: 0,
    completedTricks: basi.map((winner) => ({ winner, cards: [], points: 0 })),
    progression: progression.map((row) => [...row]),
    finished: true,
  };
}

function playOut(state: HandState): HandState {
  let current = state;
  let guard = 0;
  while (!current.finished) {
    const legal = legalPlaysFor(current, current.turn);
    const chosen = legal[0];
    if (chosen === undefined) {
      throw new Error(`nessuna giocata legale per il giocatore ${current.turn}`);
    }
    current = playCard(current, current.turn, chosen.id);
    guard += 1;
    if (guard > 200) throw new Error('la smazzata non si chiude');
  }
  return current;
}

/** Distribuzione carta per carta dal mazzo in ordine, senza passare da deal(). */
function handsByHand(config: TableConfig, dealer: number): { hands: Card[][]; monte: Card[] } {
  const hands: Card[][] = Array.from({ length: config.players }, () => []);
  let seat = firstHand(dealer, config.players);
  let cursor = 0;
  for (let round = 0; round < config.handSize; round += 1) {
    for (let i = 0; i < config.players; i += 1) {
      (hands[seat] as Card[]).push(deck[cursor] as Card);
      seat = nextSeat(seat, config.players);
      cursor += 1;
    }
  }
  return { hands, monte: deck.slice(cursor) };
}

// Scenario a quattro: p3 taglia la prima presa, poi tiene la mano con il denari piu' alto.
function quattroGiocatori(monte: Card[]): HandState {
  return createHandState({
    config: miniConfig(4, 2, monte.length),
    dealer: 3,
    trump: TRUMP,
    alliance: { kind: 'liscio' },
    hands: [
      [card('coppe', 're'), card('denari', 2)],
      [card('coppe', 'asso'), card('denari', 3)],
      [card('coppe', 2), card('denari', 4)],
      [card(TRUMP, 2), card('denari', 5)],
    ],
    monte,
  });
}

/**
 * Tavolo a tre in cui apre il posto 1 a denari. Cambiando solo chi ha
 * chiamato, il posto 1 passa da compagno del posto 2 a suo avversario:
 * le mosse legali del posto 2 devono cambiare di conseguenza.
 */
function treConChiamante(caller: number, manoDiDue: Card[]): HandState {
  const state = createHandState({
    config: miniConfig(3, 2),
    dealer: 0,
    trump: TRUMP,
    alliance: alleanzaMonte(caller),
    hands: [[card('denari', 're'), card(TRUMP, 2)], [card('denari', 4), card('coppe', 2)], manoDiDue],
    monte: [],
  });
  return playCard(state, 1, 'denari-4');
}

const CARTA_CHIAMATA = 'denari-7';

function cinqueConAmico(friend: number | null): HandState {
  return createHandState({
    config: miniConfig(5, 2),
    dealer: 4,
    trump: TRUMP,
    alliance: { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend },
    hands: [
      [card('denari', 're'), card('coppe', 2)],
      [card('denari', 3), card('coppe', 3)],
      [card('denari', 7), card('denari', 2)],
      [card('denari', 4), card('coppe', 4)],
      [card('denari', 5), card('coppe', 5)],
    ],
    monte: [],
  });
}

describe('isAllyFor', () => {
  it('lascia il chiamante solo contro tutti nel monte', () => {
    const isAlly = isAllyFor(alleanzaMonte(1));
    for (let seat = 0; seat < 4; seat += 1) {
      expect(isAlly(seat, seat)).toBe(true);
      if (seat !== 1) expect(isAlly(1, seat)).toBe(false);
    }
  });

  it('fa squadra fra gli avversari del chiamante nel monte', () => {
    const isAlly = isAllyFor(alleanzaMonte(1));
    expect(isAlly(0, 2)).toBe(true);
    expect(isAlly(2, 0)).toBe(true);
    expect(isAlly(0, 3)).toBe(true);
    expect(isAlly(2, 3)).toBe(true);
  });

  it('non allea nessuno nel liscio', () => {
    const isAlly = isAllyFor({ kind: 'liscio' });
    expect(isAlly(2, 2)).toBe(true);
    expect(isAlly(0, 3)).toBe(false);
  });

  it('tratta l amico come avversario finche non si rivela', () => {
    const isAlly = isAllyFor({
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: null,
    });
    for (let a = 0; a < 5; a += 1) {
      for (let b = 0; b < 5; b += 1) {
        expect(isAlly(a, b)).toBe(a === b);
      }
    }
    // Due avversari qui non fanno squadra, al contrario che nel monte:
    // se la facessero, l amico saprebbe di non doversi superare.
    expect(isAlly(1, 3)).toBe(false);
  });

  it('forma due schieramenti dopo la rivelazione', () => {
    const isAlly = isAllyFor({ kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 });
    expect(isAlly(0, 2)).toBe(true);
    expect(isAlly(2, 0)).toBe(true);
    expect(isAlly(1, 3)).toBe(true);
    expect(isAlly(3, 4)).toBe(true);
    expect(isAlly(0, 1)).toBe(false);
    expect(isAlly(2, 4)).toBe(false);
    for (let seat = 0; seat < 5; seat += 1) {
      expect(isAlly(seat, seat)).toBe(true);
    }
  });
});

describe('createHandState', () => {
  it('apre alla destra del mazziere', () => {
    const state = quattroGiocatori([]);
    expect(state.turn).toBe(firstHand(3, 4));
    expect(state.currentTrick).toEqual({ leader: state.turn, trump: TRUMP, plays: [] });
    expect(state.progression).toEqual([[], [], [], []]);
    expect(state.finished).toBe(false);
  });

  it('apre da chi gli viene indicato, se glielo si indica', () => {
    const state = createHandState({
      config: miniConfig(4, 2),
      dealer: 3,
      trump: TRUMP,
      alliance: alleanzaMonte(2, 'sola'),
      hands: Array.from({ length: 4 }, () => [card('denari', 2)]),
      monte: [],
      leader: 2,
    });
    expect(state.turn).toBe(2);
    expect(state.currentTrick.leader).toBe(2);
  });

  it('rifiuta un apertura da un posto che non esiste', () => {
    expect(() =>
      createHandState({
        config: miniConfig(4, 2),
        dealer: 3,
        trump: TRUMP,
        alliance: { kind: 'liscio' },
        hands: Array.from({ length: 4 }, () => [card('denari', 2)]),
        monte: [],
        leader: 7,
      }),
    ).toThrow(/posto del tavolo/);
  });

  it('copia le mani ricevute', () => {
    const hands = [[card('coppe', 're')], [card('coppe', 2)], [card('denari', 2)], [card(TRUMP, 2)]];
    const state = createHandState({
      config: miniConfig(4, 1),
      dealer: 0,
      trump: TRUMP,
      alliance: { kind: 'liscio' },
      hands,
      monte: [],
    });
    expect(state.hands[0]).not.toBe(hands[0]);
  });
});

describe('playCard: validazioni', () => {
  it('rifiuta la giocata di chi non e di turno', () => {
    const state = quattroGiocatori([]);
    expect(() => playCard(state, 1, 'coppe-asso')).toThrow(/non tocca al giocatore 1/);
  });

  it('rifiuta una carta che il giocatore non ha', () => {
    const state = quattroGiocatori([]);
    expect(() => playCard(state, 0, 'spade-7')).toThrow(/non ha in mano/);
  });

  it('rifiuta il rifiuto di rispondere a seme', () => {
    const dopoApertura = playCard(quattroGiocatori([]), 0, 'coppe-re');
    expect(() => playCard(dopoApertura, 1, 'denari-3')).toThrow(/non consentita/);
  });

  it('rifiuta ogni giocata a smazzata conclusa', () => {
    const finale = playOut(quattroGiocatori([]));
    expect(() => playCard(finale, finale.turn, 'coppe-re')).toThrow(/conclusa/);
  });

  it('non muta lo stato ricevuto', () => {
    const state = quattroGiocatori([card('coppe', 7)]);
    const before = snapshot(state);
    playCard(state, 0, 'coppe-re');
    expect(snapshot(state)).toEqual(before);
  });
});

describe('playCard: ciclo delle prese', () => {
  it('chiude la presa dopo un giro e assegna la mano al vincitore', () => {
    let state = quattroGiocatori([]);
    state = playCard(state, 0, 'coppe-re');
    state = playCard(state, 1, 'coppe-asso');
    state = playCard(state, 2, 'coppe-2');
    expect(state.completedTricks).toHaveLength(0);
    expect(state.turn).toBe(3);

    state = playCard(state, 3, 'bastoni-2');
    const presa = state.completedTricks[0];
    expect(state.completedTricks).toHaveLength(1);
    expect(presa?.winner).toBe(3);
    expect(presa?.points).toBe(8);
    expect(state.turn).toBe(3);
    expect(state.currentTrick.leader).toBe(3);
    expect(state.currentTrick.plays).toEqual([]);
    expect(state.finished).toBe(false);
  });

  it('toglie dalla mano solo la carta giocata', () => {
    const state = playCard(quattroGiocatori([]), 0, 'coppe-re');
    expect(ids(state.hands[0] as Card[])).toEqual(['denari-2']);
    expect(ids(state.hands[1] as Card[])).toEqual(['coppe-asso', 'denari-3']);
  });

  it('chiude la smazzata dopo l ultima presa', () => {
    const finale = playOut(quattroGiocatori([]));
    expect(finale.finished).toBe(true);
    expect(finale.completedTricks).toHaveLength(2);
    expect(finale.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(finale.progression).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [8, 9],
    ]);
  });
});

describe('rivelazione dell amico', () => {
  it('tiene l amico nascosto finche la carta chiamata non esce', () => {
    let state = cinqueConAmico(null);
    state = playCard(state, 0, 'denari-re');
    state = playCard(state, 1, 'denari-3');
    expect(state.alliance).toEqual({
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: null,
    });
  });

  it('costringe l amico a scoprirsi per l obbligo di superare', () => {
    let state = cinqueConAmico(null);
    state = playCard(state, 0, 'denari-re');
    state = playCard(state, 1, 'denari-3');

    // Il chiamante sta vincendo e l amico non e ancora suo alleato:
    // l unica carta che supera e proprio quella chiamata.
    expect(ids(legalPlaysFor(state, 2))).toEqual([CARTA_CHIAMATA]);

    state = playCard(state, 2, CARTA_CHIAMATA);
    expect(state.alliance).toEqual({
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: 2,
    });
  });

  it('libera l amico dall obbligo di superare dopo la rivelazione', () => {
    let state = cinqueConAmico(2);
    state = playCard(state, 0, 'denari-re');
    state = playCard(state, 1, 'denari-3');
    expect(ids(legalPlaysFor(state, 2))).toEqual([CARTA_CHIAMATA, 'denari-2']);
  });

  it('lascia il chiamante solo se la carta chiamata non esce mai', () => {
    // Nessuno ha in mano il denari-7: la rivelazione non puo' avvenire.
    const state = createHandState({
      config: miniConfig(5, 2),
      dealer: 4,
      trump: TRUMP,
      alliance: { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: null },
      hands: [
        [card('denari', 're'), card('coppe', 2)],
        [card('denari', 3), card('coppe', 3)],
        [card('denari', 6), card('denari', 2)],
        [card('denari', 4), card('coppe', 4)],
        [card('denari', 5), card('coppe', 5)],
      ],
      monte: [],
    });

    const finale = playOut(state);
    const rivelato = finale.alliance.kind === 'amico' ? finale.alliance.friend : null;
    expect(finale.finished).toBe(true);
    expect(rivelato).toBeNull();
    expect(scoreHand(finale).callerSide).toBe(finale.progression[0]?.[1]);
  });
});

describe('legalPlaysFor', () => {
  it('non propone mosse a chi non e di turno', () => {
    const state = quattroGiocatori([]);
    expect(legalPlaysFor(state, 1)).toEqual([]);
    expect(legalPlaysFor(state, 0)).toHaveLength(2);
  });

  it('non propone mosse a smazzata conclusa', () => {
    const finale = playOut(quattroGiocatori([]));
    expect(legalPlaysFor(finale, finale.turn)).toEqual([]);
  });
});

describe('legalPlaysFor nel monte: gli avversari sono compagni', () => {
  const conDenari = [card('denari', 5), card('denari', 3)];
  const senzaDenari = [card(TRUMP, 3), card('coppe', 5)];

  it('non fa superare un compagno che sta gia vincendo', () => {
    const state = treConChiamante(0, conDenari);
    expect(ids(legalPlaysFor(state, 2))).toEqual(['denari-5', 'denari-3']);
  });

  it('fa superare il chiamante che sta vincendo', () => {
    const state = treConChiamante(1, conDenari);
    expect(ids(legalPlaysFor(state, 2))).toEqual(['denari-5']);
  });

  it('non obbliga al trionfo chi e privo del seme se vince un compagno', () => {
    const state = treConChiamante(0, senzaDenari);
    expect(ids(legalPlaysFor(state, 2))).toEqual(['bastoni-3', 'coppe-5']);
  });

  it('obbliga al trionfo chi e privo del seme se vince il chiamante', () => {
    const state = treConChiamante(1, senzaDenari);
    expect(ids(legalPlaysFor(state, 2))).toEqual(['bastoni-3']);
  });
});

describe('monte e ultima presa', () => {
  it('assegna il monte con la sua base a chi vince l ultima presa', () => {
    const monte = [card('coppe', 7), card('denari', 'asso')];
    const finale = playOut(quattroGiocatori(monte));
    const bonus = totalPoints(monte) + 1;

    expect(bonus).toBe(10);
    expect(finale.progression[3]).toEqual([8, 9 + bonus]);
    expect(finale.completedTricks[1]?.points).toBe(1);
  });

  it('non aggiunge nulla, nemmeno la base, se il monte e vuoto', () => {
    const finale = playOut(quattroGiocatori([]));
    expect(finale.progression[3]).toEqual([8, 9]);
  });
});

describe('dichiarazioni speciali', () => {
  const dealer = 0;

  function smazzataIntera(players: number, chiamata: TipoChiamata, caller: number): HandState {
    const config = tableConfig(players, 'monte');
    const { hands, monte } = handsByHand(config, dealer);
    return playOut(
      createHandState({
        config,
        dealer,
        trump: TRUMP,
        alliance: alleanzaMonte(caller, chiamata),
        hands,
        monte,
        leader: apreLaPrimaBase({ chiamata, caller, dealer, players, sceltoDaAvversari: null }),
      }),
    );
  }

  for (const chiamata of ['sola', 'colonna'] as const) {
    it(`nella ${chiamata} il monte resta una base e i punti fanno maxScore`, () => {
      const config = tableConfig(4, 'monte');
      const finale = smazzataIntera(4, chiamata, 2);
      const totale = scoreHand(finale).perPlayer.reduce((sum, punti) => sum + punti, 0);

      expect(finale.completedTricks).toHaveLength(config.tricks);
      expect(totale).toBe(config.maxScore);
      // Nessuno scambio: il monte e ancora quello distribuito, e vale lo stesso.
      expect(finale.monte).toHaveLength(config.monteSize);
    });
  }

  it('fa aprire il chiamante nella sola e nella colonna a quattro', () => {
    for (const chiamata of ['sola', 'colonna'] as const) {
      expect(smazzataIntera(4, chiamata, 2).completedTricks[0]?.cards[0]?.player).toBe(2);
    }
  });

  it('lascia l apertura al primo di mano a tre, anche nelle speciali', () => {
    for (const chiamata of ['sola', 'colonna'] as const) {
      const primo = smazzataIntera(3, chiamata, 2).completedTricks[0]?.cards[0]?.player;
      expect(primo).toBe(firstHand(dealer, 3));
    }
  });
});

/**
 * Nella variante amico una speciale vuol dire rinunciare al compagno: si
 * gioca soli contro quattro, quindi l'alleanza e' quella del monte anche se
 * di monte non ce n'e'. Cambiano solo chi apre e quanto si paga.
 */
describe('dichiarazioni speciali senza monte', () => {
  const dealer = 0;
  const config = tableConfig(5, 'amico');

  function smazzataAmico(chiamata: TipoChiamata, caller: number): HandState {
    const { hands, monte } = handsByHand(config, dealer);
    expect(monte).toEqual([]);
    return playOut(
      createHandState({
        config,
        dealer,
        trump: TRUMP,
        alliance: alleanzaMonte(caller, chiamata),
        hands,
        monte,
        leader: apreLaPrimaBase({
          chiamata,
          caller,
          dealer,
          players: config.players,
          sceltoDaAvversari: null,
        }),
      }),
    );
  }

  it('non aggiunge nessuna base in piu: i punti restano quelli del tavolo', () => {
    const finale = smazzataAmico('sola', 2);
    const totale = scoreHand(finale).perPlayer.reduce((somma, punti) => somma + punti, 0);

    expect(config.maxScore).toBe(68);
    expect(totale).toBe(68);
    expect(finale.completedTricks).toHaveLength(config.tricks);
  });

  it('fa aprire il chiamante nella sola e nella colonna', () => {
    for (const chiamata of ['sola', 'colonna'] as const) {
      expect(smazzataAmico(chiamata, 2).completedTricks[0]?.cards[0]?.player).toBe(2);
    }
  });

  it('lascia il chiamante solo contro quattro', () => {
    const isAlly = isAllyFor(alleanzaMonte(2, 'sola'));
    for (let seat = 0; seat < 5; seat += 1) {
      if (seat !== 2) expect(isAlly(2, seat)).toBe(false);
    }
    expect(isAlly(0, 4)).toBe(true);
  });
});

describe('progression', () => {
  it('accredita i punti solo al vincitore di ogni presa', () => {
    const monte = [card('coppe', 7)];
    const finale = playOut(quattroGiocatori(monte));
    const bonus = totalPoints(monte) + 1;

    finale.completedTricks.forEach((presa, t) => {
      const ultima = t === finale.completedTricks.length - 1;
      finale.progression.forEach((row, seat) => {
        const precedente = t === 0 ? 0 : (row[t - 1] as number);
        const atteso = seat === presa.winner ? presa.points + (ultima ? bonus : 0) : 0;
        expect((row[t] as number) - precedente).toBe(atteso);
      });
    });
  });

  for (const [players, variant] of [
    [3, 'monte'],
    [4, 'monte'],
    [5, 'monte'],
    [5, 'amico'],
  ] as const) {
    it(`distribuisce esattamente maxScore punti con ${players} giocatori in ${variant}`, () => {
      const config = tableConfig(players, variant);
      const dealer = 0;
      const { hands, monte } = handsByHand(config, dealer);
      const finale = playOut(
        createHandState({
          config,
          dealer,
          trump: TRUMP,
          alliance: { kind: 'liscio' },
          hands,
          monte,
        }),
      );

      const score = scoreHand(finale);
      const totale = score.perPlayer.reduce((sum, points) => sum + points, 0);
      expect(finale.completedTricks).toHaveLength(config.tricks);
      expect(totale).toBe(config.maxScore);
    });
  }
});

describe('scoreHand', () => {
  it('rifiuta di contare una smazzata aperta', () => {
    expect(() => scoreHand(quattroGiocatori([]))).toThrow(/non e' ancora conclusa/);
  });

  it('segna -1 per chi non ha mai preso nulla', () => {
    const score = scoreHand(scoredState([[0, 0], [3, 8], [0, 0]], { kind: 'liscio' }));
    expect(score.perPlayer).toEqual([0, 8, 0]);
    expect(score.reachedAtTrick).toEqual([-1, 1, -1]);
  });

  it('punta all ultima presa in cui il giocatore ha guadagnato punti', () => {
    const score = scoreHand(scoredState([[4, 4, 4], [0, 3, 3], [0, 0, 5]], { kind: 'liscio' }));
    expect(score.reachedAtTrick).toEqual([0, 1, 2]);
  });

  it('somma il chiamante da solo nel monte', () => {
    const score = scoreHand(scoredState([[9], [2], [1], [0]], alleanzaMonte(0)));
    expect(score.callerSide).toBe(9);
    expect(score.opponentSide).toBe(3);
    expect(score.callerWins).toBe(true);
    expect(score.liscioLoser).toBeNull();
  });

  it('vince appena raggiunge la soglia', () => {
    const score = scoreHand(scoredState([[5], [1], [1], [1]], alleanzaMonte(0), 5));
    expect(score.threshold).toBe(5);
    expect(score.callerWins).toBe(true);
  });

  it('perde sotto la soglia', () => {
    const score = scoreHand(scoredState([[4], [4], [1], [1]], alleanzaMonte(0), 5));
    expect(score.callerWins).toBe(false);
  });

  it('somma chiamante e amico dopo la rivelazione', () => {
    const alliance: Alliance = {
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: 2,
    };
    const score = scoreHand(scoredState([[4], [1], [3], [1], [1]], alliance, 6));
    expect(score.callerSide).toBe(7);
    expect(score.opponentSide).toBe(3);
    expect(score.callerWins).toBe(true);
  });

  it('lascia il chiamante da solo se il 7 non e mai uscito', () => {
    const alliance: Alliance = {
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: null,
    };
    const score = scoreHand(scoredState([[4], [1], [3], [1], [1]], alliance, 6));
    expect(score.callerSide).toBe(4);
    expect(score.opponentSide).toBe(6);
    expect(score.callerWins).toBe(false);
  });

  it('segnala il pareggio esatto e non lo conta come vittoria', () => {
    const score = scoreHand(scoredState([[5], [3], [1], [1]], alleanzaMonte(0), 5));
    expect(score.callerSide).toBe(5);
    expect(score.opponentSide).toBe(5);
    expect(score.tie).toBe(true);
    expect(score.callerWins).toBe(false);
  });

  it('non calcola schieramenti nel liscio', () => {
    const score = scoreHand(scoredState([[1], [5], [2]], { kind: 'liscio' }));
    expect(score.callerSide).toBeNull();
    expect(score.opponentSide).toBeNull();
    expect(score.callerWins).toBeNull();
    expect(score.tie).toBe(false);
  });
});

describe('scoreHand: liscio', () => {
  it('fa perdere chi ha fatto piu punti', () => {
    const score = scoreHand(scoredState([[1, 1], [0, 5], [3, 3]], { kind: 'liscio' }));
    expect(score.perPlayer).toEqual([1, 5, 3]);
    expect(score.liscioLoser).toBe(1);
    expect(score.liscioSecond).toBeNull();
  });

  it('a parita di punti fa perdere chi li ha raggiunti per primo', () => {
    const score = scoreHand(scoredState([[5, 5], [0, 5], [1, 1]], { kind: 'liscio' }));
    expect(score.reachedAtTrick).toEqual([0, 1, 0]);
    expect(score.liscioLoser).toBe(0);
  });

  it('a parita anche di presa usa il posto piu basso', () => {
    const score = scoreHand(scoredState([[0, 5], [0, 5], [1, 1]], { kind: 'liscio' }));
    expect(score.reachedAtTrick).toEqual([1, 1, 0]);
    expect(score.liscioLoser).toBe(0);
  });

  it('indica il secondo perdente solo a cinque giocatori', () => {
    const cinque = scoreHand(scoredState([[2], [9], [4], [7], [1]], { kind: 'liscio' }));
    expect(cinque.liscioLoser).toBe(1);
    expect(cinque.liscioSecond).toBe(3);

    const quattro = scoreHand(scoredState([[2], [9], [4], [7]], { kind: 'liscio' }));
    expect(quattro.liscioSecond).toBeNull();
  });
});

describe('settle', () => {
  function regola(
    progression: number[][],
    alliance: Alliance,
    threshold = 5,
    variant: Variant = 'monte',
  ): number[] {
    const state = scoredState(progression, alliance, threshold, variant);
    const settlement = settle(state, scoreHand(state));
    expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
    return settlement;
  }

  it('paga il chiamante che vince nel monte a quattro', () => {
    expect(regola([[10], [0], [0], [0]], alleanzaMonte(0))).toEqual([3, -1, -1, -1]);
  });

  // Chi perde con pochi punti paga anche le soglie: qui interessa la posta
  // della chiamata, quindi il chiamante perde restando sopra i 18.
  it('fa pagare il chiamante che perde nel monte a quattro', () => {
    expect(regola([[20], [30], [0], [0]], alleanzaMonte(0), 30)).toEqual([-3, 1, 1, 1]);
  });

  it('regola la coppia vincente nell amico', () => {
    const alliance: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };
    expect(regola([[6], [0], [6], [0], [0]], alliance)).toEqual([2, -1, 1, -1, -1]);
  });

  it('regola la coppia perdente nell amico', () => {
    const alliance: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };
    expect(regola([[10], [20], [8], [20], [0]], alliance, 30)).toEqual([-2, 1, -1, 1, 1]);
  });

  it('tratta l amico mai rivelato come uno contro quattro', () => {
    const alliance: Alliance = {
      kind: 'amico',
      caller: 0,
      calledCard: CARTA_CHIAMATA,
      friend: null,
    };
    expect(regola([[10], [0], [0], [0], [0]], alliance)).toEqual([4, -1, -1, -1, -1]);
    expect(regola([[20], [30], [0], [0], [0]], alliance, 30)).toEqual([-4, 1, 1, 1, 1]);
  });

  it('non muove nulla in caso di pareggio', () => {
    expect(regola([[5], [3], [1], [1]], alleanzaMonte(0))).toEqual([0, 0, 0, 0]);
  });

  it('fa pagare il solo perdente nel liscio a tre', () => {
    expect(regola([[1], [5], [2]], { kind: 'liscio' })).toEqual([1, -2, 1]);
  });

  it('fa pagare perdente e secondo nel liscio a cinque', () => {
    expect(regola([[2], [9], [4], [7], [1]], { kind: 'liscio' })).toEqual([1, -2, 1, -1, 1]);
  });

  it('triplica la posta nella sola', () => {
    expect(regola([[10], [0], [0], [0]], alleanzaMonte(0, 'sola'))).toEqual([9, -3, -3, -3]);
  });

  it('quadruplica la posta nella colonna', () => {
    expect(regola([[10], [0], [0], [0]], alleanzaMonte(0, 'colonna'))).toEqual([12, -4, -4, -4]);
  });

  it('quintuplica la posta nella chi se la sente, anche quando il chiamante perde', () => {
    expect(regola([[20], [30], [0], [0], [0]], alleanzaMonte(0, 'chiSeLaSente'), 30)).toEqual([
      -20, 5, 5, 5, 5,
    ]);
  });

  it('chiude in pari con qualunque dichiarazione, a ogni tavolo', () => {
    const chiamate: TipoChiamata[] = ['normale', 'sola', 'colonna', 'chiSeLaSente'];
    for (const players of [3, 4, 5]) {
      for (const chiamata of chiamate) {
        for (const vincente of [0, 1]) {
          const progression = Array.from({ length: players }, (_, seat) => [
            seat === vincente ? 10 : 0,
          ]);
          const settlement = regola(progression, alleanzaMonte(0, chiamata));
          expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
        }
      }
    }
  });

  it('paga la sola dichiarata senza monte come uno contro quattro', () => {
    const vinta = regola([[10], [0], [0], [0], [0]], alleanzaMonte(0, 'sola'), 5, 'amico');
    expect(vinta).toEqual([12, -3, -3, -3, -3]);
  });

  it('paga la chi se la sente persa senza monte', () => {
    const persa = regola(
      [[20], [30], [0], [0], [0]],
      alleanzaMonte(0, 'chiSeLaSente'),
      30,
      'amico',
    );
    expect(persa).toEqual([-20, 5, 5, 5, 5]);
  });

  it('non tocca la posta nel liscio e nell amico', () => {
    const amico: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };
    expect(regola([[6], [0], [6], [0], [0]], amico)).toEqual([2, -1, 1, -1, -1]);
    expect(regola([[1], [5], [2]], { kind: 'liscio' })).toEqual([1, -2, 1]);
  });

  it('chiude sempre in pari su una smazzata giocata davvero', () => {
    const finale = playOut(quattroGiocatori([card('coppe', 7)]));
    const settlement = settle(finale, scoreHand(finale));
    expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
  });
});

/**
 * Il cappotto vale una partita in piu', che si somma alla posta della
 * dichiarazione invece di moltiplicarla.
 */
describe('settle: cappotto', () => {
  /** Tutte le basi allo stesso posto. */
  function tutteA(seat: number, quante: number): number[] {
    return Array.from({ length: quante }, () => seat);
  }

  function regola(
    progression: number[][],
    alliance: Alliance,
    vincitoriDelleBasi: number[],
    variant: Variant = 'monte',
  ): number[] {
    const state = scoredState(progression, alliance, 5, variant, vincitoriDelleBasi);
    const settlement = settle(state, scoreHand(state));
    expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
    return settlement;
  }

  const conAmico: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };

  it('paga due partite al chiamante che prende tutto, a tre', () => {
    expect(regola([[10], [0], [0]], alleanzaMonte(0), tutteA(0, 3))).toEqual([4, -2, -2]);
  });

  it('somma la partita del cappotto alla sola', () => {
    expect(regola([[10], [0], [0]], alleanzaMonte(0, 'sola'), tutteA(0, 3))).toEqual([8, -4, -4]);
  });

  it('somma la partita del cappotto alla colonna, a quattro', () => {
    expect(
      regola([[10], [0], [0], [0]], alleanzaMonte(0, 'colonna'), tutteA(0, 4)),
    ).toEqual([15, -5, -5, -5]);
  });

  it('somma la partita del cappotto alla chi se la sente, a cinque', () => {
    expect(
      regola([[10], [0], [0], [0], [0]], alleanzaMonte(0, 'chiSeLaSente'), tutteA(0, 5)),
    ).toEqual([24, -6, -6, -6, -6]);
  });

  // Chi non fa basi non fa nemmeno punti: al cappotto contro si somma sempre
  // anche la soglia piu' bassa.
  it('fa pagare cappotto e soglia al chiamante rimasto senza basi', () => {
    expect(regola([[0], [10], [0], [0]], alleanzaMonte(0), [1, 1, 2, 3])).toEqual([-9, 3, 3, 3]);
  });

  it('somma la partita del cappotto anche alla dichiarazione andata male', () => {
    expect(
      regola([[0], [10], [0], [0]], alleanzaMonte(0, 'colonna'), [1, 1, 2, 3]),
    ).toEqual([-18, 6, 6, 6]);
  });

  it('raddoppia le quote della coppia che prende tutte le basi', () => {
    expect(regola([[6], [0], [6], [0], [0]], conAmico, [0, 2, 0, 2, 0], 'amico')).toEqual([
      4, -2, 2, -2, -2,
    ]);
  });

  it('e cappotto contro anche se l amico ha preso basi e i punti bastavano', () => {
    expect(regola([[0], [3], [6], [0], [0]], conAmico, [2, 2, 1, 3, 4], 'amico')).toEqual([
      -8, 2, 2, 2, 2,
    ]);
  });

  it('paga allo stesso modo quando non ha preso niente nemmeno l amico', () => {
    expect(regola([[0], [6], [0], [3], [0]], conAmico, [1, 1, 3, 4, 3], 'amico')).toEqual([
      -8, 2, 2, 2, 2,
    ]);
  });

  it('paga il cappotto contro anche quando i punti sarebbero pari', () => {
    // Le basi vengono prima dei punti: il pareggio non salva chi non ne ha una.
    expect(regola([[0], [5], [5], [0], [0]], conAmico, [2, 1, 1, 3, 4], 'amico')).toEqual([
      -8, 2, 2, 2, 2,
    ]);
  });

  it('ribalta il liscio: chi prende tutte le basi incassa invece di pagare', () => {
    expect(regola([[0], [10], [0]], { kind: 'liscio' }, tutteA(1, 3))).toEqual([-2, 4, -2]);
  });

  it('lascia il liscio com era quando le basi sono divise', () => {
    expect(regola([[1], [5], [2]], { kind: 'liscio' }, [0, 1, 2])).toEqual([1, -2, 1]);
  });
});

/**
 * Chi chiama con una mano che non regge paga il supplemento: le soglie si
 * sommano alla dichiarazione e al cappotto, e valgono solo per chi perde.
 */
describe('penalitaDaSoglia', () => {
  it('a tre ha due gradini, il 18 e il 25', () => {
    expect(penalitaDaSoglia(0, 3)).toBe(2);
    expect(penalitaDaSoglia(17, 3)).toBe(2);
    expect(penalitaDaSoglia(18, 3)).toBe(1);
    expect(penalitaDaSoglia(24, 3)).toBe(1);
    expect(penalitaDaSoglia(25, 3)).toBe(0);
    expect(penalitaDaSoglia(40, 3)).toBe(0);
  });

  it('a quattro conta solo il 18', () => {
    expect(penalitaDaSoglia(17, 4)).toBe(1);
    expect(penalitaDaSoglia(18, 4)).toBe(0);
    expect(penalitaDaSoglia(24, 4)).toBe(0);
  });

  it('a cinque conta solo il 18', () => {
    expect(penalitaDaSoglia(17, 5)).toBe(1);
    expect(penalitaDaSoglia(18, 5)).toBe(0);
    expect(penalitaDaSoglia(24, 5)).toBe(0);
  });
});

describe('soglie di punteggio', () => {
  const conAmico: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };

  function regola(
    progression: number[][],
    alliance: Alliance,
    threshold: number,
    variant: Variant = 'monte',
    vincitoriDelleBasi?: number[],
  ): number[] {
    const state = scoredState(progression, alliance, threshold, variant, vincitoriDelleBasi);
    const settlement = settle(state, scoreHand(state));
    expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
    return settlement;
  }

  function penalita(
    progression: number[][],
    alliance: Alliance,
    threshold: number,
    variant: Variant = 'monte',
    vincitoriDelleBasi?: number[],
  ): number {
    return scoreHand(scoredState(progression, alliance, threshold, variant, vincitoriDelleBasi))
      .penalitaSoglia;
  }

  it('non aggiunge niente a chi perde restando sopra il 25, a tre', () => {
    expect(penalita([[30], [50], [0]], alleanzaMonte(0), 40)).toBe(0);
    expect(regola([[30], [50], [0]], alleanzaMonte(0), 40)).toEqual([-2, 1, 1]);
  });

  it('aggiunge una partita a chi perde fra 18 e 24, a tre', () => {
    expect(penalita([[20], [50], [0]], alleanzaMonte(0), 40)).toBe(1);
    expect(regola([[20], [50], [0]], alleanzaMonte(0), 40)).toEqual([-4, 2, 2]);
  });

  it('aggiunge due partite a chi perde sotto il 18, a tre', () => {
    expect(penalita([[12], [50], [0]], alleanzaMonte(0), 40)).toBe(2);
    expect(regola([[12], [50], [0]], alleanzaMonte(0), 40)).toEqual([-6, 3, 3]);
  });

  it('aggiunge una sola partita sotto il 18, a quattro', () => {
    expect(penalita([[15], [50], [0], [0]], alleanzaMonte(0), 40)).toBe(1);
    expect(regola([[15], [50], [0], [0]], alleanzaMonte(0), 40)).toEqual([-6, 2, 2, 2]);
  });

  it('si somma alla dichiarazione: colonna persa con dieci punti, a tre', () => {
    expect(regola([[10], [50], [0]], alleanzaMonte(0, 'colonna'), 40)).toEqual([-12, 6, 6]);
  });

  it('si somma anche al cappotto contro: uno piu uno piu due, a tre', () => {
    expect(penalita([[0], [50], [0]], alleanzaMonte(0), 40, 'monte', [1, 1, 2])).toBe(2);
    expect(regola([[0], [50], [0]], alleanzaMonte(0), 40, 'monte', [1, 1, 2])).toEqual([-8, 4, 4]);
  });

  it('nell amico guarda i punti della coppia', () => {
    expect(penalita([[20], [50], [20], [0], [0]], conAmico, 60, 'amico')).toBe(0);
    expect(penalita([[8], [50], [7], [0], [0]], conAmico, 60, 'amico')).toBe(1);
  });

  it('nell amico non guarda i punti se il chiamante non ha fatto basi', () => {
    // Sono punti dell amico, non suoi: il cappotto contro e' gia' il massimo.
    const senzaBasi = [1, 1, 2, 3, 4];
    expect(penalita([[0], [10], [30], [0], [0]], conAmico, 60, 'amico', senzaBasi)).toBe(0);
    expect(regola([[0], [10], [30], [0], [0]], conAmico, 60, 'amico', senzaBasi)).toEqual([
      -8, 2, 2, 2, 2,
    ]);
  });

  it('non tocca chi vince, per quanto pochi siano i punti', () => {
    expect(penalita([[6], [0], [0], [0]], alleanzaMonte(0), 5)).toBe(0);
    expect(regola([[6], [0], [0], [0]], alleanzaMonte(0), 5)).toEqual([3, -1, -1, -1]);
  });

  it('non tocca il liscio, dove non c e nessun chiamante', () => {
    expect(penalita([[1], [5], [2]], { kind: 'liscio' }, 40)).toBe(0);
    expect(regola([[1], [5], [2]], { kind: 'liscio' }, 40)).toEqual([1, -2, 1]);
  });

  it('non tocca il pareggio, dove non paga nessuno', () => {
    expect(penalita([[5], [3], [1], [1]], alleanzaMonte(0), 5)).toBe(0);
    expect(regola([[5], [3], [1], [1]], alleanzaMonte(0), 5)).toEqual([0, 0, 0, 0]);
  });
});

describe('scoreHand: cappotto', () => {
  const conAmico: Alliance = { kind: 'amico', caller: 0, calledCard: CARTA_CHIAMATA, friend: 2 };

  it('non vede cappotti quando le basi sono divise', () => {
    const score = scoreHand(scoredState([[9], [2], [1], [0]], alleanzaMonte(0)));
    expect(score.cappotto).toBeNull();
    expect(score.cappottoDi).toBeNull();
  });

  it('riconosce il cappotto a favore del chiamante', () => {
    const score = scoreHand(scoredState([[10], [0], [0]], alleanzaMonte(0), 5, 'monte', [0, 0, 0]));
    expect(score.cappotto).toBe('favore');
    expect(score.cappottoDi).toBe(0);
  });

  it('conta la coppia nel cappotto a favore dell amico', () => {
    const state = scoredState([[6], [0], [6], [0], [0]], conAmico, 5, 'amico', [0, 2, 0, 2, 0]);
    const score = scoreHand(state);
    expect(score.cappotto).toBe('favore');
    expect(score.cappottoDi).toBe(0);
  });

  it('riconosce il cappotto contro anche se l amico ha preso basi', () => {
    const state = scoredState([[0], [3], [6], [0], [0]], conAmico, 5, 'amico', [2, 2, 1, 3, 4]);
    const score = scoreHand(state);
    expect(score.cappotto).toBe('contro');
    expect(score.cappottoDi).toBe(0);
  });

  it('nel liscio non lascia perdenti da punti', () => {
    const score = scoreHand(scoredState([[0], [10], [0]], { kind: 'liscio' }, 5, 'monte', [1, 1, 1]));
    expect(score.cappotto).toBe('liscio');
    expect(score.cappottoDi).toBe(1);
    expect(score.liscioLoser).toBeNull();
    expect(score.liscioSecond).toBeNull();
  });

  it('rifiuta uno stato in cui le basi non tornano con le prese', () => {
    const rotto: HandState = {
      ...scoredState([[10], [0], [0]], alleanzaMonte(0)),
      completedTricks: [],
    };
    expect(() => scoreHand(rotto)).toThrow(/incoerente/);
  });

  it('da anche il monte a chi prende tutte le prese', () => {
    const monte = [card('coppe', 7)];
    const finale = playOut(quattroGiocatori(monte));
    const score = scoreHand(finale);
    // Il monte non e' una presa giocata: entra con chi vince l'ultima, e chi
    // le vince tutte se lo prende per forza, con la sua base in piu'.
    const giocate = finale.completedTricks.flatMap((presa) => presa.cards.map((c) => c.card));
    const basiGiocate = finale.completedTricks.length;
    const vincitore = score.cappottoDi ?? -1;
    expect(score.cappotto).toBe('liscio');
    expect(basiGiocate + 1).toBe(finale.config.bases);
    expect(score.perPlayer[vincitore]).toBe(
      totalPoints(giocate) + basiGiocate + totalPoints(monte) + 1,
    );
    expect(score.perPlayer.filter((_, seat) => seat !== vincitore)).toEqual([0, 0, 0]);
  });
});

describe('settleChiSeLaSenteScaduto', () => {
  it('fa perdere gli avversari che non si sono fatti avanti', () => {
    expect(settleChiSeLaSenteScaduto(tableConfig(4, 'monte'), 0)).toEqual([15, -5, -5, -5]);
  });

  it('paga il chiamante ovunque sia seduto, e chiude in pari', () => {
    for (const players of [3, 4, 5]) {
      const config = tableConfig(players, 'monte');
      for (let caller = 0; caller < players; caller += 1) {
        const settlement = settleChiSeLaSenteScaduto(config, caller);
        expect(settlement[caller]).toBe(5 * (players - 1));
        expect(settlement.filter((_, seat) => seat !== caller)).toEqual(
          Array.from({ length: players - 1 }, () => -5),
        );
        expect(settlement.reduce((sum, quota) => sum + quota, 0)).toBe(0);
      }
    }
  });

  it('rifiuta un chiamante che non e al tavolo', () => {
    expect(() => settleChiSeLaSenteScaduto(tableConfig(4, 'monte'), 4)).toThrow(/inesistente/);
  });
});
