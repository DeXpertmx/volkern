async function simulateGemmaAudit() {
  console.log('🚀 Iniciando Simulación de Auditoría Gemma: Conciliación Bancaria');
  
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q'; 
  
  const gemmaPayload = {
    tenantId,
    event: 'bank.transaction.created',
    requestPayload: {
      transactionId: 'TXN-998877',
      amount: 1540.50,
      description: 'PAGO FACTURA INV-2026-004'
    },
    gemmaOutput: {
      suggestionId: `sug-sim-${Date.now()}`,
      type: 'reconciliation_suggestion',
      message: 'He detectado un ingreso de 1.540,50€ que coincide exactamente con el importe de la Factura INV-2026-004.',
      confidence: 0.98,
      evidence: [
        { transactionId: 'TXN-998877' },
        { invoiceId: 'INV-2026-004' }
      ],
      suggestedActions: [
        { 
          id: 'reconcile_now', 
          label: 'Conciliar Ahora', 
          critical: true,
          payload: { invoiceId: 'INV-2026-004', transactionId: 'TXN-998877' }
        }
      ]
    }
  };

  try {
    const response = await fetch('http://localhost:3000/api/gemma/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gemmaPayload)
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text);
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

simulateGemmaAudit();
