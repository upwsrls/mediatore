import type { Alliance, Card, HandState, Rank, Suit, Variant } from '@mediatore/engine';
import {
  callableCards,
  cardPoints,
  createDeck,
  createHandState,
  createRng,
  deal,
  legalPlaysFor,
  playCard,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { scegliCarta, trionfiBastanoARipulire, trionfiDaProteggere } from './gioca.ts';
import {
  cartaPiuAltaRimasta,
  carteNonAncoraViste,
  eFirma,
  eSemeFinito,
  trionfiAvversariRimasti,
  trionfiRimasti,
} from './memoria.ts';
import { scegliScarti } from './scarta.ts';
import { possoVincere, rischioDiPerdere } from './valuta.ts';
import { sonoIlChiamante, sonoLAmicoNascosto, vistaDaStato } from './vista.ts';

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
  trump?: Suit;
  /** Solo per le prove sull'ultima base: il resto del tavolo non lo tocca. */
  tricks?: number;
}): HandState {
  const config = tableConfig(args.players, args.variant ?? 'monte');
  return createHandState({
    config: args.tricks !== undefined ? { ...config, tricks: args.tricks } : config,
    dealer: 0,
    trump: args.trump ?? TRIONFO,
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

  it("non apre con l asso laterale finche' la maniglia di quel palo gira", () => {
    // Caso vero, cinque giocatori: apri' con l'asso di coppe senza avere il 7,
    // e un avversario ci mise la maniglia. Un asso senza il suo 7 non e' una
    // base: aprire con quello e' mettere quattro punti sul tavolo. Il palo di
    // coppe e' anche il piu' magro che abbia, ed era da li' che usciva.
    const state = tavolo({
      players: 5,
      trump: 'denari',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta('coppe', 'asso'),
          carta('spade', 're'),
          carta('spade', 'fante'),
          carta('denari', 4),
          carta('denari', 3),
        ],
        [carta('coppe', 7), carta('spade', 7), carta('bastoni', 2), carta('bastoni', 3), carta('denari', 5)],
        [carta('coppe', 're'), carta('spade', 'asso'), carta('bastoni', 4), carta('bastoni', 5), carta('denari', 6)],
        [carta('coppe', 6), carta('spade', 6), carta('bastoni', 6), carta('bastoni', 7), carta('denari', 'fante')],
        [carta('coppe', 5), carta('spade', 5), carta('bastoni', 'asso'), carta('bastoni', 're'), carta('denari', 'cavallo')],
      ],
      leader: 0,
    });

    const scelto = scelta(state);
    expect(scelto.id).not.toBe('coppe-asso');
    expect(scelto.id).toBe('spade-fante');
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

  it("con asso e cavallo e il re ancora fuori esce dall asso, che il cavallo il re se lo prende", () => {
    // La maniglia e' nel monte, quindi sopra l'asso non gira piu' niente: non
    // c'e' nulla da liberare e il cavallo non e' di comando, il re lo batte.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 'asso'),
          carta(TRIONFO, 'cavallo'),
          carta('coppe', 2),
          carta('denari', 2),
        ],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3), carta('denari', 4)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5), carta('denari', 6)],
      ],
      monte: trionfiNelMonte('asso', 'cavallo', 're', 3),
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    expect(cartaPiuAltaRimasta(vista, TRIONFO)?.id).toBe('bastoni-re');
    expect(scelta(state).id).toBe('bastoni-asso');
  });

  it('con la maniglia in mano esce da una di comando, non dalla scartina di trionfo', () => {
    // 7, asso e 3, e in giro girano ancora re e cavallo: il 3 non prende
    // niente e non libera niente, quindi non esce.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta(TRIONFO, 3), carta('coppe', 2)],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3), carta('denari', 4)],
        [carta('spade', 5), carta('spade', 6), carta('denari', 5), carta('denari', 6)],
      ],
      monte: trionfiNelMonte(7, 'asso', 3, 're', 'cavallo'),
      leader: 0,
    });

    for (const tiro of [0, 0.4, 0.99]) {
      const scelto = scegliCarta(vistaDaStato(state, 0), () => tiro);
      expect(['bastoni-7', 'bastoni-asso']).toContain(scelto.id);
    }
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

  it('con tre trionfi su dieci e avversari carichi non si arrassa: non li finirebbe', () => {
    // Sette trionfi in giro e tre in mano: spesi tutti, agli altri ne
    // resterebbero quattro. Il 7 di trionfo e' firma e la presa la farebbe,
    // ma buttarlo adesso e' bruciare il comando su una presa vuota.
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 7),
          carta(TRIONFO, 'asso'),
          carta(TRIONFO, 6),
          carta('denari', 7),
          carta('denari', 'asso'),
        ],
        [carta('spade', 3), carta('spade', 4), carta('coppe', 3), carta('coppe', 4), carta('coppe', 5)],
        [carta('spade', 5), carta('spade', 6), carta('coppe', 6), carta('coppe', 7), carta('coppe', 2)],
      ],
      monte: [],
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    expect(trionfiAvversariRimasti(vista)).toBe(7);
    expect(trionfiBastanoARipulire(vista)).toBe(false);
    expect(scelta(state).suit).not.toBe(TRIONFO);
  });

  it('con sei trionfi su dieci si arrassa: quelli bastano a finirli', () => {
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
          carta(TRIONFO, 2),
          carta('denari', 7),
        ],
        [carta('spade', 3), carta('spade', 4), carta('coppe', 3), carta('coppe', 4)],
        [carta('spade', 5), carta('spade', 6), carta('coppe', 6), carta('coppe', 7)],
      ],
      monte: [],
      leader: 0,
    });

    const vista = vistaDaStato(state, 0);
    expect(trionfiAvversariRimasti(vista)).toBe(4);
    expect(trionfiBastanoARipulire(vista)).toBe(true);
    expect(scelta(state).suit).toBe(TRIONFO);
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

/**
 * Il difensore non si arrassa. `siArrassa` lo ferma gia' dal tirare due
 * trionfi di fila, ma l'apertura con la maniglia passava da
 * `convieneTirareTrionfo`, che per chi non ha chiamato diceva sempre di si'.
 *
 * I trionfi che non sono in giro stanno in mano al bot: al tavolo di prova
 * il monte il difensore non lo vede, e lasciarli li' li conterebbe come
 * ancora in gioco.
 */
