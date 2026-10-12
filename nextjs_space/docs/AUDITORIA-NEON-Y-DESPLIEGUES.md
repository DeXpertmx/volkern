# Auditoría: qué apunta a Neon y quién sirve producción

Fecha: 2026-10-10. Alcance: todo lo que puede escribir en producción (VPS, Vercel y
CI). Método: **todo en solo lectura** (`docker inspect`, `psql` de consulta,
cabeceras HTTP, API de Vercel con la sesión local del CLI y búsquedas en el
repositorio). No se ha desplegado, migrado ni modificado nada. Este documento no
contiene credenciales: las URLs de base de datos se citan solo por su forma.

## Veredicto

1. **Producción no depende de Neon**: el dominio sirve el contenedor del VPS y su
   `DATABASE_URL` apunta al Postgres del VPS.
2. **Quedan tres restos** que sí conviene cerrar a mano: el proyecto **Vercel**
   enlazado (sus variables de *producción* siguen siendo las de Neon), un **texto
   legal** que aún declara Vercel y Neon como encargados, y un fichero local
   `.env.production.local` con la base vieja.
3. **La migración `20261009210000_hospitality_template_diseno` no está aplicada
   en ninguno de los dos sitios** (ni en el VPS ni en Neon). Es el drift que deja
   en 500 los pasos de plantillas de comunicación del ensayo de booking.
   **ACTUALIZADO 12-oct-2026**: aplicada y verificada en los DOS lados (VPS vía
   `migrate deploy` con la capa de seguridad nueva, y base compartida de
   desarrollo), columna `diseno` presente, 0 pendientes. El hallazgo restante
   es que la carpeta de la migración sigue **sin commit** en el repo (`??` en
   git status), así que el próximo despliegue desde una imagen nueva necesita
   ese commit para no reintroducir el mismo drift. Además, ahora el job lleva
   capa de seguridad (ver §H2bis).

## Quién sirve producción hoy

| Evidencia | Resultado |
| --- | --- |
| DNS de `volkern.app` | Cloudflare (`2606:4700:…`), origen oculto |
| Cabeceras de `https://volkern.app` | `server: cloudflare` y Next.js; **sin** `x-vercel-id` ni `x-vercel-cache` |
| `buildId` del HTML servido | `hyDeMBkXrCrLrwvayD7Ev` |
| `/app/.next/BUILD_ID` en el contenedor `volkern-erp_app` del VPS | `hyDeMBkXrCrLrwvayD7Ev` (idéntico) |
| Control con un `buildId` inventado | `HTTP 404` (el 200 anterior no es un comodín) |
| `DATABASE_URL` del servicio `volkern-erp_app` | `postgresql://volkern_erp:***@volkern-erp_postgres:5432/volkern_erp` |
| Contenedores en marcha en el VPS (28) | **ninguno** menciona Neon |
| `deploy-vps/.ultimo-deploy` | commit `f217f52`, árbol sucio |

Es decir: `volkern.app` sirve exactamente el build del contenedor del VPS, y ese
contenedor habla con el Postgres del propio VPS.

## Cada camino de despliegue

| Camino | Base de datos que usa | Estado |
| --- | --- | --- |
| VPS (`deploy-local.sh`, `deploy-app.sh`, `decidir-build.sh`, `run-migrations.sh`) | `volkern-erp_postgres:5432/volkern_erp` (vía `deploy-vps/.env.vps`) | Sin Neon |
| `.github/workflows/migrations.yml` | Postgres efímero en `localhost:5432/volkern_migrations` | Sin Neon |
| `.github/workflows/unit-tests.yml` | `localhost:5432/volkern_test` | Sin Neon |
| `.github/workflows/e2e-reconciliation.yml` | `localhost:5432/volkern_test` | Sin Neon |
| `nextjs_space/.github/workflows/docker.yml` | `localhost:5432/test` | Sin Neon |
| `nextjs_space/.github/workflows/db-drift.yml` | Postgres efímero en `localhost` (`app` y `shadow`) | Sin Neon |
| Vercel: proyecto `volkern` (`prj_XV9zjigYwDJL3KN78GoP85gADoRV`) | Neon, según los ficheros *pulled* del 2026-07-17, 08-11 y 09-07 | No sirve el dominio; no verificable en vivo (ver H1) |
| Desarrollo local (esta máquina) | Neon, en `.env.local` (solo local, git ignorado) | Por diseño |
| `nextjs_space/.env` | ya **no** contiene `DATABASE_URL` | Sin Neon |

