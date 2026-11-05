import { z } from 'zod';
import { CommonSchemas } from '../common';
import { PASSWORD_MIN_LENGTH, PASSWORD_REGEX } from '../password';

const PasswordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .regex(PASSWORD_REGEX, 'La contraseña debe incluir mayúsculas, minúsculas y al menos un carácter especial');

// ─────────────────────────────────────────────
// Usuarios
// ─────────────────────────────────────────────

/**
 * Schema para crear un usuario (invitar)
 */
export const UserCreateSchema = z.object({
  name: CommonSchemas.nombre,
  email: CommonSchemas.email,
  roleId: CommonSchemas.id.optional().nullable(),
  telefono: CommonSchemas.telefono,
  timezone: z.string().max(100).optional(),
  department: z.string().max(255).optional(),
  isDepartmentAdmin: z.boolean().optional(),
});

export type UserCreateInput = z.infer<typeof UserCreateSchema>;

/**
 * Schema para actualizar un usuario (admin)
 */
export const UserUpdateSchema = z.object({
  name: CommonSchemas.nombre.optional(),
  telefono: CommonSchemas.telefono,
  timezone: z.string().max(100).optional(),
  roleId: CommonSchemas.id.optional().nullable(),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'invitado']).optional(),
  image: z.string().max(500).optional().nullable(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

/**
 * Schema para actualizar perfil propio
 */
export const ProfileUpdateSchema = z.object({
  name: CommonSchemas.nombre.optional(),
  telefono: CommonSchemas.telefono,
  bookingSlug: z.string().max(100).optional(),
  bookingTitle: z.string().max(255).optional(),
  bookingBio: z.string().max(1000).optional(),
  bookingEnabled: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
  timezone: z.string().max(100).optional(),
  image: z.string().max(500).optional().nullable(),
});

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

/**
 * Schema para push subscription
 */
export const PushSubscriptionSchema = z.object({
  userId: CommonSchemas.id,
  permission: z.enum(['granted', 'denied', 'default']),
});

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>;

/**
 * Schema para 2FA toggle
 */
export const TwoFactorSchema = z.object({
  enabled: z.boolean(),
});

export type TwoFactorInput = z.infer<typeof TwoFactorSchema>;

/**
 * Schema para cambiar contraseña
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: PasswordSchema,
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

/**
 * Schema para registro (signup)
 */
export const SignupSchema = z.object({
  email: CommonSchemas.email,
  password: PasswordSchema,
  fullName: CommonSchemas.nombre,
  companyName: z.string().min(1, 'Nombre de empresa requerido').max(255),
  couponCode: z.string().max(20).optional(),
});

export type SignupInput = z.infer<typeof SignupSchema>;

/**
 * Schema para recuperar contraseña
 */
export const RecuperarPasswordSchema = z.object({
  email: CommonSchemas.email,
});

export type RecuperarPasswordInput = z.infer<typeof RecuperarPasswordSchema>;

/**
 * Schema para resetear contraseña
 */
export const ResetearPasswordSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password: PasswordSchema,
});

export type ResetearPasswordInput = z.infer<typeof ResetearPasswordSchema>;

// ─────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────

/**
 * Schema para crear rol
 */
export const RoleCreateSchema = z.object({
  nombre: CommonSchemas.nombre,
  descripcion: z.string().max(500).optional(),
  permisos: z.record(z.any()).optional(),
});

export type RoleCreateInput = z.infer<typeof RoleCreateSchema>;

/**
 * Schema para actualizar rol
 */
export const RoleUpdateSchema = z.object({
  nombre: CommonSchemas.nombre.optional(),
  descripcion: z.string().max(500).optional(),
  permisos: z.record(z.any()).optional(),
});

export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;

// ─────────────────────────────────────────────
// Tenants (creación rápida)
// ─────────────────────────────────────────────

/**
 * Schema para crear tenant (provisioning)
 */
export const UserTenantCreateSchema = z.object({
  empresa: CommonSchemas.nombre,
  subdomain: z.string()
    .min(3, 'Subdominio debe tener al menos 3 caracteres')
    .max(63, 'Subdominio debe tener máximo 63 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  email: CommonSchemas.email,
  password: PasswordSchema,
  telegram: z.object({
    botName: z.string().min(1, 'botName requerido').max(100),
    botToken: z.string().min(1, 'botToken requerido').max(200),
  }),
});

export type UserTenantCreateInput = z.infer<typeof UserTenantCreateSchema>;
