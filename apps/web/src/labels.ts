import type { Card, HandState, Rank, Suit } from '@mediatore/engine';
import { ledSuit } from '@mediatore/engine';
import iconaBastoni from './carte/semi/bastoni.svg';
import iconaCoppe from './carte/semi/coppe.svg';
import iconaDenari from './carte/semi/denari.svg';
import iconaSpade from './carte/semi/spade.svg';

export interface SemeInfo {
  /** L SVG napoletano originale: provenienza e licenza in carte/semi/LICENZE.md. */
  icona: string;
  nome: string;
  classe: string;
}

export const SEMI: Record<Suit, SemeInfo> = {
  denari: { icona: iconaDenari, nome: 'denari', classe: 'seme-denari' },
  coppe: { icona: iconaCoppe, nome: 'coppe', classe: 'seme-coppe' },
  spade: { icona: iconaSpade, nome: 'spade', classe: 'seme-spade' },
  bastoni: { icona: iconaBastoni, nome: 'bastoni', classe: 'seme-bastoni' },
};

/** Le figure restano figure: mai 8, 9 o 10. */
export const NOMI_RANK: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  fante: 'FANTE',
  cavallo: 'CAVALLO',
  re: 'RE',
  asso: 'ASSO',
  7: '7',
};

/**
 * Chi siede a questo tavolo, quando i posti hanno un nome invece di un
 * numero. Si fissa quando nasce la smazzata e vale per tutta la sua durata:
 * un tavolo alla volta, come al bar.
 */
let nomiDelTavolo: readonly string[] = [];

export function fissaNomiDelTavolo(nomi: readonly string[]): void {
  nomiDelTavolo = nomi;
}

export function nomeGiocatore(seat: number): string {
  return nomiDelTavolo[seat] ?? `giocatore ${seat}`;
}

/** Per gli spazi stretti: un soprannome ci sta gia', un numero va accorciato. */
export function nomeCompatto(seat: number): string {
  return nomiDelTavolo[seat] ?? `g${seat}`;
}

/** Cumulato dell'ultima presa registrata, letto dalla progression dell'engine. */
export function puntiCorrenti(state: HandState): number[] {
  return state.progression.map((riga) => riga[riga.length - 1] ?? 0);
}

/**
 * Perche' una carta non e' giocabile. Non applica le regole: le deduce dal
 * confronto fra la mano e le mosse legali calcolate dall'engine.
 */
export function motivoNonGiocabile(card: Card, legal: Card[], state: HandState): string {
  const led = ledSuit(state.currentTrick);
  if (legal.length === 0 || led === null) return 'non puoi giocare adesso';

  if (legal.every((c) => c.suit === led) && card.suit !== led) {
    return `devi rispondere a ${SEMI[led].nome}`;
  }
  if (legal.every((c) => c.suit === state.trump) && card.suit !== state.trump) {
    return 'devi giocare trionfo';
  }
  return 'devi superare la carta che vince';
}

/** Riga unica sotto la mano: sui telefoni non c'e' il passaggio del mouse. */
export function obbligoCorrente(mano: Card[], legal: Card[], state: HandState): string | null {
  const bloccate = mano.filter((card) => !legal.some((c) => c.id === card.id));
  if (bloccate.length === 0) return null;
  const motivi = new Set(bloccate.map((card) => motivoNonGiocabile(card, legal, state)));
  return [...motivi].join(' · ');
}
