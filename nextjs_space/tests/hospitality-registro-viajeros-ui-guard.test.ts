// @vitest-environment node
//
// Guardia de la página y de la API del registro de viajeros.
//
// Lo que se vigila aquí es lo que hace que la función sea conforme y operativa,
// no cosmética:
//  - La página y la API hablan con el endpoint del propio producto, y no
//    aparece en ningún sitio un agregador o servicio de terceros.
//  - La página NO construye XML ni llama al Ministerio por su cuenta: delega en
//    la API, que delega en el módulo del contrato oficial.
//  - La configuración exige lo que el servicio necesita de verdad (código de
//    arrendador, credenciales, código de establecimiento por inmueble y tipo de
//    pago del catálogo) y lo dice cuando falta.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Página de registro de viajeros', () => {
  const fuente = leer('app/dashboard/hospitality/registro-viajeros/page.tsx');

  it('consume la API del producto y no llama al Ministerio por su cuenta', () => {
    expect(fuente).toContain('/api/hospitality/registro-viajeros');
    expect(fuente).not.toMatch(/hospedajes\.(ses|pre-ses)\.mir\.es/);
    expect(fuente).not.toMatch(/fetch\(\s*['"]https?:\/\//);
  });

  it('explica la obligación legal y el plazo que cumple el sistema', () => {
    expect(fuente).toContain('RD 933/2021');
    expect(fuente).toContain('24 h');
  });

  it('deja configurar lo que el servicio exige para aceptar la comunicación', () => {
    for (const campo of [
      'Código de arrendador',
      'Usuario',
      'Contraseña',
      'Código de establecimiento por propiedad',
      'Código de tipo de pago',
    ]) {
      expect(fuente).toContain(campo);
    }
  });

  it('avisa cuando falta configuración y cuando falta el código de la propiedad', () => {
    expect(fuente).toContain('listoParaEnviar');
    expect(fuente).toContain('propiedadesSinCodigo');
    expect(fuente).toContain('se pueden comunicar');
  });

  it('permite completar los datos que el canal no envía y reintentar', () => {
    // El formulario de «completar» está en un componente compartido: la pantalla
    // de reservas hace la misma tarea y no puede haber dos formularios.
    expect(fuente).toContain('CompletarParteVijerosDialog');
    expect(fuente).toContain("accion: 'enviar'");
    expect(fuente).toContain("accion: 'consultar'");
    expect(fuente).toContain('Completar datos');
    expect(fuente).toContain('Reintentar');
  });

  it('enseña los partes que el sistema dejó de reintentar, con su motivo y su arreglo', () => {
    // No son «rechazadas»: son las que ya no se reintentan solas, o sea
    // estancias sin comunicar. El panel del hotel tiene que nombrarlas.
    expect(fuente).toContain('Partes sin reintentar');
    expect(fuente).toContain('partesSinReintentar');
    expect(fuente).toContain('sinReintentar');
    // El motivo y «qué corregir» salen del módulo puro del rechazo (la página
    // no reinterpreta el rechazo ni decide el ámbito).
    expect(fuente).toContain('queCorregirElParte(');
    expect(fuente).toContain('parteAbandonado(');
    // El tope de intentos no se escribe aquí: la regla es del módulo puro.
    expect(fuente).not.toMatch(/intentos\s*>=\s*\d/);
    // Y las dos salidas reales: corregir el dato del huésped o reenviar.
    expect(fuente).toContain('Corregir los datos');
    expect(fuente).toContain('Reenviar el parte');
    // Quién actúa cuando ya no actúa el sistema: el botón lo dice.
    expect(fuente).toContain("'Reenviar'");
  });

  it('distingue las dos causas del abandono: rechazo del Ministerio y no-entrega', () => {
    // Un parte rechazado se corrige en los datos del huésped; uno que el
    // servicio no llegó a recibir, no (se reintenta). Si la tarjeta los pintara
    // igual, el hotel perdería la mañana en un formulario donde no hay nada mal.
    expect(fuente).toContain('el servicio no lo recibió');
    expect(fuente).toContain('rechazado por el Ministerio');
    expect(fuente).toContain('ESTADO_SIN_ENTREGAR');
    expect(fuente).toContain('Sin entregar al servicio');
    expect(fuente).toContain('diagnostico');
  });

  it('el aviso y la lectura del abandono los produce el módulo puro', () => {
    // El umbral y el volumen mínimo no se deciden en la página, o el hotel
    // leería avisos distintos en cada pantalla.
    expect(fuente).toContain("from '@/lib/hospitality/partes-metrics'");
    expect(fuente).toContain('alertaPartesSinReintentar(');
    expect(fuente).toContain('lecturaPartesSinReintentar(');
    expect(fuente).toContain('MAX_INTENTOS_DEL_PARTE');
    expect(fuente).not.toMatch(/tasaSinReintentar\s*[<>]=?\s*0\./);
  });

  it('distingue los estados que importan al operador', () => {
    for (const estado of ['aceptada', 'enviada', 'datos_incompletos', 'rechazada']) {
      expect(fuente).toContain(estado);
    }
    // El estado `enviada` no es «hecho»: el alta es asíncrona y hay que consultar el lote.
    expect(fuente).toContain('Esperando lote');
  });
});

describe('Formulario compartido de «completar el parte»', () => {
  const fuente = leer('components/hospitality/completar-parte-viajeros-dialog.tsx');

  it('envía los datos por la API del producto y no llama al Ministerio', () => {
    expect(fuente).toContain("accion: 'completar'");
    expect(fuente).toContain('/api/hospitality/registro-viajeros');
    expect(fuente).not.toMatch(/hospedajes\.(ses|pre-ses)\.mir\.es/);
    expect(fuente).not.toMatch(/fetch\(\s*['"]https?:\/\//);
  });

  it('recoge los datos que el Ministerio exige del viajero', () => {
    for (const campo of [
      'numeroDocumento',
      'soporteDocumento',
      'fechaNacimiento',
      'direccion',
      'codigoMunicipio',
      'pais',
    ]) {
      expect(fuente).toContain(campo);
    }
  });

  it('no reutiliza lo tecleado para otra reserva (sería el documento de otro huésped)', () => {
    expect(fuente).toContain('useEffect');
    expect(fuente).toContain('reserva?.id');
  });
});

describe('API de registro de viajeros', () => {
  const fuente = leer('app/api/hospitality/registro-viajeros/route.ts');

  it('exige autenticación en lectura y escritura', () => {
    expect(fuente.match(/authenticateRequest\(req\)/g)?.length).toBe(2);
  });

  it('delega el envío en el servicio (nada de XML ni HTTP aquí)', () => {
    expect(fuente).toContain('enviarRegistroDeReserva');
    expect(fuente).toContain('consultarLotesPendientes');
    expect(fuente).toContain('anularComunicacion');
    expect(fuente).not.toContain('fetch(');
    expect(fuente).not.toContain('construirXml');
  });

  it('solo habla del servicio oficial del Ministerio', () => {
    expect(fuente).toContain('Ministerio del');
    expect(fuente).toContain('SES Hospedajes');
    expect(fuente).not.toMatch(/hospedajes\.(ses|pre-ses)\.mir\.es/);
    expect(fuente).not.toMatch(/https?:\/\/(?!schemas)/);
  });

  it('incluye los inmuebles PUBLICADOS: son los que emiten partes', () => {
    // Regresión real (la encontró el ensayo E2E): la pantalla listaba solo las
    // propiedades «activa», así que la que ya está vendiendo («conectada») no
    // aparecía — ni su código de establecimiento ni el aviso de que sin él sus
    // partes no se pueden comunicar.
    expect(fuente).toContain('ESTADOS_PROPIEDAD_REGISTRO');
    expect(fuente).not.toMatch(/estado:\s*'activa'/);

    const servicio = leer('lib/hospitality/registro-viajeros-service.ts');
    expect(servicio).toContain('ESTADOS_PROPIEDAD_REGISTRO');
    expect(servicio).not.toMatch(/estado:\s*'activa'/);
    expect(servicio).toContain("'conectada'");
  });

  it('las preguntas personalizadas del hotel NO tocan el flujo del parte (XML del Ministerio)', () => {
    // Regla inviolable del módulo checkin-preguntas: la config y las respuestas
    // son asunto del hotel y el XSD del parte es cerrado. En la ruta solo se
    // persiste la pregunta; la construcción del XML vive en el servicio MIR y
    // jamás lee respuestasCheckin.
    const servicioMIR = leer('lib/hospitality/registro-viajeros-service.ts');
    const xml = leer('lib/hospitality/registro-viajeros.ts');
    expect(servicioMIR).not.toContain('respuestasCheckin');
    expect(xml).not.toContain('respuestasCheckin');
    expect(xml).not.toContain('checkinPregunta');
  });
});
