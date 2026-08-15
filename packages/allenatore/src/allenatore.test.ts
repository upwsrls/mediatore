import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Card, Rank, Suit } from '@mediatore/engine';
import { createDeck, createHandState, tableConfig } from '@mediatore/engine';
import { vistaDaStato } from '@mediatore/bot';
import { describe, expect, it } from 'vitest';
import { giocaControllandoLaVista, misuraAccordo } from './accordo.ts';
import { NOMI, PAROLE, caratteristiche } from './caratteristiche.ts';
import { caricaCheckpoint, checkpointVuoto, percorsoDeiMigliori, salvaCheckpoint } from './checkpoint.ts';
import { PESI_INIZIALI, sonoPesi } from './pesi.ts';
import { gradienteDellaSmazzata, premioDellaMossa } from './gradiente.ts';
import { scegliCartaPesata } from './scegli.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

const MAZZO = createDeck();

function carta(suit: Suit, rank: Rank): Card {
  const trovata = MAZZO.find((c) => c.suit === suit && c.rank === rank);
  if (trovata === undefined) throw new Error(`carta inesistente: ${suit}-${rank}`);
  return trovata;
}

function legge(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

describe('le caratteristiche nascono solo dalla vista', () => {
  it('il sorgente non tocca lo stato intero ne le mani altrui', () => {
    const testo = legge('./caratteristiche.ts');
    expect(testo).not.toMatch(/HandState/);
    expect(testo).not.toMatch(/\.hands\b/);
  });

  it('scegliCartaPesata riceve la vista, non lo stato', () => {
    const testo = legge('./scegli.ts');
    expect(testo).not.toMatch(/HandState/);
    expect(testo).toMatch(/VistaDelBot/);
  });

  it('ogni posto, giocando, riceve la vista e nient altro', () => {
    giocaControllandoLaVista((vista, rng) => {
      expect(vista).toHaveProperty('mano');
      expect(vista).toHaveProperty('legali');
      expect(vista).toHaveProperty('io');
      expect(vista).not.toHaveProperty('hands');
      return scegliCartaPesata(vista, PESI_INIZIALI, rng);
    });
  });

  it('scambiare le carte nascoste degli altri non cambia i numeri', () => {
    const config = tableConfig(3, 'monte');
    const comuni = {
      config,
      dealer: 0,
      trump: 'spade' as const,
      alliance: { kind: 'monte' as const, caller: 0, chiamata: 'normale' as const },
      monte: [] as Card[],
      leader: 0,
    };
    const mia = [
      carta('bastoni', 're'),
      carta('bastoni', 6),
      carta('bastoni', 4),
      carta('coppe', 2),
    ];
    const stateA = createHandState({
      ...comuni,
      hands: [
        mia,
        [carta('coppe', 'asso'), carta('denari', 3)],
        [carta('coppe', 5), carta('denari', 7)],
      ],
    });
    const stateB = createHandState({
      ...comuni,
      hands: [
        mia,
        [carta('coppe', 5), carta('denari', 7)],
        [carta('coppe', 'asso'), carta('denari', 3)],
      ],
    });

    const vistaA = vistaDaStato(stateA, 0);
    const vistaB = vistaDaStato(stateB, 0);
    expect(vistaA.mano.map((c) => c.id)).toEqual(vistaB.mano.map((c) => c.id));
    expect(vistaA).not.toHaveProperty('hands');

    for (const legale of vistaA.legali) {
      expect(caratteristiche(vistaA, legale)).toEqual(caratteristiche(vistaB, legale));
    }
  });
});

describe('i pesi', () => {
  it('hanno un numero per ogni caratteristica, e ogni caratteristica ha una parola', () => {
    expect(sonoPesi(PESI_INIZIALI)).toBe(true);
    for (const nome of NOMI) {
      expect(PAROLE[nome].length).toBeGreaterThan(8);
      expect(Number.isFinite(PESI_INIZIALI[nome])).toBe(true);
    }
  });

  it('il checkpoint si rilegge uguale', () => {
    const percorso = join(tmpdir(), 'allenatore-pesi-prova.json');
    const prima = checkpointVuoto(3, 0.02);
    salvaCheckpoint(percorso, prima);
    const dopo = caricaCheckpoint(percorso);
    expect(dopo.seed).toBe(3);
    expect(dopo.pesi).toEqual(prima.pesi);
    expect(dopo.passoIniziale).toBe(0.02);
    expect(percorsoDeiMigliori('/tmp/pesi.json')).toBe('/tmp/pesi.migliori.json');
  });
});

describe('la scelta pesata', () => {
  it('gioca sempre una carta legale e chiude in pari', () => {
    const tavolo = TAVOLI[0];
    if (tavolo === undefined) throw new Error('manca il tavolo a tre');
    let visteSenzaMani = 0;
    const esito = giocaSmazzata({
      tavolo,
      dealer: 0,
      seed: 4,
      scegli: (vista, rng) => {
        expect(vista).not.toHaveProperty('hands');
        visteSenzaMani += 1;
        if (vista.legali.length === 1) {
          const sola = vista.legali[0];
          if (sola === undefined) throw new Error('manca la sola legale');
          expect(scegliCartaPesata(vista, PESI_INIZIALI, rng).id).toBe(sola.id);
        }
        return scegliCartaPesata(vista, PESI_INIZIALI, rng);
      },
    });
    expect(visteSenzaMani).toBeGreaterThan(0);
    expect(esito.quote.reduce((somma, quota) => somma + quota, 0)).toBe(0);
  });
});

describe('la smazzata chiude', () => {
  it('in pari a ogni tavolo, col bot pesato a tutti i posti', () => {
    for (const tavolo of TAVOLI) {
      for (let seed = 1; seed <= 8; seed += 1) {
        const esito = giocaSmazzata({
          tavolo,
          dealer: seed % tavolo.players,
          seed,
          scegli: (vista, rng) => scegliCartaPesata(vista, PESI_INIZIALI, rng),
        });
        expect(esito.quote.reduce((somma, quota) => somma + quota, 0)).toBe(0);
      }
    }
  });
});

describe('l accordo', () => {
  it('si misura sugli stessi mazzi e torna un numero', () => {
    const accordo = misuraAccordo({ seed: 3, smazzate: 4, tavoli: TAVOLI.slice(0, 1) });
    expect(accordo.decisioni).toBeGreaterThan(0);
    expect(accordo.uguali).toBeGreaterThanOrEqual(0);
    expect(accordo.uguali).toBeLessThanOrEqual(accordo.decisioni);
  });
});

describe('i worker non toccano i pesi su file', () => {
  it('solo il principale importa il salvataggio', () => {
    expect(legge('./worker.ts')).not.toMatch(/salvaCheckpoint|writeFileSync|pesi\.json/);
    expect(legge('./allena.ts')).toMatch(/salvaCheckpoint/);
  });

  it('due smazzate con lo stesso seme tirano i pesi uguale', () => {
    const tavolo = TAVOLI[0];
    if (tavolo === undefined) throw new Error('manca il tavolo a tre');
    const una = gradienteDellaSmazzata({
      pesi: PESI_INIZIALI,
      tavolo,
      dealer: 0,
      seed: 9,
      indice: 0,
      avversario: 'serie',
    });
    const altra = gradienteDellaSmazzata({
      pesi: PESI_INIZIALI,
      tavolo,
      dealer: 0,
      seed: 9,
      indice: 0,
      avversario: 'serie',
    });
    expect(una).toEqual(altra);
  });
});

describe('il premio della mossa', () => {
  const re = carta('coppe', 're');
  const sei = carta('coppe', 6);

  it('una mossa uguale a quella di serie non sposta i pesi, anche se la smazzata e persa', () => {
    expect(premioDellaMossa(-2, 1, re, re)).toBe(0);
  });

  it('se il risultato e lo stesso della serie, non c e niente da imparare', () => {
    expect(premioDellaMossa(2, 2, re, sei)).toBe(0);
  });

  it('il premio e quanto si e fatto in piu o in meno della serie', () => {
    expect(premioDellaMossa(2, 0, re, sei)).toBe(2);
    expect(premioDellaMossa(-1, 1, re, sei)).toBe(-2);
  });
});

