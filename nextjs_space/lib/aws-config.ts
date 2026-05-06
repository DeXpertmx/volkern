
import { S3Client } from '@aws-sdk/client-s3';

export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME || '',
    folderPrefix: process.env.AWS_FOLDER_PREFIX || '',
  };
}

export function createS3Client() {
  const endpoint = process.env.AWS_ENDPOINT_URL || process.env.S3_ENDPOINT;
  const isR2 = endpoint?.includes('r2.cloudflarestorage.com');

  const config: any = {
    // Cloudflare R2 exige que la región sea 'auto' para que la firma SigV4 concuerde
    region: isR2 ? 'auto' : (process.env.AWS_REGION || 'us-east-1'),
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new S3Client(config);
}
