import type { Card } from '@mediatore/engine';
import { createDeck, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import type { ChiamataVera } from './chiamateVere.ts';
import { CHIAMATE_VERE } from './chiamateVere.ts';
import { scegliScarti } from './scarta.ts';
import { decidiChiamata, valutaChiamata } from './valutaMano.ts';

/**
 * Novantotto smazzate giocate da un barlettano esperto e registrate una
 * decisione alla volta. Sessantacinque volte gli e' toccato scegliere se
 * chiamare o passare: da li' esce il criterio del bot, e qui si controlla
 * quanto ci resta vicino.
 *
 * L'accordo non deve fare cento. Sei mani sono scommesse — una chi se la
 * sente senza un trionfo in mano, un paio di passi su mani che tornavano —
 * e un modello che le spiegasse tutte avrebbe imparato il rumore invece del
 * criterio.
 */

const MAZZO = createDeck();

function mano(ids: readonly string[]): Card[] {
  return ids.map((id) => {
    const carta = MAZZO.find((c) => c.id === id);
    if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
    return carta;
  });
}

const carteDi = (caso: ChiamataVera): Card[] => mano(caso.mano.split(' '));
const scopertaDi = (caso: ChiamataVera): Card | null =>
  caso.scoperta === null ? null : (mano([caso.scoperta])[0] as Card);
const configDi = (caso: ChiamataVera) => tableConfig(caso.giocatori, caso.variante);
const haChiamato = (caso: ChiamataVera): boolean => caso.scelta !== 'passo';

const decisione = (caso: ChiamataVera): boolean =>
  decidiChiamata(
    { mano: carteDi(caso), trump: caso.trionfo, scoperta: scopertaDi(caso) },
    configDi(caso),
  ) === 'chiama';

const dAccordo = (caso: ChiamataVera): boolean => decisione(caso) === haChiamato(caso);

const TAVOLI = ['3', '4', '5', '5 amico'] as const;
const tavoloDi = (caso: ChiamataVera): string =>
  `${caso.giocatori}${caso.variante === 'amico' ? ' amico' : ''}`;

const RESOCONTO = TAVOLI.map((etichetta) => {
  const suoi = CHIAMATE_VERE.filter((caso) => tavoloDi(caso) === etichetta);
  const giusti = suoi.filter(dAccordo).length;
  return {
    etichetta,
    totale: suoi.length,
    giusti,
    percento: Math.round((giusti / suoi.length) * 100),
  };
});

const SBAGLIATE = CHIAMATE_VERE.filter((caso) => !dAccordo(caso));

/**
 * Come si legge una decisione mancata: cosa ha fatto lui, cosa avrebbe fatto
 * il bot, e come e' finita. Le quote negative sono le scommesse che ha perso.
 */
const descrizione = (caso: ChiamataVera): string =>
  `${caso.n} (${tavoloDi(caso)}): lui ${caso.scelta}, il bot ${decisione(caso) ? 'chiama' : 'passo'},` +
  ` voto ${valutaChiamata(carteDi(caso), caso.trionfo, scopertaDi(caso), configDi(caso)).toFixed(1)},` +
  ` quota ${caso.quota ?? '?'}`;

describe('la chiamata, come l ha decisa il giocatore vero', () => {
  it('sono tutte e 65, su tutti e quattro i tavoli', () => {
    expect(CHIAMATE_VERE).toHaveLength(65);
    expect(RESOCONTO.map((r) => r.totale)).toEqual([16, 16, 13, 20]);
  });

  for (const r of RESOCONTO) {
    it(`tavolo ${r.etichetta}: accordo ${r.percento}% — ${r.giusti} su ${r.totale}`, () => {
      // Sotto i tre quarti non e' piu' lo stesso giocatore.
      expect(r.percento).toBeGreaterThanOrEqual(75);
    });
  }

  const ACCORDO = (CHIAMATE_VERE.length - SBAGLIATE.length) / CHIAMATE_VERE.length;

  it(`in tutto: accordo ${Math.round(ACCORDO * 100)}% — ${SBAGLIATE.length} mani su 65 restano sue`, () => {
    const accordo = ACCORDO;
    expect(accordo).toBeGreaterThanOrEqual(0.8);
    // E nemmeno troppo: copiarle tutte vorrebbe dire aver copiato le scommesse.
    expect(accordo).toBeLessThan(1);
  });

  it('le mani su cui non e d accordo sono sempre le stesse, e si sa quali', () => {
    expect(SBAGLIATE.map(descrizione)).toEqual([
      '4 (3): lui passo, il bot chiama, voto 23.6, quota 1',
      '12 (5 amico): lui chiSeLaSente, il bot passo, voto 0.4, quota -24',
      '19 (5): lui passo, il bot chiama, voto 16.8, quota 1',
      '39 (4): lui normale, il bot passo, voto 15.1, quota -3',
      '56 (5 amico): lui normale, il bot passo, voto 13.7, quota 2',
    ]);
  });

  it('i punti in mano non decidono niente: la mano da 29 punti si passa, e il bot la passa con lui', () => {
    // Decisione 5: tre 7, due assi e un re, quasi tutti i punti del mazzo. Un
    // trionfo solo, e infatti l'ha passata: quei 7 laterali se li taglia il
    // primo che e' privo del palo, e senza trionfi non si riprende la mano.
    const ricca = CHIAMATE_VERE.find((caso) => caso.n === 5);
    if (ricca === undefined) throw new Error('manca la decisione 5');
    expect(ricca.scelta).toBe('passo');
    expect(decisione(ricca)).toBe(false);
  });
});

describe('lo scarto al monte, come l ha fatto il giocatore vero', () => {
  it('svuota un seme anche pagandoci un re, e mette i punti dei semi corti nel monte', () => {
    // Smazzata 2: sei trionfi, ha svuotato bastoni e messo nel monte asso e
    // cavallo di denari, otto punti in tutto.
    const allargata = mano([
      'spade-4', 'bastoni-cavallo', 'coppe-7', 'coppe-3', 'coppe-5', 'coppe-6', 'denari-2',
      'spade-fante', 'denari-cavallo', 'denari-asso', 'spade-cavallo', 'bastoni-4',
      'spade-asso', 'spade-7', 'coppe-asso', 'coppe-4',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3).map((carta) => carta.id).sort();
    expect(scarti).toEqual(
      ['bastoni-cavallo', 'bastoni-4', 'denari-asso', 'denari-cavallo'].sort(),
    );
  });

  it('con sette trionfi e solo carte basse da lasciare, non regala punti', () => {
    // Smazzata 10: ha svuotato denari e riempito con le tre carte piu' magre.
    const allargata = mano([
      'bastoni-5', 'spade-3', 'bastoni-4', 'spade-2', 'spade-7', 'coppe-7', 'bastoni-asso',
      'bastoni-3', 'bastoni-fante', 'spade-fante', 'coppe-4', 'denari-4',
      'bastoni-re', 'spade-4', 'spade-re', 'spade-cavallo',
    ]);
    const scarti = scegliScarti(allargata, 'spade', 4, 3).map((carta) => carta.id).sort();
    expect(scarti).toEqual(['bastoni-3', 'bastoni-4', 'coppe-4', 'denari-4'].sort());
  });
});
