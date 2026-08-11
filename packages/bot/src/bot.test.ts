import type { Alliance, Card, HandState, Rank, Suit, Variant } from '@mediatore/engine';
import {
  callableCards,
  createDeck,
  createHandState,
  createRng,
  deal,
  legalPlaysFor,
  playCard,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { scegliCarta, trionfiDaProteggere } from './gioca.ts';
import {
  cartaPiuAltaRimasta,
  carteNonAncoraViste,
  eFirma,
  eSemeFinito,
  trionfiAvversariRimasti,
  trionfiRimasti,
} from './memoria.ts';
import { possoVincere, rischioDiPerdere } from './valuta.ts';
import { vistaDaStato } from './vista.ts';

const MAZZO = createDeck();
const TRIONFO: Suit = 'bastoni';

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

/** Un rng finto: al tavolo di prova la casualita' non deve dare fastidio. */
const fisso = (): number => 0;

/**
 * Un tavolo apparecchiato a mano. Le mani sono corte apposta: per giudicare
 * una giocata bastano poche carte, e la smazzata non deve arrivare in fondo.
 */
function tavolo(args: {
  players: number;
  alliance: Alliance;
  mani: Card[][];
  monte?: Card[];
  leader?: number;
  variant?: Variant;
}): HandState {
  const config = tableConfig(args.players, args.variant ?? 'monte');
  return createHandState({
    config,
    dealer: 0,
    trump: TRIONFO,
    alliance: args.alliance,
    hands: args.mani,
    monte: args.monte ?? [],
    // Senza dirlo aprirebbe il primo di mano, che col mazziere a zero e' il
    // posto 1: nelle prove si parte da capo, cosi' le mosse si leggono.
    leader: args.leader ?? 0,
  });
}

function giocate(state: HandState, mosse: Card[]): HandState {
  return mosse.reduce((corrente, mossa) => playCard(corrente, corrente.turn, mossa.id), state);
}

function scelta(state: HandState): Card {
  return scegliCarta(vistaDaStato(state, state.turn), fisso);
}

describe('scegliCarta', () => {
  it("con una sola mossa legale gioca quella, senza pensarci", () => {
    // Il posto 2 ha un solo denaro: deve rispondere a seme, non c'e' scelta.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 2), carta('coppe', 3)],
          [carta('denari', 3), carta('coppe', 4)],
          [carta('denari', 're'), carta('coppe', 7)],
        ],
      }),
      [carta('denari', 2), carta('denari', 3)],
    );

    expect(legalPlaysFor(state, 2)).toHaveLength(1);
    expect(scelta(state).id).toBe('denari-re');
  });

  it("apre con la carta padrona, quella che nessuno puo' piu' superare", () => {
    // Il 7 di coppe e' il piu' forte del suo seme e nessuno l'ha ancora visto.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta('coppe', 7), carta('spade', 3), carta('denari', 4)],
        [carta('coppe', 4), carta('spade', 5), carta('denari', 5)],
        [carta('coppe', 5), carta('spade', 6), carta('denari', 6)],
      ],
      leader: 0,
    });

    expect(scelta(state).id).toBe('coppe-7');
  });

  it("carica il compagno quando la presa e' ormai sua", () => {
    // Il posto 1 ha tagliato col 7 di trionfo e io gioco per ultimo: la presa
    // e' fatta, tanto vale metterci dentro i punti.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 2), carta('coppe', 3)],
          [carta(TRIONFO, 7), carta('coppe', 4)],
          [carta('denari', 're'), carta('denari', 4), carta('coppe', 5)],
        ],
      }),
      [carta('denari', 2), carta(TRIONFO, 7)],
    );

    expect(scelta(state).id).toBe('denari-re');
  });

  it("strappa la presa grassa con la carta piu' bassa che basta", () => {
    // In tavola ci sono sei punti degli avversari: si prende, ma con l'asso,
    // non col 7 che e' la carta migliore che ho.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 7), carta('denari', 'asso'), carta('denari', 3)],
          [carta('denari', 're'), carta('coppe', 3)],
          [carta('denari', 'cavallo'), carta('coppe', 4)],
        ],
        leader: 1,
      }),
      [carta('denari', 're'), carta('denari', 'cavallo')],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('denari-asso');
  });

  it("prende anche una presa da niente, se puo'", () => {
    // In tavola non c'e' un punto e per vincere serve un trionfo: il gioco
    // osservato prende lo stesso, dodici volte su dodici.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta(TRIONFO, 5), carta(TRIONFO, 4), carta('coppe', 2)],
          [carta('denari', 3), carta('spade', 5), carta('spade', 2)],
          [carta('denari', 2), carta('spade', 6), carta('spade', 3)],
        ],
        leader: 1,
      }),
      [carta('denari', 3), carta('denari', 2)],
    );

    expect(state.turn).toBe(0);
    // Nessun denaro in mano: taglia, e taglia con la piu' bassa che basta.
    expect(scelta(state).id).toBe('bastoni-4');
  });

  it("sulla presa gia' sua ci carica i punti invece della minima", () => {
    // Gioco per ultimo e comando comunque: fra fante e 2 va il fante, cosi'
    // quel punto se lo porta a casa lui.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 'fante'), carta('denari', 2), carta('coppe', 3)],
          [carta('denari', 3), carta('coppe', 4), carta('coppe', 5)],
          [carta('denari', 4), carta('coppe', 6), carta('coppe', 7)],
        ],
        leader: 1,
      }),
      [carta('denari', 3), carta('denari', 4)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('denari-fante');
  });

  it("non apre bruciando un trionfo alto quando ha carte da niente", () => {
    // Il re di trionfo non e' padrone, il 7 e l'asso girano ancora, e io non
    // ho chiamato: si apre dal seme che non costa niente.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 're'), carta('denari', 4), carta('denari', 3), carta('coppe', 'fante')],
        [carta('coppe', 4), carta('spade', 5), carta('denari', 5), carta('spade', 2)],
        [carta('coppe', 5), carta('spade', 6), carta('denari', 6), carta('spade', 3)],
      ],
      leader: 0,
    });

    expect(scelta(state).id).toBe('denari-3');
  });

  it("non butta il trionfo alto sulla presa del compagno", () => {
    // Presa gia' vinta dal compagno: si caricano punti, ma non l'asso di
    // trionfo, che serve a prendere una presa vera piu' avanti.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('coppe', 2), carta('spade', 3)],
          [carta('coppe', 're'), carta('spade', 4)],
          [carta(TRIONFO, 'asso'), carta('denari', 're'), carta('denari', 2)],
        ],
      }),
      [carta('coppe', 2), carta('coppe', 're')],
    );

    expect(scelta(state).id).toBe('denari-re');
  });

  it("nel liscio scarica i punti addosso agli altri invece di prendere", () => {
    // Nel liscio perde chi fa piu' punti: la presa dell'avversario non si
    // strappa, ci si mette dentro la carta piu' pesante che ho.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'liscio' },
        mani: [
          [carta('coppe', 're'), carta('spade', 3)],
          [carta('coppe', 2), carta('spade', 4)],
          [carta('denari', 7), carta('denari', 2), carta('spade', 5)],
        ],
      }),
      [carta('coppe', 're'), carta('coppe', 2)],
    );

    expect(scelta(state).id).toBe('denari-7');
  });
});

