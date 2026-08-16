import type { Card, Rng, Suit } from '@mediatore/engine';
import { RANKS, cardPoints, cardStrength, penalitaDaSoglia } from '@mediatore/engine';
import {
  cartaPiuAltaRimasta,
  carteNonAncoraViste,
  carteUscite,
  eFirma,
  eSemeFinito,
  semeDiMano,
  trionfiAvversariRimasti,
  trionfiRimasti,
} from './memoria.ts';
import type { Parametri } from './parametri.ts';
import { PARAMETRI_DI_SERIE } from './parametri.ts';
import {
  cartaVincente,
  giocatoriDopoDiMe,
  possoVincere,
  postaDellaPresa,
  rischioDiPerdere,
} from './valuta.ts';
import type { VistaDelBot } from './vista.ts';
import { alleatoDi, preseRimaste, puntiDeiMiei, sonoIlChiamante, sonoLAmicoNascosto } from './vista.ts';
import { beats, currentWinner } from '@mediatore/engine';

/**
 * Una presa senza nemmeno una carta a punti: in tavola c'e' solo il punto
 * della base, che e' quanto vale una presa vuota.
 */
const PRESA_VUOTA = 1;

/** Sotto questo rischio la presa del compagno si puo' dare per fatta. */
const RISCHIO_TRASCURABILE = 0.15;

/** Fin qui vale la pena provarci; oltre, si sta solo regalando la carta. */
const RISCHIO_ACCETTABILE = 0.4;

/** Da qui in fondo non si tiene piu' niente di riserva: non c'e' un dopo. */
const FINE_SMAZZATA = 3;

/**
 * La soglia piu' bassa che riguarda il chiamante, chiesta all'engine invece
 * che scritta qui: se un giorno le regole cambiano, il bot se ne accorge.
 */
function sogliaPiuBassa(players: number): number {
  const massima = penalitaDaSoglia(0, players);
  for (let punti = 1; punti <= 60; punti += 1) {
    if (penalitaDaSoglia(punti, players) < massima) return punti;
  }
  return 0;
}

/**
 * Fra mosse che si equivalgono sceglie l'rng, non l'ordine delle carte in
 * mano: un bot che nella stessa situazione gioca sempre la stessa carta si
 * riconosce dopo tre smazzate.
 */
function scegliFra(carte: Card[], rng: Rng): Card {
  const prima = carte[0];
  if (prima === undefined) throw new Error('nessuna carta fra cui scegliere');
  const indice = Math.min(carte.length - 1, Math.floor(rng() * carte.length));
  return carte[indice] ?? prima;
}

/** Tutte le carte a pari merito secondo quel metro, non solo la prima. */
function migliori(carte: readonly Card[], punteggio: (carta: Card) => number): Card[] {
  const scelte: Card[] = [];
  let massimo = -Infinity;
  for (const carta of carte) {
    const valore = punteggio(carta);
    if (valore > massimo + 1e-9) {
      massimo = valore;
      scelte.length = 0;
      scelte.push(carta);
    } else if (valore >= massimo - 1e-9) {
      scelte.push(carta);
    }
  }
  return scelte;
}

/**
 * Quanto dispiace separarsi da una carta: i punti che regala, la forza che
 * non avro' piu' e il fatto che i trionfi valgono piu' del loro seme.
 */
function costoDiPerderla(vista: VistaDelBot, carta: Card): number {
  const trionfo = carta.suit === vista.trump ? 4 : 0;
  return cardPoints(carta.rank) + cardStrength(carta.rank) / 3 + trionfo;
}

function scartaLaPiuInutile(vista: VistaDelBot, carte: readonly Card[], rng: Rng): Card {
  const intoccabili = intoccabiliDellaMano(vista);
  const libere = carte.filter((carta) => !intoccabili.has(carta.id));
  const pool = libere.length > 0 ? libere : carte;
  return scegliFra(
    migliori(pool, (carta) => -costoDiPerderla(vista, carta)),
    rng,
  );
}

/**
 * La presa se la porta via un avversario e non c'e' modo di impedirlo: quello
 * che ci si mette gli e' regalato, quindi ci va la scartina e mai una carta a
 * punti. Contro una maniglia non c'e' niente da fare, e infilarci il cavallo
 * sono due punti dati via per niente.
 *
 * I punti vengono prima di tutto il resto. Il conto di quanto serve una carta
 * per dopo conta un trionfo quanto un asso, ed e' giusto quando si sceglie
 * fra carte che pagano lo stesso — ma su una presa persa faceva preferire il
 * fante degli altri alla propria scartina di trionfo, cioe' pagava un punto
 * per tenersi un due.
 */
function buttaSullaPresaPersa(vista: VistaDelBot, carte: readonly Card[], rng: Rng): Card {
  const magre = migliori(carte, (carta) => -cardPoints(carta.rank));
  return scartaLaPiuInutile(vista, magre, rng);
}

/**
 * Sulla presa si carica: piu' punti possibile, spendendo il meno possibile. I
 * trionfi restano fuori finche' c'e' altro, perche' un trionfo alto buttato
 * su una presa gia' fatta e' una presa in meno per dopo.
 */
function caricaPunti(vista: VistaDelBot, carte: readonly Card[], rng: Rng): Card {
  const fuoriTrionfo = carte.filter((carta) => carta.suit !== vista.trump);
  const pool = fuoriTrionfo.length > 0 ? fuoriTrionfo : carte;
  const grasse = migliori(pool, (carta) => cardPoints(carta.rank));
  return scegliFra(
    migliori(grasse, (carta) => -costoDiPerderla(vista, carta)),
    rng,
  );
}

/** Padrona: in quel seme non e' rimasto niente che la superi. */
export function ePadrona(vista: VistaDelBot, carta: Card): boolean {
  const alta = cartaPiuAltaRimasta(vista, carta.suit);
  return alta === null || cardStrength(carta.rank) > cardStrength(alta.rank);
}

/**
 * I miei trionfi di comando: quelli che battono il trionfo piu' alto ancora in
 * giro, cioe' quelli che la presa la vincono. Il metro sono le carte degli
 * altri, non la propria scala interna: con asso e cavallo in mano e il re
 * ancora fuori, di comando c'e' il solo asso, perche' il cavallo il re se lo
 * porta via.
 */
function trionfiDiComando(vista: VistaDelBot, legali: readonly Card[]): Card[] {
  return legali.filter((carta) => carta.suit === vista.trump && ePadrona(vista, carta));
}

/**
 * La carta da sacrificare per far diventare firma quella sopra: si tira il re
 * sapendo che la maniglia se lo prende, e da quel momento l'asso comanda il
 * palo. Serve avere due carte alte di seguito, e sopra le mie deve restare
 * quella sola: se ne girano due, il conto non torna piu' e si sta solo
 * regalando una presa.
 *
 * Se sopra la mia piu' alta non gira piu' niente non c'e' nulla da liberare, e
 * qui non c'e' nessun sacrificio da fare: quella prende da sola. E' l'errore
 * del caso vero — asso e cavallo in mano, il re fuori e la maniglia gia'
 * uscita: uscire dal cavallo non liberava l'asso, che vinceva comunque, e
 * quella presa era un regalo.
 */
function daSacrificare(mie: readonly Card[], ignote: readonly Card[]): Card | null {
  const scala = [...mie].sort((a, b) => cardStrength(b.rank) - cardStrength(a.rank));
  const prima = scala[0];
  const seconda = scala[1];
  if (prima === undefined || seconda === undefined) return null;

  const sopra = (carta: Card): number =>
    ignote.filter((altra) => cardStrength(altra.rank) > cardStrength(carta.rank)).length;
  return sopra(prima) === 1 && sopra(seconda) === 1 ? seconda : null;
}

