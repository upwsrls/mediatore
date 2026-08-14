import { describe, expect, it } from 'vitest';
import { toccoDellaMano } from './solleva';

describe('toccoDellaMano', () => {
  it('il primo tocco solleva e non gioca', () => {
    expect(toccoDellaMano(null, 'spade-7')).toEqual({ sollevata: 'spade-7', gioca: false });
  });

  it('il secondo tocco sulla stessa carta gioca e azzera', () => {
    expect(toccoDellaMano('spade-7', 'spade-7')).toEqual({ sollevata: null, gioca: true });
  });

  it('un tocco su un altra carta solleva quella e lascia la prima', () => {
    expect(toccoDellaMano('spade-7', 'coppe-asso')).toEqual({
      sollevata: 'coppe-asso',
      gioca: false,
    });
  });
});
