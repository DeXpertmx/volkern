-- ============================================================================
-- Traslado de la propiedad del hotel `75fdbbce2e` al tenant del cliente
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   La propiedad "Ciudad Patio Cuarenta" se dio de alta DENTRO del tenant demo
--   porque la conectividad se probó ahí. El hotel es del cliente (Manuel
--   Martín), así que:
--     1. se CREA la propiedad bajo el tenant del cliente, con id nuevo y
--        conservando todos sus datos (incluida `fechaCreacion` original);
--     2. se crean sus unidades igual (id nuevo, mismo `codigo`);
--     3. se mueve el vínculo del proveedor (`connectivity_mappings`) al nuevo
--        par propiedad/unidad — se BORRA el viejo, porque la clave única
--        (provider, externalPropertyId, externalUnitCode) NO incluye tenantId
--        y el mismo hotel no puede estar vinculado dos veces;
--     4. se re-apunta el historial de sincronización a la propiedad nueva;
--     5. se ELIMINA la propiedad del demo (arrastra su unidad por ON DELETE
--        CASCADE).
--
-- POR QUÉ NO ES UN `UPDATE ... SET tenantId`
--   `hospitality_units.tenantId` es columna aparte de `propertyId`: un UPDATE
--   parcial deja hijos con dueño A y padre B. Y las FKs desde la propiedad son
--   ON DELETE CASCADE, así que el traslado se hace con copia + baja, nunca
--   borrando la propiedad "para volver a crearla" fuera de transacción.
--
-- SEGURIDAD
--   Todo va en UNA transacción. Las guardias del principio abortan antes de
--   escribir nada, y la verificación final aborta (y revierte) si alguna
--   invariante se rompe.
--   `-v aplicar=0` -> hace todo y termina en ROLLBACK (ensayo).
--   `-v aplicar=1` -> COMMIT.
--
-- USO
--   psql -U <user> -d <db> -v ON_ERROR_STOP=1 -v aplicar=0 -f este-fichero.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?aplicar}
\else
  \set aplicar 0
\endif

-- ── Parámetros ──────────────────────────────────────────────────────────────
-- OJO, dos trampas de psql que el ensayo cazó (las dos dejaban el script
-- escribiendo sobre nada, en silencio):
--   1) `\set x valor` va SIN comillas: `:'x'` ya entrecomilla. Con comillas en
--      el \set se compara contra '''cmuv...''' y no encuentra nada.
--   2) `\set` se queda con TODO el resto de la línea, comentario incluido: los
--      comentarios van en su propia línea, nunca detrás del \set.
--
-- t_origen  = Demo Real Estate
-- t_destino = Manuel Martín
-- prop_vieja = "Ciudad Patio Cuarenta"
-- hotel_code = código de esa propiedad en el proveedor
\set t_origen  cmtlytty10000s1uuafjc2ril
\set t_destino cmuy1wvzk002lmi01pie3kp40
\set prop_vieja cmuv3xl540094pa01heji6ius
\set hotel_code 75fdbbce2e

BEGIN;

-- ── 1. Guardias: nada se escribe si el terreno no es el esperado ───────────
DO $$
DECLARE
  v_origen  constant text := 'cmtlytty10000s1uuafjc2ril';
  v_destino constant text := 'cmuy1wvzk002lmi01pie3kp40';
  v_prop    constant text := 'cmuv3xl540094pa01heji6ius';
  v_hotel   constant text := '75fdbbce2e';
  n int;
BEGIN
  SELECT count(*) INTO n FROM "Tenant" WHERE id = v_origen;
  IF n <> 1 THEN RAISE EXCEPTION 'guardia: no existe el tenant origen %', v_origen; END IF;

  SELECT count(*) INTO n FROM "Tenant" WHERE id = v_destino;
  IF n <> 1 THEN RAISE EXCEPTION 'guardia: no existe el tenant destino %', v_destino; END IF;

  SELECT count(*) INTO n FROM hospitality_properties
   WHERE id = v_prop AND "tenantId" = v_origen;
  IF n <> 1 THEN RAISE EXCEPTION 'guardia: la propiedad % no está en el tenant origen (filas=%)', v_prop, n; END IF;

  SELECT count(*) INTO n FROM connectivity_mappings WHERE "externalPropertyId" = v_hotel;
  IF n <> 1 THEN RAISE EXCEPTION 'guardia: esperaba 1 vínculo del hotel %, hay %', v_hotel, n; END IF;

  -- El destino no debe tener ya una propiedad con el mismo nombre/código:
  -- sería el síntoma de un traslado a medias.
  SELECT count(*) INTO n FROM hospitality_properties
   WHERE "tenantId" = v_destino
     AND nombre = (SELECT nombre FROM hospitality_properties WHERE id = v_prop);
  IF n <> 0 THEN RAISE EXCEPTION 'guardia: el destino YA tiene una propiedad con ese nombre (¿traslado repetido?)'; END IF;
