import type { Parametri } from '@mediatore/bot';
import { botCon, greedy, random } from './avversari.ts';
import type { Coordinata, Valore } from './griglia.ts';
import { GRIGLIA } from './griglia.ts';
import type { Risultato, Sommario } from './misura.ts';
import { misura } from './misura.ts';
import { PARAMETRI_ATTUALI, copia } from './parametri.ts';
import type { Giocatore, TavoloId } from './smazzata.ts';
import { TAVOLI } from './smazzata.ts';

/**
 * Il taratore: prova un numero alla volta e tiene quello che vince.
 *
 * Una coordinata per volta, non tutte insieme. E' il metodo piu' semplice
 * che esista e proprio per questo si capisce cosa sta succedendo mentre
 * lavora, che qui vale piu' della raffinatezza: un numero che migliora si
 * vede, e si vede anche perche'.
 */

/** Sotto questo, la differenza e' rumore dei mazzi e non merito dei numeri. */
const SOGLIA_SIGNIFICATIVA = 0.01;

/** Oltre questi giri senza cambiamenti non succede piu' niente. */
const GIRI_MASSIMI = 5;

/**
 * La verifica finale gioca su mazzi mai visti durante la taratura: numeri
 * cuciti addosso ai mazzi visti sono numeri che non valgono niente.
 */
const SEED_DELLA_VERIFICA = 1_000_000;

function argomento(nome: string): string | null {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato === undefined ? null : trovato.slice(prefisso.length);
}

function argomentoNumerico(nome: string, difetto: number): number {
  const grezzo = argomento(nome);
  if (grezzo === null) return difetto;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore) || valore < 1) {
    console.error(`valore non valido per --${nome}: ${grezzo}`);
    process.exit(1);
  }
  return Math.floor(valore);
}

function tavoliRichiesti(): readonly TavoloId[] {
  const grezzo = argomento('tavolo') ?? 'tutti';
  if (grezzo === 'tutti') return TAVOLI.map((tavolo) => tavolo.id);
  const ammessi = TAVOLI.map((tavolo) => tavolo.id);
  if (!ammessi.includes(grezzo as TavoloId)) {
    console.error(`tavolo non valido: ${grezzo} (ammessi ${ammessi.join(', ')}, tutti)`);
    process.exit(1);
  }
  return [grezzo as TavoloId];
}

/** I numeri si leggono meglio con la virgola, come si scrivono qui. */
function num(valore: number, decimali = 3): string {
  const segno = valore > 0 ? '+' : '';
  return `${segno}${valore.toFixed(decimali)}`.replace('.', ',');
}

function percento(valore: number): string {
  return `${valore.toFixed(0)}%`;
}

function riempi(testo: string, quanto: number): string {
  return testo.length >= quanto ? testo : testo + ' '.repeat(quanto - testo.length);
}

interface Prova {
  valore: Valore;
  risultato: Risultato;
}

function provaCoordinata(args: {
  coordinata: Coordinata;
  partenza: Parametri;
  riferimento: Giocatore;
  tavoli: readonly TavoloId[];
  seedBase: number;
  smazzate: number;
}): Prova[] {
  const { coordinata, partenza, riferimento, tavoli, seedBase, smazzate } = args;
  return coordinata.valori.map((valore) => ({
    valore,
    risultato: misura({
      parametri: coordinata.scrivi(partenza, valore),
      riferimento,
      seedBase,
      smazzate,
      tavoli,
    }),
  }));
}

function stampaProve(coordinata: Coordinata, prove: readonly Prova[], base: number): void {
  for (const prova of prove) {
    const differenza = prova.risultato.saldoMedio - base;
    const attuale = prova.valore === coordinata.leggi(PARAMETRI_ATTUALI);
    console.log(
      `  ${riempi(coordinata.mostra(prova.valore), 6)}` +
        ` saldo ${riempi(num(prova.risultato.saldoMedio), 8)}` +
        ` differenza ${riempi(num(differenza), 8)}` +
        ` chiama ${riempi(percento(prova.risultato.percentualeChiamate), 4)}` +
        ` ne vince ${riempi(percento(prova.risultato.percentualeVinte), 4)}` +
        (attuale ? '  <- valore attuale' : ''),
    );
  }
}

function migliore(prove: readonly Prova[]): Prova {
  const primo = prove[0];
  if (primo === undefined) throw new Error('nessuna prova da confrontare');
  return prove.reduce((a, b) => (b.risultato.saldoMedio > a.risultato.saldoMedio ? b : a), primo);
}

/**
 * Fra valori che si equivalgono si tiene il piu' vicino a quello di partenza.
 * Una differenza sotto la soglia e' rumore dei mazzi, e il rumore non e' un
 * motivo per spostare un numero: se due valori pareggiano, quello che c'era
 * gia' ha il diritto di restare.
 */
