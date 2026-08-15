import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Foglio, Smazzata } from './tipi.ts';

export interface Lettura {
  file: string;
  smazzate: Smazzata[];
}

export function leggiPartite(cartella: string): Lettura[] {
  let nomi: string[];
  try {
    nomi = readdirSync(cartella).filter((nome) => nome.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const fogli: Lettura[] = [];
  for (const nome of nomi) {
    const file = join(cartella, nome);
    try {
      const letto = JSON.parse(readFileSync(file, 'utf8')) as Foglio;
      if (!Array.isArray(letto.smazzate)) continue;
      fogli.push({ file, smazzate: letto.smazzate.filter(eUnaSmazzata) });
    } catch (errore) {
      console.warn(`specchio: salto ${nome}: ${messaggio(errore)}`);
    }
  }
  return fogli;
}

function eUnaSmazzata(valore: unknown): valore is Smazzata {
  if (valore == null || typeof valore !== 'object') return false;
  const s = valore as Smazzata;
  return Array.isArray(s.decisioni) && Array.isArray(s.maniIniziali);
}

function messaggio(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}
