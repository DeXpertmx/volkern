import { processChatbotMessage } from '../lib/ai/chatbot-processor';

async function testProcessor() {
  const tenantId = 'local-dev-tenant';
  console.log('--- Testing Chatbot Processor ---');
  
  try {
    const result = await processChatbotMessage(tenantId, 'Hola, ¿qué servicios ofrecen?');
    console.log('AI Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testProcessor();
