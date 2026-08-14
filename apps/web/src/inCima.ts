import { useLayoutEffect } from 'react';

/**
 * Scena nuova, pagina in cima. Chi legge il conteggio scorre in fondo per
 * arrivare alle quote, e quando il conto alla rovescia finisce la smazzata
 * dopo parte con la pagina ancora scorsa: si vede il tavolo a meta' e bisogna
 * risalire a mano. Vale per ogni cambio di scena, non solo per quello.
 *
 * La `scena` e' il nome di quello che si sta guardando: finche' non cambia la
 * pagina resta dove l'ha lasciata chi legge, che dentro la stessa schermata e'
 * l'unica cosa giusta da fare.
 */
export function useInCima(scena: string): void {
  useLayoutEffect(() => {
    // Prima che il browser disegni: la scena nuova non deve nemmeno lampeggiare
    // a meta' pagina. Il riepilogo scorre in un suo contenitore: anche quello
    // torna in cima, se e' ancora montato.
    window.scrollTo(0, 0);
    for (const elenco of document.querySelectorAll('.schermata-conteggio')) {
      elenco.scrollTop = 0;
    }
  }, [scena]);
}
