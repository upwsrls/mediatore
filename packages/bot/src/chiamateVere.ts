import type { Suit } from '@mediatore/engine';

/**
 * Le decisioni di chiamata di un giocatore vero, prese da 98 smazzate
 * registrate una decisione alla volta: 65 volte gli e' toccato scegliere se
 * chiamare o passare, su tutti e quattro i tavoli.
 *
 * Da qui esce il criterio del bot, e qui si controlla che non se ne allontani.
 * Non sono un compito da fare col massimo dei voti: alcune mani sono
 * scommesse, e infatti qualcuna l'ha pagata. Copiarle tutte vorrebbe dire
 * copiare anche quelle.
 *
 * File generato dalle partite registrate: si riscrive, non si corregge a mano.
 */

export interface ChiamataVera {
  /** Il numero della decisione nell'ordine in cui e' stata giocata. */
  n: number;
  giocatori: number;
  variante: 'monte' | 'amico';
  trionfo: Suit;
  /** L'id della carta scoperta sul monte; nell'amico non ce n'e'. */
  scoperta: string | null;
  /** Cosa ha fatto davvero. Le speciali sono chiamate anche loro. */
  scelta: 'passo' | 'normale' | 'sola' | 'colonna' | 'chiSeLaSente';
  /** Come e' finita per lui quella smazzata: serve a leggere le scommesse. */
  quota: number | null;
  /** Gli id delle carte in mano, separati da spazio. */
  mano: string;
}

