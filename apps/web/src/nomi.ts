import type { Rng } from '@mediatore/engine';
import { shuffle } from '@mediatore/engine';

/**
 * I nomi che si sentono attorno a un tavolo di carte: diminutivi, soprannomi,
 * nomi accorciati come li usa chi si conosce da sempre. Nessuno di questi
 * dice niente su chi lo porta: al bar non si sa mai chi hai davanti finche'
 * non lo vedi giocare.
 */
export const NOMI_DA_BAR: readonly string[] = [
  'Ciccio',
  'Peppino',
  'Mimmo',
  'Nino',
  'Totonno',
  'Uccio',
  'Pinuccio',
  'Cosimino',
  "Zi' Vito",
  'Ninuccio',
  'Lillino',
  'Ruggerino',
  'Rocco u curt',
  'Savino',
  'Nicolino',
  'Gigi a pipa',
  'Michelino',
  'Franchino',
  'Donato u ross',
  'Titta',
];

/**
 * Chi siede a questo tavolo. Nomi tutti diversi e pescati con l'rng della
 * smazzata: dallo stesso seed esce sempre la stessa compagnia.
 */
export function pescaNomi(quanti: number, caso: Rng): string[] {
  return shuffle(NOMI_DA_BAR, caso).slice(0, quanti);
}
