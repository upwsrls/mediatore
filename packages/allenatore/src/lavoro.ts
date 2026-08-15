import type { Vettore } from './caratteristiche.ts';
import type { Pesi } from './pesi.ts';

export type Avversario = 'serie' | 'se-stesso';

/** Una smazzata da giocare: il seme e' suo, cosi' due worker non si calcano. */
export interface Compito {
  indice: number;
  seed: number;
  tavolo: number;
  dealer: number;
}

export type VersoWorker =
  | { tipo: 'lavora'; pesi: Pesi; avversario: Avversario; compiti: Compito[] }
  | { tipo: 'chiudi' };

export type VersoPrincipale =
  | { tipo: 'fatto'; gradienti: Vettore[] }
  | { tipo: 'errore'; messaggio: string };
