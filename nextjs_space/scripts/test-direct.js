const { GemmaService } = require('./lib/gemma/gemma-service');

async function test() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  const gemmaOutput = {
    suggestionId: `sug-test-${Date.now()}`,
    type: 'reconciliation_suggestion',
    message: 'Test message from Gemma',
    confidence: 0.99,
    evidence: [],
    suggestedActions: []
  };

  try {
    console.log('Testing processGemmaResponse directly...');
    const res = await GemmaService.processGemmaResponse(tenantId, 'test.event', {}, gemmaOutput);
    console.log('Success:', res.id);
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}

test();
