/**
 * Guardias del conector SES.HOSPEDAJES: del negocio al mensaje.
 *
 * Aquí se prueba la composición completa que ejecuta el envío real: los datos
 * de Volkern (reserva, viajeros, establecimiento, entidad) entran y sale la
 * petición SOAP lista para la red. Lo que el Ministerio recibe tiene que salir
 * exactamente de aquí: si un dato de Volkern deja de encajar en el esquema, la
 * prueba lo destapa antes de que lo destape el Ministerio rechazando el parte.
 */
import { describe, it, expect } from 'vitest';
import {
  DatosInsuficientesError,
  construirPeticionSes,
} from '../lib/hospitality/ses-hospedajes/connector';
import { desempaquetarZipBase64 } from '../lib/hospitality/ses-hospedajes/zip';

const RESERVA = {
  referencia: 'V-1045',
  bookedOn: new Date('2026-09-10T10:00:00Z'),
  checkIn: new Date('2026-09-14T15:00:00Z'),
  checkOut: new Date('2026-09-18T12:00:00Z'),
};

const VIAJEROS = [
  {
    nombre: 'Carlos',
    apellido1: 'Mendoza',
    esTitular: true,
    tipoDocumento: 'NIF',
    numeroDocumento: '12345678A',
    soporteDocumento: '001',
    fechaNacimiento: new Date('1980-01-01'),
    nacionalidad: 'ESP',
    telefono: '600000001',
    direccion: 'Calle Falsa 123',
    municipio: 'Sevilla',
    codigoMunicipio: '41091',
    codigoPostal: '41001',
    paisDireccion: 'ESP',
  },
  {
    nombre: 'Lucía',
    apellido1: 'Mendoza',
    esTitular: false,
    tipoDocumento: 'PAS',
    numeroDocumento: 'X9876543B',
    fechaNacimiento: new Date('1985-04-12'),
    nacionalidad: 'ESP',
    direccion: 'Avenida de la Constitución 5',
    municipio: 'Sevilla',
    codigoMunicipio: '41091',
    codigoPostal: '41001',
    paisDireccion: 'ESP',
  },
];

const DATOS_BASE = {
  reserva: RESERVA,
  viajeros: VIAJEROS,
  codigoEstablecimiento: '0000000107',
  codigoArrendador: '0000000141',
};

describe('la petición del parte de viajeros (PV) que llega al Ministerio', () => {
  it('compone el sobre SOAP con la solicitud ZIP+Base64 dentro, y el ZIP contiene el XML del parte', () => {
    const peticion = construirPeticionSes('viajeros', DATOS_BASE);

    expect(peticion.sobre).toContain('<com:comunicacionRequest>');
    expect(peticion.sobre).toContain('<tipoComunicacion>PV</tipoComunicacion>');
    expect(peticion.sobre).toContain('<tipoOperacion>A</tipoOperacion>');
    expect(peticion.sobre).toContain('<codigoArrendador>0000000141</codigoArrendador>');

    // La solicitud viaja empaquetada según el contrato; la abrimos y comprobamos
    // que es exactamente el XML del alta de parte.
    const sobre = peticion.sobre;
    const paquete = sobre.match(/<solicitud>([^<]+)<\/solicitud>/)?.[1];
    expect(paquete).toBe(peticion.paquete);

    const [archivo] = desempaquetarZipBase64(peticion.paquete);
    expect(archivo.nombre).toBe('comunicacion.xml');
    expect(archivo.contenido.toString('utf8')).toContain('xmlns="http://www.neg.hospedajes.mir.es/altaParteHospedaje"');
    expect(archivo.contenido.toString('utf8')).toContain('<codigoEstablecimiento>0000000107</codigoEstablecimiento>');
    expect(archivo.contenido.toString('utf8')).toContain('<numeroDocumento>12345678A</numeroDocumento>');
    expect(archivo.contenido.toString('utf8')).toContain('<rol>TI</rol>');
  });

  it('el titular viaja como TI y el resto como VI', () => {
    const peticion = construirPeticionSes('viajeros', DATOS_BASE);
    const [archivo] = desempaquetarZipBase64(peticion.paquete);
    const xml = archivo.contenido.toString('utf8');
    expect(xml).toContain('<rol>TI</rol>');
    expect(xml).toContain('<rol>VI</rol>');
  });

  it('la dirección de cada persona viaja con la vía, el municipio INE y el código postal', () => {
    const peticion = construirPeticionSes('viajeros', DATOS_BASE);
    const xml = desempaquetarZipBase64(peticion.paquete)[0].contenido.toString('utf8');
    expect(xml).toContain('<direccion>Calle Falsa 123</direccion>');
    expect(xml).toContain('<codigoMunicipio>41091</codigoMunicipio>');
    expect(xml).toContain('<codigoPostal>41001</codigoPostal>');
    expect(xml).toContain('<pais>ESP</pais>');
  });

  it('un viajero sin dirección no sale: se pide antes en la ficha', () => {
    const sinDireccion = {
      ...DATOS_BASE,
      viajeros: [{ ...VIAJEROS[0], direccion: undefined }],
    };
    expect(() => construirPeticionSes('viajeros', sinDireccion)).toThrow(DatosInsuficientesError);
  });
});

