import { PrismaClient } from '@prisma/client'
import LRUCache from 'lru-cache'
import { billingLockExtension } from './db/extensions/billing-lock'
import { vaultExtension } from './db/extensions/vault'
import { logger } from './logger'

// ── Tipos ────────────────────────────────────────────────────────────────────
/** Contexto almacenado en AsyncLocalStorage */
export interface DbStore {
  tenantId: string
  vaultSeed?: string
  client?: PrismaClient
  requestId?: string
}

/** Interfaz común entre AsyncLocalStorage y el fallback sin store */
interface DbContextRunner {
  run<T>(store: DbStore, fn: () => T): T
  getStore(): DbStore | undefined
}

// Importación condicional para evitar error en bundles del cliente
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _AsyncLocalStorage: { new <T>(): DbContextRunner } | null = null
if (typeof window === 'undefined') {
  try {
    _AsyncLocalStorage = require('async_hooks').AsyncLocalStorage
  } catch {
    // Fallback silencioso en entornos donde no está disponible
  }
}

export const dbContext: DbContextRunner = _AsyncLocalStorage
  ? new _AsyncLocalStorage()
  : {
      run: (_store, fn) => fn(),
      getStore: () => undefined,
    }

// ─── Proxy para delegar propiedades PrismaClient ────────────
/**
 * Wraps the result of getTenantDb in a Proxy that delegates
 * all PrismaClient property access to `.client`, while still
 * exposing `.vaultSeed` and `.client` for destructuring.
 * This eliminates ~64 type errors where callers use the result
 * directly as a PrismaClient (e.g. `const prisma = await getTenantDb(...)`).
 */
function createTenantProxy(result: CachedTenantClient): PrismaClient & { vaultSeed?: () => string | null | undefined; client: PrismaClient } {
  return new Proxy(result.client, {
    get(target, prop, receiver) {
      if (prop === 'vaultSeed') return result.vaultSeed;
      if (prop === 'client') return result.client;
      if (prop === 'then') return undefined; // not a thenable
      return Reflect.get(target, prop, receiver);
    }
  }) as PrismaClient & { vaultSeed?: () => string | null | undefined; client: PrismaClient };
}

/**
 * Helper para ejecutar una función dentro del contexto de un tenant
 */
export async function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const result = await getTenantDb(tenantId);
  const client = (result as any).client || result;
  const vaultSeed = (result as any).vaultSeed;
  return dbContext.run({ tenantId, vaultSeed, client }, fn);
}

// Modelos que siempre deben consultarse en la Base de Datos Global (Control Plane)
const GLOBAL_MODELS = [
  'tenant',
  'user',
  'account',
  'session',
  'role',
  'platformSettings',
  'subscriptionPlan',
  'apiKey',
  'whitelabelConfig',
  'verificationToken',
  'pageTemplate',
  'pageComponent',
  'auditVault',
  'auditLog',
  'systemAlert',
  'trustProtocolLog',
  'aiModuleControl',
  'systemBackup',
  'inAppNotification',
  'subscription',
  'subscriptionPlan',
  'customerUser',
  'customerProfile',
  'customerSession',
  'customerOrgMember',
  'customerPrivateDocument',
  'academyUser',
  'academySession',
  'academyAuditLog',
  'globalAuditCloud',
  'onboardingProgress'
];

// ── Tipos para el caché de clientes Prisma ──────────────────────────────────
interface CachedTenantClient {
  client: PrismaClient
  vaultSeed?: string | null
}

// Configuración del objeto global para persistencia en desarrollo (Next.js hot-reload)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis as unknown as {
  prisma_v4: PrismaClient
  tenantCache: LRUCache<string, CachedTenantClient> | undefined
  skillsLayerInitialized?: boolean
}

// 1. Caché de clientes Prisma (Optimizado para desarrollo local)
if (!globalForPrisma.tenantCache) {
  globalForPrisma.tenantCache = new LRUCache<string, CachedTenantClient>({
    max: 20, // Reducido para evitar agotar el pool de Postgres local (default 100)
    dispose: (client) => {
      if (client.$disconnect) client.$disconnect().catch(() => {});
    }
  });
}
const clientCacheV3 = globalForPrisma.tenantCache;

