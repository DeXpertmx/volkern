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
  CertificadoInvalidoError,
  leerCertificado,
  metadatosParaGuardar,
} from './ses-hospedajes/certificado';
import {
  DatosInsuficientesError,
  construirPeticionSes,
  enviarComunicacion,
  esEntornoSes,
  probarAlcance,
  type CredencialesSes,
  type TipoComunicacion,
  type TransporteSes,
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
  /** Código de arrendador de la entidad: lo asigna el Ministerio (cabecera del lote). */
  codigoArrendador: string | null;
  tieneUsuario: boolean;
  tienePassword: boolean;
  tieneCertificado: boolean;
  /** ¿Está guardada la contraseña del .p12? Sin ella el certificado no se puede abrir. */
  tieneCertificadoPassword: boolean;
  /**
   * Datos públicos del certificado instalado, para que la configuración enseñe qué
   * hay puesto. Nunca incluye el fichero ni su contraseña.
   */
  certificado: {
    titular: string | null;
    nif: string | null;
    emisor: string | null;
    huella: string | null;
    vence: Date | null;
    caducado: boolean;
  } | null;
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
  /** Código de arrendador de la entidad ante el Ministerio (cabecera del lote SOAP). */
  codigoArrendador?: string | null;
  usuario?: string | null;
  password?: string | null;
  /** El .p12/.pfx de la entidad en Base64, tal como lo sube la configuración. */
  certificado?: string | null;
  /** Contraseña del .p12: sin ella el certificado no se puede abrir. */
  certificadoPassword?: string | null;
}

