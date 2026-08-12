import type { Card, Suit } from '@mediatore/engine';
import {
  cardPoints,
  cardStrength,
  createDeck,
  createRng,
  deal,
  discardToMonte,
  shuffle,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { ePadronaInMano, fonteDiPrese, puntiTollerati, scegliScarti } from './scarta.ts';

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

  it('il palo da sette carte lo accorcia di una sola, il resto lo prende dal palo di mezzo', () => {
    // Il caso vero: mano allargata del chiamante, trionfo coppe. Sette bastoni
    // sono una fonte di prese, e sono i denari a dover perdere le scartine.
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-3', 'coppe-6',
      'denari-7', 'denari-asso', 'denari-6', 'denari-5', 'denari-2',
      'bastoni-re', 'bastoni-cavallo', 'bastoni-fante', 'bastoni-6', 'bastoni-4',
      'bastoni-3', 'bastoni-2',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    const restano = allargata.filter((carta) => !scarti.some((s) => s.id === carta.id));

    expect(semi(scarti, 'bastoni')).toBe(1);
    expect(semi(restano, 'bastoni')).toBe(6);
    expect(semi(scarti, 'denari')).toBe(3);
  });

  it('dal palo da cinque manda nel monte le scartine e tiene maniglia e asso', () => {
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-3', 'coppe-2',
      'denari-7', 'denari-asso', 'denari-6', 'denari-5', 'denari-2',
      'bastoni-re', 'bastoni-cavallo', 'bastoni-6', 'bastoni-4', 'bastoni-3', 'bastoni-2',
      'spade-4',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3).map((carta) => carta.id).sort();
    expect(scarti).toEqual(['denari-2', 'denari-5', 'denari-6', 'spade-4'].sort());
  });

  it("il palo piu' lungo non lo svuota per fare il vuoto, nemmeno quando e' l'unico che potrebbe", () => {
    // Negli altri due pali c'e' una padrona e non si toccano: il vuoto si
    // potrebbe fare solo coi quattro bastoni, ed e' proprio quello che rende.
    const allargata = mano([
      'coppe-7', 'coppe-asso', 'coppe-re', 'coppe-cavallo', 'coppe-fante', 'coppe-6', 'coppe-5',
      'denari-7', 'denari-2',
      'spade-7', 'spade-asso', 'spade-3',
      'bastoni-2', 'bastoni-3', 'bastoni-4', 'bastoni-5',
    ]);
    const scarti = scegliScarti(allargata, 'coppe', 4, 3);
    const restano = allargata.filter((carta) => !scarti.some((s) => s.id === carta.id));
    expect(semi(restano, 'bastoni')).toBeGreaterThan(0);
  });

  it('dal palo lungo toglie le scartine e non spezza la catena delle alte', () => {
    // Caso vero, cinque giocatori, trionfo denari: sette spade con asso,
    // cavallo e fante di seguito. Fuori dalle spade non c'e' niente da dare —
    // il resto e' trionfo — quindi cinque carte devono uscire proprio da li'.
    // Escono dal basso: asso e cavallo restano, che sono la fonte.
    const allargata = mano([
      'spade-asso', 'spade-cavallo', 'spade-fante', 'spade-5', 'spade-4', 'spade-3', 'spade-2',
      'denari-7', 'denari-6', 'denari-5', 'denari-4', 'denari-3',
    ]);
    const scarti = scegliScarti(allargata, 'denari', 5, 5).map((carta) => carta.id);

    expect(scarti).toEqual(
      expect.arrayContaining(['spade-2', 'spade-3', 'spade-4', 'spade-5']),
    );
    expect(scarti).not.toContain('spade-cavallo');
    expect(scarti).not.toContain('spade-asso');
  });

  it("nel palo lungo le alte non escono finche' sotto c'e' una scartina", () => {
    const allargata = mano([
      'spade-asso', 'spade-cavallo', 'spade-fante', 'spade-6', 'spade-5', 'spade-4',
      'coppe-re', 'coppe-2',
      'denari-7', 'denari-asso', 'denari-6', 'denari-5',
    ]);
    const scarti = scegliScarti(allargata, 'denari', 5, 5);
    const spadeScartate = scarti.filter((carta) => carta.suit === 'spade');
    const spadeTenute = allargata.filter(
      (carta) => carta.suit === 'spade' && !scarti.some((s) => s.id === carta.id),
    );

    for (const uscita of spadeScartate) {
      for (const tenuta of spadeTenute) {
        expect(cardStrength(uscita.rank)).toBeLessThan(cardStrength(tenuta.rank));
      }
    }
  });

  it('manda nel monte un asso laterale che non ha il suo 7', () => {
    // Sei trionfi: i punti nel monte se li puo' permettere. L'asso di coppe
    // senza il 7 non e' una base — la maniglia se lo prende comunque — e va
    // nel monte anche se il suo palo non e' corto.
    // Tre denari se ne vanno per fare il vuoto e resta un posto solo: ci va
    // l'asso, non la scartina di coppe.
    const allargata = mano([
      'bastoni-7', 'bastoni-asso', 'bastoni-re', 'bastoni-cavallo', 'bastoni-fante',
      'coppe-asso', 'coppe-5', 'coppe-4', 'coppe-3',
      'spade-7', 'spade-6', 'spade-5', 'spade-4',
      'denari-4', 'denari-3', 'denari-2',
    ]);
    expect(scegliScarti(allargata, 'bastoni', 4, 3).map((c) => c.id)).toContain('coppe-asso');
  });

  it('lo stesso asso, col suo 7 in mano, resta: quella e una base', () => {
    const allargata = mano([
      'bastoni-7', 'bastoni-asso', 'bastoni-re', 'bastoni-cavallo', 'bastoni-fante', 'bastoni-6',
      'coppe-7', 'coppe-asso', 'coppe-5', 'coppe-4',
      'spade-7', 'spade-6', 'spade-5', 'spade-4', 'spade-3',
      'denari-3',
    ]);
    const scarti = scegliScarti(allargata, 'bastoni', 4, 3).map((c) => c.id);
    expect(scarti).not.toContain('coppe-asso');
    expect(scarti).not.toContain('coppe-7');
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

  it('ne scarta quante ne vuole il monte, su ogni tavolo e con qualunque mano', () => {
    // Il numero degli scarti non e' un'opinione: al monte da cinque ne vanno
    // cinque. Se il bot ne desse quattro l'engine rifiuterebbe lo scambio e la
    // smazzata si fermerebbe li', quindi si prova a tappeto.
    const rng = createRng(4321);
    for (let i = 0; i < 2000; i += 1) {
      const mazzo = shuffle(MAZZO, rng);
      const trump = (mazzo[39] as Card).suit;
      for (const [players, inMano, quanti] of [
        [3, 12, 4],
        [4, 9, 4],
        [5, 7, 5],
      ] as const) {
        const allargata = mazzo.slice(0, inMano + quanti);
        const scarti = scegliScarti(allargata, trump, quanti, players);
        expect(scarti).toHaveLength(quanti);
        expect(new Set(scarti.map((c) => c.id)).size).toBe(quanti);
        expect(scarti.every((c) => allargata.some((a) => a.id === c.id))).toBe(true);
      }
    }
  });
});

