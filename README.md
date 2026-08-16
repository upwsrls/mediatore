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
- `packages/pensatore` — il bot che sceglie la carta simulando come potrebbe
  finire la smazzata, con le regole di serie a far giocare gli altri.
- `packages/specchio` — legge le partite giocate e le confronta col bot di
  serie, raggruppando le differenze per situazione e per ruolo.
- `packages/imitatore` — parte dalle regole di serie e impara solo le
  correzioni dove l'umano gioca sistematicamente diverso.
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

## Pensatore

Il bot di serie gioca con le regole insegnate dalle partite vere. Il pensatore
non impara niente di nuovo: per ogni carta legale immagina come sono fatte le
mani nascoste (compatibili con i pali a cui qualcuno non ha risposto), gioca
la smazzata fino in fondo con quelle regole, e tiene la carta che in media
rende di piu'. Le stesse distribuzioni valgono per tutte le mosse, cosi' si
confronta la mossa e non la fortuna. Se due carte sono quasi uguali, decide
il bot di serie.

```sh
# quanti mondi sta in mezzo secondo, su una mossa a meta' smazzata
node --experimental-strip-types packages/pensatore/src/sfida.ts --solo-tempo --tempo=500

# sfida contro il bot di serie: stessi mazzi, posti alternati e scambiati
node --experimental-strip-types packages/pensatore/src/sfida.ts --smazzate=250 --mondi=50 --tempo=500

# la stessa sfida a 20, 50, 100 e 200 mondi, per vedere dove si ferma il guadagno
node --experimental-strip-types packages/pensatore/src/sfida.ts --smazzate=250 --scala --tempo=500
```

Argomenti: `--smazzate=N` (mazzi per tavolo, ognuno giocato due volte, default
250), `--mondi=N` (default 50), `--tempo=ms` (tetto per mossa, default 500),
`--seed=N` (default 1), `--tavolo=3|4|5|amico|tutti` (default `tutti`),
`--worker=N` (default: i processori della macchina), `--solo-tempo`, `--scala`.
Lo stesso comando e' `pnpm --filter @mediatore/pensatore sfida`.

Chiamata e scarto restano del bot di serie: si misura solo la carta da giocare.
Il saldo e' in quote, per ruolo (chiamante e difensore) e per tavolo, con il
tempo medio a mossa pensante.

## Specchio

Confronta le decisioni dell'umano con quelle che il bot di serie avrebbe
preso nella stessa situazione. Legge i fogli in `partite/`, salta le smazzate
a carte scoperte, e stampa un rapporto per situazione e per ruolo — non un
elenco di casi.

```sh
node --experimental-strip-types packages/specchio/src/specchio.ts
node --experimental-strip-types packages/specchio/src/specchio.ts --da=partite --ruolo=chiamante
node --experimental-strip-types packages/specchio/src/specchio.ts --ruolo=difensore
```

`--da` e' la cartella dei fogli (di serie `partite/`). `--ruolo` filtra
`chiamante` o `difensore` (e anche `amico` o `liscio`, se serve). Lo stesso
comando e' `pnpm --filter @mediatore/specchio specchio`.

## Imitatore

Parte dalle regole di `packages/bot` e impara solo a correggerle dove
l'umano, nelle partite in `partite/`, sceglie in modo netto e ripetuto
una cosa diversa. Pochi casi o un umano incoerente non spostano niente:
imparare rumore e' peggio di non imparare. A ogni lancio rilegge tutte
le smazzate (salta le carte scoperte) e riscrive `packages/imitatore/imparato.json`.

```sh
node --experimental-strip-types packages/imitatore/src/impara.ts --da=partite
node --experimental-strip-types packages/imitatore/src/sfida.ts --smazzate=250 --seed=1
```

La sfida e' quella del pensatore: stessi mazzi, posti alternati e
scambiati, contro il bot di serie. Stampa il saldo per ruolo e per
tavolo, e quante correzioni ha imparato su quanti casi. Chiamata e
scarto restano di serie. Lo stesso comando e' `pnpm --filter @mediatore/imitatore sfida`.

## App web (hotseat)

```sh
pnpm --filter @mediatore/web dev       # dev server su http://localhost:5173
pnpm --filter @mediatore/web build     # build di produzione con service worker
pnpm --filter @mediatore/web preview   # anteprima della build, utile per provare la PWA
pnpm --filter @mediatore/web test      # i moduli puri dell'app, per esempio i posti a tavola
```

Se il dev server continua a servire la versione vecchia di un file dopo averlo
modificato, non e' la cache: e' il watcher che non riceve le notifiche del
filesystem. Succede quando il server gira dentro un ambiente isolato — una
sandbox, un container, un volume di rete — dove le FSEvents di macOS non
arrivano al processo. Il rimedio e' una riga, e non serve toccare la
configurazione:

```sh
CHOKIDAR_USEPOLLING=1 pnpm --filter @mediatore/web dev   # il watcher guarda invece di ascoltare
```

Fuori dall'isolamento non serve, e non va usato per abitudine: guardare i file a
intervalli costa CPU, mentre le notifiche non costano niente. Vale per tutto il
monorepo: coi collegamenti di pnpm, anche le modifiche a `packages/engine`,
`packages/bot` e `packages/pensatore` arrivano al tavolo senza riavviare niente.

