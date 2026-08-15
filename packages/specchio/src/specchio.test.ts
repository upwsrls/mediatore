import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidiChiamata, vistaDaStato } from '@mediatore/bot';
import type { Card } from '@mediatore/engine';
import {
  createDeck,
  createHandState,
  createRng,
  deal,
  legalPlaysFor,
  playCard,
  tableConfig,
} from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { confrontaSmazzata, confrontaTutte, ruoloVero } from './confronta.ts';
import { differenzaNetta, giudizio, raggruppa, stampaRapporto } from './rapporto.ts';
import { avvia } from './specchio.ts';
import { azioneDellaGiocata, situazioneDellaGiocata } from './situazioni.ts';
import type { Confronto, Smazzata } from './tipi.ts';

const MAZZO = createDeck();

function carta(id: string): Card {
  const trovata = MAZZO.find((c) => c.id === id);
  if (trovata === undefined) throw new Error(`manca ${id}`);
  return trovata;
}

function smazzataLiscio(carteScoperte = false, postoUmano: number | null = 1): Smazzata {
  const config = tableConfig(3, 'monte');
  const dealt = deal(config, 0, createRng(1));
  const order = [1, 2, 0];
  const decisioni: Smazzata['decisioni'] = order.map((seat, indice) => ({
    tipo: 'chiamata' as const,
    giocatore: seat,
    mano: (dealt.hands[seat] ?? []).map((c) => c.id),
    trionfo: dealt.trump,
    giocatori: 3,
    scelta: 'passo' as const,
    giaPassati: order.slice(0, indice),
    msPerDecidere: 0,
  }));
  const state = createHandState({
    config,
    dealer: 0,
    trump: dealt.trump,
    alliance: { kind: 'liscio' },
    hands: dealt.hands,
    monte: dealt.monte,
    leader: 1,
  });
  const prima = legalPlaysFor(state, 1)[0];
  if (prima === undefined) throw new Error('manca la prima legale');
  decisioni.push({
    tipo: 'giocata',
    giocatore: 1,
    ruolo: 'liscio',
    presa: 1,
    mano: (state.hands[1] ?? []).map((c) => c.id),
    legali: legalPlaysFor(state, 1).map((c) => c.id),
    scelta: prima.id,
    inTavola: [],
    staVincendo: null,
    puntiFinora: [0, 0, 0],
    msPerDecidere: 0,
  });
  return {
    seed: 1,
    giocatori: 3,
    variante: 'monte',
    mazziere: 0,
    trionfo: dealt.trump,
    scoperta: dealt.monte[dealt.monte.length - 1]?.id ?? null,
    maniIniziali: dealt.hands.map((mano) => mano.map((c) => c.id)),
    monteIniziale: dealt.monte.map((c) => c.id),
    controBot: true,
    postoUmano,
    carteScoperte,
    chiamante: null,
    chiamata: null,
    cartaDellAmico: null,
    amicoScoperto: null,
    decisioni,
  };
}

function confronto(pezzi: Partial<Confronto> & Pick<Confronto, 'situazione' | 'azioneUmano' | 'azioneBot'>): Confronto {
  return {
    ruolo: 'difensore',
    accordo: pezzi.azioneUmano === pezzi.azioneBot,
    esempio: {
      seed: 1,
      tavolo: '3 monte',
      presa: 2,
      mano: ['coppe-7'],
      inTavola: ['denari-2 (posto 0)'],
      umano: pezzi.azioneUmano,
      bot: pezzi.azioneBot,
    },
    ...pezzi,
  };
}

describe('le situazioni della giocata', () => {
  it('distingue chi sta vincendo e se si poteva prendere', () => {
    const state = createHandState({
      config: tableConfig(3, 'monte'),
      dealer: 0,
      trump: 'coppe',
      alliance: { kind: 'liscio' },
      hands: [
        [carta('denari-2'), carta('coppe-3')],
        [carta('denari-3'), carta('coppe-4')],
        [carta('denari-re'), carta('coppe-7')],
      ],
      monte: [],
      leader: 0,
    });
    const dopo = playCard(playCard(state, 0, 'denari-2'), 1, 'denari-3');
    const vista = vistaDaStato(dopo, 2);
    expect(situazioneDellaGiocata(vista)).toBe("presa dell'avversario, potevo vincerla");
    expect(azioneDellaGiocata(vista, carta('denari-re'))).toBe('prende');
    expect(azioneDellaGiocata(vista, carta('coppe-7'))).toBe('prende');
  });

  it('vede il compagno e il carico quando si e privi del palo', () => {
    const state = createHandState({
      config: tableConfig(3, 'monte'),
      dealer: 0,
      trump: 'coppe',
      alliance: { kind: 'monte', caller: 0, chiamata: 'normale' },
      hands: [
        [carta('denari-2'), carta('coppe-3')],
        [carta('denari-re'), carta('coppe-4')],
        [carta('bastoni-asso'), carta('spade-2')],
      ],
      monte: [],
      leader: 1,
    });
    const dopo = playCard(state, 1, 'denari-re');
    const vista = vistaDaStato(dopo, 2);
    expect(situazioneDellaGiocata(vista)).toBe('privo del palo, presa del compagno');
    expect(azioneDellaGiocata(vista, carta('bastoni-asso'))).toBe('carica');
    expect(azioneDellaGiocata(vista, carta('spade-2'))).toBe('scarta');
  });
});

