// @vitest-environment node
//
// Guardias de la documentación del huésped para el registro de viajeros.
//
// Lo que fijan estos tests, y por qué importa cada cosa:
//  - **Paridad con el Ministerio**: para un catálogo de fichas (completas, a
//    medias, con documento inválido, con menores, con dirección mal) lo que
//    dice `faltantesParaParte` tiene que coincidir EXACTAMENTE con lo que dice
//    `validarParteViajeros`. Si divergen, el huésped rellena el formulario y el
//    parte sigue sin salir: es el fallo silencioso que este test impide.
//  - **El formato guardado es el del Ministerio** (`PersonaMIR` sin rol), así
//    que nada se pierde al leerlo con `personasDesdeGuestData`.
//  - **Nada se hereda por suposición**: el contacto y la dirección del titular
//    se copian solo al titular/acompañantes que no los traen y solo si el
//    formulario lo pide; documento, nombre y nacimiento nunca.

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_VIAJERO,
  MAX_VIAJEROS_CHECKIN,
  faltantesParaParte,
  fusionarViajerosEnGuestData,
  heredarDatosDelTitular,
  normalizarViajero,
  normalizarViajeros,
  resumenDocumentacion,
  titularPrimero,
  viajerosDeGuestData,
  type ViajeroCheckin,
} from '@/lib/hospitality/guest-checkin';
import { validarParteViajeros, type ParteViajerosMIR } from '@/lib/hospitality/registro-viajeros';

const REFERENCIA = new Date('2026-09-20T15:00:00Z');

/** Contrato válido: así cualquier error del parte es de la persona, no del marco. */
function parteCon(viajeros: ViajeroCheckin[], referencia = REFERENCIA): ParteViajerosMIR {
  return {
    contrato: {
      referencia: 'BOOK-1',
      fechaContrato: '2026-09-01',
      fechaEntrada: referencia.toISOString().slice(0, 19),
      fechaSalida: '2026-09-23T12:00:00',
      numPersonas: Math.max(1, viajeros.length),
      numHabitaciones: 1,
      internet: null,
      pago: { tipoPago: 'EFECT', fechaPago: null },
    },
    personas: viajeros.map((v) => ({ ...v, rol: 'VI' })),
  };
}

function adultoCompleto(extra: Partial<ViajeroCheckin> = {}): ViajeroCheckin {
  return {
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
      direccionComplementaria: null,
      codigoMunicipio: '28079',
      nombreMunicipio: null,
      codigoPostal: '28001',
      pais: 'ESP',
    },
    telefono: '666666666',
    telefono2: null,
    correo: 'juangarcia@correo.es',
    parentesco: null,
    ...extra,
  };
}

describe('Normalización de lo que manda el formulario', () => {
  it('una fila vacía no es un viajero (y se cuenta la descartada)', () => {
    const { viajeros, descartados } = normalizarViajeros([
      { nombre: 'Ana', apellido1: 'Pérez' },
      {},
      { nombre: '   ', apellido1: '' },
    ]);
    expect(viajeros).toHaveLength(1);
    expect(descartados).toBe(2);
  });

  it('acepta los alias del formulario y normaliza códigos a mayúsculas', () => {
    const viajero = normalizarViajero({
      firstName: 'Ana',
      lastName: 'Pérez',
      tipoDocumento: 'nif',
      numeroDocumento: '00000000t',
      nacionalidad: 'esp',
      calle: 'C/Mayor 1',
      cp: '28001',
      country: 'esp',
      municipioCodigo: '28079',
      email: 'ana@correo.es',
    });

    expect(viajero).toMatchObject({
      nombre: 'Ana',
      apellido1: 'Pérez',
      tipoDocumento: 'NIF',
      numeroDocumento: '00000000T',
      nacionalidad: 'ESP',
      correo: 'ana@correo.es',
      direccion: {
        direccion: 'C/Mayor 1',
        codigoPostal: '28001',
        pais: 'ESP',
        codigoMunicipio: '28079',
      },
    });
    expect(viajero?.actualizadoEn).toBeTruthy();
  });

  it('una dirección que llega como texto plano se acepta (formularios simples)', () => {
    const viajero = normalizarViajero({ nombre: 'Ana', apellido1: 'Pérez', direccion: 'C/Mayor 1' });
    expect(viajero?.direccion?.direccion).toBe('C/Mayor 1');
  });

  it('sin nombre ni apellidos no hay viajero', () => {
    expect(normalizarViajero({ documento: '123' })).toBeNull();
    expect(normalizarViajero(null)).toBeNull();
  });

  it('los campos se acotan: un formulario público no puede meter un cuerpo enorme', () => {
    const largo = normalizarViajero({ nombre: 'A'.repeat(500), apellido1: 'B' });
    expect(largo?.nombre.length).toBeLessThanOrEqual(200);
  });
});