/**
 * Il monte con dentro tutti i trionfi tranne quelli passati: il chiamante di
 * una normale quelle carte le ha scartate lui e quindi le sa, e cosi' al
 * tavolo di prova si puo' dire con esattezza quanti trionfi restano in giro.
 */
function trionfiNelMonte(...esclusi: Rank[]): Card[] {
  const fuori = new Set<Rank>(esclusi);
  return MAZZO.filter((c) => c.suit === TRIONFO && !fuori.has(c.rank));
}

describe('il conto dei trionfi', () => {
  it('gli avversari sono a zero quando i trionfi sono tutti usciti o miei', () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('coppe', 2)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('coppe', 5), carta('coppe', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso'),
    });

    const vista = vistaDaStato(state, 0);
    expect(trionfiRimasti(vista)).toHaveLength(0);
    expect(trionfiAvversariRimasti(vista)).toBe(0);
  });

  it("li conta ancora finche' qualcuno puo' averne", () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta('coppe', 2)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('coppe', 5), carta('coppe', 6)],
      ],
      monte: [],
    });

    const vista = vistaDaStato(state, 0);
    // Nove trionfi in giro, ma gli avversari hanno quattro carte in tutto:
    // piu' di quelle non ne possono nascondere.
    expect(trionfiRimasti(vista)).toHaveLength(9);
    expect(trionfiAvversariRimasti(vista)).toBe(4);
  });

  it("il trionfo e' firma quando sopra non c'e' piu' niente", () => {
    const conLaManiglia = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('coppe', 2)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('coppe', 5), carta('coppe', 6)],
      ],
      monte: [],
    });
    const vista = vistaDaStato(conLaManiglia, 0);
    expect(eFirma(vista, carta(TRIONFO, 7))).toBe(true);
    expect(eFirma(vista, carta(TRIONFO, 'asso'))).toBe(true);

    const senza = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 'asso'), carta('coppe', 2)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('coppe', 5), carta('coppe', 6)],
      ],
      monte: [],
    });
    // Con la maniglia di trionfo ancora in giro, l'asso non firma niente.
    expect(eFirma(vistaDaStato(senza, 0), carta(TRIONFO, 'asso'))).toBe(false);
  });

  it("la maniglia laterale e' firma solo quando non resta un trionfo", () => {
    const mani = [
      [carta('coppe', 7), carta(TRIONFO, 2)],
      [carta('spade', 3), carta('spade', 4)],
      [carta('spade', 5), carta('spade', 6)],
    ];

    const conTrionfiInGiro = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani,
      monte: [],
    });
    // Il 7 di coppe comanda il suo palo, ma chi e' privo di coppe lo uccide.
    expect(eFirma(vistaDaStato(conTrionfiInGiro, 0), carta('coppe', 7))).toBe(false);

    const puliti = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani,
      monte: trionfiNelMonte(2),
    });
    expect(eFirma(vistaDaStato(puliti, 0), carta('coppe', 7))).toBe(true);
  });
});

