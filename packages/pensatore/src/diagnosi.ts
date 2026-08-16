import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { VistaDelBot } from '@mediatore/bot';
import { eSemeFinito, scegliCarta, vistaDaStato } from '@mediatore/bot';
import type { Alliance, CallAction, Card, HandState, Suit, TipoChiamata, Variant } from '@mediatore/engine';
import {
  applyCall,
  apreLaPrimaBase,
  createCallState,
  createDeck,
  createHandState,
  createRng,
  discardToMonte,
  playCard,
  SUITS,
  tableConfig,
  takeMonte,
} from '@mediatore/engine';
import { mondiPossibili } from './mondi.ts';
import { misuraCarte } from './pensa.ts';
import type { MisuraDelleCarte, OpzioniPensatore } from './pensa.ts';

/**
 * Ricostruisce il caso di ieri e misura il pensatore carta per carta.
 * Poi campiona 200 situazioni dalle partite e conta dove si discosta
 * dalle regole di serie.
 *
 *   node --experimental-strip-types packages/pensatore/src/diagnosi.ts
 *   --da=partite --mondi=100 --tempo=500 --campione=200
 */

const MAZZO = createDeck();
const SEED_CASO = 1589614293;

interface Smazzata {
  seed: number;
  giocatori: number;
  variante: Variant;
  mazziere: number;
  trionfo: Suit;
  scoperta: string | null;
  maniIniziali: string[][];
  monteIniziale: string[];
  postoUmano: number | null;
  carteScoperte: boolean;
  chiamante: number | null;
  chiamata: TipoChiamata | null;
  cartaDellAmico: string | null;
  decisioni: {
    tipo: string;
    giocatore: number;
    scelta?: string;
    scartate?: string[];
    cartaChiamata?: string;
    presa?: number;
  }[];
}

function cartaDaId(id: string): Card {
  const carta = MAZZO.find((c) => c.id === id);
  if (carta === undefined) throw new Error(`carta inesistente: ${id}`);
  return carta;
}

