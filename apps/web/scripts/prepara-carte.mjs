/**
 * Scarica da Wikimedia Commons le foto del mazzo napoletano e le prepara
 * per l app. Ripetibile: cambia un parametro qui sotto e rilancia con
 *   node scripts/prepara-carte.mjs
 * Gli originali restano in scripts/.originali e non si riscaricano.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// ---- parametri ----
const LARGHEZZA = 400; // px del lato corto
const PROPORZIONI = 2188 / 1324; // quelle degli originali di Commons
const ALTEZZA = Math.round(LARGHEZZA * PROPORZIONI);
const QUALITA = 82; // qualita' WebP
const LIMITE_TOTALE_MB = 2;
/**
 * Le foto non hanno bordo in eccesso da togliere: il bianco intorno al
 * disegno e' il margine della carta vera. Ritagliarlo cambierebbe le
 * proporzioni carta per carta, perche' ogni figura occupa uno spazio suo:
 * il due di denari diventava alto il doppio del cavallo di coppe.
 */
const RITAGLIA_BORDO = false;
const SOGLIA_RITAGLIO = 10;
const PAUSA_MS = 400; // fra un file e l altro, per non farsi limitare
const TENTATIVI = 5; // ritentativi in caso di 429

/**
 * Schiaritura: 'nessuna' | 'leggera' | 'media' | 'decisa'.
 * Il provino si guarda con  node scripts/prepara-carte.mjs --provino
 */
const SCHIARITURA = 'nessuna';

/**
 * Ogni livello e' una curva sola, applicata al canale piu' alto del pixel e
 * riportata sugli altri due in proporzione: cosi' il colore cambia di
 * luminosita' ma non di tinta ne' di pienezza, e il rosso delle coppe resta
 * rosso invece di virare al rosa.
 *
 * - luminosita': gamma dolce, alza le mezze tinte (l inchiostro spento).
 * - ginocchio: sotto questo valore non si tocca niente, i colori sono salvi.
 * - puntoBianco: da qui in su e' bianco, il grigio della scansione sparisce.
 */
const SCHIARITURE = {
  nessuna: null,
  leggera: { luminosita: 1.0, ginocchio: 225, puntoBianco: 248 },
  media: { luminosita: 1.06, ginocchio: 210, puntoBianco: 238 },
  decisa: { luminosita: 1.12, ginocchio: 195, puntoBianco: 228 },
};

/** Le due carte del provino: una piena d oro, una piena di rosso. */
const CARTE_PROVINO = ['denari-re', 'coppe-3'];
// -------------------

const QUI = dirname(fileURLToPath(import.meta.url));
const ORIGINALI = join(QUI, '.originali');
const USCITA = join(QUI, '..', 'public', 'carte');
const CATEGORIA = 'Category:Naples deck';
const RETRO = 'File:Carte Napoletane retro.jpg';
const AGENTE = 'MediatoreDev/0.1 (preparazione carte, uso locale)';

/** Sulle carte l 8 e' il fante, il 9 il cavallo, il 10 il re. */
const RANGHI = ['asso', '2', '3', '4', '5', '6', '7', 'fante', 'cavallo', 're'];
const SEMI = ['denari', 'coppe', 'spade', 'bastoni'];

/** Licenze accettate: pubblico dominio senza obbligo di attribuzione. */
const LICENZE_AMMESSE = new Set(['pd']);

