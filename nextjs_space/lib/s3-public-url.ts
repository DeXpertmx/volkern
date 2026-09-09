/**
 * Convierte una clave de S3/R2 en una URL pública.
 * Si el valor ya es una URL (http...) o una ruta local (/...), se devuelve tal cual.
 * Misma lógica que app/api/whitelabel/route.ts para mantener coherencia.
 */
export function getPublicUrl(s3Key: string): string {
  const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
  const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || ''

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL
  if (cdnUrl) {
    const base = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl
    return `${base}/${s3Key}`
  }

  const endpoint = process.env.AWS_ENDPOINT_URL || ''
  if (endpoint.includes('r2.cloudflarestorage.com')) {
    // Sin CDN configurado para R2: usar el dominio público del bucket
    return `https://${AWS_BUCKET_NAME}.${endpoint.replace('https://', '').split('.')[0]}.r2.cloudflarestorage.com/${s3Key}`
  }

  return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`
}
