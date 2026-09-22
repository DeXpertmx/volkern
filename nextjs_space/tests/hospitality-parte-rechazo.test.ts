// @vitest-environment node
//
// El diagnóstico del rechazo del parte de viajeros (RD 933/2021).
//
// Lo que fijan estos tests: un rechazo NO se confunde con «faltan datos» (el
// estado no basta), el producto lee el campo que el servicio nombra en vez de
// inventarse un catálogo de mensajes ajenos, y no todos los rechazos son del
// huésped — decirle «revisa los datos» a quien tiene el arrendador mal
// configurado le manda a un formulario donde no hay nada que arreglar.

import { describe, it, expect } from 'vitest';
import {
  ESTADO_ACEPTADO,
  ESTADO_RECHAZADO,
  ESTADO_SIN_ENTREGAR,
  ambitoDeRechazo,
  diagnosticoDeComunicacion,
  falloDeComunicacion,
  parteEnReintento,
  campoDeRutaMIR,
  MAX_INTENTOS_PARTE,
  camposEnTextoDeError,
  codigoExplicaElRechazo,
  parteAbandonado,
  queCorregirElParte,
  rechazoDeComunicacion,
  ESPERA_BASE_REINTENTO_MS,
  ESPERA_REINTENTO_MAXIMA_MS,
  esperaReintentoMs,
  reintentoDisponible,
} from '@/lib/hospitality/parte-rechazo';
import { ESTADO_REGISTRO } from '@/lib/hospitality/registro-viajeros-service';

describe('Ruta de un campo del mensaje MIR al campo del formulario', () => {
  it('lee el campo por la cola de la ruta, no por su prefijo', () => {
    expect(campoDeRutaMIR('persona[0].numeroDocumento')).toBe('numeroDocumento');
    // El prefijo cambia según el mensaje (parte, reserva, establecimiento): lo
    // que identifica el campo es la cola.
    expect(campoDeRutaMIR('comunicacion[0].persona[1].apellido1')).toBe('apellido1');
    expect(campoDeRutaMIR('solicitud.comunicacion.persona.numeroDocumento')).toBe('numeroDocumento');
  });

  it('traduce los campos de la dirección a los del formulario del huésped', () => {
    expect(campoDeRutaMIR('persona[0].direccion.direccion')).toBe('direccion.calle');
    expect(campoDeRutaMIR('persona[0].direccion.codigoPostal')).toBe('direccion.codigoPostal');
    expect(campoDeRutaMIR('persona[0].direccion.pais')).toBe('direccion.pais');
    expect(campoDeRutaMIR('persona[0].direccion.codigoMunicipio')).toBe('direccion.municipio');
  });

  it('el contacto (teléfono o correo) es un solo campo del formulario', () => {
    expect(campoDeRutaMIR('persona[0].telefono')).toBe('contacto');
    expect(campoDeRutaMIR('persona[0].correo')).toBe('contacto');
  });

  it('lo que no es un dato del huésped no se disfraza de campo suyo', () => {
    // El contrato de la estancia no se rellena en el formulario del viajero: si
    // el rechazo apunta ahí, el problema no son los datos del huésped.
    expect(campoDeRutaMIR('contrato.fechaEntrada')).toBeNull();
    // El inmueble también tiene `nombre` y dirección: no son los del huésped.
    expect(campoDeRutaMIR('establecimiento.datosEstablecimiento.nombre')).toBeNull();
    expect(campoDeRutaMIR('establecimiento.datosEstablecimiento.direccion.codigoPostal')).toBeNull();
    expect(campoDeRutaMIR('')).toBeNull();
    expect(campoDeRutaMIR(null)).toBeNull();
  });
});

