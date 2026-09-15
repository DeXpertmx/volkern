import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROLES_HOSPITALITY,
  NOMBRES_ROLES_HOSPITALITY,
  MODULOS_HOSPITALITY,
  permisosDeRol,
  permisosTocanHospitality,
  esRolDeCatalogoEnUso,
  type RolHospitalityId,
} from '@/lib/hospitality/roles';
import {
  CAPACIDADES_HOSPITALITY,
  TODAS_LAS_CAPACIDADES,
} from '@/lib/hospitality/capacidades';
import { capacidadesQueHereda, conPrivilegiosHeredados } from '@/lib/hospitality/roles-rollout';
import { capacidadesFaltantes, conLoQueFalta } from '@/lib/hospitality/roles-apply';
import { alcanceDeReservas } from '@/lib/hospitality/permissions';
import { ALL_PERMISSION_MODULES } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/rbac-types';

/**
 * Los roles de Hospitality (§27).
 *
 * Un catálogo de roles es una promesa: «Limpieza no ve documentos», «solo el
 * Anfitrión instala el certificado». Nada de eso lo impide el compilador —son
 * arreglos de strings dentro de un JSON—, así que esta prueba es la que sostiene
 * la promesa. Si alguien añade una capacidad al rol equivocado, aquí se cae.
 *
 * Y la última prueba de todas recorre el código real buscando decisiones por
 * nombre de rol, que es el defecto que este catálogo viene a cerrar: mientras
 * quede una, los nombres que el producto quiere usar —Anfitrión, Agente— no
 * funcionarán, y nadie se enterará hasta que alguien reciba un 403 sin motivo.
 */

const RAIZ = path.resolve(__dirname, '..');

/** Las capacidades que un rol del catálogo concede, como `modulo.accion`. */
function capacidadesDe(id: RolHospitalityId): string[] {
  return Object.entries(permisosDeRol(id)).flatMap(([modulo, acciones]) =>
    Object.keys(acciones)
      .filter((accion) => acciones[accion] === true)
      .map((accion) => `${modulo}.${accion}`)
  );
}

/** ¿El rol del catálogo concede esta capacidad? */
function puede(id: RolHospitalityId, capacidad: keyof typeof CAPACIDADES_HOSPITALITY): boolean {
  const definicion = CAPACIDADES_HOSPITALITY[capacidad];
  return capacidadesDe(id).includes(`${definicion.modulo}.${definicion.accion}`);
}

