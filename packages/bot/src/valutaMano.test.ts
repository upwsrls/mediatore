import type { Card } from '@mediatore/engine';
import { createDeck, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import {
  basiSicure,
  decidiChiamata,
  forzaDeiTrionfi,
  valoreDellaScoperta,
  valutaChiamata,
} from './valutaMano.ts';

const MAZZO = createDeck();

function mano(...ids: string[]): Card[] {
  return ids.map((id) => {
    const carta = MAZZO.find((c) => c.id === id);
    if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
    return carta;
  });
}

const carta = (id: string): Card => mano(id)[0] as Card;

/** Quattro trionfi bassi: bastano a difendere i pali, e non contano basi. */
const SCORTA = ['coppe-2', 'coppe-3', 'coppe-4', 'coppe-5'];

describe('le basi sicure', () => {
  it('il 7 di trionfo e una presa e basta: non c e niente che lo uccida', () => {
    expect(basiSicure(mano('coppe-7', 'spade-2'), 'coppe')).toBe(1);
  });

  it('l asso di trionfo senza il 7 e quasi una presa, non del tutto', () => {
    expect(basiSicure(mano('coppe-asso', 'spade-2'), 'coppe')).toBe(0.95);
  });

  it('col 7 davanti l asso di trionfo diventa una presa piena', () => {
    expect(basiSicure(mano('coppe-7', 'coppe-asso'), 'coppe')).toBe(2);
  });

  it('il 7 di un palo laterale vale meno: chi e privo di quel palo lo taglia', () => {
    expect(basiSicure(mano('spade-7', ...SCORTA), 'coppe')).toBe(0.9);
  });

  it('l asso di un palo laterale senza il suo 7 non e una base: il 7 lo batte', () => {
    expect(basiSicure(mano('spade-asso', 'spade-re', ...SCORTA), 'coppe')).toBe(0);
  });

  it('col proprio 7 davanti, l asso laterale e protetto e conta', () => {
    expect(basiSicure(mano('spade-7', 'spade-asso', ...SCORTA), 'coppe')).toBe(1.8);
  });

  it('la catena si ferma al terzo gradino: dal cavallo in giu non e piu certezza', () => {
    const conRe = basiSicure(mano('coppe-7', 'coppe-asso', 'coppe-re'), 'coppe');
    const conCavallo = basiSicure(mano('coppe-7', 'coppe-asso', 'coppe-re', 'coppe-cavallo'), 'coppe');
    expect(conRe).toBeCloseTo(2.9);
    expect(conCavallo).toBe(conRe);
  });

  it('la catena si spezza dove manca un gradino', () => {
    // Senza l'asso, il re non e' padrone di niente: sopra ne restano due.
    expect(basiSicure(mano('coppe-7', 'coppe-re'), 'coppe')).toBe(1);
  });
});

describe('i trionfi che difendono le basi laterali', () => {
  const treSette = ['spade-7', 'denari-7', 'bastoni-7'];
  const conTrionfi = (quanti: number): number =>
    basiSicure(mano(...treSette, ...SCORTA.slice(0, quanti)), 'coppe');

  it('con un trionfo solo i 7 laterali valgono la meta', () => {
    expect(conTrionfi(1)).toBeCloseTo(2.7 * 0.5);
  });

  it('da quattro trionfi in su valgono per intero', () => {
    expect(conTrionfi(4)).toBeCloseTo(2.7);
    expect(basiSicure(mano(...treSette, ...SCORTA, 'coppe-6'), 'coppe')).toBeCloseTo(2.7);
  });

  it('in mezzo la riduzione va per gradi', () => {
    expect(conTrionfi(2)).toBeGreaterThan(conTrionfi(1));
    expect(conTrionfi(3)).toBeGreaterThan(conTrionfi(2));
    expect(conTrionfi(4)).toBeGreaterThan(conTrionfi(3));
  });

  it('le basi nel trionfo non le tocca: quelle non le uccide nessuno', () => {
    expect(basiSicure(mano('coppe-7'), 'coppe')).toBe(1);
    expect(basiSicure(mano('coppe-7', 'coppe-asso'), 'coppe')).toBe(2);
  });

  it('la mano da 29 punti con tre 7 laterali e un trionfo si passa', () => {
    // E' la decisione 5 delle partite vere: quasi tutti i punti del mazzo, e
    // per difenderli un trionfo solo. Col conto vecchio erano 5,3 basi e il
    // bot chiamava; lui l'aveva passata, e la smazzata gli e' costata 2.
    const ricca = mano(
      'denari-4', 'bastoni-re', 'bastoni-7', 'coppe-fante', 'spade-4', 'coppe-3',
      'spade-5', 'bastoni-asso', 'spade-7', 'coppe-7', 'bastoni-cavallo', 'coppe-asso',
    );
    const vista = { mano: ricca, trump: 'denari' as const, scoperta: carta('denari-cavallo') };
    expect(decidiChiamata(vista, tableConfig(3, 'monte'))).toBe('passo');
  });
});

describe('la carta scoperta del monte', () => {
  it('un 7 di trionfo scoperto e una base in piu', () => {
    expect(valoreDellaScoperta(mano('coppe-2', 'spade-5'), 'coppe', carta('coppe-7'))).toBe(1);
  });

  it('vale per quello che aggiunge a QUESTA mano, non per quello che e', () => {
    // L'asso di spade da solo non e' niente; dietro al 7 di spade che ho in
    // mano vale come una base intera, e le basi passano da una a due.
    const senzaIlSette = mano('spade-re', ...SCORTA);
    const colSette = mano('spade-7', ...SCORTA);
    expect(valoreDellaScoperta(senzaIlSette, 'coppe', carta('spade-asso'))).toBe(0);
    expect(valoreDellaScoperta(colSette, 'coppe', carta('spade-asso'))).toBeCloseTo(0.9);
  });

  it('una carta qualunque non aggiunge niente: la mano deve reggersi da sola', () => {
    expect(valoreDellaScoperta(mano('coppe-7', 'spade-5'), 'coppe', carta('coppe-3'))).toBe(0);
  });

  it('senza monte la scoperta non si conta: resta in mano al mazziere', () => {
    const carte = mano('coppe-7', 'coppe-asso', 'spade-5', 'denari-4');
    const conScoperta = valutaChiamata(carte, 'coppe', carta('coppe-re'), tableConfig(5, 'amico'));
    const senza = valutaChiamata(carte, 'coppe', null, tableConfig(5, 'amico'));
    expect(conScoperta).toBe(senza);
  });
});

describe('la forza dei trionfi', () => {
  it('pesa dal 10 del 7 all uno del 2, e guarda solo il trionfo', () => {
    expect(forzaDeiTrionfi(mano('coppe-7'), 'coppe')).toBe(10);
    expect(forzaDeiTrionfi(mano('coppe-asso'), 'coppe')).toBe(9);
    expect(forzaDeiTrionfi(mano('coppe-2'), 'coppe')).toBe(1);
    expect(forzaDeiTrionfi(mano('spade-7', 'spade-asso'), 'coppe')).toBe(0);
  });

  it('quattro trionfi bassi non sono quattro trionfi alti', () => {
    const alti = mano('coppe-7', 'coppe-asso', 'coppe-re', 'coppe-cavallo');
    const bassi = mano('coppe-2', 'coppe-3', 'coppe-4', 'coppe-5');
    expect(forzaDeiTrionfi(alti, 'coppe')).toBeGreaterThan(forzaDeiTrionfi(bassi, 'coppe'));
  });
});

describe('la decisione', () => {
  const aTre = tableConfig(3, 'monte');

  it('non e il numero dei trionfi a decidere', () => {
    // Quattro trionfi per parte. Sopra comandano, sotto sono numeri: la prima
    // si chiama, la seconda si passa, ed e' esattamente il caso che il vecchio
    // criterio non sapeva distinguere.
    const comanda = mano(
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-5',
      'spade-7', 'spade-4', 'denari-3', 'denari-2',
      'bastoni-6', 'bastoni-5', 'bastoni-4', 'bastoni-3',
    );
    const numeri = mano(
      'coppe-5', 'coppe-4', 'coppe-3', 'coppe-2',
      'spade-6', 'spade-4', 'denari-3', 'denari-2',
      'bastoni-6', 'bastoni-5', 'bastoni-4', 'bastoni-3',
    );
    expect(decidiChiamata({ mano: comanda, trump: 'coppe' }, aTre)).toBe('chiama');
    expect(decidiChiamata({ mano: numeri, trump: 'coppe' }, aTre)).toBe('passo');
  });

  // Tre trionfi con l'asso e un 7 laterale: da sola questa mano non basta.
  const alConfine = mano(
    'coppe-asso', 'coppe-5', 'coppe-4',
    'spade-7', 'spade-5', 'denari-6', 'denari-5', 'denari-4',
    'bastoni-6', 'bastoni-5', 'bastoni-4', 'bastoni-3',
  );

  it('la scoperta puo far cambiare idea', () => {
    expect(decidiChiamata({ mano: alConfine, trump: 'coppe' }, aTre)).toBe('passo');
    // Il 7 di trionfo scoperto mette l'asso al riparo: due basi invece di una.
    expect(
      decidiChiamata({ mano: alConfine, trump: 'coppe', scoperta: carta('coppe-7') }, aTre),
    ).toBe('chiama');
  });

  it('ma solo se aggiunge qualcosa: un 3 scoperto lascia le cose come stanno', () => {
    expect(
      decidiChiamata({ mano: alConfine, trump: 'coppe', scoperta: carta('coppe-3') }, aTre),
    ).toBe('passo');
  });

  it('chi non sa cosa c e scoperto decide con la sola mano', () => {
    expect(decidiChiamata({ mano: alConfine, trump: 'coppe' }, aTre)).toBe(
      decidiChiamata({ mano: alConfine, trump: 'coppe', scoperta: null }, aTre),
    );
  });
});
