import { AutoReconciler } from '../lib/accounting/auto-reconciler.ts';
import { prisma } from '../lib/db.ts';

async function verify() {
  const tenantId = 'cmo0axgu30000mfux54c6mb30';
  console.log(`🔍 Verificando conciliación para tenant: ${tenantId}`);
  
  const suggestions = await AutoReconciler.getSuggestions(tenantId);
  
  console.log(`📊 Encontradas ${suggestions.length} sugerencias.`);
  
  for (const sug of suggestions) {
    console.log(`--- Sugerencia ---`);
    console.log(`Confianza: ${Math.round(sug.confidence * 100)}%`);
    console.log(`Motivo: ${sug.reason}`);
    console.log(`Asiento: ${sug.entry.description}`);
    console.log(`Banco: ${sug.transaction.description}`);
    console.log(`Importe: ${sug.transaction.amount}€`);
  }

  if (suggestions.length > 0) {
    console.log('\n✅ VERIFICACIÓN EXITOSA: El motor de conciliación detectó los datos de prueba.');
  } else {
    console.log('\n❌ VERIFICACIÓN FALLIDA: No se encontraron sugerencias.');
  }

  process.exit(0);
}

verify();
