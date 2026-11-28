# Smoke de esquema: imágenes contra bases

Comprueba que el **código de una imagen** y el **esquema de la base** se corresponden, antes de desplegar y sin tocar producción.

No sustituye al ensayo de `deploy-vps/ensayo-rollback.sh`: aquel prueba las migraciones y el rollback sobre una copia (base de datos, sin app). Este arranca la aplicación de verdad, que es donde se ve si el código espera columnas que la base no tiene.

## Qué parejas se prueban

| Imagen | Base | Qué demuestra |
|---|---|---|
| La del commit a desplegar | Copia restaurada + `migrate deploy` | El código nuevo funciona sobre el esquema nuevo |
| La que corre ahora en producción | La misma copia, sin migrar | La imagen anterior sigue sirviendo el esquema viejo: es el rollback |

La segunda no es «una imagen vieja cualquiera»: es el objetivo real de rollback. Compruébalo por la label, no por el tag:

```bash
docker image inspect volkern-erp:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'

# En el VPS, el commit de la imagen que está sirviendo:
ssh root@<VPS> 'for c in $(docker ps -q --filter name=volkern-erp_app); do
  docker inspect "$c" --format "{{index .Config.Labels \"org.opencontainers.image.revision\"}}"; done'
```

## Entorno mínimo: las variables de URL no son opcionales

Con solo `DATABASE_URL`, la app arranca, `/api/health` responde **200** («la base está bien») y **todas las páginas dan 500**:

```
TypeError: Invalid URL
  code: 'ERR_INVALID_URL', input: ''
```

Es un módulo de render que hace `new URL(...)` con una variable vacía. No es un problema de esquema, y despista precisamente porque el health dice que la base está perfecta. Mínimo que necesita:

| Variable | Valor en el smoke |
|---|---|
| `DATABASE_URL` | `postgresql://postgres@pg:5432/<base>` |
| `NEXTAUTH_URL` | `http://127.0.0.1:<puerto>` |
| `APP_URL` | igual |
| `NEXT_PUBLIC_CDN_URL` | igual (los `NEXT_PUBLIC_*` van horneados en el build, pero en runtime también se leen) |
| `NEXTAUTH_SECRET` | cualquiera de usar y tirar |
| `NODE_ENV` | `production` |

**Ningún secreto de producción.** El smoke no debe poder mandar WhatsApps, correos ni cobros: al arrancar se registran los schedulers, y con valores locales fallan sin efecto.

Rutas: `/` y `/auth/login`. `/login` no existe (404, no es un fallo).

## Cómo repetirlo