describe('arrassarsi', () => {
  it('smette appena gli avversari sono a zero trionfi, e va a incassare', () => {
    // Due trionfi in mano e nessuno in giro: quei due sono gia' firme e la
    // presa la faranno quando serve. Adesso si incassa il 7 di coppe, che
    // nessuno puo' piu' tagliare.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('coppe', 7), carta('coppe', 2)],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3), carta('denari', 4)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5), carta('denari', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso'),
      leader: 0,
    });

    const scelto = scelta(state);
    expect(scelto.suit).not.toBe(TRIONFO);
    expect(scelto.id).toBe('coppe-7');
  });

  it('si arrassa quando gli avversari i trionfi ce li hanno ancora', () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 7),
          carta(TRIONFO, 'asso'),
          carta(TRIONFO, 're'),
          carta(TRIONFO, 5),
          carta(TRIONFO, 4),
          carta('coppe', 2),
        ],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5)],
      ],
      monte: [],
      leader: 0,
    });

    expect(trionfiAvversariRimasti(vistaDaStato(state, 0))).toBeGreaterThan(0);
    expect(scelta(state).suit).toBe(TRIONFO);
  });

  it("con asso, re, 5, 4 e 2 esce dal re: cosi' la maniglia esce e l asso resta firma", () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 'asso'),
          carta(TRIONFO, 're'),
          carta(TRIONFO, 5),
          carta(TRIONFO, 4),
          carta(TRIONFO, 2),
        ],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5)],
      ],
      monte: [],
      leader: 0,
    });

    expect(scelta(state).id).toBe('bastoni-re');
  });

  it('con 7, asso, re e cavallo tutti firme esce uno qualunque di quelli', () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 7),
          carta(TRIONFO, 'asso'),
          carta(TRIONFO, 're'),
          carta(TRIONFO, 'cavallo'),
          carta('coppe', 2),
        ],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5)],
      ],
      // Restano in giro il 3 e il 2: pochi, ma abbastanza per arrassarsi.
      monte: trionfiNelMonte(7, 'asso', 're', 'cavallo', 3, 2),
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    for (const trionfo of [7, 'asso', 're', 'cavallo'] as const) {
      expect(eFirma(vista, carta(TRIONFO, trionfo))).toBe(true);
    }
    for (const tiro of [0, 0.3, 0.6, 0.99]) {
      const scelto = scegliCarta(vista, () => tiro);
      expect(['bastoni-7', 'bastoni-asso', 'bastoni-re', 'bastoni-cavallo']).toContain(scelto.id);
    }
  });

  it("sacrifica il re per far uscire la maniglia, e da li' l asso comanda", () => {
    // Non ha chiamato e non ha firme da incassare: si tira il re di coppe
    // sapendo che il 7 se lo prende, e l'asso resta padrone del palo.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta('coppe', 'asso'), carta('coppe', 're'), carta('spade', 2)],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5)],
      ],
      monte: [],
      leader: 0,
    });

    expect(scelta(state).id).toBe('coppe-re');
  });
});

