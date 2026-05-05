import { PrismaClient } from '@prisma/client'
import LRUCache from 'lru-cache'
import { billingLockExtension } from './db/extensions/billing-lock'
import { vaultExtension } from './db/extensions/vault'
// 0. Contexto de base de datos (AsyncLocalStorage)
export interface DbStore {
  tenantId: string;
  vaultSeed?: string;
  client?: any;
}

// Importación condicional para evitar error en bundles del cliente
let _AsyncLocalStorage: any;
if (typeof window === 'undefined') {
  try {
    _AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
  } catch {
    // Fallback silencioso en entornos donde no está disponible
  }
}

export const dbContext: any = _AsyncLocalStorage ? new _AsyncLocalStorage() : {
  run: (_store: any, fn: any) => fn(),
  getStore: () => undefined,
}

/**
 * Helper para ejecutar una función dentro del contexto de un tenant
 */
export async function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const { client, vaultSeed } = await getTenantDb(tenantId);
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
  'systemAlert',
  'trustProtocolLog',
  'aiModuleControl',
  'systemBackup',
  'inAppNotification',
  'customerUser',
  'customerProfile',
  'customerSession',
  'customerOrgMember',
  'customerPrivateDocument',
  'academyUser',
  'academySession',
  'academyAuditLog'
];

// Configuración del objeto global para persistencia en desarrollo (Next.js hot-reload)
const globalForPrisma = globalThis as unknown as {
  prisma_v4: any
  tenantCache: LRUCache<string, any> | undefined
  skillsLayerInitialized?: boolean
}

// 1. Caché de clientes Prisma (Optimizado para desarrollo local)
if (!globalForPrisma.tenantCache) {
  globalForPrisma.tenantCache = new LRUCache<string, any>({
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
  }).$extends(billingLockExtension).$extends(vaultExtension) as any;
};

export const globalPrisma = globalForPrisma.prisma_v4 || createGlobalPrisma();

// Forzar limpieza del cliente global si el esquema ha cambiado (v3)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma_v4 = globalPrisma;
}

// 3. Fábrica Dinámica de Clientes
export async function getTenantDb(tenantId?: string) {
  if (!tenantId) return { client: globalPrisma };

  const currentContext = getCurrentTenantId();
  if (currentContext && currentContext !== tenantId) {
    console.warn(`[db.ts] Tenant mismatch: requested ${tenantId}, using context ${currentContext}`);
  }

  const cachedClient = clientCacheV3.get(tenantId);
  if (cachedClient) return cachedClient;

  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbUrl: true, vaultSeed: true }
  });

  if (!tenant?.dbUrl) {
    return { client: globalPrisma, vaultSeed: tenant?.vaultSeed };
  }

  // Inyectar límite de conexión en la URL de forma segura
  const dbUrl = tenant.dbUrl.includes('?') 
    ? `${tenant.dbUrl}&connection_limit=5` 
    : `${tenant.dbUrl}?connection_limit=5`;

  const tenantClient = new PrismaClient({
    datasources: {
      db: { url: dbUrl }
    }
  }).$extends(billingLockExtension).$extends(vaultExtension) as any;

  const result = { client: tenantClient, vaultSeed: tenant.vaultSeed };
  clientCacheV3.set(tenantId, result);
  return result;
}

let currentTenantId: string | null = null;

export function setCurrentTenantId(tenantId: string): void {
  currentTenantId = tenantId;
}

export function getCurrentTenantId(): string | null {
  const store = dbContext.getStore() as DbStore | undefined;
  if (store?.tenantId) {
    return store.tenantId;
  }
  return currentTenantId;
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
