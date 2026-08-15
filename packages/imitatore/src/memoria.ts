import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Correzione } from './tipi.ts';

export const FILE_DI_SERIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'imparato.json');

export interface Memoria {
  versione: 1;
  smazzate: number;
  decisioni: number;
  correzioni: Correzione[];
}

export function memoriaDa(args: {
  smazzate: number;
  decisioni: number;
  correzioni: readonly Correzione[];
}): Memoria {
  return {
    versione: 1,
    smazzate: args.smazzate,
    decisioni: args.decisioni,
    correzioni: [...args.correzioni],
  };
}

export function salvaMemoria(file: string, memoria: Memoria): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(memoria, null, 2)}\n`);
}

export function leggiMemoria(file: string): Memoria | null {
  try {
    const letto = JSON.parse(readFileSync(file, 'utf8')) as Memoria;
    if (letto.versione !== 1 || !Array.isArray(letto.correzioni)) return null;
    return letto;
  } catch {
    return null;
  }
}