describe('El titular va primero (el registro asigna el rol por posición)', () => {
  it('sube al titular por su correo', () => {
    const viajeros = normalizarViajeros([
      { nombre: 'Luis', apellido1: 'Pérez', correo: 'luis@correo.es' },
      { nombre: 'Ana', apellido1: 'Pérez', correo: 'ana@correo.es' },
    ]).viajeros;

    const ordenados = titularPrimero(viajeros, { correo: 'ana@correo.es' });
    expect(ordenados.map((v) => v.nombre)).toEqual(['Ana', 'Luis']);
  });

  it('si no reconoce a nadie, respeta el orden que mandó la pantalla', () => {
    const viajeros = normalizarViajeros([
      { nombre: 'Luis', apellido1: 'Pérez' },
      { nombre: 'Ana', apellido1: 'Pérez' },
    ]).viajeros;

    expect(titularPrimero(viajeros, { correo: 'otro@correo.es' }).map((v) => v.nombre)).toEqual([
      'Luis',
      'Ana',
    ]);
  });
});

describe('Herencia del grupo (con consentimiento, nunca por suposición)', () => {
  const titular = adultoCompleto();
  const acompanante = adultoCompleto({
    nombre: 'Pedro',
    tipoDocumento: null,
    numeroDocumento: null,
    soporteDocumento: null,
    apellido2: null,
    telefono: null,
    correo: null,
    direccion: null,
  });

  it('el contacto del titular cubre al acompañante que no dio ninguno', () => {
    const [ , heredado ] = heredarDatosDelTitular([titular, acompanante]);
    expect(heredado.telefono).toBe('666666666');
    expect(heredado.correo).toBe('juangarcia@correo.es');
    // Lo personal NO se toca: ni documento, ni dirección sin pedirlo.
    expect(heredado.numeroDocumento).toBeNull();
    expect(heredado.direccion).toBeNull();
  });

  it('la dirección solo se hereda si el formulario lo pide (checkbox del huésped)', () => {
    const [ , sinPedirlo ] = heredarDatosDelTitular([titular, acompanante]);
    expect(sinPedirlo.direccion).toBeNull();

    const [ , conCheck ] = heredarDatosDelTitular([titular, acompanante], { heredarDireccion: true });
    expect(conCheck.direccion?.direccion).toBe('C/Serrano 127');
    // Copia, no referencia compartida: editar a uno no puede cambiar al otro.
    expect(conCheck.direccion).not.toBe(titular.direccion);
  });

  it('no pisa lo que el acompañante sí trajo', () => {
    const conDatos = adultoCompleto({ nombre: 'Pedro', telefono: '611111111' });
    const [ , conservado ] = heredarDatosDelTitular([titular, conDatos]);
    expect(conservado.telefono).toBe('611111111');
  });
});

describe('Guardado dentro de guestData', () => {
  it('no pierde el idioma ni el contacto del titular', () => {
    const fusionado = fusionarViajerosEnGuestData(
      { idioma: 'en', firstName: 'Ana', email: 'ana@correo.es' },
      normalizarViajeros([{ nombre: 'Ana', apellido1: 'Pérez' }]).viajeros
    );
    expect(fusionado.idioma).toBe('en');
    expect(fusionado.firstName).toBe('Ana');
    expect(Array.isArray(fusionado.viajeros)).toBe(true);
  });

  it('prerellena el formulario con lo que ya había (y lee los formatos antiguos)', () => {
    const guardados = viajerosDeGuestData({
      viajeros: [{ nombre: 'Ana', apellido1: 'Pérez', numeroDocumento: '00000000T' }],
    });
    expect(guardados).toHaveLength(1);
    expect(guardados[0].numeroDocumento).toBe('00000000T');

    // Formato heredado del canal: `guests` en lugar de `viajeros`.
    expect(viajerosDeGuestData({ guests: [{ nombre: 'Luis', apellido1: 'Gómez' }] })).toHaveLength(1);
    expect(viajerosDeGuestData(null)).toEqual([]);
  });
});

