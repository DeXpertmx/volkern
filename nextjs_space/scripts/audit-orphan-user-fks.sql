-- =====================================================================
-- scripts/audit-orphan-user-fks.sql
--
-- Auditoría de FILAS HUÉRFANAS en todas las tablas con FOREIGN KEY a "User".
--
-- Detección: en lugar de hardcodear tablas, descubre las FKs dinámicamente
-- desde information_schema, así cubre automáticamente cualquier tabla nueva
-- que se añada con relación a User (Prisma las crea con ON DELETE CASCADE
-- o RESTRICT según el schema).
--
-- USO:
--   $ psql "$DATABASE_URL" -f scripts/audit-orphan-user-fks.sql
--
--   Con solo el resumen (sin listar IDs huérfanos):
--   $ psql "$DATABASE_URL" -c "SET app.detalle=0" -f scripts/audit-orphan-user-fks.sql
--
-- SALIDA:
--   • Resumen: una fila por tabla con (tabla, columna, total, huérfanas).
--   • Detalle (por defecto): además, lista los IDs huérfanos de cada tabla
--     afectada (límite de 25 por tabla para no inundar). Desactívalo con
--     `-c "SET app.detalle=0"`.
--
-- INTERPRETACIÓN:
--   * huérfanas > 0 ⇒ hay referencias a usuarios que ya no existen. Puede ser
--     por centinelas tipo 'system'/'SYSTEM'/'cliente' (bug de FK, ver commits
--     dffffec y 2bda44e) o por borrados manuales en la tabla User.
--   * Una columna con huérfanas NO implica que el app falle: solo falla si la
--     FK está activa (NOT NULL + constraint). Las tablas SIN FK a User (p.ej.
--     `notifications` en su momento) aceptan huérfanos silenciosamente.
--
-- IMPORTANTE:
--   • Prisma preserva camelCase en columnas Postgres ⇒ usamos "userId",
--     "createdById", etc. con comillas dobles (igual que el schema).
--   • Script de SOLO LECTURA: no modifica ningún dato.
--   • Si quieres un informe persistente, redirige la salida:
--       psql "$DATABASE_URL" -c "SET app.detalle=0" -f scripts/audit-orphan-user-fks.sql > orphan_report.txt
-- =====================================================================

\set ON_ERROR_STOP on

-- Control de detalle vía current_setting (las variables psql no se
-- interpolean dentro de los bloques DO): 1 = listar IDs, 0 = solo resumen.
DO $$
DECLARE
  fk RECORD;
  orphan_count INTEGER;
  total_count  BIGINT;
  orphan_id    TEXT;
  detail_shown BOOLEAN := false;
  header_shown BOOLEAN := false;
  detalle      INTEGER := COALESCE(NULLIF(current_setting('app.detalle', true), '')::int, 1);
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'AUDITORÍA DE HUÉRFANOS — FKs a "User"';
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '';

  FOR fk IN
    SELECT tc.table_name,
           kcu.column_name,
           kcu.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'User'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    -- Total de filas de la tabla (solo se calcula una vez por tabla)
    EXECUTE format('SELECT count(*) FROM %I', fk.table_name) INTO total_count;

    -- Huérfanas: valor que no existe en "User".id
    EXECUTE format(
      'SELECT count(*) FROM %I AS t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.%I)',
      fk.table_name, fk.column_name, fk.column_name
    ) INTO orphan_count;

    IF NOT header_shown THEN
      RAISE NOTICE '% | % | % | %',
        rpad('tabla', 30), rpad('columna', 24), rpad('total', 10), 'huérfanas';
      RAISE NOTICE '%', repeat('-', 80);
      header_shown := true;
    END IF;

    RAISE NOTICE '% | % | % | %',
      rpad(fk.table_name, 30), rpad(fk.column_name, 24),
      lpad(total_count::text, 10), lpad(orphan_count::text, 10);

    -- Detalle de IDs huérfanos (si se pidió y hay)
    IF detalle = 1 AND orphan_count > 0 THEN
      FOR orphan_id IN
        EXECUTE format(
          'SELECT t.%I::text FROM %I AS t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t.%I) LIMIT 25',
          fk.column_name, fk.table_name, fk.column_name, fk.column_name
        )
      LOOP
        IF NOT detail_shown THEN
          RAISE NOTICE '';
          RAISE NOTICE '--- IDs huérfanos (máx. 25 por tabla) ---';
          detail_shown := true;
        END IF;
        RAISE NOTICE '  % . % = %', fk.table_name, fk.column_name, orphan_id;
      END LOOP;
      IF detail_shown THEN
        RAISE NOTICE '';
        detail_shown := false;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'Fin de la auditoría. Ningún dato fue modificado.';
  RAISE NOTICE '====================================================================';
END $$;
