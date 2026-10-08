import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { GET as GET_COMPRAS, POST as POST_COMPRA } from '@/app/api/compras/route';
import { GET as GET_COMPRA } from '@/app/api/compras/[id]/route';
import { POST as POST_RECEPCION } from '@/app/api/compras/[id]/recibir/route';
import {
  cambiarEstadoCompra,
  crearCompra,
  recibirCompra,
  sugerenciasDeReposicion,
  ErrorCompra,
} from '@/lib/compras/service';

/**
 * Ciclo real de una compra contra la base de datos.
 *
 * Lo que no se puede probar con módulos puros: que al recibir mercancía el
 * stock se mueva de verdad, que el pedido quede en el estado que corresponde a
 * lo que entró, que el gasto aparezca en contabilidad solo cuando el pedido
 * está completo —y una sola vez— y que el correlativo no se repita.
 *
 * Trabaja en un tenant temporal con slug único y lo borra al terminar (el
 * borrado en cascada se lleva pedidos, líneas, stock, movimientos y gasto).
 */

const marca = `test-compras-${Date.now()}`;
const anio = new Date().getFullYear();

let tenantId: string;
let usuarioId: string;
let proveedorId: string;
let articuloId: string;
let almacenId: string;
let pedidoId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { nombre: `Test Compras ${marca}`, slug: marca, moneda: 'EUR' },
  });
  tenantId = tenant.id;

  const usuario = await prisma.user.create({ data: { email: `${marca}@example.test`, tenantId } });
  usuarioId = usuario.id;

  const proveedor = await prisma.supplier.create({
    data: { tenantId, name: 'Proveedor de prueba', category: 'Otros' },
  });
  proveedorId = proveedor.id;

  const articulo = await prisma.catalogoItem.create({
    data: {
      tenantId,
      nombre: 'Café en grano (prueba)',
      tipo: 'producto',
      precioBase: 5,
      costOfAcquisition: 3.5,
      isStockable: true,
    },
  });
  articuloId = articulo.id;

  const almacen = await prisma.warehouse.create({ data: { tenantId, name: 'Almacén de prueba' } });
  almacenId = almacen.id;

  // Punto de pedido configurado: sin umbral no hay sugerencia que sugerir.
  await prisma.inventoryConfig.create({
    data: { catalogoItemId: articuloId, reorderPoint: 10 },
  });
  await prisma.stockLevel.create({
    data: { tenantId, warehouseId: almacenId, catalogoItemId: articuloId, quantity: 2, minStock: 10, maxStock: 30 },
  });
}, 60_000);