/**
 * Le scartine sotto una carta alta, in un palo qualunque: i due sotto il re
 * terzo, quello sotto l'asso secondo. Ogni carta ancora in giro sopra la
 * mia e' una tirata a cui bisogna poter rispondere con una scartina; se le
 * scartine bastano, la carta alta arriva in fondo viva e diventa firma.
 *
 * Se non bastano non c'e' niente da proteggere: un re secondo cade lo
 * stesso, e allora quelle carte tornano spendibili.
 */
function daProteggereNelPalo(
  mano: readonly Card[],
  palo: Suit,
  tirate: number,
): { alta: Card; scorta: Card[] } | null {
  const delPalo = mano.filter((carta) => carta.suit === palo);
  const alte = delPalo.filter((carta) => cardStrength(carta.rank) >= cardStrength('re'));
  if (alte.length === 0 || tirate === 0) return null;

  const alta = alte.reduce((massima, carta) =>
    cardStrength(carta.rank) > cardStrength(massima.rank) ? carta : massima,
  );
  const bassi = delPalo
    .filter((carta) => cardStrength(carta.rank) < cardStrength(alta.rank))
    .sort((a, b) => cardStrength(a.rank) - cardStrength(b.rank));
  if (bassi.length < tirate) return null;
  return { alta, scorta: bassi.slice(0, tirate) };
}

function tirateSopraInGiro(vista: VistaDelBot, palo: Suit, alta: Card): number {
  return carteNonAncoraViste(vista).filter(
    (altra) => altra.suit === palo && cardStrength(altra.rank) > cardStrength(alta.rank),
  ).length;
}

/**
 * In ogni palo, la carta alta protetta e le scartine che la tengono in
 * vita. Vale nel trionfo come nei laterali: il re terzo di bastoni e' la
 * stessa struttura del re terzo di trionfo.
 */
function protezioniDellaMano(vista: VistaDelBot): { alta: Card; scorta: Card[] }[] {
  const pali = [...new Set(vista.mano.map((carta) => carta.suit))];
  const trovate: { alta: Card; scorta: Card[] }[] = [];
  for (const palo of pali) {
    const delPalo = vista.mano.filter((carta) => carta.suit === palo);
    const alta = delPalo
      .filter((carta) => cardStrength(carta.rank) >= cardStrength('re'))
      .reduce<Card | null>(
        (massima, carta) =>
          massima === null || cardStrength(carta.rank) > cardStrength(massima.rank)
            ? carta
            : massima,
        null,
      );
    if (alta === null) continue;
    const trovata = daProteggereNelPalo(vista.mano, palo, tirateSopraInGiro(vista, palo, alta));
    if (trovata !== null) trovate.push(trovata);
  }
  return trovate;
}

/** Quelle carte non si toccano: o sono la presa futura, o la tengono in piedi. */
function intoccabiliDellaMano(vista: VistaDelBot): Set<string> {
  const ids = new Set<string>();
  for (const { alta, scorta } of protezioniDellaMano(vista)) {
    ids.add(alta.id);
    for (const carta of scorta) ids.add(carta.id);
  }
  return ids;
}

/**
 * I trionfi bassi che stanno sotto una carta alta e la tengono in vita: i due
 * sotto il re terzo, quello sotto l'asso secondo.
 *
 * Il conto e' quello del tavolo: sopra il re ci sono maniglia e asso, sopra
 * l'asso c'e' la sola maniglia. Il chiamante prima o poi si arrassa; sotto
 * le sue tirate si buttano i trionfi bassi, e la carta alta arriva in fondo
 * viva. Bruciare una di quelle scartine per uccidere vuol dire ritrovarsi a
 * mettere la carta alta sotto la sua, e la base e' persa.
 */
export function trionfiDaProteggere(mano: readonly Card[], trump: Suit): Card[] {
  const trionfi = mano.filter((carta) => carta.suit === trump);
  const alte = trionfi.filter((carta) => cardStrength(carta.rank) >= cardStrength('re'));
  if (alte.length === 0) return [];
  const migliore = alte.reduce((massima, carta) =>
    cardStrength(carta.rank) > cardStrength(massima.rank) ? carta : massima,
  );
  const miei = new Set(trionfi.map((carta) => carta.rank));
  const tirate = RANKS.filter(
    (rank) => cardStrength(rank) > cardStrength(migliore.rank) && !miei.has(rank),
  ).length;
  return daProteggereNelPalo(mano, trump, tirate)?.scorta ?? [];
}

/**
 * Se i propri trionfi bastano a ripulire davvero gli avversari.
 *
 * Il conto e' in giri. Ogni giro di trionfo costa un trionfo di mano e ne tira
 * fuori uno di loro: su piu' di uno per giro non si conta, perche' chi di
 * trionfo e' privo scarta e non paga niente. I giri che si riesce a tirare
 * sono quindi i trionfi che si hanno, e i giri che servirebbero sono i trionfi
 * che restano a loro.
 *
 * Se dopo aver speso tutti i propri gli avversari ne hanno ancora, quei giri
 * non hanno ripulito nessuno: si sono bruciate le proprie carte di comando su
 * prese vuote, e le carte laterali sono rimaste esposte al taglio come prima.
 *
 * Il caso vero: chiamante con 7, asso e 6 di trionfo, tre su dieci, gli altri
 * sei. Ha tirato 7 e asso, gli avversari avevano ancora il re e il fante, e
 * alla presa dopo l'asso di denari se l'e' preso il re di trionfo.
 *
 * A 5 con l'amico il conto cambia: i trionfi in giro sono divisi fra quattro
 * persone, e un giro solo ne tira fuori parecchi. Chiedere di averne tanti
 * quanti ne restano a tutti insieme vuol dire non arrassarsi quasi mai, e
 * le laterali — le proprie e quella dell'amico — vengono tagliate una dopo
 * l'altra. Li' bastano i giri per svuotare chi ne ha di piu', non la somma.
 */
export function trionfiBastanoARipulire(vista: VistaDelBot): boolean {
  const giriChePossoTirare = vista.mano.filter((carta) => carta.suit === vista.trump).length;
  const loro = trionfiAvversariRimasti(vista);
  if (vista.alliance.kind !== 'amico') return giriChePossoTirare >= loro;
  const chiPuo = avversariCheTengonoTrionfo(vista);
  if (chiPuo === 0) return true;
  return giriChePossoTirare >= Math.ceil(loro / chiPuo);
}

function avversariCheTengonoTrionfo(vista: VistaDelBot): number {
  let quanti = 0;
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (alleatoDi(vista, seat)) continue;
    if (eSemeFinito(vista, seat, vista.trump)) continue;
    quanti += 1;
  }
  return quanti;
}

/**
 * Le carte laterali che comandano il loro palo ma che qualcuno puo' ancora
 * uccidere, perche' di quel palo si e' gia' visto che e' privo. Sono basi
 * con la data di scadenza: o si incassano adesso, o se le prende il taglio.
 *
 * E' un freno che vede solo i vuoti dimostrati, quelli in cui qualcuno non ha
 * risposto a seme: nelle prime prese non ha ancora niente da vedere, e da
 * solo non tiene. Quello che tiene sempre e' il conto dei trionfi.
 */
