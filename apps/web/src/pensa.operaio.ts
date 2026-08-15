import type { VistaDelBot } from '@mediatore/bot';
import type { DomandaAlPensatore, RispostaDelPensatore } from './pensa.lavoro.ts';

let operaio: Worker | null = null;
let prossimo = 1;
const attese = new Map<number, (cartaId: string) => void>();

function prendiOperaio(): Worker {
  if (operaio !== null) return operaio;
  operaio = new Worker(new URL('./pensa.worker.ts', import.meta.url), { type: 'module' });
  operaio.addEventListener('message', (evento: MessageEvent<RispostaDelPensatore>) => {
    const { id, cartaId } = evento.data;
    const risolvi = attese.get(id);
    attese.delete(id);
    risolvi?.(cartaId);
  });
  return operaio;
}

/**
 * Chiede la carta al pensatore sull'altro filo. Se la situazione cambia
 * prima della risposta, `annulla` butta via il risultato: il worker finisce
 * per conto suo, la pagina non gioca una mossa vecchia.
 */
export function chiediCartaPensando(
  vista: VistaDelBot,
  seed: number,
): { pronta: Promise<string>; annulla: () => void } {
  const id = prossimo;
  prossimo += 1;
  let risolvi: (cartaId: string) => void = () => undefined;
  const pronta = new Promise<string>((prossima) => {
    risolvi = prossima;
  });
  attese.set(id, risolvi);
  const domanda: DomandaAlPensatore = { id, vista, seed };
  prendiOperaio().postMessage(domanda);
  return {
    pronta,
    annulla: () => {
      attese.delete(id);
    },
  };
}
