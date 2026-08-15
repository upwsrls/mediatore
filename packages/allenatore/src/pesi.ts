import type { Nome, Vettore } from './caratteristiche.ts';
import { NOMI, vettoreVuoto } from './caratteristiche.ts';

export type Pesi = Vettore;

/**
 * I pesi da cui si parte. Non sono il caso: sono scelti perche' il bot
 * pesato, sugli stessi mazzi, giochi il piu' possibile come quello attuale.
 *
 * I numeri vengono da una calibrazione sulle decisioni del bot di serie:
 * dove i due non andavano d'accordo, il peso della mossa scelta dal bot
 * attuale e' salito e quello della mossa sbagliata e' sceso. Se l'accordo
 * scende sotto l'80% questi numeri sono da rifare, non da addestrare.
 */
export const PESI_INIZIALI: Pesi = {
  e_di_trionfo: 1.144,
  e_padrona_del_palo: 0.1877,
  e_firma: -0.1153,
  e_firma_laterale: 0.3363,
  e_maniglia: -0.1676,
  e_asso: -0.133,
  e_re: -0.0785,
  punti_della_carta: 0.3435,
  forza_della_carta: -0.2185,
  unica_del_palo: -0.0551,
  carta_protetta: -1.1197,
  scartina_di_protezione: -0.4331,
  regalo_di_punti: 0.0356,
  punti_in_tavola: 0.4,
  apro_la_presa: 0,
  presa_del_compagno: 0.3,
  presa_dell_avversario: -0.3,
  presa_ancora_aperta: 0,
  posso_prenderla: -0.1433,
  rischio_di_perderla: -0.2795,
  posso_prenderla_sicuro: -0.3623,
  trionfi_degli_avversari: -0.4,
  sono_chiamante: 0,
  sono_difensore: 0,
  basi_rimaste: 0.2,
  sotto_la_soglia: 0.6,
  sopra_la_soglia: 0,
  liscio: 0,
  punti_sulla_presa_del_compagno: -0.8565,
  punti_sulla_presa_avversaria: -2.5638,
  trionfo_sulla_presa_del_compagno: -1.4398,
  trionfo_sulla_presa_avversaria: -1.4441,
  firma_in_apertura: 0.0508,
  firma_laterale_in_apertura: 4.0124,
  regalo_in_apertura: -0.5461,
  trionfo_in_apertura: -1.9721,
  punti_nel_liscio_se_prendo: -1.3604,
  punti_nel_liscio_se_perdo: 9.4867,
  protetta_sulla_presa_del_compagno: -8.299,
  scartina_sulla_presa_del_compagno: -0.888,
  e_la_piu_magra: 0.1062,
  e_la_piu_grassa: 0.076,
  e_la_piu_bassa: 0.184,
  e_la_piu_alta: -0.1238,
  e_il_trionfo_piu_basso_che_prende: 0.1583,
  punti_sopra_la_media_legale: 0.5435,
  forza_sopra_la_media_legale: 0.1815,
};

export function copiaPesi(pesi: Pesi): Pesi {
  const copia = vettoreVuoto();
  for (const nome of NOMI) copia[nome] = pesi[nome];
  return copia;
}

export function pesiCompleti(parziale: Partial<Pesi>, base: Pesi = PESI_INIZIALI): Pesi {
  const completi = copiaPesi(base);
  for (const nome of NOMI) {
    const valore = parziale[nome];
    if (valore !== undefined) completi[nome] = valore;
  }
  return completi;
}

export function sonoPesi(valore: unknown): valore is Pesi {
  if (valore === null || typeof valore !== 'object') return false;
  const record = valore as Record<string, unknown>;
  return NOMI.every((nome) => typeof record[nome] === 'number' && Number.isFinite(record[nome]));
}

/** Le caratteristiche col peso piu' alto e piu' basso, per il riepilogo. */
export function estremiDeiPesi(
  pesi: Pesi,
  quanti = 8,
): { alte: readonly { nome: Nome; peso: number }[]; basse: readonly { nome: Nome; peso: number }[] } {
  const ordinati = [...NOMI]
    .map((nome) => ({ nome, peso: pesi[nome] }))
    .sort((a, b) => b.peso - a.peso);
  return {
    alte: ordinati.slice(0, quanti),
    basse: ordinati.slice(-quanti).reverse(),
  };
}
