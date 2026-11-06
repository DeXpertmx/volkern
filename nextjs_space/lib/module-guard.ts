import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from './auth'
import { prisma } from './db'
import { resolveHierarchicalContext } from './api-key-auth'
import { resolverModulosTenant } from './tenant-modules'
import { HUBS } from './navigation-config'
import {
  esSuperadminEfectivo,
  hubDeRuta,
  hubEsVisible,
  type VisibilityContext,
} from './navigation-visibility'
import { paisDeMoneda } from './moneda'

/**
 * Guardia de servidor para los hubs del menú.
 *
 * Caso real (29 sep 2026): el menú escondía las pantallas de Agencia y
 * Contabilidad según el tipo de cuenta y los módulos, pero la URL directa las
 * seguía abriendo. Oculta en el menú no es lo mismo que prohibida: con la
 * feature apagada (o un tenant que no es agencia) bastaba escribir
 * `/dashboard/agencia` para entrar a la pantalla, aunque las APIs de dentro
 * respondieran 403.
 *
 * La comprobación es la MISMA función que decide el menú (`hubEsVisible`), con
 * el mismo contexto: si la guardia y el menú no evaluaran igual, habría enlaces
 * que llevan a una redirección o pantallas escondidas pero alcanzables. Y el
 * contexto se resuelve sobre el tenant ACTIVO (el suplantado, si un Superadmin
 * entró con «Inyectar Sesión»), porque la sesión trae su propio rol y su propio
 * `accountType`.
 *
 * Este módulo es de servidor: usa `next/headers` y `redirect`.
 */

/** Cookie donde el panel de admin guarda el tenant suplantado. */
export const COOKIE_SUPLANTACION = 'volkern_impersonate_id'

export interface TenantActivo {
  userId: string
  email: string
  /** Rol de la sesión (`Superadmin` es el de la plataforma). */
  roleName: string | null
  /** Tenant activo: el suplantado si hay suplantación. */
  tenant: {
    id: string
    nombre: string
    slug: string
    subdomain: string | null
    plan: string
    accountType: string | null
    moneda: string | null
  }
  /** `true` cuando un Superadmin está viendo otro tenant. */
  isImpersonating: boolean
  /** Módulos activos del tenant activo, con las mismas reglas que la API. */
  modulos: string[]
}

export type ResultadoTenantActivo =
  | { ok: true; activo: TenantActivo }
  | { ok: false; motivo: 'sin-sesion' | 'sin-tenant' | 'suplantacion-invalida' }

/**
 * Resuelve quién está mirando y sobre qué tenant, con la misma regla de
 * jerarquía que las rutas de API.
 */
export async function tenantActivo(): Promise<ResultadoTenantActivo> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false, motivo: 'sin-sesion' }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: { select: { id: true, nombre: true } },
      tenant: {
        select: {
          id: true, nombre: true, slug: true, subdomain: true,
          plan: true, accountType: true, moneda: true,
        },
      },
    },
  })

  if (!user?.tenant) return { ok: false, motivo: 'sin-tenant' }

  let suplantadoId: string | null = null
  try {
    // Next 15+ entrega `cookies()` como promesa: sin el await, `.get` no existe
    // y la suplantación se perdía en silencio (el catch se la tragaba).
    const cookieStore = await cookies()
    suplantadoId = cookieStore.get(COOKIE_SUPLANTACION)?.value || null
  } catch {
    // Fuera de una petición no hay cookies: se sigue con el tenant propio.
  }

  const contexto = await resolveHierarchicalContext(
    { id: user.id, email: user.email, role: user.role },
    user.tenant,
    suplantadoId
  )
  if (contexto.error) return { ok: false, motivo: 'suplantacion-invalida' }

  // Se relee el tenant activo para tener los mismos campos que usa la API
  // (`enabledModules` sobre todo): el contexto de jerarquía no los trae.
  const activo = await prisma.tenant.findUnique({
    where: { id: contexto.activeTenantId },
    select: {
      id: true, nombre: true, slug: true, subdomain: true,
      plan: true, enabledModules: true, accountType: true, moneda: true,
    },
  })
  if (!activo) return { ok: false, motivo: 'sin-tenant' }

  const tenantFeatures = await prisma.tenantFeature.findMany({
    where: { tenantId: activo.id },
    select: { feature: true, habilitado: true },
  })
  const modulos = await resolverModulosTenant(activo, tenantFeatures)

  return {
    ok: true,
    activo: {
      userId: user.id,
      email: user.email,
      roleName: user.role?.nombre ?? null,
      tenant: {
        id: activo.id,
        nombre: activo.nombre,
        slug: activo.slug,
        subdomain: activo.subdomain,
        plan: activo.plan,
        accountType: activo.accountType,
        moneda: activo.moneda,
      },
      isImpersonating: activo.id !== user.tenant.id,
      modulos,
    },
  }
}

