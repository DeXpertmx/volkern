
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';
import { encryptFile, decryptFile } from './file-crypto';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Append .enc extension to mark encrypted files
const ENCRYPTED_SUFFIX = '.enc';

/**
 * Sube un archivo a S3 (privado por defecto)
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType?: string
): Promise<string> {
  const key = `${folderPrefix}${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return key; // Retorna la cloud_storage_path
}

/**
 * Sube un archivo a S3 cifrado con AES-256-CBC.
 * El archivo se encripta localmente antes de subirlo.
 * Para descargarlo, usa getEncryptedDownloadUrl que redirige al proxy de desencriptado.
 */
export async function uploadEncryptedFile(
  buffer: Buffer,
  fileName: string,
  contentType?: string
): Promise<string> {
  const encrypted = encryptFile(buffer);
  const encryptedFileName = fileName.endsWith(ENCRYPTED_SUFFIX) ? fileName : `${fileName}${ENCRYPTED_SUFFIX}`;
  return uploadFile(encrypted, encryptedFileName, contentType);
}

/**
 * Descarga un archivo cifrado desde S3 y lo desencripta.
 */
export async function downloadAndDecryptFile(key: string): Promise<{ buffer: Buffer; originalKey: string }> {
  const originalKey = key.endsWith(ENCRYPTED_SUFFIX) ? key.slice(0, -ENCRYPTED_SUFFIX.length) : key;
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error('[S3] Empty response body from S3');
  }

  const encryptedBytes = await response.Body.transformToByteArray();
  const buffer = decryptFile(Buffer.from(encryptedBytes));
  return { buffer, originalKey };
}

/**
 * Genera una URL de descarga que pasa por el proxy de desencriptado.
 */
export function getEncryptedDownloadUrl(key: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const encodedKey = encodeURIComponent(key);
  return `${baseUrl}/api/files/download?key=${encodedKey}`;
}

/**
 * Sube un archivo a S3 como público
 * Estos archivos se almacenan en la carpeta 'public/' y son accesibles sin autenticación
 */
export async function uploadPublicFile(
  buffer: Buffer,
  fileName: string,
  contentType?: string
): Promise<{ key: string; publicUrl: string }> {
  // Los archivos públicos van en la carpeta public/
  const key = `${folderPrefix}public/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // No configuramos ACL porque el bucket ya tiene configuración de acceso público
  });

  await s3Client.send(command);
  
  // Construir URL pública directa
  let publicUrl = '';
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const endpoint = process.env.AWS_ENDPOINT_URL || '';
  const isR2 = endpoint.includes('r2.cloudflarestorage.com');

  if (cdnUrl) {
    // Quitar slash final si existe para evitar dobles slashes
    const base = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
    publicUrl = `${base}/${key}`;
  } else if (isR2) {
    // Si no hay CDN configurado pero es R2, avisamos en la URL para debug
    publicUrl = `https://CONFIGURA_TU_CDN_EN_VERCEL_PARA_R2.com/${key}`;
  } else {
    publicUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  }
  
  return { key, publicUrl };
}

/**
 * Genera una URL firmada para descargar un archivo de S3
 */
export async function getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Elimina un archivo de S3
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Genera una URL firmada para subir un archivo directamente desde el cliente
 */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const key = `${folderPrefix}uploads/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  
  return { uploadUrl, key };
}

/**
 * Genera una URL firmada para subir un archivo público directamente desde el cliente
 */
export async function getPublicUploadUrl(
  fileName: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${folderPrefix}public/catalogo/${timestamp}-${sanitizedFileName}`;

  console.log('[DEBUG getPublicUploadUrl] bucketName:', bucketName);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  // Construir URL pública directa
  let publicUrl = '';
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const endpoint = process.env.AWS_ENDPOINT_URL || '';
  const isR2 = endpoint.includes('r2.cloudflarestorage.com');

  if (cdnUrl) {
    const base = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
    publicUrl = `${base}/${key}`;
  } else if (isR2) {
    publicUrl = `https://CONFIGURA_TU_CDN_EN_VERCEL_PARA_R2.com/${key}`;
  } else {
    publicUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  }

  return { uploadUrl, key, publicUrl };
}
