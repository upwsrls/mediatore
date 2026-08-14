import type { Card, Rng, Suit } from '@mediatore/engine';
import { RANKS, cardPoints, cardStrength, penalitaDaSoglia } from '@mediatore/engine';
import {
  cartaPiuAltaRimasta,
  carteNonAncoraViste,
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
import { alleatoDi, preseRimaste, puntiDeiMiei, sonoIlChiamante } from './vista.ts';
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
  return scegliFra(
    migliori(carte, (carta) => -costoDiPerderla(vista, carta)),
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
 * I trionfi bassi che stanno sotto una carta alta e la tengono in vita: i due
 * sotto il re terzo, quello sotto l'asso secondo.
 *
 * Il conto e' quello del tavolo: sopra il re ci sono maniglia e asso, sopra
 * l'asso c'e' la sola maniglia, e ogni carta che sta sopra e' una tirata a
 * cui bisogna poter rispondere con una scartina. Il chiamante prima o poi si
 * arrassa; sotto le sue tirate si buttano i trionfi bassi, e la carta alta
 * arriva in fondo viva e diventa firma. Bruciare una di quelle scartine per
 * uccidere vuol dire ritrovarsi a mettere la carta alta sotto la sua, e la
 * base e' persa.
 *
 * Se le scartine non bastano a coprire tutte le tirate non c'e' niente da
 * proteggere: un re secondo cade lo stesso, e allora quel trionfo torna a
 * essere una carta come le altre.
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
  if (tirate === 0) return [];

  const bassi = trionfi
    .filter((carta) => cardStrength(carta.rank) < cardStrength(migliore.rank))
    .sort((a, b) => cardStrength(a.rank) - cardStrength(b.rank));
  return bassi.length < tirate ? [] : bassi.slice(0, tirate);
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
 */
export function trionfiBastanoARipulire(vista: VistaDelBot): boolean {
  const giriNecessari = trionfiAvversariRimasti(vista);
  const giriChePossoTirare = vista.mano.filter((carta) => carta.suit === vista.trump).length;
  return giriChePossoTirare >= giriNecessari;
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
 * Quando tirare trionfo di propria iniziativa ha un senso. Vale per ogni
 * trionfo tirato per scelta, firma compresa: sono gli stessi freni.
 *
 * Il primo vale per tutti: se gli avversari sono gia' a zero trionfi,
 * continuare e' spendere il proprio comando su prese vuote, e loro intanto
 * scartano quello che non serve e si tengono i punti. Da li' in poi si va a
 * incassare nei pali laterali.
 *
 * Gli altri due riguardano il chiamante, perche' e' lui che si arrassa: chi
 * non ha chiamato non sta ripulendo nessuno, tira il suo trionfo firma per
 * fare la presa e basta.
 *
 * Il secondo, e viene prima di quello dopo, e' che i trionfi bastino a
 * finirli: con pochi trionfi non li si ripulisce, e arrassarsi diventa un
 * suicidio — si brucia il proprio comando su prese vuote e le carte laterali
 * restano tagliabili come prima.
 *
 * Il terzo e' avere basi laterali che qualcuno puo' ancora tagliare: quelle
 * si incassano prima, che ad arrassarsi si fa sempre in tempo.
 */
function convieneTirareTrionfo(vista: VistaDelBot): boolean {
  if (trionfiAvversariRimasti(vista) === 0) return false;
  if (!sonoIlChiamante(vista)) return true;
  if (!trionfiBastanoARipulire(vista)) return false;
  return basiInPericolo(vista).length === 0;
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

function apre(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
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

  const sacrificio = perRendereFirmaLAltra(vista, legali);
  if (sacrificio !== null) return sacrificio;

  // Non restando niente da incassare si apre per uscire di mano, e allora si
  // esce con una scartina, dal seme dove si rischia meno.
  const fuoriTrionfo = legali.filter((carta) => carta.suit !== vista.trump);
  const pulite = fuoriTrionfo.filter((carta) => !regaloDiPunti(vista, carta));
  if (pulite.length > 0) {
    const palo = semeMenoCaro(vista, pulite);
    const dalPaloMagro = pulite.filter((carta) => carta.suit === palo);
    return scartaLaPiuInutile(vista, dalPaloMagro.length > 0 ? dalPaloMagro : pulite, rng);
  }

  // Fuori dal trionfo paga tutto: allora si guarda quanto costa pagare, e nel
  // conto entra anche il trionfo. Una scartina di trionfo non vale un punto, e
  // in cambio tira fuori la maniglia: quello che si tiene sotto di lei si
  // libera. L'asso laterale invece sono quattro punti che se ne vanno insieme
  // alla presa. Era da qui che usciva l'asso secco anche quando in mano c'era
  // un 2 di trionfo che non serviva a niente.
  const scartineDiTrionfo = legali.filter(
    (carta) => carta.suit === vista.trump && cardPoints(carta.rank) === 0,
  );
  const regaloPiuMagro = Math.min(...fuoriTrionfo.map((carta) => cardPoints(carta.rank)));
  const paganoTutti = fuoriTrionfo.length === 0 || regaloPiuMagro >= REGALO_GROSSO;
  if (scartineDiTrionfo.length > 0 && paganoTutti) {
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
 * Il caso nuovo e' lo stesso ramo, solo a palo vuoto: si puo' scegliere
 * qualunque carta, e allora si carica anche quella che comanda il suo seme,
 * purche' dietro ne resti un'altra che comanda ancora. Maniglia e asso:
 * esce la maniglia, l'asso resta firmo. La carta alta sola no: quella e'
 * una presa futura.
 */
function convieneCaricare(vista: VistaDelBot, carta: Card): boolean {
  if (carta.suit === vista.trump) return false;
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
  // vanno sulla presa, che quella e' gia' vinta.
  if (sopra > 0) return true;

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

  const scorta = preseRimaste(vista) > 1 ? trionfiDaProteggere(vista.mano, vista.trump) : [];
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
