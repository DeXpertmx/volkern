import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear un Empleado (HR/ERP)
 */
export const EmployeeCreateSchema = z.object({
  nombre: CommonSchemas.nombre,
  email: CommonSchemas.email,
  telefono: CommonSchemas.telefono,
  cargo: z.string().max(255).optional().nullable(),
  departamento: z.string().max(255).optional().nullable(),
  fechaContratacion: z.string().datetime().optional().nullable(),
  salarioBase: z.coerce.number().min(0).optional().nullable(),
  moneda: CommonSchemas.moneda,
  tipoContrato: z.enum(['indefinido', 'temporal', 'practicas', 'freelance']).optional().default('indefinido'),
  jornada: z.enum(['completa', 'parcial', 'flexible']).optional().default('completa'),
  ubicacion: z.string().max(255).optional().nullable(),
  supervisorId: CommonSchemas.id.optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
});

export type EmployeeCreateInput = z.infer<typeof EmployeeCreateSchema>;

/**
 * Schema para actualizar un Empleado
 */
export const EmployeeUpdateSchema = EmployeeCreateSchema.partial().extend({
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'despedido']).optional(),
});

export type EmployeeUpdateInput = z.infer<typeof EmployeeUpdateSchema>;

/**
 * Schema para solicitar vacaciones
 */
export const VacationRequestSchema = z.object({
  employeeId: CommonSchemas.id,
  fechaInicio: CommonSchemas.fechaISO,
  fechaFin: CommonSchemas.fechaISO,
  tipo: z.enum(['vacaciones', 'enfermedad', 'personal', 'otro']).default('vacaciones'),
  titulo: z.string().max(500).optional(),
  razon: z.string().max(2000).optional(),
}).refine(
  (data) => new Date(data.fechaFin) >= new Date(data.fechaInicio),
  { message: 'La fecha de fin debe ser posterior a la fecha de inicio', path: ['fechaFin'] }
);

/**
 * Schema para crear un gasto (Expense)
 */
export const ExpenseCreateSchema = z.object({
  empleadoId: CommonSchemas.id,
  tipo: z.string().min(1).max(100),
  concepto: z.string().min(1, 'Concepto requerido').max(500),
  monto: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  fecha: CommonSchemas.fechaISO,
  comprobanteUrl: CommonSchemas.url,
  notas: z.string().max(2000).optional().nullable(),
  categoria: z.string().max(100).optional(),
});

/**
 * Schema para registrar asistencia (punch).
 *
 * COMPLIANCE-NOTE (RGPD Julio 2026): `selfieBase64` se ha retirado. La captura
 * facial/biométrica estaba prohibida tras la auditoría RGPD/LOPDGDD.
 * El único dato personal que aceptamos actualmente es la geolocalización GPS
 * en el momento del marcaje, validada contra un radio autorizado de planta
 * (geofencing). Ver `lib/erp/attendance-service.ts` para los detalles del
 * flujo de aprobación.
 */
export const AttendancePunchSchema = z.object({
  employeeId: CommonSchemas.id,
  tipo: z.enum(['entrada', 'salida', 'pausa_inicio', 'pausa_fin']),
  timestamp: z.string().datetime().optional(),
  ubicacion: z.object({
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
  }).optional(),
});

/**
 * Schema para crear beneficios de empleado
 */
export const EmployeeBenefitSchema = z.object({
  employeeId: CommonSchemas.id,
  tipo: z.enum(['seguro_medico', 'vales_despensa', 'fondo_ahorro', 'auto_empresa', 'telefono', 'laptop', 'otro']),
  descripcion: z.string().max(500).optional(),
  valorMensual: z.coerce.number().min(0).optional(),
  fechaInicio: z.string().datetime().optional(),
  fechaFin: z.string().datetime().optional().nullable(),
  activo: z.boolean().default(true),
});
