// @vitest-environment node
//
// Guardias de las dos pantallas que recogen los datos del huésped para el
// registro de viajeros. Son guardias de fuente (leen el código, no lo ejecutan)
// porque lo que fijan es de arquitectura, no de comportamiento:
//  - La página del check-in habla SOLO con su propia API pública (el token es
//    la credencial) y no con ningún servicio externo.
//  - Todos los textos salen del módulo de i18n (CHECKIN_TEXTOS): cero
//    literales de interfaz en castellano dentro del componente.
//  - El idioma se resuelve con el MISMO patrón isomórfico que el motor de
//    reservas (español en servidor y primer render, `?lang=` antes del paint).
//  - La herencia de la dirección viaja como consentimiento explícito
//    (`heredarDireccion`), no como suposición del servidor.
//  - El motor público pide los datos del documento y devuelve el enlace de
//    check-in en la confirmación.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8');

const PAGINA_CHECKIN = 'app/checkin/[token]/page.tsx';
// El formulario de documento del titular vive en el ASISTENTE de la página
// pública única: desde la unificación de las dos páginas ya no hay una pantalla
// «vieja» que lo pida por su cuenta.
const PAGINA_MOTOR = 'components/hospitality/booking/BookingWizard.tsx';
const API_CHECKIN = 'app/api/public/checkin/[token]/route.ts';

describe('check-in online (pantalla del huésped)', () => {
  const page = leer(PAGINA_CHECKIN);

  it('habla solo con su API pública por token (no con terceros)', () => {
    expect(page).toContain('`/api/public/checkin/${token}`');
    // Ni fetch a hosts externos ni SDKs de agregadores.
    expect(page).not.toMatch(/fetch\(\s*['"`]https?:\/\//);
  });

  it('todos los textos salen del i18n del módulo (sin literales de interfaz)', () => {
    expect(page).toContain('CHECKIN_TEXTOS[idioma]');
    expect(page).toContain('etiquetasDeCampos');
    // Los textos de los campos se piden al módulo, no se escriben aquí.
    expect(page).toContain('t.campos');
    expect(page).not.toMatch(/etiqueta="(Nombre|Documento|Dirección|Teléfono)/);
  });

  it('resuelve el idioma como el motor: español primero y `?lang=` antes del paint', () => {
    expect(page).toContain('idiomaDesdeUrl(window.location.search)');
    expect(page).toContain('useLayoutEffect');
    expect(page).toContain('IDIOMA_POR_DEFECTO');
  });

  it('la herencia de la dirección es un consentimiento explícito del huésped', () => {
    expect(page).toContain('heredarDireccion: mismaDireccion');
    expect(page).toContain('t.mismaDireccion');
    // Se ofrece, no se aplica sola: el checkbox arranca marcado, pero se manda.
    expect(page).toContain('setMismaDireccion');
  });

  it('usa selectores cerrados para tipo de documento y sexo, no datalist editables', () => {
    expect(page).toContain('SelectorTipoDocumentoViajero');
    expect(page).toContain('SelectorSexoViajero');
    expect(page).not.toContain('id="tipos-documento"');
  });

  it('país y municipio van con selectores de catálogo, no con input libre', () => {
    // El Ministerio valida contra su catálogo: un input libre generaba
    // rechazos («España», «ESP », códigos INE mal tecleados).
    expect(page).toContain('SelectorPais');
    expect(page).toContain('SelectorMunicipioINE');
    expect(page).toContain('CampoTelefonoConPais');
    // Y los datos que viajan siguen siendo los del borrador del huésped.
    expect(page).toContain('codigoMunicipio: codigo');
  });

  it('dice qué falta con las etiquetas del huésped, no con códigos internos', () => {
    expect(page).toContain('t.pendiente');
    expect(page).toContain('faltan');
    expect(page).toContain('EstadoDocumentacion');
  });
});

describe('API pública del check-in', () => {
  const api = leer(API_CHECKIN);

  it('la credencial es el token de la reserva y su reserva cerrada da 410', () => {
    expect(api).toContain('reservaParaCheckin(token)');
    expect(api).toContain('reservaCerrada(reserva.estado)');
    expect(api).toContain('status: 410');
  });

  it('envía el parte solo cuando la documentación está completa (y el servicio ya empezó)', () => {
    expect(api).toContain('guardado.documentacion.completa');
    expect(api).toContain('enviarParteSiCorresponde');
  });

  it('el tope de viajeros se valida en el servidor, no solo en la pantalla', () => {
    expect(api).toContain("guardado.error === 'demasiados_viajeros'");
    expect(api).toContain('CAMPOS_MINIMOS_VIAJERO');
  });
});

describe('motor de reservas: datos del documento del titular', () => {
  const asistente = leer(PAGINA_MOTOR);
  const ruta = leer('app/api/public/booking/[slug]/reservar/route.ts');
  const motor = leer('lib/hospitality/booking-engine.ts');

  it('el formulario pide el documento y lo manda con la reserva', () => {
    expect(asistente).toContain('t.documentoTitulo');
    expect(asistente).toContain('documento');
    // La ruta no interpreta el documento: lo pasa al motor, que es quien valida
    // y guarda el registro de viajeros.
    expect(ruta).toContain('documento:');
    expect(ruta).not.toContain('normalizarViajero');
  });

  it('la confirmación muestra el enlace de check-in para el resto del grupo', () => {
    expect(asistente).toContain('t.completarCheckin');
    expect(asistente).toContain('resultado.checkinUrl');
    expect(ruta).toContain('checkinUrl');
    expect(motor).toContain('asegurarTokenCheckin');
  });

  it('sin datos de documento no se inventa un viajero (lo pide el check-in)', () => {
    expect(motor).toContain('viajerosDelTitular');
    expect(motor).toContain('normalizarViajero');
    // Solo se guarda si hay documentación de verdad (el nombre suelto no es un
    // parte): la decisión vive en el motor, no en la ruta.
    expect(motor).toContain('documentaAlgo');
  });
});
