import { resolve } from 'node:path';
import { confrontaTutte } from './confronta.ts';
import { leggiPartite } from './leggi.ts';
import { stampaRapporto } from './rapporto.ts';
import type { Ruolo } from './tipi.ts';
import { RUOLI } from './situazioni.ts';

function argomento(nome: string): string | null {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato === undefined ? null : trovato.slice(prefisso.length);
}

function ruoloRichiesto(): Ruolo | undefined {
  const grezzo = argomento('ruolo');
  if (grezzo === null) return undefined;
  if ((RUOLI as readonly string[]).includes(grezzo)) return grezzo as Ruolo;
  console.error(`ruolo non valido: ${grezzo} (ammessi ${RUOLI.join(', ')})`);
  process.exit(1);
}

export function avvia(cartellaDa = 'partite', ruolo?: Ruolo): string {
  const cartella = resolve(cartellaDa);
  const fogli = leggiPartite(cartella);
  const smazzate = fogli.flatMap((foglio) => foglio.smazzate);
  const { confronti, saltateScoperte, smazzateViste } = confrontaTutte(smazzate);
  return stampaRapporto({
    confronti,
    file: fogli.length,
    smazzateViste,
    saltateScoperte,
    ...(ruolo === undefined ? {} : { ruolo }),
  });
}

const eIlPrincipale = process.argv[1]?.endsWith('specchio.ts') === true;
if (eIlPrincipale) {
  process.stdout.write(`${avvia(argomento('da') ?? 'partite', ruoloRichiesto())}\n`);
}
