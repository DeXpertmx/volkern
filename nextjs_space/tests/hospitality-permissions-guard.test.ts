import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CAPACIDADES_HOSPITALITY,
  TODAS_LAS_CAPACIDADES,
} from '@/lib/hospitality/permissions';

/**
 * Guardia de permisos de Hospitality (§27: el backend valida permisos).
 *
 * Un endpoint nuevo sin permiso no rompe nada visible — simplemente cualquiera
 * del tenant puede usarlo. Esta prueba recorre las rutas reales y falla si:
 *
 *  1. un método autenticado no exige capacidad,
 *  2. exige una capacidad que no existe (un typo dejaría el endpoint inaccesible
 *     o sin comprobar),
 *  3. el editor de roles no puede conceder lo que la API exige,
 *  4. alguien protege con sesión el webhook del proveedor, que llega con Basic
 *     Auth y no con usuario de Volkern.
 */

const RAIZ = path.resolve(__dirname, '..');
const RUTAS = 'app/api/hospitality';
const EDITOR_ROLES = 'components/RoleManagement.tsx';

/**
 * Webhooks del proveedor de conectividad (reservas y mensajes): los llama él con
 * Basic Auth contra las credenciales guardadas. No hay usuario de Volkern al que
 * preguntarle por su rol, así que su control de acceso es la propia Basic Auth,
 * no los permisos por acción — y de hecho protegerlos con sesión los dejaría
 * inservibles (el emisor no tiene sesión).
 *
 * Quedan exentos de la guardia de CAPACIDAD, no de autenticación: cada uno la
 * valida con `readBasicAuth` y tiene su guardia del 401
 * (`tests/hospitality-webhook-reservations-route.test.ts` y
 * `tests/hospitality-mensajes-webhook-route.test.ts`).
 */
const EXENTAS: Record<string, string> = {
  'webhook/reservations/route.ts': 'Basic Auth del proveedor de conectividad',
  'webhook/messages/route.ts':
    'Basic Auth del proveedor de conectividad (el mismo par que el webhook de reservas)',
};

function listarRutas(dir: string): string[] {
  const absoluto = path.join(RAIZ, RUTAS, dir);
  const encontradas: string[] = [];
  for (const entrada of fs.readdirSync(absoluto, { withFileTypes: true })) {
    const relativo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...listarRutas(relativo));
    } else if (entrada.name === 'route.ts') {
      encontradas.push(relativo);
    }
  }
  return encontradas;
}

const rutaRaiz = path.join(RAIZ, RUTAS);
const archivosRuta = listarRutas('');

interface MetodoRuta {
  archivo: string;
  metodo: string;
  cuerpo: string;
}

const metodos: MetodoRuta[] = archivosRuta.map((archivo) => {
  const src = fs.readFileSync(path.join(rutaRaiz, archivo), 'utf8');
  const fronteras: { metodo: string; inicio: number }[] = [];
  const re = /^export async function (GET|POST|PATCH|PUT|DELETE)\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    fronteras.push({ metodo: m[1], inicio: m.index });
  }
  return fronteras.map((f, i) => ({
    archivo,
    metodo: f.metodo,
    cuerpo: src.slice(f.inicio, i + 1 < fronteras.length ? fronteras[i + 1].inicio : src.length),
  }));
}).flat();