describe('uccidere', () => {
  /** Il posto 0 apre a coppe e chi viene dopo di coppe non ne ha. */
  function presaDaUccidere(manoDelBot: Card[], primaUccisione?: Card): HandState {
    const diMezzo = primaUccisione ?? carta('spade', 3);
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 2, chiamata: 'normale' },
      mani: [
        [carta('coppe', 2), carta('coppe', 3)],
        [diMezzo, carta('spade', 4)],
        manoDelBot,
      ],
      monte: [],
      leader: 0,
    });
    return giocate(state, [carta('coppe', 2), diMezzo]);
  }

  it('taglia col 3 e si tiene la maniglia', () => {
    const state = presaDaUccidere([carta(TRIONFO, 7), carta(TRIONFO, 're'), carta(TRIONFO, 3)]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-3');
  });

  it('la maniglia resta in mano: dopo la presa e ancora li', () => {
    const state = presaDaUccidere([carta(TRIONFO, 7), carta(TRIONFO, 're'), carta(TRIONFO, 3)]);
    const dopo = playCard(state, 2, scelta(state).id);
    const restano = (dopo.hands[2] ?? []).map((c) => c.id);
    expect(restano).toContain('bastoni-7');
    expect(restano).toContain('bastoni-re');
  });

  it("sale al minimo che serve quando un altro ha gia' ucciso piu' alto", () => {
    const state = presaDaUccidere(
      [carta(TRIONFO, 7), carta(TRIONFO, 're'), carta(TRIONFO, 3)],
      carta(TRIONFO, 5),
    );
    expect(state.turn).toBe(2);
    // Il 3 non basta piu', ma la maniglia resta dov'e': passa il re.
    expect(scelta(state).id).toBe('bastoni-re');
  });

  /**
   * Il caso vero, a cinque giocatori: si apre a spade, gli altri rispondono a
   * seme e il chiamante, che deve ancora giocare, si tiene la maniglia di
   * spade. Il bot sta al posto 2 e di spade non ne ha.
   */
  function chiamanteInAgguato(manoDelBot: Card[]): HandState {
    const state = tavolo({
      players: 5,
      alliance: { kind: 'monte', caller: 3, chiamata: 'normale' },
      mani: [
        [carta('spade', 4), carta('denari', 2), carta('denari', 3)],
        [carta('spade', 5), carta('denari', 4), carta('denari', 5)],
        manoDelBot,
        [carta('spade', 7), carta('coppe', 4), carta('coppe', 5)],
        [carta('spade', 6), carta('coppe', 6), carta('coppe', 7)],
      ],
      monte: [],
      leader: 0,
    });
    return giocate(state, [carta('spade', 4), carta('spade', 5)]);
  }

  it("con un solo trionfo, e scartina, uccide e zomba la maniglia del chiamante", () => {
    // Quel 4 di trionfo tenuto in mano non varrebbe niente: uccidendo diventa
    // una presa, e la maniglia di spade del chiamante resta al palo.
    const state = chiamanteInAgguato([carta(TRIONFO, 4), carta('coppe', 2), carta('coppe', 3)]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-4');
  });

  it('col re terzo di trionfo non uccide: quei bassi gli tengono in piedi il re', () => {
    const state = chiamanteInAgguato([
      carta(TRIONFO, 're'),
      carta(TRIONFO, 4),
      carta(TRIONFO, 3),
      carta('coppe', 2),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('coppe-2');
  });

  it("con l asso secondo di trionfo non uccide: quel basso e' la sua protezione", () => {
    const state = chiamanteInAgguato([
      carta(TRIONFO, 'asso'),
      carta(TRIONFO, 3),
      carta('coppe', 2),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('coppe-2');
  });

  it("col re terzo e una scartina in piu' uccide con quella, e la protezione resta", () => {
    const state = chiamanteInAgguato([
      carta(TRIONFO, 're'),
      carta(TRIONFO, 5),
      carta(TRIONFO, 4),
      carta(TRIONFO, 3),
      carta('coppe', 2),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-5');

    const dopo = playCard(state, 2, 'bastoni-5');
    const restano = (dopo.hands[2] ?? []).map((c) => c.id);
    expect(restano).toContain('bastoni-re');
    expect(restano).toContain('bastoni-4');
    expect(restano).toContain('bastoni-3');
  });
});

describe('i trionfi da proteggere', () => {
  it('sotto il re terzo i due bassi sono la protezione', () => {
    const scorta = trionfiDaProteggere(
      [carta(TRIONFO, 're'), carta(TRIONFO, 4), carta(TRIONFO, 3), carta('coppe', 2)],
      TRIONFO,
    ).map((c) => c.id);
    expect(scorta).toEqual(['bastoni-3', 'bastoni-4']);
  });

  it("sotto l asso secondo il basso e' uno solo, che tanto sopra c'e' la sola maniglia", () => {
    const scorta = trionfiDaProteggere(
      [carta(TRIONFO, 'asso'), carta(TRIONFO, 3), carta('coppe', 2)],
      TRIONFO,
    ).map((c) => c.id);
    expect(scorta).toEqual(['bastoni-3']);
  });

  it("con soli trionfi bassi non c'e' niente da proteggere", () => {
    expect(
      trionfiDaProteggere([carta(TRIONFO, 5), carta(TRIONFO, 4), carta(TRIONFO, 2)], TRIONFO),
    ).toEqual([]);
  });

  it("il re secondo non si salva comunque: quei trionfi tornano spendibili", () => {
    expect(trionfiDaProteggere([carta(TRIONFO, 're'), carta(TRIONFO, 3)], TRIONFO)).toEqual([]);
  });

  it('con la maniglia in mano non c e niente da tenere sotto: sopra non gira piu nulla', () => {
    expect(
      trionfiDaProteggere([carta(TRIONFO, 7), carta(TRIONFO, 're'), carta(TRIONFO, 3)], TRIONFO),
    ).toEqual([]);
  });
});

describe('caricare sul compagno', () => {
  /**
   * Il chiamante, al posto 0, apre a coppe e si prende la presa; poi apre a
   * denari e il compagno del bot, al posto 1, la vince col re. Il bot sta al
   * posto 2, di denari non ne ha e gioca per ultimo: la presa del compagno e'
   * fatta, resta solo da decidere se caricarci sopra i punti.
   */
  function dopoLaPrimaPresa(prima: [Card, Card, Card], manoDelBot: Card[]): HandState {
    const [delChiamante, delCompagno, delBot] = prima;
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [delChiamante, carta('denari', 2), carta('denari', 3)],
        [delCompagno, carta('denari', 're'), carta('denari', 4)],
        [delBot, ...manoDelBot],
      ],
      monte: [],
      leader: 0,
    });
    return giocate(state, [
      delChiamante,
      delCompagno,
      delBot,
      carta('denari', 2),
      carta('denari', 're'),
    ]);
  }

  it("non carica l asso quando comanda il palo e i trionfi girano ancora", () => {
    // La maniglia di coppe e' uscita e l'asso comanda il palo, ma il re puo'
    // averlo il chiamante: scaricandogli sopra l'asso glielo si farebbe
    // firma. Si scarta liscio e l'asso resta in mano.
    const state = dopoLaPrimaPresa(
      [carta('coppe', 7), carta('coppe', 4), carta('coppe', 3)],
      [carta('coppe', 'asso'), carta('spade', 2)],
    );

    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('spade-2');
  });

  it("carica quando le alte del palo sono gia' uscite", () => {
    // Maniglia e asso di coppe sono passati nella prima presa: sopra il
    // cavallo resta il re, quindi caricando non si promuove niente a nessuno,
    // e quei due punti sulla presa gia' vinta valgono piu' che in mano.
    const state = dopoLaPrimaPresa(
      [carta('coppe', 7), carta('coppe', 'asso'), carta('coppe', 3)],
      [carta('coppe', 'cavallo'), carta('spade', 2)],
    );

    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('coppe-cavallo');
  });

  it('carica quando del palo ne restano quattro contate e i trionfi girano', () => {
    // Di coppe ne sono passate sei: in giro ne restano tre, cioe' qualcuno ne
    // e' gia' privo e alla prossima uscita l'asso lo uccide. Quei quattro
    // punti stanno meglio sulla presa gia' vinta.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [
            carta('coppe', 7),
            carta('coppe', 5),
            carta('spade', 're'),
            carta('denari', 2),
            carta('denari', 3),
          ],
          [
            carta('coppe', 4),
            carta('coppe', 6),
            carta('spade', 4),
            carta('denari', 're'),
            carta('denari', 4),
          ],
          [
            carta('coppe', 3),
            carta('coppe', 2),
            carta('spade', 3),
            carta('coppe', 'asso'),
            carta('spade', 2),
          ],
        ],
        monte: [],
        leader: 0,
      }),
      [
        carta('coppe', 7),
        carta('coppe', 4),
        carta('coppe', 3),
        carta('coppe', 5),
        carta('coppe', 6),
        carta('coppe', 2),
        carta('spade', 4),
        carta('spade', 3),
        carta('spade', 're'),
        carta('denari', 2),
        carta('denari', 're'),
      ],
    );

    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('coppe-asso');
  });

  it("carica quando il chiamante di quel palo e' gia' rimasto senza", () => {
    // Alle coppe il chiamante ha ucciso: il re non ce l'ha, e all'asso non
    // resta che finire sotto un suo trionfo. Meglio i punti adesso.
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta(TRIONFO, 2), carta('denari', 2), carta('denari', 3)],
          [carta('coppe', 7), carta('denari', 're'), carta('denari', 4)],
          [carta('coppe', 3), carta('coppe', 'asso'), carta('spade', 2)],
        ],
        monte: [],
        leader: 1,
      }),
      [
        carta('coppe', 7),
        carta('coppe', 3),
        carta(TRIONFO, 2),
        carta('denari', 2),
        carta('denari', 're'),
      ],
    );

    expect(state.turn).toBe(2);
    expect(eSemeFinito(vistaDaStato(state, 2), 0, 'coppe')).toBe(true);
    expect(scelta(state).id).toBe('coppe-asso');
  });
});

