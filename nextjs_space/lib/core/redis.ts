import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Singleton de la conexión principal
let _redisConnection: Redis | null = null;

// Promise singleton para evitar race conditions al verificar disponibilidad
let _availabilityCheck: Promise<boolean> | null = null;

/**
 * Verifica si Redis está disponible (una sola vez, con Promise singleton).
 */
export function checkRedisAvailability(): Promise<boolean> {
  if (_availabilityCheck) return _availabilityCheck;

  _availabilityCheck = new Promise<boolean>((resolve) => {
    const probe = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null, // No reintentar
    });

    // Registrar el listener ANTES de conectar para evitar "Unhandled error event"
    probe.on('error', () => {});

    probe.connect()
      .then(() => probe.ping())
      .then(async () => {
        await probe.quit().catch(() => {});
        console.log('✅ [Redis] Disponible — activando colas de marketing.');
        resolve(true);
      })
      .catch(async () => {
        await probe.quit().catch(() => {});
        console.warn('⚠️  [Redis] No disponible. Colas de marketing desactivadas.');
        console.warn('     Para activarlas: docker run -p 6379:6379 redis:alpine');
        resolve(false);
      });
  });

  return _availabilityCheck;
}

/**
 * Inicializa la conexión Redis principal (singleton, async-safe).
 * Devuelve null si Redis no está disponible.
 */
export async function initRedis(): Promise<Redis | null> {
  if (_redisConnection) return _redisConnection;

  const available = await checkRedisAvailability();
  if (!available) return null;

  _redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Requerido por BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });

  _redisConnection.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return;
    console.error('[Redis] Error:', err);
  });

  return _redisConnection;
}

/**
 * Devuelve la conexión Redis si ya fue inicializada, o null.
 */
export function getRedisConnection(): Redis | null {
  return _redisConnection;
}