function sceltaPrudente(coordinata: Coordinata, prove: readonly Prova[], partenza: Valore): Prova {
  const vetta = migliore(prove).risultato.saldoMedio;
  const distanza = (valore: Valore): number =>
    Math.abs(coordinata.valori.indexOf(valore) - coordinata.valori.indexOf(partenza));
  const pariMerito = prove.filter(
    (prova) => prova.risultato.saldoMedio >= vetta - SOGLIA_SIGNIFICATIVA,
  );
  const primo = pariMerito[0];
  if (primo === undefined) throw new Error('nessuna prova a pari merito');
  return pariMerito.reduce((a, b) => (distanza(b.valore) < distanza(a.valore) ? b : a), primo);
}

function trovaProva(prove: readonly Prova[], valore: Valore): Prova {
  const trovata = prove.find((prova) => prova.valore === valore);
  if (trovata === undefined) throw new Error(`valore fuori griglia: ${String(valore)}`);
  return trovata;
}

interface Esito {
  coordinata: Coordinata;
  /** L'ultima misura di tutti i valori, con gli altri parametri gia' fermi. */
  prove: Prova[];
}

/**
 * Il riepilogo per una persona: non solo quale valore vince, ma perche'. Da
 * qui si deve capire se un numero fa chiamare piu' spesso vincendo meno, o
 * meno spesso vincendo di piu'.
 */
function riepiloga(esiti: readonly Esito[], scelti: Parametri): void {
  console.log('');
  console.log('=== COSA CONVIENE CAMBIARE ===');
  for (const { coordinata, prove } of esiti) {
    const partenza = coordinata.leggi(PARAMETRI_ATTUALI);
    const arrivo = coordinata.leggi(scelti);
    const saldoDi = (valore: Valore): number => trovaProva(prove, valore).risultato.saldoMedio;
    const guadagno = saldoDi(arrivo) - saldoDi(partenza);
    const vincitrice = sceltaPrudente(coordinata, prove, partenza);

    console.log('');
    console.log(coordinata.titolo);

    if (arrivo !== partenza) {
      console.log(
        `  attuale ${coordinata.mostra(partenza)}  ->  migliore ${coordinata.mostra(arrivo)}` +
          `   (${num(guadagno)} a smazzata)`,
      );
    } else if (vincitrice.valore === partenza) {
      console.log(`  attuale ${coordinata.mostra(partenza)}: resta il migliore`);
    } else {
      console.log(
        `  attuale ${coordinata.mostra(partenza)}: con ${coordinata.mostra(vincitrice.valore)}` +
          ` si guadagnerebbe ${num(vincitrice.risultato.saldoMedio - saldoDi(partenza))},` +
          ` sotto ${num(SOGLIA_SIGNIFICATIVA, 2)} — NON significativo, non si cambia`,
      );
    }

    for (const prova of prove) {
      const { risultato } = prova;
      const chiama =
        risultato.chiamate === 0
          ? 'non chiama mai'
          : `chiama nel ${percento(risultato.percentualeChiamate)} delle mani,` +
            ` ne vince il ${percento(risultato.percentualeVinte)}`;
      console.log(
        `  con ${riempi(coordinata.mostra(prova.valore), 5)}` +
          ` saldo ${riempi(num(risultato.saldoMedio), 8)} — ${chiama}`,
      );
    }
  }
}

function stampaParametri(parametri: Parametri): void {
  console.log('');
  console.log('=== I NUMERI DA PORTARE NEL BOT ===');
  const soglie = Object.entries(parametri.chiamata.soglie)
    .map(([tavolo, soglia]) => `${tavolo} ${soglia}`)
    .join(', ');
  console.log(`  chiamata: si chiama da (${soglie})  (osservate, non si toccano)`);
  console.log(
    `  scarto: punti dal ${parametri.scarto.trionfiPerPuntiNelMonte}o trionfo,` +
      ` al massimo ${parametri.scarto.puntiMassimiNelMonte} punti,` +
      ` vuoto pagato fino a ${parametri.scarto.prezzoDelVuoto}`,
  );
  console.log(`  gioco: si carica fino a un rischio di ${parametri.gioco.rischioPerCaricare}`);
}

function stampaSommario(nome: string, sommario: Sommario): void {
  console.log(
    `  ${riempi(nome, 22)} saldo ${riempi(num(sommario.saldoMedio), 8)}` +
      ` chiama ${riempi(percento(sommario.percentualeChiamate), 4)}` +
      ` ne vince ${percento(sommario.percentualeVinte)}`,
  );
}

