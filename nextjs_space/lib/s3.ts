
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

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
  if (process.env.NEXT_PUBLIC_CDN_URL) {
    // Si usan R2 o un CDN personalizado, deben proveer esta variable sin slash al final
    publicUrl = `${process.env.NEXT_PUBLIC_CDN_URL}/${key}`;
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