// 2. Cliente Global (Control Plane)
const createGlobalPrisma = () => {
  return new PrismaClient({
    log: ['error'],
    // Forzamos un límite bajo para evitar colisiones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $extends chains lose type precision
  }).$extends(billingLockExtension).$extends(vaultExtension) as any
}

export const globalPrisma: PrismaClient = globalForPrisma.prisma_v4 || createGlobalPrisma()

// Forzar limpieza del cliente global si el esquema ha cambiado (v3)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma_v4 = globalPrisma;
}

// 3. Fábrica Dinámica de Clientes
export async function getTenantDb(tenantId?: string) {
  if (!tenantId) return createTenantProxy({ client: globalPrisma, vaultSeed: undefined });

  const currentContext = getCurrentTenantId();
  if (currentContext && currentContext !== tenantId) {
    logger.warn({ requested: tenantId, current: currentContext }, '[db.ts] Tenant mismatch')
  }

  const cachedClient = clientCacheV3.get(tenantId);
  if (cachedClient) return createTenantProxy(cachedClient);

  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbUrl: true, vaultSeed: true }
  });

  if (!tenant?.dbUrl) {
    return createTenantProxy({ client: globalPrisma, vaultSeed: tenant?.vaultSeed });
  }

  // Inyectar límite de conexión en la URL de forma segura
  const dbUrl = tenant.dbUrl.includes('?') 
    ? `${tenant.dbUrl}&connection_limit=5` 
    : `${tenant.dbUrl}?connection_limit=5`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $extends chains lose type precision
  const tenantClient = new PrismaClient({
    datasources: {
      db: { url: dbUrl }
    }
  }).$extends(billingLockExtension).$extends(vaultExtension) as any

  const result: CachedTenantClient = { client: tenantClient, vaultSeed: tenant.vaultSeed }
  clientCacheV3.set(tenantId, result);
  return createTenantProxy(result);
}

let currentTenantId: string | null = null;

export function setCurrentTenantId(tenantId: string): void {
  currentTenantId = tenantId;
}

export function getCurrentTenantId(): string | null {
  const store = dbContext.getStore()
  if (store?.tenantId) {
    return store.tenantId
  }
  return currentTenantId
}

export function clearCurrentTenantId(): void {
  currentTenantId = null;
}

// 3. Proxy de Prisma (Mágico y con Enrutamiento Inteligente)
// Redirige al cliente global para modelos maestros y al del tenant para datos operativos
export const prisma = new Proxy(globalPrisma, {
  get(target, prop, receiver) {
    const store = dbContext.getStore();
    
    // Si la propiedad es un símbolo o prop interna de prisma, usar globalPrisma
    if (typeof prop !== 'string' || prop.startsWith('$') || prop === 'then') {
      return Reflect.get(globalPrisma, prop, receiver);
    }

    // Si la propiedad es un modelo global, forzamos el uso de globalPrisma
    if (GLOBAL_MODELS.includes(prop)) {
      return Reflect.get(globalPrisma, prop, receiver);
    }
    
    // Si tenemos un cliente en el contexto (inyectado por el middleware/auth), lo usamos
    if (store?.client) {
      const clientProp = Reflect.get(store.client, prop, receiver);
      if (clientProp) return clientProp;
    }
    
    // Fallback al cliente global (para scripts, o si no hay contexto)
    return Reflect.get(target, prop, receiver);
  }
})

// Skills Layer initialization - called manually when needed
// Usage: import { initializeSkillsOnDemand } from '@/lib/db';

export async function initializeSkillsOnDemand() {
  // This is now a no-op - call initializeSkillsLayer directly from lib/skills/init if needed
  console.log('[db] Note: Use import { initializeSkillsLayer } from @/lib/skills/init for skills initialization');
}

export default prisma
// v2: Forzado de refresco de esquema para unificación de historial