describe('il confronto con il bot', () => {
  it('salta le smazzate a carte scoperte', () => {
    expect(confrontaSmazzata(smazzataLiscio(true))).toEqual([]);
    const tutte = confrontaTutte([smazzataLiscio(true), smazzataLiscio(false)]);
    expect(tutte.saltateScoperte).toBe(1);
    expect(tutte.smazzateViste).toBe(1);
    expect(tutte.confronti.length).toBeGreaterThan(0);
  });

  it('confronta solo le decisioni dell umano', () => {
    const confronti = confrontaSmazzata(smazzataLiscio(false, 1));
    expect(confronti.every((c) => c.esempio.seed === 1)).toBe(true);
    expect(confronti.some((c) => c.situazione.startsWith('chiamata'))).toBe(true);
    expect(confronti.some((c) => c.situazione === 'apro la presa')).toBe(true);
    const soloAltri = confrontaSmazzata(smazzataLiscio(false, 0));
    expect(soloAltri.some((c) => c.situazione === 'apro la presa')).toBe(false);
  });

  it('il ruolo vero non mescola liscio e difensore', () => {
    const smazzata = smazzataLiscio();
    expect(ruoloVero(smazzata, 1)).toBe('liscio');
    expect(
      ruoloVero({ ...smazzata, chiamante: 0, chiamata: 'normale', amicoScoperto: 2 }, 2),
    ).toBe('amico');
    expect(
      ruoloVero({ ...smazzata, chiamante: 0, chiamata: 'normale', amicoScoperto: 2 }, 1),
    ).toBe('difensore');
  });

  it('sulla chiamata dice la stessa cosa del bot di serie', () => {
    const smazzata = smazzataLiscio(false, 1);
    const chiamata = smazzata.decisioni.find((d) => d.tipo === 'chiamata' && d.giocatore === 1);
    if (chiamata === undefined || chiamata.tipo !== 'chiamata') throw new Error('manca la chiamata');
    const delBot = decidiChiamata(
      {
        mano: chiamata.mano.map(carta),
        trump: chiamata.trionfo,
        scoperta: smazzata.scoperta === null ? null : carta(smazzata.scoperta),
      },
      tableConfig(3, 'monte'),
    );
    const confronti = confrontaSmazzata(smazzata);
    const visto = confronti.find((c) => c.situazione.startsWith('chiamata'));
    expect(visto?.azioneBot).toBe(delBot === 'chiama' ? 'chiama' : 'passo');
  });
});

describe('il rapporto', () => {
  it('ordina i gruppi per numero di casi e separa i ruoli', () => {
    const gruppi = raggruppa([
      confronto({ ruolo: 'chiamante', situazione: 'apro la presa', azioneUmano: 'esce', azioneBot: 'esce' }),
      confronto({
        ruolo: 'difensore',
        situazione: "presa dell'avversario, potevo vincerla",
        azioneUmano: 'prende',
        azioneBot: 'prende',
      }),
      confronto({
        ruolo: 'difensore',
        situazione: "presa dell'avversario, potevo vincerla",
        azioneUmano: 'prende',
        azioneBot: 'scarta',
      }),
    ]);
    expect(gruppi[0]?.situazione).toBe("presa dell'avversario, potevo vincerla");
    expect(gruppi[0]?.casi).toHaveLength(2);
    expect(gruppi.map((g) => g.ruolo)).toContain('chiamante');
  });

  it('racconta la differenza quando l umano e il bot non fanno la stessa cosa', () => {
    const casi = Array.from({ length: 10 }, (_, i) =>
      confronto({
        situazione: "presa dell'avversario, potevo vincerla",
        azioneUmano: 'prende',
        azioneBot: i < 3 ? 'prende' : 'scarta',
      }),
    );
    const gruppo = raggruppa(casi)[0];
    if (gruppo === undefined) throw new Error('manca il gruppo');
    expect(differenzaNetta(gruppo)).toBe(true);
    expect(giudizio(gruppo)).toMatch(/umano prende/);
  });

  it('stampa un rapporto leggibile, non un elenco di casi', () => {
    const confronti = Array.from({ length: 8 }, () =>
      confronto({
        ruolo: 'difensore',
        situazione: 'privo del palo, presa del compagno',
        azioneUmano: 'carica',
        azioneBot: 'scarta',
      }),
    );
    const testo = stampaRapporto({
      confronti,
      file: 1,
      smazzateViste: 3,
      saltateScoperte: 1,
    });
    expect(testo).toMatch(/DIFENSORE/);
    expect(testo).toMatch(/privo del palo, presa del compagno: 8 volte/);
    expect(testo).toMatch(/umano carica 8, bot carica 0/);
    expect(testo).toMatch(/-> /);
    expect(testo).toMatch(/es\. seed/);
    expect(testo).toMatch(/ACCORDO/);
    expect(testo).toMatch(/difensore/);
    expect(testo).toMatch(/saltate 1 a carte scoperte/);
  });
});

describe('la lettura da cartella', () => {
  it('legge i fogli e salta le scoperte', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'specchio-'));
    try {
      writeFileSync(
        join(cartella, 'una.json'),
        JSON.stringify({
          versione: 1,
          sessioneIniziata: '2026-08-15T19:31:00.000Z',
          smazzate: [smazzataLiscio(false), smazzataLiscio(true)],
        }),
      );
      const testo = avvia(cartella);
      expect(testo).toMatch(/1 file/);
      expect(testo).toMatch(/1 smazzata/);
      expect(testo).toMatch(/saltate 1 a carte scoperte/);
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  });
});
