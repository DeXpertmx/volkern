import { describe, it, expect } from 'vitest';
import {
  ESTADOS_REGISTRO,
  FICHAS_ESTADO,
  estadoAgregado,
  permiteReenvio,
  normalizarEstado,
  camposFaltantes,
  estadoDeViajero,
  resumenDeReserva,
  enmascararDocumento,
  puedeVerDocumentoCompleto,
  viajeroPublico,
} from '../lib/hospitality/compliance';
import {
  crc32,
  empaquetarZip,
  desempaquetarZip,
  empaquetarZipBase64,
  desempaquetarZipBase64,
} from '../lib/hospitality/ses-hospedajes/zip';
import {
  ENDPOINTS,
  ESQUEMA_XML_DISPONIBLE,
  DatosInsuficientesError,
  construirPeticionSes,
  cabeceraBasic,
  empaquetarComunicacion,
  enviarComunicacion,
  probarAlcance,
  urlDeComunicacion,
  type PeticionHttp,
  type TransporteSes,
} from '../lib/hospitality/ses-hospedajes/connector';

const VIAJERO_COMPLETO = {
  nombre: 'María',
  apellido1: 'García',
  tipoDocumento: 'Pasaporte',
  numeroDocumento: 'X1234567',
  fechaNacimiento: new Date('1990-04-12'),
  nacionalidad: 'ES',
  // La dirección es obligatoria desde que el esquema v3.0.0 está implementado:
  // el parte de viajeros la exige por persona.
  direccion: 'Calle Falsa 123',
  codigoPostal: '21710',
};

describe('el registro de viajeros tiene dos comunicaciones y un estado que las resume', () => {
  it('cada estado tiene su ficha legible', () => {
    for (const estado of ESTADOS_REGISTRO) {
      expect(FICHAS_ESTADO[estado].etiqueta.length).toBeGreaterThan(0);
      expect(FICHAS_ESTADO[estado].descripcion.length).toBeGreaterThan(0);
    }
  });

  it('manda la comunicación menos avanzada: el registro no está completo a medias', () => {
    expect(estadoAgregado('completo', 'completo')).toBe('completo');
    expect(estadoAgregado('completo', 'enviado')).toBe('enviado');
    expect(estadoAgregado('enviado', 'pendiente_envio')).toBe('pendiente_envio');
    expect(estadoAgregado('procesando', 'datos_pendientes')).toBe('datos_pendientes');
  });

  it('una interrupción manda sobre cualquier avance, y la anulación sobre el error', () => {
    expect(estadoAgregado('error', 'completo')).toBe('error');
    expect(estadoAgregado('anulado', 'error')).toBe('anulado');
  });

  it('sin comunicaciones no se inventa un estado de éxito', () => {
    expect(estadoAgregado()).toBe('datos_pendientes');
    expect(estadoAgregado('inventado' as never, 'completo')).toBe('completo');
    expect(normalizarEstado(null, 'datos_pendientes')).toBe('datos_pendientes');
    expect(normalizarEstado('error', 'datos_pendientes')).toBe('error');
  });

  it('solo se puede reenviar lo que no está resuelto ni anulado', () => {
    expect(permiteReenvio('error')).toBe(true);
    expect(permiteReenvio('pendiente_envio')).toBe(true);
    expect(permiteReenvio('enviado')).toBe(true);
    expect(permiteReenvio('completo')).toBe(false);
    expect(permiteReenvio('procesando')).toBe(false);
    expect(permiteReenvio('anulado')).toBe(false);
  });
});

describe('lo que le falta a un viajero para poder comunicarse', () => {
  it('un viajero con todos los datos no tiene nada pendiente', () => {
    expect(camposFaltantes(VIAJERO_COMPLETO)).toEqual([]);
    expect(estadoDeViajero(VIAJERO_COMPLETO)).toBe('pendiente_envio');
  });

  it('sin fecha de nacimiento no se puede comunicar', () => {
    const { fechaNacimiento, ...sinFecha } = VIAJERO_COMPLETO;
    expect(camposFaltantes(sinFecha)).toEqual(['fechaNacimiento']);
    expect(estadoDeViajero(sinFecha)).toBe('datos_pendientes');
  });

  it('el documento, su soporte y el domicilio son obligatorios', () => {
    const faltantes = camposFaltantes({ nombre: 'María', apellido1: '' });
    expect(faltantes).toEqual([
      'apellido1',
      'fechaNacimiento',
      'tipoDocumento',
      'numeroDocumento',
      'direccion',
      'codigoPostal',
    ]);
  });

  it('DNI/NIF y NIE exigen número de soporte, el pasaporte no', () => {
    expect(camposFaltantes({ ...VIAJERO_COMPLETO, tipoDocumento: 'DNI' })).toEqual(['soporteDocumento']);
    expect(camposFaltantes({ ...VIAJERO_COMPLETO, tipoDocumento: 'DNI', soporteDocumento: '1234' })).toEqual([]);
    expect(camposFaltantes({ ...VIAJERO_COMPLETO, tipoDocumento: 'NIF', soporteDocumento: '1234' })).toEqual([]);
    expect(camposFaltantes({ ...VIAJERO_COMPLETO, tipoDocumento: 'Pasaporte' })).toEqual([]);
  });

  it('las cadenas de solo espacios cuentan como vacío', () => {
    expect(camposFaltantes({ ...VIAJERO_COMPLETO, nombre: '   ' })).toEqual(['nombre']);
  });
});