describe('cobertura de permisos en las rutas de Hospitality', () => {
  it('encuentra las rutas (la guardia no está mirando al vacío)', () => {
    expect(archivosRuta.length).toBeGreaterThanOrEqual(38);
    expect(metodos.length).toBeGreaterThanOrEqual(60);
  });

  it('cada método autenticado exige una capacidad antes de hacer su trabajo', () => {
    const sinGuardia = metodos
      .filter((m) => !(m.archivo in EXENTAS))
      .filter((m) => !m.cuerpo.includes('exigirPermisoHospitality('))
      .map((m) => `${m.archivo} → ${m.metodo}`);

    expect(
      sinGuardia,
      `Estos endpoints atienden peticiones sin comprobar el rol del usuario:\n  ${sinGuardia.join('\n  ')}`
    ).toEqual([]);
  });

  it('la capacidad se pide con la sesión autenticada', () => {
    const malLlamadas = metodos
      .filter((m) => !(m.archivo in EXENTAS))
      .filter((m) => m.cuerpo.includes('exigirPermisoHospitality('))
      .filter((m) => !/exigirPermisoHospitality\(\s*auth\s*,/.test(m.cuerpo))
      .map((m) => `${m.archivo} → ${m.metodo}`);

    expect(malLlamadas).toEqual([]);
  });

  it('todas las capacidades exigidas existen en el catálogo', () => {
    const catalogo = new Set<string>(TODAS_LAS_CAPACIDADES);
    const desconocidas: string[] = [];

    for (const m of metodos) {
      const re = /exigirPermisoHospitality\(\s*auth\s*,\s*'([^']+)'/g;
      let coincidencia: RegExpExecArray | null;
      while ((coincidencia = re.exec(m.cuerpo)) !== null) {
        if (!catalogo.has(coincidencia[1])) {
          desconocidas.push(`${m.archivo} → ${m.metodo}: '${coincidencia[1]}'`);
        }
      }
    }

    expect(desconocidas).toEqual([]);
  });

  it('exige cada vez más de una capacidad distinta (no es un sello decorativo)', () => {
    const usadas = new Set<string>();
    for (const m of metodos) {
      const re = /exigirPermisoHospitality\(\s*auth\s*,\s*'([^']+)'/g;
      let coincidencia: RegExpExecArray | null;
      while ((coincidencia = re.exec(m.cuerpo)) !== null) usadas.add(coincidencia[1]);
    }
    expect(usadas.size).toBeGreaterThanOrEqual(10);
  });

  it('el webhook del proveedor no se protege con permisos de usuario', () => {
    for (const [archivo, motivo] of Object.entries(EXENTAS)) {
      const src = fs.readFileSync(path.join(rutaRaiz, archivo), 'utf8');
      expect(
        src.includes('exigirPermisoHospitality('),
        `${archivo} está exento porque ${motivo}; no debe exigir permisos de rol`
      ).toBe(false);
    }
  });

  it('las decisiones por caso se resuelven con los ayudantes, no a mano', () => {
    // Cancelar, limpieza/mantenimiento y exportar no son casos genéricos: si
    // alguien los resolviera comparando cadenas por su cuenta, la regla dejaría
    // de tener un único lugar donde se decide.
    const conAyudantes = [
      ['tasks/route.ts', 'capacidadDeTarea'],
      ['reservations/[id]/route.ts', 'capacidadDeCambioDeReserva'],
    ] as const;

    for (const [archivo, ayudante] of conAyudantes) {
      const src = fs.readFileSync(path.join(rutaRaiz, archivo), 'utf8');
      expect(src, `${archivo} debería usar ${ayudante}`).toContain(ayudante);
    }
  });
});

describe('lo que la API exige, el editor de roles lo puede conceder', () => {
  const editor = fs.readFileSync(path.join(RAIZ, EDITOR_ROLES), 'utf8');

  it('todos los módulos de Hospitality aparecen en la matriz de roles', () => {
    const modulos = new Set(
      TODAS_LAS_CAPACIDADES.map((c) => CAPACIDADES_HOSPITALITY[c].modulo)
    );
    const ausentes = [...modulos].filter((modulo) => !editor.includes(`id: '${modulo}'`));
    expect(
      ausentes,
      `Estos módulos los exige la API pero no se pueden conceder desde ${EDITOR_ROLES}: ${ausentes.join(', ')}`
    ).toEqual([]);
  });

  it('el editor permite conceder cancelar, que no es eliminar', () => {
    expect(editor).toContain("id: 'cancelar'");
  });
});