describe('el catálogo de roles de Hospitality', () => {
  it('son los cinco del vocabulario, con su nombre exacto', () => {
    // Los nombres son el contrato con el producto: el plan maestro y la
    // interfaz los nombran así, y las pruebas de nombres se apoyan en ellos.
    expect(NOMBRES_ROLES_HOSPITALITY).toEqual([
      'Anfitrión',
      'Agente',
      'Mantenimiento',
      'Limpieza',
      'Huésped',
    ]);
  });

  it('cada capacidad existe y apunta a módulos y acciones reales', () => {
    for (const rol of ROLES_HOSPITALITY) {
      for (const capacidad of rol.capacidades) {
        const definicion = CAPACIDADES_HOSPITALITY[capacidad];
        expect(definicion, `${rol.nombre} nombra ${capacidad}, que no existe`).toBeTruthy();
        expect(ALL_PERMISSION_MODULES).toContain(definicion.modulo);
        expect(ALL_PERMISSIONS).toContain(definicion.accion);
      }
    }
  });

  it('lo que se guarda en la base solo usa módulos y acciones conocidos', () => {
    // `permisosDeRol` traduce capacidades a la forma que lee `hasPermisoDeRol`.
    // Si un módulo o una acción se colara mal, el permiso no concedería nada y
    // el rol parecería bien definido sin serlo.
    for (const rol of ROLES_HOSPITALITY) {
      for (const [modulo, acciones] of Object.entries(permisosDeRol(rol.id))) {
        expect(ALL_PERMISSION_MODULES).toContain(modulo);
        for (const accion of Object.keys(acciones)) {
          expect(ALL_PERMISSIONS).toContain(accion);
        }
      }
    }
  });

  it('el Anfitrión lo puede todo: si él no puede, nadie puede concederlo', () => {
    for (const capacidad of TODAS_LAS_CAPACIDADES) {
      // La puerta del huésped no es un privilegio que a alguien le falte: es
      // otra puerta. Dársela al Anfitrión sería un footgun —el día que alguien
      // le retire `reservas.ver`, en lugar de quedarse sin acceso se quedaría
      // viendo solo las reservas del contacto al que esté vinculado, en silencio.
      if (capacidad === 'reservas.propias') continue;
      expect(puede('anfitrion', capacidad), `el Anfitrión no puede ${capacidad}`).toBe(true);
    }
  });

  it('solo el Anfitrión instala el certificado y reparte los roles', () => {
    // Las dos puertas que antes miraban el nombre del rol. Si más de uno las
    // tuviera, el catálogo no estaría distinguiendo nada; si el Anfitrión no las
    // tuviera, se quedaría sin poder firmar ante el Ministerio.
    expect(puede('anfitrion', 'integraciones.administrar')).toBe(true);
    expect(puede('anfitrion', 'roles.gestionar')).toBe(true);

    for (const rol of ROLES_HOSPITALITY) {
      if (rol.id === 'anfitrion') continue;
      expect(puede(rol.id, 'integraciones.administrar'), `${rol.nombre} puede firmar`).toBe(false);
      expect(puede(rol.id, 'roles.gestionar'), `${rol.nombre} reparte permisos`).toBe(false);
    }
  });

  it('el Agente lleva la operación y el dinero, pero no firma ni reparte', () => {
    expect(puede('agente', 'reservas.cancelar')).toBe(true);
    expect(puede('agente', 'operaciones.checkin')).toBe(true);
    expect(puede('agente', 'finanzas.ver')).toBe(true);
    expect(puede('agente', 'integraciones.gestionar')).toBe(true);
    // Lo que no: la identidad del propietario ante el Ministerio y los permisos.
    expect(puede('agente', 'integraciones.administrar')).toBe(false);
    expect(puede('agente', 'viajeros.documento_completo')).toBe(false);
    expect(puede('agente', 'roles.gestionar')).toBe(false);
  });

  it('Limpieza limpia: no entrega llaves, no ve documentos, no ve dinero', () => {
    expect(puede('limpieza', 'operaciones.ver')).toBe(true);
    expect(puede('limpieza', 'operaciones.gestionar')).toBe(true);
    // Las tres cosas que este rol existe para no tener.
    expect(puede('limpieza', 'operaciones.checkin')).toBe(false);
    expect(puede('limpieza', 'reservas.ver')).toBe(false);
    expect(puede('limpieza', 'finanzas.ver')).toBe(false);
  });

  it('Mantenimiento arregla: no entra en reservas, ni en dinero, ni en viajeros', () => {
    expect(puede('mantenimiento', 'mantenimiento.gestionar')).toBe(true);
    expect(puede('mantenimiento', 'operaciones.ver')).toBe(true);
    expect(puede('mantenimiento', 'reservas.ver')).toBe(false);
    expect(puede('mantenimiento', 'finanzas.ver')).toBe(false);
    expect(puede('mantenimiento', 'operaciones.checkin')).toBe(false);
  });

  it('el Huésped no es un rol recortado: es la puerta de al lado', () => {
    // Lo importante de esta prueba: NO tiene `reservas.ver`. Si lo tuviera, dar
    // acceso a un huésped sería abrirle las reservas de toda la cuenta, y el
    // filtro por contacto sería lo único que lo evitara — un filtro que alguien
    // puede olvidar en la siguiente ruta que se escriba.
    expect(puede('huesped', 'reservas.propias')).toBe(true);
    expect(puede('huesped', 'reservas.ver')).toBe(false);
    expect(capacidadesDe('huesped')).toEqual(['hospitality_misreservas.ver']);

    // Y es el único: nadie más del catálogo tiene esa puerta, para que un
    // recorte accidental de `reservas.ver` no degrade a nadie a ver una sola
    // reserva en lugar de ninguna.
    for (const rol of ROLES_HOSPITALITY) {
      if (rol.id === 'huesped') continue;
      expect(puede(rol.id, 'reservas.propias'), `${rol.nombre} tiene la puerta del huésped`).toBe(
        false
      );
    }
  });

  it('ningún rol ve documentos sin enmascarar salvo el Anfitrión', () => {
    const conPrivilegio = ROLES_HOSPITALITY.filter((rol) =>
      puede(rol.id, 'viajeros.documento_completo')
    ).map((rol) => rol.nombre);
    expect(conPrivilegio).toEqual(['Anfitrión']);
  });
});

