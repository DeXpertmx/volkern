/**
 * P6 — Salida estructurada del agente.
 *
 * El agente ya registra qué herramienta se ejecutó y qué devolvió (P5). Aquí
 * eso se convierte en un contrato que el chat puede pintar: indicadores por
 * acción, tarjetas de entidad y tablas para listados. El texto libre del
 * modelo queda sólo como resumen de una línea.
 */

export type EstadoAccion = 'ok' | 'error' | 'denegado' | 'pendiente';
export type TipoEntidad = 'lead' | 'contacto' | 'propiedad' | 'negocio' | 'cita' | 'tarea' | 'nota' | 'interaccion';
export type TipoDatos = 'leads' | 'propiedades' | 'tareas' | 'citas' | 'negocios' | 'catalogo';

export interface CampoTarjeta {
  etiqueta: string;
  valor: string;
}

export interface TarjetaEntidad {
  tipo: TipoEntidad;
  titulo: string;
  subtitulo?: string;
  estado?: string;
  campos: CampoTarjeta[];
}

export interface AccionAgente {
  tool: string;
  /** Nombre legible de la acción, para el indicador. */
  etiqueta: string;
  estado: EstadoAccion;
  entidad?: TipoEntidad;
  id?: string;
  /** Una línea de qué quedó guardado o qué falló. */
  detalle?: string;
  error?: string;
  idempotente?: boolean;
  tarjeta?: TarjetaEntidad;
}

export interface ColumnaDatos {
  clave: string;
  titulo: string;
}

export interface DatosAgente {
  tipo: TipoDatos;
  titulo: string;
  columnas: ColumnaDatos[];
  filas: Array<Record<string, any>>;
  total: number;
}

export interface SalidaEstructuradaAgente {
  resumen: string;
  acciones: AccionAgente[];
  /** Acciones de clase C/D que el backend dejó a la espera de aprobación. */
  pendientes: AccionAgente[];
  datos: DatosAgente[];
}

/** Registro de una ejecución del turno, tal como lo recoge el agente. */
export interface RegistroEjecucionAgente {
  tool: string;
  estado: EstadoAccion;
  resultado?: any;
  error?: string;
  idempotente?: boolean;
}

/** Nombre legible y entidad por herramienta; lo que no está aquí cae a genérico. */
const ETIQUETAS: Record<string, { nombre: string; entidad?: TipoEntidad }> = {
  buscar_persona: { nombre: 'Búsqueda de la ficha', entidad: 'lead' },
  buscar_propiedades: { nombre: 'Búsqueda de inmuebles', entidad: 'propiedad' },
  crear_lead: { nombre: 'Ficha creada', entidad: 'lead' },
  registrar_interaccion: { nombre: 'Interacción registrada', entidad: 'interaccion' },
  crear_nota: { nombre: 'Nota guardada', entidad: 'nota' },
  crear_tarea: { nombre: 'Tarea creada', entidad: 'tarea' },
  completar_tarea: { nombre: 'Tarea completada', entidad: 'tarea' },
  reprogramar_tarea: { nombre: 'Tarea reprogramada', entidad: 'tarea' },
  get_pending_tasks: { nombre: 'Tareas pendientes', entidad: 'tarea' },
  update_deal: { nombre: 'Negocio actualizado', entidad: 'negocio' },
  search_properties_by_filters: { nombre: 'Búsqueda de inmuebles', entidad: 'propiedad' },
  create_booking: { nombre: 'Cita reservada', entidad: 'cita' },
  cancel_booking: { nombre: 'Cita cancelada', entidad: 'cita' },
  volkern_list_deals: { nombre: 'Pipeline de negocios', entidad: 'negocio' },
  volkern_list_citas: { nombre: 'Citas', entidad: 'cita' },
  volkern_list_catalogo: { nombre: 'Catálogo', entidad: 'propiedad' },
  volkern_get_financial_dashboard: { nombre: 'Resumen financiero' },
};

export function construirSalidaEstructurada(
  registros: RegistroEjecucionAgente[],
  resumen: string
): SalidaEstructuradaAgente {
  const acciones: AccionAgente[] = [];
  const pendientes: AccionAgente[] = [];
  const datos: DatosAgente[] = [];
  for (const reg of registros) {
    const accion = accionDeRegistro(reg);
    if (reg.estado === 'pendiente') {
      pendientes.push(accion);
    } else {
      acciones.push(accion);
    }
    const tabla = datosDeRegistro(reg);
    if (tabla) datos.push(tabla);
  }
  return { resumen, acciones, pendientes, datos };
}

/** Colapsa el texto libre del modelo a una sola línea de resumen. */
export function resumenDeTexto(texto: string): string {
  const plano = String(texto || '').replace(/\s+/g, ' ').trim();
  return plano.length > 280 ? `${plano.slice(0, 277)}…` : plano;
}

