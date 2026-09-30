/**
 * i18n del Booking Engine público (ES/EN).
 *
 * Módulo puro: sin Prisma, sin React, sin I/O. La página pública importa los
 * textos de aquí y el resto del sistema (config del motor, embeds, docs) usa
 * `idiomaDesdeUrl` para construir enlaces `?lang=en`.
 *
 * Reglas:
 *  - El idioma por defecto es SIEMPRE `es`: un enlace antiguo sin `?lang`,
 *    corrupto o con un valor desconocido no puede dejar la página en un
 *    idioma indeterminado.
 *  - `Record<Idioma, BookingTextos>` garantiza a nivel de tipos que los dos
 *    idiomas tienen exactamente las mismas claves: añadir un texto sin
 *    traducirlo no compila.
 *  - Las plantillas con `{variable}` se interpolan con `interpolar`; nada de
 *    concatenar trozos por idioma en la página.
 */

import type { CampoViajero } from './guest-checkin';
import { formatearImporte, MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';

export const IDIOMAS = ['es', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = 'es';

export interface BookingTextos {
  /** Badge de cabecera. */
  reservaDirecta: string;
  /** Página no disponible (alojamiento con las reservas apagadas). */
  noDisponible: string;
  /** Página inexistente (slug que no resuelve a ningún alojamiento). */
  noEncontrada: string;
  /** Títulos de las dos pantallas anteriores. */
  noDisponibleTitulo: string;
  noEncontradaTitulo: string;
  /** Pantalla de confirmación. */
  reservaConfirmada: string;
  referencia: string;
  total: string;
  irAlPago: string;
  teContactaremos: string;
  /** Paso 1: fechas. */
  llegada: string;
  salida: string;
  verDisponibilidad: string;
  /** Errores (toast). */
  errorCargarPropiedad: string;
  errorSalidaAntesLlegada: string;
  errorDisponibilidad: string;
  errorReserva: string;
  errorDatosHuuesped: string;
  /** Paso 2: cotización. */
  /** «{noches} noches · {libres} de {total} unidades disponibles» */
  resumenDisponibilidad: string;
  noche: string;
  noches: string;
  porNoche: string;
  /** «Precio por noche»: encabezado del desglose noche a noche de la estancia. */
  desglosePorNoche: string;
  /** Ficha pública de la propiedad: galería de fotos, ubicación y servicios. */
  galeria: string;
  /** «Ver las {n} fotos»: abre el visor a pantalla completa. */
  verFotos: string;
  sinFotos: string;
  cerrar: string;
  fotoAnterior: string;
  fotoSiguiente: string;
  ubicacion: string;
  verMapa: string;
  servicios: string;
  /** Cómo llegar: bloque de indicaciones escritas por el hotel (idioma del huésped). */
  comoLlegar: string;
  /** Distancias a transporte: «Distancias» y etiquetas de cada tipo. */
  distancias: string;
  distanciaAeropuerto: string;
  distanciaAutobus: string;
  distanciaMetro: string;
  distanciaTren: string;
  distanciaAutopista: string;
  distanciaPuerto: string;
  /** Listado de unidades publicadas, antes de elegir fechas. */
  disponiblesTitulo: string;
  /** «{n} unidades publicadas»: el singular y el plural viven en el idioma. */
  unidad: string;
  unidades: string;
  /** Prefijo del precio de una tarjeta: «desde 1.200 MXN / noche». */
  desde: string;
  consultarFechas: string;
  /** «Hasta {n} personas», en la ficha de la propiedad. */
  capacidadMaxima: string;
  hastaPersonas: string; // «hasta {n} personas»
  elegir: string;
  elegida: string;
  /** Paso 3: datos del huésped. */
  tusDatos: string; // «Tus datos · {unidad}»
  nombreCompleto: string;
  email: string;
  telefono: string;
  peticiones: string;
  peticionesPlaceholder: string;
  confirmarReserva: string;
  /** Paso 3.bis: los datos del registro de viajeros (opcionales en la reserva). */
  documentoTitulo: string;
  documentoAyuda: string;
  documentoOpcional: string;
  errorDocumento: string;
  /** Pantalla de confirmación: el enlace para completar el resto de huéspedes. */
  enlaceCheckinTitulo: string;
  enlaceCheckinAyuda: string;
  /** Motivos por los que una unidad no está disponible (del Availability Engine). */
  motivos: Record<string, string>;
  /** Extras comprables (desayuno, late check-out…): el hotel define el catálogo. */
  extrasTitulo: string;
  extrasAyuda: string;
  /** «{precio} / noche» en los extras por estancia completa. */
  extraPorNoche: string;
  extraCantidad: string;
  extrasTotal: string;
}

export const TEXTOS: Record<Idioma, BookingTextos> = {
  es: {
    reservaDirecta: 'Reserva directa',
    noDisponible: 'Esta página de reservas no está disponible.',
    noEncontrada: 'Esta página de reservas no existe.',
    noDisponibleTitulo: 'Reservas no disponibles',
    noEncontradaTitulo: 'Página no encontrada',
    reservaConfirmada: '¡Reserva confirmada!',
    referencia: 'Referencia',
    total: 'Total',
    irAlPago: 'Ir al pago seguro',
    teContactaremos: 'Te contactaremos para coordinar el pago y tu llegada.',
    llegada: 'Llegada',
    salida: 'Salida',
    verDisponibilidad: 'Ver disponibilidad',
    errorCargarPropiedad: 'No se pudo cargar la propiedad',
    errorSalidaAntesLlegada: 'La salida debe ser posterior a la llegada',
    errorDisponibilidad: 'Error al consultar disponibilidad',
    errorReserva: 'No se pudo completar la reserva',
    errorDatosHuuesped: 'Completa tu nombre y email',
    resumenDisponibilidad: '{noches} · {libres} de {total} unidades disponibles',
    noche: 'noche',
    noches: 'noches',
    porNoche: 'noche',
    desglosePorNoche: 'Precio por noche',
    galeria: 'Fotos de la propiedad',
    verFotos: 'Ver las {n} fotos',
    sinFotos: 'La propiedad aún no ha publicado fotos',
    cerrar: 'Cerrar',
    fotoAnterior: 'Foto anterior',
    fotoSiguiente: 'Foto siguiente',
    ubicacion: 'Ubicación',
    verMapa: 'Ver en el mapa',
    servicios: 'Servicios del alojamiento',
    comoLlegar: 'Cómo llegar',
    distancias: 'Distancias',
    distanciaAeropuerto: 'Aeropuerto',
    distanciaAutobus: 'Autobús',
    distanciaMetro: 'Metro',
    distanciaTren: 'Tren',
    distanciaAutopista: 'Autopista',
    distanciaPuerto: 'Puerto',
    disponiblesTitulo: 'Alojamientos disponibles',
    unidad: 'unidad',
    unidades: 'unidades',
    desde: 'desde',
    consultarFechas: 'Consultar fechas',
    capacidadMaxima: 'Hasta {n} personas',
    hastaPersonas: 'hasta {n} personas',
    elegir: 'Elegir',
    elegida: 'Elegida',
    tusDatos: 'Tus datos · {unidad}',
    nombreCompleto: 'Nombre completo *',
    email: 'Email *',
    telefono: 'Teléfono',
    peticiones: 'Peticiones (opcional)',
    peticionesPlaceholder: 'Hora de llegada aproximada…',
    confirmarReserva: 'Confirmar reserva',
    documentoTitulo: 'Datos para el registro de viajeros',
    documentoAyuda:
      'La ley obliga a comunicar los datos de los huéspedes al Ministerio del Interior. Puedes rellenarlos ahora o después con el enlace que te enviaremos.',
    documentoOpcional: 'Opcional ahora · te lo pediremos antes de tu llegada',
    errorDocumento: 'Revisa los datos del documento',
    enlaceCheckinTitulo: 'Completa los datos del resto de huéspedes',
    enlaceCheckinAyuda:
      'Guarda este enlace: podrás añadir los documentos de tus acompañantes y te lo enviaremos por email antes de tu llegada.',
    motivos: {
      ocupada: 'No disponible en esas fechas',
      min_noches: 'Estancia mínima no cumplida',
      max_noches: 'Estancia máxima superada',
      dia_checkin: 'Día de llegada no permitido',
      dia_checkout: 'Día de salida no permitido',
      sin_tarifa: 'Sin tarifa publicada',
    },
    extrasTitulo: 'Añade algo más a tu estancia',
    extrasAyuda: 'Opcional. Puedes añadirlo ahora y pagarlo con la reserva.',
    extraPorNoche: '{precio} / noche',
    extraCantidad: 'Cantidad',
    extrasTotal: 'Extras',
  },
  en: {
    reservaDirecta: 'Book direct',
    noDisponible: 'This booking page is not available.',
    noEncontrada: 'This booking page does not exist.',
    noDisponibleTitulo: 'Bookings unavailable',
    noEncontradaTitulo: 'Page not found',
    reservaConfirmada: 'Booking confirmed!',
    referencia: 'Reference',
    total: 'Total',
    irAlPago: 'Go to secure payment',
    teContactaremos: "We'll contact you to arrange payment and your arrival.",
    llegada: 'Check-in',
    salida: 'Check-out',
    verDisponibilidad: 'View availability',
    errorCargarPropiedad: "Couldn't load the property",
    errorSalidaAntesLlegada: 'Check-out must be after check-in',
    errorDisponibilidad: 'Error checking availability',
    errorReserva: "Couldn't complete the booking",
    errorDatosHuuesped: 'Please enter your name and email',
    resumenDisponibilidad: '{noches} · {libres} of {total} units available',
    noche: 'night',
    noches: 'nights',
    porNoche: 'night',
    desglosePorNoche: 'Price per night',
    galeria: 'Property photos',
    verFotos: 'View all {n} photos',
    sinFotos: 'The property has not published photos yet',
    cerrar: 'Close',
    fotoAnterior: 'Previous photo',
    fotoSiguiente: 'Next photo',
    ubicacion: 'Location',
    verMapa: 'View on map',
    comoLlegar: 'How to get there',
    distancias: 'Distances',
    distanciaAeropuerto: 'Airport',
    distanciaAutobus: 'Bus',
    distanciaMetro: 'Metro',
    distanciaTren: 'Train',
    distanciaAutopista: 'Highway',
    distanciaPuerto: 'Port',
    servicios: 'Amenities',
    disponiblesTitulo: 'Available accommodations',
    unidad: 'unit',
    unidades: 'units',
    desde: 'from',
    consultarFechas: 'Check dates',
    capacidadMaxima: 'Up to {n} guests',
    hastaPersonas: 'up to {n} guests',
    elegir: 'Select',
    elegida: 'Selected',
    tusDatos: 'Your details · {unidad}',
    nombreCompleto: 'Full name *',
    email: 'Email *',
    telefono: 'Phone',
    peticiones: 'Requests (optional)',
    peticionesPlaceholder: 'Approximate arrival time…',
    confirmarReserva: 'Confirm booking',
    documentoTitulo: 'Guest registry details',
    documentoAyuda:
      'Spanish law requires guest details to be reported to the Ministry of the Interior. You can fill them in now or later with the link we will send you.',
    documentoOpcional: 'Optional now · we will ask before your arrival',
    errorDocumento: 'Please check the document details',
    enlaceCheckinTitulo: 'Complete the details of your other guests',
    enlaceCheckinAyuda:
      'Save this link: you can add your companions documents there, and we will email it to you before your arrival.',
    motivos: {
      ocupada: 'Not available for those dates',
      min_noches: 'Minimum stay not met',
      max_noches: 'Maximum stay exceeded',
      dia_checkin: 'Arrival day not allowed',
      dia_checkout: 'Departure day not allowed',
      sin_tarifa: 'No published rate',
    },
    extrasTitulo: 'Add something extra to your stay',
    extrasAyuda: 'Optional. Add it now and pay it with your booking.',
    extraPorNoche: '{precio} / night',
    extraCantidad: 'Quantity',
    extrasTotal: 'Extras',
  },
};

/**
 * Textos de las dos pantallas de «no hay página» (misma decisión, dos casos).
 *
 * El `mensaje` que devuelve el servidor está escrito en español y es interno;
 * esto es lo que lee quien entró con `?lang=en`. El defecto sigue siendo `es`,
 * así que un enlace antiguo sin `lang` se comporta como siempre.
 */
export function textosPaginaNoDisponible(
  idioma: Idioma,
  motivo: 'no_existe' | 'inactiva',
): { titulo: string; mensaje: string } {
  const t = TEXTOS[idioma];
  return motivo === 'inactiva'
    ? { titulo: t.noDisponibleTitulo, mensaje: t.noDisponible }
    : { titulo: t.noEncontradaTitulo, mensaje: t.noEncontrada };
}

// ═══════════════════════════════════════════════════════════════════════════
// Asistente de reserva directa (BookingWizard)
//
// El asistente es la MISMA experiencia en la página top-level (/reservar/<slug>)
// y en el widget embebible (/embed/reservar/<slug>): vive en un único componente
// y, por tanto, en una única lista de textos. No reutiliza `BookingTextos`
// porque el asistente no recorre el catálogo ni pide documentos —otro flujo, otras
// frases—, pero se queda en este módulo para que un texto nuevo en cualquiera de
// las dos superficies siga sin poder existir en un solo idioma.
//
// El idioma lo resuelve el SERVIDOR (lee `?lang` de la URL) y baja como prop: el
// primer render ya sale en el idioma pedido, sin el efecto isomórfico que necesita
// la página pública —que se pinta en el cliente y no tiene un padre del que
// heredar—. El conmutador ES/EN es un enlace real, así que también funciona dentro
// del iframe del embed.
// ═══════════════════════════════════════════════════════════════════════════

export interface WizardTextos {
  /** Cabecera de pasos. */
  pasoFechas: string;
  pasoUnidad: string;
  pasoDatos: string;
  pasoConfirmacion: string;
  /** Alojamiento sin unidades publicadas. */
  sinUnidadesTitulo: string;
  /** «Escríbenos a {email} y te ayudamos.» */
  sinUnidadesEmail: string;
  sinUnidadesAyuda: string;
  /** Errores. */
  errorDisponibilidad: string;
  errorReserva: string;
  errorSinConexion: string;
  /** Paso 1. */
  cuandoVienes: string;
  alojamiento: string;
  entrada: string;
  salida: string;
  adultos: string;
  ninos: string;
  verDisponibilidad: string;
  /** Paso 2. */
  noche: string;
  noches: string;
  /** «Precio por noche»: encabezado del desglose noche a noche de la estancia. */
  desglosePorNoche: string;
  cambiarFechas: string;
  sinDisponibilidad: string;
  /** «Hasta {n} huéspedes» */
  hastaHuespedes: string;
  limpieza: string;
  total: string;
  /** «Anticipo ahora ({porcentaje}%)» */
  anticipoAhora: string;
  reservarEstaUnidad: string;
  /** Paso 3. */
  tusDatos: string;
  nombreApellidos: string;
  email: string;
  telefono: string;
  peticiones: string;
  peticionesPlaceholder: string;
  /** Recordatorio de que hace falta un contacto para poder confirmar. */
  dejaContacto: string;
  volver: string;
  pagarYReservar: string;
  confirmarReserva: string;
  /** Paso 4. */
  reservaRecibida: string;
  reservaConfirmada: string;
  referencia: string;
  verDetalle: string;
  guardaEnlace: string;
}

export const WIZARD_TEXTOS: Record<Idioma, WizardTextos> = {
  es: {
    pasoFechas: 'Fechas',
    pasoUnidad: 'Unidad',
    pasoDatos: 'Tus datos',
    pasoConfirmacion: 'Confirmación',
    sinUnidadesTitulo: 'Este alojamiento todavía no tiene unidades publicadas',
    sinUnidadesEmail: 'Escríbenos a {email} y te ayudamos.',
    sinUnidadesAyuda: 'Vuelve a intentarlo en un rato.',
    errorDisponibilidad: 'No se pudo comprobar la disponibilidad.',
    errorReserva: 'No se pudo completar la reserva.',
    errorSinConexion: 'No hay conexión con el servidor. Inténtalo de nuevo.',
    cuandoVienes: '¿Cuándo vienes?',
    alojamiento: 'Alojamiento',
    entrada: 'Entrada',
    salida: 'Salida',
    adultos: 'Adultos',
    ninos: 'Niños',
    verDisponibilidad: 'Ver disponibilidad',
    noche: 'noche',
    noches: 'noches',
    desglosePorNoche: 'Precio por noche',
    cambiarFechas: 'Cambiar fechas',
    sinDisponibilidad: 'No hay unidades libres para esas fechas. Prueba otras fechas.',
    hastaHuespedes: 'Hasta {n} huéspedes',
    limpieza: 'Limpieza',
    total: 'Total',
    anticipoAhora: 'Anticipo ahora ({porcentaje}%)',
    reservarEstaUnidad: 'Reservar esta unidad',
    tusDatos: 'Tus datos',
    nombreApellidos: 'Nombre y apellidos',
    email: 'Email',
    telefono: 'Teléfono',
    peticiones: '¿Algo que debamos saber?',
    peticionesPlaceholder: 'Hora de llegada, cuna, mascotas…',
    dejaContacto: 'Deja un email o un teléfono: es por donde te llega la confirmación.',
    volver: 'Volver',
    pagarYReservar: 'Pagar y reservar',
    confirmarReserva: 'Confirmar reserva',
    reservaRecibida: 'Reserva recibida',
    reservaConfirmada: 'Reserva confirmada',
    referencia: 'Referencia',
    verDetalle: 'Ver el detalle de mi reserva',
    guardaEnlace: 'Guarda ese enlace: es tu comprobante.',
  },
  en: {
    pasoFechas: 'Dates',
    pasoUnidad: 'Unit',
    pasoDatos: 'Your details',
    pasoConfirmacion: 'Confirmation',
    sinUnidadesTitulo: 'This property has no published units yet',
    sinUnidadesEmail: 'Email us at {email} and we will help you.',
    sinUnidadesAyuda: 'Please try again in a little while.',
    errorDisponibilidad: "We couldn't check availability.",
    errorReserva: "We couldn't complete the booking.",
    errorSinConexion: 'No connection to the server. Please try again.',
    cuandoVienes: 'When are you coming?',
    alojamiento: 'Property',
    entrada: 'Check-in',
    salida: 'Check-out',
    adultos: 'Adults',
    ninos: 'Children',
    verDisponibilidad: 'View availability',
    noche: 'night',
    noches: 'nights',
    desglosePorNoche: 'Price per night',
    cambiarFechas: 'Change dates',
    sinDisponibilidad: 'No units free for those dates. Please try other dates.',
    hastaHuespedes: 'Up to {n} guests',
    limpieza: 'Cleaning',
    total: 'Total',
    anticipoAhora: 'Deposit now ({porcentaje}%)',
    reservarEstaUnidad: 'Book this unit',
    tusDatos: 'Your details',
    nombreApellidos: 'Full name',
    email: 'Email',
    telefono: 'Phone',
    peticiones: 'Anything we should know?',
    peticionesPlaceholder: 'Arrival time, cot, pets…',
    dejaContacto:
      'Leave an email or a phone number: that is where your confirmation goes.',
    volver: 'Back',
    pagarYReservar: 'Pay and book',
    confirmarReserva: 'Confirm booking',
    reservaRecibida: 'Booking received',
    reservaConfirmada: 'Booking confirmed',
    referencia: 'Reference',
    verDetalle: 'View my booking details',
    guardaEnlace: 'Save that link: it is your receipt.',
  },
};

/** Plural de «noche» en el idioma del huésped (una sola regla para las dos pantallas). */
export function nocheONoches(idioma: Idioma, noches: number): string {
  const t = WIZARD_TEXTOS[idioma];
  return noches === 1 ? t.noche : t.noches;
}

// ═══════════════════════════════════════════════════════════════════════════
// Check-in online (registro de viajeros, RD 933/2021)
//
// El huésped rellena aquí los documentos de todos los viajeros. Mismos textos
// en los dos idiomas y los mismos criterios que el motor: el idioma por defecto
// es español y `Record<Idioma, CheckinTextos>` impide añadir un texto sin
// traducirlo. Las etiquetas se indexan por `CampoViajero`, así que un campo
// nuevo en `guest-checkin.ts` no compila hasta que sabe decirse en los dos
// idiomas — que es justo lo que se quiere.
// ═══════════════════════════════════════════════════════════════════════════

export interface CheckinTextos {
  titulo: string;
  intro: string;
  /** Datos de la estancia (referencia, alojamiento, fechas). */
  estancia: string;
  unidad: string;
  titular: string;
  /** «Acompañante {n}» */
  acompanante: string;
  agregar: string;
  quitar: string;
  /** Checkbox de la dirección compartida. */
  mismaDireccion: string;
  /** Etiqueta de cada campo del formulario. */
  campos: Record<CampoViajero, string>;
  /** Los dos campos que juntos cubren `contacto` (basta uno de los dos). */
  campoTelefono: string;
  campoEmail: string;
  /** Ayudas cortas bajo el campo. */
  ayudaSoporte: string;
  ayudaPais: string;
  ayudaMunicipio: string;
  ayudaDocumento: string;
  placeholderDocumento: string;
  placeholderSexo: string;
  ayudaOficial: string;
  guardar: string;
  guardando: string;
  /** «Guardado. Revisa todavía: {campos}» */
  guardadoParcial: string;
  guardadoCompleto: string;
  /** «Documentación completa» / «Faltan datos» (estado de cabecera). */
  completa: string;
  incompleta: string;
  /** «Aún hay que revisar: {campos}» */
  pendiente: string;
  enviado: string;
  noDisponible: string;
  caducada: string;
  /** «Preguntas de tu estancia» (bloque de preguntas personalizadas del hotel). */
  preguntasTitulo: string;
  /** «(opcional)» tras la etiqueta de una pregunta no requerida. */
  preguntaOpcional: string;
  /** «Elige una opción» (primera opción deshabilitada del select). */
  preguntaElige: string;
  /** «Falta por responder: {preguntas}» (requeridas sin respuesta). */
  preguntasFaltan: string;
  errorGuardar: string;
  privacidad: string;
}

export const CHECKIN_TEXTOS: Record<Idioma, CheckinTextos> = {
  es: {
    titulo: 'Registro de viajeros',
    intro:
      'La ley obliga a comunicar al Ministerio del Interior los datos de todas las personas que se alojan. Rellena los documentos de cada huésped; te llevará dos minutos.',
    estancia: 'Tu estancia',
    unidad: 'Alojamiento',
    titular: 'Titular de la reserva',
    acompanante: 'Acompañante {n}',
    agregar: 'Añadir acompañante',
    quitar: 'Quitar',
    mismaDireccion: 'Misma dirección que el titular',
    campos: {
      nombre: 'Nombre *',
      apellido1: 'Primer apellido *',
      apellido2: 'Segundo apellido',
      tipoDocumento: 'Tipo de documento *',
      numeroDocumento: 'Número de documento *',
      soporteDocumento: 'Número de soporte *',
      fechaNacimiento: 'Fecha de nacimiento *',
      nacionalidad: 'Nacionalidad',
      sexo: 'Sexo',
      'direccion.calle': 'Dirección *',
      'direccion.codigoPostal': 'Código postal *',
      'direccion.pais': 'País *',
      'direccion.municipio': 'Municipio *',
      contacto: 'Contacto: teléfono o email *',
      parentesco: 'Parentesco (solo si es menor de edad)',
    },
    campoTelefono: 'Teléfono *',
    campoEmail: 'Email *',
    ayudaSoporte: 'DNI: anverso, bajo «NUM SOPORT» o «IDESP». NIE/TIE: número de soporte del anverso de la tarjeta (empieza por E). No se pide con pasaporte.',
    ayudaPais: 'Código de 3 letras: ESP, FRA, USA…',
    ayudaMunicipio: 'Escribe el nombre del municipio; en España se asigna automáticamente su código oficial.',
    ayudaDocumento: 'Selecciona el tipo que aparece en el documento de identidad.',
    placeholderDocumento: 'Selecciona tipo de documento',
    placeholderSexo: 'Selecciona sexo',
    ayudaOficial: 'Ver guía oficial para localizarlo',
    preguntasTitulo: 'Preguntas de tu estancia',
    preguntaOpcional: '(opcional)',
    preguntaElige: 'Elige una opción',
    preguntasFaltan: 'Falta por responder: {preguntas}',
    guardar: 'Guardar y enviar',
    guardando: 'Guardando…',
    guardadoParcial: 'Guardado. Revisa todavía: {campos}',
    guardadoCompleto: '¡Listo! Ya tenemos todos los datos de tu grupo.',
    completa: 'Documentación completa',
    incompleta: 'Faltan datos',
    pendiente: 'Aún hay que revisar: {campos}',
    enviado: 'Hemos comunicado tu estancia al Ministerio del Interior.',
    noDisponible: 'Este enlace de check-in no es válido.',
    caducada: 'Esta reserva ya no está activa: si crees que es un error, contacta con el alojamiento.',
    errorGuardar: 'No se pudieron guardar los datos. Inténtalo de nuevo.',
    privacidad:
      'Usamos estos datos solo para cumplir la obligación legal de registro de viajeros y para tu estancia.',
  },
  en: {
    titulo: 'Guest registry',
    intro:
      'Spanish law requires the details of every person staying to be reported to the Ministry of the Interior. Please fill in each guest document; it takes two minutes.',
    estancia: 'Your stay',
    unidad: 'Accommodation',
    titular: 'Lead guest',
    acompanante: 'Guest {n}',
    agregar: 'Add guest',
    quitar: 'Remove',
    mismaDireccion: 'Same address as the lead guest',
    campos: {
      nombre: 'First name *',
      apellido1: 'First surname *',
      apellido2: 'Second surname',
      tipoDocumento: 'Document type *',
      numeroDocumento: 'Document number *',
      soporteDocumento: 'Support number *',
      fechaNacimiento: 'Date of birth *',
      nacionalidad: 'Nationality',
      sexo: 'Sex',
      'direccion.calle': 'Address *',
      'direccion.codigoPostal': 'Postcode *',
      'direccion.pais': 'Country *',
      'direccion.municipio': 'Municipality *',
      contacto: 'Contact: phone or email *',
      parentesco: 'Relationship (only if under 18)',
    },
    campoTelefono: 'Phone *',
    campoEmail: 'Email *',
    ayudaSoporte: 'DNI: front, under “NUM SOPORT” or “IDESP”. NIE/TIE: support number on the front of the card (starts with E). Not required for passports.',
    ayudaPais: '3-letter code: ESP, FRA, USA…',
    ayudaMunicipio: 'Enter the municipality name; for Spain, its official code is assigned automatically.',
    ayudaDocumento: 'Choose the type shown on the identity document.',
    placeholderDocumento: 'Select document type',
    placeholderSexo: 'Select sex',
    ayudaOficial: 'View official guide to find it',
    preguntasTitulo: 'Questions about your stay',
    preguntaOpcional: '(optional)',
    preguntaElige: 'Choose an option',
    preguntasFaltan: 'Still to answer: {preguntas}',
    guardar: 'Save and submit',
    guardando: 'Saving…',
    guardadoParcial: 'Saved. Still to check: {campos}',
    guardadoCompleto: 'All set! We have every detail for your group.',
    completa: 'Documentation complete',
    incompleta: 'Details missing',
    pendiente: 'Still to check: {campos}',
    enviado: 'We have reported your stay to the Ministry of the Interior.',
    noDisponible: 'This check-in link is not valid.',
    caducada: 'This booking is no longer active: please contact the property if this looks wrong.',
    errorGuardar: "We couldn't save your details. Please try again.",
    privacidad:
      'We use these details only to comply with the guest registry obligation and for your stay.',
  },
};

/**
 * Etiquetas legibles para los campos pendientes (los mensajes de «revisa…»).
 * Se piden sin el asterisco, que en una frase de estado sobra.
 */
export function etiquetasDeCampos(campos: readonly CampoViajero[], idioma: Idioma): string {
  const etiquetas = CHECKIN_TEXTOS[idioma].campos;
  return campos
    .map((campo) => (etiquetas[campo] ?? campo).replace(/\s*\*$/, ''))
    .join(', ');
}

/** Sustituye `{clave}` en la plantilla por su valor. Las claves ausentes quedan tal cual. */
export function interpolar(
  plantilla: string,
  vars: Record<string, string | number>,
): string {
  return plantilla.replace(/\{(\w+)\}/g, (match, clave: string) => {
    const valor = vars[clave];
    return valor === undefined ? match : String(valor);
  });
}

/** Normaliza un valor arbitrario (query, guestData, body) a un idioma soportado. */
export function idiomaDeValor(valor: unknown): Idioma {
  const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return (IDIOMAS as readonly string[]).includes(v) ? (v as Idioma) : IDIOMA_POR_DEFECTO;
}

/** Idioma pedido por la URL (`?lang=en`). */
export function idiomaDesdeUrl(
  busqueda: string | null | undefined,
): Idioma {
  if (!busqueda) return IDIOMA_POR_DEFECTO;
  return idiomaDeValor(new URLSearchParams(busqueda).get('lang'));
}

/** Locale de Intl para formatear moneda y fechas en cada idioma. */
export function localeDeIdioma(idioma: Idioma): string {
  return idioma === 'en' ? 'en-US' : 'es-MX';
}

// ═══════════════════════════════════════════════════════════════════════════
// Comunicaciones automáticas al huésped (plan maestro §21)
//
// Un huésped que reservó en inglés recibe los mensajes automáticos en inglés.
// Las plantillas sugeridas viven aquí —en los dos idiomas, con las mismas
// variables {{...}} que ya usa el hotel— para que el módulo de comunicaciones
// y la UI no mantengan textos paralelos que se desincronizan.
// ═══════════════════════════════════════════════════════════════════════════

/** Eventos cuya plantilla existe en los dos idiomas. */
export const COMUNICACION_EVENTOS_TRADUCIBLES = [
  'confirmacion',
  'pre_llegada',
  'check_in',
  'post_salida',
  'resena',
] as const;

export interface PlantillaHuesped {
  /** Solo relevante para el canal email. */
  asunto?: string | null;
  contenido: string;
}

export const PLANTILLAS_SUGERIDAS: Record<Idioma, Record<string, PlantillaHuesped>> = {
  es: {
    confirmacion: {
      asunto: 'Confirmación de tu reserva en {{propiedad}}',
      contenido:
        '¡Hola {{nombre}}! 🎉 Tu reserva en {{propiedad}} ({{unidad}}) está confirmada.\n\n📅 Check-in: {{checkIn}}\n📅 Check-out: {{checkOut}}\n🌙 {{noches}} noches\n💰 Total: {{importe}}\n\nReferencia: {{referencia}}\n\n¡Te esperamos!',
    },
    pre_llegada: {
      asunto: 'Tu llegada a {{propiedad}}',
      // El enlace de check-in es lo que cierra el círculo del registro de
      // viajeros: el huésped sube los documentos de su grupo y el parte sale
      // completo sin que nadie del hotel lo persiga. Las preguntas
      // obligatorias del hotel sin responder viajan en
      // {{preguntas_pendientes}} (vacía si ya está todo respondido).
      contenido:
        'Hola {{nombre}}, faltan pocos días para tu llegada a {{propiedad}} el {{checkIn}}. 🧳\n\nAntes de llegar, completa el registro de viajeros (lo exige la ley) aquí: {{enlace_checkin}}\n\nFalta por responder: {{preguntas_pendientes}}\n\nSi necesitas ayuda con tu llegada, escríbenos por aquí. ¡Nos vemos pronto!',
    },
    check_in: {
      asunto: 'Tu check-in en {{propiedad}}',
      // Última oportunidad para el registro de viajeros: si el huésped no lo
      // completó antes, lo tiene aquí el día de la llegada.
      contenido:
        '¡Hola {{nombre}}! Hoy es tu check-in en {{propiedad}} ({{unidad}}). 🔑\n\nTu reserva {{referencia}} está lista. Si aún no lo has hecho, completa el registro de viajeros antes de llegar: {{enlace_checkin}}\n\nFalta por responder: {{preguntas_pendientes}}\n\nSi necesitas instrucciones de acceso, responde este mensaje.',
    },
    post_salida: {
      asunto: 'Gracias por tu estancia en {{propiedad}}',
      contenido:
        'Hola {{nombre}}, esperamos que hayas disfrutado tu estancia en {{propiedad}}. 🙌\n\n¡Gracias por hospedarte con nosotros!',
    },
    resena: {
      asunto: '¿Cómo fue tu estancia? Cuéntanos',
      // El enlace con token es LA credencial: sin él el huésped no tiene
      // dónde escribir. La reseña se modera antes de publicarse — se le dice.
      contenido:
        '¡Hola {{nombre}}! ¿Cómo estuvo tu estancia en {{propiedad}}? ⭐\n\nNos encantaría saber tu opinión para mejorar y para ayudar a otros viajeros. Valóranos aquí: {{enlace_resena}}\n\nTu reseña la revisará el hotel antes de publicarse en su web. ¡Gracias!',
    },
  },
  en: {
    confirmacion: {
      asunto: 'Your booking at {{propiedad}} is confirmed',
      contenido:
        'Hi {{nombre}}! 🎉 Your booking at {{propiedad}} ({{unidad}}) is confirmed.\n\n📅 Check-in: {{checkIn}}\n📅 Check-out: {{checkOut}}\n🌙 {{noches}} nights\n💰 Total: {{importe}}\n\nReference: {{referencia}}\n\nWe look forward to welcoming you!',
    },
    pre_llegada: {
      asunto: 'Your arrival at {{propiedad}}',
      contenido:
        'Hi {{nombre}}, just a few days to go before your arrival at {{propiedad}} on {{checkIn}}. 🧳\n\nBefore you arrive, please complete the guest registry (required by law) here: {{enlace_checkin}}\n\nStill to answer: {{preguntas_pendientes}}\n\nIf you need any help getting here, just reply to this message. See you soon!',
    },
    check_in: {
      asunto: 'Your check-in at {{propiedad}}',
      contenido:
        'Hi {{nombre}}! Today is your check-in at {{propiedad}} ({{unidad}}). 🔑\n\nYour booking {{referencia}} is ready. If you have not done it yet, please complete the guest registry before you arrive: {{enlace_checkin}}\n\nStill to answer: {{preguntas_pendientes}}\n\nIf you need access instructions, just reply to this message.',
    },
    post_salida: {
      asunto: 'Thank you for staying at {{propiedad}}',
      contenido:
        'Hi {{nombre}}, we hope you enjoyed your stay at {{propiedad}}. 🙌\n\nThank you for staying with us!',
    },
    resena: {
      asunto: 'How was your stay? Tell us',
      contenido:
        'Hi {{nombre}}! How was your stay at {{propiedad}}? ⭐\n\nWe would love to hear your opinion to keep improving and to help other travellers. Rate your stay here: {{enlace_resena}}\n\nThe hotel will review your comment before publishing it on their website. Thank you!',
    },
  },
};

/** Plantilla sugerida para un evento e idioma (null si no existe). */
export function plantillaSugerida(evento: string, idioma: Idioma): PlantillaHuesped | null {
  return PLANTILLAS_SUGERIDAS[idioma]?.[evento] ?? null;
}

/**
 * Fecha de una noche (`YYYY-MM-DD`) como día LOCAL del calendario.
 *
 * `new Date('2026-09-25')` es medianoche UTC: en una zona con offset negativo la
 * noche del 25 se leería como el 24 —justo en el desglose que el huésped está
 * mirando—. El `T00:00:00` sin zona lo interpreta el navegador como hora local,
 * que es el mismo criterio que la disponibilidad del servidor (`startOfDay`).
 * Devuelve null si la fecha no está bien formada.
 */
export function fechaDeNoche(fecha: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const dia = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(dia.getTime()) ? null : dia;
}

/** Fecha larga localizada para las variables {{checkIn}}/{{checkOut}}. */
export function fechaLarga(
  fecha: Date | string | null | undefined,
  idioma: Idioma,
): string {
  if (!fecha) return '';
  return new Date(fecha).toLocaleDateString(localeDeIdioma(idioma), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Importe para la variable {{importe}} de una plantilla.
 *
 * Lo escribe `formatearImporte`, el único sitio de la plataforma que da formato
 * al dinero, con la convención de SU divisa (`lib/moneda.ts`): un huésped que
 * paga en pesos lee `$2,400.00` y uno que paga en euros `2.400,00 €`, sin que
 * esta plantilla tenga que saberlo. El idioma del email no decide el dinero —un
 * hotel español con precios en pesos escribe pesos en sus dos idiomas—, así que
 * el parámetro `idioma` no entra en el formato; se mantiene porque es parte de
 * la firma que ya usan las comunicaciones.
 *
 * Sin divisa se cae al mínimo del esquema: una reserva de canal sin `currency`
 * no puede quedarse sin símbolo en el email.
 */
export function monedaFormateada(
  valor: number | null | undefined,
  moneda: string | null | undefined,
  _idioma: Idioma,
): string {
  if (valor == null) return '';
  return formatearImporte(valor, moneda || MONEDA_MINIMA_ESQUEMA);
}
