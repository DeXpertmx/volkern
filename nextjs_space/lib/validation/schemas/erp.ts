import { z } from 'zod';

// ─── HR ────────────────────────────────────────────────────

export const HrVacationsAnalyzeSchema = z.object({
  employeeId: z.string().min(1, 'employeeId es requerido'),
  startDate: z.string().min(1, 'startDate es requerido'),
  endDate: z.string().min(1, 'endDate es requerido'),
});

export const HrVacationsValidateSchema = z.object({
  employeeId: z.string().min(1, 'employeeId es requerido'),
  startDate: z.string().min(1, 'startDate es requerido'),
  endDate: z.string().min(1, 'endDate es requerido'),
});

// ─── Inventory ──────────────────────────────────────────────

export const InventoryConsumptionSchema = z.object({
  productId: z.string().min(1, 'productId es obligatorio'),
  quantity: z.coerce.number({ required_error: 'quantity es obligatorio' }),
  warehouseId: z.string().optional(),
});

export const InventoryAdjustSchema = z.object({
  catalogoItemId: z.string().min(1, 'catalogoItemId es obligatorio'),
  quantity: z.coerce.number({ required_error: 'quantity es obligatorio' }),
  type: z.string().min(1, 'type es obligatorio'),
  warehouseId: z.string().optional(),
  reason: z.string().optional().default('Ajuste manual desde API'),
  referenceId: z.string().optional(),
  targetWarehouseId: z.string().optional(),
});

// ─── Production ─────────────────────────────────────────────

export const ProductionReadinessReleaseSchema = z.object({
  workOrderId: z.string().min(1, 'Falta workOrderId'),
});

export const ProductionReportWasteSchema = z.object({
  workOrderId: z.string().min(1, 'workOrderId es obligatorio'),
  itemId: z.string().optional(),
  quantity: z.coerce.number({ required_error: 'quantity es obligatorio' }),
  evidenceUrl: z.string().min(1, 'evidenceUrl es obligatorio'),
  reportLat: z.coerce.number().optional(),
  reportLng: z.coerce.number().optional(),
  clientTimestamp: z.string().optional(),
});

export const ProductionScrapSchema = z.object({
  workOrderId: z.string().min(1, 'workOrderId es obligatorio'),
  itemId: z.string().min(1, 'itemId es obligatorio'),
  quantity: z.coerce.number({ required_error: 'quantity es obligatorio' }),
  evidenceUrl: z.string().min(1, 'evidenceUrl es obligatorio'),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  timestamp: z.string().optional(),
});

// ─── Projects ───────────────────────────────────────────────

export const ProjectInventoryConsumeSchema = z.object({
  catalogoItemId: z.string().min(1, 'catalogoItemId es obligatorio'),
  warehouseId: z.string().min(1, 'warehouseId es obligatorio'),
  quantity: z.coerce.number({ required_error: 'quantity es obligatorio' }),
  lotId: z.string().optional(),
  reason: z.string().optional(),
});

export const ProjectMilestoneUpdateSchema = z.object({
  status: z.string().optional(),
  name: z.string().optional(),
  dueDate: z.string().optional(),
  isCritical: z.boolean().optional(),
  billingPercentage: z.coerce.number().optional(),
});

export const ProjectMilestoneCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  status: z.string().optional().default('PENDING'),
  dueDate: z.string().optional(),
  isCritical: z.boolean().optional().default(false),
  billingPercentage: z.coerce.number().optional().default(0),
});

export const ProjectReportSchema = z.object({
  financials: z.record(z.unknown(), { required_error: 'Datos del reporte incompletos' }),
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  leadId: z.string().optional(),
  budget: z.coerce.number().optional().default(0),
  // Sin divisa por defecto: la ruta del proyecto la resuelve con la del tenant.
  currency: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ─── Sales Orders ───────────────────────────────────────────

const SalesOrderItemSchema = z.object({
  catalogItemId: z.string().optional(),
  quantity: z.coerce.number().min(1),
  unitPrice: z.coerce.number().min(0),
});

export const SalesOrderCreateSchema = z.object({
  contactId: z.string().optional(),
  items: z.array(SalesOrderItemSchema).optional().default([]),
  priority: z.string().optional().default('NORMAL'),
  deliveryPromise: z.string().optional(),
  shippingAddress: z.string().optional(),
});

// ─── Suppliers ──────────────────────────────────────────────

export const SupplierCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  taxId: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  streetType: z.string().optional(),
  streetName: z.string().optional(),
  streetNumber: z.string().optional(),
  staircase: z.string().optional(),
  floor: z.string().optional(),
  door: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional().default('Varios'),
});

// ─── Warehouses ─────────────────────────────────────────────

export const WarehouseCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  location: z.string().optional(),
  description: z.string().optional(),
});
