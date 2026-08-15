import type { Alliance } from '@mediatore/engine';
import type { OpzioniPensatore } from './pensa.ts';
import type { TavoloId } from './smazzata.ts';

export interface Compito {
  tavolo: TavoloId;
  dealer: number;
  seed: number;
  rovescio: boolean;
}

export interface EsitoCompito {
  compito: Compito;
  quote: readonly number[];
  chiamante: number | null;
  alliance: Alliance;
  mossePensanti: number;
  tempoPensanteMs: number;
}

export type VersoWorker =
  | { tipo: 'lavora'; opzioni: OpzioniPensatore; compiti: Compito[] }
  | { tipo: 'chiudi' };

export type VersoPrincipale =
  | { tipo: 'fatto'; esiti: EsitoCompito[] }
  | { tipo: 'errore'; messaggio: string };
