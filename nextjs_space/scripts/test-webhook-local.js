async function testWebhook() {
  const url = 'http://localhost:3001/api/telegram/webhook?tenantId=cmov5lo3y0000l704brur86uq';
  const payload = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: { id: 646107192, first_name: 'Test', last_name: 'User' },
      chat: { id: 646107192, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: 'hola'
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testWebhook();
