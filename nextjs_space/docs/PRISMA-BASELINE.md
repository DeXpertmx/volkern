# Prisma — Baseline y flujo oficial de migraciones

**Fecha**: 2026-09-17 · Verificado sobre la base local (`neondb`, Neon).

Este documento deja constancia de cómo se pasó la base de datos del flujo
`prisma db push` (sin historial) al flujo oficial de migraciones de Prisma
(`migrate dev` / `migrate deploy`), y cómo mantenerlo a partir de ahora.

## Estado antes del baseline

- La base (`neondb`) se creó y mantuvo con `prisma db push`: la tabla
  `_prisma_migrations` **no existía** y `prisma migrate deploy` fallaba con
  **P3005** ("schema is not empty — baseline an existing database").
- `prisma/migrations/` contenía 71 migraciones **no reproducibles**: tres
  "inits" completos y duplicados (`20260412070316_add_ai_proactivity_fields`,
  `20260415_init_agency_architecture`,
  `20260601091455_add_catalogoItemId_to_deal`) que cada uno recrea tablas
  desde cero. Reproducirlas en orden en una base limpia falla con
  `relation "Account" already exists` (verificado con
  `migrate diff --from-migrations`). Este mismo drift ya estaba documentado
  para staging en `docs/CRON-MAINTENANCE.md`.
