import type { Card } from '@mediatore/engine';
import { createDeck, createRng, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { decisioneDiChiamata, pausaCarta, pausaChiamata, pausaScarto } from './automa';
import { NOMI_DA_BAR, pescaNomi } from './nomi';

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
});
