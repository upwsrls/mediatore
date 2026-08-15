import { resolve } from 'node:path';
import { confrontaTutte } from './confronta.ts';
import { leggiPartite } from './leggi.ts';
import { FILE_DI_SERIE, memoriaDa, salvaMemoria } from './memoria.ts';
import { MINIMO_CASI, SOGLIA_COERENZA, SOGLIA_DELTA } from './soglie.ts';
import type { Confronto, Correzione, Ruolo } from './tipi.ts';

export type { Correzione } from './tipi.ts';

export type MotivoScarto = 'pochi' | 'incoerente' | 'come il bot' | 'delta debole';

export interface GruppoScartato {
  ruolo: Ruolo;
  situazione: string;
  casi: number;
  azioneUmano: string | null;
  quotaUmano: number;
  quotaBot: number;
  motivo: MotivoScarto;
}

export interface Apprendimento {
  smazzate: number;
  saltateScoperte: number;
  errori: number;
  decisioni: number;
  gruppi: number;
  correzioni: Correzione[];
  scartati: GruppoScartato[];
}

interface Gruppo {
  ruolo: Ruolo;
  situazione: string;
  casi: Confronto[];
}

function raggruppa(confronti: readonly Confronto[]): Gruppo[] {
  const mappa = new Map<string, Gruppo>();
  for (const confronto of confronti) {
    const chiave = `${confronto.ruolo}::${confronto.situazione}`;
    const gia = mappa.get(chiave);
    if (gia !== undefined) {
      gia.casi.push(confronto);
      continue;
    }
    mappa.set(chiave, {
      ruolo: confronto.ruolo,
      situazione: confronto.situazione,
      casi: [confronto],
    });
  }
  return [...mappa.values()].sort((a, b) => b.casi.length - a.casi.length);
}

function conta(casi: readonly Confronto[], diChi: 'azioneUmano' | 'azioneBot'): Map<string, number> {
  const mappa = new Map<string, number>();
  for (const caso of casi) {
    const azione = caso[diChi];
    mappa.set(azione, (mappa.get(azione) ?? 0) + 1);
  }
  return mappa;
}

function piuFrequente(conteggi: Map<string, number>): string | null {
  let migliore: string | null = null;
  let quanti = -1;
  for (const [azione, n] of conteggi) {
    if (n > quanti) {
      migliore = azione;
      quanti = n;
    }
  }
  return migliore;
}

function percentuale(quota: number): number {
  return Math.round(quota * 100);
}

function fraseDi(correzione: Omit<Correzione, 'frase'>): string {
  const pctU = percentuale(correzione.quotaUmano);
  const pctB = percentuale(correzione.quotaBot);
  return (
    `da ${correzione.ruolo}, ${correzione.situazione}:` +
    ` l'umano ${correzione.azione} nel ${pctU}% dei casi,` +
    ` il bot nel ${pctB}%`
  );
}

/**
 * Da un gruppo di confronti, impara una correzione solo se l'umano
 * sceglie un'azione diversa dal bot, in modo netto e ripetuto.
 * Altrimenti le regole di serie restano.
 */
export function correzioneDalGruppo(gruppo: Gruppo): Correzione | GruppoScartato {
  const n = gruppo.casi.length;
  const umano = conta(gruppo.casi, 'azioneUmano');
  const bot = conta(gruppo.casi, 'azioneBot');
  const azioneUmano = piuFrequente(umano);
  const azioneBot = piuFrequente(bot);
  const quotaUmano = azioneUmano === null ? 0 : (umano.get(azioneUmano) ?? 0) / n;
  const quotaBot = azioneUmano === null ? 0 : (bot.get(azioneUmano) ?? 0) / n;

  const base = {
    ruolo: gruppo.ruolo,
    situazione: gruppo.situazione,
    casi: n,
    azioneUmano,
    quotaUmano,
    quotaBot,
  };

  if (n < MINIMO_CASI) return { ...base, motivo: 'pochi' };
  if (azioneUmano === null || quotaUmano < SOGLIA_COERENZA) {
    return { ...base, motivo: 'incoerente' };
  }
  if (Math.abs(quotaUmano - quotaBot) < SOGLIA_DELTA) {
    return {
      ...base,
      motivo: azioneUmano === azioneBot ? 'come il bot' : 'delta debole',
    };
  }

  const correzione = {
    ruolo: gruppo.ruolo,
    situazione: gruppo.situazione,
    azione: azioneUmano,
    casi: n,
    quotaUmano,
    quotaBot,
  };
  return { ...correzione, frase: fraseDi(correzione) };
}