function basiInPericolo(vista: VistaDelBot): Card[] {
  return vista.mano.filter((carta) => {
    if (carta.suit === vista.trump) return false;
    if (!ePadrona(vista, carta)) return false;
    for (let seat = 0; seat < vista.config.players; seat += 1) {
      if (alleatoDi(vista, seat)) continue;
      if (eSemeFinito(vista, seat, vista.trump)) continue;
      if (eSemeFinito(vista, seat, carta.suit)) return true;
    }
    return false;
  });
}

/**
 * Le laterali che comandano il loro palo: appena in giro non resta un
 * trionfo diventano firme, e da li' nessuno le uccide piu'. E' il motivo
 * per cui un difensore tira l'ultimo trionfo.
 */
function lateraliCheDiventanoFirme(vista: VistaDelBot): Card[] {
  return vista.mano.filter((carta) => carta.suit !== vista.trump && ePadrona(vista, carta));
}

/**
 * Il difensore tira trionfo per se', non per ripulire: solo se questo colpo
 * si porta via l'ultimo rimasto e in mano ha laterali che da quel momento
 * nessuno puo' piu' tagliare. Meglio ancora se il chiamante di quel palo
 * e' gia' vuoto, ma le laterali bastano: tanto i trionfi sono finiti.
 */
function chiudeIlGiocoASuoFavore(vista: VistaDelBot): boolean {
  if (trionfiAvversariRimasti(vista) !== 1) return false;
  return lateraliCheDiventanoFirme(vista).length > 0;
}

/**
 * Quando tirare trionfo di propria iniziativa ha un senso. Vale per ogni
 * trionfo tirato per scelta, firma compresa: sono gli stessi freni.
 *
 * Il primo vale per tutti: se gli avversari sono gia' a zero trionfi,
 * continuare e' spendere il proprio comando su prese vuote, e loro intanto
 * scartano quello che non serve e si tengono i punti. Da li' in poi si va a
 * incassare nei pali laterali.
 *
 * Gli altri due riguardano il chiamante, perche' e' lui che si arrassa.
 * `siArrassa` lo ferma gia' dal tirare due trionfi di fila: questo freno
 * deve coprire anche l'apertura singola, la maniglia buttata sulla presa
 * vuota. Prima il difensore passava di qui con un si' automatico, e la
 * maniglia se ne andava per niente.
 *
 * Il secondo, e viene prima di quello dopo, e' che i trionfi bastino a
 * finirli: con pochi trionfi non li si ripulisce, e arrassarsi diventa un
 * suicidio — si brucia il proprio comando su prese vuote e le carte laterali
 * restano tagliabili come prima.
 *
 * Il terzo e' avere basi laterali che qualcuno puo' ancora tagliare: quelle
 * si incassano prima, che ad arrassarsi si fa sempre in tempo. A 5 con
 * l'amico l'arrassata viene prima: quattro avversari restano vuoti di un
 * palo in un attimo, e le laterali — le proprie e quella dell'amico —
 * muoiono se i trionfi restano in giro.
 *
 * Il difensore tira solo se chiude il gioco a suo favore, o se e' l'ultima
 * base e la firma si incassa. Fuori da li' apre in un altro palo.
 */
function convieneTirareTrionfo(vista: VistaDelBot): boolean {
  if (sonoIlChiamante(vista)) {
    if (trionfiAvversariRimasti(vista) === 0) return false;
    if (!trionfiBastanoARipulire(vista)) return false;
    if (vista.alliance.kind === 'amico') return true;
    return basiInPericolo(vista).length === 0;
  }
  if (preseRimaste(vista) <= 1) return true;
  if (trionfiAvversariRimasti(vista) === 0) return false;
  return chiudeIlGiocoASuoFavore(vista);
}

/**
 * Arrassarsi: tirare trionfo di propria iniziativa per farli uscire agli
 * altri. Lo fa il chiamante, perche' ogni giro tolto e' un taglio in meno
 * contro le sue basi; chi non ha chiamato non ha motivo di scoprirsi.
 *
 * Oltre ai freni di sempre ne serve uno proprio: un trionfo solo non si tira,
 * che poi non se ne ha piu'.
 *
 * E ci vuole una carta con cui uscire, che e' una di due cose: una che batte il
 * trionfo piu' alto in giro, e allora la presa e' mia, oppure la seconda di due
 * carte alte di seguito, e allora la si sacrifica per far uscire quella sopra e
 * liberare la prima. Un trionfo che gli altri si portano via senza che liberi
 * niente non e' un'arrassata, e' una presa regalata.
 */
function siArrassa(vista: VistaDelBot, legali: readonly Card[]): boolean {
  if (!sonoIlChiamante(vista)) return false;
  if (!convieneTirareTrionfo(vista)) return false;

  const miei = legali.filter((carta) => carta.suit === vista.trump);
  if (miei.length < 2) return false;

  if (trionfiDiComando(vista, legali).length > 0) return true;
  return daSacrificare(miei, trionfiRimasti(vista)) !== null;
}

/**
 * Con quale trionfo arrassarsi.
 *
 * Prima cosa: se in mano c'e' qualcosa che batte il trionfo piu' alto ancora in
 * giro, esce quello, e fra quelli la piu' bassa che basta — le superiori
 * restano in mano, che sono firme e la presa la faranno quando serve. Con asso
 * e cavallo e il re fuori esce l'asso: si porta via il re e il cavallo resta
 * firma. Uscire dal cavallo sarebbe regalare la presa e il comando.
 *
 * Sacrificare — uscire con una carta piu' bassa perche' se la prenda quella
 * degli altri — serve solo quando sopra la propria piu' alta gira ancora
 * qualcosa da far uscire: allora si tira la seconda, la maniglia esce a
 * prendersela e la prima diventa firma. Con asso, re, 5, 4 e 2 e la maniglia
 * ancora fuori il giocatore vero esce dal re e si tiene l'asso.
 *
 * Se sono tutti firme e' indifferente: sopra non c'e' piu' niente, esce quello
 * che capita.
 */
function arrassata(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const miei = legali.filter((carta) => carta.suit === vista.trump);
  if (miei.length > 0 && miei.every((carta) => eFirma(vista, carta))) {
    return scegliFra(miei, rng);
  }

  const comando = trionfiDiComando(vista, legali);
  if (comando.length > 0) {
    return scegliFra(
      migliori(comando, (carta) => -cardStrength(carta.rank)),
      rng,
    );
  }

  return daSacrificare(miei, trionfiRimasti(vista)) ?? scegliFra(miei, rng);
}

/**
 * Il sacrificio nei pali laterali: nel trionfo il momento di tirare lo decide
 * l'arrassata, che sa anche se agli altri i trionfi sono finiti.
 */
function perRendereFirmaLAltra(vista: VistaDelBot, legali: readonly Card[]): Card | null {
  const ignote = carteNonAncoraViste(vista);
  const pali = [...new Set(legali.map((carta) => carta.suit))].filter(
    (palo) => palo !== vista.trump,
  );

  for (const palo of pali) {
    const scelta = daSacrificare(
      legali.filter((carta) => carta.suit === palo),
      ignote.filter((altra) => altra.suit === palo),
    );
    if (scelta !== null) return scelta;
  }
  return null;
}

/**
 * Le carte con cui aprire sarebbe regalare punti. Un asso senza il suo 7 non
 * e' una base: la maniglia lo batte sempre, e chi apre con quello mette
 * quattro punti sul tavolo per il primo che li vuole. Vale per ogni carta a
 * punti che non comanda il suo palo — il re sotto l'asso, il cavallo sotto il
 * re — perche' aprire e' scoprirsi per primi, e chi viene dopo sceglie.
 *
 * Il trionfo non e' di questa lista: da tirarlo o no lo decidono l'arrassata e
 * i suoi freni, che stanno piu' sopra.
 */
