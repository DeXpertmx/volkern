import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

async function testR2() {
  console.log('Probando conexión a Cloudflare R2 con el bucket "volkern"...');
  
  const s3 = new S3Client({
    region: 'auto',
    endpoint: 'https://496c5cc23ca43cf44da04da56d625f67.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: 'ad0f8dfd8ac67e23c6d4cf8563909a5d',
      secretAccessKey: '3c6e2081d49979d3280d9383b8fa220982a6a8413708207efba36f83f9236bd9',
    },
    forcePathStyle: true,
  });

  try {
    const command = new PutObjectCommand({
      Bucket: 'volkern',
      Key: 'test-final.txt',
      Body: 'Prueba final exitosa',
      ContentType: 'text/plain',
    });

    await s3.send(command);
    console.log('✅ ¡PRUEBA EXITOSA! El bucket "volkern" aceptó la conexión.');
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}
testR2();
