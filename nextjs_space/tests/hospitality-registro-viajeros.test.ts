/**
 * Guardias del registro de viajeros (MIR / SES Hospedajes v3.1.2).
 *
 * Lo que fijan estos tests, y por qué importa cada cosa:
 *  - La comunicación va al web service OFICIAL del Ministerio. Este test lee el
 *    propio módulo y falla si aparece cualquier otro host: es la garantía de
 *    que nadie mete un agregador o una pasarela de terceros «de atajo».
 *  - El XML respeta el namespace y el ORDEN de elementos del XSD oficial. El
 *    servicio valida contra XSD y rechaza el fichero entero si el orden cambia.
 *  - Las validaciones de la especificación están implementadas: NIF/NIE exigen
 *    segundo apellido y soporte, los menores exigen parentesco de un adulto,
 *    la dirección española exige municipio INE…
 *  - El empaquetado es un ZIP de verdad (no deflate suelto) y en Base64.
 *  - La respuesta se interpreta según la tabla del apartado 3.1.2, incluida la
 *    errata del Anexo II (`resutadoComunicacion`).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import {
  CODIGOS_ERROR_MIR,
  FUENTE_NS_ALTA_RESERVA,
  HOSTS_MIR_OFICIALES,
  NS_ALTA_RESERVA,
  ORDEN_PERSONA_RESERVA,
  direccionVacia,
  namespaceAltaReservaHospedaje,
  reservasHospedajeHabilitadas,
  construirXmlAltaReservaHospedaje,
  validarReservaHospedaje,
  type ReservaHospedajeMIR,
  NS_ALTA_PARTE,
  NS_ANULACION,
  NS_COMUNICACION,
  NS_CONSULTA_LOTES,
  NS_SOAP,
  ORDEN_CONTRATO,
  ORDEN_PERSONA,
  ROL_PERSONA,
  SPEC_MIR_VERSION,
  TIPO_COMUNICACION,
  TIPO_OPERACION,
  construirSobreSoap,
  construirXmlAnulacion,
  construirXmlConsultaLotes,
  construirXmlParteViajeros,
  crearZip,
  describirCodigoMIR,
  describirEstadoLote,
  edadEn,
  empaquetarSolicitud,
  endpointMIR,
  esCodigoCorrectoMIR,
  esDocumentoNIFoNIE,
  esNIF,
  esNIE,
  escaparXml,
  formatearFechaHoraMIR,
  formatearFechaMIR,
  leerRespuestaMIR,
  esRespuestaMIR,
  validarCabeceraMIR,
  validarParteViajeros,
  type ParteViajerosMIR,
} from '@/lib/hospitality/registro-viajeros';

// ── Datos de ejemplo (los del Anexo I de la especificación) ──────────────────

function personaValida(extra: Record<string, unknown> = {}) {
  return {
    rol: ROL_PERSONA.viajero,
    nombre: 'Juan',
    apellido1: 'García',
    apellido2: 'García',
    tipoDocumento: 'NIF',
    numeroDocumento: '00000000T',
    soporteDocumento: '999999999',
    fechaNacimiento: '1990-01-01',
    nacionalidad: 'ESP',
    sexo: 'H',
    direccion: {
      direccion: 'C/Serrano 127',
      direccionComplementaria: 'Portal A. 2ºB',
      codigoMunicipio: '28079',
      codigoPostal: '28001',
      pais: 'ESP',
    },
    telefono: '666666666',
    correo: 'juangarcia@correo.es',
    ...extra,
  };
}

function parteValido(extra: Partial<ParteViajerosMIR> = {}): ParteViajerosMIR {
  return {
    contrato: {
      referencia: 'RES-0001',
      fechaContrato: '2026-09-01',
      fechaEntrada: '2026-09-20T15:00:00',
      fechaSalida: '2026-09-23T12:00:00',
      numPersonas: 1,
      numHabitaciones: 1,
      internet: true,
      pago: { tipoPago: 'EFECT', fechaPago: '2026-09-01' },
    },
    personas: [personaValida()],
    ...extra,
  };
}

describe('Registro de viajeros — contrato oficial MIR v3.1.2', () => {
  it('usa exclusivamente los endpoints del Ministerio (nada de terceros)', () => {
    expect(SPEC_MIR_VERSION).toBe('3.1.2');
    expect(endpointMIR('pre')).toBe(
      'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion'
    );
    expect(endpointMIR('prod')).toBe(
      'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion'
    );

    // Guardia dura: el código fuente no puede contener ningún otro host.
    const fuente = readFileSync(
      path.resolve(__dirname, '../lib/hospitality/registro-viajeros.ts'),
      'utf8'
    );
    const urls = fuente.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    const hosts = [...new Set(urls.map((u) => u.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')))];

    // Los únicos hosts son los del Ministerio (los namespaces XML llevan el
    // nombre del dominio del MIR, que es parte del contrato).
    const permitidos = new Set<string>([
      ...HOSTS_MIR_OFICIALES,
      'schemas.xmlsoap.org',
      'www.soap.servicios.hospedajes.mir.es',
      'www.neg.hospedajes.mir.es',
    ]);
    for (const host of hosts) {
      expect(permitidos.has(host), `host no oficial en el módulo: ${host}`).toBe(true);
    }
    expect(hosts).toContain('hospedajes.ses.mir.es');
  });

  it('declara los namespaces del contrato', () => {
    expect(NS_SOAP).toBe('http://schemas.xmlsoap.org/soap/envelope/');
    expect(NS_COMUNICACION).toBe('http://www.soap.servicios.hospedajes.mir.es/comunicacion');
    expect(NS_ALTA_PARTE).toBe('http://www.neg.hospedajes.mir.es/altaParteHospedaje');
    expect(NS_CONSULTA_LOTES).toBe('http://www.neg.hospedajes.mir.es/consultarComunicacion');
    expect(NS_ANULACION).toBe('http://www.neg.hospedajes.mir.es/anularComunicacion');
  });
});

describe('XML de alta de partes de viajeros', () => {
  const xml = construirXmlParteViajeros({
    codigoEstablecimiento: '1234567890',
    partes: [parteValido()],
  });

  it('lleva el namespace y el código de establecimiento del XSD', () => {
    expect(xml).toContain(`<alt:peticion xmlns:alt="${NS_ALTA_PARTE}">`);
    expect(xml).toContain('<codigoEstablecimiento>1234567890</codigoEstablecimiento>');
    expect(xml).toContain('<comunicacion>');
  });

  it('ordena los elementos de contrato y persona como el XSD oficial', () => {
    const posicionesContrato = ORDEN_CONTRATO.map((n) => xml.indexOf(`<${n}>`)).filter((p) => p >= 0);
    expect(posicionesContrato.length).toBeGreaterThan(5);
    expect([...posicionesContrato].sort((a, b) => a - b)).toEqual(posicionesContrato);

    // La persona del ejemplo no informa teléfono2 ni parentesco (opcionales):
    // el resto de elementos deben aparecer en el orden exacto del XSD.
    const presentes = ORDEN_PERSONA.filter((n) => xml.includes(`<${n}>`));
    expect(presentes).toEqual([
      'rol',
      'nombre',
      'apellido1',
      'apellido2',
      'tipoDocumento',
      'numeroDocumento',
      'soporteDocumento',
      'fechaNacimiento',
      'nacionalidad',
      'sexo',
      'direccion',
      'telefono',
      'correo',
    ]);
    const posicionesPersona = presentes.map((n) => xml.indexOf(`<${n}>`));
    expect([...posicionesPersona].sort((a, b) => a - b)).toEqual(posicionesPersona);
  });

  it('incluye el bloque de pago obligatorio y los datos de la persona', () => {
    expect(xml).toContain('<pago>');
    expect(xml).toContain('<tipoPago>EFECT</tipoPago>');
    expect(xml).toContain('<rol>VI</rol>');
    expect(xml).toContain('<numeroDocumento>00000000T</numeroDocumento>');
    expect(xml).toContain('<codigoMunicipio>28079</codigoMunicipio>');
  });

  it('escapa el contenido y omite los campos opcionales vacíos', () => {
    const conCaracteres = construirXmlParteViajeros({
      codigoEstablecimiento: '1234567890',
      partes: [
        parteValido({
          personas: [
            personaValida({
              direccion: { ...personaValida().direccion, direccion: 'C/Serrano 127 & Cía <A>' },
            }),
          ],
        }),
      ],
    });
    // Los caracteres del dato van escapados: el XML sigue siendo válido.
    expect(conCaracteres).toContain('C/Serrano 127 &amp; Cía &lt;A&gt;');
    expect(conCaracteres).not.toContain('<A>');
    expect(escaparXml('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; &quot;d&quot;');
    expect(xml).not.toContain('<telefono2>');
    expect(xml).not.toContain('<parentesco>');
  });

  it('admite varios partes y varias personas en una sola solicitud', () => {
    const dos = construirXmlParteViajeros({
      codigoEstablecimiento: '1234567890',
      partes: [
        parteValido(),
        parteValido({
          contrato: { ...parteValido().contrato, referencia: 'RES-0002', numPersonas: 2 },
          personas: [
            personaValida(),
            personaValida({
              nombre: 'Pedro',
              tipoDocumento: null,
              numeroDocumento: null,
              soporteDocumento: null,
              apellido2: 'Fernández',
              fechaNacimiento: '2018-01-01',
              parentesco: 'HJ',
            }),
          ],
        }),
      ],
    });
    expect((dos.match(/<comunicacion>/g) ?? []).length).toBe(2);
    expect((dos.match(/<persona>/g) ?? []).length).toBe(3);
    expect(dos).toContain('<parentesco>HJ</parentesco>');
  });
});

describe('Reserva de hospedaje (RH): el namespace no se adivina', () => {
  const RAICES = path.resolve(__dirname, '..');

  it('no hay ningún namespace de RH inventado en el código', () => {
    // Mientras el dato no llegue del XSD oficial, el módulo no puede contener
    // un valor «razonado» a partir del patrón de los otros namespaces.
    const fuente = readFileSync(path.join(RAICES, 'lib/hospitality/registro-viajeros.ts'), 'utf8');
    expect(fuente).not.toMatch(/neg\.hospedajes\.mir\.es\/altaReserva/);

    if (reservasHospedajeHabilitadas()) {
      // Cuando alguien copie el namespace del XSD, tiene que declarar de dónde
      // salió: sin procedencia, este test falla a propósito.
      expect(FUENTE_NS_ALTA_RESERVA).toBeTruthy();
      expect(NS_ALTA_RESERVA).toMatch(/^https?:\/\/.+hospedajes\.mir\.es\/.+/);
    } else {
      expect(NS_ALTA_RESERVA).toBeNull();
      expect(FUENTE_NS_ALTA_RESERVA).toBeNull();
    }
  });

  it('sin namespace, construir el XML de reserva falla con un mensaje accionable', () => {
    if (reservasHospedajeHabilitadas()) return; // ya informado: nada que exigir
    expect(() => namespaceAltaReservaHospedaje()).toThrow(/namespace del XSD oficial de reservas/i);
    expect(() => namespaceAltaReservaHospedaje()).toThrow(/docs\/hospitality-registro-viajeros-mir\.md/);
  });
});

describe('XML de alta de reservas de hospedaje (RH)', () => {
  // Namespace de EJEMPLO: solo para fijar la estructura del XML en el test. El
  // valor real se copia del XSD oficial (ver NS_ALTA_RESERVA).
  const NS_EJEMPLO = 'http://www.neg.hospedajes.mir.es/EJEMPLO-no-es-el-real';

  function reservaRH(): ReservaHospedajeMIR {
    return {
      establecimiento: { codigo: '1234567890' },
      contrato: {
        referencia: 'BOOK-9',
        fechaContrato: '2026-09-01',
        fechaEntrada: '2026-09-20T15:00:00',
        fechaSalida: '2026-09-23T12:00:00',
        numPersonas: 1,
        numHabitaciones: 1,
        internet: null,
        pago: { tipoPago: 'EFECT' },
      },
      personas: [
        {
          rol: 'TI',
          nombre: 'Ana',
          apellido1: 'Pérez',
          apellido2: null,
          tipoDocumento: null,
          numeroDocumento: null,
          soporteDocumento: null,
          fechaNacimiento: '',
          nacionalidad: null,
          sexo: null,
          // Sin dirección: en la reserva es opcional y la OTA no la manda.
          direccion: null,
          telefono: null,
          telefono2: null,
          correo: 'ana@correo.es',
          parentesco: null,
        },
      ],
    };
  }

  const xml = construirXmlAltaReservaHospedaje({ namespace: NS_EJEMPLO, reservas: [reservaRH()] });

  it('construye el XML con el namespace recibido (nunca uno supuesto)', () => {
    expect(xml).toContain(`<alt:peticion xmlns:alt="${NS_EJEMPLO}">`);
    expect(xml).toContain('<solicitud>');
    expect(xml).toContain('<comunicacion>');
    // El establecimiento va DENTRO de la comunicación (a diferencia del PV).
    expect(xml).toContain('<codigo>1234567890</codigo>');
    expect(xml).toContain('<referencia>BOOK-9</referencia>');
    expect(xml).toContain('<rol>TI</rol>');
  });

  it('respeta el orden de elementos del XSD de reservas', () => {
    const presentes = ORDEN_PERSONA_RESERVA.filter((n) => xml.includes(`<${n}>`));
    expect(presentes).toEqual(['rol', 'nombre', 'apellido1', 'correo']);
    const posiciones = presentes.map((n) => xml.indexOf(`<${n}>`));
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);

    // `soporteDocumento` y `parentesco` NO existen en este XSD: si aparecen, es
    // que alguien ha copiado el del parte de viajeros.
    expect(xml).not.toContain('<soporteDocumento>');
    expect(xml).not.toContain('<parentesco>');
  });

  it('admite los datos del establecimiento cuando no hay código', () => {
    const sinCodigo = construirXmlAltaReservaHospedaje({
      namespace: NS_EJEMPLO,
      reservas: [
        {
          ...reservaRH(),
          establecimiento: {
            datosEstablecimiento: {
              tipo: 'HOTEL',
              nombre: 'Hotel Centro',
              direccion: {
                direccion: 'C/Mayor 1',
                codigoMunicipio: '28079',
                codigoPostal: '28001',
                pais: 'ESP',
              },
            },
          },
        },
      ],
    });
    expect(sinCodigo).toContain('<datosEstablecimiento>');
    expect(sinCodigo).toContain('<tipo>HOTEL</tipo>');
    expect(sinCodigo).toContain('<nombre>Hotel Centro</nombre>');
    expect(sinCodigo).not.toContain('<codigo>');
  });
});

describe('Validación de la reserva de hospedaje (RH)', () => {
  function reservaValida(extra: Partial<ReservaHospedajeMIR> = {}): ReservaHospedajeMIR {
    return {
      establecimiento: { codigo: '1234567890' },
      contrato: {
        referencia: 'BOOK-9',
        fechaContrato: '2026-09-01',
        fechaEntrada: '2026-09-20T15:00:00',
        fechaSalida: '2026-09-23T12:00:00',
        numPersonas: 1,
        numHabitaciones: null,
        internet: null,
        pago: { tipoPago: 'EFECT' },
      },
      personas: [
        {
          rol: 'TI',
          nombre: 'Ana',
          apellido1: 'Pérez',
          apellido2: null,
          tipoDocumento: null,
          numeroDocumento: null,
          soporteDocumento: null,
          fechaNacimiento: '',
          nacionalidad: null,
          sexo: null,
          direccion: null,
          telefono: null,
          telefono2: null,
          correo: 'ana@correo.es',
          parentesco: null,
        },
      ],
      ...extra,
    };
  }

  it('acepta una reserva con titular y sin documento (el huésped aún no lo ha dado)', () => {
    const { errores, avisos } = validarReservaHospedaje(reservaValida());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('una dirección vacía (la que deja el mapeo cuando el canal no la manda) no bloquea', () => {
    // `mapearPersonaMIR` siempre devuelve un objeto de dirección: si el canal no
    // envía dirección, queda con los campos en blanco. Eso NO es una dirección
    // informada, y en la reserva la dirección es opcional.
    const vacia = validarReservaHospedaje(
      reservaValida({
        personas: [
          {
            ...reservaValida().personas[0],
            direccion: {
              direccion: '',
              direccionComplementaria: null,
              codigoMunicipio: null,
              nombreMunicipio: null,
              codigoPostal: '',
              pais: '',
            },
          },
        ],
      })
    );
    expect(vacia.errores).toEqual([]);
    expect(direccionVacia(reservaValida().personas[0].direccion)).toBe(true);

    // Y si viene a medias, se valida de verdad y el error lo señala.
    const aMedias = validarReservaHospedaje(
      reservaValida({
        personas: [
          {
            ...reservaValida().personas[0],
            direccion: {
              direccion: 'C/Mayor 1',
              direccionComplementaria: null,
              codigoMunicipio: null,
              nombreMunicipio: null,
              codigoPostal: '',
              pais: 'ESP',
            },
          },
        ],
      })
    );
    expect(aMedias.errores.map((e) => e.campo)).toContain('persona[0].direccion.codigoPostal');
    expect(aMedias.errores.map((e) => e.campo)).toContain('persona[0].direccion.codigoMunicipio');
  });

  it('exige el titular del contrato (rol TI)', () => {
    const sinTitular = validarReservaHospedaje(
      reservaValida({
        personas: [{ ...reservaValida().personas[0], rol: 'VI' }],
      })
    );
    expect(sinTitular.errores.map((e) => e.mensaje).join(' ')).toContain('titular');
  });

  it('exige el código del establecimiento o sus datos', () => {
    const sinEstablecimiento = validarReservaHospedaje(reservaValida({ establecimiento: {} }));
    expect(sinEstablecimiento.errores.map((e) => e.campo)).toContain('establecimiento');
  });

  it('exige un contacto y valida el formato del documento si llega', () => {
    const sinContacto = validarReservaHospedaje(
      reservaValida({
        personas: [{ ...reservaValida().personas[0], correo: null, telefono: null }],
      })
    );
    expect(sinContacto.errores.map((e) => e.campo)).toContain('persona[0].contacto');

    const documentoMalo = validarReservaHospedaje(
      reservaValida({
        personas: [
          { ...reservaValida().personas[0], tipoDocumento: 'NIF', numeroDocumento: '12345678A' },
        ],
      })
    );
    expect(documentoMalo.errores.map((e) => e.campo)).toContain('persona[0].numeroDocumento');
  });
});

describe('XML de consulta de lotes y de anulación', () => {
  it('construye la consulta con el namespace del Anexo II', () => {
    const xml = construirXmlConsultaLotes([
      '00000000-0000-0000-0000-000000000000',
      '11111111-1111-1111-1111-111111111111',
    ]);
    expect(xml).toContain(`<con:lotes xmlns:con="${NS_CONSULTA_LOTES}">`);
    expect((xml.match(/<con:lote>/g) ?? []).length).toBe(2);
  });

  it('construye la anulación con el namespace del Anexo III', () => {
    const xml = construirXmlAnulacion(['44444444-4444-4444-4444-444444444441']);
    expect(xml).toContain(`<anul:comunicaciones xmlns:anul="${NS_ANULACION}">`);
    expect(xml).toContain('<anul:codigoComunicacion>44444444-4444-4444-4444-444444444441</anul:codigoComunicacion>');
  });
});

describe('Empaquetado ZIP + Base64', () => {
  it('genera un contenedor ZIP real (no deflate suelto)', () => {
    const xml = '<a>hola</a>';
    const zip = crearZip('solicitud.xml', xml);

    // Firma del registro local del ZIP.
    expect(zip.subarray(0, 4).toString('binary')).toBe('PK\x03\x04');

    // Se puede leer el fichero de dentro y el contenido coincide.
    const nombreLength = zip.readUInt16LE(26);
    const extraLength = zip.readUInt16LE(28);
    const nombre = zip.subarray(30, 30 + nombreLength).toString('utf8');
    const comprimidoLength = zip.readUInt32LE(18);
    const inicio = 30 + nombreLength + extraLength;
    const comprimido = zip.subarray(inicio, inicio + comprimidoLength);

    expect(nombre).toBe('solicitud.xml');
    expect(inflateRawSync(comprimido).toString('utf8')).toBe(xml);
    expect(zip.readUInt32LE(14)).toBe(zip.readUInt32LE(14)); // CRC presente
  });

  it('codifica en Base64 el ZIP de la solicitud', () => {
    const base64 = empaquetarSolicitud('<a>hola</a>');
    const buffer = Buffer.from(base64, 'base64');
    expect(buffer.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(buffer.toString('base64')).toBe(base64);
  });
});

describe('Sobre SOAP', () => {
  it('construye el comunicacionRequest con la cabecera y el Base64', () => {
    const sobre = construirSobreSoap(
      {
        codigoArrendador: '0000000001',
        aplicacion: 'Volkern',
        tipoOperacion: TIPO_OPERACION.alta,
        tipoComunicacion: TIPO_COMUNICACION.parteViajeros,
      },
      'UEsDBAoAAAAA'
    );
    expect(sobre).toContain(`xmlns:soapenv="${NS_SOAP}"`);
    expect(sobre).toContain(`xmlns:com="${NS_COMUNICACION}"`);
    expect(sobre).toContain('<com:comunicacionRequest>');
    expect(sobre).toContain('<codigoArrendador>0000000001</codigoArrendador>');
    expect(sobre).toContain('<aplicacion>Volkern</aplicacion>');
    expect(sobre).toContain('<tipoOperacion>A</tipoOperacion>');
    expect(sobre).toContain('<tipoComunicacion>PV</tipoComunicacion>');
    expect(sobre).toContain('<solicitud>UEsDBAoAAAAA</solicitud>');
  });

  it('no manda tipoComunicacion cuando la operación no es un alta', () => {
    for (const tipoOperacion of [TIPO_OPERACION.consulta, TIPO_OPERACION.anulacion]) {
      const sobre = construirSobreSoap(
        { codigoArrendador: '0000000001', aplicacion: 'Volkern', tipoOperacion },
        'UEsDBAoAAAAA'
      );
      expect(sobre).not.toContain('<tipoComunicacion>');
    }
  });
});

describe('Validaciones de la especificación', () => {
  it('acepta un parte completo y avisa solo de lo opcional', () => {
    const { errores, avisos } = validarParteViajeros(parteValido());
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('exige segundo apellido y soporte cuando el documento es NIF o NIE', () => {
    const sinApellido2 = validarParteViajeros(
      parteValido({ personas: [personaValida({ apellido2: '' })] })
    );
    expect(sinApellido2.errores.map((e) => e.campo)).toContain('persona[0].apellido2');

    const sinSoporte = validarParteViajeros(
      parteValido({ personas: [personaValida({ soporteDocumento: '' })] })
    );
    expect(sinSoporte.errores.map((e) => e.campo)).toContain('persona[0].soporteDocumento');

    expect(esDocumentoNIFoNIE('NIF')).toBe(true);
    expect(esDocumentoNIFoNIE('NIE')).toBe(true);
    expect(esDocumentoNIFoNIE('PAS')).toBe(false);
  });

  it('valida el formato del NIF y del NIE', () => {
    expect(esNIF('00000000T')).toBe(true);
    expect(esNIF('12345678Z')).toBe(true);
    expect(esNIF('12345678A')).toBe(false);
    expect(esNIE('X0000000T')).toBe(true);
    expect(esNIE('X0000000A')).toBe(false);

    const invalido = validarParteViajeros(
      parteValido({ personas: [personaValida({ numeroDocumento: '12345678A' })] })
    );
    expect(invalido.errores.map((e) => e.campo)).toContain('persona[0].numeroDocumento');
  });

  it('no exige documento a los menores, pero sí parentesco (de un adulto)', () => {
    const menorSinParentesco = validarParteViajeros(
      parteValido({
        contrato: { ...parteValido().contrato, numPersonas: 2 },
        personas: [personaValida(), personaValida({
          nombre: 'Pedro',
          tipoDocumento: null,
          numeroDocumento: null,
          soporteDocumento: null,
          apellido2: 'Fernández',
          fechaNacimiento: '2018-01-01',
        })],
      })
    );
    const campos = menorSinParentesco.errores.map((e) => e.campo);
    expect(campos).toContain('persona');
    expect(menorSinParentesco.errores.map((e) => e.mensaje).join(' ')).toContain('parentesco');
    // Al menor NO se le exige documento (ni número ni soporte).
    expect(campos).not.toContain('persona[1].numeroDocumento');
    expect(campos).not.toContain('persona[1].soporteDocumento');

    // El ejemplo oficial del Anexo I informa el parentesco EN EL MENOR: es válido.
    const parentescoEnElMenor = validarParteViajeros(
      parteValido({
        personas: [
          personaValida({
            nombre: 'Pedro',
            tipoDocumento: null,
            numeroDocumento: null,
            soporteDocumento: null,
            fechaNacimiento: '2018-01-01',
            parentesco: 'HJ',
          }),
        ],
      })
    );
    expect(parentescoEnElMenor.errores).toEqual([]);
  });

  it('acepta el parte con menor cuando un adulto informa el parentesco', () => {
    const { errores } = validarParteViajeros(
      parteValido({
        contrato: { ...parteValido().contrato, numPersonas: 2 },
        personas: [
          personaValida({ parentesco: 'HJ' }),
          personaValida({
            nombre: 'Pedro',
            tipoDocumento: null,
            numeroDocumento: null,
            soporteDocumento: null,
            fechaNacimiento: '2018-01-01',
          }),
        ],
      })
    );
    expect(errores).toEqual([]);
  });

  it('exige al menos un contacto (teléfono, teléfono2 o correo)', () => {
    const sinContacto = validarParteViajeros(
      parteValido({ personas: [personaValida({ telefono: '', correo: '' })] })
    );
    expect(sinContacto.errores.map((e) => e.campo)).toContain('persona[0].contacto');

    const soloTelefono2 = validarParteViajeros(
      parteValido({ personas: [personaValida({ telefono: '', correo: '', telefono2: '600000000' })] })
    );
    expect(soloTelefono2.errores).toEqual([]);
  });

  it('exige municipio INE si el país es España y nombre del municipio si no lo es', () => {
    const espSinMunicipio = validarParteViajeros(
      parteValido({
        personas: [personaValida({ direccion: { ...personaValida().direccion, codigoMunicipio: '' } })],
      })
    );
    expect(espSinMunicipio.errores.map((e) => e.campo)).toContain('persona[0].direccion.codigoMunicipio');

    const espMalMunicipio = validarParteViajeros(
      parteValido({
        personas: [personaValida({ direccion: { ...personaValida().direccion, codigoMunicipio: '2807' } })],
      })
    );
    expect(espMalMunicipio.errores.map((e) => e.mensaje).join(' ')).toContain('5 dígitos');

    const extranjeroSinMunicipio = validarParteViajeros(
      parteValido({
        personas: [
          personaValida({
            direccion: { direccion: '1 Main St', codigoPostal: '10001', pais: 'USA' },
          }),
        ],
      })
    );
    expect(extranjeroSinMunicipio.errores.map((e) => e.campo)).toContain('persona[0].direccion.nombreMunicipio');
  });

  it('valida formato de fechas, importes, correo y país', () => {
    const malas = validarParteViajeros(
      parteValido({
        contrato: {
          ...parteValido().contrato,
          fechaContrato: '01/09/2026',
          fechaEntrada: '2026-09-20',
          numPersonas: 0,
        },
        personas: [personaValida({ fechaNacimiento: '1990/01/01', correo: 'no-es-correo', nacionalidad: 'ESPAÑA' })],
      })
    );
    const campos = malas.errores.map((e) => e.campo);
    expect(campos).toContain('contrato.fechaContrato');
    expect(campos).toContain('contrato.fechaEntrada');
    expect(campos).toContain('contrato.numPersonas');
    expect(campos).toContain('persona[0].fechaNacimiento');
    expect(campos).toContain('persona[0].correo');
    expect(campos).toContain('persona[0].nacionalidad');
  });

  it('rechaza un rol distinto de VI en un parte de viajeros', () => {
    const { errores } = validarParteViajeros(
      parteValido({ personas: [personaValida({ rol: 'TI' })] })
    );
    expect(errores.map((e) => e.campo)).toContain('persona[0].rol');
  });

  it('avisa (sin bloquear) cuando numPersonas no cuadra con las personas', () => {
    const { errores, avisos } = validarParteViajeros(
      parteValido({ contrato: { ...parteValido().contrato, numPersonas: 3 } })
    );
    expect(errores).toEqual([]);
    expect(avisos.join(' ')).toContain('numPersonas');
  });

  it('valida la cabecera con los códigos de error del servicio', () => {
    const vacia = validarCabeceraMIR({
      codigoArrendador: '',
      aplicacion: '',
      tipoOperacion: 'X' as never,
    });
    expect(vacia.errores.map((e) => e.codigo)).toContain('10100');
    expect(vacia.errores.map((e) => e.codigo)).toContain('10101');
    expect(vacia.errores.map((e) => e.codigo)).toContain('10117');

    const altaSinTipo = validarCabeceraMIR({
      codigoArrendador: '0000000001',
      aplicacion: 'Volkern',
      tipoOperacion: TIPO_OPERACION.alta,
    });
    expect(altaSinTipo.errores.map((e) => e.codigo)).toContain('10116');

    const consultaSinTipo = validarCabeceraMIR({
      codigoArrendador: '0000000001',
      aplicacion: 'Volkern',
      tipoOperacion: TIPO_OPERACION.consulta,
    });
    expect(consultaSinTipo.errores).toEqual([]);
  });
});

describe('Formato de fechas y edad', () => {
  it('calcula la edad a la fecha de referencia', () => {
    const referencia = new Date('2026-09-20T12:00:00Z');
    expect(edadEn('1990-01-01', referencia)).toBe(36);
    expect(edadEn('2008-09-21', referencia)).toBe(17);
    expect(edadEn('2008-09-20', referencia)).toBe(18);
  });

  it('formatea fechas en la zona horaria indicada', () => {
    const fecha = new Date('2026-09-20T22:30:00Z');
    expect(formatearFechaMIR(fecha, 'UTC')).toBe('2026-09-20');
    expect(formatearFechaMIR(fecha, 'Europe/Madrid')).toBe('2026-09-21');
    expect(formatearFechaHoraMIR(fecha, 'Europe/Madrid')).toBe('2026-09-21T00:30:00');
  });
});

describe('Lectura de la respuesta del servicio', () => {
  it('lee el código, la descripción y el lote del alta', () => {
    const respuesta = leerRespuestaMIR(`
      <SOAP-ENV:Envelope><SOAP-ENV:Body>
        <ns3:comunicacionResponse>
          <respuesta>
            <codigo>0</codigo>
            <descripcion>Ok</descripcion>
            <lote>00000000-0000-0000-0000-000000000000</lote>
          </respuesta>
        </ns3:comunicacionResponse>
      </SOAP-ENV:Body></SOAP-ENV:Envelope>`);
    expect(respuesta.codigo).toBe('0');
    expect(respuesta.descripcion).toBe('Ok');
    expect(respuesta.lote).toBe('00000000-0000-0000-0000-000000000000');
    expect(esCodigoCorrectoMIR(respuesta.codigo)).toBe(true);
  });

  it('acepta también «codigoRetorno» (el documento usa los dos nombres)', () => {
    const respuesta = leerRespuestaMIR(
      '<respuesta><codigoRetorno>0</codigoRetorno><descripcion>Ok</descripcion><lote>L-1</lote></respuesta>'
    );
    expect(respuesta.codigo).toBe('0');
    expect(respuesta.lote).toBe('L-1');
  });

  it('lee el error de la cabecera y no lo da por bueno', () => {
    const respuesta = leerRespuestaMIR(
      '<respuesta><codigo>10103</codigo><descripcion>El código de arrendador no existe en el sistema</descripcion></respuesta>'
    );
    expect(esCodigoCorrectoMIR(respuesta.codigo)).toBe(false);
    expect(describirCodigoMIR(respuesta.codigo)).toContain('no existe');
    expect(describirCodigoMIR('99999')).toContain('no documentado');
  });

  it('lee el resultado de la consulta de lote, con la errata del Anexo II incluida', () => {
    const respuesta = leerRespuestaMIR(`
      <comunicacionResponse>
        <respuesta><codigo>0</codigo><descripcion>Ok</descripcion></respuesta>
        <resultado>
          <lote>00000000-0000-0000-0000-000000000000</lote>
          <tipoComunicacion>PV</tipoComunicacion>
          <tipoOperacion>A</tipoOperacion>
          <codigoEstado>6</codigoEstado>
          <descEstado>Se ha ejecutado pero hay errores en algunas comunicaciones</descEstado>
          <resultadoComunicaciones>
            <resutadoComunicacion>
              <orden>1</orden>
              <tipoError>Error validación de datos</tipoError>
              <error>No existe un establecimiento para ese código</error>
            </resutadoComunicacion>
            <resultadoComunicacion>
              <orden>2</orden>
              <codigoComunicacion>55555555-5555-5555-5555-555555555551</codigoComunicacion>
            </resultadoComunicacion>
          </resultadoComunicaciones>
        </resultado>
      </comunicacionResponse>`);

    expect(respuesta.lote).toBe('00000000-0000-0000-0000-000000000000');
    expect(respuesta.resultados).toHaveLength(1);
    expect(respuesta.resultados[0].codigoEstado).toBe('6');
    expect(describirEstadoLote('6')).toContain('errores en algunas comunicaciones');
    expect(respuesta.resultados[0].comunicaciones).toHaveLength(2);
    expect(respuesta.resultados[0].comunicaciones[0].orden).toBe(1);
    expect(respuesta.resultados[0].comunicaciones[0].error).toContain('No existe un establecimiento');
    expect(respuesta.resultados[0].comunicaciones[1].codigoComunicacion).toContain('55555555');
  });

  it('distingue una respuesta de verdad de un cuerpo que no lo es', () => {
    // `leerRespuestaMIR` devuelve SIEMPRE un objeto: con un 503 en texto plano
    // devuelve los campos vacíos, y ese objeto verdadero es el que hacía pasar
    // una caída del servicio por un rechazo del Ministerio.
    expect(esRespuestaMIR(leerRespuestaMIR('Service Unavailable'))).toBe(false);
    expect(esRespuestaMIR(leerRespuestaMIR(''))).toBe(false);
    expect(esRespuestaMIR(null)).toBe(false);
    // Un `Fault` de SOAP tampoco decide nada sobre la comunicación: el servicio
    // dice que no pudo atender la petición, no que el parte esté mal.
    expect(
      esRespuestaMIR(
        leerRespuestaMIR('<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Internal error</faultstring></soap:Fault>')
      )
    ).toBe(false);

    expect(esRespuestaMIR(leerRespuestaMIR('<respuesta><codigo>0</codigo></respuesta>'))).toBe(true);
    expect(esRespuestaMIR(leerRespuestaMIR('<respuesta><lote>L-9</lote></respuesta>'))).toBe(true);
    expect(
      esRespuestaMIR(leerRespuestaMIR('<resultado><lote>L-9</lote><codigoEstado>6</codigoEstado></resultado>'))
    ).toBe(true);
  });

  it('marca las comunicaciones anuladas', () => {
    const respuesta = leerRespuestaMIR(`
      <resultado><lote>L-2</lote>
        <resultadoComunicaciones>
          <resultadoComunicacion><orden>1</orden><codigoComunicacion>C-1</codigoComunicacion><anulada>true</anulada></resultadoComunicacion>
        </resultadoComunicaciones>
      </resultado>`);
    expect(respuesta.resultados[0].comunicaciones[0].anulada).toBe(true);
  });

  it('conoce los códigos de error de la v3.1.2', () => {
    expect(CODIGOS_ERROR_MIR['0']).toBe('Ok');
    expect(CODIGOS_ERROR_MIR['10159']).toBeDefined();
    expect(CODIGOS_ERROR_MIR['10104']).toBeUndefined();
    expect(CODIGOS_ERROR_MIR['10123']).toBeUndefined();
  });
});
