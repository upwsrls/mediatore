import { useCallback, useEffect, useState } from 'react';
import { accendi, audioAcceso, iscriviti, suona, svegliaAlPrimoTocco } from './motore';
import type { Suono } from './suoni';

export interface Audio {
  acceso: boolean;
  cambia: (acceso: boolean) => void;
  /** Le schermate chiedono il nome di un suono, non sanno altro. */
  suona: (nome: Suono, colpo?: number) => void;
}

/**
 * Il gancio per le schermate: dice se l'audio e' acceso, lo accende e lo
 * spegne, e fa suonare. Tenerlo in una schermata basta anche a far partire
 * l'impianto al primo tocco, che e' l'unica cosa che il browser pretende.
 */
export function useAudio(): Audio {
  const [acceso, setAcceso] = useState(audioAcceso);

  useEffect(() => iscriviti(() => setAcceso(audioAcceso())), []);
  useEffect(() => svegliaAlPrimoTocco(), []);

  const cambia = useCallback((valore: boolean) => accendi(valore), []);

  return { acceso, cambia, suona };
}