describe('Campos que nombra un texto de error del servicio', () => {
  it('los saca de la frase, sin catálogo de mensajes', () => {
    const campos = camposEnTextoDeError(
      'El campo persona[0].numeroDocumento no tiene un formato válido'
    );
    expect(campos).toEqual(['numeroDocumento']);
  });

  it('en la prosa solo se leen rutas, no palabras sueltas', () => {
    // «nombre» es una palabra corriente: si se leyera suelta, un rechazo del
    // nombre del establecimiento se convertiría en «corrige el nombre del
    // huésped». La ruta con punto es lo que distingue un campo de una palabra.
    expect(camposEnTextoDeError('Revisa el nombre del establecimiento')).toEqual([]);
  });

  it('recoge varios campos y no repite', () => {
    const campos = camposEnTextoDeError(
      'persona[0].apellido2 y persona[0].soporteDocumento son obligatorios con NIE; ' +
        'revisa también persona[0].soporteDocumento'
    );
    expect(campos).toEqual(['apellido2', 'soporteDocumento']);
  });

  it('un texto sin rutas no inventa ningún campo', () => {
    expect(camposEnTextoDeError('Error no controlado')).toEqual([]);
    expect(camposEnTextoDeError(null)).toEqual([]);
  });
});

describe('Ámbito del rechazo: datos, configuración o envío', () => {
  it('los códigos de validación son datos del huésped', () => {
    expect(ambitoDeRechazo('10130', [])).toBe('datos');
    expect(ambitoDeRechazo('10131', [])).toBe('datos');
    expect(ambitoDeRechazo('10121', [])).toBe('datos');
  });

  it('los códigos del arrendador o del usuario son configuración del hotel', () => {
    expect(ambitoDeRechazo('10103', [])).toBe('configuracion');
    expect(ambitoDeRechazo('10107', [])).toBe('configuracion');
  });

  it('lo demás es el envío, no los datos', () => {
    expect(ambitoDeRechazo('10111', [])).toBe('envio');
    expect(ambitoDeRechazo('10999', [])).toBe('envio');
  });

  it('sin código, decide el texto: si nombra campos son datos, si no es el envío', () => {
    expect(ambitoDeRechazo(null, ['numeroDocumento'])).toBe('datos');
    expect(ambitoDeRechazo(null, [])).toBe('envio');
  });

  it('un `0 - Ok` no explica el rechazo: es el código del alta, no el del error', () => {
    // Cuando el rechazo llega en el resultado del lote, la traza guarda el 0 del
    // alta (que solo dice que se recibió). Clasificar con él mandaba a
    // «reintenta, es el envío» un rechazo que era un documento del huésped.
    expect(codigoExplicaElRechazo('0')).toBe(false);
    expect(codigoExplicaElRechazo(' 0 ')).toBe(false);
    expect(codigoExplicaElRechazo(null)).toBe(false);
    expect(codigoExplicaElRechazo('10130')).toBe(true);
    expect(ambitoDeRechazo('0', ['numeroDocumento'])).toBe('datos');
    expect(ambitoDeRechazo('0', [])).toBe('envio');
  });
});

