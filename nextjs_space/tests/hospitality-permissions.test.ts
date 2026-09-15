import { describe, it, expect } from 'vitest';
import {
  CAPACIDADES_HOSPITALITY,
  CAPACIDADES_PRIVILEGIADAS,
  PERMISOS_HOSPITALITY_COMPLETOS,
  TODAS_LAS_CAPACIDADES,
  capacidadDeCambioDeReserva,
  capacidadDeLecturaDeTarea,
  capacidadDeTarea,
  exigirPermisoHospitality,
  puedeEnHospitality,
  type CapacidadHospitality,
} from '@/lib/hospitality/permissions';
import {
  conPermisosHospitality,
  rolYaCubierto,
} from '@/lib/hospitality/permissions-backfill';
import {
  ALL_PERMISSION_MODULES,
  type UserWithRole,
} from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/rbac-types';

/**
 * Permisos por acción del rol en Hospitality (§27).
 *
 * La guardia de rutas (tests/hospitality-permissions-guard.test.ts) comprueba que
 * cada endpoint exige una capacidad; aquí se comprueba que la capacidad concede
 * lo que promete y que un rol sin ella no pasa.
 */

function sesion(permisos: Record<string, unknown> | null, nombre = 'Admin') {
  const user: UserWithRole | null =
    permisos === null
      ? null
      : {
          id: 'user-1',
          roleId: 'role-1',
          tenantId: 'tenant-a',
          role: { id: 'role-1', nombre, permisos },
        };
  return { user: user as unknown as UserWithRole };
}

describe('catálogo de capacidades', () => {
  it('cubre las áreas que el producto pidió proteger', () => {
    // Reservas: ver, crear, modificar y cancelar.
    expect(TODAS_LAS_CAPACIDADES).toContain('reservas.ver');
    expect(TODAS_LAS_CAPACIDADES).toContain('reservas.crear');
    expect(TODAS_LAS_CAPACIDADES).toContain('reservas.editar');
    expect(TODAS_LAS_CAPACIDADES).toContain('reservas.cancelar');
    // Limpieza, mantenimiento e integraciones.
    expect(TODAS_LAS_CAPACIDADES).toContain('operaciones.gestionar');
    expect(TODAS_LAS_CAPACIDADES).toContain('mantenimiento.gestionar');
    expect(TODAS_LAS_CAPACIDADES).toContain('integraciones.gestionar');
  });

  it('cada capacidad apunta a un módulo y una acción que existen', () => {
    for (const capacidad of TODAS_LAS_CAPACIDADES) {
      const definicion = CAPACIDADES_HOSPITALITY[capacidad];
      expect(
        ALL_PERMISSION_MODULES,
        `${capacidad} apunta al módulo ${definicion.modulo}, que no existe`
      ).toContain(definicion.modulo);
      expect(
        ALL_PERMISSIONS,
        `${capacidad} apunta a la acción ${definicion.accion}, que no existe`
      ).toContain(definicion.accion);
      expect(definicion.etiqueta.length).toBeGreaterThan(3);
    }
  });

  it('los módulos de Hospitality se conceden por separado', () => {
    // Si compartieran módulo, conceder limpieza concedería reservas.
    const modulos = new Set(TODAS_LAS_CAPACIDADES.map((c) => CAPACIDADES_HOSPITALITY[c].modulo));
    expect(modulos.size).toBeGreaterThanOrEqual(8);
    for (const modulo of modulos) {
      // `roles.gestionar` es la excepción y es deliberada: repartir los permisos
      // del alojamiento es un acto sobre el equipo de la cuenta, y ahí vive el
      // módulo `equipo` desde mucho antes de que existiera Hospitality.
      const deHospitality = modulo.startsWith('hospitality_');
      expect(
        deHospitality || modulo === 'equipo',
        `${modulo} no es un módulo de Hospitality ni el de equipo`
      ).toBe(true);
    }
  });

  it('el conjunto completo cubre todo lo que no es privilegio (retrollenado sin huecos)', () => {
    // El retrollenado de scripts/backfill-hospitality-permissions.ts concede
    // PERMISOS_HOSPITALITY_COMPLETOS. Si una capacidad nueva no estuviera ahí,
    // los roles existentes la perderían en silencio al desplegar.
    for (const capacidad of TODAS_LAS_CAPACIDADES) {
      const definicion = CAPACIDADES_HOSPITALITY[capacidad];
      if (definicion.privilegiada) continue;
      expect(
        PERMISOS_HOSPITALITY_COMPLETOS[definicion.modulo]?.[definicion.accion],
        `${capacidad} (${definicion.modulo}.${definicion.accion}) no está en el conjunto del retrollenado`
      ).toBe(true);
    }
  });

  it('el retrollenado no reparte las capacidades privilegiadas', () => {
    // Este es el corazón del diseño: instalar el certificado de la entidad, ver
    // los documentos sin enmascarar, entrar como huésped y repartir permisos no
    // se conceden "por venir en el lote". Si alguna de estas apareciera en el
    // conjunto completo, cualquier retrollenado la repartiría sin preguntar.
    expect(CAPACIDADES_PRIVILEGIADAS.length).toBeGreaterThanOrEqual(4);
    for (const capacidad of CAPACIDADES_PRIVILEGIADAS) {
      const { modulo, accion } = CAPACIDADES_HOSPITALITY[capacidad];
      expect(
        PERMISOS_HOSPITALITY_COMPLETOS[modulo]?.[accion] ?? false,
        `${capacidad} no puede viajar en el conjunto del retrollenado`
      ).toBe(false);
    }
  });

  it('el conjunto del retrollenado no toca módulos de la plataforma', () => {
    for (const modulo of Object.keys(PERMISOS_HOSPITALITY_COMPLETOS)) {
      expect(modulo.startsWith('hospitality_')).toBe(true);
    }
  });
});

