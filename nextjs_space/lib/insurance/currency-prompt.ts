/**
 * CurrencyMenu — fuente única del menú numerado de monedas del alta de cuentas.
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
 * Qué NO es: este módulo ya no sabe nada de divisas. La lista, los nombres, los
 * símbolos y las notas viven en `lib/moneda.ts` —el único archivo de la
 * plataforma que puede nombrar una divisa— y aquí solo se le pone número y
 * forma de menú. Antes declaraba dos tablas `Record<Currency, …>` con los doce
 * códigos repetidos, que es exactamente la duplicación que la guardia de dinero
 * existe para impedir.
 *
 * Decisión de diseño : el menú NO hace I/O ni side effects. Solo devuelve
 * la lista + helpers (renderOptions, parseAnswer). El caller decide si
 * persiste (script → BD, UI → state del formulario).
 */
import {
  CATALOGO_MONEDAS,
  chipMoneda,
  etiquetaMoneda,
  MONEDA_MINIMA_ESQUEMA,
  type Currency,
} from '@/lib/moneda';

export interface CurrencyMenuOption {
  /** Código ISO 4217 de la moneda. */
  code: Currency;
  /** Número del menú (1..N). Estable según el orden del catálogo. */
  index: number;
  /** Etiqueta humana con formato `EUR — Euro (€)` para máxima claridad. */
  label: string;
  /** Nota explicativa específica para esa moneda. Vacío si no hay. */
  nota: string;
}

/** Tamaño del menú. Se usa para validar el número que teclea el usuario. */
const TOTAL_MONEDAS = CATALOGO_MONEDAS.length;

/**
 * Devuelve la lista canónica de opciones del menú (1..N) en el mismo orden
 * que `MONEDAS_SOPORTADAS` (que es el orden que el script CLI usa).
 *
 * Caller: tanto el seed CLI (para renderizar el menu en consola) como el
 * componente UI (para poblar el `<Select>` con los mismos items).
 */
export function getCurrencyMenuOptions(): CurrencyMenuOption[] {
  return CATALOGO_MONEDAS.map((moneda, i) => ({
    code: moneda.codigo,
    index: i + 1,
    label: etiquetaMoneda(moneda.codigo),
    nota: moneda.nota,
  }));
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

  // Acepta número 1..N del menú
  const asNumber = Number(upper);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= TOTAL_MONEDAS) {
    return { code: CATALOGO_MONEDAS[asNumber - 1].codigo, source: 'number' };
  }

  // Acepta código directo
  const porCodigo = CATALOGO_MONEDAS.find((m) => m.codigo === upper);
  if (porCodigo) {
    return { code: porCodigo.codigo, source: 'code' };
  }

  return { code: MONEDA_MINIMA_ESQUEMA, source: 'invalid' };
}

/**
 * Devuelve una etiqueta corta (`EUR`, `USD`, ...) con el símbolo delante.
 * Para usar en chips del UI y en los toast del wizard.
 *
 *   currencyChip('EUR') → '€ · EUR'
 *   currencyChip('MXN') → '$ · MXN'
 */
export function currencyChip(code: Currency): string {
  return chipMoneda(code);
}

/** Comentario para la CLI: imprime el menú numerado bonito en stderr. */
export function printCurrencyMenuToConsole(stderrWrite: (line: string) => void): void {
  stderrWrite('');
  stderrWrite('  Opciones:');
  for (const opt of getCurrencyMenuOptions()) {
    const sufijo = opt.nota ? `  ${opt.nota}` : '';
    stderrWrite(`    ${opt.index}. ${opt.code.padEnd(4)} ${opt.label}${sufijo}`);
  }
}
