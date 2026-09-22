export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/reservations/print — hoja imprimible de housekeeping.
 *
 * La lista del día para el pasillo: unidades, horarios previstos y las notas
 * de limpieza que dejó el sistema. Es la MISMA lista que la pantalla filtra y
 * que el CSV exporta — los filtros viajan en la URL y se resuelven con la
 * misma `whereDeFiltrosReservas` (sin segundo criterio). Lo único que añade
 * frente al CSV es lo que el papel necesita: el estado y la nota de limpieza
 * de cada unidad, el nombre del hotel en el encabezado y estilos de impresión.
 *
 * Por qué HTML y no un PDF: la impresión la hace el navegador (Ctrl+P), que ya
 * sabe paginar; la ruta solo entrega el papel. Sin dependencias nuevas.
 *
 * Cada fila lleva una casilla para marcar a lápiz la unidad ya limpia — es la
 * única interacción que el papel necesita y la única que tiene: el estado de
 * la limpieza lo cambia el sistema al completar la tarea; la casilla no
 * guarda nada y sobra fuera del papel (no es un `<input>`).
 *
 * Sin reservas responde 404 razonado, igual que el CSV: nadie imprime una
 * hoja vacía y cree que no hay trabajo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  construirHojaHousekeeping,
  type ReservaParaHoja,
} from '@/lib/hospitality/housekeeping-sheet';
import { diaLocalIso } from '@/lib/hospitality/reservas-csv';
import { whereDeFiltrosReservas } from '@/app/api/hospitality/reservations/route';
import type { CampoViajero } from '@/lib/hospitality/guest-checkin';

