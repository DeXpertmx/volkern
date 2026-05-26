export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ReconciliationService } from '@/lib/accounting/reconciliation-service';
import {
  SyncTransactionsSchema,
  ReconcileSchema,
  BulkReconcileSchema,
  BankConnectionCreateSchema,
} from '@/lib/validation/schemas/misc';

// ─── GET ──────────────────────────────────────────────────────────────────────
// Lista conexiones, transacciones, o sugerencias de match según query params

export const GET = withTenantAuth(async (request, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const tenantId = auth.tenant!.id;
  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'connections';
  const connectionId = url.searchParams.get('connectionId') || undefined;
  const unreconciledOnly = url.searchParams.get('unreconciled') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const minConfidence = parseFloat(url.searchParams.get('minConfidence') || '0.5');

  try {
    switch (view) {
      case 'transactions': {
        const result = await ReconciliationService.getTransactions(tenantId, {
          connectionId,
          unreconciledOnly,
          limit,
          offset,
        });
        return NextResponse.json(result);
      }

      case 'suggestions': {
        const suggestions = await ReconciliationService.getMatchSuggestions(tenantId, {
          minConfidence,
          connectionId,
          limit,
        });
        return NextResponse.json({ suggestions });
      }

      case 'stats': {
        const stats = await ReconciliationService.getStats(tenantId);
        return NextResponse.json(stats);
      }

      case 'connections':
      default: {
        const connections = await ReconciliationService.getConnections(tenantId);
        return NextResponse.json({ connections });
      }
    }
  } catch (error: any) {
    console.error('[Reconciliation GET] Error:', error);
    return NextResponse.json({ error: 'Error al obtener datos de conciliación' }, { status: 500 });
  }
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const tenantId = auth.tenant!.id;

  try {
    const body = await request.json();
    const action = body.action || 'sync';

    switch (action) {
      // ── Crear Conexión Bancaria ──────────────────────────────
      case 'create-connection': {
        const validation = BankConnectionCreateSchema.safeParse(body);
        if (!validation.success) {
          return NextResponse.json({
            error: 'Datos de conexión inválidos',
            details: validation.error.format(),
          }, { status: 400 });
        }
        const result = await ReconciliationService.createConnection(tenantId, validation.data);
        return NextResponse.json(result, { status: 201 });
      }

      // ── Sync Transacciones ───────────────────────────────────
      case 'sync': {
        const validation = SyncTransactionsSchema.safeParse(body);
        if (!validation.success) {
          return NextResponse.json({
            error: 'Datos de sincronización inválidos',
            details: validation.error.format(),
          }, { status: 400 });
        }
        const result = await ReconciliationService.syncTransactions(validation.data.connectionId);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }
        return NextResponse.json(result);
      }

      // ── Sync todas las conexiones ────────────────────────────
      case 'sync-all': {
        const results = await ReconciliationService.syncAllConnections(tenantId);
        const totalCount = results.reduce((sum, r) => sum + r.count, 0);
        const errors = results.filter((r) => !r.success);
        return NextResponse.json({
          results,
          totalCount,
          totalErrors: errors.length,
          error: errors.length > 0
            ? `${errors.length} conexión(es) con errores`
            : undefined,
        });
      }

      // ── Obtener Sugerencias de Match (IA) ────────────────────
      case 'match': {
        const connectionId = body.connectionId || undefined;
        const minConfidence = body.minConfidence ?? 0.5;
        const limit = body.limit ?? 20;
        const suggestions = await ReconciliationService.getMatchSuggestions(tenantId, {
          minConfidence,
          connectionId,
          limit,
        });
        return NextResponse.json({ suggestions });
      }

      // ── Reconciliar (Match manual) ───────────────────────────
      case 'reconcile': {
        const validation = ReconcileSchema.safeParse(body);
        if (!validation.success) {
          return NextResponse.json({
            error: 'Datos de reconciliación inválidos',
            details: validation.error.format(),
          }, { status: 400 });
        }
        const recon = await ReconciliationService.reconcile(
          validation.data.transactionId,
          validation.data.entryId,
          validation.data.matchedBy
        );
        return NextResponse.json(recon);
      }

      // ── Reconciliación Masiva ────────────────────────────────
      case 'bulk-reconcile': {
        const validation = BulkReconcileSchema.safeParse(body);
        if (!validation.success) {
          return NextResponse.json({
            error: 'Datos de reconciliación masiva inválidos',
            details: validation.error.format(),
          }, { status: 400 });
        }
        const results = await ReconciliationService.bulkReconcile(
          validation.data.matches,
          validation.data.matchedBy
        );
        const successCount = results.filter((r) => r.success).length;
        return NextResponse.json({
          results,
          successCount,
          errorCount: results.length - successCount,
        });
      }

      // ── Crear Plaid Link Token ───────────────────────────────
      case 'create-plaid-link': {
        const linkToken = await ReconciliationService.createPlaidLinkToken(
          auth.user!.id,
          tenantId
        );
        return NextResponse.json({ linkToken });
      }

      // ── Procesar Stripe Callback ─────────────────────────────
      case 'stripe-callback': {
        if (!body.sessionId) {
          return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 });
        }
        const connections = await ReconciliationService.handleStripeCallback(
          tenantId,
          body.sessionId
        );
        return NextResponse.json({ connections }, { status: 201 });
      }

      // ── Eliminar Conexión ────────────────────────────────────
      case 'delete-connection': {
        if (!body.connectionId) {
          return NextResponse.json({ error: 'connectionId requerido' }, { status: 400 });
        }
        await ReconciliationService.deleteConnection(body.connectionId, tenantId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Acción no soportada: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Reconciliation POST] Error:', error);
    if (error.message?.includes('no encontrada') || error.message?.includes('no soportado')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error en la conciliación bancaria' }, { status: 500 });
  }
});
