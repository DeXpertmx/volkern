/**
 * Capa de datos del registro de viajeros.
 *
 * Aquí se junta el dominio puro (`lib/hospitality/compliance.ts`) con la base de
 * datos, el cifrado de credenciales y la auditoría. La pantalla y las rutas no
 * tocan `prisma` para esto: pasan por estas funciones, y así la regla de que un
 * documento no se enseña completo y la de que cada acción queda registrada se
 * cumplen en un solo sitio.
 *
 * Dos reglas que gobiernan todo el archivo:
 *
 *   1. **Aislamiento por tenant.** Cada consulta filtra por `tenantId`, y siempre
 *      se comprueba que la reserva pertenezca al tenant antes de escribir un
 *      viajero encima. Un `id` que llega de fuera no es una autorización.
 *   2. **Nada se escribe desde un GET.** Los estados se recalculan y las filas se
 *      crean en las acciones (POST/PUT), no al leer: leer no puede tener efectos.
 *      La auditoría de acceso va por `logAuditAction`, que es el registro de la
 *      plataforma y no una escritura de negocio.
 */

import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/core/crypto';
import { logAuditAction } from '@/lib/permissions';
import {
  camposFaltantes,
  estadoDeViajero,
  normalizarEstado,
  resumenDeReserva,
  type EstadoRegistro,
  type ViajeroMinimo,
} from './compliance';
import {
  EsquemaNoDisponibleError,
  construirXml,
  enviarComunicacion,
  esEntornoSes,
  type CredencialesSes,
  type TipoComunicacion,
} from './ses-hospedajes/connector';

/** Estados en los que una acción del usuario todavía tiene algo que hacer. */
const ESTADOS_TERMINALES: EstadoRegistro[] = ['completo', 'anulado'];

export interface RegistroConfig {
  id: string;
  tenantId: string;
  activo: boolean;
  entorno: string;
  entidadNombre: string | null;
  entidadNif: string | null;
  tieneUsuario: boolean;
  tienePassword: boolean;
  tieneCertificado: boolean;
  estadoConexion: string;
  ultimoEnvio: Date | null;
  ultimoCodigo: string | null;
  ultimoError: string | null;
}

export interface EntradaConfig {
  activo?: boolean;
  entorno?: string;
  entidadNombre?: string | null;
  entidadNif?: string | null;
  usuario?: string | null;
  password?: string | null;
  certificado?: string | null;
}

/** La configuración sin secretos: es lo único que puede salir hacia la interfaz. */
function aConfigPublica(config: {
  id: string;
  tenantId: string;
  activo: boolean;
  entorno: string;
  entidadNombre: string | null;
  entidadNif: string | null;
  usuarioEnc: string | null;
  passwordEnc: string | null;
  certificadoEnc: string | null;
  estadoConexion: string;
  ultimoEnvio: Date | null;
  ultimoCodigo: string | null;
  ultimoError: string | null;
}): RegistroConfig {
  return {
    id: config.id,
    tenantId: config.tenantId,
    activo: config.activo,
    entorno: config.entorno,
    entidadNombre: config.entidadNombre,
    entidadNif: config.entidadNif,
    tieneUsuario: Boolean(config.usuarioEnc),
    tienePassword: Boolean(config.passwordEnc),
    tieneCertificado: Boolean(config.certificadoEnc),
    estadoConexion: config.estadoConexion,
    ultimoEnvio: config.ultimoEnvio,
    ultimoCodigo: config.ultimoCodigo,
    ultimoError: config.ultimoError,
  };
}

export async function leerConfig(tenantId: string): Promise<RegistroConfig | null> {
  const config = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  return config ? aConfigPublica(config) : null;
}

/**
 * Guarda la configuración de la entidad.
 *
 * Los campos de credencial solo se sobrescriben **cuando llegan**: así se puede
 * cambiar el entorno o el nombre de la entidad sin volver a teclear la contraseña,
 * y guardar sin usuario no borra el que ya había.
 */