END $$;

-- ── 2. Ids nuevos (mismo aspecto que los que genera Prisma: 'c' + 24) ──────
-- Los ids los genera el cliente Prisma, no la base: aquí hay que darlos.
CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || 'p'), 1, 24) AS prop_id,
  'c' || substr(md5(random()::text || clock_timestamp()::text || 'u'), 1, 24) AS unidad_id,
  'c' || substr(md5(random()::text || clock_timestamp()::text || 'm'), 1, 24) AS vinculo_id;

-- ── 3. Propiedad nueva bajo el tenant del cliente (copia íntegra de columnas) ─
CREATE TEMP TABLE _prop_tmp ON COMMIT DROP AS
SELECT * FROM hospitality_properties WHERE id = :'prop_vieja';

UPDATE _prop_tmp SET id = (SELECT prop_id FROM _ids),
                      "tenantId" = :'t_destino';

INSERT INTO hospitality_properties SELECT * FROM _prop_tmp;

-- ── 4. Unidades de esa propiedad (id nuevo, mismo código y datos) ──────────
-- El traslado copia las unidades generando id nuevo, y guarda en _map_unidades
-- la correspondencia viejo→nuevo: el vínculo del proveedor la necesita para
-- seguir apuntando a la MISMA unidad (no a cualquiera de la propiedad).
CREATE TEMP TABLE _unid_tmp ON COMMIT DROP AS
SELECT * FROM hospitality_units WHERE "propertyId" = :'prop_vieja';

-- Guardia de clave única (tenantId, codigo) ANTES de tocar nada
DO $$
DECLARE v_choque int;
BEGIN
  SELECT count(*) INTO v_choque
    FROM hospitality_units n
    JOIN hospitality_units e
      ON e."tenantId" = 'cmuy1wvzk002lmi01pie3kp40'
     AND e.codigo IS NOT NULL AND e.codigo = n.codigo
   WHERE n."propertyId" = 'cmuv3xl540094pa01heji6ius';
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'guardia: el destino ya tiene % unidad(es) con el mismo codigo', v_choque;
  END IF;
END $$;

-- Correspondencia viejo→nuevo, generada una sola vez y usada por todos
CREATE TEMP TABLE _map_unidades ON COMMIT DROP AS
SELECT u.id AS viejo_id,
       'c' || substr(md5((SELECT prop_id FROM _ids) || u.id), 1, 24) AS nuevo_id
  FROM hospitality_units u
 WHERE u."propertyId" = :'prop_vieja';

UPDATE _unid_tmp t
   SET id           = m.nuevo_id,
       "tenantId"   = :'t_destino',
       "propertyId" = (SELECT prop_id FROM _ids)
  FROM _map_unidades m
 WHERE t.id = m.viejo_id;

INSERT INTO hospitality_units (id, "tenantId", "propertyId", nombre, codigo, tipo,
                               capacidad, estado, "fechaCreacion", "fechaEdicion",
                               "tarifaBase", moneda, descripcion, fotos, amenidades,
                               "detalleAlojamiento")
SELECT id, "tenantId", "propertyId", nombre, codigo, tipo,
       capacidad, estado, "fechaCreacion", "fechaEdicion",
       "tarifaBase", moneda, descripcion, fotos, amenidades,
       "detalleAlojamiento"
  FROM _unid_tmp;

-- ── 5. Vínculo del proveedor: se retira el viejo y se crea el nuevo ─────────
-- Obligatorio en ese orden: UNIQUE(provider, externalPropertyId, externalUnitCode)
-- no incluye tenantId, así que el hotel no puede estar vinculado dos veces.
CREATE TEMP TABLE _vin_tmp ON COMMIT DROP AS
SELECT * FROM connectivity_mappings WHERE "externalPropertyId" = :'hotel_code';

DELETE FROM connectivity_mappings WHERE "externalPropertyId" = :'hotel_code';

UPDATE _vin_tmp SET id         = (SELECT vinculo_id FROM _ids),
                     "tenantId" = :'t_destino',
                     "propertyId" = (SELECT prop_id FROM _ids),
                     -- cada vínculo conserva SU unidad, vía la correspondencia
                     "unitId"   = (SELECT m.nuevo_id FROM _map_unidades m
                                    WHERE m.viejo_id = _vin_tmp."unitId");

INSERT INTO connectivity_mappings (id, "tenantId", "propertyId", "unitId", provider,
                                   "externalPropertyId", "externalUnitCode",
                                   "externalRatePlanCode", estado, metadata,
                                   "fechaCreacion", "fechaEdicion")
