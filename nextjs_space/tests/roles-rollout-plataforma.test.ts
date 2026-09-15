import { describe, it, expect } from 'vitest';

/**
 * Las reglas que reparten, una sola vez, lo que la plataforma concedía por
 * nombre. Es el paso que evita que el administrador de una cuenta se quede sin
 * su cockpit al sustituir el nombre por el permiso, y como tal es aditivo: no
 * puede retirar nada a nadie.
 */
import {
  NOMBRES_QUE_ADMINISTRABAN,
  LLAVE_DE_ADMINISTRACION,
  permisosQueHereda,
  conPermisosHeredados,
  tiene,
} from '@/lib/roles-rollout';

describe('permisosQueHereda', () => {
  it('da la llave de administración al rol que se llamaba «Admin» y no la tiene', () => {
    const hereda = permisosQueHereda({ equipo: { ver: true } }, 'Admin');

    expect(hereda).toEqual([LLAVE_DE_ADMINISTRACION]);
  });

  it('funciona con la otra grafía y con espacios', () => {
    for (const nombre of ['admin', 'ADMIN', '  Administrador  ']) {
      expect(permisosQueHereda({}, nombre), nombre).toEqual([LLAVE_DE_ADMINISTRACION]);
    }
    expect(NOMBRES_QUE_ADMINISTRABAN).toContain('administrador');
  });

  it('no toca a un rol que ya tiene la llave (idempotencia)', () => {
    expect(permisosQueHereda({ configuracion: { gestionar: true } }, 'Admin')).toEqual([]);
    expect(permisosQueHereda({ all: true }, 'Admin')).toEqual([]);
  });

  it('no le da nada a un rol que se llama distinto', () => {
    for (const nombre of ['Anfitrión', 'Agente', 'Limpieza', 'Sales Agent', 'Support', '']) {
      expect(permisosQueHereda({}, nombre), nombre).toEqual([]);
    }
    expect(permisosQueHereda({}, null)).toEqual([]);
  });

  it('no escribe en Superadmin: su acceso es un bypass, no un permiso', () => {
    expect(permisosQueHereda({}, 'Superadmin')).toEqual([]);
  });
});

describe('conPermisosHeredados', () => {
  it('añade la llave sin tocar lo que ya había', () => {
    const antes = { leads: { ver: true, editar: true }, campanas: { ver: true } };
    const despues = conPermisosHeredados(antes, 'Admin');

    expect(despues).toEqual({
      leads: { ver: true, editar: true },
      campanas: { ver: true },
      configuracion: { gestionar: true },
    });
    // No muta el original: el script puede comparar antes y después.
    expect(antes).toEqual({ leads: { ver: true, editar: true }, campanas: { ver: true } });
  });

  it('no retira ninguna acción del módulo configuracion', () => {
    const despues = conPermisosHeredados({ configuracion: { ver: true, editar: false } }, 'Admin');

    expect(despues).toEqual({ configuracion: { ver: true, editar: false, gestionar: true } });
    expect(tiene(despues, 'configuracion', 'ver')).toBe(true);
  });

  it('repetirlo no cambia nada', () => {
    const una = conPermisosHeredados({}, 'Admin');
    expect(conPermisosHeredados(una, 'Admin')).toEqual(una);
  });

  it('sobrevive a permisos ausentes o corruptos', () => {
    expect(conPermisosHeredados(null, 'Admin')).toEqual({ configuracion: { gestionar: true } });
    expect(conPermisosHeredados(undefined, 'Anfitrión')).toEqual({});
    expect(conPermisosHeredados('vaya' as never, 'Anfitrión')).toEqual({});
  });
});