export async function guardarConfig(
  tenantId: string,
  entrada: EntradaConfig,
  usuarioId: string
): Promise<RegistroConfig> {
  const antes = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });

  const datos: Record<string, unknown> = {};
  if (entrada.activo !== undefined) datos.activo = entrada.activo;
  if (entrada.entorno !== undefined) datos.entorno = esEntornoSes(entrada.entorno) ? entrada.entorno : 'pruebas';
  if (entrada.entidadNombre !== undefined) datos.entidadNombre = entrada.entidadNombre;
  if (entrada.entidadNif !== undefined) datos.entidadNif = entrada.entidadNif;
  if (entrada.usuario) datos.usuarioEnc = encrypt(entrada.usuario.trim());
  if (entrada.password) datos.passwordEnc = encrypt(entrada.password.trim());
  if (entrada.certificado) datos.certificadoEnc = encrypt(entrada.certificado.trim());

  const tieneUsuario = Boolean(datos.usuarioEnc) || Boolean(antes?.usuarioEnc);
  const tienePassword = Boolean(datos.passwordEnc) || Boolean(antes?.passwordEnc);
  datos.estadoConexion = tieneUsuario && tienePassword ? 'configurada' : 'sin_configurar';

  const guardado = await prisma.hospitalityComplianceConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...datos } as never,
    update: datos as never,
  });

  await logAuditAction(
    usuarioId,
    tenantId,
    'editar',
    'hospitality_compliance_config',
    guardado.id,
    `Configuración del registro de viajeros actualizada (entorno ${guardado.entorno}${entrada.password || entrada.certificado ? ', credenciales renovadas' : ''})`
  ).catch(() => {});

  return aConfigPublica(guardado);
}

/** Borra las credenciales guardadas sin eliminar la configuración. */
export async function borrarCredenciales(tenantId: string, usuarioId: string): Promise<RegistroConfig | null> {
  const existente = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  if (!existente) return null;

  const guardado = await prisma.hospitalityComplianceConfig.update({
    where: { tenantId },
    data: {
      usuarioEnc: null,
      passwordEnc: null,
      certificadoEnc: null,
      estadoConexion: 'sin_configurar',
    },
  });

  await logAuditAction(
    usuarioId,
    tenantId,
    'eliminar',
    'hospitality_compliance_config',
    guardado.id,
    'Credenciales del registro de viajeros eliminadas'
  ).catch(() => {});

  return aConfigPublica(guardado);
}

/**
 * Credenciales descifradas del tenant, solo para uso interno del conector.
 *
 * Devuelve `null` si falta cualquiera de las dos partes: media credencial no es una
 * credencial, y salir a la red con ella solo produce un 401 que confunde.
 */
export async function credencialesDeTenant(tenantId: string): Promise<CredencialesSes | null> {
  const config = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  if (!config?.usuarioEnc || !config?.passwordEnc) return null;

  try {
    return {
      usuario: decrypt(config.usuarioEnc),
      password: decrypt(config.passwordEnc),
      certificado: config.certificadoEnc ? decrypt(config.certificadoEnc) : null,
    };
  } catch {
    return null;
  }
}

export interface ViajeroGuardado extends ViajeroMinimo {
  id: string;
  esTitular: boolean;
  orden: number;
  estado: string;
  /** Seguimiento del enlace de WhatsApp (pedir/reenviar datos). */
  enlaceEnviadoEn?: Date | null;
  enlaceEnviados?: number;
  datosRecibidosEn?: Date | null;
}

export async function listarViajeros(tenantId: string, reservationId: string): Promise<ViajeroGuardado[]> {
  return prisma.hospitalityTraveler.findMany({
    where: { tenantId, reservationId },
    orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }, { fechaCreacion: 'asc' }],
  });
}

/** Marcó el envío del enlace de WhatsApp a un viajero (primera vez o reenvío). */
export async function registrarEnvioEnlace(viajeroId: string): Promise<void> {
  await prisma.hospitalityTraveler.update({
    where: { id: viajeroId },
    data: { enlaceEnviadoEn: new Date(), enlaceEnviados: { increment: 1 } },
  });
}

/** Marcó que el viajero respondió: completó sus datos en el formulario público. */
export async function registrarRespuestaEnlace(viajeroId: string): Promise<void> {
  await prisma.hospitalityTraveler.update({
    where: { id: viajeroId },
    data: { datosRecibidosEn: new Date() },
  });
}

/**
 * Recalcula el estado del parte de viajeros a partir de los datos.
 *
 * Cualquier cambio en los viajeros invalida lo comunicado: el Ministerio tiene una
 * foto antigua y hay que reenviarla. Por eso un alta o una edición devuelve el
 * parte a `datos_pendientes` o `pendiente_envio`, nunca lo deja en `completo`.
 */
