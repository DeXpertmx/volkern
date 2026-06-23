/**
 * Volkern Partner API — per-scope rate limit configuration.
 *
 * Edge-safe (sin Node-only deps — `lib/api-keys.ts:hashApiKey` usa
 * `crypto.createHash` de Node y NO es importable desde middleware.ts).
 *
 * Fuente única de verdad para:
 *   - Política por scope (N req / windowMs / fail-policy)
 *   - Hash determinista edge-safe del apiKey
 *   - Derivación del scope desde el pathname + método
 *
 * Regla de oro: una sola fuente de verdad para los tunable de rate-limit.
 * Si necesitas ajustar un límite (ej: subir payroll:run ante un Restaurantero
 * con muchos empleados), edita ÚNICAMENTE `PARTNER_RATE_LIMITS`.
 */

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

/**
 * Scopes de Rate-Limit derivados del endpoint Volkern Partner.
 * NO confundir con `AVAILABLE_SCOPES` en `lib/api-keys.ts` — esos son los
 * scopes OAuth que el SaaS externo envía; estos son buckets de rate-limit
 * internos (más granulares / sintéticos si hace falta).
 */
export type PartnerRateScope =
  | "payroll:run" // POST /api/v1/partner/payroll/run — operación mensual pesada.
  | "payroll:read" // GET /api/v1/partner/payroll/[runId]/{receipts,aeat-status} — lecturas.
  | "attendance:write" // POST /api/v1/partner/attendance/punch
  | "attendance:read" // (reservado) GET /api/v1/partner/attendance/*
  | "employees:write" // POST/PUT /api/v1/partner/employees (upsert)
  | "employees:read" // GET /api/v1/partner/employees
  | "default"; // catch-all para rutas Partner no clasificadas.

export interface RateLimitPolicy {
  /** Máximo de requests permitidos en la ventana. */
  limit: number;
  /** Tamaño de la ventana en ms. Default: 60_000 (60s). */
  windowMs: number;
  /**
   * Si true → ante Upstash unreachable (timeout / 5xx) devuelvo 429.
   * Si false → fallback fail-open, dejo pasar la request.
   * Decisión de producto: payroll:run debe ser fail-CLOSED por protección
   * de SLA durante rollout (un Restaurantero con bug en su integración
   * no debe ser capaz de agotar capacidad AEAT); el resto fail-OPEN por UX.
   */
  failClosed: boolean;
}

/* ─── Tabla de políticas (single source of truth) ───────────────────────────── */

export const PARTNER_RATE_LIMITS: Record<PartnerRateScope, RateLimitPolicy> = {
  "payroll:run": { limit: 10, windowMs: 60_000, failClosed: true },
  "payroll:read": { limit: 60, windowMs: 60_000, failClosed: false },
  "attendance:write": { limit: 300, windowMs: 60_000, failClosed: false },
  "attendance:read": { limit: 120, windowMs: 60_000, failClosed: false },
  "employees:write": { limit: 30, windowMs: 60_000, failClosed: false },
  "employees:read": { limit: 120, windowMs: 60_000, failClosed: false },
  default: { limit: 60, windowMs: 60_000, failClosed: false },
};

/** Timeout para la request Upstash REST. */
export const UPSTASH_FETCH_TIMEOUT_MS = 300;

/* ─── Scope → Pathname derivation ───────────────────────────────────────────── */

/**
 * Devuelve el scope de rate-limit para una (pathname, method) del Partner API.
 * El order importa: payroll/run debe chequearse ANTES que payroll/* (genérico).
 */
export function getScopeFromPath(
  pathname: string,
  method: string,
): PartnerRateScope {
  const m = method.toUpperCase();

  // Payroll: run tiene su propia bucket (fail-closed).
  // Anchor ESTRICTO al pathname completo. Si en futuro se añade
  // /api/v1/partner/payroll/[runId]/<algo>/run (quizá recibos de un run pasado)
  // NO queremos que matchee payroll:run (con fail-CLOSED); debería ser
  // payroll:read (60/min, fail-open). Strict equality >= endsWith para evitar
  // falsos positivos futuros.
  if (pathname === "/api/v1/partner/payroll/run") {
    return "payroll:run";
  }
  // Payroll: lecturas (receipts, aeat-status).
  if (pathname.includes("/payroll/")) {
    return "payroll:read";
  }

  // Attendance: punch es write; resto (futuro) read on GET.
  if (pathname.includes("/attendance/punch")) {
    return "attendance:write";
  }
  if (pathname.includes("/attendance")) {
    return m === "GET" ? "attendance:read" : "attendance:write";
  }

  // Employees: POST/PATCH/PUT → write; GET → read.
  if (pathname.includes("/employees")) {
    return m === "GET" ? "employees:read" : "employees:write";
  }

  return "default";
}

/* ─── Edge-safe SHA-256 ─────────────────────────────────────────────────────── */

/**
 * Deriva un `apiKeyId` determinista del apiKey crudo usando Web Crypto API
 * (soportada en Vercel Edge Runtime).
 *
 * Por qué NO importar `hashApiKey` de `lib/api-keys.ts`:
 *   - usa `crypto.createHash` (Node-only) → ReferenceError en Edge Runtime.
 *
 * Por qué hashear (no usar apiKey crudo):
 *   - PII: el apiKey (vk_live_*) nunca debe aparecer en logs de Redis ni
 *     en headers `X-RateLimit-*`.
 *   - Determinismo: el mismo apiKey siempre produce el mismo apiKeyId
 *     (Sliding Window necesita persistencia entre requests).
 *
 * Por qué `substring(0, 16)` (64 bits):
 *   - Suficiente para ~10^19 buckets únicos sin colisión significativa entre
 *     50 Restauranteros SaaS + sus N apiKeys rotacionales.
 *   - Mantiene logs Upstash compactos.
 *
 * El salt es requerido en producción — sin él un attacker con acceso a
 * Redis logs podría invertir el apiKey vía rainbow tables (SHA-256 sin salt
 * es crackable para apiKeys de longitud conocida).
 */
export async function hashApiKeyEdge(apiKey: string): Promise<string> {
  const salt = process.env.UPSTASH_SALT || "volkern_partner_default_salt";
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey + "_" + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.substring(0, 16);
}

/* ─── Extraction ────────────────────────────────────────────────────────────── */

/**
 * Extrae el apiKey crudo de un NextRequest (Bearer o x-api-key header).
 * Devuelve null si no hay key. NO hashea.
 *
 * Compatible con `extractApiKeyFromRequest` que ya existe en `lib/api-keys.ts`
 * pero ese usa `validateApiKeyFormat` que requiere DB. Esta función es
 * pre-auth: sólo queremos el string para hashear en el middleware edge.
 */
export function extractApiKeyFromHeaders(headers: Headers): string | null {
  // Header explícito tiene prioridad.
  const xApiKey = headers.get("x-api-key")?.trim();
  if (xApiKey) return xApiKey;

  // Authorization: Bearer vk_live_xxx.
  const auth = headers.get("authorization")?.trim() ?? "";
  // Split tolerante a mayúsculas/minúsculas y espacios múltiples ("Bearer  vk_...").
  const [scheme = "", ...rest] = auth.split(/\s+/);
  if (scheme.toLowerCase() === "bearer" && rest.length > 0) {
    return rest.join(" ").trim() || null;
  }

  return null;
}