```bash
# 0. Copia real de la base (ver el procedimiento del dump) e imágenes
F=~/volkern-ensayos/<STAMP>/volkern_erp-pre-migraciones-<STAMP>.sql.gz
docker image inspect volkern-erp:migrator >/dev/null   # construido del commit a desplegar
docker build --target runner -t volkern-erp:smoke-<sha> .   # mismos --build-arg que deploy-vps/build-imagen.sh

# 1. Postgres desechable con las dos bases
docker network create volkern-smoke-net
docker volume create volkern-smoke-data
docker run -d --name volkern-smoke-pg --network volkern-smoke-net --network-alias pg \
  -e POSTGRES_HOST_AUTH_METHOD=trust -v volkern-smoke-data:/var/lib/postgresql/data postgres:17-alpine
# El dump trae ALTER ... OWNER TO volkern_erp: el rol tiene que existir antes de restaurar.
docker exec volkern-smoke-pg psql -U postgres -c "CREATE ROLE volkern_erp LOGIN"
docker exec volkern-smoke-pg createdb -U postgres smoke_vieja
docker exec volkern-smoke-pg createdb -U postgres smoke_nueva
gunzip -c "$F" | docker exec -i volkern-smoke-pg psql -U postgres -d smoke_vieja -v ON_ERROR_STOP=1 -q
gunzip -c "$F" | docker exec -i volkern-smoke-pg psql -U postgres -d smoke_nueva -v ON_ERROR_STOP=1 -q
docker run --rm --network volkern-smoke-net \
  -e DATABASE_URL="postgresql://postgres@pg:5432/smoke_nueva" volkern-erp:migrator migrate deploy

# 2. Las dos parejas. Cada una con SUS urls: el puerto publicado de esa pareja.
ENTORNO=(-e NODE_ENV=production -e PORT=3000 -e NEXTAUTH_SECRET=smoke-local)
docker run -d --name volkern-smoke-app-nueva --network volkern-smoke-net -p 127.0.0.1:3101:3000 \
  -e DATABASE_URL="postgresql://postgres@pg:5432/smoke_nueva" "${ENTORNO[@]}" \
  -e APP_URL=http://127.0.0.1:3101 -e NEXTAUTH_URL=http://127.0.0.1:3101 \
  -e NEXT_PUBLIC_CDN_URL=http://127.0.0.1:3101 volkern-erp:smoke-<sha>
docker run -d --name volkern-smoke-app-vieja --network volkern-smoke-net -p 127.0.0.1:3102:3000 \
  -e DATABASE_URL="postgresql://postgres@pg:5432/smoke_vieja" "${ENTORNO[@]}" \
  -e APP_URL=http://127.0.0.1:3102 -e NEXTAUTH_URL=http://127.0.0.1:3102 \
  -e NEXT_PUBLIC_CDN_URL=http://127.0.0.1:3102 volkern-erp:latest

# 3. Comprobaciones
for puerto in 3101 3102; do
  for ruta in /api/health / /auth/login; do
    echo ":$puerto $ruta → $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$puerto$ruta")"
  done
done
```

Arrancar y servir páginas **no** prueba el encaje: `/api/health` solo hace `SELECT 1`. Lo que lo prueba es leer desde la imagen las columnas que ese código usa. El fichero tiene que montarse **dentro de `/app`**: si se monta en `/q.js`, `require('@prisma/client')` no resuelve (`MODULE_NOT_FOUND`).

```js
// /tmp/q.js — campos que el código nuevo lee de la solicitud de aprobación
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.mcpApprovalRequest
  .findMany({ take: 2, select: { id: true, status: true, entregaEstado: true, whatsappMessageId: true } })
  .then((f) => console.log('OK', f.length))
  .catch((e) => { console.error('FALLO', e.code); process.exit(1); });
```

```bash
docker run --rm --entrypoint node --network volkern-smoke-net -v /tmp/q.js:/app/q.js:ro \
  -e DATABASE_URL="postgresql://postgres@pg:5432/smoke_nueva" volkern-erp:smoke-<sha> /app/q.js
```

**Control cruzado** (la imagen nueva contra `smoke_vieja`) debe fallar con `P2022 ... does not exist`. Si no falla, el smoke no está midiendo lo que dice medir.

## Limpieza

```bash
docker rm -f volkern-smoke-app-nueva volkern-smoke-app-vieja volkern-smoke-pg
docker volume rm volkern-smoke-data     # contiene una restauración completa de producción
docker network rm volkern-smoke-net
rm -f /tmp/q.js
```

## Primera pasada (28-nov-2026)

- Imágenes: `volkern-erp:smoke-3654905` (commit `9d2a2d13`, árbol sucio por un fichero de test) y `volkern-erp:latest` (`b383c326`, **la que corría entonces en producción**).
- Copia: `volkern_erp-pre-migraciones-20261128-063241.sql.gz`, `sha256 e8b58715…`, 13 solicitudes, 357 tablas, 143 migraciones aplicadas.
- Resultado: `/api/health`, `/` y `/auth/login` a **200** en las dos parejas, sin errores `P20xx` en los logs; la imagen nueva leyó `entregaEstado`/`whatsappMessageId` de datos reales; el control cruzado falló con `P2022`, como debía.
- La imagen anterior **no conoce** las columnas de entrega (`'entregaEstado' in campos = false`), que es lo esperable y lo que permite volver atrás.

Límites: no cubre flujos autenticados (dashboard, MCP con sesión). Para eso, `scripts/mcp-e2e.sh` contra el entorno desplegado.