function regaloDiPunti(vista: VistaDelBot, carta: Card): boolean {
  if (carta.suit === vista.trump) return false;
  if (cardPoints(carta.rank) === 0) return false;
  return !ePadrona(vista, carta);
}

/**
 * Da qui in su il regalo e' grosso: il re e l'asso. Per non metterli sul tavolo
 * vale la pena di bruciare una scartina di trionfo; per un fante o un cavallo
 * no, che il trionfo in mano vale piu' di quel punto.
 */
const REGALO_GROSSO = 3;

/**
 * Da qui in su il chiamante ha trionfi in abbondanza: insistere in un palo
 * di cui e' gia' vuoto gli regala prese da tagliare, senza costargli la
 * forza. Con uno o due invece conviene continuare: ogni taglio gliene toglie
 * uno, e quando li ha finiti le carte dei difensori diventano imprendibili.
 */
const MOLTI_TRIONFI_DEL_CHIAMANTE = 3;

/**
 * Da qui in su, di un palo, ne sono uscite abbastanza da dire che il
 * chiamante e' corto: su dieci carte, sei gia' viste ne lasciano quattro
 * in giro, e qualcuno e' rimasto senza.
 */
const CARTE_USCITE_PER_ESSERE_CORTO = 6;

function chiamanteDelTavolo(vista: VistaDelBot): number | null {
  return vista.alliance.kind === 'liscio' ? null : vista.alliance.caller;
}

/** Chi sta contro il chiamante, non con lui: l'amico non e' di questa parte. */
function sonoDifensore(vista: VistaDelBot): boolean {
  const chiamante = chiamanteDelTavolo(vista);
  if (chiamante === null) return false;
  return !alleatoDi(vista, chiamante);
}

/**
 * Quanti trionfi puo' ancora avere il chiamante. E' un tetto, non un conto
 * esatto: non gli si vedono le carte, si sa solo quante gliene restano in
 * mano e quanti trionfi non sono ancora usciti.
 */
function trionfiPossibiliDelChiamante(vista: VistaDelBot): number {
  const chiamante = chiamanteDelTavolo(vista);
  if (chiamante === null) return 0;
  if (eSemeFinito(vista, chiamante, vista.trump)) return 0;
  const inGiro = trionfiRimasti(vista).length;
  const inMano = vista.carteInMano[chiamante] ?? 0;
  return Math.min(inGiro, inMano);
}

function carteUsciteDelPalo(vista: VistaDelBot, palo: Suit): number {
  return carteUscite(vista).filter((carta) => carta.suit === palo).length;
}

function ilChiamanteHaRispostoASeme(
  vista: VistaDelBot,
  giocate: readonly { player: number; card: Card }[],
  palo: Suit,
): boolean {
  const chiamante = chiamanteDelTavolo(vista);
  if (chiamante === null) return false;
  const sua = giocate.find((giocata) => giocata.player === chiamante);
  return sua !== undefined && sua.card.suit === palo;
}

/**
 * Il palo che il difensore ha gia' aperto e in cui il chiamante ha
 * risposto a seme: li' si insiste, finche' se ne hanno carte.
 *
 * Il chiamante ha mostrato di avere quel palo, quindi o ne ha ancora e deve
 * rispondere — le sue carte si consumano senza tagliare — o e' rimasto
 * vuoto e deve uccidere, spendendo un trionfo. In tutti e due i casi la
 * difesa guadagna. Non conta se le carte rimaste comandano il palo: il
 * punto non e' vincere la base, e' costringerlo a consumare o a scoprirsi.
 *
 * Non si insiste se nel frattempo ha mostrato di essere vuoto, ne' se c'e'
 * una firma laterale che qualcuno puo' ancora tagliare: quella si incassa
 * prima, che dopo non c'e' piu'.
 */
function paloDaInsistere(vista: VistaDelBot, legali: readonly Card[]): Suit | null {
  if (!sonoDifensore(vista)) return null;
  const chiamante = chiamanteDelTavolo(vista);
  if (chiamante === null) return null;
  if (basiInPericolo(vista).some((carta) => legali.some((legale) => legale.id === carta.id))) {
    return null;
  }

  for (let i = vista.preseCompletate.length - 1; i >= 0; i -= 1) {
    const presa = vista.preseCompletate[i];
    if (presa === undefined) continue;
    const prima = presa.cards[0];
    if (prima === undefined) continue;
    // L'ha aperto un difensore, non per forza io: se il compagno ha la
    // base, deve continuare lui. Altrimenti l'attacco muore appena la
    // scartina perde la presa.
    if (!alleatoDi(vista, prima.player)) continue;
    const palo = prima.card.suit;
    if (palo === vista.trump) continue;
    if (!ilChiamanteHaRispostoASeme(vista, presa.cards, palo)) continue;
    if (eSemeFinito(vista, chiamante, palo)) continue;
    if (!legali.some((carta) => carta.suit === palo)) continue;
    return palo;
  }
  return null;
}

/**
 * Quanto quel palo serve a far uccidere il chiamante. Piu' carte se ne sono
 * gia' viste, piu' e' corto — o vuoto. Se e' vuoto e gli restano pochi
 * trionfi, e' il palo da aprire: ogni taglio gliene toglie uno. Se e' vuoto
 * e ne ha ancora tanti, e' il palo da non toccare: gli si regalerebbero
 * prese.
 */
function punteggioPaloPerUccidere(vista: VistaDelBot, palo: Suit): number {
  if (palo === vista.trump) return Number.NEGATIVE_INFINITY;
  const chiamante = chiamanteDelTavolo(vista);
  if (chiamante === null) return 0;
  const uscite = carteUsciteDelPalo(vista, palo);
  if (eSemeFinito(vista, chiamante, palo)) {
    return trionfiPossibiliDelChiamante(vista) >= MOLTI_TRIONFI_DEL_CHIAMANTE
      ? -1000 + uscite
      : 1000 + uscite;
  }
  return uscite >= CARTE_USCITE_PER_ESSERE_CORTO ? uscite : 0;
}

/**
 * Il palo in cui il chiamante e' piu' probabilmente vuoto o corto: quello
 * dove sono gia' uscite piu' carte, o dove ha gia' scartato invece di
 * rispondere. A parita' si esce dal seme meno caro, come prima.
 */
function paloCheLoFaUccidere(vista: VistaDelBot, legali: readonly Card[]): Suit | null {
  const semi = [...new Set(legali.map((carta) => carta.suit))];
  const fuoriTrionfo = semi.filter((seme) => seme !== vista.trump);
  const candidati = fuoriTrionfo.length > 0 ? fuoriTrionfo : semi;

  let scelti: Suit[] = [];
  let massimo = Number.NEGATIVE_INFINITY;
  for (const palo of candidati) {
    const punti = punteggioPaloPerUccidere(vista, palo);
    if (punti > massimo + 1e-9) {
      massimo = punti;
      scelti = [palo];
    } else if (punti >= massimo - 1e-9) {
      scelti.push(palo);
    }
  }
  if (scelti.length === 1) return scelti[0] ?? null;
  const fraQuelli = legali.filter((carta) => scelti.includes(carta.suit));
  return semeMenoCaro(vista, fraQuelli);
}

function dalPaloAperto(
  vista: VistaDelBot,
  legali: readonly Card[],
  palo: Suit,
  rng: Rng,
): Card {
  const delPalo = legali.filter((carta) => carta.suit === palo);
  const pulite = delPalo.filter((carta) => !regaloDiPunti(vista, carta));
  const pool = pulite.length > 0 ? pulite : delPalo;
  const padrone = pool.filter((carta) => ePadrona(vista, carta));
  if (padrone.length > 0) {
    return scegliFra(
      migliori(padrone, (carta) => cardPoints(carta.rank)),
      rng,
    );
  }
  return scartaLaPiuInutile(vista, pool, rng);
}

