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
  uscito quel criterio, e il test dice quanto ci resta vicino. Nello scarto il
  palo piu' lungo non lo accorcia — quello e' una fonte di prese, e dopo due o
  tre giri tutto quello che ne resta in mano prende da solo. Da nessun palo di
  quattro carte in su toglie le figure: escono le scartine, che la catena di
  alte non si spezza, e la lunghezza si conta com'era quando ha preso il monte,
  se no bastava togliergli due carte per metterlo a perdere l'asso. Le figure le
  prende dai pali corti, che li' non si difendono, e un asso senza il suo 7 e
  senza niente dietro lo manda nel monte anche a costo di lasciarci punti:
  quella non e' una base, la maniglia se la porta via. Per lo stesso motivo non
  apre mai con un asso laterale finche' il 7 di quel palo gira — se fuori dal
  trionfo gli e' rimasto solo quello, esce da una scartina di trionfo, che non
  paga niente e tira fuori la maniglia — e su una presa che si porta via un
  avversario ci butta la carta che paga meno punti. La presa che sta vincendo
  un compagno non gliela toglie: ci carica i punti o ci scarta, che il trionfo
  speso per uccidere il proprio compagno non guadagna niente. Ci uccide sopra
  in un caso solo, quando la sua non comanda il palo e dietro c'e' chi la
  batterebbe a seme. Coi trionfi si
  arrassa finche' gli avversari ne hanno e finche' ne ha abbastanza da
  finirli davvero: con tre trionfi contro sei non si arrassa, che sarebbe
  bruciare il proprio comando su prese vuote. Ed esce da una carta che batte il
  trionfo piu' alto ancora in giro, non da una piu' bassa: con asso e cavallo e
  il re fuori esce l'asso, che il cavallo il re se lo porterebbe via. Sacrifica
  la seconda solo quando sopra la sua piu' alta gira ancora qualcosa da far
  uscire. Appena gli avversari sono a zero
  smette e incassa nei pali laterali, che senza trionfi in giro non li uccide
  piu' nessuno.
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
altri gli si dispongono intorno partendo dalla sua destra e proseguendo in senso
antiorario, cioe' nell'ordine di gioco, cosi' l'evidenza del turno gira a schermo
come gira al tavolo. Chi finisce dove lo decide `src/posti.ts`, che e' una
funzione pura e ha i suoi test: le tre disposizioni sono quelle da tre, quattro e
cinque giocatori.

Dal setup si apre direttamente il tavolo: le carte volano dal mazzo ai giocatori
una alla volta, in senso antiorario dal primo di mano, a `CARTA_DISTRIBUITA_MS`
l'una (`src/distribuzione.ts`, che sa solo l'ordine e il ritmo: le mani le ha
gia' fatte l'engine). Sono poco piu' di quattro secondi a ogni tavolo, e non si
saltano. Finito il giro compaiono il monte con la carta scoperta e i bottoni
della chiamata, sotto la mano, sullo stesso tavolo: chiamata normale per chi e'
di turno, sola, colonna e chi se la sente per chiunque e in qualsiasi momento.
Chi ha disattivato le animazioni vede le carte comparire ai posti senza volo,
allo stesso ritmo.

Se chi ha chiamato e' un bot, il monte e la carta dell'amico se li sbriga al
tavolo: niente schermata d'attesa, si aspetta come si aspetta il turno di un
giocatore. Al momento della chiamata una scritta la annuncia in mezzo al tavolo
per un paio di secondi (`Uccio chiama`), poi sparisce da sola e resta l'oro sul
nome del chiamante, che dalla chiamata arriva fino alla fine della smazzata.
Quando invece a scartare o a chiamare l'amico e' chi sta davanti allo schermo le
sue schermate restano quelle di prima: le carte le deve toccare lui.

A smazzata finita si legge il conteggio, e dopo `SECONDI_PRIMA_DI_RIPARTIRE`
(`src/useHand.ts`) la smazzata dopo parte da sola, con la stessa compagnia e il
mazziere che gira. Il conto alla rovescia sta a schermo e non si ferma: non c'e'
niente da premere per continuare, e chi non vuole giocare la prossima esce dal
tavolo e torna al setup. Il conto scorre anche mentre si rivedono le basi, e si
annulla insieme al tavolo: nessun timer sopravvive all'uscita.

A schermo la presa si chiama sempre BASE, in qualunque modalita': e' il termine
del tavolo, non una scelta di livello. Nel codice i nomi che vengono dall'engine
restano quelli — `Trick`, `completedTricks` — perche' non li legge nessun
giocatore.

Il tavolo ha due livelli (`src/livello.ts`), che spostano solo quello che si
legge: regole, carte disabilitate e bot sono identici. Da PRINCIPIANTE si vedono
i punti di ognuno che salgono base dopo base, il conto dei trionfi in cima
(`trionfi: 6 usciti, 1 in giro`) e i due avvisi della riga di stato, il cappotto
in corsa e il chiamante sotto soglia; da ESPERTO niente di tutto questo, i punti
si tengono a mente come al bar e si leggono alla fine. Anche quei due avvisi sono
punteggio travestito — uno dice che le basi sono andate tutte da una parte,
l'altro che il chiamante sta sotto — e al bar li sai solo se hai contato: della
riga di stato da esperto resta il riassunto, che al tavolo si dice a voce alta. Il conto dei trionfi non e'
riscritto: e' quello che tiene il bot, `carteUscite` e `trionfiRimasti` da
`@mediatore/bot`, letti attraverso la stessa vista di chi siede a quel posto —
quindi dice quanti, mai dove. Il livello si sceglie al setup accanto a giocatori
e variante, e si cambia al tavolo da una pillola in cima, come le carte scoperte;
col server sara' del tavolo e non si potra' piu' cambiare. Nel registro resta
segnato, e come per le carte scoperte vale il segno piu' generoso: un aiuto letto
a meta' smazzata non si scancella.

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
