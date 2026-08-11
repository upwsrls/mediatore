import type { Parametri, TavoloDiChiamata } from '@mediatore/bot';
import { PARAMETRI_DI_SERIE } from '@mediatore/bot';

export type { Parametri, TavoloDiChiamata };

/**
 * Il punto di partenza della taratura: i numeri con cui il bot gioca oggi,
 * presi da packages/bot e non ricopiati qui, cosi' non possono divergere.
 */
export const PARAMETRI_ATTUALI: Parametri = copia(PARAMETRI_DI_SERIE);

/**
 * Una copia profonda: il taratore prova centinaia di combinazioni e nessuna
 * deve poter sporcare quella di partenza.
 */
export function copia(parametri: Parametri): Parametri {
  return {
    chiamata: {
      pesi: { ...parametri.chiamata.pesi },
      soglie: { ...parametri.chiamata.soglie },
    },
    scarto: { ...parametri.scarto },
    gioco: { ...parametri.gioco },
  };
}

/**
 * La soglia di chiamata di un tavolo, cambiata senza toccare l'originale.
 * Serve a chi vuole provare cosa succede a chiamare piu' o meno spesso: la
 * griglia non ci passa, perche' quelle soglie vengono da partite vere.
 */
export function conSoglia(
  parametri: Parametri,
  tavolo: TavoloDiChiamata,
  soglia: number,
): Parametri {
  const nuovi = copia(parametri);
  nuovi.chiamata.soglie = { ...nuovi.chiamata.soglie, [tavolo]: soglia };
  return nuovi;
}

export function conScarto(
  parametri: Parametri,
  cambio: Partial<Parametri['scarto']>,
): Parametri {
  const nuovi = copia(parametri);
  nuovi.scarto = { ...nuovi.scarto, ...cambio };
  return nuovi;
}

export function conGioco(parametri: Parametri, cambio: Partial<Parametri['gioco']>): Parametri {
  const nuovi = copia(parametri);
  nuovi.gioco = { ...nuovi.gioco, ...cambio };
  return nuovi;
}