async function recalcularParteDeViajeros(
  tenantId: string,
  reservationId: string,
  viajeros: ViajeroMinimo[]
): Promise<EstadoRegistro> {
  const derivado: EstadoRegistro =
    viajeros.length > 0 && viajeros.every((v) => camposFaltantes(v).length === 0)
      ? 'pendiente_envio'
      : 'datos_pendientes';

  await prisma.hospitalityCompliance.upsert({
    where: { reservationId },
    create: { tenantId, reservationId, estadoViajeros: derivado },
    update: { estadoViajeros: derivado, codigoError: null, mensajeError: null },
  });

  return derivado;
}

async function reservaDelTenant(tenantId: string, reservationId: string) {
  return prisma.hospitalityReservation.findFirst({
    where: { id: reservationId, tenantId },
    select: { id: true, externalBookingId: true, estado: true },
  });
}

export interface EntradaViajero {
  nombre: string;
  apellido1: string;
  apellido2?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  soporteDocumento?: string | null;
  fechaNacimiento?: string | Date | null;
  nacionalidad?: string | null;
  esTitular?: boolean;
  orden?: number;
}

function normalizarFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export async function crearViajero(
  tenantId: string,
  reservationId: string,
  entrada: EntradaViajero,
  usuarioId: string
): Promise<ViajeroGuardado> {
  const reserva = await reservaDelTenant(tenantId, reservationId);
  if (!reserva) throw new Error('La reserva no existe en esta cuenta');

  const viajero = await prisma.hospitalityTraveler.create({
    data: {
      tenantId,
      reservationId,
      esTitular: Boolean(entrada.esTitular),
      orden: entrada.orden ?? 0,
      nombre: entrada.nombre.trim(),
      apellido1: entrada.apellido1.trim(),
      apellido2: entrada.apellido2?.trim() || null,
      tipoDocumento: entrada.tipoDocumento?.trim() || null,
      numeroDocumento: entrada.numeroDocumento?.trim() || null,
      soporteDocumento: entrada.soporteDocumento?.trim() || null,
      fechaNacimiento: normalizarFecha(entrada.fechaNacimiento),
      nacionalidad: entrada.nacionalidad?.trim()?.toUpperCase() || null,
      estado: estadoDeViajero(entrada),
    },
  });

  const viajeros = await listarViajeros(tenantId, reservationId);
  await recalcularParteDeViajeros(tenantId, reservationId, viajeros);

  await logAuditAction(
    usuarioId,
    tenantId,
    'crear',
    'hospitality_traveler',
    viajero.id,
    `Viajero añadido a la reserva ${reserva.externalBookingId} (${viajero.nombre} ${viajero.apellido1})`
  ).catch(() => {});

  return viajero;
}

export async function actualizarViajero(
  tenantId: string,
  viajeroId: string,
  entrada: Partial<EntradaViajero>,
  usuarioId: string
): Promise<ViajeroGuardado | null> {
  const actual = await prisma.hospitalityTraveler.findFirst({ where: { id: viajeroId, tenantId } });
  if (!actual) return null;

  const datos: Record<string, unknown> = {};
  if (entrada.nombre !== undefined) datos.nombre = entrada.nombre.trim();
  if (entrada.apellido1 !== undefined) datos.apellido1 = entrada.apellido1.trim();
  if (entrada.apellido2 !== undefined) datos.apellido2 = entrada.apellido2?.trim() || null;
  if (entrada.tipoDocumento !== undefined) datos.tipoDocumento = entrada.tipoDocumento?.trim() || null;
  if (entrada.numeroDocumento !== undefined) datos.numeroDocumento = entrada.numeroDocumento?.trim() || null;
  if (entrada.soporteDocumento !== undefined) datos.soporteDocumento = entrada.soporteDocumento?.trim() || null;
  if (entrada.nacionalidad !== undefined) datos.nacionalidad = entrada.nacionalidad?.trim()?.toUpperCase() || null;
  if (entrada.esTitular !== undefined) datos.esTitular = Boolean(entrada.esTitular);
  if (entrada.orden !== undefined) datos.orden = entrada.orden;
  if (entrada.fechaNacimiento !== undefined) datos.fechaNacimiento = normalizarFecha(entrada.fechaNacimiento);

  const fusionado = { ...actual, ...entrada } as ViajeroMinimo;
  datos.estado = estadoDeViajero(fusionado);

  const viajero = await prisma.hospitalityTraveler.update({ where: { id: viajeroId }, data: datos });

  const viajeros = await listarViajeros(tenantId, actual.reservationId);
  await recalcularParteDeViajeros(tenantId, actual.reservationId, viajeros);

  await logAuditAction(
    usuarioId,
    tenantId,
    'editar',
    'hospitality_traveler',
    viajero.id,
    `Viajero actualizado (${viajero.nombre} ${viajero.apellido1})`
  ).catch(() => {});

  return viajero;
}