describe('memoria del tavolo', () => {
  it("si segna chi non ha risposto a seme", () => {
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 2), carta('coppe', 3)],
          [carta('denari', 3), carta('coppe', 4)],
          [carta('coppe', 5), carta('coppe', 7)],
        ],
      }),
      [carta('denari', 2), carta('denari', 3), carta('coppe', 5)],
    );

    const vista = vistaDaStato(state, state.turn);
    expect(eSemeFinito(vista, 2, 'denari')).toBe(true);
    expect(eSemeFinito(vista, 1, 'denari')).toBe(false);
    expect(eSemeFinito(vista, 2, 'coppe')).toBe(false);
  });

  it("la carta piu' alta rimasta salta quelle uscite e quelle che ho in mano", () => {
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 'asso'), carta('coppe', 3)],
          [carta('denari', 3), carta('coppe', 4)],
          [carta('denari', 7), carta('denari', 're'), carta('coppe', 5)],
        ],
      }),
      [carta('denari', 'asso'), carta('denari', 3)],
    );

    const vista = vistaDaStato(state, 2);
    // L'asso e' uscito, il 7 e il re li ho io: il piu' alto che resta e' il cavallo.
    expect(cartaPiuAltaRimasta(vista, 'denari')?.id).toBe('denari-cavallo');
    const nonViste = carteNonAncoraViste(vista).map((c) => c.id);
    expect(nonViste).not.toContain('denari-asso');
    expect(nonViste).not.toContain('denari-7');
  });

  it("chi gioca per ultimo non rischia piu' niente", () => {
    const state = giocate(
      tavolo({
        players: 3,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('denari', 2), carta('coppe', 3)],
          [carta('denari', 3), carta('coppe', 4)],
          [carta('denari', 5), carta('coppe', 5)],
        ],
      }),
      [carta('denari', 2), carta('denari', 3)],
    );

    const vista = vistaDaStato(state, 2);
    expect(rischioDiPerdere(vista, carta('denari', 5))).toBe(0);
    expect(possoVincere(vista, carta('denari', 5))).toBe(true);
  });

  it("aprire con una carta bassa rischia piu' che aprire con una alta", () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta('denari', 2), carta('denari', 7)],
        [carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6)],
      ],
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    const bassa = rischioDiPerdere(vista, carta('denari', 2));
    const alta = rischioDiPerdere(vista, carta('denari', 7));
    expect(bassa).toBeGreaterThan(alta);
    expect(alta).toBeGreaterThanOrEqual(0);
    expect(bassa).toBeLessThanOrEqual(1);
  });
});