/** Il seme da cui si rischia meno ad aprire: quello dove ho meno punti. */
function semeMenoCaro(vista: VistaDelBot, legali: readonly Card[]): Suit | null {
  const semi = [...new Set(legali.map((carta) => carta.suit))];
  const fuoriTrionfo = semi.filter((seme) => seme !== vista.trump);
  const candidati = fuoriTrionfo.length > 0 ? fuoriTrionfo : semi;

  let scelto: Suit | null = null;
  let minimo = Infinity;
  for (const seme of candidati) {
    const punti = vista.mano
      .filter((carta) => carta.suit === seme)
      .reduce((somma, carta) => somma + cardPoints(carta.rank), 0);
    if (punti < minimo) {
      minimo = punti;
      scelto = seme;
    }
  }
  return scelto;
}

function inCorsaPerIlCappotto(vista: VistaDelBot): boolean {
  if (vista.preseCompletate.length === 0 || preseRimaste(vista) === 0) return false;
  return vista.preseCompletate.every((presa) => alleatoDi(vista, presa.winner));
}

/** Il chiamante che sta sotto soglia con poche prese in mano non ha piu' niente da risparmiare. */
function sottoSoglia(vista: VistaDelBot): boolean {
  if (!sonoIlChiamante(vista)) return false;
  if (preseRimaste(vista) > FINE_SMAZZATA) return false;
  return puntiDeiMiei(vista) < sogliaPiuBassa(vista.config.players);
}

function giocoAggressivo(vista: VistaDelBot): boolean {
  return sottoSoglia(vista) || inCorsaPerIlCappotto(vista) || preseRimaste(vista) <= FINE_SMAZZATA;
}

/**
 * Nel liscio perde chi fa piu' punti: la presa e' una disgrazia, non un
 * premio. L'unica eccezione e' il cappotto, che ribalta di nuovo l'esito, e
 * allora si prende tutto.
 */
function siGiocaAlContrario(vista: VistaDelBot): boolean {
  return vista.alliance.kind === 'liscio' && !inCorsaPerIlCappotto(vista);
}

function sfilaDalLiscio(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const perdenti = legali.filter((carta) => !possoVincere(vista, carta));
  if (perdenti.length > 0) {
    // Se la presa se la porta via un altro, tanto vale caricargliela di punti.
    return scegliFra(
      migliori(perdenti, (carta) => cardPoints(carta.rank)),
      rng,
    );
  }
  // Costretto a prendere: almeno si prende il meno possibile.
  return scegliFra(
    migliori(legali, (carta) => -cardPoints(carta.rank) - cardStrength(carta.rank) / 10),
    rng,
  );
}

function haGiaAperto(vista: VistaDelBot): boolean {
  return vista.preseCompletate.some((presa) => presa.cards[0]?.player === vista.io);
}

/**
 * L'amico, nascosto o scoperto. Lo si e' se si ha in mano la carta
 * chiamata, o se si e' gia' quella carta giocata: un difensore che
 * NON ce l'ha non passa di qui, neanche in variante amico.
 */
function eLAmico(vista: VistaDelBot): boolean {
  if (sonoLAmicoNascosto(vista)) return true;
  const { alliance } = vista;
  return alliance.kind === 'amico' && alliance.friend === vista.io;
}

function cartaChiamataInMano(vista: VistaDelBot, legali: readonly Card[]): Card | null {
  const { alliance } = vista;
  if (alliance.kind !== 'amico') return null;
  return legali.find((carta) => carta.id === alliance.calledCard) ?? null;
}

function eManigliaDiTrionfo(vista: VistaDelBot, carta: Card): boolean {
  return carta.suit === vista.trump && carta.rank === 7;
}

function haGiaGiocatoLaManigliaDiTrionfoChiamata(vista: VistaDelBot): boolean {
  if (vista.alliance.kind !== 'amico') return false;
  const id = vista.alliance.calledCard;
  return vista.preseCompletate.some((presa) =>
    presa.cards.some(
      (giocata) =>
        giocata.player === vista.io &&
        giocata.card.id === id &&
        eManigliaDiTrionfo(vista, giocata.card),
    ),
  );
}

/** Vuoto di un palo laterale: la scartina di trionfo li' serve da coltello. */
function haUnPaloLateraleVuoto(vista: VistaDelBot): boolean {
  const laterali = new Set(
    vista.mano.filter((carta) => carta.suit !== vista.trump).map((carta) => carta.suit),
  );
  return laterali.size < 3;
}

function scartinaDiTrionfo(legali: readonly Card[], trump: Suit): Card | null {
  const scartine = legali.filter((carta) => carta.suit === trump && cardPoints(carta.rank) === 0);
  if (scartine.length === 0) return null;
  return migliori(scartine, (carta) => -cardStrength(carta.rank))[0] ?? null;
}

/**
 * L'amico, quando apre. Tre cose, in quest'ordine:
 *
 * Se ha in mano la maniglia di trionfo chiamata, la gioca: prende di
 * sicuro, e il valore della presa vale piu' del segreto.
 *
 * Se l'ha gia' giocata e gli resta una scartina di trionfo, la tira per
 * passare la mano al chiamante — ma solo se non e' vuoto di un palo:
 * li' la scartina se la tiene per uccidere.
 *
 * Altrimenti, nascosto, tira trionfo UNA volta sola, la prima che apre.
 * Le volte dopo i trionfi restano per uccidere.
 */
function passaLaManoAlChiamante(
  vista: VistaDelBot,
  legali: readonly Card[],
  rng: Rng,
): Card | null {
  // Prima di tutto: questa logica e' dell'amico, non di chi sta contro.
  // Lo si riconosce dalla carta chiamata in mano (o gia' giocata). Senza
  // quella carta si e' difensori, e i trionfi restano per uccidere.
  if (!eLAmico(vista)) return null;

  const chiamata = cartaChiamataInMano(vista, legali);
  if (chiamata !== null && eManigliaDiTrionfo(vista, chiamata)) return chiamata;

  if (haGiaGiocatoLaManigliaDiTrionfoChiamata(vista)) {
    if (haUnPaloLateraleVuoto(vista)) return null;
    return scartinaDiTrionfo(legali, vista.trump);
  }

  if (!sonoLAmicoNascosto(vista)) return null;
  if (haGiaAperto(vista)) return null;
  const trionfi = legali.filter((carta) => carta.suit === vista.trump);
  if (trionfi.length === 0) return null;
  const { alliance } = vista;
  const coperti =
    alliance.kind === 'amico'
      ? trionfi.filter((carta) => carta.id !== alliance.calledCard)
      : trionfi;
  const pool = coperti.length > 0 ? coperti : trionfi;
  return scegliFra(
    migliori(pool, (carta) => -cardStrength(carta.rank) - cardPoints(carta.rank) / 10),
    rng,
  );
}

