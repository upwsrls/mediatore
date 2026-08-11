import type { Card, HandScore, Rank, Suit, Trick } from '@mediatore/engine';
import { SUITS, cardStrength } from '@mediatore/engine';

const SUIT_LETTERS: Record<Suit, string> = {
  denari: 'd',
  coppe: 'c',
  spade: 's',
  bastoni: 'b',
};

/** Le figure restano figure: mai 8, 9 o 10. */
const RANK_LABELS: Record<Rank, string> = {
  7: '7',
  asso: 'A',
  re: 'R',
  cavallo: 'C',
  fante: 'F',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
};

export function formatCard(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_LETTERS[card.suit]}`;
}

export function formatHand(cards: Card[]): string {
  return [...cards]
    .sort(
      (a, b) =>
        SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) ||
        cardStrength(b.rank) - cardStrength(a.rank),
    )
    .map(formatCard)
    .join(' ');
}

export function formatTrick(trick: Trick): string {
  if (trick.plays.length === 0) return '(presa vuota)';
  return trick.plays.map((play) => `p${play.player}:${formatCard(play.card)}`).join('  ');
}

function withSign(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatScore(score: HandScore, settlement: number[]): string {
  const righe: string[] = [];
  righe.push(score.perPlayer.map((points, seat) => `p${seat}: ${points}`).join('  '));

  if (score.callerSide === null) {
    const secondo = score.liscioSecond === null ? '' : `, secondo p${score.liscioSecond}`;
    righe.push(`liscio: paga p${score.liscioLoser}${secondo}`);
  } else if (score.tie) {
    righe.push(`pareggio: ${score.callerSide} pari, soglia ${score.threshold}, nessuno paga`);
  } else {
    const esito = score.callerWins ? 'il chiamante vince' : 'il chiamante perde';
    righe.push(
      `chiamante ${score.callerSide} - avversari ${score.opponentSide}` +
        ` (soglia ${score.threshold}): ${esito}`,
    );
  }

  righe.push(settlement.map((quota, seat) => `p${seat}: ${withSign(quota)}`).join('  '));
  return righe.join('\n');
}
