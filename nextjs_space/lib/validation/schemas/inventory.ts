import { z } from 'zod';

// ─── Catálogo ───────────────────────────────────────────────

export const CatalogoItemCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  descripcion: z.string().optional(),
  sku: z.string().optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'digital', 'curso']).optional().default('servicio'),
  precioBase: z.union([z.number(), z.string()]).transform(v => Number(v)),
  moneda: z.string().optional(),
  categoriaFiscal: z.string().optional().default('general'),
  tasaImpuestoId: z.string().optional().nullable(),
  duracionMinutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().nullable(),
  modalidad: z.string().optional().nullable(),
  unidad: z.string().optional().default('unidad'),
  activo: z.boolean().optional().default(true),
  destacado: z.boolean().optional().default(false),
  media: z.record(z.unknown()).optional().nullable(),
  pricing: z.record(z.unknown()).optional().nullable(),
  customFieldValues: z.record(z.unknown()).optional().nullable(),
  categorias: z.array(z.string()).optional(),
  etiquetas: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
  isManufactured: z.boolean().optional().default(false),
  costOfAcquisition: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
  inventoryConfig: z.record(z.unknown()).optional(),
  bom: z.object({
    laborCost: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    overheadCost: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    components: z.array(z.object({
      componentId: z.string(),
      quantityRequired: z.union([z.number(), z.string()]).transform(v => Number(v)),
      unit: z.string().optional().default('unit'),
    })).optional(),
  }).optional(),
});

export type CatalogoItemCreateInput = z.infer<typeof CatalogoItemCreateSchema>;

export const CatalogoItemUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  sku: z.string().optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'digital', 'curso']).optional(),
  precioBase: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  moneda: z.string().optional(),
  categoriaFiscal: z.string().optional(),
  tasaImpuestoId: z.string().optional().nullable(),
  duracionMinutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().nullable(),
  modalidad: z.string().optional().nullable(),
  unidad: z.string().optional(),
  activo: z.boolean().optional(),
  destacado: z.boolean().optional(),
  media: z.record(z.unknown()).optional().nullable(),
  pricing: z.record(z.unknown()).optional().nullable(),
  customFieldValues: z.record(z.unknown()).optional().nullable(),
  categorias: z.array(z.string()).optional(),
  etiquetas: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
  isManufactured: z.boolean().optional(),
  costOfAcquisition: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  inventoryConfig: z.record(z.unknown()).optional(),
  bom: z.object({
    laborCost: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    overheadCost: z.union([z.number(), z.string()]).transform(v => Number(v)).optional().default(0),
    components: z.array(z.object({
      componentId: z.string(),
      quantityRequired: z.union([z.number(), z.string()]).transform(v => Number(v)),
      unit: z.string().optional().default('unit'),
    })).optional(),
  }).optional(),
});

export type CatalogoItemUpdateInput = z.infer<typeof CatalogoItemUpdateSchema>;

// ─── Field Definitions ──────────────────────────────────────

const FIELD_TYPES = ['text', 'number', 'select', 'boolean', 'date', 'url', 'textarea'] as const;

export const FieldDefinitionCreateSchema = z.object({
  fieldKey: z.string()
    .min(1, 'fieldKey es requerido')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'fieldKey debe ser un identificador válido (letras, números y guiones bajos, comenzando con letra)'),
  label: z.string().min(1, 'label es requerido'),
  type: z.enum(FIELD_TYPES, { errorMap: () => ({ message: `Tipo inválido. Tipos válidos: ${FIELD_TYPES.join(', ')}` }) }),
  options: z.array(z.string()).min(1, 'Para campos tipo "select", options es requerido').optional(),
  required: z.boolean().optional().default(false),
  orden: z.number().int().optional(),
  categoria: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  unidad: z.string().optional().nullable(),
  valorDefecto: z.string().optional().nullable(),
}).refine(
  data => data.type !== 'select' || (data.options && data.options.length > 0),
  { message: 'Para campos tipo "select", options es requerido y debe ser un array no vacío', path: ['options'] }
);

export type FieldDefinitionCreateInput = z.infer<typeof FieldDefinitionCreateSchema>;

