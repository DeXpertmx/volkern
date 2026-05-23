import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear una Factura/Invoice
 */
export const InvoiceCreateSchema = z.object({
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  dealId: CommonSchemas.id.optional().nullable(),
  numero: z.string().min(1, 'Número de factura requerido').max(50),
  fechaEmision: CommonSchemas.fechaISO,
  fechaVencimiento: z.string().datetime().optional().nullable(),
  subtotal: CommonSchemas.montoPositivo,
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  descuentoMonto: z.coerce.number().min(0).default(0),
  impuestos: z.coerce.number().min(0).default(0),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  estado: z.enum(['borrador', 'emitida', 'pagada', 'anulada', 'vencida']).default('borrador'),
  metodoPago: z.enum(['transferencia', 'tarjeta', 'efectivo', 'domiciliacion', 'paypal', 'stripe']).optional(),
  terminosPago: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  items: z.array(z.object({
    concepto: z.string().min(1, 'Concepto requerido').max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(0.01, 'Cantidad debe ser mayor a 0'),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    impuestos: z.coerce.number().min(0).default(0),
    total: CommonSchemas.montoPositivo,
    orden: z.coerce.number().int().min(1).default(1),
    tasaImpuestoId: CommonSchemas.id.optional().nullable(),
    catalogoItemId: CommonSchemas.id.optional().nullable(),
  })).min(1, 'Al menos un item requerido').max(200, 'Máximo 200 items'),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  clienteTelefono: z.string().max(30).optional().nullable(),
  clienteEmpresa: z.string().max(255).optional().nullable(),
  clienteRfc: z.string().max(20).optional().nullable(),
  clienteDireccion: z.string().max(500).optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
});

export type InvoiceCreateInput = z.infer<typeof InvoiceCreateSchema>;

/**
 * Schema para actualizar una Factura
 */
export const InvoiceUpdateSchema = z.object({
  estado: z.enum(['borrador', 'emitida', 'pagada', 'anulada', 'vencida']).optional(),
  metodoPago: z.string().max(50).optional(),
  fechaPago: z.string().datetime().optional().nullable(),
  referenciaPago: z.string().max(255).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
});

/**
 * Schema para crear una Cotización
 */
export const CotizacionCreateSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  subtotal: CommonSchemas.montoPositivo,
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  descuentoMonto: z.coerce.number().min(0).default(0),
  impuestos: z.coerce.number().min(0).default(0),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  validezDias: z.coerce.number().int().min(1).max(365).default(30),
  terminosPago: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(0.01),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    impuestos: z.coerce.number().min(0).default(0),
    total: CommonSchemas.montoPositivo,
    orden: z.coerce.number().int().min(1).default(1),
    tasaImpuestoId: CommonSchemas.id.optional().nullable(),
  })).min(1, 'Al menos un item requerido').max(200, 'Máximo 200 items'),
});

export type CotizacionCreateInput = z.infer<typeof CotizacionCreateSchema>;

/**
 * Schema para crear una Orden de Venta
 */
export const OrdenVentaCreateSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  cotizacionId: CommonSchemas.id.optional().nullable(),
  contratoId: CommonSchemas.id.optional().nullable(),
  numero: z.string().max(50).optional(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  estado: z.enum(['pendiente', 'en_proceso', 'completada', 'cancelada']).default('pendiente'),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  notas: z.string().max(5000).optional().nullable(),
});

export type OrdenVentaCreateInput = z.infer<typeof OrdenVentaCreateSchema>;

/**
 * Schema para crear un Contrato
 */
export const ContratoCreateSchema = z.object({
  contactId: CommonSchemas.id,
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  cotizacionId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).default('servicio'),
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(1),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    porcentajeImpuesto: z.coerce.number().min(0).default(0),
  })).optional().default([]),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).optional(),
  descuentoMonto: z.coerce.number().min(0).optional(),
  tasaIva: z.coerce.number().min(0).max(100).optional(),
  incluyeIva: z.boolean().optional(),
  moneda: CommonSchemas.moneda,
  metodoPago: z.string().max(50).optional().nullable(),
  condicionesPago: z.string().max(500).optional().nullable(),
  frecuenciaPago: z.enum(['mensual', 'trimestral', 'anual', 'unico']).optional().nullable(),
  diaPago: z.coerce.number().int().min(1).max(31).optional().nullable(),
  clausulas: z.string().max(10000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
});

export type ContratoCreateInput = z.infer<typeof ContratoCreateSchema>;

/**
 * Schema para actualizar una Cotización (cambio de estado/firma)
 */
export const CotizacionUpdateSchema = z.object({
  estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']).optional(),
  firmadoPorCliente: z.boolean().optional(),
  ipFirma: z.string().max(45).optional().nullable(),
});

