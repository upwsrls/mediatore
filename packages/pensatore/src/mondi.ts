import type { VistaDelBot } from '@mediatore/bot';
import { carteNonAncoraViste, eSemeFinito } from '@mediatore/bot';
import type { Card, Rng, Suit } from '@mediatore/engine';
import { SUITS } from '@mediatore/engine';

/**
 * Una distribuzione immaginata delle carte nascoste: le mani di tutti e il
 * monte, compatibile con quello che il bot ha visto.
 */
export interface Mondo {
  mani: readonly (readonly Card[])[];
  monte: readonly Card[];
}

interface Contenitore {
  seat: number | 'monte';
  quanti: number;
  vietati: ReadonlySet<Suit>;
  carte: Card[];
}

const TENTATIVI_PER_MONDO = 80;

function scegliFra<T>(elementi: readonly T[], rng: Rng): T {
  const primo = elementi[0];
  if (primo === undefined) throw new Error('nessun elemento fra cui scegliere');
  const indice = Math.min(elementi.length - 1, Math.floor(rng() * elementi.length));
  return elementi[indice] ?? primo;
}

function semiVietati(vista: VistaDelBot, seat: number): Set<Suit> {
  const vietati = new Set<Suit>();
  for (const seme of SUITS) {
    if (eSemeFinito(vista, seat, seme)) vietati.add(seme);
  }
  return vietati;
}

/**
 * I posti che devono ricevere le carte ancora nascoste: le mani altrui e,
 * se il monte non si vede, il monte stesso.
 */
function contenitoriVuoti(vista: VistaDelBot): Contenitore[] {
  const posti: Contenitore[] = [];
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (seat === vista.io) continue;
    posti.push({
      seat,
      quanti: vista.carteInMano[seat] ?? 0,
      vietati: semiVietati(vista, seat),
      carte: [],
    });
  }
  if (vista.monteVisibile.length === 0 && vista.monteCoperto > 0) {
    posti.push({
      seat: 'monte',
      quanti: vista.monteCoperto,
      vietati: new Set(),
      carte: [],
    });
  }
  return posti;
}

function puoTenere(contenitore: Contenitore, carta: Card): boolean {
  if (contenitore.carte.length >= contenitore.quanti) return false;
  return !contenitore.vietati.has(carta.suit);
}

/**
 * La carta chiamata, se e' ancora nascosta, deve stare in una mano: l'amico
 * e' un giocatore, non il monte. Se l'amico si e' gia' scoperto, sta li'.
 */
function piazzaCartaChiamata(
  vista: VistaDelBot,
  nascoste: Card[],
  contenitori: Contenitore[],
  rng: Rng,
): Card[] | null {
  if (vista.alliance.kind !== 'amico') return nascoste;
  const id = vista.alliance.calledCard;
  const dove = nascoste.findIndex((carta) => carta.id === id);
  if (dove < 0) return nascoste;
  const carta = nascoste[dove];
  if (carta === undefined) return nascoste;

  const amico = vista.alliance.friend;
  const candidati = contenitori.filter((contenitore) => {
    if (contenitore.seat === 'monte') return false;
    if (!puoTenere(contenitore, carta)) return false;
    if (amico !== null && contenitore.seat !== amico) return false;
    return true;
  });
  if (candidati.length === 0) return null;
  scegliFra(candidati, rng).carte.push(carta);
  return nascoste.filter((_, i) => i !== dove);
}

function assegna(nascoste: readonly Card[], contenitori: Contenitore[], rng: Rng): boolean {
  const perVincolo = [...nascoste].sort((a, b) => {
    const diA = contenitori.filter((c) => puoTenere(c, a)).length;
    const diB = contenitori.filter((c) => puoTenere(c, b)).length;
    return diA - diB;
  });

  for (const carta of perVincolo) {
    const candidati = contenitori.filter((contenitore) => puoTenere(contenitore, carta));
    if (candidati.length === 0) return false;
    scegliFra(candidati, rng).carte.push(carta);
  }
  return contenitori.every((contenitore) => contenitore.carte.length === contenitore.quanti);
}

function mondoDa(vista: VistaDelBot, contenitori: readonly Contenitore[]): Mondo {
  const mani: Card[][] = Array.from({ length: vista.config.players }, () => []);
  mani[vista.io] = [...vista.mano];
  let monte = [...vista.monteVisibile];
  for (const contenitore of contenitori) {
    if (contenitore.seat === 'monte') {
      monte = [...contenitore.carte];
      continue;
    }
    mani[contenitore.seat] = [...contenitore.carte];
  }
  return { mani, monte };
}

/**
 * Una sola distribuzione compatibile, o null se nei tentativi non se ne e'
 * trovata una. Non si blocca: chi chiama passa alla successiva.
 */
export function unMondoPossibile(vista: VistaDelBot, rng: Rng): Mondo | null {
  const nascoste = carteNonAncoraViste(vista);
  const attesi = contenitoriVuoti(vista).reduce((somma, c) => somma + c.quanti, 0);
  if (nascoste.length !== attesi) return null;

  for (let tentativo = 0; tentativo < TENTATIVI_PER_MONDO; tentativo += 1) {
    const contenitori = contenitoriVuoti(vista);
    const restanti = piazzaCartaChiamata(vista, [...nascoste], contenitori, rng);
    if (restanti === null) continue;
    if (!assegna(restanti, contenitori, rng)) continue;
    return mondoDa(vista, contenitori);
  }
  return null;
}

/**
 * Genera distribuzioni delle carte non ancora viste fra gli altri,
 * compatibili con quello che si e' visto: conti delle mani, pali a cui
 * qualcuno non ha risposto, monte coperto, carta dell'amico.
 */
export function mondiPossibili(vista: VistaDelBot, quanti: number, rng: Rng): Mondo[] {
  const mondi: Mondo[] = [];
  let falliti = 0;
  const tettoFalliti = Math.max(1, quanti) * 20;
  while (mondi.length < quanti && falliti < tettoFalliti) {
    const mondo = unMondoPossibile(vista, rng);
    if (mondo === null) {
      falliti += 1;
      continue;
    }
    mondi.push(mondo);
  }
  return mondi;
}
