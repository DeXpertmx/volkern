import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guardia del "single source of truth" de disponibilidad (FASE 3, regla 2).
 *
 * El Availability Engine central es el único que puede calcular disponibilidad.
 * El Booking Engine, la web y los canales deben consumirlo; no pueden tener su
 * propio cálculo, porque de ahí salen las sobreventas.
 *
 * Esta prueba recorre el código del servidor y falla si alguien:
 *  1. vuelve a definir las primitivas del motor en otro sitio, o
 *  2. calcula disponibilidad desde reservas sin usar el motor.
 */

const RAIZ = path.resolve(__dirname, '..');
const MOTOR = 'lib/hospitality/availability.ts';

const PRIMITIVAS = [
  'unitOccupiedOnDay',
  'unitBlockedOnDay',
  'unitUnavailableOnDay',
  'unitAvailability',
  'availabilityByRoomCode',
  'loadAvailabilityContext',
  // Ocupación agregada (la demanda que mueve el precio de la capa 2): si cada
  // consumidor la contara por su cuenta, el precio dependería de quién pregunte.
  'ocupacionPorNoche',
];

/** Directorios de código de servidor donde vive (o vivirá) la lógica. */
const DIRECTORIOS = ['lib', 'app/api'];

function listarArchivos(dir: string): string[] {
  const absoluto = path.join(RAIZ, dir);
  if (!fs.existsSync(absoluto)) return [];

  const archivos: string[] = [];
  for (const entrada of fs.readdirSync(absoluto, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
    const relativo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      archivos.push(...listarArchivos(relativo));
    } else if (/\.(ts|tsx)$/.test(entrada.name)) {
      archivos.push(relativo);
    }
  }
  return archivos;
}

const archivosServidor = DIRECTORIOS.flatMap(listarArchivos);
const contenidos = new Map(
  archivosServidor.map((archivo) => [
    archivo,
    fs.readFileSync(path.join(RAIZ, archivo), 'utf8'),
  ])
);

describe('un solo motor de disponibilidad', () => {
  it('el motor central existe y expone las primitivas', () => {
    const motor = contenidos.get(MOTOR);
    expect(motor, `No se encontró ${MOTOR}`).toBeTruthy();
    for (const primitiva of PRIMITIVAS) {
      expect(motor, `El motor debe exportar ${primitiva}`).toMatch(
        new RegExp(`export\\s+(async\\s+)?function\\s+${primitiva}\\b`)
      );
    }
  });

  it('ninguna otra parte del servidor redefine las primitivas del motor', () => {
    const duplicados: string[] = [];
    for (const [archivo, contenido] of contenidos) {
      if (archivo === MOTOR) continue;
      for (const primitiva of PRIMITIVAS) {
        const definicion = new RegExp(
          `^\\s*(export\\s+)?(async\\s+)?function\\s+${primitiva}\\b`,
          'm'
        );
        if (definicion.test(contenido)) {
          duplicados.push(`${archivo} → ${primitiva}`);
        }
      }
    }
    expect(
      duplicados,
      `Estas primitivas deben vivir solo en ${MOTOR}:\n${duplicados.join('\n')}`
    ).toEqual([]);
  });

  it('quien calcula disponibilidad desde reservas importa el motor', () => {
    // Una reserva llega por varios caminos (OTA, manual, Booking Engine), pero
    // la disponibilidad solo puede salir del motor central.
    const infractores: string[] = [];

    for (const [archivo, contenido] of contenidos) {
      if (archivo === MOTOR) continue;
      if (!contenido.includes('hospitalityReservation')) continue;
      if (!/available\s*[:=]/.test(contenido)) continue;

      const usaElMotor = /from\s+['"][^'"]*availability['"]/.test(contenido);
      if (!usaElMotor) infractores.push(archivo);
    }

    expect(
      infractores,
      `Estos archivos calculan disponibilidad sin usar el motor central:\n${infractores.join('\n')}`
    ).toEqual([]);
  });

  it('el motor no depende de módulos que lo consumen (sin ciclos)', () => {
    const motor = contenidos.get(MOTOR) || '';
    for (const prohibido of ["from './sync'", "from './reservations'", 'from "@/lib/hospitality/sync"']) {
      expect(motor).not.toContain(prohibido);
    }
  });
});