/**
 * Schema para enviar cotización por email
 */
export const CotizacionSendSchema = z.object({
  email: z.string().email('Email inválido'),
  mensaje: z.string().max(5000).optional().nullable(),
});

/**
 * Schema para actualizar un Contrato
 */
export const ContratoUpdateSchema = z.object({
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    nombre: z.string().max(500).optional(),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(1),
    precioUnitario: z.coerce.number().min(0),
    descuento: z.coerce.number().min(0).optional().default(0),
    impuestos: z.coerce.number().min(0).optional().default(0),
    categoria: z.string().max(100).optional(),
    sku: z.string().max(100).optional(),
  })).optional(),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).optional(),
  descuentoMonto: z.coerce.number().min(0).optional(),
  incluyeIva: z.boolean().optional(),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).optional(),
  titulo: z.string().max(500).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  estado: z.string().max(50).optional(),
  notasInternas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  condicionesPago: z.string().max(500).optional().nullable(),
  moneda: CommonSchemas.moneda.optional(),
});

/**
 * Schema para enviar contrato por email
 */
export const ContratoSendSchema = z.object({
  email: z.string().email('Email inválido'),
  mensaje: z.string().max(5000).optional().nullable(),
});

/**
 * Schema para crear contrato desde cotización (root endpoint, cotizacionId en body)
 */
export const ContratoFromCotizacionRootSchema = z.object({
  cotizacionId: z.string().min(1, 'cotizacionId es requerido'),
  tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).optional().default('servicio'),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  metodoPago: z.string().max(50).optional().nullable(),
  condicionesPago: z.string().max(500).optional().nullable(),
  frecuenciaPago: z.enum(['mensual', 'trimestral', 'anual', 'unico']).optional().nullable(),
  diaPago: z.coerce.number().int().min(1).max(31).optional().nullable(),
  clausulas: z.string().max(10000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  ajustarPrecios: z.boolean().optional().default(false),
});

/**
 * Schema para crear contrato desde cotización (sub-endpoint, cotizacionId en URL)
 */
export const ContratoFromCotizacionSchema = z.object({
  titulo: z.string().max(500).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).optional(),
  condicionesPago: z.string().max(500).optional().nullable(),
  clausulas: z.string().max(10000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  clienteRfc: z.string().max(20).optional().nullable(),
  clienteDireccion: z.string().max(500).optional().nullable(),
});

/**
 * Schema para firmar contrato (empresa)
 */
export const ContratoSignSchema = z.object({
  operatorNote: z.string().max(2000).optional().nullable(),
});

/**
 * Schema para firmar contrato (cliente público)
 */
export const ContratoPublicSignSchema = z.object({
  nombreFirma: z.string().min(1, 'Nombre de firma requerido').max(255),
});

/**
 * Schema para actualizar una Orden de Venta
 */
export const OrdenVentaUpdateSchema = z.object({
  estado: z.enum(['borrador', 'confirmada', 'pendiente_finanzas', 'facturada', 'entregada', 'cancelada']).optional(),
  fechaEntrega: z.string().datetime().optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  condicionesVenta: z.string().max(500).optional().nullable(),
  referenciaCliente: z.string().max(255).optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
  descuentoGlobal: z.coerce.number().min(0).optional(),
  tipoDescuento: z.enum(['porcentaje', 'monto_fijo']).optional(),
  redondeoLinea: z.boolean().optional(),
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(0.01),
    precioUnitario: z.coerce.number().min(0),
    descuento: z.coerce.number().min(0).optional().default(0),
    porcentajeImpuesto: z.coerce.number().min(0).optional().default(0),
    porcentajeRetencion: z.coerce.number().min(0).optional().default(0),
    aplicaRetencion: z.boolean().optional(),
    tasaImpuestoId: CommonSchemas.id.optional().nullable(),
    unidad: z.string().max(50).optional(),
  })).optional(),
});

/**
 * Schema para facturar una Orden de Venta
 * (sin body requerido)
 */
export const OrdenVentaFacturarSchema = z.object({}).optional();

// ──────────────────────────────────────────────
// Configuración Fiscal - Perfiles de Cliente
// ──────────────────────────────────────────────

/**
 * Schema para crear un Perfil Fiscal de Cliente
 */
