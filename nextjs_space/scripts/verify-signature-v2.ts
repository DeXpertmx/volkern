import * as crypto from 'crypto';
import { SignatureService } from '../lib/security/signature-service';

async function main() {
  const vaultSeed = 'volkern-demo-seed-xyz-123';
  const docContent = 'Traspaso de Kit de Sensores de Ana a Carlos - 2026-04-17';
  
  console.log('🚀 Validando Motor Criptográfico del Digital Seal...');

  const docHash = SignatureService.hashDocument(docContent);
  const signature = SignatureService.generateSignature(docHash, vaultSeed);
  
  console.log('Document Hash (SHA256):', docHash);
  console.log('Signature Hash (HMAC):', signature);

  const isValid = SignatureService.verifyIntegrity(docHash, signature, vaultSeed);
  
  if (isValid) {
    console.log('✅ VALIDACIÓN EXITOSA: El motor HMAC-SHA256 es íntegro y soberano.');
  } else {
    console.log('❌ FALLO: La verificación de firma ha fallado.');
  }
}

main().catch(console.error);