describe('puedeEnHospitality', () => {
  it('concede cuando el rol tiene el permiso', () => {
    const auth = sesion({ hospitality_reservas: { ver: true } });
    expect(puedeEnHospitality(auth, 'reservas.ver')).toBe(true);
  });

  it('deniega cuando el rol tiene el módulo pero no la acción', () => {
    const auth = sesion({ hospitality_reservas: { ver: true } });
    expect(puedeEnHospitality(auth, 'reservas.cancelar')).toBe(false);
    expect(puedeEnHospitality(auth, 'reservas.editar')).toBe(false);
  });

  it('deniega a un rol sin claves de Hospitality', () => {
    const auth = sesion({ leads: { ver: true, crear: true } });
    expect(puedeEnHospitality(auth, 'reservas.ver')).toBe(false);
    expect(puedeEnHospitality(auth, 'finanzas.ver')).toBe(false);
  });

  it('deniega a un usuario sin sesión', () => {
    expect(puedeEnHospitality(sesion(null), 'reservas.ver')).toBe(false);
  });

  it('deniega a un usuario sin rol', () => {
    const auth = { user: { id: 'u1', role: null } as unknown as UserWithRole };
    expect(puedeEnHospitality(auth, 'reservas.ver')).toBe(false);
  });

  it('Superadmin puede todo', () => {
    const auth = sesion({}, 'Superadmin');
    expect(puedeEnHospitality(auth, 'reservas.cancelar')).toBe(true);
    expect(puedeEnHospitality(auth, 'finanzas.exportar')).toBe(true);
  });

  it('el wildcard { all: true } concede todo (shape de bootstrap-admin)', () => {
    const auth = sesion({ all: true });
    expect(puedeEnHospitality(auth, 'integraciones.gestionar')).toBe(true);
    expect(puedeEnHospitality(auth, 'mantenimiento.gestionar')).toBe(true);
  });

  it('una capacidad inexistente nunca concede', () => {
    const auth = sesion({ all: true });
    expect(puedeEnHospitality(auth, 'reservas.inventada' as CapacidadHospitality)).toBe(false);
  });
});

describe('exigirPermisoHospitality', () => {
  it('deja pasar (null) cuando hay permiso', () => {
    const auth = sesion({ hospitality_operaciones: { gestionar: true } });
    expect(exigirPermisoHospitality(auth, 'operaciones.gestionar')).toBeNull();
  });

  it('devuelve 403 y dice qué permiso falta', async () => {
    const auth = sesion({ hospitality_reservas: { ver: true } });
    const respuesta = exigirPermisoHospitality(auth, 'reservas.cancelar');
    expect(respuesta).not.toBeNull();
    expect(respuesta!.status).toBe(403);

    const cuerpo = await respuesta!.json();
    expect(cuerpo.permisoRequerido).toBe('hospitality_reservas.cancelar');
    expect(cuerpo.error).toContain('cancelar reservas');
  });

  it('devuelve 403 también para una capacidad inexistente', () => {
    const auth = sesion({ all: true });
    const respuesta = exigirPermisoHospitality(auth, 'reservas.inventada' as CapacidadHospitality);
    expect(respuesta!.status).toBe(403);
  });
});