export const PerfilFiscalCreateSchema = z.object({
  leadId: z.string().optional(),
  contactId: z.string().optional(),
  razonSocial: z.string().max(255).optional(),
  pais: z.string().min(1, 'País requerido'),
  tipoIdFiscal: z.string().min(1, 'Tipo ID fiscal requerido'),
  idFiscal: z.string().min(1, 'ID fiscal requerido'),
  regimenFiscal: z.string().max(100).optional(),
  idIntracomunitario: z.string().max(50).optional(),
  direccionFiscal: z.string().max(500).optional(),
  ciudadFiscal: z.string().max(255).optional(),
  estadoFiscal: z.string().max(255).optional(),
  codigoPostalFiscal: z.string().max(20).optional(),
  exentoImpuestos: z.boolean().optional().default(false),
  motivoExencion: z.string().max(500).optional(),
  aplicaRetencion: z.boolean().optional().default(false),
}).refine(
  (data) => !(data.leadId && data.contactId),
  { message: 'Solo se puede especificar leadId o contactId, no ambos', path: ['leadId'] }
).refine(
  (data) => data.leadId || data.contactId,
  { message: 'Se requiere leadId o contactId', path: ['leadId'] }
);

/**
 * Schema para actualizar un Perfil Fiscal de Cliente
 */
export const PerfilFiscalUpdateSchema = z.object({
  razonSocial: z.string().max(255).optional(),
  pais: z.string().min(1).optional(),
  tipoIdFiscal: z.string().min(1).optional(),
  idFiscal: z.string().min(1).optional(),
  regimenFiscal: z.string().max(100).optional(),
  idIntracomunitario: z.string().max(50).optional(),
  direccionFiscal: z.string().max(500).optional(),
  ciudadFiscal: z.string().max(255).optional(),
  estadoFiscal: z.string().max(255).optional(),
  codigoPostalFiscal: z.string().max(20).optional(),
  exentoImpuestos: z.boolean().optional(),
  motivoExencion: z.string().max(500).optional(),
  aplicaRetencion: z.boolean().optional(),
});

// ──────────────────────────────────────────────
// Configuración Fiscal - Tasas de Impuesto
// ──────────────────────────────────────────────

/**
 * Schema para crear una Tasa de Impuesto
 */
export const TasaImpuestoCreateSchema = z.object({
  pais: z.string().min(1, 'País requerido'),
  estado: z.string().max(100).optional(),
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  codigo: z.string().min(1, 'Código requerido').max(50),
  porcentaje: z.coerce.number().min(0).max(100),
  tipo: z.enum(['iva', 'retencion', 'impuesto_especial', 'otro']).optional().default('iva'),
  aplicaRetencion: z.boolean().optional().default(false),
  porcentajeRetencion: z.coerce.number().min(0).max(100).optional().nullable(),
  inversionSujetoPasivo: z.boolean().optional().default(false),
  descripcionRegla: z.string().max(500).optional(),
  fechaInicioVigencia: z.string().datetime().optional(),
  fechaFinVigencia: z.string().datetime().optional().nullable(),
});

/**
 * Schema para actualizar una Tasa de Impuesto
 */
export const TasaImpuestoUpdateSchema = z.object({
  nombre: z.string().max(255).optional(),
  porcentaje: z.coerce.number().min(0).max(100).optional(),
  tipo: z.enum(['iva', 'retencion', 'impuesto_especial', 'otro']).optional(),
  aplicaRetencion: z.boolean().optional(),
  porcentajeRetencion: z.coerce.number().min(0).max(100).optional().nullable(),
  inversionSujetoPasivo: z.boolean().optional(),
  descripcionRegla: z.string().max(500).optional(),
  fechaFinVigencia: z.string().datetime().optional().nullable(),
  activo: z.boolean().optional(),
});

/**
 * Schema para inicializar tasas predeterminadas
 */
export const TasaImpuestoInitSchema = z.object({
  pais: z.string().min(1, 'País requerido'),
});

// ──────────────────────────────────────────────
// Configuración Fiscal - Emisores
// ──────────────────────────────────────────────

/**
 * Schema para crear un Emisor fiscal
 */
export const EmisorCreateSchema = z.object({
  razonSocial: z.string().min(1, 'Razón social requerida').max(255),
  nombreComercial: z.string().max(255).optional(),
  pais: z.string().min(1, 'País requerido'),
  tipoIdFiscal: z.string().min(1, 'Tipo ID fiscal requerido'),
  idFiscal: z.string().min(1, 'ID fiscal requerido'),
  regimenFiscal: z.string().max(100).optional(),
  direccion: z.string().min(1, 'Dirección requerida').max(500),
  ciudad: z.string().min(1, 'Ciudad requerida').max(255),
  estadoProvincia: z.string().max(255).optional(),
  codigoPostal: z.string().min(1, 'Código postal requerido').max(20),
  telefono: z.string().max(30).optional(),
  email: z.string().email('Email inválido'),
  sitioWeb: z.string().url().optional().nullable(),
  monedaPredeterminada: z.string().length(3).optional().default('EUR'),
  serieFactura: z.string().max(10).optional().default('F'),
  logoUrl: z.string().url().optional().nullable(),
  colorPrimario: z.string().max(7).optional(),
  siguienteNumero: z.coerce.number().int().min(0).optional(),
  esPrincipal: z.boolean().optional().default(false),
  verifactuEnabled: z.boolean().optional().default(false),
});

