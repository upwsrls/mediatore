import { resolve } from 'node:path';
import { scegliCarta } from '@mediatore/bot';
import type { Alliance } from '@mediatore/engine';
import { imparaDaPartite, stampaApprendimento } from './impara.ts';
import { FILE_DI_SERIE, memoriaDa, salvaMemoria } from './memoria.ts';
import { imitatoreDa } from './scegli.ts';
import type { Tavolo, TavoloId } from './smazzata.ts';
import { TAVOLI, giocaSmazzata } from './smazzata.ts';
import type { Correzione } from './tipi.ts';

/**
 * L'imitatore contro il bot di serie, sugli stessi mazzi, posti
 * alternati e scambiati. Stampa il saldo per ruolo e per tavolo, e
 * quante correzioni ha imparato su quanti casi.
 *
 *   node --experimental-strip-types packages/imitatore/src/sfida.ts
 *   --smazzate=N --seed=N --tavolo=3|4|5|amico|tutti --da=partite
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

export interface Sfida {
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

function sfidaVuota(): Sfida {
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

function registra(
  sfida: Sfida,
  tavolo: Tavolo,
  seed: number,
  rovescio: boolean,
  esito: { quote: readonly number[]; chiamante: number | null; alliance: Alliance },
): void {
  const conto = sfida.perTavolo[tavolo.id];
  const eSuo = (seat: number): boolean => primaSquadra(seat, seed) !== rovescio;
  sfida.mani += 1;

  esito.quote.forEach((quota, seat) => {
    if (!eSuo(seat)) return;
    sfida.saldo += quota;
    sfida.posti += 1;
    conto.saldo += quota;
    conto.posti += 1;
    if (esito.chiamante === null) return;
    const amico = esito.alliance.kind === 'amico' ? esito.alliance.friend : null;
    const dellaParte = seat === esito.chiamante || seat === amico;
    if (dellaParte) {
      accanto(sfida.chiamante, quota);
      accanto(conto.chiamante, quota);
    } else {
      accanto(sfida.difensore, quota);
      accanto(conto.difensore, quota);
    }
  });
}

export function media(conto: { saldo: number; posti: number }): number {
  return conto.posti === 0 ? 0 : conto.saldo / conto.posti;
}

export function misuraSfida(args: {
  seed: number;
  smazzate: number;
  correzioni: readonly Correzione[];
  tavoli?: readonly Tavolo[];
}): Sfida {
  const tavoli = args.tavoli ?? TAVOLI;
  const imita = imitatoreDa(args.correzioni);
  const sfida = sfidaVuota();

  for (const tavolo of tavoli) {
    for (let i = 0; i < args.smazzate; i += 1) {
      const seed = args.seed + i;
      const dealer = i % tavolo.players;
      for (const rovescio of [false, true]) {
        const scegli = Array.from({ length: tavolo.players }, (_, seat) => {
          const suo = primaSquadra(seat, seed) !== rovescio;
          return suo ? imita : scegliCarta;
        });
        const esito = giocaSmazzata({ tavolo, dealer, seed, scegli });
        registra(sfida, tavolo, seed, rovescio, esito);
      }
    }
  }

  return sfida;
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

function tavoliRichiesti(): readonly Tavolo[] {
  const grezzo = argomento('tavolo') ?? 'tutti';
  if (grezzo === 'tutti') return TAVOLI;
  const trovato = TAVOLI.find((tavolo) => tavolo.id === grezzo);
  if (trovato === undefined) {
    console.error(`tavolo non valido: ${grezzo} (ammessi 3, 4, 5, amico, tutti)`);
    process.exit(1);
  }
  return [trovato];
}

function num(valore: number, decimali = 3): string {
  const segno = valore > 0 ? '+' : '';
  return `${segno}${valore.toFixed(decimali)}`.replace('.', ',');
}

export function stampaSfida(sfida: Sfida): string {
  const righe: string[] = [];
  righe.push(`mani ${sfida.mani}  saldo ${num(sfida.saldo, 1)}  (${num(media(sfida), 3)} a posto)`);
  righe.push(
    `  chiamante ${num(media(sfida.chiamante), 3)} a posto (${sfida.chiamante.posti} posti)` +
      `  difensore ${num(media(sfida.difensore), 3)} a posto (${sfida.difensore.posti} posti)`,
  );
  righe.push('  per tavolo:');
  for (const tavolo of TAVOLI) {
    const conto = sfida.perTavolo[tavolo.id];
    if (conto.posti === 0) continue;
    righe.push(
      `    ${tavolo.etichetta}: ${num(media(conto), 3)} a posto` +
        ` — chiamante ${num(media(conto.chiamante), 3)},` +
        ` difensore ${num(media(conto.difensore), 3)}`,
    );
  }
  return righe.join('\n');
}

function main(): void {
  const cartella = resolve(argomento('da') ?? 'partite');
  const file = resolve(argomento('salva') ?? FILE_DI_SERIE);
  const smazzate = argomentoNumerico('smazzate', 250);
  const seed = argomentoNumerico('seed', 1);
  const tavoli = tavoliRichiesti();

  const imparato = imparaDaPartite(cartella);
  salvaMemoria(file, memoriaDa(imparato));

  process.stdout.write(`${stampaApprendimento(imparato)}\n`);
  process.stdout.write(`salvato in ${file}\n\n`);

  const coperti = imparato.correzioni.reduce((n, c) => n + c.casi, 0);
  if (imparato.correzioni.length === 0) {
    process.stdout.write(
      'Nessuna correzione: l\'imitatore gioca come il bot di serie,' +
        ' e il saldo della sfida deve stare intorno allo zero.\n\n',
    );
  } else if (coperti < 20 || imparato.correzioni.length * 8 > imparato.decisioni) {
    process.stdout.write(
      `Poche correzioni su pochi casi (${imparato.correzioni.length} su ${imparato.gruppi} gruppi,` +
        ` ${coperti} decisioni): il saldo della sfida non significa quasi niente.\n\n`,
    );
  }

  process.stdout.write(
    `sfida: ${smazzate} mazzi a tavolo, seed ${seed},` +
      ` tavoli ${tavoli.map((t) => t.etichetta).join(', ')}\n`,
  );
  const sfida = misuraSfida({
    seed,
    smazzate,
    correzioni: imparato.correzioni,
    tavoli,
  });
  process.stdout.write(`${stampaSfida(sfida)}\n`);
}

const eIlPrincipale = process.argv[1]?.endsWith('sfida.ts') === true;
if (eIlPrincipale) {
  main();
}