describe("quello che il bot non puo' sapere", () => {
  it("la vista non contiene nessuna carta delle mani altrui", () => {
    const state = tavolo({
      players: 5,
      alliance: { kind: 'monte', caller: 0, chiamata: 'colonna' },
      mani: [
        [carta('denari', 2), carta('denari', 3)],
        [carta('coppe', 2), carta('coppe', 3)],
        [carta('spade', 2), carta('spade', 3)],
        [carta(TRIONFO, 2), carta(TRIONFO, 3)],
        [carta('denari', 4), carta('coppe', 4)],
      ],
      monte: [carta('spade', 7), carta('denari', 7)],
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    const scritta = JSON.stringify(vista);
    for (let seat = 1; seat < 5; seat += 1) {
      for (const nascosta of state.hands[seat] ?? []) {
        expect(scritta).not.toContain(nascosta.id);
      }
    }
    // Nella colonna il monte resta coperto anche per chi ha chiamato.
    expect(vista.monteVisibile).toHaveLength(0);
    expect(vista.monteCoperto).toBe(2);
    expect(Object.keys(vista)).not.toContain('hands');
  });

  it("il monte lo vede solo chi le regole lasciano guardare", () => {
    const mani = [
      [carta('denari', 2), carta('denari', 3)],
      [carta('coppe', 2), carta('coppe', 3)],
      [carta('spade', 2), carta('spade', 3)],
    ];
    const conSola = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'sola' },
      mani,
      monte: [carta('spade', 7)],
      leader: 0,
    });

    expect(vistaDaStato(conSola, 0).monteVisibile.map((c) => c.id)).toEqual(['spade-7']);
    expect(vistaDaStato(conSola, 1).monteVisibile).toHaveLength(0);
  });
});

