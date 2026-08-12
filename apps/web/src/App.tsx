import type { ReactElement } from 'react';
import { DealingScreen } from './screens/DealingScreen';
import { DiscardScreen } from './screens/DiscardScreen';
import { EndScreen } from './screens/EndScreen';
import { FriendScreen } from './screens/FriendScreen';
import { OpeningScreen } from './screens/OpeningScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TableScreen } from './screens/TableScreen';
import { WaitScreen } from './screens/WaitScreen';
import { nomeGiocatore } from './labels';
import { useHand } from './useHand';

export function App(): ReactElement {
  const hand = useHand();
  const session = hand.session;
  const state = session?.state ?? null;

  // Chi ha chiamato deve ancora scartare o scegliersi l'amico, ma non e' chi
  // sta davanti allo schermo: si aspetta, senza vedere le sue carte.
  const caller = session?.call.caller ?? null;
  const decideUnBot =
    session != null && session.umano !== null && caller !== null && caller !== session.umano;

  return (
    <main className="app">
      {hand.error !== null && (
        <div className="banner banner-errore" role="alert">
          <span>{hand.error}</span>
          <button type="button" className="bottone-piccolo" onClick={hand.chiudiErrore}>
            chiudi
          </button>
        </div>
      )}

      {session === null && <SetupScreen onStart={hand.start} />}

      {/* Le carte che arrivano e la chiamata sono la stessa scena: il tavolo
          si apre appena distribuito e non si chiude piu' fino al gioco. */}
      {session !== null && (session.phase === 'distribuzione' || session.phase === 'call') && (
        <DealingScreen session={session} onDecide={hand.decidi} />
      )}

      {session !== null && session.phase === 'discard' && (
        decideUnBot ? (
          <WaitScreen
            session={session}
            titolo={`${nomeGiocatore(caller ?? 0)} prende il monte`}
            nota="sta scegliendo cosa lasciare"
          />
        ) : (
          <DiscardScreen session={session} onConferma={hand.confermaScarti} />
        )
      )}

      {session !== null && session.phase === 'apertura' && (
        // La chi se la sente l'ha dichiarata chi sta qui davanti: tocca agli
        // altri farsi avanti, e non c'e' niente da toccare.
        session.umano !== null && caller === session.umano ? (
          <WaitScreen
            session={session}
            titolo="chi se la sente?"
            nota="gli avversari stanno decidendo chi apre"
          />
        ) : (
          <OpeningScreen
            session={session}
            onApre={hand.apre}
            onNessuno={hand.nessunoSeLaSente}
          />
        )
      )}

      {session !== null && session.phase === 'friend' && (
        decideUnBot ? (
          <WaitScreen
            session={session}
            titolo={`${nomeGiocatore(caller ?? 0)} chiama l amico`}
            nota="sta scegliendo la carta"
          />
        ) : (
          <FriendScreen session={session} onScegli={hand.scegliAmico} />
        )
      )}

      {session !== null && session.phase === 'play' && state !== null && (
        <TableScreen
          session={session}
          state={state}
          pause={hand.pause}
          onGioca={hand.gioca}
          onCarteScoperte={hand.cambiaCarteScoperte}
        />
      )}

      {session !== null && session.phase === 'end' && (state !== null || session.scaduta) && (
        <EndScreen
          session={session}
          state={state}
          onNuovaSmazzata={hand.nuovaSmazzata}
          onRicomincia={hand.ricomincia}
          onCambiaPuntoDiVista={hand.cambiaPuntoDiVista}
        />
      )}
    </main>
  );
}