describe('Paridad con la validación del Ministerio', () => {
  const fichas: Array<{ caso: string; viajeros: ViajeroCheckin[]; referencia?: Date }> = [
    { caso: 'adulto completo', viajeros: [adultoCompleto()] },
    {
      caso: 'adulto sin segundo apellido ni soporte (NIF)',
      viajeros: [adultoCompleto({ apellido2: null, soporteDocumento: null })],
    },
    {
      caso: 'NIF con dígito de control inválido',
      viajeros: [adultoCompleto({ numeroDocumento: '12345678A' })],
    },
    { caso: 'sin documento', viajeros: [adultoCompleto({ tipoDocumento: null, numeroDocumento: null })] },
    { caso: 'sin fecha de nacimiento', viajeros: [adultoCompleto({ fechaNacimiento: '' })] },
    {
      caso: 'fecha de nacimiento en formato local',
      viajeros: [adultoCompleto({ fechaNacimiento: '01/01/1990' })],
    },
    { caso: 'sin dirección', viajeros: [adultoCompleto({ direccion: null })] },
    {
      caso: 'dirección de España sin código INE',
      viajeros: [adultoCompleto({ direccion: { ...adultoCompleto().direccion, codigoMunicipio: null } })],
    },
    {
      caso: 'dirección de fuera de España sin municipio',
      viajeros: [adultoCompleto({ direccion: { ...adultoCompleto().direccion, pais: 'FRA', codigoMunicipio: null, nombreMunicipio: null } })],
    },
    {
      caso: 'país que no es alfa-3',
      viajeros: [adultoCompleto({ direccion: { ...adultoCompleto().direccion, pais: 'ESPAÑA' } })],
    },
    { caso: 'sin contacto', viajeros: [adultoCompleto({ telefono: null, telefono2: null, correo: null })] },
    {
      caso: 'correo con formato inválido pero teléfono válido',
      viajeros: [adultoCompleto({ correo: 'esto-no-es-un-correo' })],
    },
    { caso: 'sexo de dos caracteres', viajeros: [adultoCompleto({ sexo: 'HH' })] },
    { caso: 'nacionalidad de cuatro letras', viajeros: [adultoCompleto({ nacionalidad: 'ESPA' })] },
    { caso: 'nombre fuera de longitud', viajeros: [adultoCompleto({ nombre: 'A'.repeat(51) })] },
    {
      caso: 'menor sin documento (permitido)',
      viajeros: [
        adultoCompleto({ nombre: 'Hijo', fechaNacimiento: '2015-05-05', tipoDocumento: null, numeroDocumento: null, soporteDocumento: null }),
      ],
    },
    {
      caso: 'menor acompañado con parentesco declarado',
      viajeros: [
        adultoCompleto({ parentesco: 'HIJO' }),
        adultoCompleto({ nombre: 'Hijo', fechaNacimiento: '2015-05-05', tipoDocumento: null, numeroDocumento: null, soporteDocumento: null }),
      ],
    },
    { caso: 'sin viajeros', viajeros: [] },
  ];

  it.each(fichas)('$caso: «puede salir el parte» coincide con el validador oficial', ({ viajeros, referencia }) => {
    const ref = referencia ?? REFERENCIA;
    const errores = validarParteViajeros(parteCon(viajeros, ref)).errores;
    const resumen = resumenDocumentacion(viajeros, ref);

    expect(resumen.completa).toBe(errores.length === 0);
    // Sin viajeros no hay «campo que falta»: lo que falta es gente. La reserva
    // tampoco puede considerarse documentada (`completa: false`), y la API
    // rechaza el guardado con 0 viajeros.
    if (errores.length > 0 && viajeros.length > 0) expect(resumen.faltan.length).toBeGreaterThan(0);
    if (viajeros.length === 0) expect(resumen.total).toBe(0);
  });

  it('el caso del menor sin parentesco lo detecta la reserva, no la ficha suelta', () => {
    const menor = adultoCompleto({
      nombre: 'Hijo',
      fechaNacimiento: '2015-05-05',
      tipoDocumento: null,
      numeroDocumento: null,
      soporteDocumento: null,
    });

    // Su ficha está completa: es la regla de menores la que bloquea el parte.
    expect(faltantesParaParte(menor, REFERENCIA).faltan).toEqual([]);
    expect(resumenDocumentacion([menor], REFERENCIA).faltan).toEqual(['parentesco']);
    expect(resumenDocumentacion([menor], REFERENCIA).completa).toBe(false);
    expect(validarParteViajeros(parteCon([menor])).errores.length).toBeGreaterThan(0);
  });

  it('cuenta los viajeros completos de la reserva', () => {
    const resumen = resumenDocumentacion([adultoCompleto(), adultoCompleto({ nombre: 'Pedro', tipoDocumento: null, numeroDocumento: null, soporteDocumento: null, apellido2: null })], REFERENCIA);
    expect(resumen.total).toBe(2);
    expect(resumen.completos).toBe(1);
    expect(resumen.faltan).toContain('tipoDocumento');
    expect(resumen.completa).toBe(false);
  });

  it('los recomendados nunca bloquean (nacionalidad y sexo)', () => {
    const sinOpcionales = adultoCompleto({ nacionalidad: null, sexo: null });
    const { faltan, recomendados } = faltantesParaParte(sinOpcionales, REFERENCIA);
    expect(faltan).toEqual([]);
    expect(recomendados).toEqual(['nacionalidad', 'sexo']);
    expect(resumenDocumentacion([sinOpcionales], REFERENCIA).completa).toBe(true);
  });

  it('todos los campos del formulario saben explicarse: la lista es la que usa la UI', () => {
    expect(CAMPOS_VIAJERO).toContain('parentesco');
    expect(CAMPOS_VIAJERO).toContain('contacto');
    expect(new Set(CAMPOS_VIAJERO).size).toBe(CAMPOS_VIAJERO.length);
    expect(MAX_VIAJEROS_CHECKIN).toBeGreaterThan(5);
  });
});
