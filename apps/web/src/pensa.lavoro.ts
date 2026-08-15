import type { VistaDelBot } from '@mediatore/bot';

/**
 * Dove il guadagno del pensatore si ferma, e il tetto di tempo di una mossa.
 * La pausa a tavola e' 700-1800 ms: il calcolo deve starci dentro, non
 * aggiungersi dopo.
 */
export const MONDI_DEL_TAVOLO = 100;
export const TEMPO_DEL_TAVOLO_MS = 500;

export interface DomandaAlPensatore {
  id: number;
  vista: VistaDelBot;
  seed: number;
}

export interface RispostaDelPensatore {
  id: number;
  cartaId: string;
}
