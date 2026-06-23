# Prisma migrations

Este repositorio separa las migrations en dos carpetas:

## `migrations/`

Migrations autogeneradas / versionadas con Prisma. Aplicables con:

```
npx prisma migrate deploy
```

Convenciones:

- **Nombre**: `YYYYMMDDhhmmss_descripcion_corta` (Prisma CLI lo genera así).
- **Transacciones**: Prisma envuelve cada `migration.sql` en BEGIN/COMMIT.
  SQL incompatible con transacciones (e.g. `CREATE INDEX CONCURRENTLY`,
  `VACUUM`, `REINDEX`) requiere header `-- no-transaction` (Prisma 4+).
- **Tracking**: cada apply registra un row en la tabla `_prisma_migrations`
  con checksum + timestamp. `npx prisma migrate status` lo verifica.
- **Default path** para añadir índices compuestos, columnas, FKs, enums,
  o cualquier DDL/DML en tablas de staging/prod de tamaño pequeño/medio.

## `migrations/manual/`

Migrations escritas a mano para casos donde el camino auto-Prisma causa
**lock inaceptable** (escritura mantenida en tablas con > 100M filas donde
un `CREATE INDEX` no transaccionado requiere CONCURRENTLY).

Aplicables **manualmente** fuera del flujo `migrate deploy`:

```bash
psql "$DATABASE_URL" -f migrations/manual/<file>.sql
```

⚠️ Después de aplicar el SQL, es OBLIGATORIO reconciliar el historial de
Prisma para que `npx prisma migrate status` no reporte drift:

```bash
npx prisma migrate resolve --applied "<nombre_dir_equivalente>"
```

Convenciones SQL para esta carpeta:

- **Nombre**: `YYYYMMDD_descripcion_corta.sql` (sin timestamp de hora).
- **Idempotencia**: `IF NOT EXISTS` / `DROP IF EXISTS` siempre.
- **Producción segura**: `CREATE INDEX CONCURRENTLY` (no-concurrente
  porque Prisma envolvería en transacción y Postgres rechaza).
- **ANALYZE**: tras `CREATE INDEX`, ejecutar `ANALYZE` para refrescar stats.

## Política arquitectónica (auditada 2026-07-02 tras ticket `cron-composite-index-missing`)

- **Tamaño pequeño/medio (≤ ~5M filas según caso)**: ruta auto-Prisma con
  `npx prisma migrate dev --name ... --create-only` o migración manual
  versionada.

- **Tamaño grande (> 5M filas, lock estándar inaceptable)**: ruta manual/
  con `CONCURRENTLY` + reconciliación con `migrate resolve --applied`.

Históricamente, `prisma/migrations/manual/20260702_attendance_composite_index.sql`
fue un caso borderline (decisión tomada antes de validar que el dataset en
staging cabía en lock breve). **Fue consolidado a auto-Prisma** el
2026-07-02 en `prisma/migrations/20260702000000_add_attendance_composite_index/migration.sql`
porque (a) staging tiene ~184 filas y prod inicial también cabrá en lock
breve, (b) la ruta auto-Prisma satisface los 8 criterios del ticket §5
(incluido `migrate status up to date`), y (c) elimina drift entre el
schema tracker de Prisma y el estado real de DB.
