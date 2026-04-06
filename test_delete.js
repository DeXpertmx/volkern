require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const integration = await prisma.plaudernIntegration.findFirst();
  if (!integration || !integration.apiKey) {
    console.log('❌ No integration found');
    return;
  }
  
  const apiKey = integration.apiKey;
  const integrationId = integration.botName || 'volkern-prod';
  const botId = 'f169b839-7163-4087-a5fa-9a8689bf3110';
  
  const url = `https://plaudern.abacusai.app/api/integrations/plaudern/${integrationId}/bots/${botId}`;
  console.log('🗑️ Testing DELETE:', url);
  
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    console.log('\n📊 Response Status:', response.status, response.statusText);
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log('\n📄 Response JSON:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log('\n📄 Response Text:');
      console.log(text.substring(0, 200));
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