describe('quién puede cambiar los roles de Hospitality', () => {
  it('el nombre por sí solo no marca un rol: hacen falta sus permisos', () => {
    // «Agente» es una palabra corriente —una correduría de seguros tiene
    // agentes— y bloquear por nombre un rol ajeno al alojamiento sería repetir el
    // error que este trabajo viene a corregir.
    expect(esRolDeCatalogoEnUso('Agente', { leads: { ver: true } })).toBe(false);
    expect(esRolDeCatalogoEnUso('Agente', { hospitality_misreservas: { ver: true } })).toBe(true);
    expect(esRolDeCatalogoEnUso('Comercial', { hospitality_reservas: { ver: true } })).toBe(false);
  });

  it('reconoce Hospitality con el wildcard y en cualquier módulo del módulo', () => {
    expect(permisosTocanHospitality({ all: true })).toBe(true);
    expect(permisosTocanHospitality(null)).toBe(false);
    expect(permisosTocanHospitality({ leads: { ver: true } })).toBe(false);
    for (const modulo of MODULOS_HOSPITALITY) {
      expect(permisosTocanHospitality({ [modulo]: { ver: true } })).toBe(true);
    }
  });
});

describe('el paso que hereda los privilegios que se tenían por nombre', () => {
  it('«Admin» recibe el certificado y los documentos completos', () => {
    const heredadas = capacidadesQueHereda({ hospitality_reservas: { ver: true } }, 'Admin');
    expect(heredadas).toContain('integraciones.administrar');
    expect(heredadas).toContain('viajeros.documento_completo');
  });

  it('un rol con otro nombre no hereda nada por el nombre', () => {
    expect(capacidadesQueHereda({ hospitality_reservas: { ver: true } }, 'Administrador')).toEqual([]);
    expect(capacidadesQueHereda({ hospitality_reservas: { ver: true } }, 'Anfitrión')).toEqual([]);
  });

  it('no escribe nada en Superadmin, que ya pasa cualquier comprobación', () => {
    // Copiarle claves no le daría nada y tocaría el rol más privilegiado de la
    // plataforma sin motivo.
    expect(
      capacidadesQueHereda(
        { equipo: { editar: true }, hospitality_operaciones: { gestionar: true } },
        'Superadmin'
      )
    ).toEqual([]);
  });

  it('quien podía limpiar hereda el check-in, que pedía el mismo permiso', () => {
    expect(capacidadesQueHereda({ hospitality_operaciones: { gestionar: true } })).toContain(
      'operaciones.checkin'
    );
    expect(capacidadesQueHereda({ hospitality_operaciones: { ver: true } })).toEqual([]);
  });

  it('quien editaba el equipo hereda la llave de los roles', () => {
    expect(capacidadesQueHereda({ equipo: { editar: true } })).toContain('roles.gestionar');
    expect(capacidadesQueHereda({ equipo: { eliminar: true } })).toContain('roles.gestionar');
    expect(capacidadesQueHereda({ equipo: { ver: true } })).toEqual([]);
  });

  it('es idempotente: aplicarlo dos veces no cambia nada', () => {
    const primero = conPrivilegiosHeredados({ hospitality_reservas: { ver: true } }, 'Admin');
    expect(capacidadesQueHereda(primero, 'Admin')).toEqual([]);
    expect(conPrivilegiosHeredados(primero, 'Admin')).toEqual(primero);
  });

  it('no retira nada de lo que el rol ya tenía', () => {
    const original = { leads: { ver: true, asignar: false }, hospitality_operaciones: { gestionar: true } };
    const despues = conPrivilegiosHeredados(original, 'Admin');
    expect((despues.leads as Record<string, boolean>).asignar).toBe(false);
    expect((despues.leads as Record<string, boolean>).ver).toBe(true);
    // Y no muta el original.
    expect(original.hospitality_operaciones).toEqual({ gestionar: true });
    expect(despues).not.toBe(original);
  });
});

describe('aplicar el catálogo a un rol que ya existe', () => {
  it('mide lo que falta y no lo que sobra', () => {
    const esperado = permisosDeRol('limpieza');
    expect(capacidadesFaltantes({}, esperado)).toEqual([
      'hospitality_operaciones.ver',
      'hospitality_operaciones.gestionar',
    ]);
    expect(capacidadesFaltantes({ hospitality_operaciones: { ver: true } }, esperado)).toEqual([
      'hospitality_operaciones.gestionar',
    ]);
    expect(capacidadesFaltantes({ hospitality_operaciones: true }, esperado)).toEqual([]);
  });

  it('un rol con el wildcard está al día y no se toca', () => {
    const esperado = permisosDeRol('anfitrion');
    expect(capacidadesFaltantes({ all: true }, esperado)).toEqual([]);
    expect(conLoQueFalta({ all: true }, esperado)).toEqual({ all: true });
  });

  it('añade lo que falta y respeta lo que el Anfitrión agregó a mano', () => {
    const fusionado = conLoQueFalta(
      { hospitality_operaciones: { ver: true, gestionar: true }, mis_modulo: { ver: true } },
      permisosDeRol('limpieza')
    );
    expect((fusionado.mis_modulo as Record<string, boolean>).ver).toBe(true);
    expect((fusionado.hospitality_operaciones as Record<string, boolean>).gestionar).toBe(true);
  });
});

