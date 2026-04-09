require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get integration
  const integration = await prisma.plaudernIntegration.findFirst();
  
  if (!integration || !integration.apiKey) {
    console.log('❌ No integration or API key found');
    return;
  }
  
  const apiKey = integration.apiKey;
  const integrationId = integration.botName || 'volkern-prod';
  const botId = '7d786352-5e5d-429c-b8cb-1d93fd577e57'; // Bot ID del error
  
  console.log('🔍 Testing Plaudern API PUT...');
  console.log('Integration ID:', integrationId);
  console.log('Bot ID:', botId);
  console.log('API Key length:', apiKey.length);
  
  // Test PUT
  const url = `https://plaudern.abacusai.app/api/integrations/plaudern/${integrationId}/bots/${botId}`;
  console.log('\n📤 PUT URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name: 'Prueba',
        personality: 'eres asistente de ventas para 360LIVING',
        greetingMessage: 'Hola, en que te puedo ayudar??'
      })
    });
    
    console.log('\n📊 Response Status:', response.status, response.statusText);
    
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
      console.log('\n📄 Response JSON:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log('\n📄 Response Text:');
      console.log(text);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
