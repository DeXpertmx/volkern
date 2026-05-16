import { AEATXmlGenerator } from '../lib/fiscal/aeat/xml-generator';
import { AEATSigner } from '../lib/fiscal/aeat/signer';
import { AEATClient } from '../lib/fiscal/aeat/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function runGoldenTest() {
  console.log('🚀 INICIANDO GOLDEN TEST: ENVÍO A AEAT');

  const p12Base64 = process.env.AEAT_CERT_P12_BASE64;
  const password = process.env.AEAT_CERT_PASSWORD;

  if (!p12Base64 || !password) {
    console.error('❌ ERROR: Falta configuración del certificado en .env.local');
    console.log('Por favor, añade AEAT_CERT_P12_BASE64 y AEAT_CERT_PASSWORD');
    process.exit(1);
  }

  try {
    // 1. Datos de prueba (Golden Test)
    const testData = {
      emisor: { nif: 'B12345678', nombre: 'EMPRESA TEST SL' },
      receptor: { nif: '12345678Z', nombre: 'CLIENTE PRUEBA' },
      factura: {
        numero: `F-${Date.now()}`,
        fecha: new Date().toISOString(),
        monto: 121.00,
        moneda: 'EUR'
      },
      encadenamiento: {
        fingerprintAnterior: 'GENESIS_VERIFACTU_2026'
      }
    };

    // 2. Generar XML
    console.log('🔹 Generando XML...');
    const xml = AEATXmlGenerator.generateAltaFactura(testData);
    
    // 3. Firmar XML
    console.log('🔹 Firmando XML (XAdES-BES)...');
    const signedXml = await AEATSigner.signXml(xml, p12Base64, password);
    console.log('✅ XML firmado correctamente.');

    // 4. Enviar a AEAT
    console.log('🔹 Enviando a Sandbox AEAT via SOAP...');
    const response = await AEATClient.sendSoap(signedXml, p12Base64, password);
    
    console.log('\n📊 RESPUESTA DE AEAT:');
    console.log(response);

    if (response.includes('ACEPTADA') || response.includes('Correcto')) {
      console.log('\n✨ GOLDEN TEST EXITOSO: Factura aceptada por AEAT.');
    } else {
      console.log('\n⚠️ Factura enviada pero la respuesta no fue la esperada.');
    }

  } catch (error: any) {
    console.error('\n❌ ERROR DURANTE EL TEST:');
    console.error(error.message);
  }
}

runGoldenTest();
