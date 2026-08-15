import type { Suit, TipoChiamata, Variant } from '@mediatore/engine';

/**
 * La forma delle smazzate in partite/: e' quella del registro dell'app,
 * copiata qui perche' l'imitatore non dipende da apps/web ne' da specchio.
 */

export type Ruolo = 'chiamante' | 'difensore' | 'amico' | 'liscio';

export interface Giocata {
  tipo: 'giocata';
  giocatore: number;
  ruolo: string;
  presa: number;
  mano: string[];
  legali: string[];
  scelta: string;
  inTavola: { giocatore: number; carta: string }[];
  staVincendo: number | null;
  puntiFinora: number[];
  msPerDecidere: number;
}

export interface Chiamata {
  tipo: 'chiamata';
  giocatore: number;
  mano: string[];
  trionfo: Suit;
  giocatori: number;
  scelta: 'passo' | TipoChiamata;
  giaPassati: number[];
  msPerDecidere: number;
}

export interface Scarto {
  tipo: 'scarto';
  giocatore: number;
  manoAllargata: string[];
  scartate: string[];
  msPerDecidere: number;
}

export interface SceltaAmico {
  tipo: 'amico';
  giocatore: number;
  mano: string[];
  cartaChiamata: string;
  msPerDecidere: number;
}

export interface SceltaApertura {
  tipo: 'apertura';
  giocatore: number;
  mano: string[];
  msPerDecidere: number;
}

export type Decisione = Giocata | Chiamata | Scarto | SceltaAmico | SceltaApertura;

export interface Smazzata {
  seed: number;
  giocatori: number;
  variante: Variant;
  mazziere: number;
  trionfo: Suit;
  scoperta: string | null;
  maniIniziali: string[][];
  monteIniziale: string[];
  controBot: boolean;
  postoUmano: number | null;
  carteScoperte: boolean;
  chiamante: number | null;
  chiamata: TipoChiamata | null;
  cartaDellAmico: string | null;
  amicoScoperto: number | null;
  decisioni: Decisione[];
}

export interface Foglio {
  versione: number;
  sessioneIniziata: string;
  smazzate: Smazzata[];
}

export interface Esempio {
  seed: number;
  tavolo: string;
  presa: number | null;
  mano: string[];
  inTavola: string[];
  umano: string;
  bot: string;
}

export interface Confronto {
  ruolo: Ruolo;
  situazione: string;
  azioneUmano: string;
  azioneBot: string;
  accordo: boolean;
  esempio: Esempio;
}

export interface Correzione {
  ruolo: Ruolo;
  situazione: string;
  azione: string;
  casi: number;
  quotaUmano: number;
  quotaBot: number;
  frase: string;
}
