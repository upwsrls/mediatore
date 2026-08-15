import { readFileSync, writeFileSync } from 'node:fs';
import type { Pesi } from './pesi.ts';
import { PESI_INIZIALI, sonoPesi } from './pesi.ts';
import type { Prova } from './prova.ts';

export interface Migliori {
  smazzate: number;
  saldo: number;
  pesi: Pesi;
}

export interface Checkpoint {
  smazzate: number;
  seed: number;
  passo: number;
  passoIniziale: number;
  pesi: Pesi;
  ultimaProva: Prova | null;
  migliori: Migliori | null;
}

export function checkpointVuoto(seed: number, passo: number): Checkpoint {
  return {
    smazzate: 0,
    seed,
    passo,
    passoIniziale: passo,
    pesi: { ...PESI_INIZIALI },
    ultimaProva: null,
    migliori: null,
  };
}

export function percorsoDeiMigliori(percorso: string): string {
  return percorso.endsWith('.json')
    ? `${percorso.slice(0, -'.json'.length)}.migliori.json`
    : `${percorso}.migliori`;
}

export function salvaCheckpoint(percorso: string, checkpoint: Checkpoint): void {
  writeFileSync(percorso, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

export function salvaMigliori(percorso: string, migliori: Migliori): void {
  writeFileSync(percorsoDeiMigliori(percorso), `${JSON.stringify(migliori, null, 2)}\n`, 'utf8');
}

export function caricaCheckpoint(percorso: string): Checkpoint {
  const grezzo: unknown = JSON.parse(readFileSync(percorso, 'utf8'));
  if (grezzo === null || typeof grezzo !== 'object') {
    throw new Error(`checkpoint illeggibile: ${percorso}`);
  }
  const record = grezzo as Record<string, unknown>;
  if (typeof record.smazzate !== 'number' || !Number.isFinite(record.smazzate)) {
    throw new Error(`checkpoint senza smazzate: ${percorso}`);
  }
  if (typeof record.seed !== 'number' || !Number.isFinite(record.seed)) {
    throw new Error(`checkpoint senza seed: ${percorso}`);
  }
  if (typeof record.passo !== 'number' || !Number.isFinite(record.passo)) {
    throw new Error(`checkpoint senza passo: ${percorso}`);
  }
  if (!sonoPesi(record.pesi)) {
    throw new Error(`checkpoint con pesi incompleti: ${percorso}`);
  }
  const passoIniziale =
    typeof record.passoIniziale === 'number' && Number.isFinite(record.passoIniziale)
      ? record.passoIniziale
      : record.passo;
  return {
    smazzate: Math.floor(record.smazzate),
    seed: Math.floor(record.seed),
    passo: record.passo,
    passoIniziale,
    pesi: record.pesi,
    ultimaProva: eProva(record.ultimaProva) ? record.ultimaProva : null,
    migliori: eMigliori(record.migliori) ? record.migliori : null,
  };
}

function eProva(valore: unknown): valore is Prova {
  if (valore === null || typeof valore !== 'object') return false;
  const record = valore as Record<string, unknown>;
  return typeof record.saldo === 'number' && typeof record.mani === 'number';
}

function eMigliori(valore: unknown): valore is Migliori {
  if (valore === null || typeof valore !== 'object') return false;
  const record = valore as Record<string, unknown>;
  return (
    typeof record.smazzate === 'number' &&
    typeof record.saldo === 'number' &&
    sonoPesi(record.pesi)
  );
}
