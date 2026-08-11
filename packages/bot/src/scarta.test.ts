import type { Card, Suit } from '@mediatore/engine';
import { cardPoints, createDeck } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { ePadronaInMano, puntiTollerati, scegliScarti } from './scarta.ts';

const MAZZO = createDeck();

function mano(ids: readonly string[]): Card[] {
  return ids.map((id) => {
    const carta = MAZZO.find((c) => c.id === id);
    if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
    return carta;
  });
}

const punti = (carte: readonly Card[]): number =>
  carte.reduce((somma, carta) => somma + cardPoints(carta.rank), 0);

const semi = (carte: readonly Card[], seme: Suit): number =>
  carte.filter((carta) => carta.suit === seme).length;

describe('lo scarto al monte', () => {
  it('non scarta mai trionfi finche ha altro da dare', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-5', 'coppe-4',
      'denari-2', 'denari-3', 'denari-4', 'denari-5',
      'spade-2', 'spade-3', 'spade-4',
      'bastoni-2', 'bastoni-3', 'bastoni-4', 'bastoni-5',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    expect(scarti).toHaveLength(4);
    expect(scarti.some((carta) => carta.suit === 'coppe')).toBe(false);
  });

  it('svuota il seme piu corto quando costa poco', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-6', 'coppe-5', 'coppe-4',
      'spade-2', 'spade-3',
      'denari-2', 'denari-3', 'denari-5', 'denari-6',
      'bastoni-2', 'bastoni-3', 'bastoni-5', 'bastoni-6', 'bastoni-4',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    const restano = allargata.filter((carta) => !scarti.some((s) => s.id === carta.id));
    expect(semi(restano, 'spade')).toBe(0);
  });

  it('paga anche un re pur di restare senza un seme', () => {
    // Osservato: re e 2 di spade nel monte per poter tagliare da subito.
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-6', 'coppe-5',
      'spade-re', 'spade-2',
      'denari-2', 'denari-3', 'denari-5', 'denari-6', 'denari-7',
      'bastoni-2', 'bastoni-3', 'bastoni-5', 'bastoni-6',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3).map((carta) => carta.id);
    expect(scarti).toContain('spade-re');
    expect(scarti).toContain('spade-2');
  });

  it('con sei trionfi accetta di mettere punti nel monte', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-6', 'coppe-5', 'coppe-4',
      'denari-asso', 'denari-cavallo', 'denari-2',
      'spade-2', 'spade-3', 'spade-5', 'spade-6',
      'bastoni-2', 'bastoni-3', 'bastoni-5',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    expect(punti(scarti)).toBeGreaterThan(0);
    expect(scarti.map((carta) => carta.id)).toContain('denari-asso');
  });

  it('con due trionfi non mette mai punti nel monte', () => {
    const allargata = mano([
      'coppe-7', 'coppe-2',
      'denari-asso', 'denari-cavallo', 'denari-2', 'denari-3',
      'spade-re', 'spade-fante', 'spade-3', 'spade-4', 'spade-5',
      'bastoni-asso', 'bastoni-re', 'bastoni-2', 'bastoni-3', 'bastoni-4',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    expect(punti(scarti)).toBe(0);
  });

  it('non da via una carta padrona del seme che tiene', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-5',
      'denari-7', 'denari-2', 'denari-3',
      'spade-7', 'spade-asso', 'spade-2', 'spade-3', 'spade-4',
      'bastoni-2', 'bastoni-3', 'bastoni-4', 'bastoni-5',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3).map((carta) => carta.id);
    expect(scarti).not.toContain('denari-7');
    expect(scarti).not.toContain('spade-7');
    expect(scarti).not.toContain('spade-asso');
  });

  it('scarta esattamente quante gliene chiedono, e carte che ha davvero', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-2', 'coppe-3',
      'denari-2', 'denari-3', 'denari-4',
      'spade-2', 'spade-3', 'spade-4', 'spade-5',
      'bastoni-2', 'bastoni-3', 'bastoni-4', 'bastoni-5', 'bastoni-6',
    ]);
    for (const quanti of [1, 2, 4]) {
      const scarti = scegliScarti(allargata, 'coppe', quanti, 3);
      expect(scarti).toHaveLength(quanti);
      expect(new Set(scarti.map((c) => c.id)).size).toBe(quanti);
      expect(scarti.every((c) => allargata.some((a) => a.id === c.id))).toBe(true);
    }
  });
});

describe('la tolleranza ai punti nel monte', () => {
  it('cresce coi trionfi e a tavoli larghi si stringe', () => {
    expect(puntiTollerati(2, 3)).toBe(0);
    expect(puntiTollerati(3, 3)).toBe(0);
    expect(puntiTollerati(6, 3)).toBeGreaterThan(puntiTollerati(4, 3));
    expect(puntiTollerati(6, 5)).toBeLessThan(puntiTollerati(6, 3));
  });
});

describe('le padrone si riconoscono dalla mano', () => {
  it('il 7 comanda sempre, l asso solo col 7 in mano', () => {
    expect(ePadronaInMano(mano(['spade-7'])[0] as Card, mano(['spade-7', 'spade-2']))).toBe(true);
    expect(ePadronaInMano(mano(['spade-asso'])[0] as Card, mano(['spade-asso', 'spade-2']))).toBe(
      false,
    );
    expect(
      ePadronaInMano(mano(['spade-asso'])[0] as Card, mano(['spade-7', 'spade-asso'])),
    ).toBe(true);
  });
});