async function api(parametri) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    format: 'json',
    ...parametri,
  })}`;
  const risposta = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!risposta.ok) throw new Error(`Commons ha risposto ${risposta.status} a ${url}`);
  return risposta.json();
}

function senzaTag(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** L id engine della carta numero n della categoria: 1..10 denari, 11..20 coppe... */
function idDellaCarta(numero) {
  const seme = SEMI[Math.floor((numero - 1) / 10)];
  const rango = RANGHI[(numero - 1) % 10];
  if (seme === undefined || rango === undefined) throw new Error(`numero fuori mazzo: ${numero}`);
  return `${seme}-${rango}`;
}

async function elencaCarte() {
  const dati = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: CATEGORIA,
    cmlimit: '500',
    cmtype: 'file',
  });
  const carte = new Map();
  for (const { title } of dati.query.categorymembers) {
    const trovato = /^File:(\d{2}) /.exec(title);
    if (trovato === null) continue;
    carte.set(idDellaCarta(Number(trovato[1])), title);
  }
  if (carte.size !== 40) {
    throw new Error(`nella categoria ho trovato ${carte.size} carte numerate invece di 40`);
  }
  carte.set('retro', RETRO);
  return carte;
}

async function schede(titoli) {
  const per = new Map();
  for (let i = 0; i < titoli.length; i += 20) {
    const lotto = titoli.slice(i, i + 20);
    const dati = await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      titles: lotto.join('|'),
    });
    for (const pagina of Object.values(dati.query.pages)) {
      const info = pagina.imageinfo?.[0];
      if (info === undefined) throw new Error(`file introvabile su Commons: ${pagina.title}`);
      per.set(pagina.title, {
        licenza: senzaTag(info.extmetadata.LicenseShortName?.value),
        codice: senzaTag(info.extmetadata.License?.value),
        autore: senzaTag(info.extmetadata.Artist?.value),
        url: info.url.split('?')[0],
        pagina: info.descriptionurl,
        larghezza: info.width,
        altezza: info.height,
      });
    }
  }
  return per;
}

/**
 * Il controllo della licenza sta qui e non nella testa di chi lancia lo
 * script: un file non in pubblico dominio ferma tutto prima di scaricare.
 */
function verificaLicenze(carte, info) {
  const fuori = [];
  for (const [id, titolo] of carte) {
    const scheda = info.get(titolo);
    if (scheda === undefined || !LICENZE_AMMESSE.has(scheda.codice)) {
      fuori.push(`${id} (${titolo}): ${scheda?.licenza ?? 'licenza sconosciuta'}`);
    }
  }
  if (fuori.length > 0) {
    throw new Error(`file non in pubblico dominio, mi fermo:\n  ${fuori.join('\n  ')}`);
  }
}

const attendi = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

/**
 * Quaranta file di fila sono troppi per Wikimedia: risponde 429. Una pausa
 * fra un file e l altro e qualche ritentativo bastano a restare buoni ospiti.
 */
async function scarica(url, destinazione) {
  if (existsSync(destinazione)) return false;
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo += 1) {
    const risposta = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (risposta.ok) {
      await writeFile(destinazione, Buffer.from(await risposta.arrayBuffer()));
      await attendi(PAUSA_MS);
      return true;
    }
    if (risposta.status !== 429 || tentativo === TENTATIVI) {
      throw new Error(`scaricamento fallito (${risposta.status}) per ${url}`);
    }
    const consigliata = Number(risposta.headers.get('retry-after')) * 1000;
    const attesa = Number.isFinite(consigliata) && consigliata > 0 ? consigliata : PAUSA_MS * 4 ** tentativo;
    console.log(`  429 su ${url.split('/').pop()}, riprovo fra ${(attesa / 1000).toFixed(1)}s`);
    await attendi(attesa);
  }
  return false;
}

/**
 * La curva della schiaritura, pronta per i 256 valori possibili. Sale con
 * pendenza uno dal ginocchio, cosi' l attacco non si vede, e arriva a 255
 * al punto di bianco.
 */
function curva({ luminosita, ginocchio, puntoBianco }) {
  const tabella = new Uint8Array(256);
  const salita = puntoBianco - ginocchio;
  for (let v = 0; v < 256; v += 1) {
    let x = 255 * (v / 255) ** (1 / luminosita);
    if (x > ginocchio) {
      const t = Math.min(1, (x - ginocchio) / salita);
      x = ginocchio + salita * t + (255 - ginocchio - salita) * t * t;
    }
    tabella[v] = Math.max(0, Math.min(255, Math.round(x)));
  }
  return tabella;
}

/** Schiarisce tenendo il rapporto fra i canali: la tinta non si muove. */
async function schiarisci(catena, livello) {
  const regolazione = SCHIARITURE[livello];
  if (regolazione === undefined) throw new Error(`schiaritura sconosciuta: ${livello}`);
  if (regolazione === null) return catena;
  const tabella = curva(regolazione);
  const { data, info } = await catena.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const alto = Math.max(data[i], data[i + 1], data[i + 2]);
    if (alto === 0) continue;
    const fattore = tabella[alto] / alto;
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * fattore));
    }
  }
  return sharp(data, { raw: info });
}

/**
 * Tutte le immagini escono della stessa forma, retro compreso: una carta
 * girata deve occupare lo stesso spazio di una scoperta. Il retro e' stato
 * fotografato con proporzioni un po' diverse, quindi gli si toglie una
 * striscia invece di deformarlo.
 */
async function converti(sorgente, destinazione) {
  const catena = sharp(sorgente);
  if (RITAGLIA_BORDO) catena.trim({ threshold: SOGLIA_RITAGLIO });
  catena.resize({ width: LARGHEZZA, height: ALTEZZA, fit: 'cover' });
  const schiarita = await schiarisci(catena, SCHIARITURA);
  return schiarita.webp({ quality: QUALITA }).toFile(destinazione);
}

async function pesoCartella(cartella) {
  let totale = 0;
  for (const nome of await readdir(cartella)) {
    if (!nome.endsWith('.webp')) continue;
    totale += (await stat(join(cartella, nome))).size;
  }
  return totale;
}

async function scriviLicenze(carte, info) {
  const righe = [...carte].map(([id, titolo]) => {
    const s = info.get(titolo);
    const nomeCommons = titolo.replace(/^File:/, '');
    return `| \`${id}.webp\` | [${nomeCommons}](${s.pagina}) | ${s.autore} | ${s.licenza} (\`PD-user-it\`) |`;
  });

  const testo = `# Immagini delle carte

Le 40 carte e il retro vengono da [${CATEGORIA}](https://commons.wikimedia.org/wiki/${encodeURIComponent(
    CATEGORIA,
  )}) su Wikimedia Commons. Sono tutte dello stesso autore, che le ha
rilasciate in pubblico dominio con il template \`{{PD-user-it|Trocche100}}\`:
l equivalente di PD-self sulla Wikipedia italiana. Nessuna richiede
attribuzione, la citiamo per poter risalire alla fonte.

Il controllo della licenza e' dentro \`scripts/prepara-carte.mjs\`: se anche
un solo file smettesse di essere in pubblico dominio, lo script si ferma
prima di scaricare qualsiasi cosa.

## Lavorazione

Originali 1324x2188 px. Per ogni file: ridimensionamento a ${LARGHEZZA} px
di larghezza e conversione in WebP di qualita' ${QUALITA}. I parametri
stanno in cima allo script.

Nessun ritaglio: il bianco intorno al disegno e' il margine della carta,
non sfondo di troppo. Toglierlo dava a ogni carta proporzioni diverse.

Schiaritura: ${SCHIARITURA}. Gli originali hanno gia' il bianco a 255 pieno,
quindi non serve: il parametro resta per quando servisse.

## File

| file | pagina su Commons | autore | licenza |
| --- | --- | --- | --- |
${righe.join('\n')}
`;
  await writeFile(join(USCITA, 'LICENZE.md'), testo);
}