/** Una smazzata intera con il bot in ogni posto: qui conta solo la legalita'. */
function smazzataDelBot(seed: number): number {
  const rng = createRng(seed);
  const players = 3 + (seed % 3);
  const variant: Variant = players === 5 && seed % 4 === 0 ? 'amico' : 'monte';
  const config = tableConfig(players, variant);
  const dealer = seed % players;
  const dealt = deal(config, dealer, createRng(seed * 7 + 1));

  const caller = seed % 5 === 0 ? null : seed % players;
  let alliance: Alliance;
  if (caller === null) {
    alliance = { kind: 'liscio' };
  } else if (variant === 'amico') {
    const chiamabili = callableCards(dealt.hands[caller] ?? []);
    const chiamata = chiamabili[seed % chiamabili.length];
    if (chiamata === undefined) throw new Error('nessuna carta da chiamare');
    alliance = { kind: 'amico', caller, calledCard: chiamata.id, friend: null };
  } else {
    alliance = { kind: 'monte', caller, chiamata: 'normale' };
  }

  let state = createHandState({
    config,
    dealer,
    trump: dealt.trump,
    alliance,
    hands: dealt.hands,
    monte: dealt.monte,
  });

  let decisioni = 0;
  while (!state.finished) {
    const legali = legalPlaysFor(state, state.turn);
    const scelta = scegliCarta(vistaDaStato(state, state.turn), rng);
    expect(legali.map((c) => c.id)).toContain(scelta.id);
    decisioni += 1;
    state = playCard(state, state.turn, scelta.id);
  }
  return decisioni;
}

describe('legalita', () => {
  it("sceglie sempre dentro le mosse legali, su piu' di cinquemila decisioni", () => {
    let decisioni = 0;
    let seed = 1;
    while (decisioni < 5000) {
      decisioni += smazzataDelBot(seed);
      seed += 1;
    }
    expect(decisioni).toBeGreaterThanOrEqual(5000);
  });
});
