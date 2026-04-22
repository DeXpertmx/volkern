const NordigenClient = require('nordigen-node');
require('dotenv').config();

const client = new NordigenClient({
  secretId: process.env.NORDIGEN_SECRET_ID,
  secretKey: process.env.NORDIGEN_SECRET_KEY,
});

async function test() {
  console.log('🧪 Probando credenciales de Nordigen...');
  try {
    await client.generateToken();
    console.log('✅ ¡CONEXIÓN EXITOSA!');
    console.log('El token de acceso se ha generado correctamente.');
  } catch (error) {
    console.error('❌ Error de autenticación:', error.response ? error.response.data : error.message);
  }
}

test();
