import type { Card, Suit } from '@mediatore/engine';
import { cardPoints, cardStrength, currentWinner, penalitaDaSoglia } from '@mediatore/engine';
import type { VistaDelBot } from '@mediatore/bot';
import {
  alleatoDi,
  carteNonAncoraViste,
  eFirma,
  ePadrona,
  possoVincere,
  preseRimaste,
  puntiDeiMiei,
  puntiInTavola,
  rischioDiPerdere,
  sonoIlChiamante,
  trionfiAvversariRimasti,
} from '@mediatore/bot';

/**
 * I numeri che descrivono una mossa, visti da chi la deve fare.
 *
 * Nascono solo dalla VistaDelBot e dalla carta: le mani degli altri non
 * arrivano qui, e non devono. Ogni nome e' una cosa che il giocatore vero
 * sa o conta a mente.
 */
export const NOMI = [
  'e_di_trionfo',
  'e_padrona_del_palo',
  'e_firma',
  'e_firma_laterale',
  'e_maniglia',
  'e_asso',
  'e_re',
  'punti_della_carta',
  'forza_della_carta',
  'unica_del_palo',
  'carta_protetta',
  'scartina_di_protezione',
  'regalo_di_punti',
  'punti_in_tavola',
  'apro_la_presa',
  'presa_del_compagno',
  'presa_dell_avversario',
  'presa_ancora_aperta',
  'posso_prenderla',
  'rischio_di_perderla',
  'posso_prenderla_sicuro',
  'trionfi_degli_avversari',
  'sono_chiamante',
  'sono_difensore',
  'basi_rimaste',
  'sotto_la_soglia',
  'sopra_la_soglia',
  'liscio',
  'punti_sulla_presa_del_compagno',
  'punti_sulla_presa_avversaria',
  'trionfo_sulla_presa_del_compagno',
  'trionfo_sulla_presa_avversaria',
  'firma_in_apertura',
  'firma_laterale_in_apertura',
  'regalo_in_apertura',
  'trionfo_in_apertura',
  'punti_nel_liscio_se_prendo',
  'punti_nel_liscio_se_perdo',
  'protetta_sulla_presa_del_compagno',
  'scartina_sulla_presa_del_compagno',
  'e_la_piu_magra',
  'e_la_piu_grassa',
  'e_la_piu_bassa',
  'e_la_piu_alta',
  'e_il_trionfo_piu_basso_che_prende',
  'punti_sopra_la_media_legale',
  'forza_sopra_la_media_legale',
] as const;

export type Nome = (typeof NOMI)[number];

export type Vettore = Record<Nome, number>;

/** Come si dicono a voce, per capire cosa ha imparato. */
export const PAROLE: Record<Nome, string> = {
  e_di_trionfo: 'la carta e di trionfo',
  e_padrona_del_palo: 'la carta e la piu alta rimasta del suo palo',
  e_firma: 'la carta e firma',
  e_firma_laterale: 'la carta e una firma laterale',
  e_maniglia: 'la carta e la maniglia',
  e_asso: 'la carta e un asso',
  e_re: 'la carta e un re',
  punti_della_carta: 'quanti punti vale la carta',
  forza_della_carta: 'quanto e alta la carta',
  unica_del_palo: 'e l unica carta di quel palo in mano',
  carta_protetta: 'la carta alta e protetta dalle scartine sotto',
  scartina_di_protezione: 'e una scartina che tiene in piedi una carta alta',
  regalo_di_punti: 'aprire o buttarla sarebbe regalare punti',
  punti_in_tavola: 'quanti punti ci sono gia in tavola',
  apro_la_presa: 'il bot apre la presa',
  presa_del_compagno: 'la presa la sta vincendo il compagno',
  presa_dell_avversario: 'la presa la sta vincendo un avversario',
  presa_ancora_aperta: 'la presa e ancora vuota',
  posso_prenderla: 'con questa carta il bot prenderebbe adesso',
  rischio_di_perderla: 'quanto rischia di farsela superare',
  posso_prenderla_sicuro: 'la prenderebbe senza nessuno dietro che la supera',
  trionfi_degli_avversari: 'quanti trionfi restano agli avversari',
  sono_chiamante: 'il bot e il chiamante',
  sono_difensore: 'il bot e un difensore',
  basi_rimaste: 'quante basi restano',
  sotto_la_soglia: 'la sua parte e sotto la soglia',
  sopra_la_soglia: 'la sua parte e sopra la soglia',
  liscio: 'si gioca al liscio',
  punti_sulla_presa_del_compagno: 'punti caricati sulla presa del compagno',
  punti_sulla_presa_avversaria: 'punti buttati sulla presa avversaria',
  trionfo_sulla_presa_del_compagno: 'trionfo speso sulla presa del compagno',
  trionfo_sulla_presa_avversaria: 'trionfo speso sulla presa avversaria',
  firma_in_apertura: 'apre con una firma',
  firma_laterale_in_apertura: 'apre con una firma laterale',
  regalo_in_apertura: 'apre regalando punti',
  trionfo_in_apertura: 'apre a trionfo',
  punti_nel_liscio_se_prendo: 'punti presi nel liscio',
  punti_nel_liscio_se_perdo: 'punti scaricati nel liscio',
  protetta_sulla_presa_del_compagno: 'carta protetta buttata sul compagno',
  scartina_sulla_presa_del_compagno: 'scartina di protezione buttata sul compagno',
  e_la_piu_magra: 'e la carta che vale meno fra le legali',
  e_la_piu_grassa: 'e la carta che vale piu fra le legali',
  e_la_piu_bassa: 'e la carta piu bassa fra le legali',
  e_la_piu_alta: 'e la carta piu alta fra le legali',
  e_il_trionfo_piu_basso_che_prende: 'e il trionfo piu basso che vince la presa',
  punti_sopra_la_media_legale: 'vale piu della media delle legali',
  forza_sopra_la_media_legale: 'e piu alta della media delle legali',
};