function accionDeRegistro(reg: RegistroEjecucionAgente): AccionAgente {
  const meta = ETIQUETAS[reg.tool];
  const base: AccionAgente = {
    tool: reg.tool,
    etiqueta: meta?.nombre ?? reg.tool,
    estado: reg.estado,
    entidad: meta?.entidad,
    idempotente: reg.idempotente,
  };

  if (reg.estado === 'pendiente') {
    return { ...base, error: reg.error, detalle: reg.error || 'Pendiente de aprobación' };
  }

  if (reg.estado !== 'ok') {
    return { ...base, error: reg.error, detalle: reg.error };
  }

  const r = reg.resultado ?? {};
  const detalle = detalleDeResultado(reg.tool, r);
  base.detalle = detalle.texto;
  if (detalle.id) base.id = detalle.id;
  if (detalle.tarjeta) base.tarjeta = detalle.tarjeta;
  return base;
}

function detalleDeResultado(
  tool: string,
  r: any
): { texto: string; id?: string; tarjeta?: TarjetaEntidad } {
  switch (tool) {
    case 'crear_lead': {
      const nombre = r.nombre || 'la persona';
      return {
        texto: r.yaExistia ? `La ficha de ${nombre} ya existía` : `Ficha de ${nombre} creada`,
        id: r.id,
        tarjeta: tarjetaDeContacto(r.nombre, r.email, r),
      };
    }
    case 'buscar_persona': {
      if (r.encontrado === false) return { texto: 'No se encontró la persona en el CRM' };
      if (Array.isArray(r.candidatos) && r.candidatos.length) {
        return { texto: `${r.candidatos.length} candidatos encontrados` };
      }
      const persona = r.persona;
      if (persona) {
        return {
          texto: `Ficha de ${persona.nombre || 'la persona'}`,
          id: persona.id,
          tarjeta: tarjetaDeContacto(persona.nombre, persona.email, persona),
        };
      }
      return { texto: 'Búsqueda realizada' };
    }
    case 'crear_tarea':
      return { texto: `Tarea «${r.titulo || 'sin título'}» creada${r.fecha ? ` para el ${r.fecha}` : ''}`, id: r.id };
    case 'completar_tarea':
      return { texto: `Tarea «${r.titulo || 'sin título'}» completada`, id: r.id };
    case 'reprogramar_tarea':
      return { texto: `Tarea reprogramada${r.fecha ? ` al ${r.fecha}` : ''}`, id: r.id };
    case 'registrar_interaccion':
      return { texto: `Interacción de tipo ${r.tipo || 'nota'} registrada`, id: r.id };
    case 'crear_nota':
      return { texto: 'Nota guardada en la ficha', id: r.id };
    case 'update_deal':
      return { texto: 'Negocio actualizado', id: r.id ?? r.deal?.id };
    case 'create_booking': {
      const cita = r.cita ?? r;
      const cuando = cita?.fechaHora || cita?.fecha
        ? ` para el ${new Date(cita.fechaHora || cita.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
        : '';
      return { texto: `Cita con ${cita?.lead?.nombre || 'la persona'} creada${cuando}`, id: cita?.id };
    }
    case 'cancel_booking':
      return { texto: 'Cita cancelada', id: r.id ?? r.cita?.id };
    default:
      return { texto: resumenDeLista(tool, r) };
  }
}

function resumenDeLista(tool: string, r: any): string {
  const { filas } = filasDe(tool, r);
  return `${filas.length} resultado${filas.length === 1 ? '' : 's'}`;
}

function datosDeRegistro(reg: RegistroEjecucionAgente): DatosAgente | null {
  if (reg.estado !== 'ok') return null;
  const { filas, columnas, tipo, titulo, total } = filasDe(reg.tool, reg.resultado ?? {});
  if (!filas.length) return null;
  return { tipo, titulo, columnas, filas, total };
}

function filasDe(
  tool: string,
  r: any
): { tipo: TipoDatos; titulo: string; columnas: ColumnaDatos[]; filas: any[]; total: number } {
  switch (tool) {
    case 'buscar_propiedades':
      return {
        tipo: 'propiedades',
        titulo: 'Inmuebles encontrados',
        columnas: [
          { clave: 'nombre', titulo: 'Inmueble' },
          { clave: 'precio', titulo: 'Precio' },
          { clave: 'zona', titulo: 'Zona' },
          { clave: 'habitaciones', titulo: 'Hab.' },
          { clave: 'terraza', titulo: 'Terraza' },
        ],
        filas: (r.propiedades ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.nombre || 'Propiedad',
          precio: p.precio,
          zona: p.zona || '',
          habitaciones: p.habitaciones,
          terraza: p.terraza === true ? 'Sí' : 'No',
        })),
        total: r.propiedades?.length ?? 0,
      };
    case 'search_properties_by_filters':
      return {
        tipo: 'propiedades',
        titulo: 'Inmuebles encontrados',
        columnas: [
          { clave: 'nombre', titulo: 'Inmueble' },
          { clave: 'precio', titulo: 'Precio' },
          { clave: 'zona', titulo: 'Zona' },
          { clave: 'habitaciones', titulo: 'Hab.' },
          { clave: 'terraza', titulo: 'Terraza' },
        ],
        filas: (r.properties ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.nombre || 'Propiedad',
          precio: p.precioBase ?? p.precio,
          zona: p.city || p.zona || '',
          habitaciones: p.bedrooms ?? p.habitaciones,
          terraza: p.hasTerrace === true ? 'Sí' : 'No',
        })),
        total: r.total ?? r.properties?.length ?? 0,
      };
    case 'buscar_persona':
      return {
        tipo: 'leads',
        titulo: 'Personas encontradas',
        columnas: [
          { clave: 'nombre', titulo: 'Nombre' },
          { clave: 'email', titulo: 'Email' },
          { clave: 'telefono', titulo: 'Teléfono' },
          { clave: 'empresa', titulo: 'Empresa' },
        ],
        filas: (r.candidatos ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.nombre || '',
          email: p.email || '',
          telefono: p.telefono || '',
          empresa: p.empresa || '',
        })),
        total: r.candidatos?.length ?? 0,
      };
    case 'get_pending_tasks':
      return {
        tipo: 'tareas',
        titulo: 'Tareas pendientes',
        columnas: [
          { clave: 'titulo', titulo: 'Tarea' },
          { clave: 'tipo', titulo: 'Tipo' },
          { clave: 'fecha', titulo: 'Vence' },
          { clave: 'persona', titulo: 'Persona' },
        ],
        filas: (Array.isArray(r) ? r : r.tareas ?? []).map((t: any) => ({
          id: t.id,
          titulo: t.titulo || 'Sin título',
          tipo: t.tipo || '',
          fecha: t.fechaVencimiento || t.dueDate || '',
          persona: t.lead?.nombre || '',
        })),
        total: Array.isArray(r) ? r.length : r.tareas?.length ?? 0,
      };
    case 'volkern_list_deals':
      return {
        tipo: 'negocios',
        titulo: 'Pipeline de negocios',
        columnas: [
          { clave: 'titulo', titulo: 'Negocio' },
          { clave: 'etapa', titulo: 'Etapa' },
          { clave: 'valor', titulo: 'Valor' },
          { clave: 'persona', titulo: 'Persona' },
        ],
        filas: (r.deals ?? []).map((d: any) => ({
          id: d.id,
          titulo: d.titulo || 'Sin título',
          etapa: d.etapa || d.stage || '',
          valor: d.valor ?? d.monto ?? d.amount ?? '',
          persona: d.lead?.nombre || '',
        })),
        total: r.total ?? r.deals?.length ?? 0,
      };
    case 'volkern_list_citas':
      return {
        tipo: 'citas',
        titulo: 'Citas',
        columnas: [
          { clave: 'titulo', titulo: 'Cita' },
          { clave: 'fecha', titulo: 'Cuándo' },
          { clave: 'estado', titulo: 'Estado' },
          { clave: 'persona', titulo: 'Persona' },
        ],
        filas: (r.citas ?? []).map((c: any) => ({
          id: c.id,
          titulo: c.titulo || c.tipo || 'Cita',
          fecha: c.fechaHora || '',
          estado: c.estado || '',
          persona: c.lead?.nombre || '',
        })),
        total: r.total ?? r.citas?.length ?? 0,
      };
    case 'volkern_list_catalogo':
      return {
        tipo: 'catalogo',
        titulo: 'Catálogo',
        columnas: [
          { clave: 'nombre', titulo: 'Ítem' },
          { clave: 'tipo', titulo: 'Tipo' },
          { clave: 'precio', titulo: 'Precio' },
        ],
        filas: (r.items ?? []).map((i: any) => ({
          id: i.id,
          nombre: i.nombre || 'Ítem',
          tipo: i.tipo || '',
          precio: i.precioBase ?? i.precio ?? '',
        })),
        total: r.total ?? r.items?.length ?? 0,
      };
    default:
      return { tipo: 'catalogo', titulo: '', columnas: [], filas: [], total: 0 };
  }
}

function tarjetaDeContacto(nombre: any, email: any, extra: any): TarjetaEntidad {
  const campos = [
    campoSeguro('Teléfono', extra?.telefono),
    campoSeguro('Empresa', extra?.empresa),
    campoSeguro('Estado', extra?.estado),
  ].filter((c): c is CampoTarjeta => c !== null);
  return {
    tipo: 'lead',
    titulo: nombre || 'Persona',
    subtitulo: email || 'Sin correo registrado',
    campos,
  };
}

function campoSeguro(etiqueta: string, valor: any): CampoTarjeta | null {
  if (valor === undefined || valor === null || valor === '') return null;
  return { etiqueta, valor: String(valor) };
}