export function imparaDaConfronti(confronti: readonly Confronto[]): {
  correzioni: Correzione[];
  scartati: GruppoScartato[];
  gruppi: number;
} {
  const correzioni: Correzione[] = [];
  const scartati: GruppoScartato[] = [];
  const gruppi = raggruppa(confronti);
  for (const gruppo of gruppi) {
    const esito = correzioneDalGruppo(gruppo);
    if ('azione' in esito && 'frase' in esito) correzioni.push(esito);
    else scartati.push(esito);
  }
  return { correzioni, scartati, gruppi: gruppi.length };
}

export function imparaDaPartite(cartella: string): Apprendimento {
  const fogli = leggiPartite(cartella);
  const smazzate = fogli.flatMap((foglio) => foglio.smazzate);
  const { confronti, saltateScoperte, smazzateViste, errori } = confrontaTutte(smazzate);
  const { correzioni, scartati, gruppi } = imparaDaConfronti(confronti);
  return {
    smazzate: smazzateViste,
    saltateScoperte,
    errori,
    decisioni: confronti.length,
    gruppi,
    correzioni,
    scartati,
  };
}

export function stampaApprendimento(imparato: Apprendimento): string {
  const righe: string[] = [];
  righe.push(
    `smazzate ${imparato.smazzate}` +
      (imparato.saltateScoperte > 0 ? ` (saltate scoperte ${imparato.saltateScoperte})` : '') +
      (imparato.errori > 0 ? `, errori ${imparato.errori}` : '') +
      `  decisioni ${imparato.decisioni}  gruppi ${imparato.gruppi}`,
  );
  righe.push(
    `soglie: almeno ${MINIMO_CASI} casi,` +
      ` coerenza umano >= ${percentuale(SOGLIA_COERENZA)}%,` +
      ` scarto dal bot >= ${percentuale(SOGLIA_DELTA)} punti`,
  );

  if (imparato.correzioni.length === 0) {
    righe.push('correzioni imparate: nessuna. Restano le regole di serie.');
  } else {
    const coperti = imparato.correzioni.reduce((n, c) => n + c.casi, 0);
    righe.push(
      `correzioni imparate: ${imparato.correzioni.length}` +
        ` su ${imparato.gruppi} gruppi` +
        ` (${coperti} decisioni su ${imparato.decisioni})`,
    );
    for (const correzione of imparato.correzioni) {
      righe.push(`  ${correzione.frase}  [${correzione.casi} casi]`);
    }
  }

  const vicini = imparato.scartati
    .filter((g) => g.casi >= MINIMO_CASI - 3)
    .sort((a, b) => b.casi - a.casi)
    .slice(0, 8);
  if (vicini.length > 0) {
    righe.push('gruppi vicini, non imparati:');
    for (const gruppo of vicini) {
      const azione = gruppo.azioneUmano ?? '?';
      righe.push(
        `  da ${gruppo.ruolo}, ${gruppo.situazione}:` +
          ` umano ${azione} ${percentuale(gruppo.quotaUmano)}%,` +
          ` bot ${percentuale(gruppo.quotaBot)}%` +
          `  [${gruppo.casi} casi, ${gruppo.motivo}]`,
      );
    }
  }

  return righe.join('\n');
}

function argomento(nome: string): string | null {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato === undefined ? null : trovato.slice(prefisso.length);
}

function main(): void {
  const cartella = resolve(argomento('da') ?? 'partite');
  const file = resolve(argomento('salva') ?? FILE_DI_SERIE);
  const imparato = imparaDaPartite(cartella);
  salvaMemoria(file, memoriaDa(imparato));
  process.stdout.write(`${stampaApprendimento(imparato)}\n`);
  process.stdout.write(`salvato in ${file}\n`);
}

const eIlPrincipale = process.argv[1]?.endsWith('impara.ts') === true;
if (eIlPrincipale) {
  main();
}