/**
 * Le scartine sotto una carta alta, in un palo qualunque. Stessa struttura
 * del re terzo e dell'asso secondo: le tirate ancora in giro si coprono con
 * le scartine, e se bastano la carta alta arriva in fondo viva.
 */
function protezioneNelPalo(
  vista: VistaDelBot,
  palo: Suit,
): { alta: Card; scorta: Card[] } | null {
  const delPalo = vista.mano.filter((carta) => carta.suit === palo);
  const alte = delPalo.filter((carta) => cardStrength(carta.rank) >= cardStrength('re'));
  if (alte.length === 0) return null;

  const alta = alte.reduce((massima, carta) =>
    cardStrength(carta.rank) > cardStrength(massima.rank) ? carta : massima,
  );
  const tirate = carteNonAncoraViste(vista).filter(
    (altra) => altra.suit === palo && cardStrength(altra.rank) > cardStrength(alta.rank),
  ).length;
  if (tirate === 0) return null;

  const bassi = delPalo
    .filter((carta) => cardStrength(carta.rank) < cardStrength(alta.rank))
    .sort((a, b) => cardStrength(a.rank) - cardStrength(b.rank));
  if (bassi.length < tirate) return null;
  return { alta, scorta: bassi.slice(0, tirate) };
}

function siNo(valore: boolean): number {
  return valore ? 1 : 0;
}

/**
 * I numeri di quella mossa. Accetta solo la vista e la carta: se un giorno
 * qualcuno gli passasse lo stato intero, TypeScript lo ferma prima.
 */