const LIMITE_HOJA = 500;

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const where = whereDeFiltrosReservas(searchParams, tenantId);

    const [reservas, tenant, preguntasCrudas] = await Promise.all([
      prisma.hospitalityReservation.findMany({
        where,
        include: {
          unit: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
              estado: true,
              cleaningTasks: {
                where: { estado: { in: ['pending', 'in_progress'] } },
                select: { estado: true, notas: true },
              },
            },
          },
          property: { select: { id: true, nombre: true } },
          contact: { select: { id: true, nombre: true } },
        },
        orderBy: [{ checkIn: 'asc' }],
        take: LIMITE_HOJA,
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }),
      // Auxiliar (degradación elegante, como el CSV): si la consulta de
      // preguntas falla, la hoja sale con la convención de siempre — perder
      // el papel entero por las horas del huésped no.
      prisma.hospitalityCheckinPregunta
        .findMany({ where: { tenantId, activa: true }, orderBy: [{ orden: 'asc' }, { fechaCreacion: 'asc' }] })
        .catch(() => []),
    ]);

    if (reservas.length === 0) {
      return NextResponse.json(
        { error: 'No hay reservas que coincidan con los filtros' },
        { status: 404 }
      );
    }

    // La urgencia de la pantalla, heredada sin segunda opinión: los estados
    // del parte llegan en lote (las mismas reglas del check-in) y el detalle
    // es el mismo texto que la fila roja de la pantalla.
    const { partesDeViajerosPorReserva } = await import(
      '@/lib/hospitality/registro-viajeros-service'
    );
    const { etiquetasDeCampos } = await import('@/lib/hospitality/booking-i18n');
    const { normalizarPreguntas, horaEstimadaLlegadaDe } = await import(
      '@/lib/hospitality/checkin-preguntas'
    );
    const partes = await partesDeViajerosPorReserva(tenantId, reservas);
    const preguntas = normalizarPreguntas(preguntasCrudas);

    const ahora = new Date();
    const fechaDia = diaLocalIso(ahora);

    const aReservaParaHoja = (r: (typeof reservas)[number]): ReservaParaHoja => {
      const gd = (r.guestData && typeof r.guestData === 'object' ? r.guestData : {}) as Record<string, unknown>;
      const huesped =
        [gd.firstName, gd.lastName]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join(' ')
          .trim() || r.contact?.nombre || 'Huésped';
      const parte = partes.get(r.id) ?? null;
      const aplicaYFalta = Boolean(parte?.aplica && !parte.completo && !parte.comunicada);
      const faltan = (
        Array.isArray(parte?.faltan) ? (parte!.faltan as readonly string[]) : []
      ) as readonly CampoViajero[];
      return {
        referencia: r.externalBookingId ?? '',
        huesped,
        unidad: r.unit
          ? {
              nombre: r.unit.nombre,
              codigo: r.unit.codigo,
              estado: r.unit.estado,
              cleaningTasks: r.unit.cleaningTasks.map((t) => ({
                estado: t.estado,
                notas: t.notas,
              })),
            }
          : null,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        occupancyAdults: r.occupancyAdults,
        occupancyChildren: r.occupancyChildren,
        partePendiente: aplicaYFalta,
        parteDetalle: aplicaYFalta
          ? faltan.length === 0
            ? 'sin datos de ningún viajero'
            : etiquetasDeCampos(faltan.slice(0, 3), 'es')
          : '',
        // La hora del huésped, si la respondió en la pregunta de hora — el
        // módulo de preguntas la detecta y la normaliza; null = convención.
        horaEstimada: horaEstimadaLlegadaDe(
          preguntas,
          ((r.respuestasCheckin ?? {}) as Record<string, string>) || {}
        ),
      };
    };

    // El chip de movimiento decide la sección: con «llegadas» (o sin chip, que
    // es la lista completa), cada reserva va a su sección según dónde toca
    // hoy; con «salidas», la hoja es de salidas. La división es por fecha de
    // la reserva, no por sección pedida: el papel separa lo que el día separa.
    const llegadas = reservas.filter(
      (r) => diaLocalIso(r.checkIn) === fechaDia
    );
    const salidas = reservas.filter(
      (r) => diaLocalIso(r.checkOut) === fechaDia && !llegadas.includes(r)
    );

    // Un filtro ajeno al día (propiedad, canal, búsqueda…) sí reduce la hoja;
    // un día concreto (from/to) también: la hoja es de la lista que se ve.
    // Si el chip pide solo un lado, la otra sección sale vacía a propósito.
    // Sin chip, la hoja es DEL DÍA: entran las reservas que hoy llegan o hoy
    // salen — es una hoja de pasillo, no el listado completo.
    const movimiento = searchParams.get('movimiento');
    const llegadasFinales = movimiento === 'salidas' ? [] : llegadas.map(aReservaParaHoja);
    const salidasFinales = movimiento === 'llegadas' ? [] : salidas.map(aReservaParaHoja);

    const hoja = construirHojaHousekeeping({
      fecha: fechaDia,
      hotel: tenant?.nombre ?? '',
      generadoEl: ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      llegadas: llegadasFinales,
      salidas: salidasFinales,
    });

    const html = renderHoja(hoja);
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error generando la hoja de housekeeping:', error);
    return NextResponse.json({ error: 'Error al generar la hoja' }, { status: 500 });
  }
}

// ─── El papel ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filaTabla(f: {
  referencia: string;
  unidad: string;
  huesped: string;
  hora: string;
  horaDelHuesped: boolean;
  noches: number;
  ocupantes: string;
  limpiezaPendiente: boolean;
  limpiezaNotas: string;
  partePendiente: boolean;
  parteDetalle: string;
}): string {
  const clase = f.partePendiente ? ' fila-urgente' : '';
  const parte = f.partePendiente
    ? `<span class="parte">⚠ Falta parte: ${esc(f.parteDetalle)}</span>`
    : '';
  const notas = f.limpiezaNotas
    ? `<div class="nota">🧹 ${esc(f.limpiezaNotas)}</div>`
    : '';
  const limpia = f.limpiezaPendiente
    ? '<span class="pill limpia">LIMPIAR</span>'
    : '';
  // La hora del huésped se destaca (es la real del trabajo); la convención
  // va en su peso normal — en el papel se distinguen de un vistazo.
  const hora = f.horaDelHuesped
    ? `<td class="hora"><span class="hora-huesped">${esc(f.hora)}</span></td>`
    : `<td class="hora">${esc(f.hora)}</td>`;
  return `<tr class="${clase.trim()}">
      <td class="casilla"><span class="checkbox" aria-hidden="true"></span></td>
      <td class="unidad"><strong>${esc(f.unidad)}</strong>${limpia}</td>
      ${hora}
      <td>${esc(f.huesped)}<div class="ref">${esc(f.referencia)}</div></td>
      <td>${esc(f.ocupantes)}<div class="ref">${f.noches} noche${f.noches === 1 ? '' : 's'}</div></td>
      <td>${notas || ''}${parte}</td>
    </tr>`;
}

