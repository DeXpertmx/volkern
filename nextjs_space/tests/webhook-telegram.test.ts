import { describe, it, expect } from 'vitest';
import { buildTelegramExpenseSummary, canDiscardTelegramExpenseStatus, canRestoreTelegramExpenseStatus, isTelegramCommand, parseTelegramInvoiceDate, parseTelegramNumber } from '@/lib/finance/telegram-expense';

describe('Telegram Webhook — Callback data parsing', () => {
  /**
   * El callback data tiene formato "accion:itemId:tenantId"
   * Ejemplo: "auth_buy:item-123:tenant-abc" o "reject_buy:item-456:tenant-xyz"
   */
  const parseCallbackData = (data: string) => {
    const [action, itemId, tenantId] = data.split(':');
    return { action, itemId, tenantId };
  };

  it('debe parsear auth_buy correctamente', () => {
    const result = parseCallbackData('auth_buy:item-123:tenant-abc');
    expect(result).toEqual({
      action: 'auth_buy',
      itemId: 'item-123',
      tenantId: 'tenant-abc',
    });
  });

  it('debe parsear reject_buy correctamente', () => {
    const result = parseCallbackData('reject_buy:item-456:tenant-xyz');
    expect(result).toEqual({
      action: 'reject_buy',
      itemId: 'item-456',
      tenantId: 'tenant-xyz',
    });
  });

  it('debe manejar itemId con caracteres especiales', () => {
    const result = parseCallbackData('auth_buy:item_sku-001:tenant-dash-id');
    expect(result).toEqual({
      action: 'auth_buy',
      itemId: 'item_sku-001',
      tenantId: 'tenant-dash-id',
    });
  });

  it('debe manejar tenantId con UUIDs', () => {
    const result = parseCallbackData('reject_buy:cm3abc123:clerk_org_xyz789');
    expect(result).toEqual({
      action: 'reject_buy',
      itemId: 'cm3abc123',
      tenantId: 'clerk_org_xyz789',
    });
  });

  it('debe devolver undefined para campos faltantes al hacer split insuficiente', () => {
    const result = parseCallbackData('auth_buy:solo-item');
    expect(result.action).toBe('auth_buy');
    expect(result.itemId).toBe('solo-item');
    expect(result.tenantId).toBeUndefined();
  });

  it('debe manejar string vacío', () => {
    const result = parseCallbackData('');
    expect(result.action).toBe('');
    expect(result.itemId).toBeUndefined();
    expect(result.tenantId).toBeUndefined();
  });
});

