import { describe, expect, it } from 'vitest';
import {
  colaIdDesdeReferencia,
  extraerReferenciaDeTexto,
  referenciaPropiedad,
  textoWhatsappPropiedad,
} from '@/lib/real-estate/referencia';

describe('referenciaPropiedad', () => {
  it('usa el SKU del catálogo cuando existe', () => {
    expect(referenciaPropiedad({ id: 'cmtlytty10000s1uuafjc2ril', sku: 'CASA-12' })).toBe('CASA-12');
  });

  it('respeta el campo referencia declarado en los datos del inmueble', () => {
    expect(referenciaPropiedad({ id: 'abc123456', customFieldValues: { referencia: 'POL-09' } })).toBe('POL-09');
    expect(referenciaPropiedad({ id: 'abc123456', metadata: { referencia: '  POL-10  ' } })).toBe('POL-10');
  });

  it('deriva un código estable del id cuando no hay referencia declarada', () => {
    expect(referenciaPropiedad({ id: 'cmtlytty10000s1uuafjc2ril', sku: null })).toBe('REF-JC2RIL');
    expect(referenciaPropiedad({ id: 'cmtlytty10000s1uuafjc2ril' })).toBe('REF-JC2RIL');
  });
});

describe('textoWhatsappPropiedad', () => {
  it('adjunta la referencia al mensaje precargado', () => {
    expect(textoWhatsappPropiedad('Casa Polanco', 'REF-JC2RIL')).toBe(
      'Hola, me interesa Casa Polanco (Ref: REF-JC2RIL). ¿Sigue disponible?',
    );
  });

  it('no inventa una referencia vacía', () => {
    expect(textoWhatsappPropiedad('Casa Polanco', '')).toBe(
      'Hola, me interesa Casa Polanco. ¿Sigue disponible?',
    );
  });
});

describe('extraerReferenciaDeTexto', () => {
  it('lee la referencia del mensaje que escribe el visitante', () => {
    expect(
      extraerReferenciaDeTexto('Hola, me interesa Casa Polanco (Ref: REF-JC2RIL). ¿Sigue disponible?'),
    ).toBe('REF-JC2RIL');
    expect(extraerReferenciaDeTexto('Hola, referencia: CASA-12, ¿sigue?')).toBe('CASA-12');
    expect(extraerReferenciaDeTexto('me interesa REF-000123')).toBe('REF-000123');
  });

  it('no confunde un mensaje normal con una referencia', () => {
    expect(
      extraerReferenciaDeTexto('Hola, vi su web y quiero información sobre las propiedades disponibles.'),
    ).toBeNull();
  });
});

describe('colaIdDesdeReferencia', () => {
  it('extrae la cola del id de una referencia derivada', () => {
    expect(colaIdDesdeReferencia('REF-JC2RIL')).toBe('JC2RIL');
  });

  it('no trata un SKU como referencia derivada', () => {
    expect(colaIdDesdeReferencia('CASA-12')).toBeNull();
    expect(colaIdDesdeReferencia('REF-1')).toBeNull();
  });
});
