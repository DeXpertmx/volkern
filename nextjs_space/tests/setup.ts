import { vi } from 'vitest';
import 'dotenv/config';


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