function apre(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const passaggio = passaLaManoAlChiamante(vista, legali, rng);
  if (passaggio !== null) return passaggio;

  const firme = legali.filter((carta) => eFirma(vista, carta));
  const laterali = firme.filter((carta) => carta.suit !== vista.trump);

  // Una firma laterale esiste solo quando in giro non c'e' piu' un trionfo,
  // perche' e' quello a renderla tale. Sono le basi da incassare, e si
  // comincia dalle piu' grasse: i trionfi restano in mano, gia' firme loro,
  // per quando serviranno.
  if (laterali.length > 0) {
    return scegliFra(
      migliori(laterali, (carta) => cardPoints(carta.rank)),
      rng,
    );
  }

  if (siArrassa(vista, legali)) return arrassata(vista, legali, rng);

  // Il trionfo firma non lo uccide nessuno, e finche' gli altri i trionfi li
  // hanno ancora e' anche un giro tolto a loro. A zero trionfi in giro invece
  // si tiene: quella presa e' gia' sua, e la fara' quando le serve.
  //
  // Tirarlo e' arrassarsi, quindi passa dagli stessi freni: era da qui che il
  // chiamante con tre trionfi su dieci se ne giocava due su prese vuote senza
  // ripulire nessuno, perche' il freno lo aveva solo l'arrassata di sotto.
  const trionfiFirma = firme.filter((carta) => carta.suit === vista.trump);
  if (trionfiFirma.length > 0 && convieneTirareTrionfo(vista)) {
    return scegliFra(
      migliori(trionfiFirma, (carta) => cardPoints(carta.rank)),
      rng,
    );
  }

  const padroneLaterali = legali.filter(
    (carta) => carta.suit !== vista.trump && ePadrona(vista, carta),
  );
  if (padroneLaterali.length > 0) {
    return scegliFra(
      migliori(padroneLaterali, (carta) => cardPoints(carta.rank)),
      rng,
    );
  }

  // Il difensore, se non ha una padrona da incassare, insiste nel palo
  // gia' aperto dalla difesa: il chiamante o risponde e si consuma, o
  // e' vuoto e deve uccidere.
  if (sonoDifensore(vista)) {
    const daInsistere = paloDaInsistere(vista, legali);
    if (daInsistere !== null) return dalPaloAperto(vista, legali, daInsistere, rng);
  }

  const sacrificio = perRendereFirmaLAltra(vista, legali);
  if (sacrificio !== null) return sacrificio;

  // Non restando niente da incassare si apre per uscire di mano. Il
  // difensore sceglie il palo che fa uccidere il chiamante prima; chi ha
  // chiamato esce dal seme dove si rischia meno, come prima.
  const fuoriTrionfo = legali.filter((carta) => carta.suit !== vista.trump);
  const pulite = fuoriTrionfo.filter((carta) => !regaloDiPunti(vista, carta));
  if (pulite.length > 0) {
    const palo = sonoDifensore(vista)
      ? paloCheLoFaUccidere(vista, pulite)
      : semeMenoCaro(vista, pulite);
    const dalPalo = pulite.filter((carta) => carta.suit === palo);
    return scartaLaPiuInutile(vista, dalPalo.length > 0 ? dalPalo : pulite, rng);
  }

  // Fuori dal trionfo paga tutto: allora si guarda quanto costa pagare, e nel
  // conto entra anche il trionfo. Una scartina di trionfo non vale un punto, e
  // in cambio tira fuori la maniglia: quello che si tiene sotto di lei si
  // libera. L'asso laterale invece sono quattro punti che se ne vanno insieme
  // alla presa. Era da qui che usciva l'asso secco anche quando in mano c'era
  // un 2 di trionfo che non serviva a niente.
  //
  // Lo fa il chiamante. Il difensore no: tirare l'unico trionfo con le
  // laterali alte e' un'arrassata, e vale lo stesso freno di sempre — anche
  // a 5 con l'amico, dove questo ramo non guardava la variante.
  const scartineDiTrionfo = legali.filter(
    (carta) => carta.suit === vista.trump && cardPoints(carta.rank) === 0,
  );
  const regaloPiuMagro = Math.min(...fuoriTrionfo.map((carta) => cardPoints(carta.rank)));
  const paganoTutti = fuoriTrionfo.length === 0 || regaloPiuMagro >= REGALO_GROSSO;
  if (
    scartineDiTrionfo.length > 0 &&
    paganoTutti &&
    (sonoIlChiamante(vista) || convieneTirareTrionfo(vista))
  ) {
    return scartaLaPiuInutile(vista, scartineDiTrionfo, rng);
  }

  if (fuoriTrionfo.length > 0) return scartaLaPiuInutile(vista, fuoriTrionfo, rng);
  return scartaLaPiuInutile(vista, legali, rng);
}

/** Sotto queste, di un palo, in giro c'e' gia' chi ne e' privo e taglia. */
const CARTE_PER_TAGLIARE = 4;

function chiamanteEPrivoDi(vista: VistaDelBot, palo: Suit): boolean {
  const alliance = vista.alliance;
  if (alliance.kind === 'liscio') return false;
  return eSemeFinito(vista, alliance.caller, palo);
}

/**
 * Dietro questa carta, in mano, ne resta un'altra che comanda ancora il palo:
 * e' la piu' alta di quel seme che puo' ancora comparire, lo stesso conto
 * delle firme. Si puo' caricare la prima senza buttar via una presa futura.
 */
function restaUnComandante(vista: VistaDelBot, carta: Card): boolean {
  return vista.mano.some(
    (altra) =>
      altra.id !== carta.id && altra.suit === carta.suit && ePadrona(vista, altra),
  );
}

/**
 * Se convenga scaricare punti sulla presa gia' vinta dal compagno. Sembra
 * ovvio e non lo e': l'asso che se ne va fa firma il re di quel palo, e quel
 * re puo' benissimo averlo il chiamante. Gli si e' regalata una base.
 *
 * Dall'altra parte c'e' il rischio opposto: se il chiamante di quel palo
 * resta senza, l'asso tenuto in mano se lo taglia, e quei punti non li vede
 * piu' nessuno. Chi ha ragione non si puo' sapere, si va a sentimento e
 * guardando quello che e' gia' uscito. Nel dubbio si scarta liscio e si
 * tiene: il giocatore vero carica poco piu' della meta' delle volte.
 *
 * Si carica solo una carta che non serve piu' come presa futura. Il re
 * terzo, nel laterale come nel trionfo, sopravvive alle tirate grazie alle
 * scartine: buttarlo e' regalare quella base. Resta il caso maniglia e
 * asso: esce la maniglia, l'asso resta firmo, e nessuna delle due e' una
 * protezione. La carta alta sola no: quella e' una presa futura.
 */
function cartaAltaSolaNelPalo(vista: VistaDelBot, carta: Card): boolean {
  if (cardStrength(carta.rank) < cardStrength('re')) return false;
  return !vista.mano.some((altra) => altra.id !== carta.id && altra.suit === carta.suit);
}

