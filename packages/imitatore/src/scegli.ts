import type { VistaDelBot } from '@mediatore/bot';
import { alleatoDi, scegliCarta, sonoIlChiamante } from '@mediatore/bot';
import type { Card, Rng } from '@mediatore/engine';
import { azioneDellaGiocata, situazioneDellaGiocata } from './situazioni.ts';
import type { Correzione, Ruolo } from './tipi.ts';

/**
 * Il ruolo come lo vede chi sta giocando: l'amico nascosto sa di esserlo
 * (ha la carta chiamata), il liscio non si mescola ai difensori.
 */
export function ruoloDellaVista(vista: VistaDelBot): Ruolo {
  if (vista.alliance.kind === 'liscio') return 'liscio';
  if (sonoIlChiamante(vista)) return 'chiamante';
  if (alleatoDi(vista, vista.alliance.caller)) return 'amico';
  return 'difensore';
}

export function correzionePer(
  vista: VistaDelBot,
  correzioni: readonly Correzione[],
): Correzione | null {
  const ruolo = ruoloDellaVista(vista);
  const situazione = situazioneDellaGiocata(vista);
  return correzioni.find((c) => c.ruolo === ruolo && c.situazione === situazione) ?? null;
}

/**
 * Chiede prima al bot di serie. Se per quella situazione c'e' una
 * correzione imparata, gioca una carta legale di quell'azione; se no,
 * o se in mano non ce n'e' nessuna, resta la scelta di serie.
 */
export function scegliCartaImitando(
  vista: VistaDelBot,
  rng: Rng,
  correzioni: readonly Correzione[],
): Card {
  const diSerie = scegliCarta(vista, rng);
  const correzione = correzionePer(vista, correzioni);
  if (correzione === null) return diSerie;

  const candidati = vista.legali.filter(
    (carta) => azioneDellaGiocata(vista, carta) === correzione.azione,
  );
  if (candidati.length === 0) return diSerie;
  if (candidati.some((carta) => carta.id === diSerie.id)) return diSerie;

  const indice = Math.min(candidati.length - 1, Math.floor(rng() * candidati.length));
  return candidati[indice] ?? diSerie;
}

export function imitatoreDa(
  correzioni: readonly Correzione[],
): (vista: VistaDelBot, rng: Rng) => Card {
  return (vista, rng) => scegliCartaImitando(vista, rng, correzioni);
}