describe('capacidad según el caso concreto', () => {
  it('una tarea de limpieza va por operaciones y una incidencia por mantenimiento', () => {
    expect(capacidadDeTarea('cleaning')).toBe('operaciones.gestionar');
    expect(capacidadDeTarea('maintenance')).toBe('mantenimiento.gestionar');
    expect(capacidadDeTarea(undefined)).toBe('operaciones.gestionar');
    expect(capacidadDeLecturaDeTarea('cleaning')).toBe('operaciones.ver');
    expect(capacidadDeLecturaDeTarea('maintenance')).toBe('mantenimiento.ver');
  });

  it('cancelar una reserva exige el permiso de cancelar, no el de editar', () => {
    expect(capacidadDeCambioDeReserva('cancelled', 'confirmed')).toBe('reservas.cancelar');
    expect(capacidadDeCambioDeReserva('confirmed', 'pending')).toBe('reservas.editar');
    expect(capacidadDeCambioDeReserva(undefined, 'confirmed')).toBe('reservas.editar');
    // Volver a mandar la misma cancelación no vuelve a exigir el permiso
    // (la reserva ya está cancelada), pero tampoco abre nada: el endpoint lo
    // rechaza más abajo.
    expect(capacidadDeCambioDeReserva('cancelled', 'cancelled')).toBe('reservas.editar');
  });

  it('un rol que solo corrige reservas no puede cancelarlas', () => {
    const auth = sesion({ hospitality_reservas: { ver: true, editar: true } });
    const soloEditar = capacidadDeCambioDeReserva('confirmed', 'pending');
    expect(exigirPermisoHospitality(auth, soloEditar)).toBeNull();
    expect(exigirPermisoHospitality(auth, capacidadDeCambioDeReserva('cancelled', 'confirmed'))).not.toBeNull();
  });

  it('un rol de limpieza no puede tocar reservas ni dinero', () => {
    const auth = sesion({
      hospitality_operaciones: { ver: true, gestionar: true },
      hospitality_mantenimiento: { ver: true, gestionar: true },
    });
    expect(exigirPermisoHospitality(auth, 'operaciones.gestionar')).toBeNull();
    expect(exigirPermisoHospitality(auth, 'mantenimiento.gestionar')).toBeNull();
    expect(exigirPermisoHospitality(auth, 'reservas.ver')).not.toBeNull();
    expect(exigirPermisoHospitality(auth, 'finanzas.ver')).not.toBeNull();
    expect(exigirPermisoHospitality(auth, 'integraciones.gestionar')).not.toBeNull();
  });
});

describe('retrollenado de los roles que ya existían', () => {
  it('considera cubiertos el wildcard, el Superadmin y lo ya retrollenado', () => {
    expect(rolYaCubierto({ all: true })).toBe(true);
    expect(rolYaCubierto({}, 'Superadmin')).toBe(true);
    expect(rolYaCubierto({ hospitality_reservas: { ver: true } })).toBe(true);
    expect(rolYaCubierto({ leads: { ver: true }, citas: { ver: true } })).toBe(false);
    expect(rolYaCubierto(null)).toBe(false);
  });

  it('no toca lo que el rol ya tenía concedido', () => {
    const original = {
      leads: { ver: true, asignar: false },
      hospitality_reservas: { ver: true },
    };
    const fusionado = conPermisosHospitality(original);

    expect(fusionado.leads).toEqual({ ver: true, asignar: false });
    // Lo que ya estaba concedido no se revoca.
    expect((fusionado.hospitality_reservas as Record<string, boolean>).ver).toBe(true);
    expect(original.hospitality_reservas).toEqual({ ver: true });
    expect(original).not.toBe(fusionado);
  });

  it('deja el rol pudiendo todo lo que la API de Hospitality exige, salvo los privilegios', () => {
    const fusionado = conPermisosHospitality({ leads: { ver: true } });
    const auth = sesion(fusionado);

    for (const capacidad of TODAS_LAS_CAPACIDADES) {
      if (CAPACIDADES_HOSPITALITY[capacidad].privilegiada) continue;
      expect(
        puedeEnHospitality(auth, capacidad),
        `tras el retrollenado, ${capacidad} sigue sin concederse`
      ).toBe(true);
    }

    // Y los privilegios siguen sin concederse: el retrollenado no es una llave
    // maestra, es la forma de no quitarle a nadie lo que ya tenía.
    for (const capacidad of CAPACIDADES_PRIVILEGIADAS) {
      expect(puedeEnHospitality(auth, capacidad)).toBe(false);
    }
  });

  it('un rol sin permisos previos también queda cubierto', () => {
    const fusionado = conPermisosHospitality(null);
    expect(puedeEnHospitality(sesion(fusionado), 'reservas.cancelar')).toBe(true);
    expect(rolYaCubierto(fusionado)).toBe(true);
  });
});
