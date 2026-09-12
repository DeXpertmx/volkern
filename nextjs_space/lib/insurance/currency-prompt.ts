/**
 * CurrencyMenu — fuente única del menú numerado de monedas.
 *
 * Compartido por:
 *   • `scripts/seed-partner-tenants.ts` (CLI con readline en TTY).
 *   • `app/admin/partner-onboarding/page.tsx` (UI form del superadmin).
 *
 * Por qué existe: antes había dos implementaciones divergentes del menú
 * (CLI en el seed, y dropdown UI en ConfiguracionDashboard). Cualquier
 * cambio (añadir moneda, cambiar nota explicativa) tenía que sincronizarse
 * a mano. Centralizando la lista + las notas humanas + la lógica
 * "1..N o código válido", un único cambio afecta ambos frontend.
 *
 * Decisión de diseño : el menú NO hace I/O ni side effects. Solo devuelve
 * la lista + helpers (renderOptions, parseAnswer). El caller decide si
 * persiste (script → BD, UI → state del formulario).
 */
import { MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';
import { SUPPORTED_CURRENCIES, type Currency } from './currency';

export interface CurrencyMenuOption {
  /** Código ISO 4217 de la moneda (e.g. 'EUR'). */
  code: Currency;
  /** Número del menú (1..N). Estable según el orden de SUPPORTED_CURRENCIES. */
  index: number;
  /** Etiqueta humana con formato `EUR — Euro (€)` para máxima claridad. */
  label: string;
  /** Nota explicativa específica para esa moneda. Vacío si no hay. */
  nota: string;
}

/** Tabla de notas explicativas, alineadas con el script CLI existente. */
const NOTAS_POR_MONEDA: Record<Currency, string> = {
  USD: 'Recomendado para brokers estadounidenses',
  EUR: 'Recomendado para brokers europeos',
  MXN: 'Default conservador — solo si operas principalmente en México',
  GBP: 'Recomendado para brokers británicos',
  JPY: 'Yen japonés',
  CNY: 'Yuan chino (RMB)',
  CAD: 'Dólar canadiense',
  BRL: 'Real brasileño',
  CLP: 'Peso chileno',
  ARS: 'Peso argentino (alta volatilidad)',
  COP: 'Peso colombiano',
  PEN: 'Sol peruano',
};

/** Tabla de nombres completos + símbolos (para el label humano). */
const NOMBRES_POR_MONEDA: Record<Currency, { nombre: string; simbolo: string }> = {
  USD: { nombre: 'Dólar estadounidense', simbolo: '$' },
  EUR: { nombre: 'Euro',                 simbolo: '€' },
  MXN: { nombre: 'Peso mexicano',        simbolo: '$' },
  GBP: { nombre: 'Libra esterlina',      simbolo: '£' },
  JPY: { nombre: 'Yen japonés',          simbolo: '¥' },
  CNY: { nombre: 'Yuan chino',           simbolo: '¥' },
  CAD: { nombre: 'Dólar canadiense',     simbolo: '$' },
  BRL: { nombre: 'Real brasileño',       simbolo: 'R$' },
  CLP: { nombre: 'Peso chileno',         simbolo: '$' },
  ARS: { nombre: 'Peso argentino',       simbolo: '$' },
  COP: { nombre: 'Peso colombiano',      simbolo: '$' },
  PEN: { nombre: 'Sol peruano',          simbolo: 'S/' },
};

/**
 * Devuelve la lista canónica de opciones del menú (1..N) en el mismo orden
 * que `SUPPORTED_CURRENCIES` (que es el orden que el script CLI usa).
 *
 * Caller: tanto el seed CLI (para renderizar el menu en consola) como el
 * componente UI (para poblar el `<Select>` con los mismos items).
 */
export function getCurrencyMenuOptions(): CurrencyMenuOption[] {
  return SUPPORTED_CURRENCIES.map((code, i) => {
    const meta = NOMBRES_POR_MONEDA[code] ?? { nombre: code, simbolo: '' };
    return {
      code,
      index: i + 1,
      label: `${code} — ${meta.nombre} (${meta.simbolo})`,
      nota: NOTAS_POR_MONEDA[code] ?? '',
    };
  });
}

/**
 * Parsea la respuesta del usuario (CLI prompt o equivalente UI).
 * Acepta: número (1..N), código ('USD'/'EUR'/...), o vacío (default MXN).
 *
 * Devuelve `{ code, source }` donde `source` indica qué camino
 * tomó la decisión: 'number', 'code', 'default', o 'invalid'.
 *
 * NO escribe ni side-effect; el caller decide qué hacer cuando
 * source='invalid' (re-prompt, error toast, etc).
 */
export type CurrencyPromptSource = 'number' | 'code' | 'default' | 'invalid';

export interface CurrencyPromptResult {
  code: Currency;
  source: CurrencyPromptSource;
}

export function parseCurrencyAnswer(raw: string): CurrencyPromptResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { code: MONEDA_MINIMA_ESQUEMA, source: 'default' };
  }
  const upper = trimmed.toUpperCase();

  // Acepta número 1..12
  const asNumber = Number(upper);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= SUPPORTED_CURRENCIES.length) {
    return { code: SUPPORTED_CURRENCIES[asNumber - 1], source: 'number' };
  }

  // Acepta código directo
  if ((SUPPORTED_CURRENCIES as readonly string[]).includes(upper)) {
    return { code: upper as Currency, source: 'code' };
  }

  return { code: MONEDA_MINIMA_ESQUEMA, source: 'invalid' };
}

/**
 * Devuelve una etiqueta corta (`EUR`, `USD`, ...) con emoji de fuente.
 * Para usar en chips del UI y de los toast del wizard.
 *
 *   currencyChip('EUR') → '€ · EUR'
 *   currencyChip('MXN') → '$ · MXN'
 */
export function currencyChip(code: Currency): string {
  const meta = NOMBRES_POR_MONEDA[code];
  const simbolo = meta?.simbolo ?? '';
  return simbolo ? `${simbolo} · ${code}` : code;
}

/** Comentario para la CLI: imprenta el menú numerado bonito en stderr. */
export function printCurrencyMenuToConsole(stderrWrite: (line: string) => void): void {
  stderrWrite('');
  stderrWrite('  Opciones:');
  for (const opt of getCurrencyMenuOptions()) {
    const sufijo = opt.nota ? `  ${opt.nota}` : '';
    stderrWrite(`    ${opt.index}. ${opt.code.padEnd(4)} ${opt.label}${sufijo}`);
  }
}
