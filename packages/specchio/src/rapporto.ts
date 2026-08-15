import { RUOLI } from './situazioni.ts';
import type { Confronto, Ruolo } from './tipi.ts';

const ESEMPI_PER_ESEMPI = 3;
const MINIMO_PER_ESEMPI = 4;
const SOGLIA_NETTA = 0.25;

export interface Gruppo {
  ruolo: Ruolo;
  situazione: string;
  casi: Confronto[];
}

export function raggruppa(confronti: readonly Confronto[]): Gruppo[] {
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

function azioniInVista(umano: Map<string, number>, bot: Map<string, number>): string[] {
  return [...new Set([...umano.keys(), ...bot.keys()])].sort(
    (a, b) => (umano.get(b) ?? 0) + (bot.get(b) ?? 0) - ((umano.get(a) ?? 0) + (bot.get(a) ?? 0)),
  );
}

/**
 * La differenza e' netta quando umano e bot non fanno la stessa cosa
 * di solito, o quando una stessa azione cambia di un quarto dei casi.
 */
export function differenzaNetta(gruppo: Gruppo): boolean {
  const n = gruppo.casi.length;
  if (n < MINIMO_PER_ESEMPI) return false;
  const umano = conta(gruppo.casi, 'azioneUmano');
  const bot = conta(gruppo.casi, 'azioneBot');
  const primaUmano = azioniInVista(umano, bot)[0];
  const primaBot = [...bot.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (primaUmano !== undefined && primaBot !== undefined && primaUmano !== primaBot) return true;
  for (const azione of azioniInVista(umano, bot)) {
    const delta = Math.abs((umano.get(azione) ?? 0) / n - (bot.get(azione) ?? 0) / n);
    if (delta >= SOGLIA_NETTA) return true;
  }
  return false;
}

export function giudizio(gruppo: Gruppo): string | null {
  const n = gruppo.casi.length;
  const umano = conta(gruppo.casi, 'azioneUmano');
  const bot = conta(gruppo.casi, 'azioneBot');
  let migliore = '';
  let scarto = 0;
  for (const azione of azioniInVista(umano, bot)) {
    const delta = (umano.get(azione) ?? 0) / n - (bot.get(azione) ?? 0) / n;
    const piuGrande = Math.abs(delta) > Math.abs(scarto) + 1e-9;
    const pariMaUmana = Math.abs(Math.abs(delta) - Math.abs(scarto)) < 1e-9 && delta > scarto;
    if (piuGrande || pariMaUmana) {
      scarto = delta;
      migliore = azione;
    }
  }
  if (migliore === '' || Math.abs(scarto) < SOGLIA_NETTA) return null;
  const quotaUmano = (umano.get(migliore) ?? 0) / n;
  const quotaBot = (bot.get(migliore) ?? 0) / n;
  if (quotaUmano >= 0.8 && quotaBot < 0.65) {
    return `l'umano ${migliore} quasi sempre, il bot a volte no`;
  }
  if (quotaBot >= 0.8 && quotaUmano < 0.65) {
    return `il bot ${migliore} quasi sempre, l'umano a volte no`;
  }
  if (scarto > 0) return `l'umano ${migliore} piu' spesso`;
  return `il bot ${migliore} piu' spesso`;
}

function esempi(gruppo: Gruppo): Confronto[] {
  const diversi = gruppo.casi.filter((caso) => !caso.accordo);
  const fonte = diversi.length > 0 ? diversi : gruppo.casi;
  return fonte.slice(0, ESEMPI_PER_ESEMPI);
}

function rigaAzioni(gruppo: Gruppo): string {
  const umano = conta(gruppo.casi, 'azioneUmano');
  const bot = conta(gruppo.casi, 'azioneBot');
  return azioniInVista(umano, bot)
    .slice(0, 3)
    .map((azione) => `umano ${azione} ${umano.get(azione) ?? 0}, bot ${azione} ${bot.get(azione) ?? 0}`)
    .join('\n    ');
}

function percento(parte: number, tutto: number): string {
  if (tutto === 0) return '—';
  return `${Math.round((100 * parte) / tutto)}%`;
}

export function accordoPerRuolo(confronti: readonly Confronto[]): { ruolo: Ruolo; si: number; tot: number }[] {
  return RUOLI.map((ruolo) => {
    const suoi = confronti.filter((c) => c.ruolo === ruolo);
    return { ruolo, si: suoi.filter((c) => c.accordo).length, tot: suoi.length };
  }).filter((riga) => riga.tot > 0);
}

export function stampaRapporto(args: {
  confronti: readonly Confronto[];
  file: number;
  smazzateViste: number;
  saltateScoperte: number;
  ruolo?: Ruolo | undefined;
}): string {
  const confronti =
    args.ruolo === undefined ? args.confronti : args.confronti.filter((c) => c.ruolo === args.ruolo);
  const gruppi = raggruppa(confronti);
  const linee: string[] = [];

  linee.push(
    `specchio: ${args.file} ${args.file === 1 ? 'file' : 'file'}, ${args.smazzateViste} ${args.smazzateViste === 1 ? 'smazzata' : 'smazzate'}, ${confronti.length} ${confronti.length === 1 ? 'decisione' : 'decisioni'} dell'umano`,
  );
  if (args.saltateScoperte > 0) {
    linee.push(`(saltate ${args.saltateScoperte} a carte scoperte)`);
  }
  if (args.ruolo !== undefined) linee.push(`ruolo: ${args.ruolo}`);
  linee.push('');

  if (confronti.length === 0) {
    linee.push('nessuna decisione da confrontare.');
    return linee.join('\n');
  }

  for (const ruolo of RUOLI) {
    const suoi = gruppi.filter((g) => g.ruolo === ruolo);
    if (suoi.length === 0) continue;
    linee.push(ruolo.toUpperCase());
    linee.push('');
    for (const gruppo of suoi) {
      linee.push(`  ${gruppo.situazione}: ${gruppo.casi.length} ${gruppo.casi.length === 1 ? 'volta' : 'volte'}`);
      linee.push(`    ${rigaAzioni(gruppo)}`);
      const detto = giudizio(gruppo);
      if (detto !== null) linee.push(`    -> ${detto}`);
      if (differenzaNetta(gruppo)) {
        for (const caso of esempi(gruppo)) {
          const e = caso.esempio;
          const dove = e.presa === null ? e.tavolo : `${e.tavolo}, presa ${e.presa}`;
          linee.push(`    es. seed ${e.seed}, ${dove}`);
          linee.push(`      mano: ${e.mano.join(', ')}`);
          if (e.inTavola.length > 0) linee.push(`      tavola: ${e.inTavola.join(', ')}`);
          linee.push(`      umano ${e.umano}, bot ${e.bot}`);
        }
      }
      linee.push('');
    }
  }

  linee.push('ACCORDO');
  const perRuolo = accordoPerRuolo(confronti);
  let si = 0;
  let tot = 0;
  for (const riga of perRuolo) {
    linee.push(`  ${riga.ruolo.padEnd(10)} ${percento(riga.si, riga.tot).padStart(4)}  (${riga.si}/${riga.tot})`);
    si += riga.si;
    tot += riga.tot;
  }
  if (perRuolo.length > 1) {
    linee.push(`  ${'insieme'.padEnd(10)} ${percento(si, tot).padStart(4)}  (${si}/${tot})`);
  }
  return linee.join('\n');
}
