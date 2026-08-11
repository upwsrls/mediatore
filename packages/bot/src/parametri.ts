import type { TavoloDiChiamata } from './tavolo.ts';

/**
 * I numeri che il bot ha dentro, raccolti in un posto solo.
 *
 * Servono a due cose. La prima e' leggerli: qui si vede a colpo d'occhio
 * cosa viene da partite vere e cosa e' un'ipotesi. La seconda e' cambiarli
 * da fuori senza toccare il codice, che e' quello che fa il taratore quando
 * cerca i valori migliori facendo giocare centinaia di migliaia di smazzate.
 *
 * Chi non passa niente gioca con PARAMETRI_DI_SERIE, che sono esattamente i
 * numeri di prima: la parametrizzazione non cambia una virgola del gioco.
 */

/**
 * Quanto conta ogni ingrediente nel voto della mano. L'ordine e' quello che
 * dicono i dati: le basi sicure comandano, la forza dei trionfi le corregge,
 * il resto sposta di poco. I punti in mano sono quasi zero apposta: fra mani
 * chiamate e mani passate non separano niente.
 */
export interface PesiDellaChiamata {
  basiSicure: number;
  forzaDeiTrionfi: number;
  lunghezzaDelTrionfo: number;
  paliVuoti: number;
  paliCorti: number;
  puntiInMano: number;
}

export interface ParametriChiamata {
  pesi: PesiDellaChiamata;
  /** Il voto da cui in su si chiama, un tavolo alla volta. */
  soglie: Readonly<Record<TavoloDiChiamata, number>>;
}

export interface ParametriScarto {
  /**
   * Da quanti trionfi in su diventa accettabile lasciare punti nel monte.
   * Con meno di cosi' il monte non torna piu' indietro e i punti sono persi.
   */
  trionfiPerPuntiNelMonte: number;
  /** Il tetto ai punti che si lasciano nel monte, comunque vada. */
  puntiMassimiNelMonte: number;
  /** Quanti punti si accetta di pagare pur di restare senza un seme. */
  prezzoDelVuoto: number;
}

export interface ParametriGioco {
  /**
   * Fin qui la presa e' abbastanza sicura da vincerla con una carta a punti
   * invece che con la minima che basta. A zero si carica solo quando non c'e'
   * proprio nessun rischio, cioe' quando nessuno dietro puo' superare.
   */
  rischioPerCaricare: number;
}

export interface Parametri {
  chiamata: ParametriChiamata;
  scarto: ParametriScarto;
  gioco: ParametriGioco;
}

/**
 * Pesi e soglie vengono da 65 decisioni di chiamata di un giocatore esperto,
 * prese su tutti e quattro i tavoli. Ogni soglia sta a meta' del vuoto fra la
 * mano piu' forte che ha passato e la piu' debole che ha chiamato, tavolo per
 * tavolo, senza contare le mani fuori schema, che restano scommesse sue: sono
 * numeri storti perche' sono misurati, e arrotondarli sposterebbe decisioni.
 *
 * Tutti e quattro i tavoli sono osservati, quindi qui non tara nessuno: se
 * questi numeri si muovono, si muovono perche' sono arrivate partite nuove.
 */
export const PARAMETRI_DI_SERIE: Parametri = {
  chiamata: {
    pesi: {
      basiSicure: 4,
      forzaDeiTrionfi: 0.5,
      lunghezzaDelTrionfo: 1,
      paliVuoti: 1,
      paliCorti: 0.5,
      puntiInMano: 0.1,
    },
    soglie: { 3: 20, 4: 22, 5: 15.6, amico: 17.5 },
  },
  scarto: {
    // Osservato: con 6 trionfi ha messo nel monte 8 punti, con 5 ne ha messi
    // 3 e solo per svuotare un seme, con meno non si e' mai trovato a farlo.
    trionfiPerPuntiNelMonte: 4,
    puntiMassimiNelMonte: 10,
    // Osservato: re e 2 di spade nel monte pur di poter tagliare da subito.
    prezzoDelVuoto: 10,
  },
  gioco: {
    rischioPerCaricare: 0,
  },
};