/** Contexto de visibilidad equivalente al que arma el menú en el navegador. */
export function visibilidadDelActivo(activo: TenantActivo): VisibilityContext {
  return {
    accountType: activo.tenant.accountType,
    roleName: activo.roleName,
    activeModules: activo.modulos,
    isLoadingModules: false,
    isImpersonating: activo.isImpersonating,
    country: paisDeMoneda(activo.tenant.moneda) ?? 'ES',
    plan: activo.tenant.plan,
    permissions: null,
  }
}

/**
 * Corta la petición si el hub no está disponible para el tenant activo.
 *
 * Pensada para los `layout.tsx` de servidor de una sección: cubre la carpeta
 * entera, también sus subrutas.
 *
 * @returns el contexto activo, por si la página necesita algo más.
 */
export async function exigirHub(idHub: string): Promise<TenantActivo> {
  const hub = HUBS.find((h) => h.id === idHub)
  return comprobarHub(hub)
}

/**
 * Guardia por ruta: resuelve a qué hub pertenece el pathname y aplica la misma
 * regla que el menú.
 *
 * Se usa en el layout raíz del panel, que es el primer componente que se
 * renderiza: así el corte ocurre antes de enviar el armazón y la respuesta es
 * un 307 de verdad. Con la guardia solo en el layout de la sección, el armazón
 * del panel ya se ha enviado en streaming y la redirección viaja dentro del
 * payload en lugar de en la cabecera.
 *
 * Una ruta que no pertenece a ningún hub (el panel de inicio, por ejemplo) no
 * se toca. Un Superadmin sin suplantar tampoco: su tenant de plataforma puede
 * no tener los módulos de negocio y no debe quedarse fuera de su propio panel.
 */
export async function exigirHubDeRuta(pathname: string): Promise<void> {
  const hub = hubDeRuta(pathname)
  if (!hub) return

  const resultado = await tenantActivo()
  if (!resultado.ok) {
    redirect(resultado.motivo === 'sin-sesion' ? '/auth/login' : '/dashboard')
  }

  const contexto = visibilidadDelActivo(resultado.activo)
  if (esSuperadminEfectivo(contexto)) return

  if (!hubEsVisible(hub, contexto)) redirect('/dashboard')
}

/** Comprueba un hub concreto (o corta si no existe) y devuelve el tenant activo. */
async function comprobarHub(hub: (typeof HUBS)[number] | undefined): Promise<TenantActivo> {
  const resultado = await tenantActivo()

  if (!resultado.ok) {
    // Sin sesión, al login; con una suplantación inválida o sin tenant, al
    // panel propio (no hay nada que enseñar aquí).
    redirect(resultado.motivo === 'sin-sesion' ? '/auth/login' : '/dashboard')
  }

  if (!hub) redirect('/dashboard')

  if (!hubEsVisible(hub, visibilidadDelActivo(resultado.activo))) {
    redirect('/dashboard')
  }

  return resultado.activo
}