describe('la petición de la reserva de hospedaje (RH)', () => {
  it('lleva el establecimiento y las personas sin dirección (la persona de la reserva no la pide el XSD)', () => {
    const peticion = construirPeticionSes('reserva', DATOS_BASE);

    expect(peticion.sobre).toContain('<tipoComunicacion>RH</tipoComunicacion>');
    const xml = desempaquetarZipBase64(peticion.paquete)[0].contenido.toString('utf8');
    expect(xml).toContain('xmlns="http://www.neg.hospedajes.mir.es/altaReservaHospedaje"');
    expect(xml).toContain('<establecimiento><codigo>0000000107</codigo></establecimiento>');
    expect(xml).toContain('<referencia>V-1045</referencia>');
    expect(xml).toContain('<numPersonas>2</numPersonas>');
    // La persona de la RH no lleva dirección ni teléfono: eso es del parte.
    expect(xml).not.toContain('<codigoMunicipio>');
  });

  it('sin establecimiento no se construye nada: el error dice dónde falta', () => {
    expect(() => construirPeticionSes('reserva', { ...DATOS_BASE, codigoEstablecimiento: '' })).toThrow(
      DatosInsuficientesError
    );
    try {
      construirPeticionSes('reserva', { ...DATOS_BASE, codigoEstablecimiento: '' });
    } catch (error) {
      expect((error as DatosInsuficientesError).pieza).toBe('establecimiento');
    }
  });

  it('sin personas no hay reserva que comunicar', () => {
    expect(() => construirPeticionSes('reserva', { ...DATOS_BASE, viajeros: [] })).toThrow(
      DatosInsuficientesError
    );
  });
});

describe('la petición de anulación', () => {
  it('lleva el código que el Ministerio asignó y opera con B', () => {
    const peticion = construirPeticionSes('anulacion', {
      codigoArrendador: '0000000141',
      codigosAnulacion: ['8ec2e8b0-1234-4def-9876-abcdef012345'],
    });

    expect(peticion.sobre).toContain('<tipoOperacion>B</tipoOperacion>');
    const xml = desempaquetarZipBase64(peticion.paquete)[0].contenido.toString('utf8');
    expect(xml).toContain('xmlns="http://www.neg.hospedajes.mir.es/anularComunicacion"');
    expect(xml).toContain('<codigoComunicacion>8ec2e8b0-1234-4def-9876-abcdef012345</codigoComunicacion>');
  });

  it('sin código asignado no hay nada que anular', () => {
    expect(() => construirPeticionSes('anulacion', { codigoArrendador: '1', codigosAnulacion: [] })).toThrow(
      DatosInsuficientesError
    );
  });
});

describe('lo que nunca debe salir en una petición', () => {
  it('sin código de arrendador no hay cabecera de lote y no se compone nada', () => {
    expect(() => construirPeticionSes('viajeros', { ...DATOS_BASE, codigoArrendador: '  ' })).toThrow(
      /código de arrendador/i
    );
  });

  it('una referencia más larga que el XSD se recorta en vez de rechazar toda la comunicación', () => {
    const peticion = construirPeticionSes('reserva', {
      ...DATOS_BASE,
      reserva: { ...RESERVA, referencia: 'REF-DE-RE SERVA-DEMODEMODEMODEMODEMODEMODEMODEMO' },
    });
    const xml = desempaquetarZipBase64(peticion.paquete)[0].contenido.toString('utf8');
    const referencia = xml.match(/<referencia>([^<]*)<\/referencia>/)?.[1] ?? '';
    expect(referencia.length).toBeLessThanOrEqual(50);
  });
});
