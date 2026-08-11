import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './cards.ts';
import { createDeck } from './cards.ts';
import type { IsAlly, PlayedCard, PlayerId, Trick } from './trick.ts';
import { beats, currentWinner, isLegalPlay, ledSuit, legalPlays, trickPoints } from './trick.ts';

/** Ognuno e' alleato solo di se stesso: nessun compagno al tavolo. */
const soloAllies: IsAlly = (a, b) => a === b;
/** Coppie fisse: pari contro dispari. */
const teams: IsAlly = (a, b) => a % 2 === b % 2;

const TRUMP: Suit = 'bastoni';

const deck = createDeck();

function card(suit: Suit, rank: Rank): Card {
  const found = deck.find((c) => c.suit === suit && c.rank === rank);
  if (found === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return found;
}

function play(player: PlayerId, suit: Suit, rank: Rank): PlayedCard {
  return { player, card: card(suit, rank) };
}

function makeTrick(plays: PlayedCard[], leader: PlayerId = 0, trump: Suit = TRUMP): Trick {
  return { leader, trump, plays };
}

function ids(cards: Card[]): string[] {
  return cards.map((c) => c.id).sort();
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('helper di alleanza', () => {
  it('considera ogni giocatore alleato di se stesso', () => {
    expect(soloAllies(2, 2)).toBe(true);
    expect(teams(2, 2)).toBe(true);
  });
});

describe('ledSuit', () => {
  it('ritorna null su presa vuota', () => {
    expect(ledSuit(makeTrick([]))).toBeNull();
  });

  it('ritorna il seme della prima carta giocata', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'denari', 7)]);
    expect(ledSuit(trick)).toBe('coppe');
  });
});

describe('beats', () => {
  it('fa battere un trionfo basso su una carta alta del seme di apertura', () => {
    expect(beats(card('bastoni', 2), card('coppe', 7), TRUMP, 'coppe')).toBe(true);
  });

  it('non fa mai battere una carta di un seme terzo', () => {
    expect(beats(card('spade', 7), card('coppe', 2), TRUMP, 'coppe')).toBe(false);
    expect(beats(card('spade', 7), card('bastoni', 2), TRUMP, 'coppe')).toBe(false);
  });

  it('fra due trionfi premia la forza maggiore', () => {
    expect(beats(card('bastoni', 7), card('bastoni', 'asso'), TRUMP, 'coppe')).toBe(true);
    expect(beats(card('bastoni', 'fante'), card('bastoni', 're'), TRUMP, 'coppe')).toBe(false);
  });

  it('fra due carte del seme di apertura premia la forza maggiore', () => {
    expect(beats(card('coppe', 'asso'), card('coppe', 're'), TRUMP, 'coppe')).toBe(true);
    expect(beats(card('coppe', 3), card('coppe', 're'), TRUMP, 'coppe')).toBe(false);
  });

  it('non fa battere un non-trionfo su un trionfo', () => {
    expect(beats(card('coppe', 7), card('bastoni', 2), TRUMP, 'coppe')).toBe(false);
  });
});

describe('currentWinner', () => {
  it('ritorna null su presa vuota', () => {
    expect(currentWinner(makeTrick([]))).toBeNull();
  });

  it('assegna la presa alla carta di forza maggiore nel seme di apertura', () => {
    const trick = makeTrick([
      play(0, 'coppe', 're'),
      play(1, 'coppe', 'asso'),
      play(2, 'coppe', 3),
    ]);
    expect(currentWinner(trick)).toBe(1);
  });

  it('assegna la presa a chi ha tagliato', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'bastoni', 2)]);
    expect(currentWinner(trick)).toBe(1);
  });

  it('assegna la presa al trionfo maggiore in caso di sopra-taglio', () => {
    const trick = makeTrick([
      play(0, 'coppe', 're'),
      play(1, 'bastoni', 2),
      play(2, 'bastoni', 'fante'),
      play(3, 'coppe', 7),
    ]);
    expect(currentWinner(trick)).toBe(2);
  });

  it('ignora le carte di semi terzi', () => {
    const trick = makeTrick([play(0, 'coppe', 2), play(1, 'spade', 7), play(2, 'denari', 'asso')]);
    expect(currentWinner(trick)).toBe(0);
  });
});

describe('trickPoints', () => {
  it('somma i punti delle carte e aggiunge la base', () => {
    const trick = makeTrick([
      play(0, 'coppe', 7),
      play(1, 'coppe', 'asso'),
      play(2, 'coppe', 3),
      play(3, 'denari', 5),
    ]);
    expect(trickPoints(trick)).toBe(10);
  });

  it('vale 1 su una presa di sole scartine', () => {
    const trick = makeTrick([
      play(0, 'coppe', 2),
      play(1, 'coppe', 3),
      play(2, 'denari', 4),
      play(3, 'spade', 5),
    ]);
    expect(trickPoints(trick)).toBe(1);
  });

  it('vale 1 su una presa vuota', () => {
    expect(trickPoints(makeTrick([]))).toBe(1);
  });
});

describe('legalPlays: primo di mano', () => {
  it('lascia libera tutta la mano', () => {
    const hand = [card('coppe', 3), card('bastoni', 7), card('denari', 'asso')];
    expect(ids(legalPlays(hand, makeTrick([]), 0, teams))).toEqual(ids(hand));
  });
});

