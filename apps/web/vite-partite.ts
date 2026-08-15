import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Durante il dev le smazzate chiuse finiscono in partite/, un file per
 * sessione. In produzione questo filo non c'e': l'app non si ferma.
 */

export const VERSIONE_PARTITE = 1;

export interface FoglioDellePartite {
  versione: number;
  sessioneIniziata: string;
  smazzate: unknown[];
}

export function nomeDelFile(sessioneIniziata: string): string {
  const pulito = sessioneIniziata.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z');
  return `mediatore-${pulito}.json`;
}

export function accodaSmazzata(
  cartella: string,
  sessioneIniziata: string,
  smazzata: unknown,
): string {
  mkdirSync(cartella, { recursive: true });
  const file = join(cartella, nomeDelFile(sessioneIniziata));
  const foglio = esisteGia(file, sessioneIniziata);
  foglio.smazzate.push(smazzata);
  writeFileSync(file, `${JSON.stringify(foglio, null, 2)}\n`);
  return file;
}

function esisteGia(file: string, sessioneIniziata: string): FoglioDellePartite {
  if (!existsSync(file)) {
    return { versione: VERSIONE_PARTITE, sessioneIniziata, smazzate: [] };
  }
  try {
    const letto = JSON.parse(readFileSync(file, 'utf8')) as FoglioDellePartite;
    if (Array.isArray(letto.smazzate)) return letto;
  } catch {
    // File illeggibile: si riparte, non si butta via la smazzata nuova.
  }
  return { versione: VERSIONE_PARTITE, sessioneIniziata, smazzate: [] };
}

function corpo(req: IncomingMessage): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const pezzi: Buffer[] = [];
    req.on('data', (pezzo: Buffer) => {
      pezzi.push(pezzo);
    });
    req.on('end', () => risolvi(Buffer.concat(pezzi).toString('utf8')));
    req.on('error', rifiuta);
  });
}

export function pluginPartite(cartella: string): Plugin {
  return {
    name: 'mediatore-partite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url?.split('?')[0] !== '/__partite') {
          next();
          return;
        }
        void ricevi(req, res, cartella);
      });
    },
  };
}

async function ricevi(req: IncomingMessage, res: ServerResponse, cartella: string): Promise<void> {
  try {
    const letto = JSON.parse(await corpo(req)) as {
      sessioneIniziata?: unknown;
      smazzata?: unknown;
    };
    if (typeof letto.sessioneIniziata !== 'string' || letto.smazzata == null) {
      res.statusCode = 400;
      res.end('manca la smazzata');
      return;
    }
    accodaSmazzata(cartella, letto.sessioneIniziata, letto.smazzata);
    res.statusCode = 204;
    res.end();
  } catch (errore) {
    console.warn('partite: non riesco a scrivere', errore);
    res.statusCode = 500;
    res.end('non scritta');
  }
}
