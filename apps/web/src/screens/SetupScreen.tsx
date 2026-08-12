import type { Variant } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { PuntoDiVista } from '../components/PuntoDiVista';

interface Props {
  onStart: (
    players: number,
    variant: Variant,
    puntoDiVista: number,
    controBot: boolean,
    carteScoperte: boolean,
  ) => void;
}

export function SetupScreen({ onStart }: Props): ReactElement {
  const [players, setPlayers] = useState(4);
  const [variant, setVariant] = useState<Variant>('monte');
  const [puntoDiVista, setPuntoDiVista] = useState(0);
  const [controBot, setControBot] = useState(false);
  const [carteScoperte, setCarteScoperte] = useState(false);

  // La variante amico esiste solo in cinque: cambiando tavolo si torna al monte.
  function cambiaGiocatori(numero: number): void {
    setPlayers(numero);
    if (numero !== 5) setVariant('monte');
    if (puntoDiVista >= numero) setPuntoDiVista(0);
  }

  return (
    <section className="schermata">
      <h1>Mediatore Barlettano</h1>
      <p className="sottotitolo">
        {controBot
          ? 'siedi al tavolo: gli altri posti li occupano loro'
          : 'modalita hotseat: tutti i giocatori sullo stesso schermo, uno alla volta'}
      </p>

      <label className="interruttore">
        <input
          type="checkbox"
          checked={controBot}
          onChange={(evento) => setControBot(evento.target.checked)}
        />
        gioca contro i bot
      </label>

      {/* Attrezzo da officina: serve a vedere dove sbagliano i bot, e le
          smazzate giocate cosi' finiscono nel registro col loro segno. */}
      {controBot && (
        <label className="interruttore interruttore-annidato">
          <input
            type="checkbox"
            checked={carteScoperte}
            onChange={(evento) => setCarteScoperte(evento.target.checked)}
          />
          vedi le carte di tutti (per correggere i bot)
        </label>
      )}

      <fieldset>
        <legend>giocatori</legend>
        <div className="riga-bottoni">
          {[3, 4, 5].map((numero) => (
            <button
              key={numero}
              type="button"
              className={`scelta ${players === numero ? 'scelta-attiva' : ''}`}
              onClick={() => cambiaGiocatori(numero)}
            >
              {numero}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>variante</legend>
        <div className="riga-bottoni">
          <button
            type="button"
            className={`scelta ${variant === 'monte' ? 'scelta-attiva' : ''}`}
            onClick={() => setVariant('monte')}
          >
            monte
          </button>
          <button
            type="button"
            className={`scelta ${variant === 'amico' ? 'scelta-attiva' : ''}`}
            disabled={players !== 5}
            onClick={() => setVariant('amico')}
          >
            amico
          </button>
        </div>
        {players !== 5 && <p className="nota">la variante amico richiede 5 giocatori</p>}
      </fieldset>

      {/* Contro i bot il posto e' uno solo, il proprio: non c'e' piu' niente
          da scegliere. */}
      {!controBot && (
        <fieldset>
          <legend>prova</legend>
          <PuntoDiVista players={players} valore={puntoDiVista} onCambia={setPuntoDiVista} />
          <p className="nota">
            in hotseat il tavolo si guarda da un posto solo: col server ognuno vedra' se
            stesso in basso sul proprio telefono
          </p>
        </fieldset>
      )}

      <button
        type="button"
        className="bottone-grande"
        onClick={() => onStart(players, variant, puntoDiVista, controBot, carteScoperte)}
      >
        Vai al tavolo
      </button>
    </section>
  );
}
