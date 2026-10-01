import { describe, it, expect } from 'vitest';

/**
 * El catálogo básico de roles por tenant: tres perfiles estándar (Admin,
 * Miembro, Solo lectura) para que una cuenta nueva no dependa de un único
 * rol Admin. Lo que fija este test:
 *   - las definiciones existen y son distintas entre sí;
 *   - el Admin del catálogo administra el equipo (equipo.invitar) — el
 *     defecto de las cuentas con la clave legada usuarios.*;
 *   - la aplicación es idempotente y aditiva: nunca retira lo que el admin
 *     de la cuenta ya ajustó a mano;
 *   - "Miembro" ve el equipo pero no lo gestiona, y "Solo lectura" no tiene
 *     ninguna acción de escritura.
 */
import {
  ROLES_BASICOS_POR_NOMBRE,
  esNombreDeRolBasico,
  llavesFaltantesDelCatalogo,
  conCatalogoAplicado,
} from '@/lib/roles-basicos';

describe('definiciones del catálogo', () => {
  it('existen los tres roles y son distinguibles', () => {
    expect(Object.keys(ROLES_BASICOS_POR_NOMBRE).sort()).toEqual([
      'Admin',
      'Miembro',
      'Solo lectura',
    ]);
  });

  it('Admin del catálogo administra el equipo, incluida la llave de roles', () => {
    const admin = ROLES_BASICOS_POR_NOMBRE['Admin'];
    expect(admin.permisos.equipo).toMatchObject({
      ver: true,
      invitar: true,
      editar: true,
      eliminar: true,
      roles: true,
    });
    // Y conserva la clave legada para las puertas que aún la leen.
    expect(admin.permisos.usuarios).toMatchObject({ ver: true, crear: true });
  });

  it('Miembro ve el equipo pero no lo gestiona', () => {
    const miembro = ROLES_BASICOS_POR_NOMBRE['Miembro'];
    expect(miembro.permisos.equipo).toEqual({ ver: true });
    // Trabaja con el día a día
    expect(miembro.permisos.leads).toMatchObject({ crear: true, editar: true });
  });

  it('Solo lectura solo ve, en todos los módulos que toca', () => {
    const lectura = ROLES_BASICOS_POR_NOMBRE['Solo lectura'];
    for (const [modulo, acciones] of Object.entries(lectura.permisos)) {
      for (const [accion, valor] of Object.entries(acciones)) {
        if (valor) expect(accion, `${modulo}.${accion}`).toBe('ver');
      }
    }
  });
});

describe('esNombreDeRolBasico', () => {
  it('reconoce los nombres del catálogo y rechaza otros', () => {
    expect(esNombreDeRolBasico('Admin')).toBe(true);
    expect(esNombreDeRolBasico('Miembro')).toBe(true);
    expect(esNombreDeRolBasico('Solo lectura')).toBe(true);
    expect(esNombreDeRolBasico('Superadmin')).toBe(false);
    expect(esNombreDeRolBasico('Anfitrión')).toBe(false);
    expect(esNombreDeRolBasico(null)).toBe(false);
    // Cuidado con hasOwnProperty y el prototipo
    expect(esNombreDeRolBasico('toString')).toBe(false);
    expect(esNombreDeRolBasico('constructor')).toBe(false);
  });
});

describe('llavesFaltantesDelCatalogo', () => {
  it('un Admin legado (usuarios.*) debe recibir las llaves modernas de equipo', () => {
    // La forma real de las primeras cuentas.
    const faltantes = llavesFaltantesDelCatalogo('Admin', {
      usuarios: { ver: true, crear: true, editar: true, eliminar: true },
      leads: { ver: true, crear: true, editar: true, eliminar: true },
    });

    expect(faltantes.equipo).toMatchObject({
      ver: true,
      invitar: true,
      editar: true,
      eliminar: true,
      roles: true,
    });
    expect(faltantes.configuracion).toBeTruthy();
  });

  it('un rol que ya cumple el catálogo no recibe nada', () => {
    const admin = ROLES_BASICOS_POR_NOMBRE['Admin'];
    expect(llavesFaltantesDelCatalogo('Admin', admin.permisos)).toEqual({});
  });

  it('el wildcard all:true cuenta como tenerlo todo', () => {
    expect(llavesFaltantesDelCatalogo('Admin', { all: true })).toEqual({});
  });

  it('módulo concedido entero (modulo: true) cuenta como sus acciones', () => {
    const faltantes = llavesFaltantesDelCatalogo('Miembro', { leads: true });
    expect(faltantes.leads).toBeUndefined();
  });
});

describe('conCatalogoAplicado', () => {
  it('añade lo faltante sin tocar lo que el admin ya ajustó', () => {
    const despues = conCatalogoAplicado('Admin', {
      usuarios: { ver: true, crear: true, editar: true, eliminar: true },
      leads: { ver: true, eliminar: false }, // decisión a mano: no puede crear
      configuracion: { ver: true },
    });

    // Lo que ya estaba, intacto (incluidos los false deliberados).
    expect(despues.usuarios).toEqual({ ver: true, crear: true, editar: true, eliminar: true });
    expect(despues.leads).toEqual({ ver: true, eliminar: false, crear: true, editar: true });
    // Lo nuevo, añadido.
    expect(despues.equipo).toMatchObject({ ver: true, invitar: true });
  });

  it('es idempotente: aplicarlo dos veces no cambia nada', () => {
    const una = conCatalogoAplicado('Admin', { usuarios: { ver: true } });
    const dos = conCatalogoAplicado('Admin', una);
    expect(dos).toEqual(una);
  });

  it('no muta el objeto de entrada', () => {
    const antes = { usuarios: { ver: true } };
    conCatalogoAplicado('Admin', antes);
    expect(antes).toEqual({ usuarios: { ver: true } });
  });

  it('con permisos corruptos o vacíos devuelve la definición completa', () => {
    const admin = ROLES_BASICOS_POR_NOMBRE['Admin'];
    expect(conCatalogoAplicado('Admin', null)).toEqual(admin.permisos);
    expect(conCatalogoAplicado('Admin', 'basura')).toEqual(admin.permisos);
  });
});
