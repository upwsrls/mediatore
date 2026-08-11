import { PARAMETRI_DI_SERIE } from '@mediatore/bot';
import { describe, expect, it } from 'vitest';
import { botCon } from './avversari.ts';
import { GRIGLIA } from './griglia.ts';
import { misura } from './misura.ts';
import { PARAMETRI_ATTUALI, conScarto, conSoglia, copia } from './parametri.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

const RIFERIMENTO = botCon(PARAMETRI_ATTUALI);

describe('la smazzata di prova', () => {
  it('chiude sempre in pari, a ogni tavolo', () => {
    for (const tavolo of TAVOLI) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const posti = Array.from({ length: tavolo.players }, () => RIFERIMENTO);
        const esito = giocaSmazzata({ tavolo, dealer: seed % tavolo.players, seed, posti });
        expect(esito.quote).toHaveLength(tavolo.players);
        expect(esito.quote.reduce((somma, quota) => somma + quota, 0)).toBe(0);
      }
    }
  });
});

describe('la misura', () => {
  it("da' sempre lo stesso numero sugli stessi mazzi", () => {
    const opzioni = {
      parametri: PARAMETRI_ATTUALI,
      riferimento: RIFERIMENTO,
      seedBase: 7,
      smazzate: 60,
      tavoli: ['3', '4'] as const,
    };
    expect(misura(opzioni)).toEqual(misura(opzioni));
  });

  it('con gli stessi numeri da tutte e due le parti il saldo e esattamente zero', () => {
    // Ogni mazzo si gioca due volte a posti scambiati: se le due parti
    // giocano identiche, quello che incassa uno lo paga l'altro e la somma
    // torna a zero senza margine. E' la prova che la misura non regala
    // niente a nessuno per il solo fatto di sedere in un certo posto.
    for (const tavolo of TAVOLI) {
      const risultato = misura({
        parametri: PARAMETRI_ATTUALI,
        riferimento: RIFERIMENTO,
        seedBase: 1,
        smazzate: 150,
        tavoli: [tavolo.id],
      });
      expect(risultato.saldoMedio).toBe(0);
    }
  });

  it('gioca ogni mazzo due volte, una per parte', () => {
    const risultato = misura({
      parametri: PARAMETRI_ATTUALI,
      riferimento: RIFERIMENTO,
      seedBase: 1,
      smazzate: 200,
      tavoli: ['3'],
    });
    expect(risultato.mazzi).toBe(200);
    expect(risultato.mani).toBe(400);
  });

  it('numeri diversi cambiano come finiscono le smazzate', () => {
    const tavolo = TAVOLI[0];
    if (tavolo === undefined) throw new Error('manca il tavolo a tre');
    const stretto = botCon(
      conScarto(PARAMETRI_ATTUALI, { prezzoDelVuoto: 0, puntiMassimiNelMonte: 0 }),
    );
    let diverse = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const uguale = giocaSmazzata({
        tavolo,
        dealer: seed % tavolo.players,
        seed,
        posti: [RIFERIMENTO, RIFERIMENTO, RIFERIMENTO],
      });
      const diverso = giocaSmazzata({
        tavolo,
        dealer: seed % tavolo.players,
        seed,
        posti: [stretto, RIFERIMENTO, RIFERIMENTO],
      });
      if (uguale.quote.join() !== diverso.quote.join()) diverse += 1;
    }
    expect(diverse).toBeGreaterThan(0);
  });

  it('conta le chiamate del solo bot tarato e le sue vittorie', () => {
    const risultato = misura({
      parametri: PARAMETRI_ATTUALI,
      riferimento: RIFERIMENTO,
      seedBase: 1,
      smazzate: 200,
      tavoli: ['3'],
    });
    expect(risultato.perTavolo.get('3')?.mani).toBe(400);
    expect(risultato.chiamate).toBeGreaterThan(0);
    expect(risultato.chiamate).toBeLessThan(risultato.mani);
    expect(risultato.percentualeVinte).toBeGreaterThan(0);
  });

  it('una soglia irraggiungibile toglie ogni chiamata al bot tarato', () => {
    const risultato = misura({
      parametri: conSoglia(PARAMETRI_ATTUALI, '3', 999),
      riferimento: RIFERIMENTO,
      seedBase: 1,
      smazzate: 200,
      tavoli: ['3'],
    });
    expect(risultato.chiamate).toBe(0);
  });
});

describe('la griglia', () => {
  it('parte dai valori che il bot ha davvero', () => {
    expect(PARAMETRI_ATTUALI).toEqual(PARAMETRI_DI_SERIE);
    for (const coordinata of GRIGLIA) {
      expect(coordinata.valori).toContain(coordinata.leggi(PARAMETRI_ATTUALI));
    }
  });

  it('scrivere un valore lo rilegge uguale, senza toccare i parametri di partenza', () => {
    for (const coordinata of GRIGLIA) {
      const prima = copia(PARAMETRI_ATTUALI);
      for (const valore of coordinata.valori) {
        const nuovi = coordinata.scrivi(PARAMETRI_ATTUALI, valore);
        expect(coordinata.leggi(nuovi)).toBe(valore);
        expect(PARAMETRI_ATTUALI).toEqual(prima);
      }
    }
  });

  it('non tocca la chiamata, che viene da partite vere', () => {
    const toccaLaChiamata = GRIGLIA.some((coordinata) => coordinata.nome.startsWith('chiamata'));
    expect(toccaLaChiamata).toBe(false);
  });

  it('ogni coordinata dichiara i tavoli dove conta qualcosa', () => {
    const ammessi = TAVOLI.map((tavolo) => tavolo.id);
    for (const coordinata of GRIGLIA) {
      expect(coordinata.tavoli.length).toBeGreaterThan(0);
      for (const id of coordinata.tavoli) expect(ammessi).toContain(id);
    }
  });
});
