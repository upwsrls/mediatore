export { confrontaSmazzata, confrontaTutte, eUmano, ruoloVero } from './confronta.ts';
export {
  correzioneDalGruppo,
  imparaDaConfronti,
  imparaDaPartite,
  stampaApprendimento,
} from './impara.ts';
export type { Apprendimento, GruppoScartato, MotivoScarto } from './impara.ts';
export { leggiPartite } from './leggi.ts';
export { FILE_DI_SERIE, leggiMemoria, memoriaDa, salvaMemoria } from './memoria.ts';
export type { Memoria } from './memoria.ts';
export { correzionePer, imitatoreDa, ruoloDellaVista, scegliCartaImitando } from './scegli.ts';
export { media, misuraSfida, stampaSfida } from './sfida.ts';
export type { ContoRuolo, ContoTavolo, Sfida } from './sfida.ts';
export {
  azioneDellaChiamata,
  azioneDellaGiocata,
  azioneDelloScarto,
  situazioneDellaChiamata,
  situazioneDellaGiocata,
} from './situazioni.ts';
export { TAVOLI, giocaSmazzata } from './smazzata.ts';
export type { EsitoSmazzata, ScegliCarta, Tavolo, TavoloId } from './smazzata.ts';
export { MINIMO_CASI, SOGLIA_COERENZA, SOGLIA_DELTA } from './soglie.ts';
export type { Confronto, Correzione, Ruolo, Smazzata } from './tipi.ts';