/**
 * Il provino: le carte scelte nelle quattro versioni, affiancate sul verde
 * del panno perche' e' li' che si guarderanno, piu' un dettaglio ingrandito
 * dove il bianco della scansione e il colore stanno vicini.
 */
async function provino() {
  const PANNO = { r: 0x12, g: 0x35, b: 0x24 };
  const larghezza = 300;
  const altezza = Math.round(larghezza * PROPORZIONI);
  const dettaglio = 190;
  const livelli = Object.keys(SCHIARITURE);
  const margine = 24;
  const testa = 46;
  const foglioLargo = margine + livelli.length * (larghezza + margine);
  const foglioAlto =
    testa + CARTE_PROVINO.length * (altezza + margine) + dettaglio + margine + testa;

  const colonna = (i) => margine + i * (larghezza + margine);
  const strati = [];
  const numeri = [];

  for (const [riga, id] of CARTE_PROVINO.entries()) {
    for (const [i, livello] of livelli.entries()) {
      const base = sharp(join(ORIGINALI, `${id}.jpg`)).resize(larghezza, altezza, { fit: 'cover' });
      const schiarita = await schiarisci(base, livello);
      strati.push({
        input: await schiarita.png().toBuffer(),
        left: colonna(i),
        top: testa + riga * (altezza + margine),
      });
      numeri.push({ id, livello, ...(await misura(join(ORIGINALI, `${id}.jpg`), livello)) });
    }
  }

  // Dettaglio: una fetta centrale del re di denari, dove oro e rosso toccano il bianco.
  const meta = await sharp(join(ORIGINALI, `${CARTE_PROVINO[0]}.jpg`)).metadata();
  const taglio = {
    left: Math.round(meta.width * 0.2),
    top: Math.round(meta.height * 0.4),
    width: Math.round(meta.width * 0.6),
    height: Math.round(meta.width * 0.6 * (dettaglio / larghezza)),
  };
  for (const [i, livello] of livelli.entries()) {
    const base = sharp(join(ORIGINALI, `${CARTE_PROVINO[0]}.jpg`))
      .extract(taglio)
      .resize(larghezza, dettaglio, { fit: 'cover' });
    const schiarita = await schiarisci(base, livello);
    strati.push({
      input: await schiarita.png().toBuffer(),
      left: colonna(i),
      top: testa + CARTE_PROVINO.length * (altezza + margine),
    });
  }

  const etichette = livelli
    .map(
      (livello, i) =>
        `<text x="${colonna(i) + larghezza / 2}" y="32" text-anchor="middle" font-family="Helvetica, sans-serif" font-size="26" fill="#f2f5f3">${livello}</text>`,
    )
    .join('');
  const piede = `<text x="${margine}" y="${foglioAlto - 16}" font-family="Helvetica, sans-serif" font-size="20" fill="#d8b45a">dettaglio del re di denari · schiaritura ${livelli.slice(1).join(' / ')}</text>`;
  strati.push({
    input: Buffer.from(
      `<svg width="${foglioLargo}" height="${foglioAlto}">${etichette}${piede}</svg>`,
    ),
    left: 0,
    top: 0,
  });

  const cartella = join(QUI, '.provino');
  await mkdir(cartella, { recursive: true });
  const destinazione = join(cartella, 'schiaritura.png');
  await sharp({
    create: { width: foglioLargo, height: foglioAlto, channels: 3, background: PANNO },
  })
    .composite(strati)
    .png()
    .toFile(destinazione);

  console.log(`provino in ${destinazione}\n`);
  console.log('carta         livello   bianco medio   rosso pieno      oro pieno');
  for (const n of numeri) {
    console.log(
      `${n.id.padEnd(13)} ${n.livello.padEnd(9)} ${String(n.bianco).padStart(9)}      ${n.rosso.padEnd(15)} ${n.oro}`,
    );
  }
}