function azioneCall(scelta: string): CallAction {
  return scelta === 'passo' ? { tipo: 'passo' } : { tipo: 'chiama', chiamata: scelta as TipoChiamata };
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

interface Situazione {
  seed: number;
  presa: number;
  giocatore: number;
  vista: VistaDelBot;
  giocata: string;
}

function situazioniDellaSmazzata(smazzata: Smazzata): Situazione[] {
  if (smazzata.carteScoperte) return [];
  const config = tableConfig(smazzata.giocatori, smazzata.variante);
  const mani = smazzata.maniIniziali.map((ids) => ids.map(cartaDaId));
  let monte = smazzata.monteIniziale.map(cartaDaId);
  let call = createCallState(config, smazzata.mazziere);
  let state: HandState | null = null;
  let cartaAmico = smazzata.cartaDellAmico;
  let apre: number | null = null;
  const trovate: Situazione[] = [];

  for (const decisione of smazzata.decisioni) {
    if (decisione.tipo === 'chiamata') {
      call = applyCall(call, decisione.giocatore, azioneCall(decisione.scelta ?? 'passo'));
      continue;
    }
    if (decisione.tipo === 'scarto') {
      const allargata = takeMonte(mani[decisione.giocatore] ?? [], monte);
      const scartate = (decisione.scartate ?? []).map(cartaDaId);
      const scambio = discardToMonte(allargata, scartate, config.monteSize);
      mani[decisione.giocatore] = scambio.hand;
      monte = scambio.monte;
      continue;
    }
    if (decisione.tipo === 'amico') {
      cartaAmico = decisione.cartaChiamata ?? cartaAmico;
      continue;
    }
    if (decisione.tipo === 'apertura') {
      apre = decisione.giocatore;
      continue;
    }
    if (decisione.tipo !== 'giocata' || decisione.scelta === undefined) continue;
    if (state === null) state = avvia(smazzata, mani, monte, cartaAmico, apre);
    const vista = vistaDaStato(state, decisione.giocatore);
    if (vista.legali.length >= 2) {
      trovate.push({
        seed: smazzata.seed,
        presa: decisione.presa ?? 0,
        giocatore: decisione.giocatore,
        vista,
        giocata: decisione.scelta,
      });
    }
    state = playCard(state, decisione.giocatore, decisione.scelta);
  }
  return trovate;
}

function leggiPartite(cartella: string): Smazzata[] {
  let nomi: string[];
  try {
    nomi = readdirSync(cartella).filter((nome) => nome.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const smazzate: Smazzata[] = [];
  for (const nome of nomi) {
    try {
      const letto = JSON.parse(readFileSync(join(cartella, nome), 'utf8')) as { smazzate?: Smazzata[] };
      if (!Array.isArray(letto.smazzate)) continue;
      for (const smazzata of letto.smazzate) {
        if (smazzata.carteScoperte) continue;
        if (!Array.isArray(smazzata.decisioni) || !Array.isArray(smazzata.maniIniziali)) continue;
        smazzate.push(smazzata);
      }
    } catch (errore) {
      const perche = errore instanceof Error ? errore.message : String(errore);
      console.warn(`diagnosi: salto ${nome}: ${perche}`);
    }
  }
  return smazzate;
}

function vuotiDellaVista(vista: VistaDelBot): string[] {
  const vuoti: string[] = [];
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (seat === vista.io) continue;
    for (const palo of SUITS) {
      if (eSemeFinito(vista, seat, palo)) vuoti.push(`posto ${seat} senza ${palo}`);
    }
  }
  return vuoti;
}

function mondoViolaVuoti(vista: VistaDelBot, mani: readonly (readonly Card[])[]): string[] {
  const errori: string[] = [];
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (seat === vista.io) continue;
    for (const palo of SUITS) {
      if (!eSemeFinito(vista, seat, palo)) continue;
      if ((mani[seat] ?? []).some((carta) => carta.suit === palo)) {
        errori.push(`posto ${seat} ha ${palo} ma ne e' privo`);
      }
    }
  }
  return errori;
}

function num(valore: number, decimali = 3): string {
  return valore.toFixed(decimali).replace('.', ',');
}

function stampaMisura(misura: MisuraDelleCarte): void {
  console.log(
    `serie ${misura.diSerie.id}  pensatore ${misura.scelta.id}` +
      `  mondi ${misura.mondi}` +
      (misura.mondiMancati > 0 ? ` (mancati ${misura.mondiMancati})` : '') +
      `  in ${misura.tempoMs.toFixed(0)} ms`,
  );
  console.log('  carta            media   vinte   meglio della serie');
  for (const conto of misura.perCarta) {
    const marca = conto.carta.id === misura.diSerie.id ? '  (serie)' : '';
    console.log(
      `  ${conto.carta.id.padEnd(16)} ${num(conto.media, 3).padStart(7)}` +
        `  ${String(conto.vinte).padStart(3)}/${misura.mondi}` +
        `  ${String(conto.meglioDellaSerie).padStart(3)}/${misura.mondi}${marca}`,
    );
  }
}

function argomento(nome: string): string | null {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato === undefined ? null : trovato.slice(prefisso.length);
}

function argomentoNumerico(nome: string, difetto: number): number {
  const grezzo = argomento(nome);
  if (grezzo === null) return difetto;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore) || valore < 0) {
    console.error(`valore non valido per --${nome}: ${grezzo}`);
    process.exit(1);
  }
  return Math.floor(valore);
}

function casoDiIeri(smazzate: readonly Smazzata[]): Situazione {
  const smazzata = smazzate.find((s) => s.seed === SEED_CASO);
  if (smazzata === undefined) throw new Error(`manca la smazzata seed ${SEED_CASO}`);
  const quarta = situazioniDellaSmazzata(smazzata).find(
    (s) => s.presa === 4 && s.giocatore === 3 && s.vista.presaInCorso.plays.length === 0,
  );
  if (quarta === undefined) throw new Error('manca la quarta base del posto 3');
  return quarta;
}

