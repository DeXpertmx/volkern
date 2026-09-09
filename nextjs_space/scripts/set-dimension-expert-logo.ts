/**
 * Sube el logo oficial de Dimension eXpert (descargado de dimensionexpert.com)
 * al bucket público (R2/S3) y lo enlaza en la Configuración del tenant
 * dimension-expert (clave logo_corporativo), donde antes quedó borrado un
 * logo stale de "DeXpert Inmobiliaria".
 *
 * Idempotente: si la fila ya apunta a un logo "dimension-expert-logo.png"
 * subido por este script, no re-sube ni re-escribe.
 *
 * Nota: se carga en CJS y con polyfill de crypto porque el AWS SDK v3
 * (smithy uuid v4) referencia el global `crypto`, ausente bajo tsx/Node 18.
 */
import * as nodeCrypto from 'node:crypto';
// Polyfill antes de cargar el SDK de AWS
(globalThis as any).crypto = (globalThis as any).crypto || nodeCrypto.webcrypto;
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  (globalThis as any).crypto.randomUUID = nodeCrypto.randomUUID;
}

import { PrismaClient } from '@prisma/client';
import { createS3Client } from '../lib/aws-config';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const p = new PrismaClient();

const TENANT_SLUG = 'dimension-expert';
const SOURCE_URL = 'https://dimensionexpert.com/images/DeXpert%20Logo.png'; // logo principal coloreado
const PUBLIC_BASE = 'https://s3.volkern.app/'; // dominio público del bucket (sin NEXT_PUBLIC_CDN_URL en .env)
const MARKER = 'dimension-expert-logo.png';

async function main() {
  const tenant = await p.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe tenant slug=${TENANT_SLUG}`);

  const existing = await p.configuracion.findUnique({
    where: { tenantId_clave: { tenantId: tenant.id, clave: 'logo_corporativo' } },
  });
  if (existing && existing.valor.startsWith(PUBLIC_BASE) && existing.valor.includes(MARKER)) {
    console.log(`  = Ya configurado: ${existing.valor}`);
    return;
  }

  // 1. Descargar el logo oficial
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el logo (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  ✓ Logo descargado: ${buffer.length} bytes`);

  // 2. Subir como archivo público (mismo patrón que uploadPublicFile)
  const folderPrefix = process.env.AWS_FOLDER_PREFIX || '';
  const key = `${folderPrefix}public/configuracion/logo-${Date.now()}-${MARKER}`;
  const s3 = createS3Client();
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }));
  const publicUrl = `${PUBLIC_BASE}${key}`;
  console.log(`  ✓ Logo subido: ${publicUrl}`);

  // 3. Enlazar en la Configuración del tenant
  await p.configuracion.upsert({
    where: { tenantId_clave: { tenantId: tenant.id, clave: 'logo_corporativo' } },
    update: { valor: publicUrl },
    create: { tenantId: tenant.id, clave: 'logo_corporativo', valor: publicUrl },
  });
  console.log(`  ✓ logo_corporativo -> ${publicUrl}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