describe('el resumen que ve el propietario', () => {
  it('cuenta viajeros, registrados y pendientes', () => {
    const sinFecha = { ...VIAJERO_COMPLETO, fechaNacimiento: null };
    const resumen = resumenDeReserva([VIAJERO_COMPLETO, VIAJERO_COMPLETO, VIAJERO_COMPLETO, sinFecha], null);

    expect(resumen.total).toBe(4);
    expect(resumen.registrados).toBe(3);
    expect(resumen.pendientes).toBe(1);
    expect(resumen.etiqueta).toBe('4 viajeros · 3 registrados · 1 pendiente');
    expect(resumen.listoParaEnviar).toBe(false);
  });

  it('con todos los datos y sin enviar, está listo para enviar', () => {
    const resumen = resumenDeReserva([VIAJERO_COMPLETO], { estadoViajeros: 'pendiente_envio' });
    expect(resumen.etiqueta).toBe('1 viajero · 1 registrado');
    expect(resumen.listoParaEnviar).toBe(true);
  });

  it('lo ya aceptado por el Ministerio no se reenvía', () => {
    const resumen = resumenDeReserva([VIAJERO_COMPLETO], {
      estadoReserva: 'completo',
      estadoViajeros: 'completo',
    });
    expect(resumen.estado).toBe('completo');
    expect(resumen.listoParaEnviar).toBe(false);
  });

  it('sin viajeros no hay nada que enviar', () => {
    const resumen = resumenDeReserva([], null);
    expect(resumen.etiqueta).toBe('0 viajeros · 0 registrados');
    expect(resumen.listoParaEnviar).toBe(false);
  });
});

describe('un documento nunca se enseña completo sin privilegio', () => {
  it('enmascara dejando los tres últimos caracteres', () => {
    expect(enmascararDocumento('12345678Z')).toBe('••••••78Z');
    expect(enmascararDocumento('X1234567')).toBe('•••••567');
    expect(enmascararDocumento('AB')).toBe('••');
    expect(enmascararDocumento('')).toBe('—');
    expect(enmascararDocumento(null)).toBe('—');
  });

  it('solo la administración de la cuenta ve el documento entero', () => {
    expect(puedeVerDocumentoCompleto('Admin')).toBe(true);
    expect(puedeVerDocumentoCompleto('Superadmin')).toBe(true);
    expect(puedeVerDocumentoCompleto('Sales Agent')).toBe(false);
    expect(puedeVerDocumentoCompleto(null)).toBe(false);
  });

  it('el viajero de la API sale enmascarado, y completo solo para quien puede', () => {
    const viajero = { id: 'v1', ...VIAJERO_COMPLETO };

    const comercial = viajeroPublico(viajero, { rol: 'Sales Agent' });
    expect(comercial.numeroDocumento).toBe('•••••567');
    expect(comercial.documentoCompleto).toBe(false);

    const admin = viajeroPublico(viajero, { rol: 'Admin' });
    expect(admin.numeroDocumento).toBe('X1234567');
    expect(admin.documentoCompleto).toBe(true);
  });

  it('el soporte del documento también se enmascara', () => {
    const viajero = { id: 'v1', ...VIAJERO_COMPLETO, tipoDocumento: 'DNI', soporteDocumento: '99887766' };
    expect(viajeroPublico(viajero, { rol: 'Sales Agent' }).soporteDocumento).toBe('•••••766');
    expect(viajeroPublico(viajero).soporteDocumento).toBe('•••••766');
  });
});

describe('el paquete del Ministerio: ZIP y Base64', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><comunicacion><tipo>RH</tipo></comunicacion>';

  it('calcula el CRC-32 que exige el formato', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('empaqueta y despaqueta sin perder nada', () => {
    const paquete = empaquetarZip([{ nombre: 'comunicacion.xml', contenido: xml }]);
    const [archivo] = desempaquetarZip(paquete);

    expect(archivo.nombre).toBe('comunicacion.xml');
    expect(archivo.contenido.toString('utf8')).toBe(xml);
  });

  it('es determinista: el mismo XML da el mismo binario', () => {
    const uno = empaquetarZip([{ nombre: 'comunicacion.xml', contenido: xml }]);
    const otro = empaquetarZip([{ nombre: 'comunicacion.xml', contenido: xml }]);
    expect(uno.equals(otro)).toBe(true);
  });

  it('el Base64 es un ZIP de verdad, ida y vuelta', () => {
    const base64 = empaquetarZipBase64([{ nombre: 'comunicacion.xml', contenido: xml }]);
    expect(Buffer.from(base64, 'base64').subarray(0, 4).toString('hex')).toBe('504b0304');

    const [archivo] = desempaquetarZipBase64(base64);
    expect(archivo.contenido.toString('utf8')).toBe(xml);
  });

  it('admite varias entradas y nombres con acentos', () => {
    const paquete = empaquetarZip([
      { nombre: 'viajeros.xml', contenido: '<v/>' },
      { nombre: 'comunicación.xml', contenido: '<c/>' },
    ]);
    const archivos = desempaquetarZip(paquete);
    expect(archivos.map((a) => a.nombre)).toEqual(['viajeros.xml', 'comunicación.xml']);
    expect(archivos[1].contenido.toString('utf8')).toBe('<c/>');
  });

  it('un paquete vacío es un error de programación, no un envío', () => {
    expect(() => empaquetarZip([])).toThrow(/al menos un archivo/i);
  });
});