export async function eliminarViajero(
  tenantId: string,
  viajeroId: string,
  usuarioId: string
): Promise<boolean> {
  const actual = await prisma.hospitalityTraveler.findFirst({ where: { id: viajeroId, tenantId } });
  if (!actual) return false;

  await prisma.hospitalityTraveler.delete({ where: { id: viajeroId } });

  const viajeros = await listarViajeros(tenantId, actual.reservationId);
  await recalcularParteDeViajeros(tenantId, actual.reservationId, viajeros);

  await logAuditAction(
    usuarioId,
    tenantId,
    'eliminar',
    'hospitality_traveler',
    viajeroId,
    `Viajero retirado de la reserva (${actual.nombre} ${actual.apellido1})`
  ).catch(() => {});

  return true;
}

/** Una fila de la bandeja: la reserva con su registro resumido. */
export interface FilaRegistro {
  reservationId: string;
  referencia: string;
  estadoReservaHotel: string;
  canal: string;
  checkIn: Date;
  checkOut: Date;
  huesped: string | null;
  propiedad: string | null;
  unidad: string | null;
  total: number;
  registrados: number;
  pendientes: number;
  estado: EstadoRegistro;
  etiqueta: string;
  listoParaEnviar: boolean;
  ultimoEnvio: Date | null;
  mensajeError: string | null;
  /** Seguimiento del enlace de WhatsApp, para el aviso de sin respuesta. */
  enlacesSinResponder: number;
  ultimoEnlaceEnviadoEn: Date | null;
}

export interface FiltrosBandeja {
  desde?: Date | null;
  hasta?: Date | null;
  estado?: EstadoRegistro | null;
  canal?: string | null;
  texto?: string | null;
  limite?: number;
}

/**
 * La bandeja del registro de viajeros.
 *
 * Se leen las reservas del rango con sus viajeros y su registro, y el resumen se
 * calcula con el mismo `resumenDeReserva` que usa la ficha: así la bandeja y el
 * detalle no pueden decir cosas distintas de la misma reserva.
 */
export async function bandejaDeRegistros(tenantId: string, filtros: FiltrosBandeja = {}) {
  const limite = Math.min(Math.max(filtros.limite ?? 200, 1), 500);

  const where: Record<string, unknown> = {
    tenantId,
    estado: { not: 'cancelled' },
  };
  if (filtros.desde) where.checkOut = { gte: filtros.desde };
  if (filtros.hasta) where.checkIn = { lt: filtros.hasta };
  if (filtros.canal) where.channel = { contains: filtros.canal, mode: 'insensitive' };

  const reservas = await prisma.hospitalityReservation.findMany({
    where,
    orderBy: { checkIn: 'desc' },
    take: limite,
    include: {
      travelers: true,
      compliance: true,
      property: { select: { nombre: true } },
      unit: { select: { nombre: true } },
      contact: { select: { nombre: true } },
    },
  });

  const filas: FilaRegistro[] = reservas.map((reserva) => {
    const resumen = resumenDeReserva(reserva.travelers, reserva.compliance);
    return {
      reservationId: reserva.id,
      referencia: reserva.externalBookingId,
      estadoReservaHotel: reserva.estado,
      canal: reserva.channel,
      checkIn: reserva.checkIn,
      checkOut: reserva.checkOut,
      huesped: reserva.contact?.nombre ?? null,
      propiedad: reserva.property?.nombre ?? null,
      unidad: reserva.unit?.nombre ?? null,
      total: resumen.total,
      registrados: resumen.registrados,
      pendientes: resumen.pendientes,
      estado: resumen.estado,
      etiqueta: resumen.etiqueta,
      listoParaEnviar: resumen.listoParaEnviar,
      ultimoEnvio: reserva.compliance?.enviadoEn ?? null,
      mensajeError: reserva.compliance?.mensajeError ?? null,
      // Enlaces pedidos por WhatsApp que siguen sin respuesta, y cuándo fue la
      // última vez: alimenta el aviso de «más de 48 horas sin responder».
      enlacesSinResponder: reserva.travelers.filter(
        (v) => v.enlaceEnviadoEn && !v.datosRecibidosEn
      ).length,
      ultimoEnlaceEnviadoEn:
        reserva.travelers
          .filter((v) => v.enlaceEnviadoEn && !v.datosRecibidosEn)
          .map((v) => v.enlaceEnviadoEn as Date)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };
  });

  const texto = filtros.texto?.trim().toLowerCase();
  const filtradas = filas.filter((fila) => {
    if (filtros.estado && fila.estado !== filtros.estado) return false;
    if (!texto) return true;
    return [fila.referencia, fila.huesped, fila.propiedad, fila.unidad, fila.canal]
      .filter(Boolean)
      .some((valor) => String(valor).toLowerCase().includes(texto));
  });

  const conteo: Record<EstadoRegistro, number> = {
    datos_pendientes: 0,
    pendiente_envio: 0,
    enviado: 0,
    procesando: 0,
    completo: 0,
    error: 0,
    anulado: 0,
  };
  for (const fila of filas) conteo[fila.estado] += 1;

  const conRegistro = conteo.completo + conteo.procesando + conteo.enviado;
  const porcentajeEnviado = filas.length === 0 ? 0 : Math.round((conRegistro / filas.length) * 100);

  return { filas: filtradas, total: filas.length, conteo, porcentajeEnviado };
}

