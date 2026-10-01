import { describe, it, expect } from 'vitest';

/**
 * Las reglas que reparten, una sola vez, lo que la plataforma concedía por
 * nombre. Es el paso que evita que el administrador de una cuenta se quede sin
 * su cockpit —o con el pipeline vacío— al sustituir el nombre por el permiso, y
 * como tal es aditivo: no puede retirar nada a nadie.
 *
 * Hay dos cosas que heredar, y son de naturaleza distinta: el **acceso** a una
 * puerta (`configuracion.gestionar`, que se concedía a quien se llamara
 * «Admin») y el **alcance** de los datos (`leads.ver_todos`, que se quitaba a
 * quien se llamara «Sales Agent» o «Support»).
 */
import {
  NOMBRES_QUE_ADMINISTRABAN,
  NOMBRES_QUE_VEIAN_SOLO_LOS_SUYOS,
  LLAVE_DE_ADMINISTRACION,
  LLAVE_DEL_PIPELINE_COMPLETO,
  permisosQueHereda,
  conPermisosHeredados,
  tiene,
} from '@/lib/roles-rollout';
import { canOnlySeeOwnLeads, type UserWithRole } from '@/lib/permissions-core';

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

  it('copia el alcance del pipeline a quien entraba al pipeline y veía todo', () => {
    // El caso real: los seis «Admin» de producción, con `leads.ver` granular.
    expect(permisosQueHereda({ leads: { ver: true } }, 'Comercial')).toEqual([
      LLAVE_DEL_PIPELINE_COMPLETO,
    ]);
    // El que además se llamaba «Admin» hereda las dos cosas, en un solo paso.
    expect(permisosQueHereda({ leads: { ver: true } }, 'Admin')).toEqual([
      LLAVE_DE_ADMINISTRACION,
      LLAVE_DEL_PIPELINE_COMPLETO,
    ]);
  });

  it('no copia el alcance a los dos nombres que solo veían lo suyo', () => {
    // Es exactamente el privilegio que se convierte: se quedan como estaban.
    for (const nombre of ['Sales Agent', 'Support', 'sales  agent', ' SUPPORT ']) {
      expect(permisosQueHereda({ leads: { ver: true } }, nombre), nombre).toEqual([]);
    }
    expect(NOMBRES_QUE_VEIAN_SOLO_LOS_SUYOS).toEqual(['sales agent', 'support']);
  });

  it('no copia el alcance a quien no entra al pipeline', () => {
    // A quien no ve el módulo, la llave no le cambia nada.
    expect(permisosQueHereda({}, 'Anfitrión')).toEqual([]);
    expect(permisosQueHereda({ leads: { crear: true } }, 'Comercial')).toEqual([]);
    expect(permisosQueHereda({ leads: false }, 'Comercial')).toEqual([]);
    expect(permisosQueHereda({ leads: { ver: false } }, 'Comercial')).toEqual([]);
  });

  it('no toca a un rol que ya tiene las llaves (idempotencia)', () => {
    expect(permisosQueHereda({ configuracion: { gestionar: true } }, 'Admin')).toEqual([]);
    expect(permisosQueHereda({ leads: { ver: true, ver_todos: true } }, 'Comercial')).toEqual([]);
    // El módulo entero y el wildcard ya conceden el alcance: `tiene` lo resuelve.
    expect(permisosQueHereda({ leads: true }, 'Comercial')).toEqual([]);
    expect(permisosQueHereda({ all: true }, 'Admin')).toEqual([]);
  });

  it('no escribe en Superadmin: su acceso es un bypass, no un permiso', () => {
    expect(permisosQueHereda({}, 'Superadmin')).toEqual([]);
    expect(permisosQueHereda({ leads: { ver: true } }, 'Superadmin')).toEqual([]);
  });

  it('no le da nada a un rol que se llama distinto y no tiene el pipeline', () => {
    for (const nombre of ['Anfitrión', 'Agente', 'Limpieza', 'Instructor', '']) {
      expect(permisosQueHereda({}, nombre), nombre).toEqual([]);
    }
    expect(permisosQueHereda({}, null)).toEqual([]);
  });
});