describe('el conector del Ministerio', () => {
  it('usa el endpoint de cada entorno y no acepta otro', () => {
    expect(urlDeComunicacion('produccion')).toBe(ENDPOINTS.produccion);
    expect(urlDeComunicacion('pruebas')).toBe(ENDPOINTS.pruebas);
    expect(urlDeComunicacion('otro')).toBe(ENDPOINTS.pruebas);
    expect(urlDeComunicacion(null)).toBe(ENDPOINTS.pruebas);
  });

  it('las credenciales del tenant viajan en la cabecera Basic', () => {
    const cabecera = cabeceraBasic({ usuario: 'entidad-1', password: 'secreta' });
    expect(cabecera).toBe(`Basic ${Buffer.from('entidad-1:secreta', 'utf8').toString('base64')}`);
    expect(cabecera.startsWith('Basic ')).toBe(true);
  });

  it('el esquema del interface v3.0.0 está implementado y declara lo que exige', () => {
    expect(ESQUEMA_XML_DISPONIBLE).toBe(true);
    // Sin código de arrendador no hay comunicación que construir: la cabecera
    // del lote es obligatoria y es la primera pieza que se comprueba.
    expect(() => construirPeticionSes('viajeros', { codigoArrendador: '' })).toThrow(DatosInsuficientesError);
  });

  it('empaqueta el XML en un ZIP en Base64', () => {
    const paquete = empaquetarComunicacion('<comunicacion/>');
    const [archivo] = desempaquetarZipBase64(paquete);
    expect(archivo.nombre).toBe('comunicacion.xml');
    expect(archivo.contenido.toString('utf8')).toBe('<comunicacion/>');
  });

  it('envía la comunicación con autorización y devuelve la respuesta tal cual', async () => {
    let visto: PeticionHttp | null = null;
    const transporteFalso: TransporteSes = async (peticion) => {
      visto = peticion;
      return { ok: true, status: 200, text: async () => 'Comunicacion recibida correctamente' };
    };

    const respuesta = await enviarComunicacion({
      entorno: 'produccion',
      credenciales: { usuario: 'entidad-1', password: 'secreta' },
      peticionSobre: '<soapenv:Envelope/>',
      transporte: transporteFalso,
    });

    expect(respuesta.ok).toBe(true);
    expect(respuesta.status).toBe(200);
    expect(respuesta.cuerpo).toContain('recibida');
    expect(visto!.url).toBe(ENDPOINTS.produccion);
    expect(visto!.headers.Authorization).toBe(cabeceraBasic({ usuario: 'entidad-1', password: 'secreta' }));
    // Lo que viaja ahora es el sobre SOAP, no un ZIP desnudo.
    expect(visto!.body).toBe('<soapenv:Envelope/>');
    // Sin certificado instalado no hay TLS mutuo: solo la cabecera Basic.
    expect(visto!.agente).toBeUndefined();
  });

  it('un rechazo del Ministerio se devuelve, no se lanza: hay que guardarlo', async () => {
    const transporteFalso: TransporteSes = async () => ({
      ok: false,
      status: 401,
      text: async () => 'No autorizado',
    });

    const respuesta = await enviarComunicacion({
      entorno: 'pruebas',
      credenciales: { usuario: 'x', password: 'y' },
      peticionSobre: '<soapenv:Envelope/>',
      transporte: transporteFalso,
    });

    expect(respuesta.ok).toBe(false);
    expect(respuesta.status).toBe(401);
    expect(respuesta.cuerpo).toBe('No autorizado');
  });

  it('distingue «el Ministerio no responde» de «mi comunicación está mal»', async () => {
    const transporteCaido: TransporteSes = async () => {
      throw new Error('getaddrinfo ENOTFOUND hospedajes.ses.mir.es');
    };

    const alcance = await probarAlcance('produccion', { transporte: transporteCaido });
    expect(alcance.alcanzable).toBe(false);
    expect(alcance.entorno).toBe('produccion');
    expect(alcance.error).toMatch(/ENOTFOUND/);
    // La prueba declara además si viajó el certificado de la entidad: sin él, el
    // «no responde» y el «no me identifico» se confunden.
    expect(alcance.certificadoPresentado).toBe(false);

    const transporteVivo: TransporteSes = async () => ({
      ok: false,
      status: 405,
      text: async () => '',
    });
    const vivo = await probarAlcance('produccion', { transporte: transporteVivo });
    expect(vivo.alcanzable).toBe(true);
    expect(vivo.status).toBe(405);
  });
});
