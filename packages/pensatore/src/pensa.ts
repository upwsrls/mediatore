import type { VistaDelBot } from '@mediatore/bot';
import { alleatoDi, scegliCarta, sonoIlChiamante } from '@mediatore/bot';
import type { Card, Rng } from '@mediatore/engine';
import { createRng } from '@mediatore/engine';
import { unMondoPossibile } from './mondi.ts';
import { simulaSmazzata } from './simula.ts';

/**
 * Quanti mondi provare e quanto tempo concedere a una mossa. Il bot usa
 * quello che riesce dentro il tempo e sceglie con quello che ha.
 *
 * `mondiCompagni` e' per il difensore: i compagni, nella partita vera,
 * pensano anch'essi. Se la simulazione li fa giocare di serie, il
 * difensore ragiona su una smazzata che non esiste. Il chiamante e' solo
 * e non gli serve. Zero spegne il ramo e ferma la ricorsione.
 */
export interface OpzioniPensatore {
  mondi: number;
  tempoMs: number;
  /** Quanti mondi usano i compagni del difensore. Zero: giocano di serie. */
  mondiCompagni?: number;
}

export const MONDI_COMPAGNI_DI_SERIE = 0;
export const OPZIONI_DI_SERIE: OpzioniPensatore = {
  mondi: 50,
  tempoMs: 500,
  mondiCompagni: MONDI_COMPAGNI_DI_SERIE,
};

function eDifensore(vista: VistaDelBot): boolean {
  if (vista.alliance.kind === 'liscio') return false;
  if (sonoIlChiamante(vista)) return false;
  return !alleatoDi(vista, vista.alliance.caller);
}

/**
 * Un compagno del difensore che sta pensando: nella sfida e' un bot
 * pensante anche lui, non il bot di serie.
 */
function eCompagnoDaSimulare(originale: VistaDelBot, attuale: VistaDelBot): boolean {
  if (attuale.io === originale.io) return false;
  if (!eDifensore(originale)) return false;
  return alleatoDi(attuale, originale.io);
}

/**
 * Sotto questa differenza di quota media le due carte sono la stessa
 * mossa: decide il bot di serie, che resta l'arbitro nei casi incerti.
 */
const QUASI_UGUALE = 0.1;

function adessoMs(): number {
  return performance.now();
}

export interface ContoDellaMossa {
  scelta: Card;
  mondi: number;
  tempoMs: number;
}

/**
 * Per ogni carta legale prova le STESSE distribuzioni e fa la media.
 * Confrontare mosse diverse su mondi diversi misurerebbe la fortuna.
 *
 * Con una sola mossa legale non simula niente.
 */
export function scegliCartaPensando(
  vista: VistaDelBot,
  opzioni: OpzioniPensatore,
  rng: Rng,
): Card {
  return pensa(vista, opzioni, rng).scelta;
}

export function pensa(
  vista: VistaDelBot,
  opzioni: OpzioniPensatore,
  rng: Rng,
): ContoDellaMossa {
  const unica = vista.legali[0];
  if (unica !== undefined && vista.legali.length === 1) {
    return { scelta: unica, mondi: 0, tempoMs: 0 };
  }

  const diSerie = scegliCarta(vista, rng);
  const inizio = adessoMs();
  const somme = new Map<string, number>();
  for (const carta of vista.legali) somme.set(carta.id, 0);

  let fatti = 0;
  while (fatti < opzioni.mondi && adessoMs() - inizio < opzioni.tempoMs) {
    const mondo = unMondoPossibile(vista, rng);
    if (mondo === null) continue;
    const semeMondo = Math.floor(rng() * 0x1_0000_0000);
    const mondiCompagni = opzioni.mondiCompagni ?? MONDI_COMPAGNI_DI_SERIE;
    const scegliDopo =
      mondiCompagni > 0 && eDifensore(vista)
        ? (vistaDelTurno: VistaDelBot, rngTurno: Rng) => {
            if (!eCompagnoDaSimulare(vista, vistaDelTurno)) {
              return scegliCarta(vistaDelTurno, rngTurno);
            }
            return scegliCartaPensando(
              vistaDelTurno,
              { mondi: mondiCompagni, tempoMs: Math.max(20, Math.floor(opzioni.tempoMs / 10)), mondiCompagni: 0 },
              rngTurno,
            );
          }
        : scegliCarta;
    for (const carta of vista.legali) {
      const quota = simulaSmazzata(vista, mondo, carta, createRng(semeMondo), scegliDopo);
      somme.set(carta.id, (somme.get(carta.id) ?? 0) + quota);
    }
    fatti += 1;
  }

  const tempoMs = adessoMs() - inizio;
  if (fatti === 0) return { scelta: diSerie, mondi: 0, tempoMs };

  let migliore = diSerie;
  let mediaMigliore = Number.NEGATIVE_INFINITY;
  for (const carta of vista.legali) {
    const media = (somme.get(carta.id) ?? 0) / fatti;
    if (media > mediaMigliore + 1e-9) {
      mediaMigliore = media;
      migliore = carta;
    }
  }

  const mediaDiSerie = (somme.get(diSerie.id) ?? 0) / fatti;
  if (mediaMigliore - mediaDiSerie <= QUASI_UGUALE) {
    return { scelta: diSerie, mondi: fatti, tempoMs };
  }
  return { scelta: migliore, mondi: fatti, tempoMs };
}