describe('legalPlays: obbligo di rispondere a seme', () => {
  it('esclude il trionfo quando ho carte del seme di apertura', () => {
    const trick = makeTrick([play(0, 'coppe', 7)]);
    const hand = [card('coppe', 're'), card('coppe', 2), card('bastoni', 7)];
    const legal = legalPlays(hand, trick, 1, soloAllies);
    expect(ids(legal)).toEqual(ids([card('coppe', 're'), card('coppe', 2)]));
    expect(legal.some((c) => c.suit === TRUMP)).toBe(false);
  });

  it('obbliga a giocare la sola carta del seme che supera la vincente', () => {
    const trick = makeTrick([play(0, 'coppe', 're')]);
    const hand = [card('coppe', 'asso'), card('coppe', 3)];
    expect(ids(legalPlays(hand, trick, 1, teams))).toEqual(ids([card('coppe', 'asso')]));
  });

  it('lascia tutte le carte del seme quando nessuna supera la vincente', () => {
    const trick = makeTrick([play(0, 'coppe', 7)]);
    const hand = [card('coppe', 'asso'), card('coppe', 3)];
    expect(ids(legalPlays(hand, trick, 1, teams))).toEqual(ids(hand));
  });

  it('lascia tutte le carte del seme quando un trionfo ha gia tagliato', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'bastoni', 2)]);
    const hand = [card('coppe', 7), card('coppe', 3)];
    expect(ids(legalPlays(hand, trick, 2, teams))).toEqual(ids(hand));
  });

  it('non obbliga a superare quando sta vincendo il compagno', () => {
    const trick = makeTrick([play(0, 'coppe', 're')]);
    const hand = [card('coppe', 'asso'), card('coppe', 3)];
    expect(ids(legalPlays(hand, trick, 2, teams))).toEqual(ids(hand));
    // Senza compagni lo stesso tavolo impone invece di superare.
    expect(ids(legalPlays(hand, trick, 2, soloAllies))).toEqual(ids([card('coppe', 'asso')]));
  });
});

describe('legalPlays: privo del seme di apertura', () => {
  it('obbliga a giocare solo trionfi contro un avversario vincente', () => {
    const trick = makeTrick([play(0, 'coppe', 're')]);
    const hand = [card('bastoni', 2), card('bastoni', 'fante'), card('denari', 5)];
    expect(ids(legalPlays(hand, trick, 1, teams))).toEqual(
      ids([card('bastoni', 2), card('bastoni', 'fante')]),
    );
  });

  it('obbliga a superare il trionfo avversario maggiore in tavola', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'bastoni', 'fante')]);
    const hand = [card('bastoni', 2), card('bastoni', 're'), card('denari', 5)];
    expect(ids(legalPlays(hand, trick, 2, teams))).toEqual(ids([card('bastoni', 're')]));
  });

  it('lascia libera la mano quando tutti i miei trionfi sono inferiori', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'bastoni', 7)]);
    const hand = [card('bastoni', 2), card('bastoni', 3), card('denari', 5)];
    expect(ids(legalPlays(hand, trick, 2, teams))).toEqual(ids(hand));
  });

  it('lascia libera la mano quando sta vincendo il compagno', () => {
    const trick = makeTrick([play(0, 'coppe', 're')]);
    const hand = [card('bastoni', 7), card('denari', 5)];
    expect(ids(legalPlays(hand, trick, 2, teams))).toEqual(ids(hand));
  });

  it('lascia libera la mano quando non ho trionfi', () => {
    const trick = makeTrick([play(0, 'coppe', 're')]);
    const hand = [card('denari', 5), card('spade', 'asso')];
    expect(ids(legalPlays(hand, trick, 1, teams))).toEqual(ids(hand));
  });
});

describe('isLegalPlay', () => {
  const trick = makeTrick([play(0, 'coppe', 're')]);
  const hand = [card('coppe', 'asso'), card('coppe', 3), card('bastoni', 7)];

  it('accetta la carta che supera la vincente', () => {
    expect(isLegalPlay(card('coppe', 'asso'), hand, trick, 1, teams)).toBe(true);
  });

  it('rifiuta la carta del seme che non supera e rifiuta il taglio', () => {
    expect(isLegalPlay(card('coppe', 3), hand, trick, 1, teams)).toBe(false);
    expect(isLegalPlay(card('bastoni', 7), hand, trick, 1, teams)).toBe(false);
  });

  it('rifiuta una carta che non ho in mano', () => {
    expect(isLegalPlay(card('denari', 'asso'), hand, trick, 1, teams)).toBe(false);
  });
});

describe('purezza', () => {
  it('non muta la mano e la presa', () => {
    const trick = makeTrick([play(0, 'coppe', 're'), play(1, 'bastoni', 2)]);
    const hand = [card('coppe', 7), card('coppe', 3), card('bastoni', 7)];
    const trickSnapshot = snapshot(trick);
    const handSnapshot = snapshot(hand);

    legalPlays(hand, trick, 2, teams);
    currentWinner(trick);
    trickPoints(trick);
    isLegalPlay(card('coppe', 7), hand, trick, 2, teams);

    expect(trick).toEqual(trickSnapshot);
    expect(hand).toEqual(handSnapshot);
  });

  it('non ritorna mai lo stesso array della mano', () => {
    const hand = [card('coppe', 3), card('bastoni', 7)];
    const legal = legalPlays(hand, makeTrick([]), 0, teams);
    expect(legal).not.toBe(hand);
    legal.pop();
    expect(hand).toHaveLength(2);
  });
});