describe('il difensore non si arrassa', () => {
  const DENARI: Suit = 'denari';

  function trionfiInMano(seme: Suit, ...esclusi: Rank[]): Card[] {
    const fuori = new Set<Rank>(esclusi);
    return MAZZO.filter((c) => c.suit === seme && !fuori.has(c.rank));
  }

  it('con la maniglia e due trionfi in giro, senza firme laterali, apre altrove', () => {
    const state = tavolo({
      players: 5,
      trump: DENARI,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(DENARI, 'asso'), carta('coppe', 4), carta('spade', 3)],
        [
          ...trionfiInMano(DENARI, 'asso', 're'),
          carta('coppe', 2),
          carta('coppe', 3),
          carta('spade', 4),
        ],
        [carta(DENARI, 're'), carta('coppe', 5), carta('spade', 5)],
        [carta('coppe', 6), carta('spade', 6), carta('bastoni', 2)],
        [carta('coppe', 'fante'), carta('spade', 'fante'), carta('bastoni', 3)],
      ],
      monte: [],
      leader: 1,
    });

    const vista = vistaDaStato(state, 1);
    expect(trionfiAvversariRimasti(vista)).toBe(2);
    expect(scelta(state).suit).not.toBe(DENARI);
  });

  it('tira la maniglia quando si porta via l ultimo trionfo e ha firme laterali', () => {
    const state = tavolo({
      players: 5,
      trump: DENARI,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(DENARI, 2), carta('spade', 3), carta('bastoni', 2)],
        [...trionfiInMano(DENARI, 2), carta('coppe', 7), carta('coppe', 2)],
        [carta('spade', 4), carta('spade', 5), carta('bastoni', 3)],
        [carta('spade', 6), carta('bastoni', 4), carta('bastoni', 5)],
        [carta('spade', 'fante'), carta('bastoni', 6), carta('bastoni', 'fante')],
      ],
      monte: [],
      leader: 1,
    });

    const vista = vistaDaStato(state, 1);
    expect(trionfiAvversariRimasti(vista)).toBe(1);
    expect(scelta(state).id).toBe('denari-7');
  });

  it('non la tira se si porta via l ultimo ma non ha firme laterali', () => {
    const state = tavolo({
      players: 5,
      trump: DENARI,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(DENARI, 2), carta('coppe', 7), carta('spade', 3)],
        [...trionfiInMano(DENARI, 2), carta('coppe', 2), carta('coppe', 3)],
        [carta('spade', 4), carta('spade', 5), carta('bastoni', 2)],
        [carta('spade', 6), carta('bastoni', 3), carta('bastoni', 4)],
        [carta('spade', 'fante'), carta('bastoni', 5), carta('bastoni', 6)],
      ],
      monte: [],
      leader: 1,
    });

    const vista = vistaDaStato(state, 1);
    expect(trionfiAvversariRimasti(vista)).toBe(1);
    expect(scelta(state).suit).not.toBe(DENARI);
  });

  it('con solo trionfi in mano gioca trionfo: non ha scelta', () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 5), carta(TRIONFO, 2)],
        [carta('coppe', 3), carta('coppe', 4), carta('denari', 3)],
        [carta('coppe', 5), carta('coppe', 6), carta('denari', 5)],
      ],
      monte: [],
      leader: 0,
    });

    expect(scelta(state).suit).toBe(TRIONFO);
  });

  it('all ultima base con un trionfo firma lo gioca', () => {
    const state = tavolo({
      players: 3,
      tricks: 1,
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta('coppe', 2)],
        [carta('coppe', 3), carta('denari', 3)],
        [carta('coppe', 4), carta('denari', 4)],
      ],
      monte: trionfiNelMonte(7),
      leader: 0,
    });

    expect(scelta(state).id).toBe('bastoni-7');
  });

  it('il chiamante con la maniglia continua ad arrassarsi', () => {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta(TRIONFO, 're'), carta('coppe', 2)],
        [carta(TRIONFO, 2), carta('spade', 3), carta('denari', 3)],
        [carta(TRIONFO, 3), carta('spade', 5), carta('denari', 5)],
      ],
      monte: trionfiNelMonte(7, 'asso', 're', 2, 3),
      leader: 0,
    });

    expect(sonoIlChiamante(vistaDaStato(state, 0))).toBe(true);
    expect(trionfiAvversariRimasti(vistaDaStato(state, 0))).toBe(2);
    expect(scelta(state).suit).toBe(TRIONFO);
  });

  it('nel caso reale il difensore non apre piu con la maniglia', () => {
    // A cinque, trionfo denari, quarta base: il difensore ha la maniglia,
    // in giro restano asso e 4, e laterali che non firmano niente. Prima
    // apriva a denari; il chiamante ci metteva il 4 e si liberava di un
    // trionfo scarso senza pagare.
    const state = tavolo({
      players: 5,
      trump: DENARI,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta(DENARI, 'asso'), carta(DENARI, 4), carta('coppe', 4), carta('spade', 2)],
        [
          ...trionfiInMano(DENARI, 'asso', 4),
          carta('coppe', 2),
          carta('coppe', 3),
          carta('spade', 3),
        ],
        [carta('coppe', 5), carta('spade', 5), carta('bastoni', 2), carta('bastoni', 3)],
        [carta('coppe', 6), carta('spade', 6), carta('bastoni', 4), carta('bastoni', 5)],
        [carta('coppe', 'fante'), carta('spade', 'fante'), carta('bastoni', 6), carta('bastoni', 7)],
      ],
      monte: [],
      leader: 1,
    });

    const vista = vistaDaStato(state, 1);
    expect(trionfiAvversariRimasti(vista)).toBe(2);
    expect(scelta(state).id).not.toBe('denari-7');
    expect(scelta(state).suit).not.toBe(DENARI);
  });
});

/**
 * La mano vera da cui vengono le due regole: chiamante a tre, trionfo coppe,
 * sette bastoni in mano. Nella partita ha scartato tre bastoni e un denaro, si
 * e' arrassato con tre trionfi su dieci e ha perso una mano che era vinta.
 */
describe('il caso vero del chiamante con sette bastoni', () => {
  const ALLARGATA = [
    'coppe-7', 'coppe-asso', 'coppe-3', 'coppe-6',
    'denari-7', 'denari-asso', 'denari-6', 'denari-5', 'denari-2',
    'bastoni-re', 'bastoni-cavallo', 'bastoni-fante', 'bastoni-6', 'bastoni-4',
    'bastoni-3', 'bastoni-2',
  ];

  const dalMazzo = (id: string): Card => {
    const trovata = MAZZO.find((c) => c.id === id);
    if (trovata === undefined) throw new Error(`carta inesistente: ${id}`);
    return trovata;
  };

  const scarti = scegliScarti(ALLARGATA.map(dalMazzo), 'coppe', 4, 3);

  it('scarta tre denari e un bastone solo', () => {
    expect(scarti.filter((c) => c.suit === 'denari')).toHaveLength(3);
    expect(scarti.filter((c) => c.suit === 'bastoni')).toHaveLength(1);
    expect(scarti.filter((c) => c.suit === 'coppe')).toHaveLength(0);
  });

  /**
   * La smazzata come si e' giocata: si apre a spade con la maniglia, il
   * chiamante di spade non ne ha e uccide col 3 di coppe. Poi la mano e' sua.
   */
  function dopoLUccisione(): HandState {
    const restano = ALLARGATA.filter((id) => !scarti.some((c) => c.id === id)).map(dalMazzo);
    const state = tavolo({
      players: 3,
      trump: 'coppe',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        restano,
        [
          carta('spade', 7), carta('spade', 'asso'), carta('spade', 're'), carta('spade', 'cavallo'),
          carta('coppe', 're'), carta('coppe', 'fante'), carta('coppe', 5),
          carta('denari', 're'), carta('denari', 'fante'),
          carta('bastoni', 7), carta('bastoni', 'asso'), carta('bastoni', 5),
        ],
        [
          carta('spade', 'fante'), carta('spade', 6), carta('spade', 5), carta('spade', 4),
          carta('spade', 3), carta('spade', 2),
          carta('coppe', 'cavallo'), carta('coppe', 4), carta('coppe', 2),
          carta('denari', 'cavallo'), carta('denari', 4), carta('denari', 3),
        ],
      ],
      monte: scarti,
      leader: 1,
    });
    return giocate(state, [carta('spade', 7), carta('spade', 2)]);
  }

  it('la maniglia di spade la uccide col 3 di coppe, il trionfo piu basso che ha', () => {
    const state = dopoLUccisione();
    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('coppe-3');
  });

  it('e poi non si arrassa: con tre trionfi contro sei non ripulirebbe nessuno', () => {
    const dopo = giocate(dopoLUccisione(), [carta('coppe', 3)]);
    expect(dopo.turn).toBe(0);

    const vista = vistaDaStato(dopo, 0);
    expect(vista.mano.filter((c) => c.suit === 'coppe')).toHaveLength(3);
    expect(trionfiAvversariRimasti(vista)).toBe(6);
    expect(trionfiBastanoARipulire(vista)).toBe(false);
    // Prima usciva col 7 di coppe, che era firma: due giri sprecati e gli
    // avversari ancora col re e col fante.
    expect(scegliCarta(vista, fisso).suit).not.toBe('coppe');
  });
});

/**
 * L'altra mano vera: trionfo bastoni, chiamante al posto 0. Alla sesta presa ha
 * asso e cavallo di trionfo, fuori restano il re e il 3 e la maniglia e' gia'
 * uscita. Nella partita e' aperto col cavallo, il re se l'e' preso, e con il
 * comando se n'e' andata la mano.
 */