describe('El rechazo de una comunicación', () => {
  it('solo es rechazo si la comunicación fue rechazada', () => {
    expect(rechazoDeComunicacion(null)).toBeNull();
    expect(
      rechazoDeComunicacion({ estado: ESTADO_REGISTRO.aceptada, descripcion: 'Ok' })
    ).toBeNull();
    expect(
      rechazoDeComunicacion({ estado: ESTADO_REGISTRO.datosIncompletos, descripcion: 'Faltan datos' })
    ).toBeNull();
  });

  it('el estado del rechazo es el mismo que el del servicio (no pueden divergir)', () => {
    expect(ESTADO_RECHAZADO).toBe(ESTADO_REGISTRO.rechazada);
    // «Aceptada» vive aquí por lo mismo: el panel del hotel compara partes
    // aceptados frente a abandonados y no puede importar el módulo del servicio.
    expect(ESTADO_ACEPTADO).toBe(ESTADO_REGISTRO.aceptada);
    // Y «sin entregar» es un estado PROPIO, no un rechazo: si coincidiera con
    // `rechazada`, el hotel leería «el Ministerio rechazó este parte» de un
    // envío que el Ministerio nunca recibió.
    expect(ESTADO_SIN_ENTREGAR).toBe(ESTADO_REGISTRO.error);
    expect(ESTADO_SIN_ENTREGAR).not.toBe(ESTADO_REGISTRO.rechazada);
  });

  it('lleva el motivo del servicio tal cual y su código de retorno', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: 'El campo persona[0].numeroDocumento no tiene un formato válido',
      codigoRetorno: '10130',
      errores: [],
    });

    expect(rechazo).toMatchObject({ codigo: '10130', ambito: 'datos' });
    expect(rechazo!.motivo).toContain('no tiene un formato válido');
    expect(rechazo!.campos).toEqual(['numeroDocumento']);
  });

  it('sin descripción usa la del código: el aviso nunca sale vacío', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: null,
      codigoRetorno: '10103',
      errores: null,
    });

    expect(rechazo!.motivo).toContain('no existe en el sistema');
    expect(rechazo!.ambito).toBe('configuracion');
    expect(rechazo!.campos).toEqual([]);
  });

  it('lee los errores del validador local (lista con campo y mensaje)', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: 'Error de validación',
      codigoRetorno: '10121',
      errores: [
        { campo: 'persona[0].direccion.codigoMunicipio', mensaje: 'El código debe tener 5 dígitos', codigo: '10130' },
        { campo: 'persona[0].fechaNacimiento', mensaje: 'Formato AAAA-MM-DD', codigo: '10130' },
      ],
    });

    expect(rechazo!.campos).toEqual(['direccion.municipio', 'fechaNacimiento']);
    expect(rechazo!.ambito).toBe('datos');
  });

  it('lee el error del resultado del lote (objeto tipoError/error)', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: 'Lote tramitado con errores en algunas comunicaciones',
      codigoRetorno: null,
      errores: {
        tipoError: 'x',
        error: 'persona[0].soporteDocumento no es válido',
      },
    });

    expect(rechazo!.codigo).toBeNull();
    expect(rechazo!.campos).toEqual(['soporteDocumento']);
    // Sin código de retorno, el campo que nombra el servicio decide el ámbito.
    expect(rechazo!.ambito).toBe('datos');
  });

  it('un rechazo del lote no arrastra el `0` del alta como si fuera su código', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: 'Lote tramitado con errores en algunas comunicaciones',
      codigoRetorno: '0',
      errores: {
        tipoError: '1',
        error: 'persona[0].numeroDocumento: el documento no consta como válido en el Ministerio',
      },
    });

    expect(rechazo!.codigo).toBeNull();
    expect(rechazo!.campos).toEqual(['numeroDocumento']);
    expect(rechazo!.ambito).toBe('datos');
  });

  it('un error del servicio que no nombra ningún campo no manda al hotel al formulario', () => {
    const rechazo = rechazoDeComunicacion({
      estado: ESTADO_REGISTRO.rechazada,
      descripcion: 'Error no controlado',
      codigoRetorno: '10999',
      errores: null,
    });

    expect(rechazo!.ambito).toBe('envio');
    expect(rechazo!.campos).toEqual([]);
  });
});

describe('El parte que el barrido ya no reintenta', () => {
  it('solo el rechazado que agotó sus intentos', () => {
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.rechazada, intentos: MAX_INTENTOS_PARTE })).toBe(true);
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.rechazada, intentos: MAX_INTENTOS_PARTE + 3 })).toBe(true);
    // Todavía le quedan intentos: el barrido sigue trabajando.
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.rechazada, intentos: MAX_INTENTOS_PARTE - 1 })).toBe(false);
  });

  it('un parte incompleto NO se abandona: no gasta intentos (no se llama al servicio)', () => {
    // Si lo gastara, un hotel que tarda en conseguir el documento se encontraría
    // el parte abandonado sin que nadie lo hubiera intentado comunicar.
    expect(
      parteAbandonado({ estado: ESTADO_REGISTRO.datosIncompletos, intentos: MAX_INTENTOS_PARTE })
    ).toBe(false);
  });

  it('un parte aceptado no está abandonado: está resuelto', () => {
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.aceptada, intentos: MAX_INTENTOS_PARTE })).toBe(false);
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.enviada, intentos: 1 })).toBe(false);
    expect(parteAbandonado(null)).toBe(false);
    // Sin el dato de intentos no se puede afirmar que se agotaron.
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.rechazada })).toBe(false);
  });
});