export const FieldDefinitionUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  type: z.enum(FIELD_TYPES, { errorMap: () => ({ message: `Tipo inválido. Tipos válidos: ${FIELD_TYPES.join(', ')}` }) }).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  orden: z.number().int().optional(),
  categoria: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  unidad: z.string().optional().nullable(),
  valorDefecto: z.string().optional().nullable(),
  activo: z.boolean().optional(),
});

export type FieldDefinitionUpdateInput = z.infer<typeof FieldDefinitionUpdateSchema>;

export const FieldDefinitionsReorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1, 'orderedIds debe ser un array no vacío'),
});

export type FieldDefinitionsReorderInput = z.infer<typeof FieldDefinitionsReorderSchema>;

export const FieldDefinitionPresetApplySchema = z.object({
  industria: z.string().min(1, 'industria es requerido'),
  sobreescribir: z.boolean().optional().default(false),
});

export type FieldDefinitionPresetApplyInput = z.infer<typeof FieldDefinitionPresetApplySchema>;

// ─── Servicios ──────────────────────────────────────────────

export const ServicioCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  descripcion: z.string().optional(),
  duracionMinutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  duracion_minutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  precio: z.union([z.number(), z.string()]).transform(v => Number(v)),
  moneda: z.string().min(1, 'Moneda es requerida'),
  modalidad: z.string().optional().default('presencial'),
}).refine(
  data => data.duracionMinutos || data.duracion_minutos,
  { message: 'Duración es requerida', path: ['duracionMinutos'] }
);

export type ServicioCreateInput = z.infer<typeof ServicioCreateSchema>;

export const ServicioUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  duracionMinutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  duracion_minutos: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  precio: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  moneda: z.string().optional(),
  modalidad: z.string().optional(),
  activo: z.boolean().optional(),
});

export type ServicioUpdateInput = z.infer<typeof ServicioUpdateSchema>;

// ─── Tarjetas Digitales ─────────────────────────────────────

const TEMPLATES = ['modern', 'classic', 'minimal', 'bold', 'elegant'] as const;
const LAYOUT_STYLES = ['standard', 'compact', 'wide', 'creative'] as const;
const BACKGROUND_PATTERNS = ['none', 'dots', 'lines', 'waves', 'grid'] as const;

export const DigitalCardUpsertSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  puesto: z.string().optional(),
  empresa: z.string().optional(),
  telefonoMovil: z.string().optional(),
  telefonoOficina: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  sitioWeb: z.string().optional(),
  whatsapp: z.string().optional(),
  telegram: z.string().optional(),
  direccion: z.string().optional(),
  redesSociales: z.record(z.string()).optional(),
  template: z.enum(TEMPLATES).optional().default('modern'),
  fontFamily: z.string().optional().default('Inter'),
  layoutStyle: z.enum(LAYOUT_STYLES).optional().default('standard'),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional().default('#3B82F6'),
  colorSecundario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional().default('#1E40AF'),
  colorFondo: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional().default('#FFFFFF'),
  colorTexto: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional().default('#1F2937'),
  backgroundPattern: z.enum(BACKGROUND_PATTERNS).optional().default('none'),
  logoUrl: z.string().optional().nullable(),
  fotoPerfilUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  urlUnica: z.string().optional(),
});

export type DigitalCardUpsertInput = z.infer<typeof DigitalCardUpsertSchema>;

export const DigitalCardConnectSchema = z.object({
  cardId: z.string().min(1, 'cardId es requerido'),
  nombre: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  empresa: z.string().optional(),
  nota: z.string().optional(),
}).refine(
  data => data.email || data.telefono,
  { message: 'Email o teléfono son obligatorios para conectar' }
);

export type DigitalCardConnectInput = z.infer<typeof DigitalCardConnectSchema>;

export const DigitalCardScanSchema = z.object({
  imagenUrl: z.string().optional(),
  nombre: z.string().min(1, 'El nombre es requerido'),
  empresa: z.string().optional(),
  puesto: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  datosAdicionales: z.record(z.unknown()).optional(),
});

export type DigitalCardScanInput = z.infer<typeof DigitalCardScanSchema>;

// ─── Assets ──────────────────────────────────────────────────

export const AssetCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  serialNumber: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.union([z.number(), z.string()]).transform(v => Number(v)).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export type AssetCreateInput = z.infer<typeof AssetCreateSchema>;