function verificaFinale(args: {
  parametri: Parametri;
  tavoli: readonly TavoloId[];
  seedBase: number;
  smazzate: number;
}): void {
  const sfidanti: readonly (readonly [string, Giocatore])[] = [
    ['contro il bot di serie', botCon(PARAMETRI_ATTUALI)],
    ['contro greedy', greedy(PARAMETRI_ATTUALI)],
    ['contro random', random(PARAMETRI_ATTUALI)],
  ];

  console.log('');
  console.log('=== VERIFICA FINALE, SU MAZZI MAI VISTI ===');
  console.log(
    `  ${args.smazzate} mazzi per tavolo, seed da ${args.seedBase}` +
      ' (la taratura non li ha mai giocati)',
  );
  for (const [nome, riferimento] of sfidanti) {
    const risultato = misura({
      parametri: args.parametri,
      riferimento,
      seedBase: args.seedBase,
      smazzate: args.smazzate,
      tavoli: args.tavoli,
    });
    console.log('');
    stampaSommario(nome, risultato);
    for (const tavolo of TAVOLI) {
      const sommario = risultato.perTavolo.get(tavolo.id);
      if (sommario === undefined) continue;
      stampaSommario(`    ${tavolo.etichetta}`, sommario);
    }
  }
}

function main(): void {
  const smazzate = argomentoNumerico('smazzate', 20000);
  const seedBase = argomentoNumerico('seed', 1);
  const tavoli = tavoliRichiesti();
  const inizio = Date.now();

  console.log('=== TARATURA ===');
  console.log(
    `  ${smazzate} mazzi per tavolo e per combinazione, seed da ${seedBase},` +
      ` tavoli: ${tavoli.join(', ')}`,
  );
  console.log(
    '  avversario di riferimento: il bot com e adesso. Stessi mazzi per tutti,' +
      ' e ogni mazzo giocato due volte a posti scambiati.',
  );

  const riferimento = botCon(PARAMETRI_ATTUALI);
  let migliori = copia(PARAMETRI_ATTUALI);
  const esiti = new Map<string, Esito>();

  for (let giro = 1; giro <= GIRI_MASSIMI; giro += 1) {
    let cambiato = false;
    console.log('');
    console.log(`--- giro ${giro} ---`);

    for (const coordinata of GRIGLIA) {
      const suoi = coordinata.tavoli.filter((id) => tavoli.includes(id));
      if (suoi.length === 0) continue;

      const partenza = coordinata.leggi(migliori);
      const prove = provaCoordinata({
        coordinata,
        partenza: migliori,
        riferimento,
        tavoli: suoi,
        seedBase,
        smazzate,
      });

      console.log('');
      console.log(`${coordinata.nome} — ${coordinata.titolo} (su ${suoi.join(', ')})`);
      const base = trovaProva(prove, partenza).risultato.saldoMedio;
      stampaProve(coordinata, prove, base);

      const vetta = migliore(prove);
      const vincitrice = sceltaPrudente(coordinata, prove, partenza);
      const guadagno = vincitrice.risultato.saldoMedio - base;
      const tenuto = vincitrice.valore !== partenza && guadagno >= SOGLIA_SIGNIFICATIVA;

      if (vetta.valore !== vincitrice.valore) {
        console.log(
          `  (${coordinata.mostra(vetta.valore)} fa ${num(vetta.risultato.saldoMedio)} e` +
            ` ${coordinata.mostra(vincitrice.valore)} fa ${num(vincitrice.risultato.saldoMedio)}:` +
            ' si equivalgono, tengo il piu prudente)',
        );
      }

      if (tenuto) {
        migliori = coordinata.scrivi(migliori, vincitrice.valore);
        cambiato = true;
        console.log(
          `  -> tengo ${coordinata.mostra(vincitrice.valore)} al posto di` +
            ` ${coordinata.mostra(partenza)} (${num(guadagno)})`,
        );
      } else if (vincitrice.valore !== partenza) {
        console.log(
          `  -> ${coordinata.mostra(vincitrice.valore)} guadagna solo ${num(guadagno)}:` +
            ' NON significativo, resta com era',
        );
      } else {
        console.log(`  -> resta ${coordinata.mostra(partenza)}`);
      }

      esiti.set(coordinata.nome, { coordinata, prove });
    }

    if (!cambiato) {
      console.log('');
      console.log(`nessun parametro migliora piu': mi fermo dopo il giro ${giro}`);
      break;
    }
  }

  riepiloga([...esiti.values()], migliori);
  stampaParametri(migliori);
  verificaFinale({
    parametri: migliori,
    tavoli,
    seedBase: seedBase + SEED_DELLA_VERIFICA,
    smazzate,
  });

  console.log('');
  console.log(`fatto in ${((Date.now() - inizio) / 1000).toFixed(0)} secondi`);
}

main();