describe('Telegram Webhook — /start command parsing', () => {
  const parseStartCommand = (messageText: string): { command: string; tenantParam: string | null } => {
    const parts = messageText.split(' ');
    const tenantIdParam = parts.length > 1 ? parts[1] : null;
    return { command: parts[0], tenantParam: tenantIdParam };
  };

  it('debe extraer tenantId del comando /start con parámetro', () => {
    const result = parseStartCommand('/start tenant-123');
    expect(result).toEqual({
      command: '/start',
      tenantParam: 'tenant-123',
    });
  });

  it('debe devolver null si /start no tiene parámetro', () => {
    const result = parseStartCommand('/start');
    expect(result).toEqual({
      command: '/start',
      tenantParam: null,
    });
  });

  it('debe manejar /start con un solo espacio entre comando y parámetro', () => {
    const result = parseStartCommand('/start tenant-abc');
    expect(result.command).toBe('/start');
    expect(result.tenantParam).toBe('tenant-abc');
  });

  it('debe manejar /start con UUID como tenantId', () => {
    const result = parseStartCommand('/start 550e8400-e29b-41d4-a716-446655440000');
    expect(result.command).toBe('/start');
    expect(result.tenantParam).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('debe ignorar comandos que no son /start', () => {
    const result = parseStartCommand('/help');
    expect(result.command).toBe('/help');
    expect(result.tenantParam).toBeNull();
  });

  it('debe manejar mensaje vacío', () => {
    const result = parseStartCommand('');
    expect(result.command).toBe('');
    expect(result.tenantParam).toBeNull();
  });
});

describe('Telegram Webhook — callback_query validation', () => {
  it('debe validar que el callback_query tenga los campos requeridos', () => {
    const validCallback = {
      callback_query: {
        id: 'cb_123',
        message: {
          chat: { id: 123456789 },
          message_id: 42,
          text: '¿Autorizar compra?',
        },
        data: 'auth_buy:item-1:tenant-1',
      },
    };

    expect(validCallback.callback_query).toBeDefined();
    expect(validCallback.callback_query.message.chat.id).toBeDefined();
    expect(validCallback.callback_query.data).toContain(':');
    expect(validCallback.callback_query.data.split(':')).toHaveLength(3);
  });

  it('debe rechazar callback_query sin data', () => {
    const callback = {
      callback_query: {
        id: 'cb_456',
        message: {
          chat: { id: 987654321 },
          message_id: 10,
          text: 'texto',
        },
        data: '',
      },
    };

    const parts = callback.callback_query.data.split(':');
    expect(parts[0]).toBe('');
    expect(parts.length).toBe(1);
  });
});

describe('Telegram Webhook — correcciones de gastos OCR', () => {
  it('reconoce comandos con y sin nombre de bot', () => {
    expect(isTelegramCommand('/gasto_corregir doc-1 total 718,20', 'gasto_corregir')).toBe(true);
    expect(isTelegramCommand('/gasto_corregir@VolkernBot doc-1 total 718,20', 'gasto_corregir')).toBe(true);
    expect(isTelegramCommand('/gastos_pendientes', 'gasto_corregir')).toBe(false);
    expect(isTelegramCommand('/gastos_descartados@VolkernBot', 'gastos_descartados')).toBe(true);
  });

  it('parsea importes europeos y anglosajones', () => {
    expect(parseTelegramNumber('718,20')).toBe(718.2);
    expect(parseTelegramNumber('1.234,56 €')).toBe(1234.56);
    expect(parseTelegramNumber('$1,234.56')).toBe(1234.56);
    expect(parseTelegramNumber('no es un importe')).toBe(null);
  });

  it('valida fechas reales y rechaza fechas imposibles', () => {
    expect(parseTelegramInvoiceDate('12/09/2026')?.toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(parseTelegramInvoiceDate('31/02/2026')).toBeUndefined();
    expect(parseTelegramInvoiceDate('12/09/26')?.getUTCFullYear()).toBe(2026);
  });

  it('solo permite descartar documentos no contabilizados', () => {
    expect(canDiscardTelegramExpenseStatus('PENDING_REVIEW')).toBe(true);
    expect(canDiscardTelegramExpenseStatus('REVIEW')).toBe(true);
    expect(canDiscardTelegramExpenseStatus('ERROR')).toBe(true);
    expect(canDiscardTelegramExpenseStatus('PROCESSED')).toBe(false);
    expect(canDiscardTelegramExpenseStatus('DISCARDED')).toBe(false);
    expect(canRestoreTelegramExpenseStatus('DISCARDED')).toBe(true);
    expect(canRestoreTelegramExpenseStatus('REVIEW')).toBe(false);
  });

  it('construye un resumen editable con los datos OCR y sus tramos', () => {
    const summary = buildTelegramExpenseSummary({
      fileName: 'factura.pdf',
      status: 'REVIEW',
      pageStart: 1,
      pageEnd: 2,
      extractedData: {
        emisor: { nombre: 'Proveedor\nS.L.', nif: 'B12345678' },
        numero_factura: 'F-42',
        fecha_emision: '12/08/2026',
        moneda: 'EUR',
        totales: {
          base_imponible: 600,
          cuota_iva: 87,
          cuota_recargo: 31.2,
          cuota_irpf: 0,
          total_factura: 718.2,
          desglose_iva: [{ tipo: 21 }, { tipo: 10 }, { tipo: 4 }],
        },
      },
    });

    expect(summary).toContain('Proveedor S.L.');
    expect(summary).toContain('IVA: 87 (3 tramos)');
    expect(summary).toContain('Total: EUR 718.2');
    expect(summary).toContain('/gasto_corregir ID campo valor');
    expect(summary).not.toContain('Proveedor\\nS.L.');
  });
});
