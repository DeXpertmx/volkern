import { vi } from 'vitest';
import path from 'node:path';
import dotenv from 'dotenv';
import { webcrypto } from 'node:crypto';

// Los mismos ficheros y el mismo orden que `tests/global-setup.ts`: `.env.local`
// —donde vive el `DATABASE_URL` de desarrollo, git ignorado— antes que `.env`.
// `dotenv/config` solo lee `.env`, que ya no lleva la URL de la base de datos:
// sin esto, cada worker se quedaría sin ella.
for (const archivo of ['.env.local', '.env']) {
  dotenv.config({ path: path.resolve(process.cwd(), archivo), override: false });
}

// Node 18 (entorno vitest 'node') NO expone `crypto` como global — pero
// `hashApiKeyEdge` (Web Crypto) y el sliding-window limiter usan
// `crypto.subtle` / `crypto.randomUUID()`. Polyfill single-point aquí.
if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}


// Mock Next.js headers/cookies
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Map()),
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Mock Next-Auth getServerSession specifically for API route testing
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(async () => null), // Retornar null para que withTenantAuth pase a validar API Key
}));

// Asegurarse de que el entorno sea 'node' para NextRequest
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