/**
 * Lo scarto non si prova solo sulla mano del bot: si prova sulla smazzata,
 * perche' e' li' che una carta in piu' o in meno si vede. Chi prende il monte
 * si ritrova per un momento la mano piu' lunga di tutti, e allo scambio deve
 * tornare lunga come le altre: se non torna, il tavolo e' sbilanciato e alla
 * fine qualcuno resta con una carta in mano che nessuno gli puo' rispondere.
 */
describe('la smazzata intera, dalla distribuzione allo scambio', () => {
  const TAVOLI = [3, 4, 5] as const;

  it('il chiamante ne rimette nel monte esattamente quante ne ha prese', () => {
    for (const players of TAVOLI) {
      const config = tableConfig(players, 'monte');
      for (let seed = 0; seed < 200; seed += 1) {
        const dato = deal(config, seed % players, createRng(seed));
        for (let caller = 0; caller < players; caller += 1) {
          const allargata = takeMonte(dato.hands[caller] as Card[], dato.monte);
          expect(allargata).toHaveLength(config.handSize + config.monteSize);

          const scarti = scegliScarti(allargata, dato.trump, config.monteSize, players);
          expect(scarti).toHaveLength(config.monteSize);

          // Il passaggio dall'engine non e' una formalita': e' il controllo che
          // rifiuta il numero sbagliato, e il bot ci passa da qui come chiunque.
          const scambio = discardToMonte(allargata, scarti, config.monteSize);
          expect(scambio.hand).toHaveLength(config.handSize);
          expect(scambio.monte).toHaveLength(config.monteSize);
        }
      }
    }
  });

  it('dopo lo scambio le mani sono tutte della stessa lunghezza, e le quaranta carte ci sono tutte', () => {
    for (const players of TAVOLI) {
      const config = tableConfig(players, 'monte');
      for (let seed = 0; seed < 200; seed += 1) {
        const dato = deal(config, seed % players, createRng(seed));
        const caller = seed % players;
        const allargata = takeMonte(dato.hands[caller] as Card[], dato.monte);
        const scarti = scegliScarti(allargata, dato.trump, config.monteSize, players);
        const scambio = discardToMonte(allargata, scarti, config.monteSize);

        const mani = dato.hands.map((mano, seat) => (seat === caller ? scambio.hand : mano));
        expect(mani.map((mano) => mano.length)).toEqual(
          Array.from({ length: players }, () => config.handSize),
        );

        const inTavola = [...mani.flat(), ...scambio.monte];
        expect(inTavola).toHaveLength(40);
        expect(new Set(inTavola.map((carta) => carta.id)).size).toBe(40);
      }
    }
  });
});

describe('quanto rende un palo lungo', () => {
  it('con sette carte su dieci due giri lo esauriscono, e restano cinque firme', () => {
    expect(fonteDiPrese(7, 3)).toEqual({ giri: 2, firme: 5 });
  });

  it("piu' il palo e' corto, meno rende: a cinque carte due firme, a tre nessuna", () => {
    expect(fonteDiPrese(5, 3)).toEqual({ giri: 3, firme: 2 });
    expect(fonteDiPrese(3, 3)).toEqual({ giri: 3, firme: 0 });
  });

  it('con piu giocatori i giri sono meno, che a ogni giro ne esce una per ciascuno', () => {
    expect(fonteDiPrese(6, 5).giri).toBeLessThan(fonteDiPrese(6, 3).giri);
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
