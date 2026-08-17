// Resolución de placeholders dinámicos en cláusulas y condiciones de pago.
// Las plantillas de contrato pueden contener tokens como {{cliente.nombre}},
// {{empresa.rfc}} o {{fecha.inicio}} que se rellenan con los datos reales del
// contrato y del tenant al generar el PDF o al renderizar el portal de firma.

export const PLACEHOLDER_GROUPS = [
  {
    group: 'cliente',
    label: 'Cliente',
    fields: [
      { token: '{{cliente.nombre}}', desc: 'Nombre del cliente' },
      { token: '{{cliente.empresa}}', desc: 'Empresa del cliente' },
      { token: '{{cliente.email}}', desc: 'Email del cliente' },
      { token: '{{cliente.telefono}}', desc: 'Teléfono del cliente' },
      { token: '{{cliente.rfc}}', desc: 'NIF/CIF del cliente' },
      { token: '{{cliente.direccion}}', desc: 'Dirección del cliente' },
    ],
  },
  {
    group: 'empresa',
    label: 'Empresa (tenant)',
    fields: [
      { token: '{{empresa.nombre}}', desc: 'Razón social o nombre' },
      { token: '{{empresa.rfc}}', desc: 'NIF/CIF del tenant' },
      { token: '{{empresa.direccion}}', desc: 'Dirección fiscal del tenant' },
    ],
  },
  {
    group: 'contrato',
    label: 'Contrato',
    fields: [
      { token: '{{contrato.numero}}', desc: 'Número de contrato' },
      { token: '{{contrato.titulo}}', desc: 'Título del contrato' },
      { token: '{{fecha.inicio}}', desc: 'Fecha de inicio' },
      { token: '{{fecha.fin}}', desc: 'Fecha de fin' },
      { token: '{{fecha.hoy}}', desc: 'Fecha de hoy' },
    ],
  },
  {
    group: 'totales',
    label: 'Totales',
    fields: [
      { token: '{{totales.subtotal}}', desc: 'Subtotal' },
      { token: '{{totales.descuento}}', desc: 'Descuento' },
      { token: '{{totales.impuestos}}', desc: 'Impuestos (IVA)' },
      { token: '{{totales.total}}', desc: 'Total' },
    ],
  },
] as const;

export interface PlaceholderContext {
  clienteNombre?: string | null;
  clienteEmpresa?: string | null;
  clienteEmail?: string | null;
  clienteTelefono?: string | null;
  clienteRfc?: string | null;
  clienteDireccion?: string | null;
  numero?: string | null;
  titulo?: string | null;
  fechaInicio?: Date | string | null;
  fechaFin?: Date | string | null;
  moneda?: string | null;
  subtotal?: number | null;
  descuentoMonto?: number | null;
  impuestos?: number | null;
  total?: number | null;
}

export interface TenantContext {
  nombre?: string | null;
  razonSocial?: string | null;
  nifCif?: string | null;
  rfc?: string | null;
  direccionFiscal?: string | null;
}

const SYMBOLS: Record<string, string> = { MXN: '$', USD: '$', EUR: '€' };

export function formatCurrency(amount: number, currency?: string | null): string {
  const symbol = SYMBOLS[currency || ''] || '$';
  return `${symbol}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function formatFecha(value?: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Reemplaza los placeholders {{...}} conocidos en un texto (cláusulas,
 * condiciones de pago, descripciones) con los datos reales del contrato
 * y del tenant. Los tokens desconocidos se dejan intactos.
 */
export function resolvePlaceholders(
  text: string | null | undefined,
  contrato?: PlaceholderContext | null,
  tenant?: TenantContext | null
): string {
  if (!text) return text || '';
  const c = contrato || {};
  const t = tenant || {};

  const nombreEmpresa = t.razonSocial || t.nombre || '';
  const rfcEmpresa = t.nifCif || t.rfc || '';

  const values: Record<string, string> = {
    // Cliente (aliases lead.* → cliente.* por compatibilidad con templates GrapesJS)
    '{{cliente.nombre}}': c.clienteNombre || '',
    '{{lead.nombre}}': c.clienteNombre || '',
    '{{cliente.empresa}}': c.clienteEmpresa || '',
    '{{lead.empresa}}': c.clienteEmpresa || '',
    '{{cliente.email}}': c.clienteEmail || '',
    '{{lead.email}}': c.clienteEmail || '',
    '{{cliente.telefono}}': c.clienteTelefono || '',
    '{{lead.telefono}}': c.clienteTelefono || '',
    '{{cliente.rfc}}': c.clienteRfc || '',
    '{{cliente.direccion}}': c.clienteDireccion || '',
    // Empresa
    '{{empresa.nombre}}': nombreEmpresa,
    '{{empresa.rfc}}': rfcEmpresa,
    '{{empresa.direccion}}': t.direccionFiscal || '',
    // Contrato
    '{{contrato.numero}}': c.numero || '',
    '{{contrato.titulo}}': c.titulo || '',
    '{{fecha.inicio}}': formatFecha(c.fechaInicio),
    '{{fecha.fin}}': formatFecha(c.fechaFin),
    '{{fecha.hoy}}': formatFecha(new Date()),
    // Totales
    '{{totales.subtotal}}': formatCurrency(c.subtotal ?? 0, c.moneda),
    '{{totales.descuento}}': formatCurrency(c.descuentoMonto ?? 0, c.moneda),
    '{{totales.impuestos}}': formatCurrency(c.impuestos ?? 0, c.moneda),
    '{{totales.total}}': formatCurrency(c.total ?? 0, c.moneda),
  };

  let out = text;
  for (const [token, value] of Object.entries(values)) {
    out = out.split(token).join(value);
  }
  return out;
}

/** Devuelve true si el texto contiene algún placeholder conocido. */
export function hasPlaceholders(text: string | null | undefined): boolean {
  if (!text) return false;
  return /{{[a-zA-Z.]+}}/.test(text);
}
