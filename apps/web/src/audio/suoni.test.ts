import type { TipoChiamata } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import type { Ricetta, Suono, Voce } from './suoni';
import { SUONI, conRespiro, suonoDellaChiamata } from './suoni';

const NOMI = Object.keys(SUONI) as Suono[];

function voci(nome: Suono): readonly Voce[] {
  const ricetta: Ricetta = SUONI[nome];
  return ricetta.tipo === 'sintetizzato' ? ricetta.voci : [];
}

/** Quanto dura tutto il suono, l'ultima voce compresa. */
function durata(nome: Suono): number {
  return Math.max(...voci(nome).map((voce) => (voce.ritardo ?? 0) + voce.durata));
}

/** Quanto pesa: e' cosi' che si distingue una cosa grossa da una di servizio. */
function pienezza(nome: Suono): number {
  return voci(nome).reduce((somma, voce) => somma + voce.volume * voce.durata, 0);
}

describe('catalogo dei suoni', () => {
  it('ogni evento del tavolo ha la sua ricetta', () => {
    // Il tipo lo garantisce gia', ma un nome aggiunto e mai riempito
    // passerebbe: qui si vede.
    expect(NOMI.length).toBeGreaterThan(0);
    for (const nome of NOMI) {
      expect(voci(nome).length, nome).toBeGreaterThan(0);
    }
  });

  it('sono tutti brevi e tenuti sotto il fondo scala', () => {
    for (const nome of NOMI) {
      expect(durata(nome), nome).toBeLessThanOrEqual(0.8);
      for (const voce of voci(nome)) {
        expect(voce.durata, nome).toBeGreaterThan(0);
        expect(voce.volume, nome).toBeGreaterThan(0);
        expect(voce.volume, nome).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('le cose che contano suonano piu piene di quelle di servizio', () => {
    expect(pienezza('cappotto')).toBeGreaterThan(pienezza('baseVinta'));
    expect(pienezza('uccisione')).toBeGreaterThan(pienezza('cartaGiocata'));
    expect(pienezza('baseVinta')).toBeGreaterThan(pienezza('contoAllaRovescia'));
    expect(pienezza('toccaATe')).toBeLessThan(pienezza('amicoScoperto'));
  });

  it('entrare al tavolo pesa piu di una scelta del setup', () => {
    // Il tocco della scelta e' la cosa piu' leggera del catalogo, che al setup
    // se ne fanno tante di fila; entrare al tavolo si sente una volta sola.
    expect(pienezza('vaiAlTavolo')).toBeGreaterThan(pienezza('scelta'));
    expect(pienezza('scelta')).toBeLessThan(pienezza('cartaGiocata'));
    expect(durata('scelta')).toBeLessThan(durata('vaiAlTavolo'));
  });

  it('confermare lo scarto pesa piu di toccare una carta', () => {
    // Quattro o cinque tocchi di fila restano il tocco del setup; la
    // conferma, come entrare al tavolo, si sente una volta sola.
    expect(pienezza('scartoConfermato')).toBeGreaterThan(pienezza('scelta'));
    expect(durata('scartoConfermato')).toBeGreaterThan(durata('scelta'));
  });

  it('il passo sta sotto qualunque dichiarazione', () => {
    // Passare e' lasciar correre: si sente, perche' e' cosi' che si capisce
    // che il giro va avanti, ma non dichiara niente e non deve sembrare che
    // lo faccia.
    const dichiarazioni: TipoChiamata[] = ['normale', 'sola', 'colonna', 'chiSeLaSente'];
    for (const chiamata of dichiarazioni) {
      const dichiarazione = suonoDellaChiamata(chiamata);
      expect(pienezza('passo'), chiamata).toBeLessThan(pienezza(dichiarazione));
      expect(durata('passo'), chiamata).toBeLessThan(durata(dichiarazione));
    }
    // Chi se la sente senza nessuno che si faccia avanti e' un passo di tutti:
    // stessa famiglia, piu' basso e piu' lungo, perche' li' il giro si spegne.
    const solo = (nome: Suono): Voce => voci(nome)[0] as Voce;
    expect(solo('nessunoSeLaSente').hz).toBeLessThan(solo('passo').hz);
    expect(pienezza('nessunoSeLaSente')).toBeLessThan(pienezza('meLaSento'));
  });

  it('nessun suono nasce dove un altoparlantino non lo restituisce', () => {
    // Un altoparlante di telefono sotto i quattrocento hertz non rende quasi
    // niente. Una sinusoide bassa non ha nient'altro da farsi sentire e
    // sparisce: e' quello che era capitato al passo, che partiva sempre e non
    // si sentiva mai. Le altre onde portano le loro armoniche piu' su, e sono
    // quelle a passare — quindi la nota bassa si puo' tenere, ma non liscia.
    const PIU_GRAVE_UDIBILE = 350;
    const portante = (voce: Voce): number =>
      voce.forma === 'fruscio' || (voce.onda ?? 'sine') === 'sine' ? voce.hz : voce.hz * 3;
    for (const nome of NOMI) {
      const piuAlta = Math.max(...voci(nome).map(portante));
      expect(piuAlta, nome).toBeGreaterThanOrEqual(PIU_GRAVE_UDIBILE);
    }
  });

  it('la chiusura scende, mentre la base vinta e il cappotto salgono', () => {
    // E' quello che la distingue dalle altre due: si chiude, non si festeggia.
    const scende = voci('smazzataChiusa');
    const prima = scende[0] as Voce;
    const ultima = scende[scende.length - 1] as Voce;
    expect(ultima.hz).toBeLessThan(prima.hz);
    for (const nome of ['baseVinta', 'cappotto'] as const) {
      const salgono = voci(nome);
      expect((salgono[salgono.length - 1] as Voce).hz).toBeGreaterThan((salgono[0] as Voce).hz);
    }
    // E non e' una fanfara: il cappotto resta l'unica cosa che festeggia.
    expect(pienezza('smazzataChiusa')).toBeLessThan(pienezza('cappotto'));
  });

  it('piu sale la posta piu la dichiarazione si sente', () => {
    const scala: TipoChiamata[] = ['normale', 'sola', 'colonna', 'chiSeLaSente'];
    const pesi = scala.map((chiamata) => pienezza(suonoDellaChiamata(chiamata)));
    expect(pesi).toEqual([...pesi].sort((a, b) => a - b));
    // E ognuna e' una voce diversa: quattro dichiarazioni, quattro suoni.
    expect(new Set(scala.map(suonoDellaChiamata)).size).toBe(4);
  });

  it('la carta appoggiata e l uccisione non si somigliano', () => {
    expect(SUONI.cartaGiocata).not.toEqual(SUONI.uccisione);
    // Il taglio e' piu' secco: finisce in un soffio, non si trascina.
    expect(durata('uccisione')).toBeLessThan(durata('cappotto'));
  });

  it('la carta che si distribuisce sta dentro il suo volo, e pesa meno di una giocata', () => {
    // Comincia e finisce col volo della carta: a 120ms l'una, un soffio piu'
    // lungo si accavallerebbe col successivo.
    expect(durata('cartaDistribuita')).toBeLessThanOrEqual(0.12);
    // Trentasei di fila: piu' leggera di una carta appoggiata in partita, che
    // di volte se ne sente una alla volta.
    expect(pienezza('cartaDistribuita')).toBeLessThan(pienezza('cartaGiocata'));
  });
});

describe('il respiro dei colpi in fila', () => {
  const voce = voci('cartaDistribuita')[0] as Voce;

  it('la carta che si distribuisce respira, le altre no', () => {
    expect(voce.respiro).toBeGreaterThan(0);
    for (const nome of NOMI.filter((altro) => altro !== 'cartaDistribuita')) {
      for (const altra of voci(nome)) expect(altra.respiro, nome).toBeUndefined();
    }
  });

  it('lo stesso colpo suona sempre uguale', () => {
    expect(conRespiro(voce, 7)).toEqual(conRespiro(voce, 7));
  });

  it('due carte di fila non suonano uguali', () => {
    const giro = [1, 2, 3, 4, 5, 6, 7, 8].map((colpo) => conRespiro(voce, colpo));
    expect(new Set(giro.map((c) => c.hz)).size).toBe(giro.length);
    for (let i = 1; i < giro.length; i += 1) {
      expect(giro[i]?.hz).not.toBe(giro[i - 1]?.hz);
      expect(giro[i]?.volume).not.toBe(giro[i - 1]?.volume);
    }
  });

  it('lo scarto resta dentro il respiro dichiarato', () => {
    const respiro = voce.respiro ?? 0;
    for (let colpo = 1; colpo <= 60; colpo += 1) {
      const { hz, volume } = conRespiro(voce, colpo);
      expect(Math.abs(hz / voce.hz - 1)).toBeLessThanOrEqual(respiro);
      expect(Math.abs(volume / voce.volume - 1)).toBeLessThanOrEqual(respiro);
    }
  });

  it('senza il numero del colpo resta la voce del catalogo', () => {
    expect(conRespiro(voce, undefined)).toEqual({ hz: voce.hz, volume: voce.volume });
  });
});