describe('El parte que no llegó al Ministerio', () => {
  it('no es un rechazo: el servicio no lo leyó y no se acusa a ningún campo', () => {
    const fallo = falloDeComunicacion({
      estado: ESTADO_SIN_ENTREGAR,
      descripcion: 'No se pudo entregar la comunicación: fetch failed',
    });

    expect(fallo).toMatchObject({
      desenlace: 'sin_entregar',
      codigo: null,
      campos: [],
      ambito: 'envio',
    });
    expect(fallo?.motivo).toContain('fetch failed');
    // Lo contrario: ese estado NO produce un rechazo.
    expect(
      rechazoDeComunicacion({ estado: ESTADO_SIN_ENTREGAR, descripcion: 'fetch failed' })
    ).toBeNull();
  });

  it('sin descripción legible no se inventa el motivo', () => {
    const fallo = falloDeComunicacion({ estado: ESTADO_SIN_ENTREGAR, descripcion: null });

    expect(fallo?.motivo).toMatch(/no respondió/i);
  });

  it('el diagnóstico de una comunicación elige el camino por su estado', () => {
    // Es el punto de entrada de las pantallas: elegir a mano en cada una es como
    // se acaba diciendo «el Ministerio lo rechazó» de un parte que nunca llegó.
    expect(
      diagnosticoDeComunicacion({ estado: ESTADO_SIN_ENTREGAR, descripcion: 'timeout' })
    ).toMatchObject({ desenlace: 'sin_entregar' });
    expect(
      diagnosticoDeComunicacion({
        estado: ESTADO_RECHAZADO,
        descripcion: 'El campo persona[0].correo no es válido',
        codigoRetorno: '10130',
      })
    ).toMatchObject({ codigo: '10130', ambito: 'datos' });
    expect(diagnosticoDeComunicacion(null)).toBeNull();
    expect(diagnosticoDeComunicacion({ estado: ESTADO_ACEPTADO })).toBeNull();
  });

  it('con el servicio caído, el hotel recibe la acción que sirve: reintentar', () => {
    const fallo = falloDeComunicacion({ estado: ESTADO_SIN_ENTREGAR, descripcion: 'timeout' })!;
    const texto = queCorregirElParte(fallo);

    expect(texto).toContain('No es un problema de los datos del huésped');
    expect(texto).toMatch(/Vuelve a enviarla/);
    expect(texto).not.toMatch(/formulario del parte/);
  });
});

describe('Cuándo el barrido se rinde con un parte', () => {
  it('los dos desenlaces fallidos se abandonan con el mismo tope', () => {
    for (const estado of [ESTADO_RECHAZADO, ESTADO_SIN_ENTREGAR]) {
      expect(parteAbandonado({ estado, intentos: MAX_INTENTOS_PARTE })).toBe(true);
      expect(parteAbandonado({ estado, intentos: MAX_INTENTOS_PARTE - 1 })).toBe(false);
    }
  });

  it('un incompleto o un aceptado no se abandonan nunca', () => {
    expect(parteAbandonado({ estado: ESTADO_REGISTRO.datosIncompletos, intentos: 99 })).toBe(false);
    expect(parteAbandonado({ estado: ESTADO_ACEPTADO, intentos: 99 })).toBe(false);
    expect(parteAbandonado(null)).toBe(false);
  });

  it('el reintento en curso es el complemento exacto del abandono', () => {
    expect(parteEnReintento({ estado: ESTADO_SIN_ENTREGAR, intentos: 1 })).toBe(true);
    expect(parteEnReintento({ estado: ESTADO_RECHAZADO, intentos: 1 })).toBe(true);
    expect(parteEnReintento({ estado: ESTADO_SIN_ENTREGAR, intentos: MAX_INTENTOS_PARTE })).toBe(
      false
    );
    expect(parteEnReintento({ estado: ESTADO_ACEPTADO, intentos: 0 })).toBe(false);
  });
});

