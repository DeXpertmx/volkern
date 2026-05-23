import { z } from 'zod';

// ─── Configuración General ──────────────────────────────────────
// POST /api/configuracion — Guardar configuración del tenant (clave → valor)
// Acepta un objeto plano cuyas entradas se guardan como pares clave/valor
export const ConfiguracionSaveSchema = z.record(z.unknown());

// ─── Disponibilidad ─────────────────────────────────────────────
// PUT /api/disponibilidad — Actualizar horarios de disponibilidad
const BloqueHorarioSchema = z.object({
  inicio: z.string().min(1, 'La hora de inicio es requerida'),
  fin: z.string().min(1, 'La hora de fin es requerida'),
});

export const DisponibilidadUpdateSchema = z.object({
  horarios: z
    .array(
      z.object({
        diaSemana: z.number().int().min(0).max(6),
        bloques: z.array(BloqueHorarioSchema).optional().default([{ inicio: '09:00', fin: '18:00' }]),
        activo: z.boolean().optional().default(true),
        intervaloMin: z.number().int().min(5).max(480).optional().default(30),
      })
    )
    .min(1, 'Debe haber al menos un horario'),
});

// ─── Whitelabel ─────────────────────────────────────────────────
// PUT /api/whitelabel — Actualizar configuración de marca blanca
export const WhitelabelUpdateSchema = z.object({
  nombreEmpresa: z.string().min(1).max(200).optional(),
  logoUrl: z.string().min(1).optional(),
  iconoUrl: z.string().min(1).optional(),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)').optional(),
  colorSecundario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)').optional(),
  colorAcento: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)').optional(),
  emailRemitente: z.string().email('Email inválido').optional(),
  nombreRemitente: z.string().min(1).max(200).optional(),
  eslogan: z.string().max(500).optional(),
  descripcion: z.string().max(2000).optional(),
  dominio: z
    .string()
    .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Dominio inválido')
    .optional()
    .nullable(),
  isGlobalUpdate: z.boolean().optional(),
});

// ─── Guide ───────────────────────────────────────────────────────
// POST /api/guide — Consultar Volkern Guide
export const GuideQuerySchema = z.object({
  query: z.string().min(1, 'La consulta es requerida'),
  hub: z.string().optional(),
});

// POST /api/guide/context — Obtener ayuda contextual
const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'model']),
  content: z.string(),
});

export const GuideContextSchema = z.object({
  path: z.string().optional(),
  hub: z.string().optional(),
  query: z.string().optional(),
  history: z.array(HistoryMessageSchema).optional().default([]),
});