SELECT id, "tenantId", "propertyId", "unitId", provider,
       "externalPropertyId", "externalUnitCode",
       "externalRatePlanCode", estado, metadata,
       "fechaCreacion", "fechaEdicion"
  FROM _vin_tmp;

-- ── 6. Historial de sincronización: viaja con el hotel ─────────────────────
-- Sin esto, al borrar la propiedad del demo las filas quedarían con
-- propertyId NULL y tenantId del demo: historial de un hotel que ya no es suyo.
UPDATE hospitality_sync_logs
   SET "tenantId"   = :'t_destino',
       "propertyId" = (SELECT prop_id FROM _ids)
 WHERE "propertyId" = :'prop_vieja';

-- ── 7. Baja en el demo (arrastra su unidad por ON DELETE CASCADE) ──────────
DELETE FROM hospitality_properties WHERE id = :'prop_vieja';

-- ── 8. Verificación final: si algo no cuadra, se aborta y revierte ─────────
DO $$
DECLARE
  v_origen  constant text := 'cmtlytty10000s1uuafjc2ril';
  v_destino constant text := 'cmuy1wvzk002lmi01pie3kp40';
  v_prop    constant text := 'cmuv3xl540094pa01heji6ius';
  v_hotel   constant text := '75fdbbce2e';
  v_nueva   text;
  n int;
BEGIN
  -- 8.1 La vieja ya no está y la nueva sí, con los mismos datos
  SELECT count(*) INTO n FROM hospitality_properties WHERE id = v_prop;
  IF n <> 0 THEN RAISE EXCEPTION 'verificación: la propiedad vieja sigue existiendo'; END IF;

  SELECT count(*) INTO n FROM hospitality_properties
   WHERE "tenantId" = v_destino AND codigo = '1A' AND nombre = 'Ciudad Patio Cuarenta';
  IF n <> 1 THEN RAISE EXCEPTION 'verificación: la propiedad nueva no está (o hay duplicados): %', n; END IF;

  SELECT id INTO v_nueva FROM hospitality_properties
   WHERE "tenantId" = v_destino AND nombre = 'Ciudad Patio Cuarenta';

  -- 8.2 El hotel queda vinculado UNA sola vez, al par nuevo
  SELECT count(*) INTO n FROM connectivity_mappings WHERE "externalPropertyId" = v_hotel;
  IF n <> 1 THEN RAISE EXCEPTION 'verificación: el hotel no está vinculado exactamente una vez: %', n; END IF;

  SELECT count(*) INTO n FROM connectivity_mappings
   WHERE "externalPropertyId" = v_hotel AND "tenantId" = v_destino AND "propertyId" = v_nueva;
  IF n <> 1 THEN RAISE EXCEPTION 'verificación: el vínculo no apunta al par nuevo'; END IF;

  -- 8.3 Ningún hijo con dueño distinto del dueño de su propiedad
  SELECT count(*) INTO n FROM hospitality_units h
   WHERE h."tenantId" <> (SELECT "tenantId" FROM hospitality_properties p WHERE p.id = h."propertyId");
  IF n > 0 THEN RAISE EXCEPTION 'verificación: % unidad(es) con tenant distinto al de su propiedad', n; END IF;

  SELECT count(*) INTO n FROM connectivity_mappings m
   WHERE m."propertyId" IS NOT NULL
     AND m."tenantId" <> (SELECT "tenantId" FROM hospitality_properties p WHERE p.id = m."propertyId");
  IF n > 0 THEN RAISE EXCEPTION 'verificación: % vínculo(s) con tenant distinto al de su propiedad', n; END IF;

  -- 8.4 El historial de sincronización del hotel ya no apunta al demo
  SELECT count(*) INTO n FROM hospitality_sync_logs
   WHERE "propertyId" = v_nueva AND "tenantId" <> v_destino;
  IF n > 0 THEN RAISE EXCEPTION 'verificación: % log(s) de sincronización con tenant equivocado', n; END IF;

  -- 8.5 El demo se queda sin la propiedad y sin unidades suyas
  SELECT count(*) INTO n FROM hospitality_properties WHERE "tenantId" = v_origen;
  IF n <> 2 THEN RAISE EXCEPTION 'verificación: el demo debería quedarse con 2 propiedades, tiene %', n; END IF;

  RAISE NOTICE 'verificaciones OK: el hotel % ya es del tenant destino', v_hotel;
END $$;

\if :aplicar
  \echo '>>> aplicar=1: COMMIT'
  COMMIT;
\else
  \echo '>>> aplicar=0: ROLLBACK (ensayo)'
  ROLLBACK;
\endif