describe("il caso vero dell'asso e cavallo alla sesta presa", () => {
  function finoAllaSestaPresa(): HandState {
    const state = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [
          carta(TRIONFO, 'asso'), carta(TRIONFO, 'cavallo'), carta(TRIONFO, 2),
          carta('coppe', 6), carta('coppe', 5), carta('coppe', 4), carta('coppe', 3),
          carta('coppe', 2),
          carta('denari', 7), carta('denari', 4), carta('denari', 3), carta('denari', 2),
        ],
        [
          carta(TRIONFO, 7), carta(TRIONFO, 're'), carta(TRIONFO, 3),
          carta('spade', 7), carta('spade', 'asso'), carta('spade', 're'),
          carta('spade', 'cavallo'), carta('spade', 'fante'),
          carta('denari', 'asso'), carta('denari', 're'), carta('denari', 'cavallo'),
          carta('denari', 'fante'),
        ],
        [
          carta('spade', 6), carta('spade', 5), carta('spade', 4), carta('spade', 3),
          carta('spade', 2),
          carta('coppe', 7), carta('coppe', 'asso'), carta('coppe', 're'),
          carta('coppe', 'cavallo'), carta('coppe', 'fante'),
          carta('denari', 6), carta('denari', 5),
        ],
      ],
      monte: [carta(TRIONFO, 'fante'), carta(TRIONFO, 6), carta(TRIONFO, 5), carta(TRIONFO, 4)],
      leader: 0,
    });

    return giocate(state, [
      // Apre a coppe: il posto 1 di coppe non ne ha e uccide con la maniglia.
      carta('coppe', 2), carta(TRIONFO, 7), carta('coppe', 'fante'),
      // Al giro di denari il chiamante e' obbligato a superare, e la mano torna sua.
      carta('denari', 'asso'), carta('denari', 5), carta('denari', 7),
      carta('denari', 2), carta('denari', 're'), carta('denari', 6),
      carta('denari', 'cavallo'), carta('spade', 3), carta('denari', 3),
      // L'asso di spade vale la pena di ucciderlo, e col 2 di trionfo basta.
      carta('spade', 'asso'), carta('spade', 2), carta(TRIONFO, 2),
    ]);
  }

  it("alla sesta presa apre con l'asso di trionfo, non col cavallo", () => {
    const state = finoAllaSestaPresa();
    expect(state.completedTricks).toHaveLength(5);
    expect(state.turn).toBe(0);

    const vista = vistaDaStato(state, 0);
    expect(vista.mano.filter((c) => c.suit === TRIONFO).map((c) => c.id)).toEqual([
      'bastoni-asso',
      'bastoni-cavallo',
    ]);
    // Fuori restano il re e il 3, la maniglia e' uscita alla seconda presa.
    expect(trionfiRimasti(vista).map((c) => c.id).sort()).toEqual(['bastoni-3', 'bastoni-re']);
    expect(scelta(state).id).toBe('bastoni-asso');
  });

  it("e l'asso il re se lo porta via, cosi' il cavallo resta in mano come firma", () => {
    const dopo = giocate(finoAllaSestaPresa(), [
      carta(TRIONFO, 'asso'),
      carta(TRIONFO, 're'),
      carta('spade', 4),
    ]);
    const vista = vistaDaStato(dopo, 0);
    expect(dopo.completedTricks[5]?.winner).toBe(0);
    expect(trionfiRimasti(vista).map((c) => c.id)).toEqual(['bastoni-3']);
    expect(eFirma(vista, carta(TRIONFO, 'cavallo'))).toBe(true);
    // E dal cavallo si esce: si porta via il 3 e i trionfi degli altri finiscono.
    expect(scelta(dopo).id).toBe('bastoni-cavallo');
  });
});

describe('la presa che se la porta via un avversario', () => {
  it('sotto la maniglia ci va la scartina, mai il cavallo', () => {
    // Il chiamante apre con la maniglia di bastoni: quella presa e' persa
    // comunque, e infilarci il cavallo sono due punti regalati.
    const state = tavolo({
      players: 5,
      trump: 'denari',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta('bastoni', 7), carta('denari', 7), carta('spade', 2), carta('coppe', 2)],
        [carta('bastoni', 2), carta('denari', 2), carta('spade', 3), carta('coppe', 3)],
        [carta('bastoni', 'cavallo'), carta('bastoni', 6), carta('bastoni', 3), carta('coppe', 4)],
        [carta('bastoni', 4), carta('denari', 4), carta('spade', 5), carta('coppe', 5)],
        [carta('bastoni', 5), carta('denari', 5), carta('spade', 6), carta('coppe', 6)],
      ],
      leader: 0,
    });

    const dopo = giocate(state, [carta('bastoni', 7), carta('bastoni', 2)]);
    expect(dopo.turn).toBe(2);
    expect(scelta(dopo).id).toBe('bastoni-3');
  });

  it('preferisce dare la scartina di trionfo che regalare un fante', () => {
    // Presa gia' tagliata dal chiamante col re di trionfo: il 2 di trionfo non
    // la vince e non serve a niente li' dentro, ma vale zero punti. Il conto di
    // quanto una carta serve per dopo conta un trionfo quanto un asso, e da
    // solo faceva pagare un punto pur di tenersi un due.
    const state = tavolo({
      players: 5,
      trump: 'denari',
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [carta('spade', 7), carta('spade', 2), carta('coppe', 2), carta('bastoni', 2)],
        [carta('denari', 're'), carta('coppe', 3), carta('bastoni', 3), carta('bastoni', 4)],
        [carta('denari', 2), carta('coppe', 'fante'), carta('coppe', 're'), carta('coppe', 'cavallo')],
        [carta('spade', 4), carta('coppe', 6), carta('bastoni', 6), carta('bastoni', 7)],
        [carta('spade', 5), carta('coppe', 5), carta('bastoni', 'asso'), carta('bastoni', 're')],
      ],
      leader: 0,
    });

    const dopo = giocate(state, [carta('spade', 7), carta('denari', 're')]);
    expect(dopo.turn).toBe(2);
    expect(scelta(dopo).id).toBe('denari-2');
  });
});

/**
 * La smazzata vera, presa dal registro: cinque giocatori, trionfo denari, il
 * chiamante al posto 1 con la carta scoperta che era il 2 di denari.
 *
 * Come e' andata al tavolo: prese le cinque carte del monte, il chiamante ha
 * mandato via cavallo e fante di spade tenendosi l'asso solo, e si e' tenuto
 * l'asso di coppe che il suo 7 non ce l'aveva. Alla quarta presa ci ha aperto,
 * e il 7 di coppe se l'e' portato via con dentro quattro punti. Ha chiuso a 31.
 *
 * Le mani sono quelle distribuite, copiate dal registro: quello che il bot fa
 * qui e' quello che avrebbe fatto lui, seduto a quel tavolo.
 */
