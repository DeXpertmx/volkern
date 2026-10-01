import { describe, it, expect } from 'vitest';
import { HUBS } from '@/lib/navigation-config';
import {
  esSuperadminEfectivo,
  hubEsVisible,
  itemEsVisible,
  type VisibilityContext,
} from '@/lib/navigation-visibility';

/**
 * Reglas de visibilidad del menú.
 *
 * Caso real (29 sep 2026): en admin se apagó el Feature «Agencia» al tenant
 * demo y, al entrar con «Inyectar Sesión», seguía apareciendo todo lo de
 * agencia: el hub completo en el menú global y la entrada «Agencia» dentro de
 * Configuración. La sesión es la del Superadmin (rol Superadmin y su tenant de
 * plataforma es AGENCY), así que el filtro por tipo de cuenta daba por buenos
 * los items de agencia del tenant suplantado, que es BUSINESS.
 *
 * Estas pruebas fijan las dos direcciones:
 *
 *   · Suplantando un tenant BUSINESS → nada de agencia, y los módulos apagados
 *     en admin no aparecen ni en el menú ni en Configuración.
 *   · Superadmin sin suplantar → sigue viendo su control plane y agencia.
 */

const configHub = HUBS.find((h) => h.id === 'configuracion')!;
const agenciaHub = HUBS.find((h) => h.id === 'agencia')!;
const contabilidadHub = HUBS.find((h) => h.id === 'contabilidad')!;
const ventasHub = HUBS.find((h) => h.id === 'ventas')!;

function itemDeConfiguracion(name: string) {
  const item = configHub.items.find((i) => i.name === name);
  if (!item) throw new Error(`Item de Configuración no encontrado: ${name}`);
  return item;
}

/** Contexto base = tenant BUSINESS normal, sin suplantación. */
function ctx(over: Partial<VisibilityContext> = {}): VisibilityContext {
  return {
    accountType: 'BUSINESS',
    roleName: 'Admin',
    activeModules: ['configuracion'],
    isLoadingModules: false,
    isImpersonating: false,
    country: 'ES',
    permissions: null,
    ...over,
  };
}

// ─── El escape de Superadmin ────────────────────────────────────────────────

describe('esSuperadminEfectivo', () => {
  it('sin suplantación, un Superadmin es Superadmin', () => {
    expect(esSuperadminEfectivo(ctx({ roleName: 'Superadmin' }))).toBe(true);
  });

  it('con suplantación activa, el Superadmin ve el menú del tenant suplantado', () => {
    expect(
      esSuperadminEfectivo(ctx({ roleName: 'Superadmin', isImpersonating: true }))
    ).toBe(false);
  });
});

// ─── Agencia apagada en admin ───────────────────────────────────────────────

