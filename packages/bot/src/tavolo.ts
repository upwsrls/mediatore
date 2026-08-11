import type { TableConfig } from '@mediatore/engine';

/**
 * I quattro tavoli che si giocano davvero. Non basta il numero di giocatori:
 * a cinque si gioca in due modi diversi, soli contro tutti o con l'amico, e
 * la mano che vale una chiamata non e' la stessa.
 */
export type TavoloDiChiamata = '3' | '4' | '5' | 'amico';

export function tavoloDi(config: TableConfig): TavoloDiChiamata {
  if (config.variant === 'amico') return 'amico';
  if (config.players === 3) return '3';
  if (config.players === 4) return '4';
  return '5';
}
