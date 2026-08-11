import type { Card as CartaEngine } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { DORSO, immagineCarta } from '../carte/immagini';
import { NOMI_RANK, SEMI } from '../labels';

interface Props {
  card: CartaEngine;
  size?: 'normale' | 'piccola';
  disabled?: boolean;
  selected?: boolean;
  dalMonte?: boolean;
  /** Carta mostrata scoperta a tutti: il trionfo durante la fase di chiamata. */
  scoperta?: boolean;
  /** Carta di cui si vede solo il dorso: la mano di chi non e' di turno. */
  coperta?: boolean;
  motivo?: string | undefined;
  onClick?: (card: CartaEngine) => void;
}

/**
 * Unico punto in cui una carta viene disegnata. Adesso e' una foto del
 * mazzo napoletano: niente disposizione dei semi calcolata qui dentro.
 */
export function Card({
  card,
  size = 'normale',
  disabled = false,
  selected = false,
  dalMonte = false,
  scoperta = false,
  coperta = false,
  motivo,
  onClick,
}: Props): ReactElement {
  const seme = SEMI[card.suit];
  const nome = `${NOMI_RANK[card.rank]} di ${seme.nome}`;
  const classi = [
    'carta',
    `carta-${size}`,
    seme.classe,
    disabled ? 'carta-disabilitata' : '',
    selected ? 'carta-scelta' : '',
    dalMonte ? 'carta-dal-monte' : '',
    scoperta ? 'carta-scoperta' : '',
    coperta ? 'carta-coperta' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const figura = (
    <img
      className="carta-figura"
      src={coperta ? DORSO : immagineCarta(card)}
      alt=""
      draggable={false}
    />
  );

  // Una carta non giocabile non e' un bottone spento ma un elemento inerte:
  // cosi' il motivo resta leggibile al passaggio del mouse, che sui bottoni
  // disabilitati diversi browser non riportano.
  if (onClick === undefined || disabled) {
    return (
      <div
        className={classi}
        title={motivo}
        data-motivo={motivo}
        aria-disabled={disabled ? true : undefined}
        aria-label={
          coperta
            ? 'carta coperta'
            : `${nome}${disabled && motivo !== undefined ? `, non giocabile: ${motivo}` : ''}`
        }
      >
        {figura}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={classi}
      aria-label={coperta ? 'carta coperta' : nome}
      onClick={() => onClick(card)}
    >
      {figura}
    </button>
  );
}
