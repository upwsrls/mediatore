import { decidiChiamata, scegliCarta, scegliScarti, vistaDaStato } from '@mediatore/bot';
import type { Alliance, CallAction, Card, HandState, TipoChiamata } from '@mediatore/engine';
import {
  applyCall,
  apreLaPrimaBase,
  createCallState,
  createDeck,
  createHandState,
  createRng,
  discardToMonte,
  playCard,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import {
  azioneDellaChiamata,
  azioneDellaGiocata,
  azioneDelloScarto,
  situazioneDellaChiamata,
  situazioneDellaGiocata,
} from './situazioni.ts';
import type { Confronto, Ruolo, Smazzata } from './tipi.ts';

const MAZZO = createDeck();

export function cartaDaId(id: string): Card {
  const carta = MAZZO.find((c) => c.id === id);
  if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
  return carta;
}

export function carteDaId(ids: readonly string[]): Card[] {
  return ids.map(cartaDaId);
}

export function eUmano(smazzata: Smazzata, giocatore: number): boolean {
  if (smazzata.postoUmano === null) return true;
  return smazzata.postoUmano === giocatore;
}

/**
 * Il ruolo com'era davvero a smazzata finita, non come appariva a chi
 * giocava: l'amico scoperto resta amico anche sulle prese di prima, e il
 * liscio non si mescola ai difensori.
 */
export function ruoloVero(smazzata: Smazzata, giocatore: number): Ruolo {
  if (smazzata.chiamante === null) return 'liscio';
  if (smazzata.chiamante === giocatore) return 'chiamante';
  if (smazzata.amicoScoperto === giocatore) return 'amico';
  return 'difensore';
}

export function tavoloDi(smazzata: Smazzata): string {
  if (smazzata.variante === 'amico') return '5 amico';
  return `${smazzata.giocatori} monte`;
}

function azioneCall(scelta: 'passo' | TipoChiamata): CallAction {
  return scelta === 'passo' ? { tipo: 'passo' } : { tipo: 'chiama', chiamata: scelta };
}

function alleanza(smazzata: Smazzata, cartaAmico: string | null): Alliance {
  if (smazzata.chiamante === null) return { kind: 'liscio' };
  const chiamata = smazzata.chiamata ?? 'normale';
  if (smazzata.variante === 'amico' && chiamata === 'normale' && cartaAmico !== null) {
    return { kind: 'amico', caller: smazzata.chiamante, calledCard: cartaAmico, friend: null };
  }
  return { kind: 'monte', caller: smazzata.chiamante, chiamata };
}

function avvia(smazzata: Smazzata, mani: Card[][], monte: Card[], cartaAmico: string | null, apre: number | null): HandState {
  const config = tableConfig(smazzata.giocatori, smazzata.variante);
  const leader = apreLaPrimaBase({
    chiamata: smazzata.chiamata ?? 'normale',
    caller: smazzata.chiamante ?? smazzata.mazziere,
    dealer: smazzata.mazziere,
    players: smazzata.giocatori,
    sceltoDaAvversari: apre,
  });
  return createHandState({
    config,
    dealer: smazzata.mazziere,
    trump: smazzata.trionfo,
    alliance: alleanza(smazzata, cartaAmico),
    hands: mani,
    monte,
    leader,
  });
}

export function confrontaSmazzata(smazzata: Smazzata): Confronto[] {
  if (smazzata.carteScoperte) return [];

  const config = tableConfig(smazzata.giocatori, smazzata.variante);
  const mani = smazzata.maniIniziali.map(carteDaId);
  let monte = carteDaId(smazzata.monteIniziale);
  let call = createCallState(config, smazzata.mazziere);
  let state: HandState | null = null;
  let cartaAmico = smazzata.cartaDellAmico;
  let apre: number | null = null;
  const confronti: Confronto[] = [];
  const scoperta = smazzata.scoperta === null ? null : cartaDaId(smazzata.scoperta);

  for (const decisione of smazzata.decisioni) {
    if (decisione.tipo === 'chiamata') {
      if (eUmano(smazzata, decisione.giocatore)) {
        const mano = carteDaId(decisione.mano);
        const delBot = decidiChiamata({ mano, trump: decisione.trionfo, scoperta }, config);
        const sceltaBot = delBot === 'chiama' ? 'normale' : 'passo';
        confronti.push({
          ruolo: ruoloVero(smazzata, decisione.giocatore),
          situazione: situazioneDellaChiamata(smazzata.giocatori, smazzata.variante),
          azioneUmano: azioneDellaChiamata(decisione.scelta),
          azioneBot: azioneDellaChiamata(sceltaBot),
          accordo: decisione.scelta === sceltaBot,
          esempio: {
            seed: smazzata.seed,
            tavolo: tavoloDi(smazzata),
            presa: null,
            mano: decisione.mano,
            inTavola: scoperta === null ? [] : [`scoperta ${scoperta.id}`],
            umano: azioneDellaChiamata(decisione.scelta),
            bot: azioneDellaChiamata(sceltaBot),
          },
        });
      }
      call = applyCall(call, decisione.giocatore, azioneCall(decisione.scelta));
      continue;
    }

    if (decisione.tipo === 'scarto') {
      const allargata = takeMonte(mani[decisione.giocatore] ?? [], monte);
      const scartate = carteDaId(decisione.scartate);
      if (eUmano(smazzata, decisione.giocatore)) {
        const delBot = scegliScarti(allargata, smazzata.trionfo, scartate.length, smazzata.giocatori);
        const idsBot = new Set(delBot.map((carta) => carta.id));
        const idsUmano = new Set(decisione.scartate);
        const uguali =
          idsBot.size === idsUmano.size && [...idsUmano].every((id) => idsBot.has(id));
        confronti.push({
          ruolo: 'chiamante',
          situazione: 'scarto al monte',
          azioneUmano: azioneDelloScarto(scartate),
          azioneBot: azioneDelloScarto(delBot),
          accordo: uguali,
          esempio: {
            seed: smazzata.seed,
            tavolo: tavoloDi(smazzata),
            presa: null,
            mano: decisione.manoAllargata,
            inTavola: [],
            umano: decisione.scartate.join(', '),
            bot: delBot.map((carta) => carta.id).join(', '),
          },
        });
      }
      const scambio = discardToMonte(allargata, scartate, config.monteSize);
      mani[decisione.giocatore] = scambio.hand;
      monte = scambio.monte;
      continue;
    }

    if (decisione.tipo === 'amico') {
      cartaAmico = decisione.cartaChiamata;
      continue;
    }

    if (decisione.tipo === 'apertura') {
      apre = decisione.giocatore;
      continue;
    }

    if (state === null) {
      state = avvia(smazzata, mani, monte, cartaAmico, apre);
    }

    if (eUmano(smazzata, decisione.giocatore)) {
      const vista = vistaDaStato(state, decisione.giocatore);
      const rng = createRng(smazzata.seed * 1009 + decisione.giocatore * 17 + decisione.presa);
      const delBot = scegliCarta(vista, rng);
      const sceltaUmana = cartaDaId(decisione.scelta);
      confronti.push({
        ruolo: ruoloVero(smazzata, decisione.giocatore),
        situazione: situazioneDellaGiocata(vista),
        azioneUmano: azioneDellaGiocata(vista, sceltaUmana),
        azioneBot: azioneDellaGiocata(vista, delBot),
        accordo: delBot.id === decisione.scelta,
        esempio: {
          seed: smazzata.seed,
          tavolo: tavoloDi(smazzata),
          presa: decisione.presa,
          mano: decisione.mano,
          inTavola: decisione.inTavola.map((giocata) => `${giocata.carta} (posto ${giocata.giocatore})`),
          umano: decisione.scelta,
          bot: delBot.id,
        },
      });
    }

    state = playCard(state, decisione.giocatore, decisione.scelta);
  }

  return confronti;
}

export function confrontaTutte(smazzate: readonly Smazzata[]): {
  confronti: Confronto[];
  saltateScoperte: number;
  smazzateViste: number;
  errori: number;
} {
  const confronti: Confronto[] = [];
  let saltateScoperte = 0;
  let smazzateViste = 0;
  let errori = 0;
  for (const smazzata of smazzate) {
    if (smazzata.carteScoperte) {
      saltateScoperte += 1;
      continue;
    }
    smazzateViste += 1;
    try {
      confronti.push(...confrontaSmazzata(smazzata));
    } catch (errore) {
      errori += 1;
      const perche = errore instanceof Error ? errore.message : String(errore);
      console.warn(`imitatore: salto seed ${smazzata.seed}: ${perche}`);
    }
  }
  return { confronti, saltateScoperte, smazzateViste, errori };
}