/**
 * Schema para actualizar un Emisor fiscal
 */
export const EmisorUpdateSchema = z.object({
  razonSocial: z.string().max(255).optional(),
  nombreComercial: z.string().max(255).optional(),
  pais: z.string().min(1).optional(),
  tipoIdFiscal: z.string().min(1).optional(),
  idFiscal: z.string().min(1).optional(),
  regimenFiscal: z.string().max(100).optional(),
  direccion: z.string().max(500).optional(),
  ciudad: z.string().max(255).optional(),
  estadoProvincia: z.string().max(255).optional(),
  codigoPostal: z.string().max(20).optional(),
  telefono: z.string().max(30).optional(),
  email: z.string().email().optional(),
  sitioWeb: z.string().url().optional().nullable(),
  monedaPredeterminada: z.string().length(3).optional(),
  serieFactura: z.string().max(10).optional(),
  logoUrl: z.string().url().optional().nullable(),
  colorPrimario: z.string().max(7).optional(),
  siguienteNumero: z.coerce.number().int().min(0).optional(),
  esPrincipal: z.boolean().optional(),
  verifactuEnabled: z.boolean().optional(),
  activo: z.boolean().optional(),
});

// ──────────────────────────────────────────────
// Fiscal - Validación
// ──────────────────────────────────────────────

/**
 * Schema para validar un ID fiscal
 */
export const FiscalValidationSchema = z.object({
  pais: z.string().min(1, 'País requerido'),
  tipoIdFiscal: z.string().min(1, 'Tipo ID fiscal requerido'),
  idFiscal: z.string().min(1, 'ID fiscal requerido'),
});

// ──────────────────────────────────────────────
// Payroll / Nómina
// ──────────────────────────────────────────────

/**
 * Schema para firmar nómina
 */
export const PayrollSignSchema = z.object({
  bonuses: z.array(z.object({
    concept: z.string().max(100).optional(),
    amount: z.coerce.number().min(0),
  })).optional().default([]),
  finalNet: z.coerce.number().min(0).optional(),
  operatorNote: z.string().max(2000).optional(),
});

/**
 * Schema para registrar pago de nómina
 */
export const PayrollCreateSchema = z.object({
  employeeName: z.string().min(1, 'Nombre de empleado requerido').max(255),
  userId: z.string().optional(),
  amount: z.coerce.number().min(0, 'Monto requerido'),
  currency: z.string().length(3).optional().default('EUR'),
  period: z.string().min(1, 'Período requerido').max(50),
  status: z.enum(['PAID', 'PENDING', 'CANCELLED']).optional().default('PAID'),
  date: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Schema para crear gasto ERP (diferente al de RRHH)
 */
export const ErpExpenseCreateSchema = z.object({
  supplierId: z.string().min(1, 'Proveedor requerido'),
  leadId: z.string().optional(),
  description: z.string().min(1, 'Descripción requerida').max(500),
  amount: z.coerce.number().min(0.01, 'Monto requerido'),
  category: z.string().max(100).optional().default('General'),
  receiptUrl: z.string().url().optional().nullable(),
  status: z.enum(['PAID', 'PENDING', 'APPROVED', 'REJECTED']).optional().default('PAID'),
});

// ──────────────────────────────────────────────
// Accounting
// ──────────────────────────────────────────────

/**
 * Schema para declarar IVA
 */
export const VatFileSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});

/**
 * Schema para aceptar conciliación contable
 */
export const AccountingReconcileSchema = z.object({
  transactionId: z.string().min(1, 'transactionId requerido'),
  entryId: z.string().min(1, 'entryId requerido'),
  matchedBy: z.enum(['USER', 'AUTO', 'RULE']).optional().default('USER'),
});

/**
 * Schema para aceptar conciliación bancaria
 */
export const ReconciliationAcceptSchema = z.object({
  entryId: z.string().min(1, 'entryId requerido'),
  transactionId: z.string().min(1, 'transactionId requerido'),
  matchedBy: z.enum(['USER', 'AUTO', 'RULE']).optional().default('USER'),
  confidenceScore: z.coerce.number().min(0).max(1).optional().default(0.95),
});

// ──────────────────────────────────────────────
// Banking
// ──────────────────────────────────────────────

/**
 * Schema para sincronizar conexión bancaria
 */
export const BankingSyncSchema = z.object({
  connectionId: z.string().min(1, 'connectionId requerido'),
});
