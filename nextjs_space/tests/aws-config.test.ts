import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBucketConfig } from '@/lib/aws-config';

describe('getBucketConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AWS_BUCKET_NAME;
    delete process.env.AWS_FOLDER_PREFIX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('debe devolver bucketName y folderPrefix vacíos si no hay env vars', () => {
    const config = getBucketConfig();
    expect(config).toHaveProperty('bucketName');
    expect(config).toHaveProperty('folderPrefix');
    expect(config.bucketName).toBe('');
    expect(config.folderPrefix).toBe('');
  });

  it('debe leer AWS_BUCKET_NAME del entorno', () => {
    process.env.AWS_BUCKET_NAME = 'my-bucket';
    const config = getBucketConfig();
    expect(config.bucketName).toBe('my-bucket');
  });

  it('debe leer AWS_FOLDER_PREFIX del entorno', () => {
    process.env.AWS_FOLDER_PREFIX = 'uploads/prod';
    const config = getBucketConfig();
    expect(config.folderPrefix).toBe('uploads/prod');
  });

  it('debe leer ambas variables simultáneamente', () => {
    process.env.AWS_BUCKET_NAME = 'volkern-storage';
    process.env.AWS_FOLDER_PREFIX = 'tenants';
    const config = getBucketConfig();
    expect(config.bucketName).toBe('volkern-storage');
    expect(config.folderPrefix).toBe('tenants');
  });

  it('debe devolver estructura consistente (siempre 2 keys)', () => {
    const config = getBucketConfig();
    const keys = Object.keys(config);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('bucketName');
    expect(keys).toContain('folderPrefix');
  });

  it('debe ser determinista con mismos env vars', () => {
    process.env.AWS_BUCKET_NAME = 'test-bucket';
    const r1 = getBucketConfig();
    const r2 = getBucketConfig();
    expect(r1).toEqual(r2);
  });
});
