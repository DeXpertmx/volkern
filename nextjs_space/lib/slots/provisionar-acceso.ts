/**
 * Provisiona un slot recién creado (agencia/contabilidad): aplica el catálogo
 * básico de roles y deja al administrador del cliente a un paso de entrar.
 *
 * El hueco que cierra: crear el tenant del slot dejaba `billingEmail` como el
 * único rastro del administrador — sin usuario, sin invitación y sin forma de
 * entrar (el TODO «aquí podrías enviar un email de invitación» llevaba ahí
 * desde el alta). Ahora el owner nace invitado con su email de aceptación,
 * igual que cualquier miembro del equipo, reutilizando el mismo circuito
 * (token de un solo uso, 14 días, /auth/aceptar-invitacion).
 *
 * Si el email ya pertenece a otro tenant NO se vincula: ese dato de contacto
 * no puede fabricar un acceso. El operador debe usar otro correo.
 */

import { prisma, globalPrisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logAuditAction } from '@/lib/permissions';
import { aplicarCatalogoRolesBasicos } from '@/lib/roles-basicos';
import { enviarEmailInvitacion } from '@/lib/emails/invitacion';

export interface ProvisionarAccesoResultado {
  /** Se creó la cuenta del owner en esta llamada. */
  creado: boolean;
  /** El email ya tenía cuenta en este tenant (se renovó su invitación si hacía falta). */
  yaExistia: boolean;
  /** La cuenta ya estaba activa: nada que invitar. */
  yaActivo: boolean;
  /** El email pertenece a una cuenta de otro tenant: no se toca. */
  emailDeOtroTenant: boolean;
  emailEnviado: boolean;
  emailError?: string;
  /** Contraseña provisional — por si la agencia prefiere entregarla por su canal. */
  tempPassword?: string;
  rolNombre: string;
}

function generarPasswordTemporal(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = require('crypto').randomBytes(12) as Buffer;
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export async function provisionarAccesoDeSlot(
  tenantId: string,
  email: string,
  nombre: string,
  /** Quien crea el slot (para la auditoría); puede ser null en scripts. */
  creadorId?: string
): Promise<ProvisionarAccesoResultado> {
  const resultado: ProvisionarAccesoResultado = {
    creado: false,
    yaExistia: false,
    yaActivo: false,
    emailDeOtroTenant: false,
    emailEnviado: false,
    rolNombre: 'Admin',
  };

  // 1. Catálogo básico garantizado en el slot (incluido el rol Admin).
  await aplicarCatalogoRolesBasicos(prisma as never, tenantId);
  const rolAdmin = await prisma.role.findFirst({
    where: { tenantId, nombre: 'Admin' },
    select: { id: true, nombre: true },
  });
  if (!rolAdmin) {
    resultado.emailError = 'No se pudo provisionar el rol Admin del slot';
    return resultado;
  }
  resultado.rolNombre = rolAdmin.nombre;

  const emailLimpio = email.trim().toLowerCase();
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { nombre: true },
  });

  // 2. Resolver el destinatario.
  const existente = await prisma.user.findUnique({
    where: { email: emailLimpio },
    select: { id: true, name: true, tenantId: true, estado: true },
  });

  if (existente && existente.tenantId && existente.tenantId !== tenantId) {
    resultado.emailDeOtroTenant = true;
    resultado.emailError =
      'Ese email ya pertenece a otra cuenta de la plataforma: usa otro correo para el administrador del cliente.';
    return resultado;
  }

  let usuarioId: string;
  let token: string | undefined;
  let tempPassword: string | undefined;

  if (existente) {
    resultado.yaExistia = true;
    usuarioId = existente.id;

    if (existente.estado === 'activo') {
      resultado.yaActivo = true;
      return resultado;
    }

    // Pendiente de aceptar: renovar invitación.
    token = require('crypto').randomBytes(24).toString('hex');
    await prisma.user.update({
      where: { id: existente.id },
      data: {
        tokenInvitacion: token,
        tokenInvitacionExpiry: new Date(Date.now() + TREINTA_DIAS_MS),
        fechaInvitacion: new Date(),
      },
    });
  } else {
    // 3. Alta del owner del slot, invitado igual que cualquier miembro.
    resultado.creado = true;
    tempPassword = generarPasswordTemporal();
    const hashed = await bcrypt.hash(tempPassword, 12);
    token = require('crypto').randomBytes(24).toString('hex');

    const nuevo = await prisma.user.create({
      data: {
        name: nombre || emailLimpio,
        email: emailLimpio,
        password: hashed,
        roleId: rolAdmin.id,
        tenantId,
        estado: 'invitado',
        invitadoPor: creadorId,
        tokenInvitacion: token,
        tokenInvitacionExpiry: new Date(Date.now() + TREINTA_DIAS_MS),
        fechaInvitacion: new Date(),
      },
      select: { id: true },
    });
    usuarioId = nuevo.id;
  }

  // 4. Email de aceptación.
  const invitador = creadorId
    ? await prisma.user.findUnique({
        where: { id: creadorId },
        select: { name: true, email: true },
      })
    : null;

  if (!token) {
    resultado.emailError = 'Token de invitación no generado';
    return resultado;
  }

  try {
    const r = await enviarEmailInvitacion({
      email: emailLimpio,
      nombre: nombre || emailLimpio,
      token,
      tempPassword,
      tenantNombre: tenant?.nombre || 'tu cuenta',
      invitadorNombre: invitador?.name || invitador?.email || 'Tu agencia',
    });
    resultado.emailEnviado = !!r?.success;
    if (!r?.success) resultado.emailError = 'No se pudo enviar el email';
  } catch (err: any) {
    resultado.emailError = err?.message || 'Error al enviar el email';
  }

  if (creadorId && tenantId) {
    await logAuditAction(
      creadorId,
      tenantId,
      'crear',
      'usuario',
      usuarioId,
      `Acceso del slot provisionado para ${emailLimpio} (email ${resultado.emailEnviado ? 'enviado' : 'NO enviado'})`
    ).catch(() => {});
  }

  resultado.tempPassword = tempPassword;
  return resultado;
}