describe('Feature «Agencia» apagado (tenant BUSINESS suplantado)', () => {
  const suplantando = ctx({
    roleName: 'Superadmin',
    isImpersonating: true,
    accountType: 'BUSINESS',
    activeModules: ['configuracion', 'leads', 'real-estate'],
  });

  it('el hub de Agencia no se muestra, ni siquiera con el módulo activo', () => {
    expect(hubEsVisible(agenciaHub, suplantando)).toBe(false);
    // Aunque el módulo siga activo (plan legacy), un BUSINESS no ve el hub.
    expect(
      hubEsVisible(agenciaHub, { ...suplantando, activeModules: [...suplantando.activeModules, 'agency'] })
    ).toBe(false);
  });

  it('la entrada «Agencia» de Configuración no se muestra', () => {
    expect(itemEsVisible(itemDeConfiguracion('Agencia'), suplantando)).toBe(false);
  });

  it('un Superadmin sin suplantar sí ve agencia', () => {
    const superadmin = ctx({
      roleName: 'Superadmin',
      accountType: 'AGENCY',
      activeModules: ['configuracion', 'agency'],
    });
    expect(hubEsVisible(agenciaHub, superadmin)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Agencia'), superadmin)).toBe(true);
  });

  it('la entrada «Contabilidad» tampoco (requiere vertical contable)', () => {
    expect(itemEsVisible(itemDeConfiguracion('Contabilidad'), suplantando)).toBe(false);
  });

  it('una cuenta AGENCY de verdad sigue viendo su hub', () => {
    const agencia = ctx({ accountType: 'AGENCY', activeModules: ['configuracion', 'agency'] });
    expect(hubEsVisible(agenciaHub, agencia)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Agencia'), agencia)).toBe(true);
  });

  it('el hub de Agencia desaparece si el módulo agency está apagado', () => {
    // Cuenta de agencia sin el módulo: apagar el Feature quita el hub.
    const agencia = ctx({ accountType: 'AGENCY', activeModules: ['configuracion'] });
    expect(hubEsVisible(agenciaHub, agencia)).toBe(false);
  });
});

// ─── Superadmin dentro de un tenant que no es agencia ───────────────────────

describe('Superadmin en un tenant BUSINESS (caso JUAN ANTONIO MORENO FERNANDEZ)', () => {
  // Rol Superadmin en su propio tenant BUSINESS, sin suplantación: era el
  // agujero del 30 sep 2026 — el escape de Superadmin le abría los hubs de
  // Agencia y Contabilidad aunque la cuenta no fuera ni agencia ni despacho.
  const juanAntonio = ctx({
    roleName: 'Superadmin',
    accountType: 'BUSINESS',
    plan: 'esencial',
    // El plan trae el módulo «agency», y aun así nada debe verse.
    activeModules: ['configuracion', 'agency'],
  });

  it('el hub de Agencia no se muestra aunque el rol sea Superadmin', () => {
    expect(hubEsVisible(agenciaHub, juanAntonio)).toBe(false);
  });

  it('el hub de Contabilidad tampoco', () => {
    expect(hubEsVisible(contabilidadHub, juanAntonio)).toBe(false);
  });

  it('las entradas de Configuración tampoco se muestran', () => {
    expect(itemEsVisible(itemDeConfiguracion('Agencia'), juanAntonio)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Contabilidad'), juanAntonio)).toBe(false);
  });
});

// ─── Verticales: agencia de marketing vs despacho contable ─────────────────

describe('Verticales de las cuentas AGENCY', () => {
  it('una agencia de marketing (pro-agency) ve su hub y no el de Contabilidad', () => {
    const agencia = ctx({
      accountType: 'AGENCY',
      plan: 'pro-agency',
      activeModules: ['configuracion', 'agency'],
    });
    expect(hubEsVisible(agenciaHub, agencia)).toBe(true);
    expect(hubEsVisible(contabilidadHub, agencia)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Contabilidad'), agencia)).toBe(false);
  });

  it('un despacho contable (pro-accounting) ve Contabilidad y no Agencia', () => {
    const despacho = ctx({
      accountType: 'AGENCY',
      plan: 'pro-accounting',
      activeModules: ['configuracion', 'agency'],
    });
    expect(hubEsVisible(contabilidadHub, despacho)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Contabilidad'), despacho)).toBe(true);
    expect(hubEsVisible(agenciaHub, despacho)).toBe(false);
  });

  it('la cuenta de plataforma (sin plan de vertical) ve los dos', () => {
    const plataforma = ctx({
      roleName: 'Superadmin',
      accountType: 'AGENCY',
      plan: 'enterprise',
      activeModules: ['configuracion', 'agency'],
    });
    expect(hubEsVisible(agenciaHub, plataforma)).toBe(true);
    expect(hubEsVisible(contabilidadHub, plataforma)).toBe(true);
  });
});

// ─── Configuración sigue a los módulos del tenant ───────────────────────────

describe('Configuración: cada entrada sigue a su módulo', () => {
  const SIN_MODULOS = ctx({ activeModules: ['configuracion', 'leads'] });
  const CON_MODULOS = ctx({
    activeModules: [
      'configuracion',
      'leads',
      'telefonia',
      'contratos',
      'chatbot_whatsapp',
      'compliance_pro',
    ],
  });

  const ligadasAModulo: Array<[string, string]> = [
    ['Telefonía', 'telefonia'],
    ['Documentos', 'contratos'],
    ['Firma Digital', 'contratos'],
    ['Reparto Leads', 'leads'],
    ['Campos de Leads', 'leads'],
    ['WhatsApp del Negocio', 'chatbot_whatsapp'],
    ['Canal de Igualdad', 'compliance_pro'],
    ['Compliance ⚡', 'compliance_pro'],
    ['Agencia', 'agency'],
  ];

  it('cada entrada ligada a un módulo declara su planModule', () => {
    for (const [nombre, modulo] of ligadasAModulo) {
      expect(itemDeConfiguracion(nombre).planModule, `${nombre} debe depender de ${modulo}`).toBe(modulo);
    }
  });

  it('con el módulo apagado la entrada no aparece', () => {
    expect(itemEsVisible(itemDeConfiguracion('Telefonía'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Documentos'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Firma Digital'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('WhatsApp del Negocio'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Canal de Igualdad'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Compliance ⚡'), SIN_MODULOS)).toBe(false);
    expect(itemEsVisible(itemDeConfiguracion('Agencia'), SIN_MODULOS)).toBe(false);
  });

  it('con el módulo activo la entrada vuelve', () => {
    expect(itemEsVisible(itemDeConfiguracion('Telefonía'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Documentos'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Firma Digital'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Reparto Leads'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Campos de Leads'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('WhatsApp del Negocio'), CON_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Canal de Igualdad'), CON_MODULOS)).toBe(true);
  });

  it('las entradas transversales (Empresa, Horarios, Módulos) siguen siempre', () => {
    expect(itemEsVisible(itemDeConfiguracion('Empresa'), SIN_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Horarios'), SIN_MODULOS)).toBe(true);
    expect(itemEsVisible(itemDeConfiguracion('Módulos'), SIN_MODULOS)).toBe(true);
  });

  it('mientras cargan los módulos no se esconde nada por planModule', () => {
    const cargando = ctx({ activeModules: [], isLoadingModules: true });
    expect(itemEsVisible(itemDeConfiguracion('Telefonía'), cargando)).toBe(true);
    expect(hubEsVisible(ventasHub, cargando)).toBe(true);
  });
});

// ─── Regiones y permisos ────────────────────────────────────────────────────

describe('Región y permisos', () => {
  it('un item de México no aparece en un tenant español y sí en uno mexicano', () => {
    const mx = HUBS.flatMap((h) => h.items).find((i) => i.requiredRegion === 'MX')!;
    expect(itemEsVisible(mx, ctx({ country: 'ES' }))).toBe(false);
    expect(itemEsVisible(mx, ctx({ country: 'MX' }))).toBe(true);
  });

  it('un permiso de rol con ver=false esconde el item', () => {
    const empresa = itemDeConfiguracion('Empresa');
    expect(itemEsVisible(empresa, ctx({ permissions: {} }))).toBe(true);
    if (empresa.module) {
      expect(itemEsVisible(empresa, ctx({ permissions: { [empresa.module]: { ver: false } } }))).toBe(false);
    }
  });
});