/** Due numeri per capire cosa cambia: il bianco della carta e i colori pieni. */
async function misura(sorgente, livello) {
  const { data, info } = await (await schiarisci(sharp(sorgente), livello))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let chiari = 0;
  let sommaChiari = 0;
  const rosso = [0, 0, 0];
  let nRosso = 0;
  const oro = [0, 0, 0];
  let nOro = 0;
  for (let i = 0; i < data.length; i += ch) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const alto = Math.max(r, g, b);
    const basso = Math.min(r, g, b);
    if (basso > 180) {
      chiari += 1;
      sommaChiari += (r + g + b) / 3;
    } else if (alto - basso > 60) {
      if (r === alto && g < r * 0.55 && b < r * 0.55) {
        nRosso += 1;
        for (let c = 0; c < 3; c += 1) rosso[c] += data[i + c];
      } else if (r > 120 && g > 100 && b < g * 0.6) {
        nOro += 1;
        for (let c = 0; c < 3; c += 1) oro[c] += data[i + c];
      }
    }
  }
  const media = (a, n) => (n === 0 ? '-' : a.map((v) => Math.round(v / n)).join(','));
  return {
    bianco: chiari === 0 ? 0 : Math.round(sommaChiari / chiari),
    rosso: media(rosso, nRosso),
    oro: media(oro, nOro),
  };
}

async function main() {
  await mkdir(ORIGINALI, { recursive: true });
  await mkdir(USCITA, { recursive: true });

  const carte = await elencaCarte();
  const info = await schede([...carte.values()]);
  verificaLicenze(carte, info);
  console.log(`licenze verificate: ${carte.size} file, tutti in pubblico dominio`);

  let scaricati = 0;
  const misure = [];
  for (const [id, titolo] of carte) {
    const scheda = info.get(titolo);
    const originale = join(ORIGINALI, `${id}.jpg`);
    if (await scarica(scheda.url, originale)) scaricati += 1;
    const uscita = join(USCITA, `${id}.webp`);
    const risultato = await converti(originale, uscita);
    misure.push({ id, larghezza: risultato.width, altezza: risultato.height, peso: risultato.size });
  }

  await scriviLicenze(carte, info);

  const totale = await pesoCartella(USCITA);
  const megabyte = totale / 1024 / 1024;
  const piuPesante = misure.reduce((a, b) => (b.peso > a.peso ? b : a));
  console.log(`scaricati ${scaricati} originali, convertite ${misure.length} immagini`);
  console.log(
    `peso totale ${megabyte.toFixed(2)} MB · piu pesante ${piuPesante.id} con ${(
      piuPesante.peso / 1024
    ).toFixed(0)} kB`,
  );

  const forme = new Set(misure.map((m) => `${m.larghezza}x${m.altezza}`));
  console.log(`forma delle immagini: ${[...forme].join(', ')}`);
  if (forme.size > 1) {
    console.log('ATTENZIONE: non sono tutte della stessa forma');
    process.exitCode = 1;
  }
  if (megabyte > LIMITE_TOTALE_MB) {
    console.log(
      `ATTENZIONE: supera il limite di ${LIMITE_TOTALE_MB} MB, abbassa LARGHEZZA o QUALITA`,
    );
    process.exitCode = 1;
  }
}

if (process.argv.includes('--provino')) {
  await provino();
} else {
  await main();
}
