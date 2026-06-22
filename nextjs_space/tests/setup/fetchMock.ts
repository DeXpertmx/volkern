/**
 * Fetch mock centralizado para tests de Partner API.
 *
 * El patrón `vi.stubGlobal("fetch", fetchMock)` DEBE ejecutarse una sola vez
 * al inicio del module graph — si se llama `vi.unstubAllGlobals()` en un
 * afterEach posterior, el stub se pierde y los tests subsiguientes intentan
 * llamar al `fetch` real (que falla con DNS error → el try/catch de
 * upstash-edge-rate-limit.ts lo traga → aserciones enmascaradas).
 *
 * Por eso centralizamos el stub AQUÍ, y los archivos de test solo importan
 * `fetchMock` y llaman `fetchMock.mockReset()` en sus respectivos beforeEach.
 */

import { vi } from "vitest";

export const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