- El esquema físico de la base **sí coincidía al 100 % con
  `schema.prisma`** (`migrate diff --from-url --to-schema-datamodel` → "No
  difference detected") gracias a un `db push` previo.

## Por qué archivar la historia en vez de resolverla

La receta de "resolver cada migración con `migrate resolve --applied`" solo
vale cuando la historia es reproducible. Aquí no lo es: los inits duplicados
reventarían cualquier despliegue desde cero (CI, nuevo desarrollador, staging
fresco). Prisma no tiene "migrate resolve all": era un bucle de 71 comandos
cuya historia resultante seguiría sin poder aplicarse a una base vacía. La
solución correcta (receta oficial de "baselining") es **congelar la historia
muerta en un archivo y arrancar con un único `0_init`** generado del esquema
actual, que sí es 100 % reproducible.

## Lo que se hizo (orden exacto)

1. **Base shadow** para `migrate dev`: `volkern_shadow` (vacía) creada en el
   mismo servidor Neon. En Neon, `CREATE DATABASE` solo funciona por la
   conexión **directa** (host sin `-pooler`); la URL se derivó reemplazando
   `-pooler.` por `.` en la host de `DATABASE_URL`. Configurada como
   `SHADOW_DATABASE_URL` en `.env` y documentada en `.env.example`; el
   `datasource` de `prisma/schema.prisma` la referencia con
   `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")`.
2. **Historia archivada, no borrada**:
   `prisma/migrations/` → `prisma/migrations_archive/20260406_20260911_db_push_era/`
   (las 71 migraciones + `migration_lock.toml`, intactas y fuera del alcance
   de Prisma).
3. **`0_init` generado del esquema actual** (325 tablas):
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
   ```
   Guardado como `prisma/migrations/0_init/migration.sql` y restaurado el
   `migration_lock.toml` (provider `postgresql`).
4. **Metadatos reiniciados**: `_prisma_migrations` eliminada (solo metadatos
   de Prisma; el esquema de negocio no se tocó en ningún paso).
5. **Baseline**: `npx prisma migrate resolve --applied 0_init` — marca la
   migración como aplicada **sin ejecutar su SQL** contra la base.

## Verificación (todo ejecutado y en verde)

| Comprobación | Resultado |
| --- | --- |
| `npx prisma migrate status` | `Database schema is up to date!` |
| Replay de migraciones: `migrate diff --from-migrations --shadow-database-url … --to-schema-datamodel` | `No difference detected.` |
| Drift DB viva vs esquema: `migrate diff --from-url … --to-schema-datamodel` | `No difference detected.` |
| `npx prisma migrate dev` | `Already in sync, no schema change or pending migration was found.` |
| Suite de tests | 6580 pasan, 0 fallos |

## Cómo trabajar a partir de ahora

**Cambios de esquema (desarrollo):**

```bash
npx prisma migrate dev --name descripcion_del_cambio
```

Genera la migración desde el diff, la aplica a la base de desarrollo y usa la
shadow para calcularla y validarla. Ya no usar `prisma db push` en la base
principal (se queda para prototipos desechables, si acaso).

**Setup de una sola vez (local o entorno nuevo):** el primer arranque
completo de la máquina es `npm run setup` (raíz: `scripts/setup.ts`) —
comprueba Node/git, instala dependencias si faltan, genera el cliente Prisma
y termina ejecutando `db:setup`. Si no hay `.env`, lo crea desde
`.env.example` y se detiene para que el desarrollador ponga sus credenciales.
Sobre una base ya preparada, los comandos directos son:

```bash
npm run db:setup     # deploy + tenant volkern-default + seed + verificación de humo
npm run db:verify    # lo mismo sin escribir (para CI o diagnóstico)
npm run db:reset     # drop del esquema + reconstrucción completa (destructivo)
```

`db:reset` es el `db:setup` destructivo: con `--reset` hace `DROP SCHEMA
public CASCADE` (todo el esquema y sus datos), y a partir de ahí ejecuta el
mismo flujo completo — migraciones desde cero, tenant, seed y verificación.

Antes del drop crea un volcado de seguridad en la raíz del proyecto
(`backup-db-<fecha UTC>-<base>.sql`, gitignorado): `pg_dump --no-owner
--no-privileges` en SQL plano. Si pg_dump no puede (no instalado, versión
más antigua que el servidor —p. ej. pg_dump 16 contra Neon 17—, error de
conexión), exporta un JSON alternativo con Prisma (`backup-db-…​.json`: todas
las tablas públicas; preserva los datos, no es restaurable con psql). Si no
hay volcado de ningún tipo, aborta SIN drop. En interactivo se pregunta;
con `--force` se hace siempre; con `--sin-volcado` se omite a conciencia
(lo usa el job de CI, donde la base es efímera).

Pide confirmación interactiva (escribir `RECONSTRUIR`); `--force` la salta
para CI. Sin TTY la confirmación falla cerrada: no se toca nada. Ante un
fallo, el fallo del drop NO reconstruye nada — la base queda vacía a medias
solo si el drop tuvo éxito y lo siguiente falló, y un segundo `db:reset` la
deja lista.

Idempotente: en una base ya lista termina en segundos. Si la base nunca se
baselinó (P3005), el script no la toca: imprime los pasos de la sección
"Lo que se hizo" de este documento y corta — el baseline es una decisión
humana sobre la base que sea, no un paso automático.

**Entornos desplegados (staging/producción):**

```bash
npx prisma migrate deploy
```

Aplica las migraciones pendientes en orden, sin generar nada. Importante: las
migraciones que se generen de aquí en adelante deben ser **idempotentes y sin
destructivos encubiertos** en sus `DOWN` implícitos — el estándar que ya usaba
el equipo en `docs/CRON-MAINTENANCE.md`.

**Verificación automática en CI:** cada PR ejecuta el workflow
`.github/workflows/db-drift.yml` con dos jobs:

- `drift` — levanta una Postgres desde cero, corre `npm run db:setup` (la base
  completa debe levantarse con un solo comando) y `npm run db:verify`, que
  incluye el chequeo de drift: si las migraciones dejan de reproducir
  `schema.prisma` (un PR que cambia el esquema sin generar su migración, o que
  edita una ya aplicada), el PR falla con el diff exacto.
- `reset` — siembra la base con `db:setup` y después demuestra que
  `npm run db:reset -- --force` la reconstruye íntegra desde cero (drop del
  esquema + migraciones + tenant + seed), que la base resultante pasa
  `db:verify` (coherente y sin drift) y que un segundo reset consecutivo
  también pasa (idempotencia). Si alguien rompe el drop, la reconstrucción o
  el propio flujo de setup, este job lo detecta en el PR.

**Verificación rápida de salud del flujo (local):**

```bash
npx prisma migrate status
npx prisma migrate diff --from-migrations prisma/migrations \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma
# → "No difference detected." = la historia reproduce el esquema exacto.
```

**Reglas del nuevo régimen:**

- No editar `migration.sql` de migraciones ya aplicadas. Para corregir una
  migración que aún no salió del desarrollo: `migrate resolve --rolled-back`,
  editar y volver a aplicar con `migrate dev`.
- No crear "inits" completos: una migración nueva solo contiene SU diff.
- La base shadow debe seguir existiendo y vacía; si alguien la llena, el
  siguiente `migrate dev` fallará con `relation … already exists` (vaciarla
  con `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`).
- `prisma/migrations_archive/` es solo historia: no se regenera, no se borra.
  Si algún día se necesita reconstruir la era `db push`, ahí está completa.

## Coste real de este baseline

Cero datos tocados: el único cambio en la base viva fue crear y luego poblar
`_prisma_migrations` con la fila de `0_init`. Todo lo demás (schema, shadow,
archivos) son estructuras nuevas. El riesgo residual queda eliminado: un
despliegue desde cero (CI, staging fresco) ahora reproduce el esquema exacto
con una sola migración.
