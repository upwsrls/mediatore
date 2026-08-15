import type { Card, Rng } from '@mediatore/engine';
import type { VistaDelBot } from '@mediatore/bot';
import { scegliCarta } from '@mediatore/bot';
import { caratteristiche, prodotto } from './caratteristiche.ts';
import type { Pesi } from './pesi.ts';

/**
 * Fra mosse a pari merito sceglie l'rng, non l'ordine in mano: lo stesso
 * patto del bot di serie.
 */
function scegliFra(carte: readonly Card[], rng: Rng): Card {
  const prima = carte[0];
  if (prima === undefined) throw new Error('nessuna carta fra cui scegliere');
  const indice = Math.min(carte.length - 1, Math.floor(rng() * carte.length));
  return carte[indice] ?? prima;
}

/**
 * Il punteggio di una mossa legale: somma pesata delle caratteristiche
 * ricavate dalla sola vista.
 */
export function punteggioDellaMossa(vista: VistaDelBot, carta: Card, pesi: Pesi): number {
  return prodotto(caratteristiche(vista, carta), pesi);
}

/**
 * La carta da giocare secondo i pesi. Vede solo la vista: le mani degli
 * altri non gli arrivano, come non arrivano al bot di serie.
 */
export function scegliCartaPesata(vista: VistaDelBot, pesi: Pesi, rng: Rng): Card {
  const legali = vista.legali;
  const unica = legali[0];
  if (unica === undefined) {
    throw new Error(`il posto ${vista.io} non ha mosse legali: non c'e' niente da scegliere`);
  }
  if (legali.length === 1) return unica;

  let massimo = -Infinity;
  const migliori: Card[] = [];
  for (const carta of legali) {
    const punti = punteggioDellaMossa(vista, carta, pesi);
    if (punti > massimo + 1e-9) {
      massimo = punti;
      migliori.length = 0;
      migliori.push(carta);
    } else if (punti >= massimo - 1e-9) {
      migliori.push(carta);
    }
  }

  const scelta = scegliFra(migliori, rng);
  if (!legali.some((carta) => carta.id === scelta.id)) {
    const elenco = legali.map((carta) => carta.id).join(', ');
    throw new Error(`il bot pesato ha scelto ${scelta.id}, fuori dalle mosse legali [${elenco}]`);
  }
  return scelta;
}

/** Il bot di serie, stesso contratto: vista e rng, nient'altro. */
export function scegliCartaDiSerie(vista: VistaDelBot, rng: Rng): Card {
  return scegliCarta(vista, rng);
}
