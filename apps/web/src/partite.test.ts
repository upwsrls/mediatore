import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { accodaSmazzata, nomeDelFile } from '../vite-partite.ts';

describe('il salvataggio nel progetto', () => {
  it('il nome del file porta la data della sessione', () => {
    expect(nomeDelFile('2026-08-15T19:31:00.123Z')).toBe('mediatore-2026-08-15T19-31-00Z.json');
  });

  it('accoda le smazzate nello stesso foglio di sessione', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'partite-'));
    try {
      const sessione = '2026-08-15T19:31:00.000Z';
      accodaSmazzata(cartella, sessione, { seed: 1 });
      const file = accodaSmazzata(cartella, sessione, { seed: 2 });
      const letto = JSON.parse(readFileSync(file, 'utf8')) as {
        sessioneIniziata: string;
        smazzate: { seed: number }[];
      };
      expect(letto.sessioneIniziata).toBe(sessione);
      expect(letto.smazzate.map((s) => s.seed)).toEqual([1, 2]);
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  });

  it('la smazzata chiusa parte verso il progetto, senza sostituire il quaderno', () => {
    const registro = readFileSync(fileURLToPath(new URL('./registro.ts', import.meta.url)), 'utf8');
    expect(registro).toMatch(/\/__partite/);
    expect(registro).toMatch(/mandaAlProgetto/);
    expect(registro).toMatch(/localStorage/);
  });
});
