/**
 * Guardias del esquema del interface v3.0.0 de SES.HOSPEDAJES.
 *
 * Los XML de estos tests son lo que el Ministerio espera: la forma la fija el
 * WSDL de la operación `comunicacion` y los XSD de alta, y cualquier desvío es
 * una comunicación rechazada (o peor: aceptada con los datos mal colocados).
 * Cada caso guarda el ejemplo mínimo que demuestra la regla.
 */
import { describe, it, expect } from 'vitest';
import {
  construirXmlReserva,
  construirXmlParte,
  construirXmlAnulacion,
  construirSobreSoap,
  leerRespuestaLote,
  aFechaSes,
  aFechaHoraSes,
  escaparXml,
  construirDireccion,
  NS_ALTA_PARTE,
  NS_ALTA_RESERVA,
  NS_ANULAR,
  NS_COMUNICACION,
  type ComunicacionParte,
  type ComunicacionReserva,
  type PersonaSes,
} from '../lib/hospitality/ses-hospedajes/esquema';
import { desempaquetarZipBase64 } from '../lib/hospitality/ses-hospedajes/zip';

const DIRECCION = {
  direccion: 'Calle Falsa 123',
  nombreMunicipio: 'Matalascañas',
  codigoPostal: '21710',
  pais: 'ESP',
};

const PERSONA: PersonaSes = {
  rol: 'VI',
  nombre: 'María',
  apellido1: 'García Herrera',
  tipoDocumento: 'NIF',
  numeroDocumento: '58219929Y',
  soporteDocumento: '123',
  fechaNacimiento: '1980-01-01',
  nacionalidad: 'ESP',
  direccion: DIRECCION,
  telefono: '949857857',
};

describe('el XML del parte de viajeros (altaParteHospedaje)', () => {
  const solicitud: ComunicacionParte = {
    codigoEstablecimiento: '0000000107',
    comunicaciones: [
      {
        contrato: {
          referencia: 'V-1045',
          fechaContrato: '2026-09-10',
          fechaEntrada: '2026-09-14T15:00:00',
          fechaSalida: '2026-09-18T12:00:00',
          numPersonas: 2,
          pago: { tipoPago: 'TARJT' },
        },
        personas: [PERSONA, { ...PERSONA, rol: 'TI' }],
      },
    ],
  };

  it('lleva el namespace oficial del alta y el código de establecimiento a nivel de solicitud', () => {
    const xml = construirXmlParte(solicitud);

    expect(xml).toContain(`xmlns="${NS_ALTA_PARTE}"`);
    expect(xml).toContain('<codigoEstablecimiento>0000000107</codigoEstablecimiento>');
    // El XSD del parte NO define establecimiento por comunicación: eso es de la RH.
    expect(xml).not.toContain('<establecimiento>');
  });

  it('cada persona lleva rol, documento y su dirección completa', () => {
    const xml = construirXmlParte(solicitud);

    expect(xml).toContain('<rol>VI</rol>');
    expect(xml).toContain('<rol>TI</rol>');
    expect(xml).toContain('<tipoDocumento>NIF</tipoDocumento>');
    expect(xml).toContain('<numeroDocumento>58219929Y</numeroDocumento>');
    expect(xml).toContain('<soporteDocumento>123</soporteDocumento>');
    expect(xml).toContain('<codigoPostal>21710</codigoPostal>');
    expect(xml).toContain('<pais>ESP</pais>');
  });

  it('el contrato viaja con fechas, número de personas y pago', () => {
    const xml = construirXmlParte(solicitud);

    expect(xml).toContain('<referencia>V-1045</referencia>');
    expect(xml).toContain('<fechaContrato>2026-09-10</fechaContrato>');
    expect(xml).toContain('<fechaEntrada>2026-09-14T15:00:00</fechaEntrada>');
    expect(xml).toContain('<fechaSalida>2026-09-18T12:00:00</fechaSalida>');
    expect(xml).toContain('<numPersonas>2</numPersonas>');
    expect(xml).toContain('<tipoPago>TARJT</tipoPago>');
  });

  it('con país España el municipio va por código INE, no por nombre', () => {
    const xml = construirDireccion({
      ...DIRECCION,
      pais: 'ESP',
      codigoMunicipio: '41067',
    });
    expect(xml).toContain('<codigoMunicipio>41067</codigoMunicipio>');
    expect(xml).not.toContain('nombreMunicipio');
  });

  it('con país extranjero el municipio va por nombre, no por código', () => {
    const xml = construirDireccion({
      direccion: 'Rue de la Paix 1',
      nombreMunicipio: 'Paris',
      codigoPostal: '75002',
      pais: 'FRA',
    });
    expect(xml).toContain('<nombreMunicipio>Paris</nombreMunicipio>');
    expect(xml).not.toContain('codigoMunicipio');
  });

  it('escapa los caracteres que romperían el XML (un apellido con & no rechaza el parte)', () => {
    const xml = construirXmlParte({
      codigoEstablecimiento: '1',
      comunicaciones: [
        {
          contrato: solicitud.comunicaciones[0].contrato,
          personas: [{ ...PERSONA, apellido1: "O'Brien & Sons <Jr>" }],
        },
      ],
    });
    expect(xml).toContain("O'Brien &amp; Sons &lt;Jr&gt;");
  });
});