afterAll(async () => {
  if (!tenantId) return;
  await prisma.user.delete({ where: { id: usuarioId } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
}, 60_000);

async function cantidadEnAlmacen(): Promise<number> {
  const nivel = await prisma.stockLevel.findFirst({ where: { tenantId, warehouseId: almacenId, catalogoItemId: articuloId } });
  return Number(nivel?.quantity ?? 0);
}

describe('Compras · ciclo real', () => {
  it('crea el pedido con correlativo del año y totales calculados', async () => {
    const compra = await crearCompra({
      tenantId,
      usuarioId,
      proveedorId,
      almacenId,
      moneda: 'EUR',
      notas: 'Pedido de prueba',
      items: [
        { catalogoItemId: articuloId, concepto: 'Café en grano (prueba)', cantidad: 4, precioUnitario: 2.5, porcentajeImpuesto: 21 },
        { concepto: 'Portes', cantidad: 1, precioUnitario: 10, porcentajeImpuesto: 21 },
      ],
    });

    pedidoId = compra.id;

    expect(compra.estado).toBe('borrador');
    expect(compra.numero).toBe(`OC-${anio}-0001`);
    expect(compra.subtotal).toBe(20); // 10 + 10
    expect(compra.totalImpuestos).toBe(4.2);
    expect(compra.total).toBe(24.2);
    expect(compra.items).toHaveLength(2);
    expect(compra.items[0].montoImpuesto).toBe(2.1);
  });

  it('no admite dos pedidos con el mismo número', async () => {
    const segundo = await crearCompra({
      tenantId,
      usuarioId,
      proveedorId,
      moneda: 'EUR',
      items: [{ concepto: 'Otra cosa', cantidad: 1, precioUnitario: 1 }],
    });
    expect(segundo.numero).toBe(`OC-${anio}-0002`);
  });

  it('solo sale del borrador por las transiciones de su ciclo', async () => {
    await expect(cambiarEstadoCompra({ tenantId, compraId: pedidoId, estado: 'recibida' })).rejects.toBeInstanceOf(ErrorCompra);

    const enviada = await cambiarEstadoCompra({ tenantId, compraId: pedidoId, estado: 'enviada' });
    expect(enviada.estado).toBe('enviada');
  });

  it('exige un pedido enviado para poder recibir', async () => {
    const borrador = await crearCompra({
      tenantId,
      usuarioId,
      proveedorId,
      almacenId,
      moneda: 'EUR',
      items: [{ catalogoItemId: articuloId, concepto: 'Café en grano (prueba)', cantidad: 1, precioUnitario: 2 }],
    });

    await expect(
      recibirCompra({ tenantId, compraId: borrador.id, usuarioId, lineas: [{ itemId: borrador.items[0].id, cantidad: 1 }] })
    ).rejects.toThrow(/Envía el pedido/);
  });

  it('una recepción parcial mueve el stock, deja el pedido parcial y no genera gasto', async () => {
    const compra = await prisma.compra.findFirstOrThrow({ where: { id: pedidoId }, include: { items: true } });
    const lineaCafe = compra.items.find((i) => i.catalogoItemId === articuloId)!;

    const stockAntes = await cantidadEnAlmacen();

    const resultado = await recibirCompra({
      tenantId,
      compraId: pedidoId,
      usuarioId,
      lineas: [{ itemId: lineaCafe.id, cantidad: 2 }],
    });

    expect(resultado.compra.estado).toBe('parcial');
    expect(resultado.gasto).toBeNull();
    expect(resultado.movimientos).toHaveLength(1);
    expect(await cantidadEnAlmacen()).toBe(stockAntes + 2);

    const movimientos = await prisma.stockMovement.findMany({ where: { tenantId, referenceId: pedidoId } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].type).toBe('IN');
    expect(movimientos[0].quantity).toBe(2);
    expect(movimientos[0].reason).toContain(`Recepción OC-${anio}-0001`);
    expect((movimientos[0].metadata as any)?.origen).toBe('compras');

    // Y no se ha inventado el gasto por adelantado.
    expect(await prisma.expense.count({ where: { tenantId } })).toBe(0);
  });

  it('rechaza recibir más de lo pendiente', async () => {
    const compra = await prisma.compra.findFirstOrThrow({ where: { id: pedidoId }, include: { items: true } });
    const lineaCafe = compra.items.find((i) => i.catalogoItemId === articuloId)!;

    await expect(
      recibirCompra({ tenantId, compraId: pedidoId, usuarioId, lineas: [{ itemId: lineaCafe.id, cantidad: 99 }] })
    ).rejects.toThrow(/solo faltan 2/);
  });

  it('al completar el pedido nace el gasto contable, una sola vez', async () => {
    const compra = await prisma.compra.findFirstOrThrow({ where: { id: pedidoId }, include: { items: true } });
    const lineaCafe = compra.items.find((i) => i.catalogoItemId === articuloId)!;
    const lineaPortes = compra.items.find((i) => !i.catalogoItemId)!;

    const stockAntes = await cantidadEnAlmacen();

    const resultado = await recibirCompra({
      tenantId,
      compraId: pedidoId,
      usuarioId,
      lineas: [
        { itemId: lineaCafe.id, cantidad: 2 },
        { itemId: lineaPortes.id, cantidad: 1 },
      ],
    });

    expect(resultado.compra.estado).toBe('recibida');
    expect(await cantidadEnAlmacen()).toBe(stockAntes + 2);

    // La línea de portes no tiene artículo de almacén: es coste, no
    // existencias, y el servicio lo dice en vez de dar por hecho que todo entró.
    expect(resultado.avisos.join(' ')).toMatch(/no mueve existencias/i);

    expect(resultado.gasto).not.toBeNull();
    expect(resultado.gasto!.amount).toBe(24.2);
    expect(resultado.gasto!.category).toBe('mercaderias');

    const gasto = await prisma.expense.findFirstOrThrow({ where: { tenantId }, include: { supplier: true } });
    expect(gasto.status).toBe('PENDING');
    expect(gasto.currency).toBe('EUR');
    expect(gasto.supplierId).toBe(proveedorId);
    expect(gasto.description).toContain(`OC-${anio}-0001`);

    const pedidoFinal = await prisma.compra.findFirstOrThrow({ where: { id: pedidoId } });
    expect(pedidoFinal.gastoId).toBe(gasto.id);
    expect(pedidoFinal.fechaRecepcion).toBeInstanceOf(Date);

    // Un pedido ya recibido no admite más recepciones ni un segundo gasto.
    await expect(
      recibirCompra({ tenantId, compraId: pedidoId, usuarioId, lineas: [{ itemId: lineaCafe.id, cantidad: 1 }] })
    ).rejects.toThrow(/no admite recepciones/);
    expect(await prisma.expense.count({ where: { tenantId } })).toBe(1);
  });

  it('las sugerencias salen del punto de pedido, no de un cero de stock', async () => {
    const sugerencias = await sugerenciasDeReposicion(tenantId);
    const cafe = sugerencias.find((s) => s.catalogoItemId === articuloId);

    expect(cafe).toBeDefined();
    expect(cafe!.cantidadActual).toBe(6); // 2 iniciales + 4 recibidas
    expect(cafe!.puntoPedido).toBe(10);
    // El techo del nivel de stock (30) manda sobre el punto de pedido.
    expect(cafe!.cantidadSugerida).toBe(24);
    expect(cafe!.precioUnitario).toBe(3.5);
  });
});

/**
 * La misma cadena, pero por HTTP: es la puerta que usa el navegador y la
 * automatización, así que aquí se comprueba lo que el servicio no ve —la
 * autenticación por clave de API, la validación del cuerpo, los filtros del
 * listado y los códigos de estado.
 */
describe('Compras · las rutas HTTP', () => {
  let clave = '';
  /** Pedido creado por HTTP, para no depender del número que le toque. */
  let pedidoPorHttp: { id: string; numero: string; items: Array<{ id: string }> } | null = null;

  beforeAll(async () => {
    const { key, keyHash, prefix } = generateApiKey('prod');
    clave = key;
    await prisma.apiKey.create({
      data: {
        nombre: `Clave de prueba compras ${marca}`,
        keyHash,
        prefix,
        tenantId,
        userId: usuarioId,
        scopes: ['erp:read', 'erp:write'],
      },
    });
  }, 60_000);

  function peticion(url: string, opciones: RequestInit = {}, conClave = true): Request {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (conClave) headers['X-API-Key'] = clave;
    return new Request(`https://volkern.app${url}`, { ...opciones, headers });
  }

  /**
   * Contexto que el App Router pasa a las rutas dinámicas:
   * `handler(request, { params })`. Es lo que recibe `withTenantAuth` como
   * segundo argumento y reenvía al handler como tercero.
   */
  const contexto = (id: string) => ({ params: { id } }) as any;

  it('sin credenciales no deja entrar', async () => {
    const res = await GET_COMPRAS(peticion('/api/compras', {}, false) as any);
    expect(res.status).toBe(401);
  });

  it('crea el pedido por HTTP con su importe y divisa del tenant', async () => {
    const res = await POST_COMPRA(
      peticion('/api/compras', {
        method: 'POST',
        body: JSON.stringify({
          proveedorId,
          almacenId,
          items: [{ catalogoItemId: articuloId, concepto: 'Café en grano (prueba)', cantidad: 2, precioUnitario: 3 }],
        }),
      }) as any
    );

    expect(res.status).toBe(201);
    const cuerpo = await res.json();
    pedidoPorHttp = cuerpo.compra;

    // La divisa del pedido es la del tenant, no una escrita a mano.
    expect(cuerpo.compra.moneda).toBe('EUR');
    expect(cuerpo.compra.total).toBe(7.26); // 6 + 21%
    expect(cuerpo.compra.estado).toBe('borrador');
  });

  it('rechaza un pedido sin líneas con un 400 legible', async () => {
    const res = await POST_COMPRA(
      peticion('/api/compras', { method: 'POST', body: JSON.stringify({ items: [] }) }) as any
    );
    expect(res.status).toBe(400);
    const cuerpo = await res.json();
    expect(JSON.stringify(cuerpo)).toMatch(/al menos una línea/i);
  });

  it('lista, filtra por estado y busca por número y proveedor', async () => {
    const todos = await (await GET_COMPRAS(peticion('/api/compras') as any)).json();
    expect(todos.total).toBeGreaterThanOrEqual(3);

    const borradores = await (
      await GET_COMPRAS(peticion('/api/compras?estado=borrador') as any)
    ).json();
    expect(borradores.compras.every((c: any) => c.estado === 'borrador')).toBe(true);
    expect(borradores.compras.length).toBeGreaterThan(0);

    const porNumero = await (
      await GET_COMPRAS(peticion(`/api/compras?search=${pedidoPorHttp!.numero}`) as any)
    ).json();
    expect(porNumero.compras).toHaveLength(1);
    expect(porNumero.compras[0].numero).toBe(pedidoPorHttp!.numero);
    expect(porNumero.compras[0].pendiente).toBe(2);
    expect(porNumero.compras[0].proveedor.name).toBe('Proveedor de prueba');

    // El buscador también entra por el nombre del proveedor (relación anidada).
    const porProveedor = await (
      await GET_COMPRAS(peticion('/api/compras?search=Proveedor de prueba') as any)
    ).json();
    expect(porProveedor.total).toBeGreaterThanOrEqual(3);
  });

  it('el detalle informa de lo que falta y de las transiciones posibles', async () => {
    const id = pedidoPorHttp!.id;

    const resDetalle = await GET_COMPRA(peticion(`/api/compras/${id}`) as any, contexto(id));
    expect(resDetalle.status).toBe(200);
    const detalle = await resDetalle.json();

    expect(detalle.compra.pendiente).toBe(2);
    expect(detalle.compra.transiciones).toEqual(['enviada', 'cancelada']);
    expect(detalle.compra.items[0].pendiente).toBe(2);
  });

  it('recepciona por HTTP y el pedido queda parcial', async () => {
    const compra = pedidoPorHttp!;

    // Primero hay que enviarlo: un borrador no admite recepción.
    const envio = await POST_RECEPCION(
      peticion(`/api/compras/${compra.id}/recibir`, {
        method: 'POST',
        body: JSON.stringify({ lineas: [{ itemId: compra.items[0].id, cantidad: 1 }] }),
      }) as any,
      contexto(compra.id)
    );
    expect(envio.status).toBe(409);
    expect((await envio.json()).error).toMatch(/Envía el pedido/);

    const patch = await import('@/app/api/compras/[id]/route');
    const resPatch = await patch.PATCH(
      peticion(`/api/compras/${compra.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'enviada' }) }) as any,
      contexto(compra.id)
    );
    expect(resPatch.status).toBe(200);

    const res = await POST_RECEPCION(
      peticion(`/api/compras/${compra.id}/recibir`, {
        method: 'POST',
        body: JSON.stringify({ lineas: [{ itemId: compra.items[0].id, cantidad: 1 }] }),
      }) as any,
      contexto(compra.id)
    );

    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.compra.estado).toBe('parcial');
    expect(cuerpo.movimientos).toHaveLength(1);
  });
});
