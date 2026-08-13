import type { HandState } from '@mediatore/engine';

/**
 * Si sta uccidendo: si e' privi del palo aperto e ci si butta il trionfo. Al
 * tavolo e' il momento piu' rumoroso della mano — si esclama e la carta si
 * getta — e infatti ha un suono suo, diverso da quello della carta appoggiata.
 *
 * Le condizioni sono quattro e servono tutte: la base non e' vuota, perche' chi
 * apre non uccide mai; il palo aperto NON e' il trionfo, perche' se la base
 * parte a trionfo ogni risposta a seme e' di trionfo e nessuno sta tagliando;
 * la carta giocata e' di trionfo; e chi la gioca e' privo del palo aperto,
 * altrimenti sta solo rifiutando di rispondere. L'ultima l'engine la impone
 * per conto suo, ma qui si controlla comunque: il suono lo decide questa
 * funzione, e deve saper dire di no da sola.
 */
export function uccide(state: HandState, cardId: string): boolean {
  const aperta = state.currentTrick.plays[0]?.card;
  if (aperta === undefined || aperta.suit === state.trump) return false;
  const mano = state.hands[state.turn] ?? [];
  const giocata = mano.find((carta) => carta.id === cardId);
  if (giocata?.suit !== state.trump) return false;
  return !mano.some((carta) => carta.suit === aperta.suit);
}
