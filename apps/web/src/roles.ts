import type { Card, HandState } from '@mediatore/engine';
import { createDeck, isAllyFor } from '@mediatore/engine';
import { NOMI_CHIAMATA, chiHaAperto, chiamataDi, quantoVale, sogliaPiuBassa } from './chiamate';
import { nomeGiocatore, puntiCorrenti } from './labels';

export type Ruolo = 'chiamante' | 'amico' | 'neutro';

export interface Schieramenti {
  caller: number | null;
  /** Valorizzato solo dopo la rivelazione: prima l'amico e' segreto. */
  friend: number | null;
  conIlChiamante: number[];
  contro: number[];
}

/**
 * Unico punto in cui si stabilisce chi sta con chi. Le squadre escono da
 * isAllyFor dell'engine: prima della rivelazione quel predicato non conosce
 * l'amico, quindi la UI non puo' farlo trapelare nemmeno per errore.
 */
export function schieramenti(state: HandState): Schieramenti {
  const alliance = state.alliance;
  if (alliance.kind === 'liscio') {
    return { caller: null, friend: null, conIlChiamante: [], contro: [] };
  }

  const caller = alliance.caller;
  const friend = alliance.kind === 'amico' ? alliance.friend : null;
  const isAlly = isAllyFor(alliance);
  const posti = state.hands.map((_, seat) => seat);

  return {
    caller,
    friend,
    conIlChiamante: posti.filter((seat) => isAlly(seat, caller)),
    contro: posti.filter((seat) => !isAlly(seat, caller)),
  };
}

const MAZZO = createDeck();

/**
 * La carta che il chiamante ha chiamato. Al tavolo la si annuncia ad alta
 * voce, quindi e' roba di tutti dal momento in cui viene scelta: segreto
 * resta solo chi la tiene in mano, e da qui non si puo' sapere, perche' si
 * legge l'alleanza e non le mani.
 */
export function cartaChiamata(state: HandState): Card | null {
  const alliance = state.alliance;
  if (alliance.kind !== 'amico') return null;
  return MAZZO.find((carta) => carta.id === alliance.calledCard) ?? null;
}

export function ruoloDi(seat: number, state: HandState): Ruolo {
  const { caller, friend, conIlChiamante } = schieramenti(state);
  if (caller === null) return 'neutro';
  if (seat === caller) return 'chiamante';
  // L'evidenza dell'amico scatta solo a rivelazione avvenuta.
  if (friend !== null && conIlChiamante.includes(seat)) return 'amico';
  return 'neutro';
}

export function etichettaRuolo(ruolo: Ruolo): string | null {
  if (ruolo === 'chiamante') return 'chiama';
  if (ruolo === 'amico') return 'amico';
  return null;
}

/**
 * Chi ha vinto tutte le prese chiuse finora, se ne resta almeno una da
 * giocare: il cappotto e' ancora li'. Col chiamante conta la sua parte, che
 * e' quella che l'engine guarda per assegnarlo; nel liscio corre per conto
 * suo chiunque non abbia ancora lasciato una presa agli altri. Si leggono i
 * vincitori delle prese, niente di piu'.
 */
export function cappottoInCorsa(state: HandState): number | null {
  const chiuse = state.completedTricks;
  if (chiuse.length === 0 || chiuse.length >= state.config.tricks) return null;

  const { caller, conIlChiamante } = schieramenti(state);
  if (caller === null) {
    const primo = chiuse[0]?.winner;
    if (primo === undefined) return null;
    return chiuse.every((presa) => presa.winner === primo) ? primo : null;
  }
  return chiuse.every((presa) => conIlChiamante.includes(presa.winner)) ? caller : null;
}

/**
 * L'avviso da appendere alla riga di stato. Nel liscio il nome e' tutto:
 * nessuno ha chiamato, quindi la riga non ha ancora detto di chi si parla, e
 * il cappotto li' ribalta la regola senza che nessuno lo veda arrivare.
 */
export function avvisoCappotto(state: HandState): string | null {
  const chi = cappottoInCorsa(state);
  if (chi === null) return null;
  if (state.alliance.kind !== 'liscio') return 'cappotto in corsa';
  return `${nomeGiocatore(chi)}: cappotto in corsa`;
}

/** Da qui in poi le carte per rimediare sono poche: la soglia diventa una notizia. */
const PRESE_FINALI = 3;

/**
 * Il chiamante e' sotto la soglia piu' bassa del suo tavolo e mancano poche
 * prese: sapere che si sta per pagare il supplemento cambia come si giocano
 * le ultime carte. Nell'amico i punti sono quelli della coppia, come li conta
 * l'engine.
 */
export function avvisoSoglia(state: HandState): string | null {
  const { caller, conIlChiamante } = schieramenti(state);
  if (caller === null) return null;

  const restano = state.config.tricks - state.completedTricks.length;
  if (restano <= 0 || restano > PRESE_FINALI) return null;

  const soglia = sogliaPiuBassa(state.config.players);
  if (soglia === null) return null;

  const punti = puntiCorrenti(state);
  const suoi = conIlChiamante.reduce((somma, seat) => somma + (punti[seat] ?? 0), 0);
  return suoi < soglia ? `attenzione: sotto i ${soglia} punti` : null;
}

/** Riga di stato: la configurazione della smazzata in parole semplici. */
export function riassuntoSmazzata(state: HandState): string {
  const { caller, friend, conIlChiamante, contro } = schieramenti(state);
  if (caller === null) return 'Liscio — perde chi fa piu punti';

  // Una dichiarazione speciale si mangia il resto della riga: la posta in
  // gioco conta piu' di quanti sono da una parte e dall'altra.
  const chiamata = chiamataDi(state);
  if (chiamata !== null && chiamata !== 'normale') {
    const nome = NOMI_CHIAMATA[chiamata].toUpperCase();
    // Nel monte il chiamante e' sempre solo, quindi non e' una notizia: nella
    // variante amico invece vuol dire che ha rinunciato al compagno.
    const senzaCompagno =
      state.config.variant === 'amico' ? ` — solo contro ${contro.length}` : '';
    if (chiamata === 'chiSeLaSente') {
      const apre = chiHaAperto(state);
      const apertura = apre === null ? '' : ` — apre ${nomeGiocatore(apre)}`;
      return `${nomeGiocatore(caller)} ha detto ${nome}${apertura}${senzaCompagno} — ${quantoVale(chiamata)}`;
    }
    return `${nomeGiocatore(caller)} gioca la ${nome}${senzaCompagno} — ${quantoVale(chiamata)}`;
  }

  if (state.alliance.kind === 'amico' && friend === null) {
    return `${nomeGiocatore(caller)} chiama — l'amico non si e ancora scoperto`;
  }
  if (friend !== null) {
    return `${nomeGiocatore(caller)} + ${nomeGiocatore(friend)} — ${conIlChiamante.length} contro ${contro.length}`;
  }
  return `${nomeGiocatore(caller)} chiama — solo contro ${contro.length}`;
}
