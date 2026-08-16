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

export interface ContoCarta {
  carta: Card;
  media: number;
  /** Mondi in cui il punteggio della simulazione e' stato positivo. */
  vinte: number;
  /** Mondi in cui questa carta ha battuto quella di serie, stesso mondo. */
  meglioDellaSerie: number;
}

export interface MisuraDelleCarte {
  diSerie: Card;
  scelta: Card;
  mondi: number;
  tempoMs: number;
  mondiMancati: number;
  perCarta: ContoCarta[];
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

function scegliDopoLaMossa(
  vista: VistaDelBot,
  opzioni: OpzioniPensatore,
): (vistaDelTurno: VistaDelBot, rngTurno: Rng) => Card {
  const mondiCompagni = opzioni.mondiCompagni ?? MONDI_COMPAGNI_DI_SERIE;
  if (mondiCompagni <= 0 || !eDifensore(vista)) return scegliCarta;
  return (vistaDelTurno, rngTurno) => {
    if (!eCompagnoDaSimulare(vista, vistaDelTurno)) {
      return scegliCarta(vistaDelTurno, rngTurno);
    }
    return scegliCartaPensando(
      vistaDelTurno,
      { mondi: mondiCompagni, tempoMs: Math.max(20, Math.floor(opzioni.tempoMs / 10)), mondiCompagni: 0 },
      rngTurno,
    );
  };
}

/**
 * Stessa misura di `pensa`, ma tiene il conto per ogni carta: media,
 * quante volte la parte ha chiuso in positivo, e quante volte ha
 * battuto la scelta di serie sullo stesso mondo.
 */
export function misuraCarte(
  vista: VistaDelBot,
  opzioni: OpzioniPensatore,
  rng: Rng,
): MisuraDelleCarte {
  const unica = vista.legali[0];
  const diSerie = unica !== undefined && vista.legali.length === 1 ? unica : scegliCarta(vista, rng);
  if (unica !== undefined && vista.legali.length === 1) {
    return {
      diSerie,
      scelta: unica,
      mondi: 0,
      tempoMs: 0,
      mondiMancati: 0,
      perCarta: [{ carta: unica, media: 0, vinte: 0, meglioDellaSerie: 0 }],
    };
  }

  const inizio = adessoMs();
  const somme = new Map<string, number>();
  const vinte = new Map<string, number>();
  const meglio = new Map<string, number>();
  for (const carta of vista.legali) {
    somme.set(carta.id, 0);
    vinte.set(carta.id, 0);
    meglio.set(carta.id, 0);
  }

  const scegliDopo = scegliDopoLaMossa(vista, opzioni);
  let fatti = 0;
  let mancati = 0;
  while (fatti < opzioni.mondi && adessoMs() - inizio < opzioni.tempoMs) {
    const mondo = unMondoPossibile(vista, rng);
    if (mondo === null) {
      mancati += 1;
      if (mancati > opzioni.mondi * 20) break;
      continue;
    }
    const semeMondo = Math.floor(rng() * 0x1_0000_0000);
    const punteggi = new Map<string, number>();
    for (const carta of vista.legali) {
      const quota = simulaSmazzata(vista, mondo, carta, createRng(semeMondo), scegliDopo);
      punteggi.set(carta.id, quota);
      somme.set(carta.id, (somme.get(carta.id) ?? 0) + quota);
      if (quota > 0) vinte.set(carta.id, (vinte.get(carta.id) ?? 0) + 1);
    }
    const dellaSerie = punteggi.get(diSerie.id) ?? 0;
    for (const carta of vista.legali) {
      if ((punteggi.get(carta.id) ?? 0) > dellaSerie + 1e-9) {
        meglio.set(carta.id, (meglio.get(carta.id) ?? 0) + 1);
      }
    }
    fatti += 1;
  }

  const tempoMs = adessoMs() - inizio;
  const perCarta: ContoCarta[] = vista.legali.map((carta) => ({
    carta,
    media: fatti === 0 ? 0 : (somme.get(carta.id) ?? 0) / fatti,
    vinte: vinte.get(carta.id) ?? 0,
    meglioDellaSerie: meglio.get(carta.id) ?? 0,
  }));
  perCarta.sort((a, b) => b.media - a.media);

  if (fatti === 0) {
    return { diSerie, scelta: diSerie, mondi: 0, tempoMs, mondiMancati: mancati, perCarta };
  }

  const migliore = perCarta[0]?.carta ?? diSerie;
  const mediaMigliore = perCarta[0]?.media ?? Number.NEGATIVE_INFINITY;
  const mediaDiSerie = (somme.get(diSerie.id) ?? 0) / fatti;
  const scelta = mediaMigliore - mediaDiSerie <= QUASI_UGUALE ? diSerie : migliore;
  return { diSerie, scelta, mondi: fatti, tempoMs, mondiMancati: mancati, perCarta };
}

export function pensa(
  vista: VistaDelBot,
  opzioni: OpzioniPensatore,
  rng: Rng,
): ContoDellaMossa {
  const misura = misuraCarte(vista, opzioni, rng);
  return { scelta: misura.scelta, mondi: misura.mondi, tempoMs: misura.tempoMs };
}