export async function detalleRegistro(tenantId: string, reservationId: string) {
  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { id: reservationId, tenantId },
    include: {
      travelers: { orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }, { fechaCreacion: 'asc' }] },
      compliance: { include: { eventos: { orderBy: { fechaCreacion: 'desc' }, take: 25 } } },
      property: { select: { id: true, nombre: true } },
      unit: { select: { id: true, nombre: true } },
      contact: { select: { id: true, nombre: true, email: true, telefono: true } },
    },
  });

  if (!reserva) return null;

  const resumen = resumenDeReserva(reserva.travelers, reserva.compliance);
  return { reserva, resumen };
}

export interface ResultadoEnvio {
  ok: boolean;
  motivo?: 'esquema_no_disponible' | 'sin_configuracion' | 'sin_datos' | 'sin_reserva' | 'rechazado' | 'transporte';
  mensaje: string;
  estado?: number;
  codigo?: string;
}

/**
 * Envía una comunicación al Ministerio.
 *
 * El orden importa y es el que evita los dos fallos caros: primero se comprueba que
 * haya con qué enviar (configuración y datos), y solo entonces se construye el
 * mensaje. Hoy `construirXml` choca con el esquema pendiente, así que el resultado
 * es un `esquema_no_disponible` explícito y **no se escribe ninguna comunicación**
 * en la bitácora: no se registra lo que no se envió.
 */
