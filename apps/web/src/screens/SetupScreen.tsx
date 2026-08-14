import type { Variant } from '@mediatore/engine';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useAudio } from '../audio/useAudio';
import { PartiteRegistrate } from '../components/PartiteRegistrate';
import { PuntoDiVista } from '../components/PuntoDiVista';
import type { Livello } from '../livello';
import { LIVELLI } from '../livello';

interface Props {
  onStart: (
    players: number,
    variant: Variant,
    puntoDiVista: number,
    controBot: boolean,
    carteScoperte: boolean,
    livello: Livello,
  ) => void;
}

export function SetupScreen({ onStart }: Props): ReactElement {
  const [players, setPlayers] = useState(4);
  const [variant, setVariant] = useState<Variant>('monte');
  const [puntoDiVista, setPuntoDiVista] = useState(0);
  const [controBot, setControBot] = useState(false);
  const [carteScoperte, setCarteScoperte] = useState(false);
  const [livello, setLivello] = useState<Livello>('principiante');
  const audio = useAudio();

  /**
   * Ogni scelta del setup passa di qui: si sente solo quando cambia davvero,
   * perche' ripremere quella gia' presa non e' una scelta, e' un dito che
   * torna dov'era. Il tocco arriva prima del cambio, cosi' risponde subito
   * anche quando la scelta rifa' mezza schermata.
   */
  function scegli<T>(prima: T, adesso: T, applica: (valore: T) => void): void {
    if (Object.is(prima, adesso)) return;
    audio.suona('scelta');
    applica(adesso);
  }

  // La variante amico esiste solo in cinque: cambiando tavolo si torna al monte.
  function cambiaGiocatori(numero: number): void {
    setPlayers(numero);
    if (numero !== 5) setVariant('monte');
    if (puntoDiVista >= numero) setPuntoDiVista(0);
  }

  return (
    <section className="schermata schermata-setup">
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
          onChange={(evento) => scegli(controBot, evento.target.checked, setControBot)}
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
            onChange={(evento) => scegli(carteScoperte, evento.target.checked, setCarteScoperte)}
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
              onClick={() => scegli(players, numero, cambiaGiocatori)}
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
            onClick={() => scegli(variant, 'monte', setVariant)}
          >
            monte
          </button>
          <button
            type="button"
            className={`scelta ${variant === 'amico' ? 'scelta-attiva' : ''}`}
            disabled={players !== 5}
            onClick={() => scegli(variant, 'amico', setVariant)}
          >
            amico
          </button>
        </div>
        {players !== 5 && <p className="nota">la variante amico richiede 5 giocatori</p>}
      </fieldset>

      <fieldset>
        <legend>livello</legend>
        <div className="riga-bottoni">
          {LIVELLI.map((scelta) => (
            <button
              key={scelta}
              type="button"
              className={`scelta ${livello === scelta ? 'scelta-attiva' : ''}`}
              onClick={() => scegli(livello, scelta, setLivello)}
            >
              {scelta}
            </button>
          ))}
        </div>
        <p className="nota">
          {livello === 'principiante'
            ? 'il tavolo tiene il conto: punti di tutti e trionfi usciti'
            : 'punti e trionfi si tengono a mente: i punti si vedono alla fine'}
        </p>
      </fieldset>

      {/* Contro i bot il posto e' uno solo, il proprio: non c'e' piu' niente
          da scegliere. */}
      {!controBot && (
        <fieldset>
          <legend>prova</legend>
          <PuntoDiVista
            players={players}
            valore={puntoDiVista}
            onCambia={(seat) => scegli(puntoDiVista, seat, setPuntoDiVista)}
          />
          <p className="nota">
            in hotseat il tavolo si guarda da un posto solo: col server ognuno vedra' se
            stesso in basso sul proprio telefono
          </p>
        </fieldset>
      )}

      <button
        type="button"
        className="bottone-grande"
        onClick={() => {
          audio.suona('vaiAlTavolo');
          onStart(players, variant, puntoDiVista, controBot, carteScoperte, livello);
        }}
      >
        Vai al tavolo
      </button>

      {/* Lo stesso quaderno che sta in fondo al conteggio, e lo stesso
          componente: qui serve perche' il registro si porta via anche senza
          giocare una mano. Come la', non c'e' quando non c'e' niente dentro. */}
      <PartiteRegistrate />
    </section>
  );
}
