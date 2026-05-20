import { PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { createS3Client, getBucketConfig } from './lib/aws-config';
import { loadEnvConfig } from '@next/env';

async function setupCors() {
  loadEnvConfig(process.cwd());
  const s3Client = createS3Client();
  const { bucketName } = getBucketConfig();

  if (!bucketName) {
    console.error('No AWS_BUCKET_NAME found in env.');
    return;
  }

  console.log(`Setting CORS for bucket: ${bucketName}...`);

  const command = new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['https://volkern.app', 'http://localhost:3000'],
          ExposeHeaders: [],
          MaxAgeSeconds: 3000
        }
      ]
    }
  });

  try {
    await s3Client.send(command);
    console.log('✅ CORS successfully configured automatically!');
  } catch (error) {
    console.error('❌ Failed to configure CORS programmatically:', error);
  }
}

setupCors();