export const CHIAMATE_VERE: readonly ChiamataVera[] = [
  { n: 1, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-6', scelta: 'normale', quota: 2, mano: 'denari-fante coppe-asso coppe-5 denari-6 denari-7 spade-re bastoni-3 bastoni-5 spade-2 coppe-2 bastoni-4 coppe-re' },
  { n: 2, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-4', scelta: 'normale', quota: 2, mano: 'spade-4 bastoni-cavallo coppe-7 coppe-3 coppe-5 coppe-6 denari-2 spade-fante denari-cavallo denari-asso spade-cavallo bastoni-4' },
  { n: 3, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-6', scelta: 'passo', quota: 1, mano: 'denari-6 spade-4 spade-3 coppe-2 coppe-asso spade-asso denari-fante bastoni-asso spade-fante bastoni-6 coppe-re spade-re' },
  { n: 4, giocatori: 3, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-3', scelta: 'passo', quota: 1, mano: 'bastoni-5 bastoni-2 bastoni-cavallo coppe-5 denari-asso denari-3 spade-6 denari-2 coppe-fante bastoni-asso spade-fante spade-7' },
  { n: 5, giocatori: 3, variante: 'monte', trionfo: 'denari', scoperta: 'denari-cavallo', scelta: 'passo', quota: -2, mano: 'denari-4 bastoni-re bastoni-7 coppe-fante spade-4 coppe-3 spade-5 bastoni-asso spade-7 coppe-7 bastoni-cavallo coppe-asso' },
  { n: 6, giocatori: 3, variante: 'monte', trionfo: 'spade', scoperta: 'spade-3', scelta: 'passo', quota: -2, mano: 'bastoni-4 spade-2 coppe-asso bastoni-fante coppe-re denari-fante bastoni-3 spade-re spade-4 spade-5 denari-asso coppe-3' },
  { n: 7, giocatori: 3, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-6', scelta: 'passo', quota: 1, mano: 'coppe-2 denari-fante bastoni-3 denari-asso coppe-3 denari-re coppe-4 coppe-6 coppe-asso spade-fante denari-2 bastoni-fante' },
  { n: 8, giocatori: 3, variante: 'monte', trionfo: 'spade', scoperta: 'spade-2', scelta: 'passo', quota: -1, mano: 'bastoni-fante bastoni-asso spade-4 denari-2 denari-5 coppe-2 spade-6 coppe-3 spade-7 coppe-cavallo bastoni-re denari-cavallo' },
  { n: 9, giocatori: 3, variante: 'monte', trionfo: 'denari', scoperta: 'denari-5', scelta: 'passo', quota: 1, mano: 'denari-cavallo spade-7 bastoni-fante bastoni-3 bastoni-5 bastoni-4 spade-re spade-cavallo spade-fante coppe-4 bastoni-7 denari-re' },
  { n: 10, giocatori: 3, variante: 'monte', trionfo: 'spade', scoperta: 'spade-cavallo', scelta: 'normale', quota: 2, mano: 'bastoni-5 spade-3 bastoni-4 spade-2 spade-7 coppe-7 bastoni-asso bastoni-3 bastoni-fante spade-fante coppe-4 denari-4' },
  { n: 11, giocatori: 3, variante: 'monte', trionfo: 'denari', scoperta: 'denari-5', scelta: 'passo', quota: 1, mano: 'denari-4 spade-6 coppe-2 coppe-5 spade-5 denari-re spade-asso bastoni-3 coppe-fante denari-6 spade-fante bastoni-4' },
  { n: 12, giocatori: 5, variante: 'amico', trionfo: 'bastoni', scoperta: null, scelta: 'chiSeLaSente', quota: -24, mano: 'spade-4 coppe-2 denari-5 denari-3 spade-5 denari-fante denari-4 coppe-re' },
  { n: 13, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'passo', quota: 2, mano: 'coppe-6 bastoni-4 bastoni-3 spade-asso denari-7 bastoni-asso bastoni-2 bastoni-re' },
  { n: 14, giocatori: 5, variante: 'amico', trionfo: 'bastoni', scoperta: null, scelta: 'passo', quota: -1, mano: 'spade-3 denari-7 bastoni-3 spade-5 spade-6 bastoni-6 coppe-6 bastoni-fante' },
  { n: 15, giocatori: 5, variante: 'amico', trionfo: 'bastoni', scoperta: null, scelta: 'normale', quota: 2, mano: 'coppe-fante coppe-3 spade-6 bastoni-3 bastoni-asso spade-2 bastoni-5 bastoni-7' },
  { n: 16, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'normale', quota: 2, mano: 'coppe-3 spade-5 bastoni-cavallo denari-7 denari-re spade-7 coppe-cavallo denari-3' },
  { n: 17, giocatori: 5, variante: 'amico', trionfo: 'coppe', scoperta: null, scelta: 'passo', quota: 2, mano: 'spade-3 denari-re coppe-3 coppe-fante bastoni-fante spade-4 bastoni-2 coppe-cavallo' },
  { n: 18, giocatori: 5, variante: 'monte', trionfo: 'denari', scoperta: 'denari-cavallo', scelta: 'passo', quota: 0, mano: 'bastoni-4 spade-asso bastoni-7 coppe-3 coppe-7 coppe-2 spade-re' },
  { n: 19, giocatori: 5, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-5', scelta: 'passo', quota: 1, mano: 'spade-3 spade-4 denari-6 spade-6 coppe-7 coppe-re bastoni-2' },
  { n: 20, giocatori: 4, variante: 'monte', trionfo: 'denari', scoperta: 'denari-fante', scelta: 'passo', quota: 2, mano: 'spade-4 coppe-5 spade-asso bastoni-re bastoni-7 coppe-7 bastoni-5 denari-6 spade-3' },
  { n: 21, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-4', scelta: 'passo', quota: 1, mano: 'spade-3 coppe-3 denari-2 spade-2 spade-cavallo coppe-5 denari-6 spade-asso spade-5' },
  { n: 22, giocatori: 4, variante: 'monte', trionfo: 'spade', scoperta: 'spade-cavallo', scelta: 'passo', quota: 1, mano: 'spade-6 denari-asso denari-fante coppe-5 denari-7 coppe-asso denari-2 bastoni-4 bastoni-re' },
  { n: 23, giocatori: 4, variante: 'monte', trionfo: 'spade', scoperta: 'spade-7', scelta: 'sola', quota: -9, mano: 'bastoni-7 spade-re spade-asso spade-6 coppe-7 coppe-cavallo bastoni-cavallo bastoni-re coppe-re' },
  { n: 24, giocatori: 4, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-fante', scelta: 'passo', quota: 1, mano: 'spade-fante denari-5 coppe-fante spade-cavallo bastoni-asso denari-3 denari-6 spade-3 spade-4' },
  { n: 25, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-fante', scelta: 'passo', quota: 1, mano: 'bastoni-asso spade-cavallo coppe-4 denari-asso bastoni-fante coppe-cavallo coppe-2 denari-4 spade-3' },
  { n: 26, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-7', scelta: 'normale', quota: -2, mano: 'denari-3 denari-5 denari-re coppe-cavallo bastoni-fante spade-re denari-7 spade-2 spade-asso coppe-asso bastoni-re bastoni-cavallo' },
  { n: 27, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-cavallo', scelta: 'normale', quota: 2, mano: 'spade-2 spade-cavallo bastoni-2 bastoni-fante spade-7 denari-2 coppe-7 coppe-fante spade-asso denari-3 coppe-re bastoni-3' },
  { n: 28, giocatori: 3, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-5', scelta: 'passo', quota: -1, mano: 'spade-fante coppe-3 bastoni-7 bastoni-fante denari-3 spade-4 denari-asso coppe-cavallo bastoni-5 spade-re bastoni-3 denari-5' },
  { n: 29, giocatori: 3, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-4', scelta: 'normale', quota: 2, mano: 'denari-re bastoni-asso spade-2 spade-re bastoni-5 spade-asso denari-6 bastoni-fante bastoni-6 spade-4 coppe-4 spade-fante' },
  { n: 30, giocatori: 3, variante: 'monte', trionfo: 'denari', scoperta: 'denari-asso', scelta: 'normale', quota: 2, mano: 'spade-2 coppe-fante spade-cavallo spade-3 denari-re denari-2 denari-6 spade-7 coppe-re denari-3 coppe-6 spade-4' },
  { n: 31, giocatori: 4, variante: 'monte', trionfo: 'spade', scoperta: 'spade-7', scelta: 'passo', quota: 1, mano: 'denari-fante spade-4 bastoni-5 coppe-5 coppe-2 coppe-4 coppe-6 coppe-re bastoni-re' },
  { n: 32, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-fante', scelta: 'passo', quota: 1, mano: 'spade-5 coppe-6 bastoni-fante denari-re denari-7 bastoni-cavallo denari-cavallo bastoni-5 denari-asso' },
  { n: 33, giocatori: 4, variante: 'monte', trionfo: 'denari', scoperta: 'denari-asso', scelta: 'passo', quota: 1, mano: 'spade-asso coppe-re denari-6 spade-re bastoni-4 coppe-cavallo spade-7 spade-cavallo denari-4' },
  { n: 34, giocatori: 4, variante: 'monte', trionfo: 'denari', scoperta: 'denari-re', scelta: 'passo', quota: 1, mano: 'coppe-4 coppe-5 denari-3 coppe-cavallo denari-cavallo bastoni-asso spade-3 spade-7 coppe-6' },
  { n: 35, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-7', scelta: 'normale', quota: 6, mano: 'denari-re coppe-fante denari-4 denari-asso spade-7 coppe-6 denari-cavallo bastoni-7 coppe-2' },
  { n: 36, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-2', scelta: 'passo', quota: 1, mano: 'denari-re coppe-re bastoni-7 bastoni-asso spade-asso denari-2 bastoni-re spade-fante denari-fante' },
  { n: 37, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-5', scelta: 'passo', quota: 1, mano: 'coppe-re spade-cavallo spade-fante coppe-6 coppe-3 denari-6 spade-re bastoni-5 denari-7' },
  { n: 38, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-asso', scelta: 'passo', quota: 1, mano: 'coppe-fante spade-4 spade-fante spade-3 coppe-4 bastoni-4 bastoni-cavallo bastoni-re denari-re' },
  { n: 39, giocatori: 4, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-7', scelta: 'normale', quota: -3, mano: 'coppe-2 coppe-5 coppe-asso denari-fante spade-cavallo denari-7 denari-cavallo coppe-7 bastoni-2' },
  { n: 40, giocatori: 5, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-7', scelta: 'normale', quota: 8, mano: 'coppe-re coppe-3 spade-asso bastoni-3 spade-4 denari-7 denari-5' },
  { n: 41, giocatori: 5, variante: 'monte', trionfo: 'denari', scoperta: 'denari-5', scelta: 'passo', quota: -2, mano: 'spade-4 bastoni-5 spade-2 bastoni-re denari-re coppe-2 coppe-fante' },
  { n: 42, giocatori: 5, variante: 'monte', trionfo: 'spade', scoperta: 'spade-re', scelta: 'normale', quota: 4, mano: 'spade-asso spade-7 bastoni-5 bastoni-3 denari-re spade-fante coppe-cavallo' },
  { n: 43, giocatori: 5, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-5', scelta: 'passo', quota: 1, mano: 'spade-3 denari-re denari-asso spade-fante denari-5 spade-re denari-3' },
  { n: 44, giocatori: 5, variante: 'monte', trionfo: 'spade', scoperta: 'spade-4', scelta: 'passo', quota: 1, mano: 'denari-7 denari-4 spade-7 coppe-6 denari-3 bastoni-asso coppe-re' },
  { n: 45, giocatori: 5, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-re', scelta: 'passo', quota: -2, mano: 'spade-fante denari-5 spade-cavallo spade-asso denari-fante denari-3 spade-2' },
  { n: 46, giocatori: 5, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-fante', scelta: 'passo', quota: -1, mano: 'bastoni-2 coppe-re coppe-asso coppe-fante bastoni-cavallo denari-fante spade-5' },
  { n: 47, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'passo', quota: -1, mano: 'spade-re spade-4 denari-fante coppe-cavallo spade-7 coppe-re bastoni-asso coppe-2' },
  { n: 48, giocatori: 5, variante: 'amico', trionfo: 'bastoni', scoperta: null, scelta: 'passo', quota: 1, mano: 'spade-cavallo bastoni-re bastoni-5 spade-2 denari-6 bastoni-6 denari-fante coppe-4' },
  { n: 49, giocatori: 5, variante: 'amico', trionfo: 'coppe', scoperta: null, scelta: 'passo', quota: 1, mano: 'spade-3 spade-2 spade-7 bastoni-2 denari-6 denari-7 coppe-re spade-cavallo' },
  { n: 50, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'colonna', quota: 16, mano: 'denari-7 denari-re coppe-asso bastoni-5 coppe-6 coppe-7 spade-4 denari-asso' },
  { n: 51, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'passo', quota: 1, mano: 'coppe-5 bastoni-4 coppe-asso bastoni-5 coppe-7 denari-7 bastoni-6 coppe-cavallo' },
  { n: 52, giocatori: 5, variante: 'amico', trionfo: 'bastoni', scoperta: null, scelta: 'normale', quota: -2, mano: 'bastoni-fante coppe-7 spade-4 denari-6 bastoni-7 coppe-re denari-cavallo denari-asso' },
  { n: 53, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'passo', quota: 1, mano: 'coppe-6 denari-re coppe-2 spade-7 bastoni-2 bastoni-6 spade-2 coppe-7' },
  { n: 54, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'passo', quota: 1, mano: 'coppe-cavallo coppe-2 spade-6 bastoni-re bastoni-asso spade-7 coppe-asso coppe-5' },
  { n: 55, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'passo', quota: 1, mano: 'denari-2 spade-7 denari-fante bastoni-fante denari-asso bastoni-re spade-6 bastoni-3' },
  { n: 56, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'normale', quota: 2, mano: 'coppe-6 coppe-5 spade-5 bastoni-5 bastoni-7 spade-cavallo coppe-3 spade-2' },
  { n: 57, giocatori: 5, variante: 'amico', trionfo: 'coppe', scoperta: null, scelta: 'passo', quota: -2, mano: 'spade-7 denari-6 coppe-6 denari-4 denari-5 bastoni-5 bastoni-cavallo denari-asso' },
  { n: 58, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'passo', quota: 1, mano: 'coppe-5 spade-2 spade-re spade-7 denari-cavallo spade-6 bastoni-fante coppe-7' },
  { n: 59, giocatori: 5, variante: 'amico', trionfo: 'denari', scoperta: null, scelta: 'normale', quota: -2, mano: 'coppe-6 denari-4 denari-7 coppe-re spade-3 coppe-2 spade-2 denari-asso' },
  { n: 60, giocatori: 5, variante: 'amico', trionfo: 'spade', scoperta: null, scelta: 'passo', quota: -1, mano: 'spade-3 spade-6 bastoni-6 denari-asso bastoni-5 bastoni-re coppe-re bastoni-cavallo' },
  { n: 61, giocatori: 5, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-6', scelta: 'normale', quota: 4, mano: 'spade-re denari-5 denari-7 coppe-re coppe-7 denari-fante coppe-3' },
  { n: 62, giocatori: 5, variante: 'monte', trionfo: 'denari', scoperta: 'denari-6', scelta: 'passo', quota: -2, mano: 'denari-re denari-cavallo denari-fante bastoni-asso coppe-2 coppe-3 spade-2' },
  { n: 63, giocatori: 5, variante: 'monte', trionfo: 'denari', scoperta: 'denari-5', scelta: 'normale', quota: 4, mano: 'spade-6 denari-4 bastoni-4 spade-5 denari-3 denari-7 coppe-re' },
  { n: 64, giocatori: 5, variante: 'monte', trionfo: 'bastoni', scoperta: 'bastoni-4', scelta: 'passo', quota: -2, mano: 'bastoni-fante bastoni-6 coppe-asso denari-re coppe-2 bastoni-5 spade-4' },
  { n: 65, giocatori: 4, variante: 'monte', trionfo: 'coppe', scoperta: 'coppe-re', scelta: 'normale', quota: 3, mano: 'spade-4 denari-asso spade-2 coppe-7 denari-cavallo coppe-3 coppe-asso coppe-4 denari-5' },
];
