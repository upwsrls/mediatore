# Mediatore

Monorepo TypeScript per un gioco di carte a prese con seme di trionfo,
nelle varianti a monte (3, 4, 5 giocatori) e amico (5 giocatori).

## Struttura

- `packages/engine` — regole del gioco: mazzo, prese, distribuzione, chiamata,
  ciclo della smazzata e conteggio. Zero dipendenze runtime, nessun I/O,
  nessun `Math.random`: la casualita' passa da un generatore seedabile.
- `packages/bot` — l'intelligenza dei giocatori automatici: quando chiamare,
  cosa lasciare nel monte, che carta giocare. Vede solo quello che vedrebbe
  uno seduto al tavolo, mai le mani degli altri. Per decidere se chiamare
  conta le basi gia' sue e la forza dei trionfi, non quanti trionfi ha, e le
  basi nei pali laterali le sconta quando non ha trionfi per difenderle:
  `packages/bot/src/chiamateVere.ts` tiene le 65 decisioni vere da cui e'
  uscito quel criterio, e il test dice quanto ci resta vicino. Coi trionfi si
  arrassa finche' gli avversari ne hanno, e smette appena sono a zero: da li'
  incassa nei pali laterali, che senza trionfi in giro non li uccide piu'
  nessuno.
- `packages/taratore` — cerca i numeri migliori per il bot facendogli giocare
  centinaia di migliaia di smazzate contro se stesso.
- `apps/simulator` — simulatore da terminale: fuzzer massivo e modalita'
  interattiva. Dipende solo da `@mediatore/engine` e dai builtin di Node.
- `apps/web` — PWA React in modalita' hotseat: tutti i giocatori sullo stesso
  schermo, uno alla volta. Nessuna regola vive qui, tutto passa dall'engine.

## Comandi

```sh
pnpm install
pnpm -r test          # tutti i test
pnpm -r typecheck     # controllo dei tipi (vitest non type-checka)
```

## Simulatore

```sh
# simulazione massiva: 2000 run per configurazione, seed di partenza 1
node --experimental-strip-types apps/simulator/src/fuzz.ts --runs=2000 --seed=1

# il bot a tutti i posti: e' cosi' che si vede come gioca le carte
node --experimental-strip-types apps/simulator/src/fuzz.ts --tuttiBot --runs=4000

# gioco nel terminale: occupi il posto indicato da --seat
node --experimental-strip-types apps/simulator/src/interactive.ts --players=4 --variant=monte --seat=0 --seed=1
```

Di regola le carte le giocano `greedy` e `random`, e del bot si misurano solo la
chiamata e lo scarto: per giudicare il gioco delle carte servono `--tuttiBot`,
che lo mette a ogni posto, o `--sfida`, che lo fa sedere a posti alterni contro
`greedy`.

Gli stessi comandi sono disponibili come script del package:
`pnpm --filter @mediatore/simulator fuzz` e `pnpm --filter @mediatore/simulator play`.

Ogni simulazione e' riproducibile dal suo seed: i messaggi di errore del fuzzer
riportano seed, tavolo e mazziere per poter rigiocare il caso che ha fallito.

## Taratore

I numeri del bot stanno tutti in `packages/bot/src/parametri.ts`. Quelli della
chiamata vengono da 65 decisioni di un giocatore esperto, registrate su tutti e
quattro i tavoli, e il taratore non ci passa: sono un dato, non un'ipotesi da
verificare. Gli altri sono ipotesi, e il taratore serve a verificarle facendo
giocare il bot contro se stesso.

```sh
# taratura completa: 20000 mazzi per combinazione, tutti i tavoli (~5 minuti)
node --experimental-strip-types packages/taratore/src/tara.ts

# piu' veloce, e su un tavolo solo
node --experimental-strip-types packages/taratore/src/tara.ts --smazzate=2000 --tavolo=4
```

Argomenti: `--smazzate=N` (mazzi per combinazione, default 20000), `--seed=N`
(default 1), `--tavolo=3|4|5|amico|tutti` (default `tutti`). Lo stesso comando
e' disponibile come `pnpm --filter @mediatore/taratore tara`.

Come lavora: prova un parametro alla volta, tiene il valore migliore e passa
al successivo, finche' nessuno migliora piu'. Il confronto e' appaiato due
volte — stessi mazzi per tutte le combinazioni, e ogni mazzo giocato due volte
a posti scambiati — cosi' la differenza misurata viene dai numeri e non dalla
fortuna o dal posto a tavola. Se due configurazioni sono identiche il saldo
misurato e' esattamente zero: e' la prova che la misura non regala niente.

Un miglioramento sotto 0,01 di saldo medio viene dichiarato NON significativo
e scartato. Alla fine i numeri vincenti vengono rigiocati su mazzi mai visti
durante la taratura, contro il bot di serie, contro `greedy` e contro
`random`: numeri che vincono solo contro un avversario non valgono niente.

Il taratore non scrive niente: stampa e basta. I valori che convincono si
portano a mano in `packages/bot/src/parametri.ts`.

## App web (hotseat)

```sh
pnpm --filter @mediatore/web dev       # dev server su http://localhost:5173
pnpm --filter @mediatore/web build     # build di produzione con service worker
pnpm --filter @mediatore/web preview   # anteprima della build, utile per provare la PWA
pnpm --filter @mediatore/web test      # i moduli puri dell'app, per esempio i posti a tavola
```

Il tavolo si guarda da un posto solo, il punto di vista, che sta in basso: gli
altri gli si dispongono intorno partendo dalla sua sinistra in senso antiorario,
cioe' nell'ordine di gioco. Chi finisce dove lo decide `src/posti.ts`, che e' una
funzione pura e ha i suoi test: le tre disposizioni sono quelle da tre, quattro e
cinque giocatori.

I posti si fissano quando nasce la smazzata e non cambiano piu' fino alla fine:
a cambiare e' solo l'evidenza di chi e' di turno, e sotto il tavolo compare la
mano di chi tocca, con scritto a chi passare il telefono. Il punto di vista si
sceglie prima di distribuire e si puo' spostare solo a smazzata finita: e' un
attrezzo dell'hotseat, col server sara' sempre l'utente collegato. Non entra in
nessun conto: mosse legali e turni restano quelli che dice l'engine.

Il seed non si chiede piu' all'utente: ogni smazzata ne genera uno e lo scrive
in console (`smazzata seed=4471`). Va allegato a ogni segnalazione di regole
che sembrano sbagliate, perche' rida' la stessa identica distribuzione.

### Immagini delle carte

Le foto del mazzo e il retro vengono da Wikimedia Commons e stanno in
`apps/web/public/carte`. Si rifanno con:

```sh
pnpm --filter @mediatore/web carte
```

Lo script scarica gli originali (una volta sola, poi restano in cache),
verifica che ogni file sia in pubblico dominio prima di toccarlo, converte in
WebP e riscrive `public/carte/LICENZE.md`. Larghezza e qualita' sono due
costanti in cima a `apps/web/scripts/prepara-carte.mjs`.
