import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Card } from '@mediatore/engine';
import { createDeck, createRng, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  decisioneDiChiamata,
  dopoPausaEPensiero,
  pausaCarta,
  pausaChiamata,
  pausaScarto,
} from './automa';
import { NOMI_DA_BAR, pescaNomi } from './nomi';
import { MONDI_DEL_TAVOLO, TEMPO_DEL_TAVOLO_MS } from './pensa.lavoro';

const MAZZO = createDeck();

function carte(...ids: string[]): Card[] {
  return ids.map((id) => {
    const carta = MAZZO.find((c) => c.id === id);
    if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
    return carta;
  });
}

/** Un rng finto che restituisce i valori dati, poi si ripete sull'ultimo. */
function rngFinto(...valori: number[]): () => number {
  let indice = 0;
  return () => valori[Math.min(indice++, valori.length - 1)] ?? 0;
}

describe('i nomi del tavolo', () => {
  it('non ripete mai lo stesso nome', () => {
    const nomi = pescaNomi(5, createRng(7));
    expect(nomi).toHaveLength(5);
    expect(new Set(nomi).size).toBe(5);
    expect(nomi.every((nome) => NOMI_DA_BAR.includes(nome))).toBe(true);
  });

  it('dallo stesso seed esce la stessa compagnia', () => {
    expect(pescaNomi(4, createRng(1234))).toEqual(pescaNomi(4, createRng(1234)));
    expect(pescaNomi(4, createRng(1234))).not.toEqual(pescaNomi(4, createRng(9999)));
  });
});

describe('la chiamata del bot', () => {
  const aTre = tableConfig(3, 'monte');

  // La mano vera della smazzata 2 del registro: quattro trionfi col 7, e il
  // giocatore chiamo'. Il criterio sta in packages/bot, qui si controlla solo
  // che l'app lo interroghi e traduca la risposta in una mossa dell'engine.
  const buona = carte(
    'coppe-7', 'coppe-3', 'coppe-5', 'coppe-6',
    'spade-4', 'spade-fante', 'spade-cavallo',
    'denari-2', 'denari-cavallo', 'denari-asso',
    'bastoni-cavallo', 'bastoni-4',
  );

  it('chiama normale quando la mano regge', () => {
    expect(decisioneDiChiamata(buona, 'coppe', null, aTre)).toEqual({
      tipo: 'chiama',
      chiamata: 'normale',
    });
  });

  it('passa quando i trionfi non bastano', () => {
    // Stessa mano, ma il trionfo e' un altro seme: tre carte e nessun comando.
    expect(decisioneDiChiamata(buona, 'spade', null, aTre)).toEqual({ tipo: 'passo' });
  });

  it('guarda la scoperta del monte, che chi chiama se la prende', () => {
    // Stessa mano scarsa di prima, ma sul tavolo c'e' il 7 di spade: quella
    // carta e' di chi chiama, ed e' abbastanza per cambiare idea.
    const [sette] = carte('spade-7');
    if (sette === undefined) throw new Error('manca il 7 di spade');
    expect(decisioneDiChiamata(buona, 'spade', null, aTre)).toEqual({ tipo: 'passo' });
    expect(decisioneDiChiamata(buona, 'spade', sette, aTre)).toEqual({
      tipo: 'chiama',
      chiamata: 'normale',
    });
  });

  it('non dichiara mai una speciale', () => {
    const mosse = [
      decisioneDiChiamata(buona, 'coppe', null, aTre),
      decisioneDiChiamata(buona, 'spade', null, aTre),
    ];
    for (const mossa of mosse) {
      if (mossa.tipo === 'chiama') expect(mossa.chiamata).toBe('normale');
    }
  });
});

describe('i tempi del bot', () => {
  it('sta dentro le sue misure', () => {
    for (const valore of [0, 0.5, 0.999]) {
      expect(pausaCarta(4, rngFinto(valore))).toBeGreaterThanOrEqual(700);
      expect(pausaCarta(4, rngFinto(valore))).toBeLessThanOrEqual(1800);
      expect(pausaChiamata(12, rngFinto(valore))).toBeGreaterThanOrEqual(900);
      expect(pausaChiamata(12, rngFinto(valore))).toBeLessThanOrEqual(2200);
      expect(pausaScarto(4, rngFinto(valore))).toBeGreaterThanOrEqual(1500);
      expect(pausaScarto(4, rngFinto(valore))).toBeLessThanOrEqual(3000);
    }
  });

  it('ci pensa di piu quando ha piu strade', () => {
    // Stesso tiro di dado: con una carta sola non c'e' niente da decidere.
    const unaSola = pausaCarta(1, rngFinto(0.5));
    const manoPiena = pausaCarta(8, rngFinto(0.5));
    expect(manoPiena).toBeGreaterThan(unaSola);
  });

  it('la pausa della carta copre il tetto del pensatore', () => {
    // La pausa piu' corta e' 700 ms, il pensiero al massimo 500: il calcolo
    // sta dentro l'attesa e non allunga il tavolo.
    expect(TEMPO_DEL_TAVOLO_MS).toBe(500);
    expect(MONDI_DEL_TAVOLO).toBe(100);
    expect(pausaCarta(1, rngFinto(0))).toBeGreaterThanOrEqual(TEMPO_DEL_TAVOLO_MS);
  });
});

describe('il pensiero sta dentro la pausa', () => {
  it('aspetta il resto della pausa quando il pensiero finisce prima', async () => {
    let ora = 0;
    let ritardo = -1;
    const { pronta } = dopoPausaEPensiero(
      Promise.resolve('coppe-7'),
      1000,
      () => ora,
      (ms, fai) => {
        ritardo = ms;
        fai();
        return () => undefined;
      },
    );
    ora = 40;
    await expect(pronta).resolves.toBe('coppe-7');
    expect(ritardo).toBe(960);
  });

  it('gioca subito se il pensiero dura piu della pausa', async () => {
    let ora = 0;
    let ritardo = -1;
    const { pronta } = dopoPausaEPensiero(
      Promise.resolve('spade-asso'),
      700,
      () => ora,
      (ms, fai) => {
        ritardo = ms;
        fai();
        return () => undefined;
      },
    );
    ora = 800;
    await expect(pronta).resolves.toBe('spade-asso');
    expect(ritardo).toBe(0);
  });
});

describe('il pensatore gira fuori dalla pagina', () => {
  function legge(file: string): string {
    return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
  }

  it('la scelta pensante sta nel worker, non nel filo della pagina', () => {
    expect(legge('./pensa.worker.ts')).toMatch(/scegliCartaPensando/);
    expect(legge('./pensa.operaio.ts')).toMatch(/new Worker/);
    expect(legge('./useHand.ts')).toMatch(/chiediCartaPensando/);
    expect(legge('./useHand.ts')).toMatch(/dopoPausaEPensiero/);
    expect(legge('./useHand.ts')).not.toMatch(/scegliCartaPensando/);
  });

  it('chiamata e scarto restano del bot di serie', () => {
    expect(legge('./useHand.ts')).toMatch(/decisioneDiChiamata/);
    expect(legge('./useHand.ts')).toMatch(/scegliScarti/);
    expect(legge('./pensa.worker.ts')).not.toMatch(/decidiChiamata|scegliScarti/);
  });
});
