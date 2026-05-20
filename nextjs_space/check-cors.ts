import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

// Import s3 after loading env
import { getPublicUploadUrl } from './lib/s3';

async function checkCors() {
  console.log('Generating presigned URL...');
  const { uploadUrl } = await getPublicUploadUrl('test-cors.png', 'image/png');
  console.log('Upload URL:', uploadUrl);
  
  console.log('\nSending OPTIONS request to check CORS...');
  const res = await fetch(uploadUrl, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://volkern.app',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  });

  console.log('Status:', res.status, res.statusText);
  console.log('CORS Headers:');
  const corsHeaders = [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
  ];
  
  corsHeaders.forEach(h => {
    console.log(`  ${h}: ${res.headers.get(h) || 'NOT SET'}`);
  });
  
  if (!res.headers.get('access-control-allow-origin')) {
    console.log('\n❌ CORS IS NOT CONFIGURED CORRECTLY. The bucket rejected the Origin.');
  } else {
    console.log('\n✅ CORS is configured correctly!');
  }
}

checkCors().catch(console.error);
