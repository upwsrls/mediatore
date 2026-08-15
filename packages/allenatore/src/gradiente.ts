import { createRng } from '@mediatore/engine';
import type { Card } from '@mediatore/engine';
import {
  caratteristiche,
  mediaVettori,
  scalaVettore,
  sommaVettori,
  vettoreVuoto,
} from './caratteristiche.ts';
import type { Vettore } from './caratteristiche.ts';
import type { Pesi } from './pesi.ts';
import type { Avversario } from './lavoro.ts';
import { scegliCartaDiSerie, scegliCartaPesata } from './scegli.ts';
import type { ScegliCarta, Tavolo } from './smazzata.ts';
import { giocaSmazzata } from './smazzata.ts';

/**
 * Il premio di una mossa: quanto quella scelta ha spostato il risultato
 * rispetto a quello che sarebbe successo comunque.
 *
 * "Comunque" e' il bot di serie, sulla stessa smazzata. L'esito grezzo
 * non va bene: il chiamante vince sette volte su dieci, e il difensore
 * riceverebbe quasi sempre un segnale negativo anche giocando bene.
 * Una mossa uguale a quella di serie non ha spostato niente, e non si tocca.
 */
export function premioDellaMossa(
  quotaPesato: number,
  quotaSerie: number,
  scelta: Card,
  diSerie: Card,
): number {
  if (scelta.id === diSerie.id) return 0;
  return quotaPesato - quotaSerie;
}

function allievoDelTavolo(indice: number, players: number): number {
  return ((indice % players) + players) % players;
}

function scegliPerPosto(args: {
  pesi: Pesi;
  avversario: Avversario;
  allievo: number;
  players: number;
}): ScegliCarta | readonly ScegliCarta[] {
  const pesato: ScegliCarta = (vista, rng) => scegliCartaPesata(vista, args.pesi, rng);
  if (args.avversario === 'se-stesso') return pesato;
  return Array.from({ length: args.players }, (_, seat) =>
    seat === args.allievo ? pesato : scegliCartaDiSerie,
  );
}

/**
 * Quanto quella smazzata tira i pesi. Si gioca due volte lo stesso mazzo:
 * una col bot che impara (da solo contro la serie, o contro se stesso),
 * una con la sola serie. Il gradiente pesa solo le mosse dell'allievo
 * che si discostano, e solo per la differenza di quota.
 */
export function gradienteDellaSmazzata(args: {
  pesi: Pesi;
  tavolo: Tavolo;
  dealer: number;
  seed: number;
  indice?: number;
  avversario?: Avversario;
}): Vettore {
  const avversario = args.avversario ?? 'serie';
  const allievo = allievoDelTavolo(args.indice ?? args.dealer, args.tavolo.players);
  const imparato = giocaSmazzata({
    tavolo: args.tavolo,
    dealer: args.dealer,
    seed: args.seed,
    scegli: scegliPerPosto({
      pesi: args.pesi,
      avversario,
      allievo,
      players: args.tavolo.players,
    }),
  });
  const serie = giocaSmazzata({
    tavolo: args.tavolo,
    dealer: args.dealer,
    seed: args.seed,
    scegli: scegliCartaDiSerie,
  });

  let gradiente = vettoreVuoto();
  let n = 0;
  for (const mossa of imparato.mosse) {
    if (avversario === 'serie' && mossa.posto !== allievo) continue;
    if (mossa.vista.legali.length < 2) continue;
    const quotaPesato = imparato.quote[mossa.posto] ?? 0;
    const quotaSerie = serie.quote[mossa.posto] ?? 0;
    const rngSerie = createRng(args.seed * 1009 + n);
    n += 1;
    const diSerie = scegliCartaDiSerie(mossa.vista, rngSerie);
    const premio = premioDellaMossa(quotaPesato, quotaSerie, mossa.scelta, diSerie);
    if (premio === 0) continue;

    const scelta = caratteristiche(mossa.vista, mossa.scelta);
    const centro = mediaVettori(
      mossa.vista.legali.map((carta) => caratteristiche(mossa.vista, carta)),
    );
    const scarto = sommaVettori(scelta, centro, -1);
    gradiente = sommaVettori(gradiente, scalaVettore(scarto, premio));
  }
  return gradiente;
}

/** Somma i gradienti e li applica ai pesi in un colpo solo. */
export function applicaGradienti(pesi: Pesi, gradienti: readonly Vettore[], passo: number): Pesi {
  let somma = vettoreVuoto();
  for (const gradiente of gradienti) somma = sommaVettori(somma, gradiente);
  return sommaVettori(pesi, scalaVettore(somma, passo));
}