describe('il caso vero del monte a cinque, dal registro', () => {
  const allargata = [
    carta('denari', 'asso'), carta('denari', 're'), carta('denari', 3), carta('denari', 2),
    carta('spade', 'asso'), carta('spade', 'cavallo'), carta('spade', 'fante'), carta('spade', 2),
    carta('coppe', 'asso'), carta('coppe', 'fante'),
    carta('bastoni', 7), carta('bastoni', 2),
  ];

  const scarti = scegliScarti(allargata, 'denari', 5, 5);
  const restano = allargata.filter((c) => !scarti.some((s) => s.id === c.id));

  function tavoloVero(): HandState {
    return tavolo({
      players: 5,
      trump: 'denari',
      alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
      mani: [
        [
          carta('denari', 'cavallo'), carta('denari', 'fante'), carta('denari', 7),
          carta('denari', 6), carta('spade', 're'), carta('spade', 4), carta('bastoni', 'asso'),
        ],
        restano,
        [
          carta('denari', 5), carta('coppe', 're'), carta('coppe', 6), carta('coppe', 5),
          carta('coppe', 4), carta('bastoni', 're'), carta('bastoni', 'cavallo'),
        ],
        [
          carta('coppe', 7), carta('spade', 7), carta('spade', 5), carta('spade', 3),
          carta('bastoni', 'fante'), carta('bastoni', 6), carta('bastoni', 3),
        ],
        [
          carta('denari', 4), carta('coppe', 'cavallo'), carta('coppe', 3), carta('coppe', 2),
          carta('spade', 6), carta('bastoni', 5), carta('bastoni', 4),
        ],
      ],
      monte: scarti,
      leader: 1,
    });
  }

  /** La smazzata giocata dal bot a ogni posto, fino all'inizio della presa. */
  function finoAllaPresa(numero: number): HandState {
    let state = tavoloVero();
    while (state.completedTricks.length < numero - 1) {
      state = playCard(state, state.turn, scelta(state).id);
    }
    return state;
  }

  it("manda nel monte l'asso di coppe spelato e tiene la catena delle spade", () => {
    const ids = scarti.map((c) => c.id);
    expect(ids).toHaveLength(5);
    // Quattro punti nel monte sono tanti, ma quell'asso al tavolo non ne vale
    // nemmeno uno: il 7 di coppe ce l'ha il posto 3.
    expect(ids).toContain('coppe-asso');
    expect(ids).not.toContain('spade-cavallo');
    expect(ids).not.toContain('spade-asso');
    expect(ids).not.toContain('bastoni-7');
  });

  it('apre con la maniglia di bastoni, e il difensore ci mette il cavallo perche altro non ha', () => {
    const state = tavoloVero();
    expect(state.turn).toBe(1);
    expect(scelta(state).id).toBe('bastoni-7');

    // Al posto 2 di bastoni sono rimasti il re e il cavallo: rispondere a seme
    // e' obbligo, e il cavallo e' il regalo piu' piccolo dei due. Al tavolo era
    // sembrato un errore del difensore, e invece non aveva altro.
    const dopo = giocate(state, [carta('bastoni', 7)]);
    expect(dopo.turn).toBe(2);
    expect(scelta(dopo).id).toBe('bastoni-cavallo');
  });

  it("alla quarta presa esce con la scartina di trionfo, non con l'asso di spade", () => {
    const state = finoAllaPresa(4);
    expect(state.turn).toBe(1);

    // Fuori dal trionfo gli resta il solo asso di spade, e il 7 di spade gira
    // ancora: aprirci sopra sono quattro punti regalati. Il 2 di trionfo invece
    // non ne vale nessuno, e tira fuori la maniglia dei denari.
    const vista = vistaDaStato(state, 1);
    expect(cartaPiuAltaRimasta(vista, 'spade')?.id).toBe('spade-7');
    expect(scelta(state).id).toBe('denari-2');
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

/**
 * La protezione del re terzo vale in qualunque palo. Sulla presa gia' vinta
 * dal compagno non si butta ne' il re ne' le scartine che lo tengono in
 * piedi: si carica solo cio' che non e' piu' una presa futura.
 */
describe('la protezione nei pali laterali', () => {
  /**
   * Tre giocatori, trionfo spade. Il chiamante apre a bastoni, il posto 1
   * ci mette la maniglia: la presa e' dei difensori. Il bot al posto 2
   * deve ancora giocare.
   */
  function manigliaDelCompagnoABastoni(manoDelBot: Card[]): HandState {
    const state = tavolo({
      players: 3,
      trump: 'spade',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        [carta('bastoni', 'fante'), carta('spade', 2), carta('coppe', 2), carta('denari', 2)],
        [carta('bastoni', 7), carta('spade', 3), carta('coppe', 3), carta('denari', 3)],
        manoDelBot,
      ],
      leader: 0,
    });
    return giocate(state, [carta('bastoni', 'fante'), carta('bastoni', 7)]);
  }

  it('re terzo laterale, presa del compagno: butta la scartina, non il re', () => {
    const state = manigliaDelCompagnoABastoni([
      carta('bastoni', 're'),
      carta('bastoni', 6),
      carta('bastoni', 4),
      carta('coppe', 4),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-6');
  });

  it('re secondo con asso e maniglia in giro: il re cade, si puo caricare', () => {
    // La maniglia e l'asso di bastoni sono ancora fuori: una scartina sola
    // non salva il re, e quei tre punti stanno meglio sulla presa del
    // compagno. Il compagno vince a coppe, il bot e' privo e sceglie.
    const state = giocate(
      tavolo({
        players: 3,
        trump: 'spade',
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [carta('coppe', 2), carta('spade', 2), carta('denari', 2)],
          [carta('coppe', 7), carta('spade', 3), carta('denari', 3)],
          [carta('bastoni', 're'), carta('bastoni', 4), carta('denari', 4), carta('denari', 5)],
        ],
        leader: 0,
      }),
      [carta('coppe', 2), carta('coppe', 7)],
    );
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-re');
  });

  it('maniglia e asso dello stesso palo: carica la maniglia, l asso resta', () => {
    const state = manigliaDelCompagnoABastoni([
      carta('coppe', 7),
      carta('coppe', 'asso'),
      carta('denari', 2),
      carta('denari', 3),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('coppe-7');
  });

  it('carta alta sola nel suo palo: non si carica', () => {
    const state = manigliaDelCompagnoABastoni([
      carta('coppe', 7),
      carta('denari', 2),
      carta('denari', 3),
      carta('spade', 4),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('denari-2');
  });

  it('re solo nel suo palo: non si carica, anche se sopra girano asso e maniglia', () => {
    const state = manigliaDelCompagnoABastoni([
      carta('coppe', 're'),
      carta('denari', 2),
      carta('denari', 3),
      carta('spade', 4),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('denari-2');
  });

  it('nel caso reale il difensore butta il 6 e non il re', () => {
    // Chiamante apre col fante di bastoni per stanare la maniglia. Il
    // compagno ci e' obbligato e la mette: presa fatta. Il bot ha re, 6 e
    // 4 di bastoni. La maniglia e' gia' uscita, sopra il re resta solo
    // l'asso: una scartina basta, il 6 e' di troppo e ci va quello.
    const state = manigliaDelCompagnoABastoni([
      carta('bastoni', 're'),
      carta('bastoni', 6),
      carta('bastoni', 4),
    ]);
    expect(state.turn).toBe(2);
    expect(scelta(state).id).toBe('bastoni-6');
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

/**
 * Privo del palo aperto, sulla presa sicura del compagno: si carica solo
 * una carta che non e' piu' una presa futura. Dietro un'altra che comanda
 * non basta, se quella che si butta e' ancora protetta dalle sue scartine.
 */
describe('privo del palo, carica sul compagno', () => {
  /**
   * Quattro, chiamante al 2. Il posto 1 apre con la maniglia di coppe, il
   * chiamante ci va liscio, il 3 mette una coppa: il bot al 0 e' privo di
   * coppe e gioca per ultimo, la presa del compagno e' fatta.
   */
  function presaSicuraDelCompagno(manoDelBot: Card[]): HandState {
    const state = tavolo({
      players: 4,
      alliance: { kind: 'monte', caller: 2, chiamata: 'normale' },
      mani: [
        manoDelBot,
        [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
        [carta('coppe', 6), carta('coppe', 2), carta(TRIONFO, 'asso'), carta('denari', 3)],
        [carta('coppe', 4), carta('coppe', 5), carta('spade', 3), carta('denari', 5)],
      ],
      leader: 1,
    });
    return giocate(state, [carta('coppe', 7), carta('coppe', 6), carta('coppe', 4)]);
  }

  it('carica la maniglia quando dietro resta l asso dello stesso palo', () => {
    const state = presaSicuraDelCompagno([
      carta(TRIONFO, 5),
      carta('spade', 7),
      carta('spade', 'asso'),
      carta('denari', 2),
    ]);
    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('spade-7');
  });

  it('scarta liscio quando la carta alta e sola nel suo palo', () => {
    const state = presaSicuraDelCompagno([
      carta(TRIONFO, 5),
      carta('spade', 7),
      carta('denari', 2),
      carta('denari', 3),
    ]);
    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('denari-2');
  });

  it('scarta liscio quando la presa del compagno e ancora in bilico', () => {
    // Stessa maniglia e asso, ma il bot gioca secondo: dietro restano il
    // chiamante e un altro, la presa non e' ancora di nessuno.
    const state = giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 3, chiamata: 'normale' },
        mani: [
          [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
          [carta(TRIONFO, 5), carta('spade', 7), carta('spade', 'asso'), carta('denari', 2)],
          [carta('coppe', 6), carta('coppe', 2), carta('spade', 5), carta('denari', 3)],
          [carta('coppe', 4), carta('coppe', 5), carta(TRIONFO, 'asso'), carta('denari', 5)],
        ],
        leader: 0,
      }),
      [carta('coppe', 7)],
    );

    expect(state.turn).toBe(1);
    const scelto = scelta(state);
    expect(scelto.suit).not.toBe(TRIONFO);
    expect(cardPoints(scelto.rank)).toBe(0);
  });

  it("sulla presa dell avversario non carica: butta la scartina", () => {
    // La maniglia di coppe la gioca il chiamante: quella presa e' persa, e
    // la maniglia di spade resta in mano.
    const state = giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 7), carta('spade', 'asso'), carta('denari', 2), carta('denari', 3)],
          [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
          [carta('coppe', 6), carta('coppe', 2), carta(TRIONFO, 'asso'), carta('denari', 5)],
          [carta('coppe', 4), carta('coppe', 5), carta('spade', 3), carta('denari', 6)],
        ],
        leader: 1,
      }),
      [carta('coppe', 7), carta('coppe', 6), carta('coppe', 4)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('denari-2');
  });

  it('nel caso reale i tre avversari caricano invece di scartare', () => {
    // A cinque, sola, trionfo coppe. Il 7 e l'asso sono gia' usciti: resta
    // solo il re, e sta a un avversario. Il chiamante apre col 2, gli restano
    // zero carte, e i tre in mezzo — tutti privi di coppe — vedono che la
    // presa e' del compagno per forza.
    const state = giocate(
      tavolo({
        players: 5,
        trump: 'coppe',
        alliance: { kind: 'monte', caller: 0, chiamata: 'sola' },
        mani: [
          [carta('coppe', 7), carta('coppe', 'asso'), carta('coppe', 2)],
          [carta('coppe', 6), carta('coppe', 'fante'), carta('spade', 're'), carta('spade', 4)],
          [carta('coppe', 'cavallo'), carta('coppe', 5), carta('bastoni', 're'), carta('bastoni', 4)],
          [carta('denari', 5), carta('denari', 6), carta('denari', 're'), carta('denari', 4)],
          [carta('coppe', 3), carta('coppe', 4), carta('coppe', 're'), carta('denari', 2)],
        ],
        monte: [],
        leader: 0,
      }),
      [
        carta('coppe', 7),
        carta('coppe', 6),
        carta('coppe', 'cavallo'),
        carta('denari', 5),
        carta('coppe', 3),
        carta('coppe', 'asso'),
        carta('coppe', 'fante'),
        carta('coppe', 5),
        carta('denari', 6),
        carta('coppe', 4),
      ],
    );

    expect(state.turn).toBe(0);
    const dopoIlDue = giocate(state, [carta('coppe', 2)]);
    expect(dopoIlDue.turn).toBe(1);
    expect(scelta(dopoIlDue).id).toBe('spade-re');

    const dopoIlPrimo = giocate(dopoIlDue, [carta('spade', 're')]);
    expect(dopoIlPrimo.turn).toBe(2);
    expect(scelta(dopoIlPrimo).id).toBe('bastoni-re');

    const dopoIlSecondo = giocate(dopoIlPrimo, [carta('bastoni', 're')]);
    expect(dopoIlSecondo.turn).toBe(3);
    expect(scelta(dopoIlSecondo).id).toBe('denari-re');
  });
});

/**
 * Il compagno non si uccide.
 *
 * Il caso vero, a quattro con trionfo bastoni: un difensore apre con la
 * maniglia di coppe, il chiamante ci va liscio — e da li' la presa e' degli
 * avversari del chiamante — e l'ultimo difensore, privo di coppe, ci uccide
 * sopra col 5 di trionfo. La presa era gia' della sua parte e nessuno dietro
 * poteva togliergliela: trionfo buttato e punti non caricati.
 */
describe('la presa che sta vincendo il compagno', () => {
  /**
   * Quattro giocatori, chiamante al posto 2. Apre il posto 1 con la maniglia
   * di coppe, il chiamante risponde liscio, il posto 3 mette una coppa: il bot
   * sta al posto 0, di coppe non ne ha, e gioca per ultimo.
   */
  function manigliaDelCompagno(manoDelBot: Card[]): HandState {
    const state = tavolo({
      players: 4,
      alliance: { kind: 'monte', caller: 2, chiamata: 'normale' },
      mani: [
        manoDelBot,
        [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
        [carta('coppe', 6), carta('coppe', 2), carta(TRIONFO, 'asso'), carta('denari', 3)],
        [carta('coppe', 4), carta('coppe', 5), carta('spade', 3), carta('denari', 5)],
      ],
      leader: 1,
    });
    return giocate(state, [carta('coppe', 7), carta('coppe', 6), carta('coppe', 4)]);
  }

  it('ultimo a giocare, ci carica i punti invece di ucciderci sopra', () => {
    const state = manigliaDelCompagno([
      carta(TRIONFO, 5),
      carta('spade', 're'),
      carta('spade', 4),
      carta('denari', 6),
    ]);
    expect(state.turn).toBe(0);
    // Sopra il re di spade girano ancora asso e 7: caricarlo non promuove
    // niente a nessuno, e quei tre punti se li porta a casa il compagno.
    expect(scelta(state).id).toBe('spade-re');
  });

  it("il caso vero: in mano solo carte grosse e un trionfo, e il trionfo resta li'", () => {
    // Era da qui che usciva: nessuna di quelle grosse si carica volentieri, e
    // fra le altre il conto di quanto costa perderle dava il trionfo come la
    // carta piu' a buon mercato. Ma quella presa era gia' vinta.
    const state = manigliaDelCompagno([
      carta(TRIONFO, 5),
      carta('spade', 'asso'),
      carta('spade', 7),
      carta('denari', 7),
    ]);
    expect(state.turn).toBe(0);
    expect(scelta(state).id).not.toBe('bastoni-5');
  });

  it("con qualcuno ancora dietro non uccide e nemmeno carica: butta la scartina", () => {
    // Stessa maniglia del compagno, ma il bot gioca secondo: dietro restano il
    // chiamante e l'altro difensore. La sua comanda gia' il palo, quindi
    // l'unico modo di perderla e' un taglio — e un taglio non si ferma
    // tagliandoci sopra, si spende solo un trionfo di piu'.
    const state = giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 3, chiamata: 'normale' },
        mani: [
          [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
          [carta(TRIONFO, 5), carta('spade', 're'), carta('spade', 4), carta('denari', 6)],
          [carta('coppe', 6), carta('coppe', 2), carta('spade', 5), carta('denari', 3)],
          [carta('coppe', 4), carta('coppe', 5), carta(TRIONFO, 'asso'), carta('denari', 5)],
        ],
        leader: 0,
      }),
      [carta('coppe', 7)],
    );

    expect(state.turn).toBe(1);
    const scelto = scelta(state);
    expect(scelto.suit).not.toBe(TRIONFO);
    expect(cardPoints(scelto.rank)).toBe(0);
  });

  it('sulla presa di un avversario invece uccide come prima', () => {
    // Stessa forma, ma la maniglia di coppe la gioca il chiamante: quella
    // presa e' da strappare, e il trionfo li' dentro ci va.
    const state = giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta(TRIONFO, 5), carta('spade', 're'), carta('spade', 4), carta('denari', 6)],
          [carta('coppe', 7), carta('coppe', 3), carta('spade', 2), carta('denari', 4)],
          [carta('coppe', 6), carta('coppe', 2), carta(TRIONFO, 'asso'), carta('denari', 3)],
          [carta('coppe', 4), carta('coppe', 5), carta('spade', 3), carta('denari', 5)],
        ],
        leader: 1,
      }),
      [carta('coppe', 7), carta('coppe', 6), carta('coppe', 4)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('bastoni-5');
  });
});

/**
 * Aprire in un palo laterale dove si ha una catena. Il metro e' quello del
 * trionfo: comanda chi batte la piu' alta ancora in giro di quel palo, non
 * chi e' piu' alta in mano. Cambia solo il palo, la regola e' la stessa.
 */
describe('la catena di un palo laterale', () => {
  /**
   * Quattro giocatori, chiamante al posto 0. Nella prima presa il posto 1
   * apre a spade e se la porta via, nella seconda esce a coppe e la prende il
   * chiamante: alla terza apre lui, e le spade alte gia' uscite le sa.
   */
  function apreLaTerza(mani: Card[][], prime: Card[]): HandState {
    return giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani,
        leader: 1,
      }),
      prime,
    );
  }

  it("con asso e cavallo e il re ancora in giro esce dall'asso", () => {
    // Il 7 di spade e' uscito nella prima presa: sopra l'asso non gira piu'
    // niente, e allora e' l'asso a comandare. Uscendo dal cavallo se lo
    // porterebbe via il re, e l'asso resterebbe li' da solo.
    const state = apreLaTerza(
      [
        [
          carta('spade', 2),
          carta('coppe', 'asso'),
          carta('spade', 'asso'),
          carta('spade', 'cavallo'),
          carta(TRIONFO, 2),
        ],
        [carta('spade', 7), carta('coppe', 2), carta('spade', 4), carta(TRIONFO, 4), carta('coppe', 3)],
        [
          carta('spade', 5),
          carta('coppe', 6),
          carta('spade', 're'),
          carta(TRIONFO, 5),
          carta('coppe', 'fante'),
        ],
        [carta('spade', 6), carta('coppe', 5), carta('spade', 3), carta(TRIONFO, 6), carta('coppe', 4)],
      ],
      [
        carta('spade', 7),
        carta('spade', 5),
        carta('spade', 6),
        carta('spade', 2),
        carta('coppe', 2),
        carta('coppe', 6),
        carta('coppe', 5),
        carta('coppe', 'asso'),
      ],
    );

    expect(state.turn).toBe(0);
    expect(cartaPiuAltaRimasta(vistaDaStato(state, 0), 'spade')?.id).toBe('spade-re');
    expect(scelta(state).id).toBe('spade-asso');
  });

  it('con cavallo e fante e sopra il solo re, sacrifica il fante', () => {
    // Maniglia e asso di spade sono passati nella prima presa: sopra la catena
    // resta il re e basta. Nessuna delle due comanda, quindi si tira la piu'
    // bassa perche' il re se la prenda, e il cavallo resta a comandare il palo.
    const state = apreLaTerza(
      [
        [
          carta('spade', 2),
          carta('coppe', 'asso'),
          carta('spade', 'cavallo'),
          carta('spade', 'fante'),
          carta(TRIONFO, 2),
        ],
        [carta('spade', 7), carta('coppe', 2), carta('spade', 4), carta(TRIONFO, 4), carta('coppe', 3)],
        [
          carta('spade', 'asso'),
          carta('coppe', 6),
          carta('spade', 're'),
          carta(TRIONFO, 5),
          carta('coppe', 'fante'),
        ],
        [carta('spade', 3), carta('coppe', 5), carta('spade', 5), carta(TRIONFO, 6), carta('coppe', 4)],
      ],
      [
        carta('spade', 7),
        carta('spade', 'asso'),
        carta('spade', 3),
        carta('spade', 2),
        carta('coppe', 2),
        carta('coppe', 6),
        carta('coppe', 5),
        carta('coppe', 'asso'),
      ],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('spade-fante');
  });

  it("con cavallo e fante e sopra ancora asso, re e maniglia, apre altrove", () => {
    // Qui non comanda niente e non c'e' niente da liberare: tirare una spade
    // vuol dire solo pagare. Si esce dalla scartina di coppe, che non paga.
    const state = giocate(
      tavolo({
        players: 4,
        alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
        mani: [
          [
            carta('coppe', 'asso'),
            carta('spade', 'cavallo'),
            carta('spade', 'fante'),
            carta('coppe', 2),
            carta(TRIONFO, 2),
          ],
          [carta('coppe', 3), carta('spade', 7), carta('spade', 4), carta(TRIONFO, 4), carta('coppe', 4)],
          [
            carta('coppe', 6),
            carta('spade', 'asso'),
            carta('spade', 're'),
            carta(TRIONFO, 5),
            carta('coppe', 'fante'),
          ],
          [carta('coppe', 5), carta('spade', 3), carta('spade', 5), carta(TRIONFO, 6), carta('spade', 6)],
        ],
        leader: 1,
      }),
      [carta('coppe', 3), carta('coppe', 6), carta('coppe', 5), carta('coppe', 'asso')],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).id).toBe('coppe-2');
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

/**
 * I difensori devono far uccidere il chiamante: insistere nel palo gia'
 * aperto se ha risposto a seme, e aprire dove e' piu' probabilmente corto.
 */
describe('il difensore fa uccidere il chiamante', () => {
  const COPPE: Suit = 'coppe';

  it('apre a spade, il chiamante risponde a seme, alla base dopo riapre a spade', () => {
    const state = giocate(
      tavolo({
        players: 3,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 7), carta('spade', 3), carta('denari', 're')],
          [carta('spade', 4), carta(COPPE, 2), carta('bastoni', 2)],
          [carta('spade', 5), carta(COPPE, 3), carta('bastoni', 3)],
        ],
        leader: 0,
      }),
      [carta('spade', 7), carta('spade', 4), carta('spade', 5)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).suit).toBe('spade');
  });

  it('se ha aperto il compagno e il chiamante ha risposto, continua lui a spade', () => {
    const state = giocate(
      tavolo({
        players: 3,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 7), carta('spade', 3), carta('denari', 're')],
          [carta('spade', 4), carta(COPPE, 2), carta('bastoni', 2)],
          [carta('spade', 2), carta(COPPE, 3), carta('bastoni', 3)],
        ],
        leader: 2,
      }),
      [carta('spade', 2), carta('spade', 7), carta('spade', 4)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).suit).toBe('spade');
  });

  it('se il chiamante ha tagliato la prima base, non insiste in quel palo', () => {
    const state = giocate(
      tavolo({
        players: 4,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 7), carta('denari', 'asso'), carta('spade', 'fante'), carta('spade', 3), carta('bastoni', 2)],
          [carta(COPPE, 5), carta('denari', 4), carta('bastoni', 4), carta('bastoni', 5), carta('bastoni', 6)],
          [carta('spade', 2), carta('denari', 3), carta(COPPE, 2), carta('bastoni', 7), carta('bastoni', 'asso')],
          [carta('spade', 5), carta('denari', 5), carta(COPPE, 3), carta('bastoni', 're'), carta('bastoni', 'cavallo')],
        ],
        leader: 0,
      }),
      [
        carta('spade', 7),
        carta(COPPE, 5),
        carta('spade', 2),
        carta('spade', 5),
        carta('denari', 4),
        carta('denari', 3),
        carta('denari', 5),
        carta('denari', 'asso'),
      ],
    );

    expect(state.turn).toBe(0);
    expect(eSemeFinito(vistaDaStato(state, 0), 1, 'spade')).toBe(true);
    expect(scelta(state).suit).not.toBe('spade');
  });

  it('senza piu carte di quel palo apre dove il chiamante e piu probabilmente corto', () => {
    // Due giri di denari a tre: sei carte uscite, il chiamante e' corto.
    // Il bot non ha piu' spade da insistere, e fra denari e bastoni deve
    // riaprire a denari.
    const state = giocate(
      tavolo({
        players: 3,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('denari', 2), carta('denari', 3), carta('denari', 5), carta(COPPE, 7), carta('bastoni', 2)],
          [carta('denari', 4), carta('denari', 6), carta(COPPE, 4), carta('bastoni', 3), carta('bastoni', 4)],
          [carta('denari', 7), carta('denari', 'asso'), carta(COPPE, 2), carta(COPPE, 3), carta('bastoni', 5)],
        ],
        leader: 2,
      }),
      [
        carta('denari', 7),
        carta('denari', 2),
        carta('denari', 4),
        carta('denari', 'asso'),
        carta('denari', 3),
        carta('denari', 6),
        carta(COPPE, 2),
        carta(COPPE, 7),
        carta(COPPE, 4),
      ],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).suit).toBe('denari');
  });

  it('se il chiamante e vuoto e ha ancora molti trionfi, non insiste', () => {
    const state = giocate(
      tavolo({
        players: 4,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 2), carta('denari', 'asso'), carta('spade', 'fante'), carta('bastoni', 2), carta('bastoni', 3)],
          [carta(COPPE, 3), carta('denari', 4), carta(COPPE, 4), carta(COPPE, 5), carta(COPPE, 6)],
          [carta('spade', 7), carta('denari', 3), carta(COPPE, 2), carta('bastoni', 4), carta('bastoni', 5)],
          [carta('spade', 5), carta('denari', 5), carta('denari', 6), carta('bastoni', 6), carta('bastoni', 7)],
        ],
        leader: 2,
      }),
      [
        carta('spade', 7),
        carta('spade', 5),
        carta('spade', 2),
        carta(COPPE, 3),
        carta('denari', 4),
        carta('denari', 3),
        carta('denari', 5),
        carta('denari', 'asso'),
      ],
    );

    expect(state.turn).toBe(0);
    const vista = vistaDaStato(state, 0);
    expect(eSemeFinito(vista, 1, 'spade')).toBe(true);
    expect(Math.min(trionfiRimasti(vista).length, vista.carteInMano[1] ?? 0)).toBeGreaterThanOrEqual(
      3,
    );
    expect(scelta(state).suit).not.toBe('spade');
  });

  it('nel caso reale, alla seconda base il difensore riapre a spade', () => {
    // A quattro, trionfo coppe. Il difensore apre con la maniglia di
    // spade, il chiamante risponde col 4: ha spade e non puo' tagliare.
    // Restano fante, 3 e 6 di spade e il re di denari. Deve insistere
    // a spade, non cambiare palo.
    const state = giocate(
      tavolo({
        players: 4,
        trump: COPPE,
        alliance: { kind: 'monte', caller: 1, chiamata: 'normale' },
        mani: [
          [carta('spade', 7), carta('spade', 'fante'), carta('spade', 3), carta('spade', 6), carta('denari', 're')],
          [carta('spade', 4), carta(COPPE, 2), carta('denari', 2), carta('bastoni', 2), carta('bastoni', 3)],
          [carta('spade', 5), carta(COPPE, 3), carta('denari', 3), carta('bastoni', 4), carta('bastoni', 5)],
          [carta('spade', 2), carta(COPPE, 4), carta('denari', 4), carta('bastoni', 6), carta('bastoni', 'fante')],
        ],
        leader: 0,
      }),
      [carta('spade', 7), carta('spade', 4), carta('spade', 5), carta('spade', 2)],
    );

    expect(state.turn).toBe(0);
    expect(scelta(state).suit).toBe('spade');
    expect(scelta(state).id).not.toBe('denari-re');
  });
});

