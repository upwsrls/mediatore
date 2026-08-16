import type { HandScore, HandState, TipoChiamata } from '@mediatore/engine';
import { moltiplicatore, penalitaDaSoglia } from '@mediatore/engine';

/**
 * Come si chiamano le tre dichiarazioni sullo schermo. Quanto valgono non si
 * scrive mai qui: il numero arriva sempre da moltiplicatore() dell'engine.
 */
export const NOMI_CHIAMATA: Record<TipoChiamata, string> = {
  normale: 'chiamata normale',
  sola: 'sola',
  colonna: 'colonna',
  chiSeLaSente: 'chi se la sente',
};

/** Le tre che si dichiarano fuori turno, dalla meno alla piu' cara. */
export const SPECIALI: TipoChiamata[] = ['sola', 'colonna', 'chiSeLaSente'];

export type Speciale = (typeof SPECIALI)[number];

/**
 * La domanda prima di una speciale: il nome e quanto vale, in numeri.
 * Senza il costo non si capisce cosa si sta rischiando.
 */
export function domandaConfermaSpeciale(chiamata: Speciale): string {
  const volte = moltiplicatore(chiamata);
  const nome = NOMI_CHIAMATA[chiamata].toUpperCase();
  const cosa = chiamata === 'chiSeLaSente' ? nome : `la ${nome}`;
  return `sei sicuro di dichiarare ${cosa}? vale ${volte} volte`;
}

/**
 * Da una a sei partite: sei e' il massimo che si possa arrivare a giocare,
 * la chi se la sente con il cappotto.
 */
const PAROLE_POSTA: Record<number, string> = {
  1: 'vale semplice',
  2: 'vale doppio',
  3: 'vale triplo',
  4: 'vale quadruplo',
  5: 'vale quintuplo',
  6: 'vale sestuplo',
};

/**
 * Quante partite si giocano: la dichiarazione, la partita del cappotto e le
 * partite della soglia, sommate. Liscio e amico non dichiarano niente e
 * partono dalla posta della chiamata normale, che quanto valga lo dice
 * sempre l'engine.
 */
export function posta(chiamata: TipoChiamata | null, conCappotto = false, penalita = 0): number {
  return (
    moltiplicatore(chiamata ?? 'normale') +
    (conCappotto ? moltiplicatore('normale') : 0) +
    penalita
  );
}

/** Quanto si rischia, a parole: "3x" da solo non dice granche' a chi gioca. */
export function quantoVale(chiamata: TipoChiamata | null, conCappotto = false): string {
  const valore = posta(chiamata, conCappotto);
  return PAROLE_POSTA[valore] ?? `vale ${valore} volte`;
}

export function costo(chiamata: TipoChiamata | null, conCappotto = false, penalita = 0): string {
  return `${posta(chiamata, conCappotto, penalita)}x`;
}

/**
 * Da dove escono i soldi, addendo per addendo: "4x + 1x + 1x = 6x". Chi non
 * ha supplementi resta con il suo solo numero, senza somme da leggere.
 */
export function contoDellaPosta(
  chiamata: TipoChiamata | null,
  conCappotto: boolean,
  penalita: number,
): string {
  const addendi = [costo(chiamata)];
  // Il cappotto aggiunge una partita, cioe' quanto vale una chiamata normale.
  if (conCappotto) addendi.push(costo('normale'));
  if (penalita > 0) addendi.push(`${penalita}x`);
  if (addendi.length === 1) return addendi[0] as string;
  return `${addendi.join(' + ')} = ${costo(chiamata, conCappotto, penalita)}`;
}

/**
 * Quale soglia e' scattata. Non si riscrivono qui i numeri della regola: si
 * cerca il punto in cui l'engine smette di applicare quella penalita', che e'
 * la soglia stessa.
 */
export function sogliaDi(penalita: number, players: number): number | null {
  if (penalita <= 0) return null;
  for (let punti = 0; punti <= 120; punti += 1) {
    if (penalitaDaSoglia(punti, players) < penalita) return punti;
  }
  return null;
}

/** La soglia piu' bassa che riguarda un tavolo: sotto quella si paga il massimo. */
export function sogliaPiuBassa(players: number): number | null {
  return sogliaDi(penalitaDaSoglia(0, players), players);
}

function partiteInPiu(quante: number): string {
  return quante === 1 ? 'una partita in piu' : 'due partite in piu';
}

/**
 * Perche' si paga piu' del previsto, in parole. Una riga per supplemento, in
 * modo che il conto scritto sopra si possa seguire numero per numero.
 */
export function spiegazioniSupplementi(score: HandScore, state: HandState): string[] {
  const spiegazioni: string[] = [];

  if (score.cappotto === 'favore') spiegazioni.push('cappotto: tutte le basi');
  if (score.cappotto === 'contro') spiegazioni.push('cappotto: nemmeno una base');

  const soglia = sogliaDi(score.penalitaSoglia, state.config.players);
  if (soglia !== null) {
    // Nell'amico sotto soglia ci va la coppia: i punti dell'amico sono suoi.
    const diChi = state.config.variant === 'amico' ? ' della coppia' : '';
    spiegazioni.push(
      `sotto i ${soglia} punti${diChi}: ${partiteInPiu(score.penalitaSoglia)}`,
    );
  }

  return spiegazioni;
}

/** La dichiarazione in corso, se c'e': liscio e amico non ne hanno una. */
export function chiamataDi(state: HandState): TipoChiamata | null {
  return state.alliance.kind === 'monte' ? state.alliance.chiamata : null;
}

/**
 * Chi ha giocato la prima carta della smazzata. Non e' sempre il primo di
 * mano, e dopo la prima presa il leader corrente e' gia' un altro: l'unico
 * posto dove resta scritto e' la presa numero uno.
 */
export function chiHaAperto(state: HandState): number | null {
  const prima = state.completedTricks[0];
  if (prima !== undefined) return prima.cards[0]?.player ?? null;
  return state.currentTrick.leader;
}
