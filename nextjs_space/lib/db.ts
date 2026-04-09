import { PrismaClient } from '@prisma/client'
import LRUCache from 'lru-cache'
// 0. Contexto de base de datos (AsyncLocalStorage)
export interface DbStore {
  tenantId: string;
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
  const client = await getTenantDb(tenantId);
  return dbContext.run({ tenantId, client }, fn);
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
  'pageComponent'
];

// Configuración del caché de clientes Prisma
const clientCache = new LRUCache<string, any>({
  max: 100,
  dispose: (client) => {
    client.$disconnect().catch(() => {});
  }
})

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  skillsLayerInitialized?: boolean
}

// 1. Cliente Global (Control Plane)
export const globalPrisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = globalPrisma

// 2. Fábrica Dinámica de Clientes
export async function getTenantDb(tenantId: string) {
  if (!tenantId) return globalPrisma;

  const cachedClient = clientCache.get(tenantId);
  if (cachedClient) return cachedClient;

  // Los metadatos del tenant siempre se buscan en la global
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbUrl: true, slug: true }
  });

  if (!tenant?.dbUrl) {
    return globalPrisma;
  }

  const tenantClient = new PrismaClient({
    datasources: {
      db: {
        url: tenant.dbUrl
      }
    }
  });

  clientCache.set(tenantId, tenantClient);
  return tenantClient;
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
      return Reflect.get(store.client, prop, receiver);
    }
    
    // Fallback al cliente global (para scripts, o si no hay contexto)
    // ADVERTENCIA: En producción, casi siempre deberíamos tener un contexto
    return Reflect.get(target, prop, receiver);
  }
})

// Inicializar Skills Layer
if (typeof window === 'undefined' && !globalForPrisma.skillsLayerInitialized) {
  import('./skills/init').then(({ initializeSkillsLayer }) => {
    initializeSkillsLayer();
    globalForPrisma.skillsLayerInitialized = true;
  }).catch(err => {
    console.error('[db.ts] Error inicializando Skills Layer:', err);
  });
}

export default prisma
