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
import { cartaVincente, possoVincere, postaDellaPresa, rischioDiPerdere } from './valuta.ts';
import type { VistaDelBot } from './vista.ts';
import { alleatoDi, preseRimaste, puntiDeiMiei, sonoIlChiamante } from './vista.ts';
import { currentWinner } from '@mediatore/engine';

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
 * Sopra una carta di comando ci puo' stare una carta sola: chi ce l'ha la
 * spende per prendersi quella presa, e da li' in avanti comando io.
 */
const SOPRA_UNA_DI_COMANDO = 1;

/** I miei trionfi che vale la pena tirare: sopra ne resta al massimo uno. */
function trionfiDiComando(vista: VistaDelBot, legali: readonly Card[]): Card[] {
  const inGiro = trionfiRimasti(vista);
  return legali.filter((carta) => {
    if (carta.suit !== vista.trump) return false;
    const sopra = inGiro.filter((altro) => cardStrength(altro.rank) > cardStrength(carta.rank));
    return sopra.length <= SOPRA_UNA_DI_COMANDO;
  });
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
 * Le carte laterali che comandano il loro palo ma che qualcuno puo' ancora
 * uccidere, perche' di quel palo si e' gia' visto che e' privo. Sono basi
 * con la data di scadenza: o si incassano adesso, o se le prende il taglio.
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
 * Arrassarsi: tirare trionfo di propria iniziativa per farli uscire agli
 * altri. Lo fa il chiamante, perche' ogni giro tolto e' un taglio in meno
 * contro le sue basi; chi non ha chiamato non ha motivo di scoprirsi.
 *
 * Non e' un automatismo, e tre cose lo fermano.
 *
 * La prima e' il punto di tutta la regola: se gli avversari sono gia' a zero
 * trionfi, continuare e' spendere il proprio comando su prese vuote, e loro
 * intanto scartano quello che non serve e si tengono i punti. Da li' in poi
 * si va a incassare nei pali laterali.
 *
 * La seconda e' non avere un trionfo di comando: si perderebbe la presa
 * senza far uscire niente di alto.
 *
 * La terza e' avere basi laterali che qualcuno puo' ancora tagliare: quelle
 * si incassano prima, che ad arrassarsi si fa sempre in tempo.
 */
function siArrassa(vista: VistaDelBot, legali: readonly Card[]): boolean {
  if (!sonoIlChiamante(vista)) return false;

  const loro = trionfiAvversariRimasti(vista);
  if (loro === 0) return false;

  const miei = vista.mano.filter((carta) => carta.suit === vista.trump).length;
  if (miei < 2 || miei < loro) return false;

  if (trionfiDiComando(vista, legali).length === 0) return false;
  return basiInPericolo(vista).length === 0;
}

/**
 * Con quale trionfo arrassarsi.
 *
 * Se sono tutti firme e' indifferente: sopra non c'e' piu' niente, esce
 * quello che capita. Altrimenti si esce con la piu' bassa fra quelle di
 * comando, non con la piu' alta: cosi' la maniglia degli altri esce a
 * prendersi quella, e da li' in poi le mie superiori sono firme. Con asso,
 * re, 5, 4 e 2 il giocatore vero esce dal re e si tiene l'asso.
 */
function arrassata(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const miei = legali.filter((carta) => carta.suit === vista.trump);
  const comando = trionfiDiComando(vista, legali);
  if (comando.length === 0 || miei.every((carta) => eFirma(vista, carta))) {
    return scegliFra(miei, rng);
  }
  return scegliFra(
    migliori(comando, (carta) => -cardStrength(carta.rank)),
    rng,
  );
}

/**
 * Sacrificare una carta per far uscire quella sopra, cosi' l'altra diventa
 * firma: si tira il re sapendo che la maniglia se lo prende, e da quel
 * momento l'asso comanda il palo. Serve avere due carte alte di seguito, e
 * sopra le mie deve restare quella sola: se ne girano due, il conto non
 * torna piu' e si sta solo regalando una presa.
 */
function perRendereFirmaLAltra(vista: VistaDelBot, legali: readonly Card[]): Card | null {
  const ignote = carteNonAncoraViste(vista);
  // Solo nei pali laterali: nel trionfo il momento di tirare lo decide
  // l'arrassata, che sa anche se agli altri i trionfi sono finiti.
  const pali = [...new Set(legali.map((carta) => carta.suit))].filter(
    (palo) => palo !== vista.trump,
  );

  for (const palo of pali) {
    const mie = legali
      .filter((carta) => carta.suit === palo)
      .sort((a, b) => cardStrength(b.rank) - cardStrength(a.rank));
    const prima = mie[0];
    const seconda = mie[1];
    if (prima === undefined || seconda === undefined) continue;

    const sopra = (carta: Card): number =>
      ignote.filter(
        (altra) => altra.suit === palo && cardStrength(altra.rank) > cardStrength(carta.rank),
      ).length;
    if (sopra(prima) === 1 && sopra(seconda) === 1) return seconda;
  }
  return null;
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
  const trionfiFirma = firme.filter((carta) => carta.suit === vista.trump);
  if (trionfiFirma.length > 0 && trionfiAvversariRimasti(vista) > 0) {
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

  const palo = semeMenoCaro(vista, legali);
  const dalPaloMagro = legali.filter((carta) => carta.suit === palo);
  return scartaLaPiuInutile(vista, dalPaloMagro.length > 0 ? dalPaloMagro : legali, rng);
}

/** Sotto queste, di un palo, in giro c'e' gia' chi ne e' privo e taglia. */
const CARTE_PER_TAGLIARE = 4;

function chiamanteEPrivoDi(vista: VistaDelBot, palo: Suit): boolean {
  const alliance = vista.alliance;
  if (alliance.kind === 'liscio') return false;
  return eSemeFinito(vista, alliance.caller, palo);
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
 */
function convieneCaricare(vista: VistaDelBot, carta: Card): boolean {
  // Una firma non si regala: quella e' una presa, e la fa da se'.
  if (eFirma(vista, carta)) return false;
  if (carta.suit === vista.trump) return false;

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

function presaDelCompagno(vista: VistaDelBot, legali: readonly Card[], rng: Rng): Card {
  const sua = cartaVincente(vista);
  const gliaLasciano = sua === null || rischioDiPerdere(vista, sua) <= RISCHIO_TRASCURABILE;
  if (!gliaLasciano) {
    // La presa e' del compagno solo per il momento: dietro c'e' ancora chi
    // passa sopra, e spesso e' il chiamante che deve ancora giocare con la
    // maniglia in mano. Essendo privi del palo, una scartina di trionfo qui
    // vale piu' che in mano: prende la presa e zomba la carta con cui l'altro
    // se la stava per fare.
    if (staUccidendo(vista, legali)) {
      const coltelli = coltelliPerUccidere(vista, legali);
      if (coltelli.length > 0) return uccidiDalBasso(vista, coltelli);
    }
    return scartaLaPiuInutile(vista, legali, rng);
  }

  const daCaricare = legali.filter(
    (carta) => cardPoints(carta.rank) > 0 && convieneCaricare(vista, carta),
  );
  if (daCaricare.length === 0) return scartaLaPiuInutile(vista, legali, rng);
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
  if (vincenti.length === 0) return scartaLaPiuInutile(vista, legali, rng);

  if (staUccidendo(vista, legali)) {
    const coltelli = coltelliPerUccidere(vista, legali);
    if (coltelli.length > 0) return uccidiDalBasso(vista, coltelli);

    // In mano ci sono solo trionfi da proteggere: la presa si lascia andare e
    // si scarta liscio. Se non c'e' altro da giocare si taglia lo stesso, che
    // una carta va messa comunque.
    const fuoriTrionfo = legali.filter((carta) => carta.suit !== vista.trump);
    if (fuoriTrionfo.length > 0) return scartaLaPiuInutile(vista, fuoriTrionfo, rng);
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
  return rinunce.length > 0 ? scartaLaPiuInutile(vista, rinunce, rng) : economica;
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
  if (vincitore !== null && alleatoDi(vista, vincitore)) {
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
