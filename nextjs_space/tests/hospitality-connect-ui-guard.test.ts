// @vitest-environment node
//
// Guardia de la FASE 3.C en UI y webhook: la tarjeta de cuenta de cobro y el
// botón "Cobrar" existen, el webhook concilia los cobros de hospitality y el
// plan queda marcado. Mismas técnicas que las guardias previas del módulo.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('UI de Finanzas — cuenta de cobro y cobro con tarjeta', () => {
  const fuente = leer('app/dashboard/hospitality/finanzas/page.tsx');

  it('muestra la tarjeta de cuenta de cobro con sus 4 estados', () => {
    expect(fuente).toContain('Cuenta de cobro');
    expect(fuente).toContain("'sin_conectar'");
    expect(fuente).toContain("'pendiente'");
    expect(fuente).toContain("'activo'");
    expect(fuente).toContain("'restringido'");
  });

  it('ofrece conectar con Stripe y verificar el estado', () => {
    expect(fuente).toContain('Conectar con Stripe');
    expect(fuente).toContain('/api/hospitality/cuenta-cobro');
  });

  it('el botón Cobrar con tarjeta aparece solo con cuenta activa y pendiente > 0', () => {
    const iCobrar = fuente.indexOf("cuenta?.estado === 'activo' && r.pendiente > 0");
    expect(
      iCobrar,
      'El botón Cobrar ya no está condicionado a cuenta activa + pendiente'
    ).toBeGreaterThan(-1);
    expect(fuente).toContain('cobrarReserva');
    expect(fuente).toContain('/api/hospitality/finanzas/cobrar');
  });

  it('deja claro que el dinero llega a la cuenta del tenant, no a Volkern', () => {
    expect(fuente).toContain('directamente en tu cuenta de Stripe');
  });
});

describe('Webhook de plataforma — conciliación hospitality', () => {
  const fuente = leer('app/api/webhooks/stripe/route.ts');

  it('concilia los checkout.session.completed de hospitality', () => {
    expect(fuente).toContain("producto === 'hospitality'");
    expect(fuente).toContain('conciliarPagoHospitality');
  });

  it('sincroniza el estado Connect en account.updated', () => {
    expect(fuente).toContain("case 'account.updated'");
    expect(fuente).toContain('hospitalityPaymentAccount.update');
  });
});

describe('Plan de hospitality — FASE 3.C marcada', () => {
  it('las casillas de la FASE 3.C están completadas en el plan', () => {
    const plan = leer('docs/hospitality-booking-payments-plan.md');
    const fase = plan.split('### FASE 3.C')[1]?.split('### FASE 3.D')[0] || '';
    expect(fase).toContain('- [x] Alta de cuenta Connect por tenant (onboarding KYC) y su estado.');
    expect(fase).toContain('- [x] Cobro de la reserva directa contra la cuenta **del tenant**.');
    expect(fase).toContain('- [x] Registro del pago y conciliación con la reserva.');
  });
});
