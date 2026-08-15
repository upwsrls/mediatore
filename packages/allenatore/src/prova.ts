import { scegliCartaDiSerie, scegliCartaPesata } from './scegli.ts';
import type { Pesi } from './pesi.ts';
import type { Tavolo, TavoloId } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';

/**
 * Il bot addestrato contro quello di serie, su mazzi che l'addestramento
 * non ha visto. Ogni mazzo si gioca due volte, a posti scambiati, cosi'
 * il vantaggio del posto non si scambia per merito dei pesi.
 */

export interface ContoRuolo {
  saldo: number;
  posti: number;
}

export interface ContoTavolo {
  saldo: number;
  posti: number;
  chiamante: ContoRuolo;
  difensore: ContoRuolo;
}

export interface Prova {
  saldo: number;
  posti: number;
  mani: number;
  chiamante: ContoRuolo;
  difensore: ContoRuolo;
  perTavolo: Record<TavoloId, ContoTavolo>;
}

function vuotoRuolo(): ContoRuolo {
  return { saldo: 0, posti: 0 };
}

function vuotoTavolo(): ContoTavolo {
  return { saldo: 0, posti: 0, chiamante: vuotoRuolo(), difensore: vuotoRuolo() };
}

function provaVuota(): Prova {
  return {
    saldo: 0,
    posti: 0,
    mani: 0,
    chiamante: vuotoRuolo(),
    difensore: vuotoRuolo(),
    perTavolo: {
      '3': vuotoTavolo(),
      '4': vuotoTavolo(),
      '5': vuotoTavolo(),
      amico: vuotoTavolo(),
    },
  };
}

function primaSquadra(seat: number, seed: number): boolean {
  return (seat + seed) % 2 === 0;
}

function accanto(ruolo: ContoRuolo, quota: number): void {
  ruolo.saldo += quota;
  ruolo.posti += 1;
}

export function mettiAllaProva(args: {
  pesi: Pesi;
  seed: number;
  smazzate: number;
  tavoli?: readonly Tavolo[];
}): Prova {
  const tavoli = args.tavoli ?? TAVOLI;
  const addestrato = (vista: Parameters<typeof scegliCartaPesata>[0], rng: Parameters<typeof scegliCartaPesata>[2]) =>
    scegliCartaPesata(vista, args.pesi, rng);
  const prova = provaVuota();

  for (const tavolo of tavoli) {
    const conto = prova.perTavolo[tavolo.id];
    for (let i = 0; i < args.smazzate; i += 1) {
      const seed = args.seed + i;
      const dealer = i % tavolo.players;

      for (const rovescio of [false, true]) {
        const eSuo = (seat: number): boolean => primaSquadra(seat, seed) !== rovescio;
        const scegli = Array.from({ length: tavolo.players }, (_, seat) =>
          eSuo(seat) ? addestrato : scegliCartaDiSerie,
        );
        const esito = giocaSmazzata({ tavolo, dealer, seed, scegli });
        prova.mani += 1;

        esito.quote.forEach((quota, seat) => {
          if (!eSuo(seat)) return;
          prova.saldo += quota;
          prova.posti += 1;
          conto.saldo += quota;
          conto.posti += 1;

          if (esito.chiamante === null) return;
          const amico =
            esito.alliance.kind === 'amico' ? esito.alliance.friend : null;
          const dellaParte = seat === esito.chiamante || seat === amico;
          if (dellaParte) {
            accanto(prova.chiamante, quota);
            accanto(conto.chiamante, quota);
          } else {
            accanto(prova.difensore, quota);
            accanto(conto.difensore, quota);
          }
        });
      }
    }
  }

  return prova;
}

export function media(conto: { saldo: number; posti: number }): number {
  return conto.posti === 0 ? 0 : conto.saldo / conto.posti;
}