function seccion(titulo: string, sub: string, filas: string[]): string {
  return `<section>
    <h2>${esc(titulo)} <span class="cuenta">${filas.length}</span></h2>
    <p class="sub">${esc(sub)}</p>
    ${
      filas.length === 0
        ? '<p class="vacia">— sin movimientos —</p>'
        : `<table>
      <thead><tr><th class="casilla"><span class="checkbox" aria-hidden="true"></span></th><th>Unidad</th><th>Hora</th><th>Huésped</th><th>Ocupantes</th><th>Limpieza / Parte</th></tr></thead>
      <tbody>${filas.join('\n')}</tbody>
    </table>`
    }
  </section>`;
}

function renderHoja(hoja: {
  fecha: string;
  hotel: string;
  generadoEl: string;
  resumen: string;
  llegadas: Array<Parameters<typeof filaTabla>[0]>;
  salidas: Array<Parameters<typeof filaTabla>[0]>;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Lista del día · housekeeping · ${esc(hoja.fecha)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 18px; margin: 0; }
  .meta { font-size: 11px; color: #444; }
  h2 { font-size: 14px; margin: 14px 0 4px; }
  .cuenta { background: #111; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; }
  .sub { font-size: 11px; color: #555; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #bbb; padding: 4px 6px; }
  td { border-bottom: 1px solid #ddd; padding: 6px; vertical-align: top; }
  .hora { font-weight: 700; white-space: nowrap; width: 48px; }
  .hora-huesped { background: #111; color: #fff; padding: 1px 5px; border-radius: 4px; }
  .unidad { width: 130px; }
  .ref { font-size: 10px; color: #666; }
  .casilla { width: 30px; text-align: center; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #444; border-radius: 3px; }
  th .checkbox { width: 12px; height: 12px; }
  .nota { font-size: 11px; margin-bottom: 2px; }
  .parte { display: inline-block; background: #fde8e8; color: #9b1c1c; font-weight: 700; font-size: 10px; padding: 1px 6px; border-radius: 4px; }
  .fila-urgente td { background: #fde8e8; }
  .pill.limpia { display: inline-block; margin-left: 6px; background: #fef3c7; color: #92400e; font-weight: 700; font-size: 9px; padding: 1px 6px; border-radius: 4px; }
  .vacia { color: #666; font-style: italic; }
  .pie { margin-top: 14px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 6px; }
  @media print {
    .no-print { display: none; }
    body { font-size: 11px; }
    tr { page-break-inside: avoid; }
    section { page-break-inside: auto; }
  }
  .boton-print { margin: 12px 0; }
  @media screen { .boton-print { display: block; } }
</style>
</head>
<body>
  <button class="boton-print no-print" onclick="window.print()">Imprimir</button>
  <header>
    <h1>${esc(hoja.hotel || 'Lista del día')} — housekeeping</h1>
    <div class="meta">${esc(hoja.fecha)} · ${esc(hoja.resumen)}</div>
  </header>
  ${seccion(
    'Llegadas',
    `Hora prevista 15:00 — la hora en negro es la que dio el huésped · en rojo, falta el documento para el parte`,
    hoja.llegadas.map((f) => filaTabla(f))
  )}
  ${seccion(
    'Salidas',
    `Hora prevista 11:00 · la unidad queda para limpiar tras la salida; la nota de limpieza la dejó el sistema en el check-out`,
    hoja.salidas.map((f) => filaTabla(f))
  )}
  <div class="pie">Generada a las ${esc(hoja.generadoEl)} · Volkern · la lista refleja exactamente los filtros de la pantalla de reservas</div>
</body>
</html>`;
}
