import type { Rng } from '@mediatore/engine';
import { createRng } from '@mediatore/engine';
import { caratteristiche, prodotto, sommaVettori, vettoreVuoto } from './caratteristiche.ts';
import { NOMI } from './caratteristiche.ts';
import type { DecisioneDaImitare } from './accordo.ts';
import { misuraAccordo, raccogliDecisioni } from './accordo.ts';
import type { Pesi } from './pesi.ts';
import { PESI_INIZIALI, copiaPesi } from './pesi.ts';

/**
 * Imita il bot di serie: dove i pesi sbagliano, si alza la mossa scelta
 * da lui e si abbassa quella che il pesato avrebbe giocato. Alla fine si
 * tiene la media dei pesi visti, che oscilla meno dell'ultimo passo.
 */

function mescola<T>(elementi: readonly T[], rng: Rng): T[] {
  const copia = [...elementi];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const a = copia[i];
    const b = copia[j];
    if (a === undefined || b === undefined) continue;
    copia[i] = b;
    copia[j] = a;
  }
  return copia;
}

function predice(vista: DecisioneDaImitare['vista'], pesi: Pesi): string {
  let migliore = '';
  let massimo = -Infinity;
  for (const carta of vista.legali) {
    const punti = prodotto(caratteristiche(vista, carta), pesi);
    if (punti > massimo) {
      massimo = punti;
      migliore = carta.id;
    }
  }
  return migliore;
}

export function imitaIlBot(decisioni: readonly DecisioneDaImitare[], giri: number, rng: Rng): Pesi {
  let pesi = copiaPesi(PESI_INIZIALI);
  const somma = vettoreVuoto();
  let passi = 0;

  for (let giro = 0; giro < giri; giro += 1) {
    const ordine = mescola(decisioni, rng);
    for (const decisione of ordine) {
      const prevista = predice(decisione.vista, pesi);
      if (prevista === decisione.scelta.id) {
        for (const nome of NOMI) somma[nome] += pesi[nome];
        passi += 1;
        continue;
      }

      const scelta = decisione.vista.legali.find((carta) => carta.id === decisione.scelta.id);
      const sbagliata = decisione.vista.legali.find((carta) => carta.id === prevista);
      if (scelta === undefined || sbagliata === undefined) continue;

      pesi = sommaVettori(
        pesi,
        sommaVettori(caratteristiche(decisione.vista, scelta), caratteristiche(decisione.vista, sbagliata), -1),
        0.15,
      );
      for (const nome of NOMI) somma[nome] += pesi[nome];
      passi += 1;
    }
  }

  if (passi === 0) return pesi;
  const medi = vettoreVuoto();
  for (const nome of NOMI) medi[nome] = somma[nome] / passi;
  return medi;
}

export function calibrarePesi(args?: { seed?: number; smazzate?: number; giri?: number }): {
  pesi: Pesi;
  accordo: ReturnType<typeof misuraAccordo>;
  decisioni: number;
} {
  const seed = args?.seed ?? 11;
  const smazzate = args?.smazzate ?? 180;
  const giri = args?.giri ?? 10;
  const decisioni = raccogliDecisioni({ seed, smazzate });
  const pesi = imitaIlBot(decisioni, giri, createRng(seed + 99));
  const accordo = misuraAccordo({ seed: 100_003, smazzate: 60, pesi });
  return { pesi, accordo, decisioni: decisioni.length };
}

if (process.argv[1]?.includes('calibra.ts')) {
  const inizio = Date.now();
  const { pesi, accordo, decisioni } = calibrarePesi();
  console.log(`decisioni imitate: ${decisioni} in ${Date.now() - inizio} ms`);
  console.log(
    `accordo su mazzi nuovi: ${accordo.percento.toFixed(1)}%` +
      ` (${accordo.uguali} su ${accordo.decisioni})`,
  );
  console.log(JSON.stringify(pesi, null, 2));
}