**Ningún workflow despliega**: no hay `ssh`, `scp`, acciones de despliegue ni
`docker service` en los cinco workflows, así que nada de CI puede reescribir la
base de producción. El despliegue al VPS es manual desde `deploy-vps/`.

Los pasos de CI que apartan las `.env` para que no pisen la base del job
(`e2e-reconciliation.yml` "Backup .env files…", `migrations.yml` "Backup .env
files") ya cubren **`.env` y `.env.local`**, así que mover la URL de desarrollo a
`.env.local` no debilita esa protección.

## Hallazgos

### H1 · El proyecto de Vercel sigue enlazado y su entorno de producción es Neon

El repositorio está enlazado al proyecto Vercel `volkern` (raíz y
`nextjs_space/.vercel/project.json`), y los ficheros de entorno de producción
*descargados* del proyecto (`nextjs_space/.vercel/.env.production.fresh` del
2026-09-07, `nextjs_space/.vercel/.env.production.local` del 2026-07-17 y
`nextjs_space/.env.production.local` del 2026-08-11) traen todos
`DATABASE_URL` apuntando al **pooler de Neon**, además de una variable de
integración `database_NEON_PROJECT_ID`.

Riesgo: si alguien despliega ahí (`vercel deploy`) o vuelve a apuntar un dominio
a Vercel, la aplicación arrancaría contra la base antigua —con el esquema
congelado— y volvería a escribirse en Neon sin que nadie lo pidiera.

**No se pudo verificar el estado actual**: la sesión local del CLI de Vercel está
caducada y su API responde `403 invalidToken`, así que la única evidencia
disponible son los ficheros descargados. Cierre sugerido (requiere sesión):
revisar en el panel las variables de *Production* del proyecto y actualizar
`DATABASE_URL` al Postgres del VPS —o desvincular/eliminar el proyecto si ya no
se usa—.

Mientras siga enlazado, `README.md` es un peligro real porque **documenta ese
camino como si fuera producción**:

- línea 65: "PostgreSQL 15+ accesible (local o gestionado como Neon)";
- línea 207: "### Opción 2: Vercel (manual)";
- línea 210: "requiere ejecutar `vercel deploy --prod --yes` después del `git push`";
- línea 215: "`vercel deploy --prod --yes            # deploy manual a volkern.app`".

Ese comando no despliega a `volkern.app` (que lo sirve el VPS): despliega al
proyecto de Vercel, que apunta a Neon. Copiarlo al pie de la letra es la forma
más fácil de reabrir la base vieja sin querer.

### H2 · La migración del diseño de plantillas no está aplicada en ningún sitio

`20261009210000_hospitality_template_diseno` no aparece en `_prisma_migrations`
del Postgres del VPS y la columna `hospitality_communication_templates.diseno` no
existe allí tampoco: el drift está en los dos sitios (VPS y Neon), no solo en
desarrollo. En los logs del servicio en producción no hay errores de esa columna
en 7 días (0 coincidencias), así que ese camino aún no se ha ejercitado en
producción. Mientras no se aplique, crear o editar plantillas de comunicación
desde la app responde 500. Cierre: aplicar la migración en producción y en
desarrollo antes de usar esa función (no se ha hecho desde aquí).

> **ACTUALIZADO 12-oct-2026**: aplicada y verificada en los dos lados (VPS vía
> `migrate deploy` con la capa de seguridad nueva, y base compartida de
> desarrollo), columna `diseno` presente, 0 pendientes. Véase H2bis.

### H3 · Texto legal desactualizado

`app/dashboard/rrhh/mi-asistencia/page.tsx` declara como encargados del
tratamiento a "Vercel (hosting), Neon (Postgres cifrado), Resend…". Hoy el
hosting y la base de datos son el VPS, así que ese texto —que el usuario puede
imprimir— ya no dice la verdad. Es un cambio de contenido sensible: conviene
decidirlo con quien lleve privacidad, no solo técnicamente.

### H2bis · Capa de seguridad del job de migraciones (IMPLEMENTADA 12-oct-2026)

En el cierre del H2 se añadió a `deploy-vps/run-migrations.sh` la capa que
faltaba, con dos trancas ANTES de `migrate deploy`:

1. **Puerta destructiva** (`deploy-vps/filtrar-destructivas.sh`, función pura
   `sql_es_destructivo`): calcula las pendientes CONTRA LA BASE REAL
   (`_prisma_migrations` vía psql, diff contra el catálogo del migrator),
   extrae su SQL y detecta DROP / TRUNCATE / DELETE o UPDATE sin WHERE /
   ALTER con pérdida. Si hay alguna, la base NO se toca: exit 1. Escapar
   exige flag explícito que queda en el log: `--permitir-destructivas`.
   Si la lista de pendientes no se puede calcular, también aborta: "no poder
   saber qué se va a aplicar" es razón de más para no tocar la base.
2. **Backup previo verificado**: `pg_dump` del Postgres del VPS a
   `/root/backups/volkern_erp-pre-migraciones-<TS>.sql.gz` con `gzip -t`
   ANTES de aplicar nada; si el backup falla, aborta. Solo se omite con
   `--sin-backup` (queda avisado en el log).

Guardias: `tests/filtrar-destructivas-guard.test.ts` (7 tests verdes) y el
comando se sincroniza al VPS en cada deploy por `deploy-local.sh`. Primer uso
verificado el mismo 12-oct: 1 pendiente detectada, clasificada aditiva,
backup de 580K verificado, migración aplicada (`Complete`), columna `diseno`
creada, la tabla conserva sus 8 filas y 0 pendientes tras el deploy.

Aviso honesto: la imagen `volkern-erp:migrator` que había en el VPS era
ANTERIOR a la migración (su catálogo no tenía la carpeta). Se derivó con
`docker commit` añadiéndole la carpeta (respaldo de la anterior en
`volkern-erp:migrator-respaldo-12oct`); el próximo build completo del
migrator la absorberá de verdad. La carpeta de la migración sigue **sin
commit** en el repo: el próximo despliegue necesita ese commit para no
reintroducir el drift.

### H4 · Menciones que NO son problemas (comprobadas una a una)

- `deploy-vps/.env.vps`: `database_NEON_PROJECT_ID=""` (vacía, resto de la
  integración de Vercel).
- `deploy-vps/volkern-erp.yaml`, `deploy-vps/setup-vps-db.sh`: citan Neon como
  **procedencia** del volcado inicial y como referencia de versión de Postgres.
- `scripts/db-setup.ts`: menciona Neon solo en comentarios sobre la convención
  del pooler (conexión directa para `pg_stat_activity`, advisory locks).
- `app/api/configuracion/fiscal/perfiles/route.ts`: comentario histórico sobre
  migraciones que nunca llegaron a Neon.
- `docs/*`: documentación que ya distingue origen y destino.

## Cómo se verificó (reproducible)

```bash
# VPS: entorno real del servicio y de cada contenedor (enmascarado)
ssh root@62.171.134.195 "docker service inspect volkern-erp_app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'" | grep -E '^DATABASE_URL='

# VPS: ¿algún contenedor apunta a Neon?
for c in $(docker ps -q); do docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | grep -qi 'neondb' && echo "$c"; done

# VPS: estado real del esquema
docker exec <contenedor_postgres> psql -U volkern_erp -d volkern_erp -tAc \
  "select count(*) from information_schema.columns where table_name='hospitality_communication_templates' and column_name='diseno'"

# Quién sirve el dominio
curl -sSI https://volkern.app | head -20
curl -s https://volkern.app | grep -o 'buildId[^,]\{0,40\}'
docker exec <contenedor_app> cat /app/.next/BUILD_ID

# Rastreo de menciones en el repositorio
grep -rIl -i neon . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=coverage
```