export function caratteristiche(vista: VistaDelBot, carta: Card): Vettore {
  const trionfo = carta.suit === vista.trump;
  const padrona = ePadrona(vista, carta);
  const firma = eFirma(vista, carta);
  const firmaLaterale = firma && !trionfo;
  const punti = cardPoints(carta.rank);
  const unica =
    !vista.mano.some((altra) => altra.id !== carta.id && altra.suit === carta.suit);
  const protezione = protezioneNelPalo(vista, carta.suit);
  const protetta = protezione !== null && protezione.alta.id === carta.id;
  const scartina =
    protezione !== null && protezione.scorta.some((altra) => altra.id === carta.id);
  const regalo = !trionfo && punti > 0 && !padrona;

  const vincitore = currentWinner(vista.presaInCorso);
  const apre = vista.presaInCorso.plays.length === 0;
  const delCompagno = vincitore !== null && alleatoDi(vista, vincitore);
  const dellAvversario = vincitore !== null && !alleatoDi(vista, vincitore);

  const prendo = possoVincere(vista, carta);
  const rischio = rischioDiPerdere(vista, carta);
  const chiamante = sonoIlChiamante(vista);
  const liscio = vista.alliance.kind === 'liscio';
  const puntiMiei = puntiDeiMiei(vista);
  const sotto = penalitaDaSoglia(puntiMiei, vista.config.players) > 0;

  const puntiLegali = vista.legali.map((altra) => cardPoints(altra.rank));
  const forzeLegali = vista.legali.map((altra) => cardStrength(altra.rank));
  const minPunti = Math.min(...puntiLegali);
  const maxPunti = Math.max(...puntiLegali);
  const minForza = Math.min(...forzeLegali);
  const maxForza = Math.max(...forzeLegali);
  const mediaPunti =
    puntiLegali.length === 0
      ? 0
      : puntiLegali.reduce((somma, n) => somma + n, 0) / puntiLegali.length;
  const mediaForza =
    forzeLegali.length === 0
      ? 0
      : forzeLegali.reduce((somma, n) => somma + n, 0) / forzeLegali.length;
  const trionfiChePrendono = vista.legali.filter(
    (altra) => altra.suit === vista.trump && possoVincere(vista, altra),
  );
  const trionfoPiuBassoChePrende =
    trionfiChePrendono.length === 0
      ? null
      : trionfiChePrendono.reduce((minima, altra) =>
          cardStrength(altra.rank) < cardStrength(minima.rank) ? altra : minima,
        );

  return {
    e_di_trionfo: siNo(trionfo),
    e_padrona_del_palo: siNo(padrona),
    e_firma: siNo(firma),
    e_firma_laterale: siNo(firmaLaterale),
    e_maniglia: siNo(carta.rank === 7),
    e_asso: siNo(carta.rank === 'asso'),
    e_re: siNo(carta.rank === 're'),
    punti_della_carta: punti / 5,
    forza_della_carta: cardStrength(carta.rank) / 9,
    unica_del_palo: siNo(unica),
    carta_protetta: siNo(protetta),
    scartina_di_protezione: siNo(scartina),
    regalo_di_punti: siNo(regalo),
    punti_in_tavola: Math.min(puntiInTavola(vista.presaInCorso), 20) / 20,
    apro_la_presa: siNo(apre),
    presa_del_compagno: siNo(delCompagno),
    presa_dell_avversario: siNo(dellAvversario),
    presa_ancora_aperta: siNo(apre),
    posso_prenderla: siNo(prendo),
    rischio_di_perderla: rischio,
    posso_prenderla_sicuro: siNo(prendo && rischio <= 0),
    trionfi_degli_avversari: trionfiAvversariRimasti(vista) / 10,
    sono_chiamante: siNo(chiamante),
    sono_difensore: siNo(!chiamante && !liscio),
    basi_rimaste: vista.config.tricks === 0 ? 0 : preseRimaste(vista) / vista.config.tricks,
    sotto_la_soglia: siNo(sotto),
    sopra_la_soglia: siNo(!sotto),
    liscio: siNo(liscio),
    punti_sulla_presa_del_compagno: delCompagno ? punti / 5 : 0,
    punti_sulla_presa_avversaria: dellAvversario ? punti / 5 : 0,
    trionfo_sulla_presa_del_compagno: siNo(trionfo && delCompagno),
    trionfo_sulla_presa_avversaria: siNo(trionfo && dellAvversario),
    firma_in_apertura: siNo(firma && apre),
    firma_laterale_in_apertura: siNo(firmaLaterale && apre),
    regalo_in_apertura: siNo(regalo && apre),
    trionfo_in_apertura: siNo(trionfo && apre),
    punti_nel_liscio_se_prendo: liscio && prendo ? punti / 5 : 0,
    punti_nel_liscio_se_perdo: liscio && !prendo ? punti / 5 : 0,
    protetta_sulla_presa_del_compagno: siNo(protetta && delCompagno),
    scartina_sulla_presa_del_compagno: siNo(scartina && delCompagno),
    e_la_piu_magra: siNo(punti === minPunti),
    e_la_piu_grassa: siNo(punti === maxPunti),
    e_la_piu_bassa: siNo(cardStrength(carta.rank) === minForza),
    e_la_piu_alta: siNo(cardStrength(carta.rank) === maxForza),
    e_il_trionfo_piu_basso_che_prende: siNo(
      trionfoPiuBassoChePrende !== null && trionfoPiuBassoChePrende.id === carta.id,
    ),
    punti_sopra_la_media_legale: (punti - mediaPunti) / 5,
    forza_sopra_la_media_legale: (cardStrength(carta.rank) - mediaForza) / 9,
  };
}

/** Per non lasciare una caratteristica senza parola o senza numero. */
export function vettoreVuoto(): Vettore {
  const vuoto = {} as Vettore;
  for (const nome of NOMI) vuoto[nome] = 0;
  return vuoto;
}

/** Il prodotto scalare: il punteggio grezzo di una mossa. */
export function prodotto(vettore: Vettore, pesi: Vettore): number {
  let somma = 0;
  for (const nome of NOMI) somma += vettore[nome] * pesi[nome];
  return somma;
}

export function sommaVettori(a: Vettore, b: Vettore, coefficiente = 1): Vettore {
  const somma = vettoreVuoto();
  for (const nome of NOMI) somma[nome] = a[nome] + coefficiente * b[nome];
  return somma;
}

export function scalaVettore(vettore: Vettore, coefficiente: number): Vettore {
  const scalato = vettoreVuoto();
  for (const nome of NOMI) scalato[nome] = vettore[nome] * coefficiente;
  return scalato;
}

/** Media dei vettori: il centro delle mosse legali, per l'aggiornamento. */
export function mediaVettori(vettori: readonly Vettore[]): Vettore {
  const media = vettoreVuoto();
  if (vettori.length === 0) return media;
  for (const vettore of vettori) {
    for (const nome of NOMI) media[nome] += vettore[nome];
  }
  for (const nome of NOMI) media[nome] /= vettori.length;
  return media;
}