function convieneCaricare(vista: VistaDelBot, carta: Card): boolean {
  if (carta.suit === vista.trump) return false;
  // Ne' la carta alta protetta ne' le scartine che la tengono in piedi.
  if (intoccabiliDellaMano(vista).has(carta.id)) return false;
  // Dietro resta chi comanda: la presa futura e' salva, i punti vanno sopra.
  if (restaUnComandante(vista, carta)) return true;
  // Una firma non si regala: quella e' una presa, e la fa da se'.
  if (eFirma(vista, carta)) return false;

  const palo = carta.suit;
  const sopra = carteNonAncoraViste(vista).filter(
    (altra) => altra.suit === palo && cardStrength(altra.rank) > cardStrength(carta.rank),
  ).length;

  // Sopra la mia gira ancora chi comanda quel palo: spendendola non promuovo
  // niente a nessuno, e tenendola una base non la farei lo stesso. I punti
  // vanno sulla presa, che quella e' gia' vinta. La carta alta sola no:
  // quella resta una presa futura, anche se sopra le girano le sue.
  if (sopra > 0 && !cartaAltaSolaNelPalo(vista, carta)) return true;

  // La mia comanda il palo, e il chiamante di quel palo e' gia' rimasto
  // senza: il re non puo' averlo, e alla prima occasione me la uccide. Meglio
  // quei punti adesso che una base che non arrivera'.
  if (chiamanteEPrivoDi(vista, palo)) return true;

  // Del palo in giro ne restano quattro contate e i trionfi ci sono ancora:
  // qualcuno ne e' gia' privo, e alla prossima uscita quella carta la uccide.
  // Anche qui i punti stanno meglio sulla presa che in mano.
  const inGiro = carteNonAncoraViste(vista).filter((altra) => altra.suit === palo).length;
  if (inGiro <= CARTE_PER_TAGLIARE && trionfiAvversariRimasti(vista) > 0) return true;

  // Quadro incerto: il re di quel palo puo' benissimo averlo il chiamante, e
  // scaricargli sopra l'asso vuol dire fargli firma il re, cioe' regalargli
  // una base. Si scarta liscio e si tiene.
  return false;
}

/**
 * La presa se la prende per forza un compagno che deve ancora giocare.
 *
 * Vale quando del palo aperto ogni carta rimasta batte quella in tavola —
 * il 2 di trionfo, e in giro solo il re — e quelle carte non possono stare
 * che nelle mani dei compagni rimasti: chi ha gia' giocato non ha piu'
 * posto, e gli avversari di quel palo sono privi. Chi le ha deve rispondere
 * a seme, e qualunque carta giochi vince. Allora e' la stessa presa del
 * compagno, anche se lui non ha ancora messo.
 *
 * Non si conta il taglio. Chi ha ancora il palo aperto non puo' uccidere, e
 * chi e' privo non e' obbligato a farlo: darlo per fatto sarebbe regalare
 * i punti all'avversario.
 */
function unCompagnoSeLaPrendePerForza(vista: VistaDelBot): boolean {
  const sua = cartaVincente(vista);
  const vincitore = currentWinner(vista.presaInCorso);
  if (sua === null || vincitore === null) return false;
  if (alleatoDi(vista, vincitore)) return false;

  const seme = semeDiMano(vista);
  if (seme === null) return false;

  const ignote = carteNonAncoraViste(vista);
  const delSeme = ignote.filter((altra) => altra.suit === seme);
  if (delSeme.length === 0) return false;
  if (delSeme.some((altra) => !beats(altra, sua, vista.trump, seme))) return false;

  const dopo = giocatoriDopoDiMe(vista);
  const compagni = dopo.filter((seat) => alleatoDi(vista, seat));
  if (compagni.length === 0) return false;

  for (const seat of dopo) {
    if (alleatoDi(vista, seat)) continue;
    if (!eSemeFinito(vista, seat, seme)) return false;
  }

  let nascondigli = vista.monteVisibile.length > 0 ? 0 : vista.monteCoperto;
  for (let seat = 0; seat < vista.config.players; seat += 1) {
    if (seat === vista.io) continue;
    if (dopo.includes(seat)) continue;
    if (eSemeFinito(vista, seat, seme)) continue;
    nascondigli += vista.carteInMano[seat] ?? 0;
  }

  return delSeme.length > nascondigli;
}

/**
 * La presa la sta vincendo un compagno — o se la prende per forza, anche se
 * deve ancora giocare.
 *
 * Prima di tutto non gliela si porta via. Quella presa e' gia' della propria
 * parte: prendergliela col trionfo non ne guadagna una, brucia una carta che
 * serviva dopo e per giunta lascia la presa magra, che i punti non ce li ha
 * caricati nessuno. Il caso vero: a quattro, un difensore apre con la maniglia
 * di coppe, il chiamante ci va liscio, e l'ultimo difensore — privo di coppe e
 * con la presa gia' sicura — ci ha ucciso sopra col 5 di trionfo. Ci arrivava
 * dal conto di quanto costa perdere una carta, che ai trionfi da' un peso
 * fisso: fra un asso e un due di trionfo il due sembrava il piu' caro da dare,
 * e cosi' il trionfo usciva proprio dove non serviva a niente.
 *
 * Quindi si sceglie fra le carte che gliela lasciano, e le altre si guardano
 * solo se non c'e' nient'altro di legale da giocare.
 */
function presaDelCompagno(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const sua = cartaVincente(vista);
  const gliaLasciano =
    unCompagnoSeLaPrendePerForza(vista) ||
    sua === null ||
    rischioDiPerdere(vista, sua) <= RISCHIO_TRASCURABILE;
  const senzaRubargliela = legali.filter((carta) => !possoVincere(vista, carta));
  const scelte = senzaRubargliela.length > 0 ? senzaRubargliela : legali;

  if (!gliaLasciano) {
    // La presa e' del compagno solo per il momento: dietro c'e' ancora chi
    // passa sopra. Uccidergli sopra ha un senso in un caso solo, ed e' quando
    // la sua non comanda il palo: li' il pericolo e' una carta piu' alta di
    // quel palo — il chiamante in agguato con la maniglia, che deve ancora
    // giocare — e una scartina di trionfo se la mangia, cioe' vale piu' qui
    // che in mano.
    //
    // Se invece la sua e' gia' la piu' alta che gira, l'unico modo di perderla
    // e' un taglio, e un taglio non si ferma tagliandoci sopra: chi uccide
    // dopo di me passa sopra al mio trionfo come sarebbe passato sopra al suo,
    // e il trionfo l'ho speso per niente.
    const laPuoPerdereInPalo = sua !== null && !ePadrona(vista, sua);
    if (laPuoPerdereInPalo && staUccidendo(vista, legali)) {
      const coltelli = coltelliPerUccidere(vista, legali);
      if (coltelli.length > 0) return uccidiDalBasso(vista, coltelli);
    }
    return scartaLaPiuInutile(vista, scelte, rng);
  }

  const daCaricare = scelte.filter(
    (carta) => cardPoints(carta.rank) > 0 && convieneCaricare(vista, carta),
  );
  if (daCaricare.length === 0) return scartaLaPiuInutile(vista, scelte, rng);
  return caricaPunti(vista, daCaricare, rng);
}

/**
 * La presa e' gia' vinta: nessuno dietro puo' passarci sopra. Allora invece
 * della minima che basta si gioca una carta a punti, perche' quei punti se li
 * porta a casa chi prende, e chi prende sono io. Osservato: sette volte su
 * ventinove ha vinto caricando re, 7 o fante invece della carta minima.
 *
 * Non si carica con una padrona ne' con un trionfo: quelle non sono punti da
 * mettere al sicuro, sono prese future. Si carica quello che piu' avanti
 * rischia di finire sotto una carta piu' forte.
 */
function vinciCaricando(vista: VistaDelBot, certe: readonly Card[], rng: Rng): Card {
  const spendibili = certe.filter(
    (carta) =>
      carta.suit !== vista.trump &&
      cardPoints(carta.rank) > 0 &&
      !ePadrona(vista, carta),
  );
  if (spendibili.length === 0) return scartaLaPiuInutile(vista, certe, rng);
  return scegliFra(
    migliori(spendibili, (carta) => cardPoints(carta.rank)),
    rng,
  );
}

/**
 * Quando si lascia andare una presa che si poteva vincere. Quasi mai: nelle
 * partite vere, su dodici occasioni di strapparla agli avversari l'ha presa
 * dodici volte su dodici, anche per un punto solo. Resta un caso, e stretto:
 * la presa e' vuota, l'unico modo di vincerla e' bruciarci un trionfo di
 * comando, e la smazzata e' ancora lunga.
 */