describe('el XML de la reserva de hospedaje (altaReservaHospedaje)', () => {
  const comunicacion: ComunicacionReserva = {
    establecimiento: { codigo: '0000000107' },
    contrato: {
      referencia: 'V-1045',
      fechaContrato: '2026-09-10',
      fechaEntrada: '2026-09-14T15:00:00',
      fechaSalida: '2026-09-18T12:00:00',
      numPersonas: 1,
      pago: { tipoPago: 'EFECT' },
    },
    personas: [{ ...PERSONA, direccion: undefined }],
  };

  it('lleva el namespace de la RH y el establecimiento por comunicación', () => {
    const xml = construirXmlReserva(comunicacion);

    expect(xml).toContain(`xmlns="${NS_ALTA_RESERVA}"`);
    expect(xml).toContain('<establecimiento><codigo>0000000107</codigo></establecimiento>');
  });

  it('acepta el establecimiento por datos cuando no hay código, tal como permite el XSD', () => {
    const xml = construirXmlReserva({
      ...comunicacion,
      establecimiento: {
        codigo: null,
        datosEstablecimiento: {
          tipo: 'VIVIENDA',
          nombre: 'Villa Mar Azul',
          direccion: DIRECCION,
        },
      },
    });

    expect(xml).toContain('<datosEstablecimiento>');
    expect(xml).toContain('<nombre>Villa Mar Azul</nombre>');
    expect(xml).not.toContain('<codigo>0000000107</codigo>');
  });

  it('la persona de la RESERVA no lleva dirección: es lo que distingue a la RH del parte', () => {
    const xml = construirXmlReserva(comunicacion);
    expect(xml).toContain('<rol>VI</rol>');
    expect(xml).not.toContain('<direccion>');
  });
});

describe('el XML de anulación (anularComunicacion)', () => {
  it('lleva los códigos de comunicación que devolvió el Ministerio', () => {
    const xml = construirXmlAnulacion(['ABC123', 'DEF456']);

    expect(xml).toContain(`xmlns="${NS_ANULAR}"`);
    expect(xml).toContain('<codigoComunicacion>ABC123</codigoComunicacion>');
    expect(xml).toContain('<codigoComunicacion>DEF456</codigoComunicacion>');
  });

  it('sin códigos no hay XML que valga (la ruta lo valida antes)', () => {
    const xml = construirXmlAnulacion([]);
    expect(xml).not.toContain('<codigoComunicacion>');
  });
});

describe('el sobre SOAP de la operación comunicacion', () => {
  it('es SOAP 1.1 document/literal con la cabecera del lote y la solicitud empaquetada', () => {
    const sobre = construirSobreSoap(
      { codigoArrendador: '0000000141', aplicacion: 'Volkern Hospitality', tipoOperacion: 'A', tipoComunicacion: 'PV' },
      'UEsDBBQAAAAIAK'
    );

    expect(sobre).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
    expect(sobre).toContain(`xmlns:com="${NS_COMUNICACION}"`);
    expect(sobre).toContain('<com:comunicacionRequest>');
    expect(sobre).toContain('<codigoArrendador>0000000141</codigoArrendador>');
    expect(sobre).toContain('<aplicacion>Volkern Hospitality</aplicacion>');
    expect(sobre).toContain('<tipoOperacion>A</tipoOperacion>');
    expect(sobre).toContain('<tipoComunicacion>PV</tipoComunicacion>');
    expect(sobre).toContain('<solicitud>UEsDBBQAAAAIAK</solicitud>');
  });

  it('la anulación va con tipoOperacion B y su etiqueta RH', () => {
    const sobre = construirSobreSoap(
      { codigoArrendador: '1', aplicacion: 'x', tipoOperacion: 'B', tipoComunicacion: 'RH' },
      'paquete'
    );
    expect(sobre).toContain('<tipoOperacion>B</tipoOperacion>');
    expect(sobre).toContain('<tipoComunicacion>RH</tipoComunicacion>');
  });

  it('recorta la cabecera a los límites del XSD (código de 10, aplicación de 50)', () => {
    const sobre = construirSobreSoap(
      {
        codigoArrendador: '0123456789EXTRA',
        aplicacion: 'x'.repeat(80),
        tipoOperacion: 'A',
        tipoComunicacion: 'PV',
      },
      'p'
    );
    expect(sobre).toContain('<codigoArrendador>0123456789</codigoArrendador>');
    expect(sobre).toContain(`<aplicacion>${'x'.repeat(50)}</aplicacion>`);
  });
});