export async function enviarAlMinisterio(
  tenantId: string,
  reservationId: string,
  tipo: TipoComunicacion,
  usuarioId: string
): Promise<ResultadoEnvio> {
  const reserva = await reservaDelTenant(tenantId, reservationId);
  if (!reserva) return { ok: false, motivo: 'sin_reserva', mensaje: 'La reserva no existe en esta cuenta' };

  const config = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  const credenciales = await credencialesDeTenant(tenantId);
  if (!config?.activo || !credenciales) {
    return {
      ok: false,
      motivo: 'sin_configuracion',
      mensaje: 'El registro de viajeros no está activo o la entidad no tiene credenciales guardadas',
    };
  }

  const viajeros = await listarViajeros(tenantId, reservationId);
  if (tipo === 'viajeros') {
    if (viajeros.length === 0) {
      return { ok: false, motivo: 'sin_datos', mensaje: 'No hay ningún viajero declarado en la reserva' };
    }
    const incompletos = viajeros.filter((v) => camposFaltantes(v).length > 0);
    if (incompletos.length > 0) {
      return {
        ok: false,
        motivo: 'sin_datos',
        mensaje: `Faltan datos de ${incompletos.length} de ${viajeros.length} viajeros`,
      };
    }
  }

  let xml: string;
  try {
    xml = construirXml(tipo, { reserva, viajeros });
  } catch (error) {
    if (error instanceof EsquemaNoDisponibleError) {
      return { ok: false, motivo: 'esquema_no_disponible', mensaje: error.message };
    }
    throw error;
  }

  const campoEstado = tipo === 'reserva' ? 'estadoReserva' : 'estadoViajeros';

  try {
    const respuesta = await enviarComunicacion({ entorno: config.entorno, credenciales, xml });

    await prisma.hospitalityCompliance.upsert({
      where: { reservationId },
      create: {
        tenantId,
        reservationId,
        [campoEstado]: respuesta.ok ? 'enviado' : 'error',
        enviadoEn: new Date(),
        codigoError: respuesta.ok ? null : String(respuesta.status),
        mensajeError: respuesta.ok ? null : respuesta.cuerpo.slice(0, 500),
      },
      update: {
        [campoEstado]: respuesta.ok ? 'enviado' : 'error',
        enviadoEn: new Date(),
        codigoComunicacion: respuesta.codigo ?? null,
        codigoError: respuesta.ok ? null : String(respuesta.status),
        mensajeError: respuesta.ok ? null : respuesta.cuerpo.slice(0, 500),
      },
    });

    await prisma.hospitalityComplianceEvent.create({
      data: {
        tenantId,
        reservationId,
        tipo,
        estado: respuesta.ok ? 'enviado' : 'error',
        codigoComunicacion: respuesta.codigo ?? null,
        codigoError: respuesta.ok ? null : String(respuesta.status),
        mensajeError: respuesta.ok ? null : respuesta.cuerpo.slice(0, 500),
        detalle: `Comunicación ${tipo} al Ministerio (${config.entorno}) con ${viajeros.length} viajeros`,
        usuarioId,
      },
    });

    await prisma.hospitalityComplianceConfig.update({
      where: { tenantId },
      data: {
        ultimoEnvio: new Date(),
        ultimoCodigo: respuesta.codigo ?? String(respuesta.status),
        ultimoError: respuesta.ok ? null : respuesta.cuerpo.slice(0, 300),
      },
    });

    await logAuditAction(
      usuarioId,
      tenantId,
      'enviar',
      'hospitality_compliance',
      reservationId,
      `Comunicación «${tipo}» de la reserva ${reserva.externalBookingId}: ${respuesta.ok ? 'aceptada' : `rechazada (${respuesta.status})`}`
    ).catch(() => {});

    return respuesta.ok
      ? { ok: true, mensaje: 'Comunicación enviada', estado: respuesta.status, codigo: respuesta.codigo }
      : {
          ok: false,
          motivo: 'rechazado',
          mensaje: respuesta.cuerpo.slice(0, 500) || 'El Ministerio rechazó la comunicación',
          estado: respuesta.status,
        };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error de red desconocido';
    return { ok: false, motivo: 'transporte', mensaje };
  }
}

/**
 * Anula el registro de una reserva.
 *
 * La anulación es una comunicación más ante el Ministerio, pero el estado interno
 * cambia ya: si se deja «completo», la bandeja seguiría dando por bueno un registro
 * que ya no lo es.
 */
export async function anularRegistro(
  tenantId: string,
  reservationId: string,
  usuarioId: string,
  motivo?: string
): Promise<boolean> {
  const reserva = await reservaDelTenant(tenantId, reservationId);
  if (!reserva) return false;

  await prisma.hospitalityCompliance.upsert({
    where: { reservationId },
    create: { tenantId, reservationId, estadoReserva: 'anulado', estadoViajeros: 'anulado' },
    update: { estadoReserva: 'anulado', estadoViajeros: 'anulado', procesadoEn: new Date() },
  });

  await prisma.hospitalityComplianceEvent.create({
    data: {
      tenantId,
      reservationId,
      tipo: 'anulacion',
      estado: 'anulado',
      detalle: motivo?.trim() || 'Registro anulado desde la bandeja del Ministerio',
      usuarioId,
    },
  });

  await logAuditAction(
    usuarioId,
    tenantId,
    'anular',
    'hospitality_compliance',
    reservationId,
    `Registro de viajeros anulado (reserva ${reserva.externalBookingId})`
  ).catch(() => {});

  return true;
}

/** ¿Este estado ya no tiene nada que hacer? Lo usa la interfaz para ordenar. */
export function esTerminal(estado: EstadoRegistro): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/** Estado normalizado de una comunicación guardada, para las rutas. */
export function estadoComunicacion(valor: string | null | undefined): EstadoRegistro {
  return normalizarEstado(valor, 'datos_pendientes');
}
