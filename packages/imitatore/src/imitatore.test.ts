import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scegliCarta, vistaDaStato } from '@mediatore/bot';
import type { Card, Rank, Suit } from '@mediatore/engine';
import { createDeck, createHandState, createRng, tableConfig } from '@mediatore/engine';
import { describe, expect, it } from 'vitest';
import { imparaDaConfronti } from './impara.ts';
import { correzionePer, imitatoreDa, ruoloDellaVista, scegliCartaImitando } from './scegli.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';
import { MINIMO_CASI, SOGLIA_COERENZA, SOGLIA_DELTA } from './soglie.ts';
import type { Confronto, Correzione } from './tipi.ts';

const MAZZO = createDeck();

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

function legge(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

function confronto(
  ruolo: Confronto['ruolo'],
  situazione: string,
  azioneUmano: string,
  azioneBot: string,
): Confronto {
  return {
    ruolo,
    situazione,
    azioneUmano,
    azioneBot,
    accordo: azioneUmano === azioneBot,
    esempio: {
      seed: 1,
      tavolo: '3 monte',
      presa: 1,
      mano: [],
      inTavola: [],
      umano: azioneUmano,
      bot: azioneBot,
    },
  };
}

function tanti(
  n: number,
  ruolo: Confronto['ruolo'],
  situazione: string,
  azioneUmano: string,
  azioneBot: string,
): Confronto[] {
  return Array.from({ length: n }, () => confronto(ruolo, situazione, azioneUmano, azioneBot));
}

const CORREZIONE: Correzione = {
  ruolo: 'liscio',
  situazione: 'apro la presa',
  azione: 'esce di trionfo',
  casi: 10,
  quotaUmano: 0.8,
  quotaBot: 0.2,
  frase: 'prova',
};

function vistaCheApre(): ReturnType<typeof vistaDaStato> {
  const state = createHandState({
    config: tableConfig(3, 'monte'),
    dealer: 0,
    trump: 'coppe',
    alliance: { kind: 'liscio' },
    hands: [
      [carta('denari', 2), carta('coppe', 3)],
      [carta('denari', 3), carta('coppe', 2)],
      [carta('denari', 're'), carta('coppe', 4)],
    ],
    monte: [],
    leader: 1,
  });
  return vistaDaStato(state, 1);
}

describe('le soglie restano prudenti', () => {
  it('sotto il minimo di casi non impara', () => {
    const { correzioni, scartati } = imparaDaConfronti(
      tanti(MINIMO_CASI - 1, 'difensore', 'presa del compagno, potevo vincerla', 'prende', 'scarta'),
    );
    expect(correzioni).toHaveLength(0);
    expect(scartati[0]?.motivo).toBe('pochi');
  });

  it('se l umano e incoerente non impara', () => {
    const meta = Math.floor(MINIMO_CASI / 2);
    const casi = [
      ...tanti(meta, 'difensore', 'apro la presa', 'esce di trionfo', 'esce'),
      ...tanti(MINIMO_CASI - meta, 'difensore', 'apro la presa', 'esce', 'esce'),
    ];
    const { correzioni, scartati } = imparaDaConfronti(casi);
    expect(correzioni).toHaveLength(0);
    expect(scartati[0]?.motivo).toBe('incoerente');
  });

  it('se l umano fa come il bot non impara', () => {
    const { correzioni, scartati } = imparaDaConfronti(
      tanti(MINIMO_CASI, 'chiamante', 'apro la presa', 'esce di trionfo', 'esce di trionfo'),
    );
    expect(correzioni).toHaveLength(0);
    expect(scartati[0]?.motivo).toBe('come il bot');
  });

  it('impara anche se la maggioranza coincide, purché lo scarto sia netto', () => {
    const casi = [
      ...tanti(4, 'difensore', 'presa del compagno, potevo vincerla', 'prende', 'prende'),
      ...tanti(2, 'difensore', 'presa del compagno, potevo vincerla', 'prende', 'scarta'),
      ...tanti(2, 'difensore', 'presa del compagno, potevo vincerla', 'scarta', 'scarta'),
    ];
    const { correzioni } = imparaDaConfronti(casi);
    expect(correzioni).toHaveLength(1);
    expect(correzioni[0]?.azione).toBe('prende');
    expect(correzioni[0]?.quotaUmano).toBeCloseTo(0.75);
    expect(correzioni[0]?.quotaBot).toBeCloseTo(0.5);
  });

  it('impara solo se la differenza e netta e ripetuta', () => {
    const umani = Math.ceil(MINIMO_CASI * SOGLIA_COERENZA);
    const casi = [
      ...tanti(umani, 'difensore', 'presa del compagno, potevo vincerla', 'prende', 'scarta'),
      ...tanti(MINIMO_CASI - umani, 'difensore', 'presa del compagno, potevo vincerla', 'scarta', 'scarta'),
    ];
    const { correzioni } = imparaDaConfronti(casi);
    expect(correzioni).toHaveLength(1);
    const imparata = correzioni[0];
    if (imparata === undefined) throw new Error('manca la correzione');
    expect(imparata.azione).toBe('prende');
    expect(imparata.casi).toBe(MINIMO_CASI);
    expect(imparata.quotaUmano - imparata.quotaBot).toBeGreaterThanOrEqual(SOGLIA_DELTA - 1e-9);
    expect(imparata.frase).toMatch(/da difensore/);
    expect(imparata.frase).toMatch(/prende/);
  });
});

describe('la correzione si applica sopra le regole di serie', () => {
  it('senza correzioni gioca come il bot di serie', () => {
    const vista = vistaCheApre();
    const rng = createRng(3);
    const diSerie = scegliCarta(vista, createRng(3));
    expect(scegliCartaImitando(vista, rng, []).id).toBe(diSerie.id);
  });

  it('se ha imparato un azione e c e una carta che la fa, la gioca', () => {
    const vista = vistaCheApre();
    expect(ruoloDellaVista(vista)).toBe('liscio');
    expect(correzionePer(vista, [CORREZIONE])?.azione).toBe('esce di trionfo');
    const scelta = scegliCartaImitando(vista, createRng(3), [CORREZIONE]);
    expect(scelta.suit).toBe('coppe');
  });

  it('se in mano non c e l azione imparata, resta la scelta di serie', () => {
    const vista = vistaCheApre();
    const impossibile: Correzione = { ...CORREZIONE, azione: 'taglia' };
    const rng = createRng(5);
    const diSerie = scegliCarta(vista, createRng(5));
    expect(scegliCartaImitando(vista, rng, [impossibile]).id).toBe(diSerie.id);
  });

  it('chiude una smazzata contro il bot di serie', () => {
    const tavolo = TAVOLI[0];
    if (tavolo === undefined) throw new Error('manca il tavolo a tre');
    const imita = imitatoreDa([CORREZIONE]);
    const esito = giocaSmazzata({
      tavolo,
      dealer: 0,
      seed: 11,
      scegli: [imita, scegliCarta, scegliCarta],
    });
    expect(esito.quote).toHaveLength(3);
    expect(esito.quote.reduce((n, q) => n + q, 0)).toBe(0);
  });
});

describe('la casualita passa dall rng', () => {
  it('il sorgente non chiama Math.random', () => {
    for (const file of [
      './confronta.ts',
      './impara.ts',
      './scegli.ts',
      './smazzata.ts',
      './sfida.ts',
      './situazioni.ts',
    ]) {
      expect(legge(file)).not.toMatch(/Math\.random/);
    }
  });
});