describe('conPermisosHeredados', () => {
  it('añade las llaves sin tocar lo que ya había', () => {
    const antes = { leads: { ver: true, editar: true }, campanas: { ver: true } };
    const despues = conPermisosHeredados(antes, 'Admin');

    expect(despues).toEqual({
      leads: { ver: true, editar: true, ver_todos: true },
      campanas: { ver: true },
      configuracion: { gestionar: true },
    });
    // No muta el original: el script puede comparar antes y después.
    expect(antes).toEqual({ leads: { ver: true, editar: true }, campanas: { ver: true } });
  });

  it('no retira ninguna acción de los módulos que toca', () => {
    const despues = conPermisosHeredados(
      { configuracion: { ver: true, editar: false }, leads: { ver: true, editar: false } },
      'Admin'
    );

    expect(despues).toEqual({
      configuracion: { ver: true, editar: false, gestionar: true },
      leads: { ver: true, editar: false, ver_todos: true },
    });
    expect(tiene(despues, 'configuracion', 'ver')).toBe(true);
    expect(tiene(despues, 'leads', 'editar')).toBe(false);
  });

  it('repetirlo no cambia nada', () => {
    const una = conPermisosHeredados({ leads: { ver: true } }, 'Admin');
    expect(conPermisosHeredados(una, 'Admin')).toEqual(una);
  });

  it('sobrevive a permisos ausentes o corruptos', () => {
    expect(conPermisosHeredados(null, 'Admin')).toEqual({ configuracion: { gestionar: true } });
    expect(conPermisosHeredados(undefined, 'Anfitrión')).toEqual({});
    expect(conPermisosHeredados('vaya' as never, 'Anfitrión')).toEqual({});
  });
});

describe('la clave legada «usuarios» hereda sus llaves en «equipo»', () => {
  it('el admin de las primeras cuentas recupera su panel de Equipo', () => {
    // Forma legada real (tenant JUAN ANTONIO): usuarios.* sin equipo.*.
    const hereda = permisosQueHereda(
      { usuarios: { ver: true, crear: true, editar: true, eliminar: true } },
      'Admin'
    );

    expect(hereda).toEqual(
      expect.arrayContaining([
        { modulo: 'equipo', accion: 'ver' },
        { modulo: 'equipo', accion: 'invitar' },
        { modulo: 'equipo', accion: 'editar' },
        { modulo: 'equipo', accion: 'eliminar' },
      ])
    );
  });

  it('concede en «equipo» SOLO lo que ya había en «usuarios»', () => {
    const despues = conPermisosHeredados({ usuarios: { ver: true } }, 'Admin');

    expect(despues.equipo).toEqual({ ver: true });
    expect(tiene(despues, 'equipo', 'invitar')).toBe(false);
    expect(tiene(despues, 'equipo', 'eliminar')).toBe(false);
  });

  it('quien ya tenía equipo no recibe nada duplicado, y el wildcard tampoco', () => {
    expect(permisosQueHereda({ equipo: { ver: true }, usuarios: { ver: true } }, 'Admin')).not.toContain(
      { modulo: 'equipo', accion: 'ver' }
    );
    expect(permisosQueHereda({ all: true }, 'Admin')).toEqual([]);
  });
});

describe('la llave que reparte la herencia es la que lee la regla', () => {
  it('al heredar, el rol deja de ver solo lo suyo', () => {
    const conLoHeredado = conPermisosHeredados({ leads: { ver: true } }, 'Comercial');
    const usuario = {
      id: 'u-1',
      roleId: 'r-1',
      tenantId: 't-1',
      role: { id: 'r-1', nombre: 'Comercial', permisos: conLoHeredado },
    } as UserWithRole;

    expect(canOnlySeeOwnLeads(usuario)).toBe(false);
  });

  it('y sin heredar nada, sigue viendo solo lo suyo', () => {
    const usuario = {
      id: 'u-1',
      roleId: 'r-1',
      tenantId: 't-1',
      role: { id: 'r-1', nombre: 'Sales Agent', permisos: { leads: { ver: true } } },
    } as UserWithRole;

    expect(canOnlySeeOwnLeads(usuario)).toBe(true);
  });
});
