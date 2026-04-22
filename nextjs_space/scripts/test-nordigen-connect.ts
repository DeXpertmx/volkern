import NordigenClientLib from 'nordigen-node';

const client = new NordigenClientLib({
  secretId: process.env.NORDIGEN_SECRET_ID!,
  secretKey: process.env.NORDIGEN_SECRET_KEY!,
});

async function test() {
  console.log('🧪 Probando conexión con Nordigen...');
  try {
    await client.generateToken();
    console.log('✅ Token generado con éxito.');

    const requisition = await client.initSession({
      redirectUrl: 'http://localhost:3000/api/banking/callback',
      institutionId: 'SANDBOXFINANCE_SFINBASE',
      referenceId: 'test-connection-' + Date.now(),
    });

    console.log('✅ Sesión iniciada con éxito.');
    console.log('🔗 URL de Redirección:', requisition.link);
    console.log('🆔 Requisition ID:', requisition.id);
    
    console.log('\n✨ ¡EL SISTEMA ESTÁ CONECTADO A NORDIGEN CORRECTAMENTE!');
  } catch (error: any) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
  }
  process.exit(0);
}

test();
