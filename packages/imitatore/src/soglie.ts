/**
 * Quando fidarsi di una differenza fra l'umano e il bot di serie.
 *
 * Le partite sono poche e contengono anche gli errori: imparare rumore
 * e' peggio di non imparare. Queste soglie stanno alte di proposito.
 */

/**
 * Sotto questo numero di casi il gruppo e' aneddotica: una serata,
 * non un'abitudine. Otto e' gia' il minimo che si possa guardare
 * con decine di smazzate; scendere sotto significa inseguire il caso.
 */
export const MINIMO_CASI = 8;

/**
 * Quanto deve scostarsi la quota dell'azione dell'umano da quella
 * del bot. Un quarto: e' la differenza che si vede a occhio
 * (75% contro 50%), sotto e' rumore di campionamento.
 */
export const SOGLIA_DELTA = 0.25;

/**
 * L'umano deve fare QUELLA azione almeno cosi' spesso. Se nel
 * gruppo prende la meta' delle volte e lascia l'altra meta',
 * non c'e' una correzione: e' incoerente, e le regole restano.
 */
export const SOGLIA_COERENZA = 0.65;
