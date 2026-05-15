const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { intentClassifier } = require('./lib/agents/intent-classifier');

async function testClassification() {
  const message = 'hola';
  console.log('Testing classification for:', message);
  
  try {
    const result = await intentClassifier.classify({
      message,
      tenantId: 'cmov5lo3y0000l704brur86uq',
      userId: 'test-user'
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testClassification();