describe('el empaquetado que define el contrato', () => {
  it('las fechas van en formato fecha/hora sin zona (lo que el XSD llama date y dateTime)', () => {
    expect(aFechaSes('2026-09-14T15:00:00Z')).toBe('2026-09-14');
    expect(aFechaHoraSes('2026-09-14T15:00:00Z')).toBe('2026-09-14T15:00:00');
  });

  it('el escapado no corrompe acentos ni entidades ya presentes', () => {
    expect(escaparXml('García Herrera')).toBe('García Herrera');
    expect(escaparXml('AT&T')).toBe('AT&amp;T');
  });
});

describe('la lectura de la respuesta del Ministerio (comunicacionResponse)', () => {
  const respuestaOk = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${NS_COMUNICACION}">
  <soapenv:Body>
    <com:comunicacionResponse>
      <respuesta>
        <codigo>0</codigo>
        <descripcion>Lote procesado</descripcion>
        <lote>LOTE-2026-0001</lote>
      </respuesta>
      <resultado>
        <lote>LOTE-2026-0001</lote>
        <tipoComunicacion>PV</tipoComunicacion>
        <tipoOperacion>A</tipoOperacion>
        <codigoEstado>0</codigoEstado>
        <descEstado>Procesado</descEstado>
        <resultadoComunicaciones>
          <resutadoComunicacion>
            <orden>1</orden>
            <codigoComunicacion>8ec2e8b0-1234-4def-9876-abcdef012345</codigoComunicacion>
          </resutadoComunicacion>
        </resultadoComunicaciones>
      </resultado>
    </com:comunicacionResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuestaConError = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${NS_COMUNICACION}">
  <soapenv:Body>
    <com:comunicacionResponse>
      <respuesta>
        <codigo>0</codigo>
        <descripcion>Lote procesado</descripcion>
        <lote>LOTE-2026-0002</lote>
      </respuesta>
      <resultado>
        <codigoEstado>0</codigoEstado>
        <descEstado>Procesado</descEstado>
        <resultadoComunicaciones>
          <resutadoComunicacion>
            <orden>1</orden>
            <tipoError>1001</tipoError>
            <error>Fecha de salida anterior a la de entrada</error>
          </resutadoComunicacion>
        </resultadoComunicaciones>
      </resultado>
    </com:comunicacionResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

  it('lee el estado del lote y el código de comunicación asignado', async () => {
    const leida = await leerRespuestaLote(respuestaOk);

    expect(leida.ok).toBe(true);
    expect(leida.codigo).toBe(0);
    expect(leida.lote).toBe('LOTE-2026-0001');
    expect(leida.resultados).toHaveLength(1);
    expect(leida.resultados[0].codigoComunicacion).toBe('8ec2e8b0-1234-4def-9876-abcdef012345');
    expect(leida.resultados[0].tipoError).toBeNull();
  });

  it('un error por comunicación marca el lote como no aceptado y trae la causa', async () => {
    const leida = await leerRespuestaLote(respuestaConError);

    expect(leida.ok).toBe(false);
    expect(leida.resultados[0].tipoError).toBe('1001');
    expect(leida.resultados[0].error).toContain('Fecha de salida');
  });

  it('un lote rechazado antes de las comunicaciones trae su descEstado como diagnóstico', async () => {
    const rechazo = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="${NS_COMUNICACION}">
  <soapenv:Body>
    <com:comunicacionResponse>
      <respuesta>
        <codigo>3</codigo>
        <descripcion>Usuario no autorizado</descripcion>
        <lote></lote>
      </respuesta>
    </com:comunicacionResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    const leida = await leerRespuestaLote(rechazo);
    expect(leida.ok).toBe(false);
    expect(leida.codigo).toBe(3);
    expect(leida.descripcion).toContain('no autorizado');
    expect(leida.resultados).toEqual([]);
  });

  it('acepta la grafía corregida del nodo si el Ministerio arregla su errata', async () => {
    const corregida = respuestaOk.replace(/resutadoComunicacion/g, 'resultadoComunicacion');
    const leida = await leerRespuestaLote(corregida);
    expect(leida.resultados[0].codigoComunicacion).toBe('8ec2e8b0-1234-4def-9876-abcdef012345');
  });

  it('un HTML de error de la pasarela NO es una respuesta: se lanza y no se registra como enviada', async () => {
    await expect(leerRespuestaLote('<html><body>error code: 502</body></html>')).rejects.toThrow(
      /no es un resultado de comunicación válido/i
    );
  });
});