/** La configuración sin secretos: es lo único que puede salir hacia la interfaz. */
function aConfigPublica(config: {
  id: string;
  tenantId: string;
  activo: boolean;
  entorno: string;
  entidadNombre: string | null;
  entidadNif: string | null;
  codigoArrendador: string | null;
  usuarioEnc: string | null;
  passwordEnc: string | null;
  certificadoEnc: string | null;
  certificadoPasswordEnc?: string | null;
  certificadoTitular?: string | null;
  certificadoNif?: string | null;
  certificadoEmisor?: string | null;
  certificadoHuella?: string | null;
  certificadoVence?: Date | null;
  estadoConexion: string;
  ultimoEnvio: Date | null;
  ultimoCodigo: string | null;
  ultimoError: string | null;
}): RegistroConfig {
  const vence = config.certificadoVence ?? null;
  return {
    id: config.id,
    tenantId: config.tenantId,
    activo: config.activo,
    entorno: config.entorno,
    entidadNombre: config.entidadNombre,
    entidadNif: config.entidadNif,
    codigoArrendador: config.codigoArrendador,
    tieneUsuario: Boolean(config.usuarioEnc),
    tienePassword: Boolean(config.passwordEnc),
    tieneCertificado: Boolean(config.certificadoEnc),
    tieneCertificadoPassword: Boolean(config.certificadoPasswordEnc),
    certificado: config.certificadoEnc
      ? {
          titular: config.certificadoTitular ?? null,
          nif: config.certificadoNif ?? null,
          emisor: config.certificadoEmisor ?? null,
          huella: config.certificadoHuella ?? null,
          vence,
          caducado: vence ? vence.getTime() < Date.now() : false,
        }
      : null,
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
 *
 * El certificado se comprueba ANTES de guardarlo: es el único dato de la
 * configuración que, si está mal, no se descubre hasta el primer envío real, y
 * entonces el fallo es un error de TLS que no dice nada. Un .p12 con la contraseña
 * equivocada, sin clave privada o caducado se rechaza aquí, con su causa.
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
  if (entrada.codigoArrendador !== undefined) {
    datos.codigoArrendador = entrada.codigoArrendador?.trim() || null;
  }
  if (entrada.usuario) datos.usuarioEnc = encrypt(entrada.usuario.trim());
  if (entrada.password) datos.passwordEnc = encrypt(entrada.password.trim());

  const certificadoNuevo = typeof entrada.certificado === 'string' ? entrada.certificado.trim() : '';
  const passwordCertificado =
    entrada.certificadoPassword !== undefined ? (entrada.certificadoPassword?.trim() ?? '') : undefined;
  const tocaElCertificado = Boolean(certificadoNuevo) || passwordCertificado !== undefined;

  if (tocaElCertificado) {
    // El fichero puede venir en esta misma petición o estar ya guardado (cuando lo
    // único que se cambia es su contraseña). En el segundo caso se revalida el que
    // había, para no dejar en la base un certificado que no se puede abrir.
    const base64 = certificadoNuevo || decrypt(antes?.certificadoEnc ?? '');
    if (base64) {
      const contraseña =
        passwordCertificado ?? (antes?.certificadoPasswordEnc ? decrypt(antes.certificadoPasswordEnc) : '');
      const certificado = leerCertificado(base64, contraseña);
      if (certificadoNuevo) datos.certificadoEnc = encrypt(base64);
      datos.certificadoPasswordEnc = contraseña ? encrypt(contraseña) : null;
      Object.assign(datos, {
        certificadoTitular: certificado.metadatos.titular,
        certificadoNif: certificado.metadatos.nif,
        certificadoEmisor: certificado.metadatos.emisor,
        certificadoHuella: certificado.metadatos.huella,
        certificadoVence: certificado.metadatos.hasta,
      });
    }
  }

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
    `Configuración del registro de viajeros actualizada (entorno ${guardado.entorno}${entrada.password || entrada.certificado ? ', credenciales renovadas' : ''}${entrada.certificado ? ', certificado de la entidad instalado' : ''})`
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
      certificadoPasswordEnc: null,
      certificadoTitular: null,
      certificadoNif: null,
      certificadoEmisor: null,
      certificadoHuella: null,
      certificadoVence: null,
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
 * credencial, y salir a la red con ella solo produce un 401 que confunde. El
 * certificado se añade cuando está instalado; su ausencia no bloquea la llamada
 * (la cabecera Basic sigue siendo la autenticación), pero su presencia es lo que el
 * Ministerio necesita para saber quién comunica.
 */
export async function credencialesDeTenant(tenantId: string): Promise<CredencialesSes | null> {
  const config = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  if (!config?.usuarioEnc || !config?.passwordEnc) return null;

  try {
    return {
      usuario: decrypt(config.usuarioEnc),
      password: decrypt(config.passwordEnc),
      certificado: config.certificadoEnc ? decrypt(config.certificadoEnc) : null,
      certificadoPassword: config.certificadoPasswordEnc ? decrypt(config.certificadoPasswordEnc) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Prueba el alcance del servicio del Ministerio.
 *
 * Viaja con el certificado de la entidad cuando lo tiene instalado: una prueba que
 * no lo presentara diría «el servicio responde» mientras el envío real falla en el
 * TLS, que es exactamente la confusión que esto evita.
 */
export async function probarServicioDelMinisterio(
  tenantId: string,
  entorno?: string | null,
  /** Inyectable para pruebas; por defecto el `https` del runtime. */
  transporte?: TransporteSes
) {
  const config = await prisma.hospitalityComplianceConfig.findUnique({ where: { tenantId } });
  let credenciales: CredencialesSes | null = null;
  if (config?.certificadoEnc) {
    credenciales = {
      usuario: config.usuarioEnc ? decrypt(config.usuarioEnc) : '',
      password: config.passwordEnc ? decrypt(config.passwordEnc) : '',
      certificado: decrypt(config.certificadoEnc),
      certificadoPassword: config.certificadoPasswordEnc ? decrypt(config.certificadoPasswordEnc) : null,
    };
  }
  return probarAlcance(entorno ?? config?.entorno, { credenciales, transporte });
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
    select: {
      id: true,
      externalBookingId: true,
      estado: true,
      // Lo que el mensaje al Ministerio necesita del contrato (fechas y
      // establecimiento): viene con la reserva, no hace falta releerla.
      checkIn: true,
      checkOut: true,
      bookedOn: true,
      property: { select: { sesHospedajes: true } },
    },
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
  /** Domicilio del viajero: el parte de viajeros (PV) lo exige por persona. */
  direccion?: string | null;
  municipio?: string | null;
  codigoMunicipio?: string | null;
  codigoPostal?: string | null;
  paisDireccion?: string | null;
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
      direccion: entrada.direccion?.trim() || null,
      municipio: entrada.municipio?.trim() || null,
      codigoMunicipio: entrada.codigoMunicipio?.trim() || null,
      codigoPostal: entrada.codigoPostal?.trim() || null,
      paisDireccion: entrada.paisDireccion?.trim()?.toUpperCase() || null,
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
  if (entrada.direccion !== undefined) datos.direccion = entrada.direccion?.trim() || null;
  if (entrada.municipio !== undefined) datos.municipio = entrada.municipio?.trim() || null;
  if (entrada.codigoMunicipio !== undefined) datos.codigoMunicipio = entrada.codigoMunicipio?.trim() || null;
  if (entrada.codigoPostal !== undefined) datos.codigoPostal = entrada.codigoPostal?.trim() || null;
  if (entrada.paisDireccion !== undefined) datos.paisDireccion = entrada.paisDireccion?.trim()?.toUpperCase() || null;
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
  return {
    reserva: {
      ...reserva,
      // La completitud de un viajero se deriva de sus datos, no se lee de la
      // columna: si el Ministerio endurece los campos obligatorios (como pasó al
      // exigir el domicilio en el parte), la columna guardada se queda atrás y la
      // ficha diría «listo» mientras la bandeja cuenta pendientes. La bandeja ya
      // deriva; la ficha tiene que decir lo mismo, y sin escribir en una lectura.
      travelers: reserva.travelers.map((viajero) => ({
        ...viajero,
        estado: estadoDeViajero(viajero),
      })),
    },
    resumen,
  };
}

export interface ResultadoEnvio {
  ok: boolean;
  motivo?: 'sin_configuracion' | 'sin_datos' | 'sin_reserva' | 'rechazado' | 'transporte';
  mensaje: string;
  estado?: number;
  codigo?: string;
}

/**
 * Envía una comunicación al Ministerio (RH, PV o anulación).
 *
 * El orden importa y es el que evita los dos fallos caros: primero se comprueba
 * que haya con qué enviar (configuración y datos) y solo entonces se construye el
 * mensaje con el esquema oficial. Lo que el Ministerio responda —acepte o
 * rechace— se escribe en la bitácora con su código y su causa; lo único que no se
 * registra es lo que nunca llegó a salir.
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
  if (!config.codigoArrendador?.trim()) {
    return {
      ok: false,
      motivo: 'sin_configuracion',
      mensaje: 'Falta el código de arrendador de la entidad en la configuración (lo asigna el Ministerio)',
    };
  }

  // El establecimiento lo da la propiedad de la reserva: código oficial del
  // alojamiento (sesHospedajes.codigo) tal como lo asignó el Ministerio.
  const sesHospedajes = (reserva.property?.sesHospedajes ?? null) as Record<string, unknown> | null;
  const codigoEstablecimiento = typeof sesHospedajes?.codigo === 'string' ? sesHospedajes.codigo.trim() : '';

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
  if (tipo === 'reserva' && viajeros.length === 0) {
    return {
      ok: false,
      motivo: 'sin_datos',
      mensaje: 'La reserva no tiene ninguna persona que comunicar (titular o viajeros)',
    };
  }

  // Los códigos para anular salen de la bitácora: es el código que el Ministerio
  // asignó cuando aceptó la comunicación que ahora se retira.
  let codigosAnulacion: string[] = [];
  if (tipo === 'anulacion') {
    const registro = await prisma.hospitalityCompliance.findUnique({ where: { reservationId } });
    codigosAnulacion = registro?.codigoComunicacion ? [registro.codigoComunicacion] : [];
  }

  let peticionSobre: string;
  try {
    const peticion = construirPeticionSes(tipo, {
      reserva: {
        referencia: reserva.externalBookingId,
        checkIn: reserva.checkIn,
        checkOut: reserva.checkOut,
        bookedOn: reserva.bookedOn,
      },
      viajeros: viajeros as unknown as Array<Record<string, unknown>>,
      codigoEstablecimiento,
      codigoArrendador: config.codigoArrendador,
      codigosAnulacion,
    });
    peticionSobre = peticion.sobre;
    // El XML de la solicitud NO se persiste: lleva los documentos sin
    // enmascarar, y la bitácora no es lugar para ellos. Lo que queda registrado
    // es el lote, el código de comunicación y el error, que es lo que se audita.
  } catch (error) {
    if (error instanceof DatosInsuficientesError) {
      return {
        ok: false,
        motivo: 'sin_datos',
        mensaje:
          error.pieza === 'establecimiento'
            ? 'La propiedad no tiene código de establecimiento del Ministerio: configúralo en la propiedad'
            : error.message,
      };
    }
    throw error;
  }

  const campoEstado = tipo === 'reserva' ? 'estadoReserva' : 'estadoViajeros';

  try {
    const respuesta = await enviarComunicacion({ entorno: config.entorno, credenciales, peticionSobre });

    const aceptado = respuesta.aceptado && respuesta.ok;
    await prisma.hospitalityCompliance.upsert({
      where: { reservationId },
      create: {
        tenantId,
        reservationId,
        [campoEstado]: aceptado ? 'enviado' : 'error',
        enviadoEn: new Date(),
        loteId: respuesta.lote ?? null,
        codigoComunicacion: respuesta.codigo ?? null,
        codigoError: aceptado ? null : respuesta.codigoEstado != null ? String(respuesta.codigoEstado) : String(respuesta.status),
        mensajeError: aceptado ? null : (respuesta.mensaje || respuesta.cuerpo).slice(0, 500),
      },
      update: {
        [campoEstado]: aceptado ? 'enviado' : 'error',
        enviadoEn: new Date(),
        loteId: respuesta.lote ?? null,
        codigoComunicacion: respuesta.codigo ?? null,
        codigoError: aceptado ? null : respuesta.codigoEstado != null ? String(respuesta.codigoEstado) : String(respuesta.status),
        mensajeError: aceptado ? null : (respuesta.mensaje || respuesta.cuerpo).slice(0, 500),
      },
    });

    await prisma.hospitalityComplianceEvent.create({
      data: {
        tenantId,
        reservationId,
        tipo,
        estado: aceptado ? 'enviado' : 'error',
        codigoComunicacion: respuesta.codigo ?? null,
        codigoError: aceptado ? null : respuesta.codigoEstado != null ? String(respuesta.codigoEstado) : String(respuesta.status),
        mensajeError: aceptado ? null : (respuesta.mensaje || respuesta.cuerpo).slice(0, 500),
        detalle: `Comunicación ${tipo.toUpperCase()} al Ministerio (${config.entorno}) con ${viajeros.length} viajeros`,
        usuarioId,
      },
    });

    await prisma.hospitalityComplianceConfig.update({
      where: { tenantId },
      data: {
        ultimoEnvio: new Date(),
        ultimoCodigo: respuesta.codigo ?? (respuesta.codigoEstado != null ? String(respuesta.codigoEstado) : String(respuesta.status)),
        ultimoError: aceptado ? null : (respuesta.mensaje || respuesta.cuerpo).slice(0, 300),
      },
    });

    await logAuditAction(
      usuarioId,
      tenantId,
      'enviar',
      'hospitality_compliance',
      reservationId,
      `Comunicación «${tipo}» de la reserva ${reserva.externalBookingId}: ${aceptado ? `aceptada (lote ${respuesta.lote ?? 's/n'})` : `rechazada (${respuesta.mensaje || respuesta.status})`}`
    ).catch(() => {});

    return aceptado
      ? { ok: true, mensaje: respuesta.descripcion || 'Comunicación enviada', estado: respuesta.status, codigo: respuesta.codigo }
      : {
          ok: false,
          motivo: 'rechazado',
          mensaje: (respuesta.mensaje || respuesta.cuerpo).slice(0, 500) || 'El Ministerio rechazó la comunicación',
          estado: respuesta.status,
        };
  } catch (error) {
    // Un certificado que ya no sirve (caducado, contraseña cambiada, fichero sin
    // clave) no es un fallo de red: es configuración, y se dice así para que el
    // administrador sepa qué arreglar. Queda además en el último error de la
    // configuración, que es donde la sección lo enseña.
    if (error instanceof CertificadoInvalidoError) {
      await prisma.hospitalityComplianceConfig
        .update({ where: { tenantId }, data: { ultimoError: error.message.slice(0, 300) } })
        .catch(() => {});
      return { ok: false, motivo: 'sin_configuracion', mensaje: error.message };
    }
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