describe('el alcance de las reservas', () => {
  const auth = (permisos: Record<string, unknown>, contactId: string | null = null) =>
    ({ user: { id: 'u1', roleId: 'r1', tenantId: 't1', contactId, role: { id: 'r1', nombre: 'x', permisos } } }) as never;

  it('ver reservas es la cuenta entera', () => {
    expect(alcanceDeReservas(auth({ hospitality_reservas: { ver: true } }))).toEqual({
      tipo: 'tenant',
    });
  });

  it('la puerta del huésped acota a su contacto', () => {
    const alcance = alcanceDeReservas(
      auth({ hospitality_misreservas: { ver: true } }, 'contacto-7')
    );
    expect(alcance).toEqual({ tipo: 'propias', contactId: 'contacto-7' });
  });

  it('un huésped sin vínculo no ve ninguna, y nunca todas', () => {
    // El lado seguro del error: la ausencia de vínculo no puede degradar a "ve
    // las de la cuenta".
    expect(alcanceDeReservas(auth({ hospitality_misreservas: { ver: true } }, null))).toEqual({
      tipo: 'propias',
      contactId: null,
    });
  });

  it('sin ninguna de las dos, nada', () => {
    expect(alcanceDeReservas(auth({ hospitality_finanzas: { ver: true } }))).toEqual({
      tipo: 'ninguno',
    });
    expect(alcanceDeReservas({ user: null } as never)).toEqual({ tipo: 'ninguno' });
  });
});

describe('el nombre del rol ya no decide nada en Hospitality', () => {
  /**
   * Las dos únicas excepciones, y por qué no son el defecto que se persigue.
   */
  const EXCEPCIONES: Record<string, string> = {
    'lib/hospitality/roles-rollout.ts':
      'es el paso que copia una sola vez el privilegio que se tenía por nombre, y después deja de existir para siempre',
    'lib/hospitality/permissions-backfill.ts':
      'salta el rol Superadmin, que pasa cualquier comprobación por su propio bypass en permissions-core',
  };

  function fuentes(dir: string): string[] {
    const absoluto = path.join(RAIZ, dir);
    const encontradas: string[] = [];
    for (const entrada of fs.readdirSync(absoluto, { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) encontradas.push(...fuentes(relativo));
      else if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relativo);
      }
    }
    return encontradas;
  }

  function esComentario(linea: string): boolean {
    const limpia = linea.trim();
    return (
      limpia.startsWith('//') ||
      limpia.startsWith('*') ||
      limpia.startsWith('/*') ||
      limpia.startsWith('*/')
    );
  }

  const PATRONES: { que: string; re: RegExp }[] = [
    { que: 'una comprobación por el nombre «Admin»', re: /['"]Admin['"]/ },
    { que: 'la lista ROLES_CON_DOCUMENTO_COMPLETO', re: /ROLES_CON_DOCUMENTO_COMPLETO/ },
    { que: 'una comparación contra el nombre del rol', re: /role\??\.nombre\s*===/ },
  ];

  it('ninguna ruta ni regla de Hospitality autoriza por nombre de rol', () => {
    const archivos = [...fuentes('lib/hospitality'), ...fuentes('app/api/hospitality')];
    expect(archivos.length).toBeGreaterThan(12);

    const hallazgos: string[] = [];
    for (const archivo of archivos) {
      if (EXCEPCIONES[archivo.replace(/\\/g, '/')]) continue;
      const lineas = fs.readFileSync(path.join(RAIZ, archivo), 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (esComentario(linea)) return;
        for (const patron of PATRONES) {
          if (patron.re.test(linea)) {
            hallazgos.push(`${archivo}:${i + 1} — ${patron.que}`);
          }
        }
      });
    }

    expect(
      hallazgos,
      'El permiso se decide por capacidad, no por el nombre del rol. Mientras quede una de estas, ' +
        'los roles del producto (Anfitrión, Agente, Limpieza...) no funcionarán y nadie se enterará.'
    ).toEqual([]);
  });
});
