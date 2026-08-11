# Semi delle carte napoletane

I quattro SVG di questa cartella vengono da Wikimedia Commons. Sono tutti
opera dello stesso autore, che li ha rilasciati in pubblico dominio con il
template `{{PD-self}}`: "I, the copyright holder of this work, release this
work into the public domain. This applies worldwide."

Il pubblico dominio non obbliga a citare la fonte. La citiamo lo stesso,
perche' fra un anno nessuno si ricordera' da dove sono arrivati questi file.

| file | pagina su Commons | autore | licenza |
| --- | --- | --- | --- |
| `denari.svg` | [File:Seme denari carte napoletane.svg](https://commons.wikimedia.org/wiki/File:Seme_denari_carte_napoletane.svg) | [Florixc](https://commons.wikimedia.org/wiki/User:Florixc) | PD-self (pubblico dominio) |
| `coppe.svg` | [File:Seme coppe carte napoletane.svg](https://commons.wikimedia.org/wiki/File:Seme_coppe_carte_napoletane.svg) | [Florixc](https://commons.wikimedia.org/wiki/User:Florixc) | PD-self (pubblico dominio) |
| `spade.svg` | [File:Seme spade carte napoletane.svg](https://commons.wikimedia.org/wiki/File:Seme_spade_carte_napoletane.svg) | [Florixc](https://commons.wikimedia.org/wiki/User:Florixc) | PD-self (pubblico dominio) |
| `bastoni.svg` | [File:Seme bastoni carte napoletane.svg](https://commons.wikimedia.org/wiki/File:Seme_bastoni_carte_napoletane.svg) | [Florixc](https://commons.wikimedia.org/wiki/User:Florixc) | PD-self (pubblico dominio) |

Tutti e quattro sono lavoro proprio dell'autore, caricati il 6 settembre 2009,
descritti come il seme prelevato dalla carta numero 5 di un mazzo napoletano.

## Che cosa abbiamo cambiato

I file originali sono documenti di Inkscape. Il disegno non e' stato toccato,
ma il contorno si':

- via i metadati di Inkscape e RDF, la vista salvata, i commenti e ogni
  elemento o attributo fuori dal namespace SVG: non servono a disegnare
- via gli `id`, dopo aver verificato che nessuno li usasse con `url(#...)`
  o `href="#..."`
- `viewBox` normalizzato a `0 0 100 100` per tutti e quattro, con il disegno
  centrato e scalato senza deformarlo. Gli originali non avevano `viewBox`
  ma solo `width` e `height`, molto diversi fra loro: denari e' quasi
  quadrato, bastoni e spade sono tre volte piu' alti che larghi
- coordinate arrotondate: due decimali per denari, coppe e spade, tre per
  bastoni. La precisione non e' scelta a occhio ma misurata, perche' i
  tracciati di bastoni sono in coordinate relative e l'errore si accumula:
  a due decimali il disegno si allargava di 37 unita' su 666

Il procedimento e' ripetibile: si riscaricano gli originali dagli URL qui
sopra e si rifanno gli stessi passaggi.