function main(): void {
  const cartella = resolve(argomento('da') ?? 'partite');
  const mondi = argomentoNumerico('mondi', 100);
  const tempoMs = argomentoNumerico('tempo', 500);
  const campione = argomentoNumerico('campione', 200);
  const opzioni: OpzioniPensatore = { mondi, tempoMs, mondiCompagni: 0 };
  const smazzate = leggiPartite(cartella);
  if (smazzate.length === 0) {
    console.error(`nessuna partita in ${cartella}`);
    process.exit(1);
  }

  const ieri = casoDiIeri(smazzate);
  const vista = ieri.vista;
  console.log(`caso di ieri: seed ${ieri.seed}, presa ${ieri.presa}, posto ${ieri.giocatore}`);
  console.log(`mano ${vista.mano.map((c) => c.id).join(' ')}`);
  console.log(`legali ${vista.legali.map((c) => c.id).join(' ')}`);
  console.log(`in partita ha giocato ${ieri.giocata}`);
  console.log(`serie sceglie ${scegliCarta(vista, createRng(1)).id}`);

  const vuoti = vuotiDellaVista(vista);
  console.log(vuoti.length === 0 ? 'vuoti visti: nessuno' : `vuoti visti: ${vuoti.join(', ')}`);

  const mondiProva = mondiPossibili(vista, 80, createRng(3));
  let violazioni = 0;
  for (const mondo of mondiProva) {
    violazioni += mondoViolaVuoti(vista, mondo.mani).length;
  }
  console.log(`mondi generati ${mondiProva.length}, violazioni dei vuoti ${violazioni}`);

  console.log('');
  console.log(`misura come in app: ${mondi} mondi, ${tempoMs} ms`);
  stampaMisura(misuraCarte(vista, opzioni, createRng(ieri.seed)));

  console.log('');
  console.log('stessa misura senza tetto di tempo, 400 mondi');
  stampaMisura(misuraCarte(vista, { mondi: 400, tempoMs: 60_000, mondiCompagni: 0 }, createRng(ieri.seed)));

  const proveSeme = 20;
  let volteDenari = 0;
  let volteSpade7 = 0;
  for (let i = 0; i < proveSeme; i += 1) {
    const prova = misuraCarte(vista, opzioni, createRng(1000 + i * 17));
    if (prova.scelta.id === 'denari-5') volteDenari += 1;
    if (prova.scelta.id === 'spade-7') volteSpade7 += 1;
  }
  console.log(
    `su ${proveSeme} semi diversi a ${mondi} mondi:` +
      ` denari-5 ${volteDenari} volte, spade-7 ${volteSpade7} volte`,
  );

  const tutte = smazzate.flatMap(situazioniDellaSmazzata);
  const rng = createRng(1);
  const mescolate = [...tutte];
  for (let i = mescolate.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const a = mescolate[i];
    const b = mescolate[j];
    if (a === undefined || b === undefined) continue;
    mescolate[i] = b;
    mescolate[j] = a;
  }
  const scelte = mescolate.slice(0, Math.min(campione, mescolate.length));

  console.log('');
  console.log(
    `campione: ${scelte.length} situazioni su ${tutte.length}` +
      ` (${mondi} mondi, ${tempoMs} ms, come in app)`,
  );

  let disaccordi = 0;
  let mondiMedi = 0;
  const dubbi: { situazione: Situazione; scelta: string; serie: string }[] = [];

  for (const situazione of scelte) {
    const misura = misuraCarte(situazione.vista, opzioni, createRng(situazione.seed * 17 + situazione.presa));
    mondiMedi += misura.mondi;
    if (misura.scelta.id === misura.diSerie.id) continue;
    disaccordi += 1;
    dubbi.push({ situazione, scelta: misura.scelta.id, serie: misura.diSerie.id });
  }

  const mediaMondi = scelte.length === 0 ? 0 : mondiMedi / scelte.length;
  console.log(`disaccordi ${disaccordi} su ${scelte.length} (${num((disaccordi / scelte.length) * 100, 1)}%)`);
  console.log(`mondi medi a situazione: ${num(mediaMondi, 1)}`);

  const largo: OpzioniPensatore = { mondi: 400, tempoMs: 60_000, mondiCompagni: 0 };
  let tiene = 0;
  let tornaAllaSerie = 0;
  let altra = 0;
  for (const dubbio of dubbi) {
    const controllo = misuraCarte(
      dubbio.situazione.vista,
      largo,
      createRng(dubbio.situazione.seed * 17 + dubbio.situazione.presa),
    );
    if (controllo.scelta.id === dubbio.serie) tornaAllaSerie += 1;
    else if (controllo.scelta.id === dubbio.scelta) tiene += 1;
    else altra += 1;
  }
  console.log(
    `gli stessi disaccordi rifatti a 400 mondi:` +
      ` il pensatore tiene ${tiene},` +
      ` torna alla serie ${tornaAllaSerie},` +
      ` cambia di nuovo ${altra}`,
  );
}

const eIlPrincipale = process.argv[1]?.endsWith('diagnosi.ts') === true;
if (eIlPrincipale) {
  main();
}
