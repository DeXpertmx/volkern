import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear una Cita
 */
export const CitaCreateSchema = z.object({
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  servicioId: CommonSchemas.id.optional().nullable(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  tipo: z.enum(['reunion', 'llamada', 'presencial', 'otro']).default('reunion'),
  titulo: z.string().max(500).optional().nullable(),
  descripcion: CommonSchemas.descripcion,
  ubicacion: z.string().max(500).optional().nullable(),
  linkReunion: CommonSchemas.url,
  tipoLinkReunion: z.enum(['ninguno', 'generar', 'pegar']).default('ninguno'),
  linkReunionPegado: CommonSchemas.url,
  fechaHora: CommonSchemas.fechaISO,
  duracion: z.coerce.number().int().min(5, 'Duración mínima 5 minutos').max(480, 'Duración máxima 8 horas').default(60),
  estado: z.enum(['pendiente', 'confirmada', 'cancelada', 'completada']).default('pendiente'),
  bufferMinutos: z.coerce.number().int().min(0).max(120).optional().default(0),
  connectedCalendarId: CommonSchemas.id.optional().nullable(),
  avisoMinimo: z.coerce.number().int().min(0).optional().default(0),
}).refine(
  (data) => data.leadId || data.contactId || data.titulo,
  { message: 'Se requiere leadId, contactId o título para la cita', path: ['leadId'] }
);

export type CitaCreateInput = z.infer<typeof CitaCreateSchema>;

/**
 * Schema para actualizar una Cita
 */
export const CitaUpdateSchema = z.object({
  titulo: z.string().max(500).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  ubicacion: z.string().max(500).optional().nullable(),
  linkReunion: z.string().url().optional().nullable(),
  fechaHora: z.string().datetime().optional(),
  duracion: z.number().int().min(5).max(480).optional(),
  estado: z.enum(['pendiente', 'confirmada', 'cancelada', 'completada']).optional(),
  tipo: z.enum(['reunion', 'llamada', 'presencial', 'otro']).optional(),
  tipoLinkReunion: z.enum(['ninguno', 'generar', 'pegar']).optional(),
  linkReunionPegado: z.string().url().optional().nullable(),
  servicioId: CommonSchemas.id.optional().nullable(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  connectedCalendarId: CommonSchemas.id.optional().nullable(),
});

export type CitaUpdateInput = z.infer<typeof CitaUpdateSchema>;

/**
 * Schema para reagendar una Cita
 */
export const CitaReagendarSchema = z.object({
  nuevaFechaHora: CommonSchemas.fechaISO,
  nuevaDuracion: z.coerce.number().int().min(5).max(480).optional(),
  razon: z.string().max(500).optional(),
});

/**
 * Schema para citas públicas (widget)
 */
export const CitaPublicaSchema = z.object({
  tenantId: CommonSchemas.tenantId,
  servicioId: z.string().min(1, 'Servicio requerido'),
  fechaHora: CommonSchemas.fechaISO,
  nombre: CommonSchemas.nombre,
  email: CommonSchemas.email,
  telefono: CommonSchemas.telefono,
  notas: z.string().max(2000).optional().nullable(),
});

/**
 * Schema para consultar disponibilidad
 */
export const DisponibilidadQuerySchema = z.object({
  tenantId: CommonSchemas.tenantId,
  servicioId: z.string().optional(),
  fechaInicio: z.string().datetime().optional(),
  fechaFin: z.string().datetime().optional(),
  diasAdelante: z.number().int().min(1).max(90).optional().default(30),
});

/**
 * Schema para acciones sobre citas públicas (confirmar/cancelar/reagendar)
 */
export const CitaActionSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
});