function siPuoLasciarAndare(vista: VistaDelBot, carta: Card): boolean {
  if (giocoAggressivo(vista)) return false;
  if (carta.suit !== vista.trump) return false;
  if (cardStrength(carta.rank) < cardStrength('re')) return false;
  return postaDellaPresa(vista) <= PRESA_VUOTA;
}

/** Uccidere: si e' privi del palo aperto e si taglia con un trionfo. */
function staUccidendo(vista: VistaDelBot, legali: readonly Card[]): boolean {
  const palo = semeDiMano(vista);
  if (palo === null || palo === vista.trump) return false;
  return !legali.some((carta) => carta.suit === palo);
}

/** Da qui in su la presa vale troppo per rischiare di lasciarla andare. */
const PRESA_DA_NON_PERDERE = 10;

/**
 * Si uccide con il trionfo piu' basso che vince la presa, mai con la
 * maniglia. Il risparmio della carta e' l'ultimo dei motivi.
 *
 * Uccidendo con la maniglia, l'asso di trionfo — dovunque sia — diventa
 * firma all'istante, perche' la sola carta che lo teneva sotto e' appena
 * uscita: e' una base regalata a un avversario, e se ce l'aveva secca
 * arrassandosi gliela si sarebbe tirata fuori. Tenendo la maniglia invece
 * diventa firma il proprio re, e quello e' un altro comando da spendere per
 * togliere l'ultimo trionfo o per andare al cappotto.
 *
 * L'eccezione e' una sola, e rara: la presa vale moltissimo e dietro c'e'
 * ancora chi puo' sopra-uccidere. Allora si sale, ma solo fino al primo
 * trionfo che la mette al sicuro.
 */
function uccidiDalBasso(vista: VistaDelBot, trionfi: readonly Card[]): Card {
  const dalBasso = [...trionfi].sort((a, b) => cardStrength(a.rank) - cardStrength(b.rank));
  const minima = dalBasso[0];
  if (minima === undefined) throw new Error('nessun trionfo con cui uccidere');

  if (postaDellaPresa(vista) < PRESA_DA_NON_PERDERE) return minima;
  if (rischioDiPerdere(vista, minima) <= RISCHIO_TRASCURABILE) return minima;

  return dalBasso.find((carta) => rischioDiPerdere(vista, carta) <= RISCHIO_TRASCURABILE) ?? minima;
}

/**
 * I trionfi che si possono spendere per uccidere, ed e' una questione di
 * struttura, non di numero.
 *
 * Chi ha solo scartine di trionfo uccide: quelle non diventeranno mai firme e
 * in mano non valgono niente, mentre uccidendo diventano una presa e zombano
 * la carta con cui l'avversario stava per prendersela.
 *
 * Chi ha un re terzo o un asso secondo no: quei trionfi bassi sono la
 * protezione della carta alta, e la carta alta e' la base. Bruciata una
 * scartina per uccidere, alla tirata dopo la carta alta finisce sotto quella
 * del chiamante e la base e' persa.
 *
 * Sull'ultima presa non c'e' piu' niente da proteggere: si taglia e basta.
 */
function coltelliPerUccidere(vista: VistaDelBot, legali: readonly Card[]): Card[] {
  const trionfi = legali.filter(
    (carta) => carta.suit === vista.trump && possoVincere(vista, carta),
  );
  if (trionfi.length === 0) return [];

  const scorta =
    preseRimaste(vista) > 1
      ? (protezioniDellaMano(vista).find((p) => p.alta.suit === vista.trump)?.scorta ?? [])
      : [];
  if (scorta.length === 0) return trionfi;

  // Intoccabile e' anche la carta alta che quella scorta tiene in piedi: e' la
  // base da salvare, non un coltello.
  const intoccabili = new Set(scorta.map((carta) => carta.id));
  for (const carta of trionfi) {
    if (cardStrength(carta.rank) >= cardStrength('re')) intoccabili.add(carta.id);
  }
  return trionfi.filter((carta) => !intoccabili.has(carta.id));
}

function presaDaStrappare(
  vista: VistaDelBot,
  legali: readonly Card[],
  rng: Rng,
  parametri: Parametri,
): Card {
  const vincenti = legali.filter((carta) => possoVincere(vista, carta));
  if (vincenti.length === 0) return buttaSullaPresaPersa(vista, legali, rng);

  if (staUccidendo(vista, legali)) {
    const coltelli = coltelliPerUccidere(vista, legali);
    if (coltelli.length > 0) return uccidiDalBasso(vista, coltelli);

    // In mano ci sono solo trionfi da proteggere: la presa si lascia andare e
    // si scarta liscio. Se non c'e' altro da giocare si taglia lo stesso, che
    // una carta va messa comunque.
    const fuoriTrionfo = legali.filter((carta) => carta.suit !== vista.trump);
    if (fuoriTrionfo.length > 0) return buttaSullaPresaPersa(vista, fuoriTrionfo, rng);
    const trionfi = vincenti.filter((carta) => carta.suit === vista.trump);
    if (trionfi.length > 0) return uccidiDalBasso(vista, trionfi);
  }

  const certe = vincenti.filter(
    (carta) => rischioDiPerdere(vista, carta) <= parametri.gioco.rischioPerCaricare,
  );
  if (certe.length > 0) return vinciCaricando(vista, certe, rng);

  const tengono = vincenti.filter((carta) => rischioDiPerdere(vista, carta) <= RISCHIO_ACCETTABILE);
  // Si vince con la piu' bassa che basta: le altre servono dopo.
  const economica = scartaLaPiuInutile(vista, tengono.length > 0 ? tengono : vincenti, rng);

  if (!siPuoLasciarAndare(vista, economica)) return economica;

  const rinunce = legali.filter((carta) => !possoVincere(vista, carta));
  return rinunce.length > 0 ? buttaSullaPresaPersa(vista, rinunce, rng) : economica;
}

function decidi(
  vista: VistaDelBot,
  legali: readonly Card[],
  rng: Rng,
  parametri: Parametri,
): Card {
  const unica = legali[0];
  if (unica !== undefined && legali.length === 1) return unica;

  if (siGiocaAlContrario(vista)) return sfilaDalLiscio(vista, legali, rng);
  if (vista.presaInCorso.plays.length === 0) return apre(vista, legali, rng);

  const vincitore = currentWinner(vista.presaInCorso);
  if (
    vincitore !== null &&
    (alleatoDi(vista, vincitore) || unCompagnoSeLaPrendePerForza(vista))
  ) {
    return presaDelCompagno(vista, legali, rng);
  }
  return presaDaStrappare(vista, legali, rng, parametri);
}

/**
 * La carta da giocare. Sceglie sempre e solo fra le mosse legali: se mai
 * uscisse da li' e' un errore del bot, non una regola da discutere, e va
 * fermato subito.
 */
export function scegliCarta(
  vista: VistaDelBot,
  rng: Rng,
  parametri: Parametri = PARAMETRI_DI_SERIE,
): Card {
  if (vista.legali.length === 0) {
    throw new Error(`il posto ${vista.io} non ha mosse legali: non c'e' niente da scegliere`);
  }

  const scelta = decidi(vista, vista.legali, rng, parametri);
  if (!vista.legali.some((carta) => carta.id === scelta.id)) {
    const legali = vista.legali.map((carta) => carta.id).join(', ');
    throw new Error(`il bot ha scelto ${scelta.id}, fuori dalle mosse legali [${legali}]`);
  }
  return scelta;
}