describe('Qué tiene que hacer el hotel', () => {
  const base = { codigo: null as string | null, motivo: 'motivo', campos: [] as never[] };

  it('con campos: los nombra como el formulario y dice que se reenvía al guardar', () => {
    const texto = queCorregirElParte({
      ...base,
      ambito: 'datos',
      campos: ['numeroDocumento', 'fechaNacimiento'] as never,
    });

    expect(texto).toContain('Número de documento');
    expect(texto).toContain('Fecha de nacimiento');
    expect(texto).toMatch(/vuelve a guardar/);
  });

  it('sin campos pero con datos: manda al formulario a revisarlos', () => {
    const texto = queCorregirElParte({ ...base, ambito: 'datos' });
    expect(texto).toMatch(/revísalos en el formulario del parte/i);
    // Y no promete una lista de campos que no tiene.
    expect(texto).not.toContain('Número de documento');
  });

  it('configuración: dice explícitamente que NO es el huésped', () => {
    const texto = queCorregirElParte({ ...base, ambito: 'configuracion' });
    expect(texto).toContain('No es un problema del huésped');
    expect(texto).toMatch(/configuración del registro de viajeros/);
  });

  it('envío: manda a reintentar, no a tocar los datos del huésped', () => {
    const texto = queCorregirElParte({ ...base, ambito: 'envio' });
    expect(texto).toContain('No es un problema de los datos del huésped');
    expect(texto).toMatch(/Vuelve a enviarla/);
  });
});

describe('backoff del reintento (1h, 2h, 4h…)', () => {
  const HORA = ESPERA_BASE_REINTENTO_MS;

  it('la espera crece con cada intento gastado, con tope en el último peldaño', () => {
    expect(esperaReintentoMs(1)).toBe(1 * HORA);
    expect(esperaReintentoMs(2)).toBe(2 * HORA);
    expect(esperaReintentoMs(3)).toBe(4 * HORA);
    expect(esperaReintentoMs(4)).toBe(8 * HORA);
    // Con el tope de 5 intentos, el quinto reintento ya no ocurriría nunca
    // (estaría abandonado), pero la función no se sale de rango si se pregunta.
    expect(esperaReintentoMs(5)).toBe(ESPERA_REINTENTO_MAXIMA_MS);
    expect(esperaReintentoMs(9)).toBe(ESPERA_REINTENTO_MAXIMA_MS);
  });

  it('disponible solo cuando la espera DEL PELDAÑO que toca ya pasó', () => {
    // Sin intentos: espera la primera hora.
    expect(reintentoDisponible(0, HORA - 1)).toBe(false);
    expect(reintentoDisponible(0, HORA)).toBe(true);
    // Con 1 intento gastado: ahora espera DOS horas desde la edición.
    expect(reintentoDisponible(1, HORA)).toBe(false);
    expect(reintentoDisponible(1, 2 * HORA)).toBe(true);
    // Con 2: cuatro horas.
    expect(reintentoDisponible(2, 2 * HORA)).toBe(false);
    expect(reintentoDisponible(2, 4 * HORA)).toBe(true);
  });

  it('el tope de intentos manda antes que cualquier espera', () => {
    expect(reintentoDisponible(MAX_INTENTOS_PARTE, 0)).toBe(false);
    expect(reintentoDisponible(MAX_INTENTOS_PARTE, 100 * HORA)).toBe(false);
  });

  it('tolera intentos ausentes (nulos) sin inventarse reintentos', () => {
    expect(reintentoDisponible(null, 10 * HORA)).toBe(true);
    expect(reintentoDisponible(null, 0)).toBe(false);
  });

  it('una caída de una mañana ya no recibe el parte cinco veces en cinco horas', () => {
    // Antes: 1h + 1h + 1h + 1h = 4 intentos en 4 horas. Ahora: 1h + 2h + 4h =
    // solo 3 intentos en 7 horas, y el quinto ni siquiera llega a la mañana.
    const totalCuatroIntentos =
      esperaReintentoMs(1) + esperaReintentoMs(2) + esperaReintentoMs(3) + esperaReintentoMs(4);
    expect(totalCuatroIntentos).toBe(15 * HORA);
    expect(esperaReintentoMs(1) + esperaReintentoMs(2)).toBe(3 * HORA);
  });
});