describe('a 5 con l amico', () => {
  const CHIAMATA = carta('coppe', 7);

  function tavoloAmico(args: {
    caller: number;
    friend: number | null;
    leader: number;
    mani: Card[][];
    calledCard?: string;
  }): HandState {
    const chiamata = args.calledCard ?? CHIAMATA.id;
    return tavolo({
      players: 5,
      variant: 'amico',
      alliance:
        args.friend === null
          ? { kind: 'amico', caller: args.caller, calledCard: chiamata, friend: null }
          : { kind: 'amico', caller: args.caller, calledCard: chiamata, friend: args.friend },
      mani: args.mani,
      monte: [],
      leader: args.leader,
    });
  }

  const treTrionfi = [
    carta(TRIONFO, 7),
    carta(TRIONFO, 'asso'),
    carta(TRIONFO, 6),
    carta('denari', 7),
    carta('denari', 'asso'),
  ];

  it('il chiamante con trionfi si arrassa dalle prime basi, dove a 3 e a 5 monte no', () => {
    const aTre = tavolo({
      players: 3,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        treTrionfi,
        [carta('spade', 3), carta('spade', 4), carta('coppe', 3), carta('coppe', 4), carta('coppe', 5)],
        [carta('spade', 5), carta('spade', 6), carta('coppe', 6), carta('coppe', 2), carta('denari', 2)],
      ],
      monte: [],
      leader: 0,
    });
    expect(trionfiAvversariRimasti(vistaDaStato(aTre, 0))).toBe(7);
    expect(trionfiBastanoARipulire(vistaDaStato(aTre, 0))).toBe(false);
    expect(scelta(aTre).suit).not.toBe(TRIONFO);

    const aCinqueMonte = tavolo({
      players: 5,
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      mani: [
        treTrionfi,
        [carta('spade', 3), carta('spade', 4), carta('coppe', 3)],
        [carta('spade', 5), carta('coppe', 2), carta('denari', 2)],
        [carta('spade', 6), carta('coppe', 4), carta('denari', 3)],
        [carta('spade', 2), carta('coppe', 5), carta('denari', 4)],
      ],
      monte: [],
      leader: 0,
    });
    expect(trionfiBastanoARipulire(vistaDaStato(aCinqueMonte, 0))).toBe(false);
    expect(scelta(aCinqueMonte).suit).not.toBe(TRIONFO);

    const aCinqueAmico = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 0,
      mani: [
        treTrionfi,
        [carta('spade', 3), carta('spade', 4), carta('coppe', 3)],
        [CHIAMATA, carta('spade', 5), carta('denari', 2)],
        [carta('spade', 6), carta('coppe', 2), carta('denari', 3)],
        [carta('spade', 2), carta('coppe', 4), carta('denari', 4)],
      ],
    });
    expect(trionfiAvversariRimasti(vistaDaStato(aCinqueAmico, 0))).toBe(7);
    expect(trionfiBastanoARipulire(vistaDaStato(aCinqueAmico, 0))).toBe(true);
    expect(scelta(aCinqueAmico).suit).toBe(TRIONFO);
  });

  it('l amico nascosto apre la prima volta a trionfo, senza scoprirsi', () => {
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('denari', 2)],
        [carta('spade', 3), carta('spade', 4), carta('denari', 3)],
        [CHIAMATA, carta(TRIONFO, 3), carta('denari', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 2), carta('denari', 5)],
        [carta('spade', 2), carta('coppe', 3), carta('denari', 6)],
      ],
    });
    const vista = vistaDaStato(state, 2);
    expect(sonoLAmicoNascosto(vista)).toBe(true);
    expect(scelta(state).suit).toBe(TRIONFO);
    expect(scelta(state).id).toBe('bastoni-3');
    expect(scelta(state).id).not.toBe(CHIAMATA.id);
  });

  it('l amico nascosto apre la seconda volta normalmente, senza tirare trionfo', () => {
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      mani: [
        [carta('denari', 2), carta('spade', 2), carta('coppe', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 3)],
        [CHIAMATA, carta(TRIONFO, 3), carta(TRIONFO, 5), carta('denari', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 4), carta('denari', 5)],
        [carta('spade', 'fante'), carta('coppe', 5), carta('denari', 6)],
      ],
    });
    const dopo = giocate(state, [
      carta(TRIONFO, 3),
      carta('spade', 6),
      carta('spade', 'fante'),
      carta('denari', 2),
      carta('spade', 3),
    ]);
    expect(dopo.turn).toBe(2);
    expect(sonoLAmicoNascosto(vistaDaStato(dopo, 2))).toBe(true);
    expect(scelta(dopo).suit).not.toBe(TRIONFO);
  });

  it('l amico nascosto senza trionfi apre normalmente', () => {
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('denari', 2)],
        [carta('spade', 3), carta(TRIONFO, 3), carta('denari', 3)],
        [CHIAMATA, carta('denari', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 2), carta('denari', 5)],
        [carta('spade', 2), carta('coppe', 3), carta('denari', 6)],
      ],
    });
    expect(sonoLAmicoNascosto(vistaDaStato(state, 2))).toBe(true);
    expect(scelta(state).suit).not.toBe(TRIONFO);
    expect(['coppe-7', 'denari-4', 'spade-5']).toContain(scelta(state).id);
  });

  it('l amico con la maniglia di trionfo chiamata la gioca appena ha la mano', () => {
    const maniglia = carta(TRIONFO, 7);
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      calledCard: maniglia.id,
      mani: [
        [carta(TRIONFO, 'asso'), carta('denari', 2), carta('spade', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 2)],
        [maniglia, carta(TRIONFO, 3), carta('denari', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 3), carta('denari', 5)],
        [carta('spade', 'fante'), carta('coppe', 4), carta('denari', 6)],
      ],
    });
    expect(sonoLAmicoNascosto(vistaDaStato(state, 2))).toBe(true);
    expect(scelta(state).id).toBe(maniglia.id);
  });

  it('dopo la maniglia di trionfo, con scartina e nessun palo vuoto, passa la mano', () => {
    const maniglia = carta(TRIONFO, 7);
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      calledCard: maniglia.id,
      mani: [
        [carta('denari', 2), carta('spade', 2), carta('coppe', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 3)],
        [maniglia, carta(TRIONFO, 3), carta('denari', 4), carta('coppe', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 5), carta('denari', 5)],
        [carta('spade', 'fante'), carta('coppe', 6), carta('denari', 6)],
      ],
    });
    const dopo = giocate(state, [
      maniglia,
      carta('spade', 6),
      carta('spade', 'fante'),
      carta('denari', 2),
      carta('spade', 3),
    ]);
    expect(dopo.turn).toBe(2);
    expect(sonoLAmicoNascosto(vistaDaStato(dopo, 2))).toBe(false);
    expect(scelta(dopo).id).toBe('bastoni-3');
  });

  it('dopo la maniglia di trionfo, vuoto di un palo, tiene la scartina per uccidere', () => {
    const maniglia = carta(TRIONFO, 7);
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 2,
      calledCard: maniglia.id,
      mani: [
        [carta('denari', 2), carta('spade', 2), carta('coppe', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 3)],
        [maniglia, carta(TRIONFO, 3), carta('denari', 4), carta('denari', 5), carta('coppe', 4)],
        [carta('spade', 6), carta('coppe', 5), carta('denari', 6)],
        [carta('spade', 'fante'), carta('coppe', 6), carta('spade', 4)],
      ],
    });
    const dopo = giocate(state, [
      maniglia,
      carta('spade', 6),
      carta('spade', 'fante'),
      carta('denari', 2),
      carta('spade', 3),
    ]);
    expect(dopo.turn).toBe(2);
    expect(scelta(dopo).suit).not.toBe(TRIONFO);
  });

  it('dopo la rivelazione l amico non tira piu trionfo per passare la mano', () => {
    const state = tavoloAmico({
      caller: 0,
      friend: 2,
      leader: 2,
      mani: [
        [carta(TRIONFO, 're'), carta('denari', 2), carta('spade', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 2)],
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('denari', 4), carta('spade', 5)],
        [carta('spade', 6), carta('coppe', 3), carta('denari', 5)],
        [carta('coppe', 4), carta('coppe', 5), carta('denari', 6)],
      ],
    });
    expect(sonoLAmicoNascosto(vistaDaStato(state, 2))).toBe(false);
    expect(scelta(state).suit).not.toBe(TRIONFO);
  });

  it('un avversario qualsiasi non cambia comportamento', () => {
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 3,
      mani: [
        [carta(TRIONFO, 7), carta('denari', 2), carta('spade', 2)],
        [carta('spade', 3), carta('denari', 3), carta('coppe', 2)],
        [CHIAMATA, carta('denari', 4), carta('spade', 5)],
        [carta(TRIONFO, 'asso'), carta(TRIONFO, 3), carta('denari', 5), carta('spade', 6)],
        [carta('coppe', 3), carta('coppe', 4), carta('denari', 6)],
      ],
    });
    expect(sonoLAmicoNascosto(vistaDaStato(state, 3))).toBe(false);
    expect(scelta(state).suit).not.toBe(TRIONFO);
  });

  it('il difensore con un solo trionfo e carte alte non apre a trionfo', () => {
    // Le laterali sono tutte a punti e non comandano il palo: il ramo
    // che brucia la scartina di trionfo al posto dell'asso secco e' del
    // chiamante. Il difensore quel trionfo lo tiene per uccidere.
    const state = tavoloAmico({
      caller: 0,
      friend: null,
      leader: 3,
      mani: [
        [carta(TRIONFO, 7), carta(TRIONFO, 'asso'), carta('spade', 7), carta('denari', 2)],
        [carta('spade', 3), carta('denari', 3), carta('denari', 7), carta('coppe', 2)],
        [CHIAMATA, carta('spade', 5), carta('denari', 4)],
        [
          carta(TRIONFO, 5),
          carta('coppe', 'asso'),
          carta('coppe', 're'),
          carta('spade', 'asso'),
          carta('denari', 're'),
        ],
        [carta('spade', 2), carta('coppe', 3), carta('denari', 6)],
      ],
    });
    const vista = vistaDaStato(state, 3);
    expect(sonoLAmicoNascosto(vista)).toBe(false);
    expect(vista.mano.filter((carta) => carta.suit === TRIONFO)).toHaveLength(1);
    expect(scelta(state).suit).not.toBe(TRIONFO);
  });

  it('nel caso reale il difensore apre a spade, non col suo unico trionfo', () => {
    // A 5 amico, trionfo denari, quarta base. Il posto 3 ha quattro
    // spade — maniglia e asso compresi — e il 5 di denari. I trionfi
    // in giro sono ancora tre. Prima apriva a denari; il chiamante
    // ci metteva il re e si portava via l'unico coltello della difesa.
    const DENARI: Suit = 'denari';
    const mani = [
      [
        carta('coppe', 7), carta(DENARI, 2), carta('coppe', 6), carta('bastoni', 2),
        carta('bastoni', 're'), carta('coppe', 'cavallo'), carta('coppe', 5), carta('coppe', 4),
      ],
      [
        carta('bastoni', 4), carta('coppe', 3), carta('bastoni', 6), carta(DENARI, 're'),
        carta('bastoni', 'cavallo'), carta('spade', 3), carta(DENARI, 7), carta(DENARI, 'asso'),
      ],
      [
        carta('spade', 're'), carta('spade', 2), carta(DENARI, 6), carta(DENARI, 'cavallo'),
        carta('coppe', 'fante'), carta('bastoni', 7), carta('bastoni', 3), carta('coppe', 'asso'),
      ],
      [
        carta(DENARI, 3), carta(DENARI, 4), carta('bastoni', 5), carta('spade', 7),
        carta('spade', 'cavallo'), carta('spade', 'asso'), carta('spade', 6), carta(DENARI, 5),
      ],
      [
        carta(DENARI, 'fante'), carta('spade', 4), carta('bastoni', 'asso'), carta('coppe', 're'),
        carta('spade', 'fante'), carta('spade', 5), carta('coppe', 2), carta('bastoni', 'fante'),
      ],
    ];
    const inizio = tavolo({
      players: 5,
      variant: 'amico',
      trump: DENARI,
      alliance: { kind: 'amico', caller: 1, calledCard: 'bastoni-7', friend: null },
      mani,
      monte: [],
      leader: 2,
    });
    const state = giocate(inizio, [
      carta(DENARI, 6), carta(DENARI, 3), carta(DENARI, 'fante'), carta(DENARI, 2), carta(DENARI, 7),
      carta('bastoni', 'cavallo'), carta('bastoni', 7), carta('bastoni', 5),
      carta('bastoni', 'fante'), carta('bastoni', 2),
      carta('bastoni', 3), carta(DENARI, 4), carta('bastoni', 'asso'),
      carta('bastoni', 're'), carta('bastoni', 4),
    ]);
    expect(state.turn).toBe(3);
    expect(state.alliance.kind === 'amico' ? state.alliance.friend : null).toBe(2);
    const vista = vistaDaStato(state, 3);
    expect(sonoLAmicoNascosto(vista)).toBe(false);
    expect(trionfiAvversariRimasti(vista)).toBe(3);
    expect(vista.mano.map((carta) => carta.id).sort()).toEqual(
      ['denari-5', 'spade-6', 'spade-7', 'spade-asso', 'spade-cavallo'].sort(),
    );
    expect(scelta(state).suit).toBe('spade');
    expect(scelta(state).id).not.toBe('denari-5');
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