Un dev server alla volta, pero'. Due server sulla stessa app si dividono la
stessa cartella `node_modules/.vite`, e quando il secondo ricalcola le
dipendenze il primo continua a servire indirizzi che non esistono piu': il
risultato e' due copie di React, e la pagina resta bianca con un
`Cannot read properties of null (reading 'useState')` in console. Non e' un bug
del codice: si riavvia il server e torna tutto.

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

Contro i bot la carta la scelgono le regole di `packages/bot`. Dal setup, accanto
alle carte scoperte, si accende il pensatore (`scegliCartaPensando`, 100 mondi,
tetto 500 ms) per provarlo: gira su un filo a parte, dentro la pausa gia'
prevista (700-1800 ms). Di serie resta spento, perche' a 100 mondi cambia la
scelta delle regole troppo spesso e una parte di quei cambi e' rumore.
Chiamata e scarto restano del bot di serie in tutti e due i casi.

A smazzata finita, se il dev server e' acceso, la mano va anche in `partite/`
nella radice del progetto — un file per sessione, con la data nel nome. Se il
salvataggio fallisce il gioco va avanti: il registro nel browser resta quello
di sempre. Quei fogli li legge lo specchio.

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

Il tavolo suona (`src/audio/`). Il catalogo sta in `suoni.ts` — un nome per ogni
cosa che si sente: la carta appoggiata, l'uccisione, la carta che si
distribuisce, la base vinta, il monte raccolto, le decisioni della chiamata —
le quattro dichiarazioni, il passo, chi si fa avanti e il giro che si spegne
senza nessuno — l'amico scoperto, il cappotto, la smazzata che si chiude, il
proprio turno, il tocco degli ultimi tre secondi prima che il tavolo riparta, e
i due del setup — la scelta e l'ingresso al tavolo. Chi li fa suonare e'
`motore.ts`, e le schermate non lo sanno:
chiedono `suona('cartaGiocata')` e basta. Adesso sono segnaposto sintetizzati con
l'API audio del browser — niente da scaricare, funziona offline, pesa zero — e
per mettere al loro posto i suoni veri si cambia la ricetta nel catalogo in
`{ tipo: 'registrato', file: '/suoni/carta.webm' }`: il motore sa gia' suonare
anche quelli. Il criterio delle voci: quello che conta di piu' suona piu' pieno e
piu' lungo — uccisione e cappotto in cima, le dichiarazioni in scala di posta,
il passo sotto tutte quante, il tocco del conto alla rovescia in fondo — e
niente arriva al mezzo secondo.

La distribuzione fa eccezione a una regola sola: non e' un suono per l'evento,
e' un soffio per ogni carta, che parte col suo volo e finisce con lui, quindi il
rumore accompagna il giro fino all'ultima carta invece di spegnersi al terzo
secondo. Trentasei colpi di fila stancherebbero, e allora quello e' l'unico suono
del catalogo che ha un `respiro`: altezza e volume si scostano un po' a ogni
carta, come in un mazzo vero. Lo scarto esce dal numero della carta
(`conRespiro`), non dal caso: la stessa carta suona sempre uguale, per quante
volte lo schermo si ridisegni.

Il conteggio finale non si apre in silenzio, ma nemmeno festeggia: la smazzata
puo' essere andata bene o male, e chi ha perso non vuole una fanfara. Due note
basse che scendono — al contrario della base vinta e del cappotto, che salgono —
e dicono solo che le carte si posano. Suona una volta per smazzata, dentro
l'effetto che apre il conto alla rovescia: aprire e chiudere "rivedi la
smazzata" non lo rimette in moto, e i secondi che scorrono nemmeno. Quando c'e'
stato un suono un attimo prima — la fanfara del cappotto, o il "nessuno se la
sente" che chiude la smazzata senza giocarla — arriva in fila e non sopra: gli
lascia gli otto decimi di secondo che gli servono e poi chiude.

Nella chiamata si sentono tutte le decisioni, non solo le dichiarazioni: chi
passa fa un suono basso e corto, sotto ogni chiamata, perche' passare e' lasciar
correre e non dichiarare niente — ma si sente lo stesso, che e' cosi' che si
capisce che il giro va avanti. Vale per chi guarda e per i bot, che passano
dalla stessa `decidi`. Nella chi se la sente, chi si fa avanti ha la sua nota
che sale e il giro senza nessuno una nota piu' bassa e piu' lunga del passo: un
passo di tutti insieme.

Anche il setup risponde, se no sembra spento: un tocco leggero quando la scelta
cambia — giocatori, variante, livello, gli interruttori, il posto da cui si
guarda — e una nota piu' piena e decisa per il bottone che porta al tavolo.
Ripremere l'opzione gia' presa non e' una scelta, e non suona: ogni comando
passa da `scegli`, che confronta prima e dopo.

L'audio parte acceso, si spegne dalla pillola AUDIO in cima al tavolo e la scelta
resta fra una sessione e l'altra. L'impianto si sveglia al primo tocco, che al
setup e' proprio una di quelle scelte: il contesto nasce addormentato e ci mette
qualche millisecondo ad alzarsi, e allora il suono non si butta ma aspetta il
risveglio e parte li'. Altrimenti il tocco che accende l'impianto sarebbe
l'unico a non sentirsi. Dove il browser espone la levetta del silenzioso (`audioSession`) il
tavolo la rispetta. Se l'audio non parte, non decodifica o va storto in qualunque
modo, si gioca in silenzio: dal motore non esce mai un errore a schermo. Suonano
solo gli eventi del catalogo e le scelte del setup — al tavolo nessun tocco di
interfaccia — perche' un'app di carte che suona a ogni cosa e' peggio di una
muta.

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
