# DEPLOY — Manual Deploy a Vercel (Volkern ERP)

> ⚠️ **Política actual (verificado el `8317134`): NO hay auto-deploy desde GitHub.**
> Cada push a `origin/master` sube código al repo; **no dispara build ni deploy**.
> Cada release requiere ejecutar manualmente `vercel deploy --prod --yes` después del push.

Documento complementario a [`DEPLOY-GUIDE.md`](DEPLOY-GUIDE.md) (VPS / Docker / self-hosted). Aquí cubrimos exclusivamente el flujo de **Vercel CLI manual**.

---

## 📋 Tabla de contenidos

1. [Prerrequisitos](#prerrequisitos)
2. [Flujo estándar de deploy](#flujo-estándar-de-deploy)
3. [Branch mismatch `master` vs `main`](#branch-mismatch-master-vs-main)
4. [Troubleshooting](#troubleshooting)
5. [Comandos útiles](#comandos-útiles)
6. [Checklist post-deploy](#checklist-post-deploy)

---

## 🧰 Prerrequisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22.x (definido en `engines.node` en `package.json`) | Build local + Vercel runtime |
| npm | última | Install deps |
| Vercel CLI | `>=30` | Construir y desplegar |
| GitHub access | push a `DeXpertmx/volkern` | Subir código |

El proyecto está **linkado** a un proyecto de Vercel localmente vía:

- `.vercel/project.json` (committeado al repo) — mapea el working tree al proyecto `volkern` (ID `prj_XV9zjigYwDJL3KN78GoP85gADoRV`).
- `.vercel/.env.production.local` (committeado) — sesión CLI del usuario `dexpertmx`.

> 🔒 El `.vercel/.env.production.local` contiene tokens del CLI autenticado.
> Si necesitas autenticarte en otra máquina, **NO commitees credenciales nuevas** —
> usa `npx vercel login` en esa máquina y deja que Vercel te dé un token fresco.

Verificación rápida:

```bash
vercel whoami   # debe mostrar "dexpertmx"
```

---

## 🚀 Flujo estándar de deploy

### 1. Preparar y commitear

```bash
git add <archivos del feature>
git commit -m "feat(<scope>): <descripción del cambio>"
```

> Stage **explícitamente** los archivos del feature. Si hay cambios no relacionados
> en el working tree (otros features en paralelo), **NO** uses `git add .` o
> `git add -A` — filtra los archivos específicos para evitar commitear trabajo
> ajeno.

### 2. Push a GitHub

```bash
git push origin master
```

> ⚠️ **Esto NO triggerea deploy en Vercel.** Solo sube el código al repo remoto.
> Si tu `git log origin/master -1` muestra tu commit, el push fue exitoso y ya
> puedes proceder al paso 3 sin esperar nada más.

### 3. Deploy manual a producción

```bash
vercel deploy --prod --yes
```

**Flags clave:**

| Flag | Por qué |
|---|---|
| `--prod` | Deploy al ambiente de producción (alias `volkern.app`). Sin esto, Vercel crea una URL preview temporal del estilo `volkern-<hash>-dexpertmxs-projects.vercel.app`. |
| `--yes` | Acepta todos los prompts interactivos con defaults razonables (region, framework, build command, alias). Sin esto, cada deploy pregunta interactivamente. |

**Stream de output típico** (≈1–3 min total):

```
> prebuild:  npm run openapi:generate       (~5s)
> build:     prisma generate && next build (~60-90s)
> uploading: 30 files                       (~30s)
> alias:     volkern.app ← <deployment-url> (~2s)
> Production: https://volkern.app
```

Si el último comando imprime `Production: https://volkern.app` → deploy exitoso.

### 4. Poll readiness

Vercel propaga el alias `volkern.app` prácticamente instantáneo, pero queremos
confirmar que las rutas dinámicas (`/docs/developers`, `/api/*`) sirven 200
**antes** de declarar victoria:

```bash
DEPLOY_URL="https://volkern.app"

for i in $(seq 1 48); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$DEPLOY_URL/docs/developers")
  if [ "$code" = "200" ]; then
    echo "✓ READY after $((i*5))s (HTTP $code)"
    break
  fi
  sleep 5
done
```

Timeout total: 240s (ajustable). Si a los 240s sigue devolviendo `404`,
remitirse a [Troubleshooting](#troubleshooting).

### 5. Smoke tests básicos

Verifica que el nuevo commit sirve correctamente y que las fronteras de
seguridad siguen funcionando en producción:

```bash
# Static asset (OpenAPI spec regenerado por prebuild)
curl -i -s https://volkern.app/openapi.json | head -10
# Esperado: HTTP/2 200, x-vercel-cache: HIT, "openapi":"3.0.3"

# Validación: secret < 32 chars (boundary check)
curl -i -s -X POST -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","secret":"corto","eventType":"webhook.ping"}' \
  https://volkern.app/api/v1/webhooks/test-sign
# Esperado: HTTP 400, body "Falta secret o es demasiado corto (mínimo 32 chars)"

# Validación: URL inválida (anti-SSRF)
curl -i -s -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"http://127.0.0.1\",\"secret\":\"$(openssl rand -hex 32)\",\"eventType\":\"webhook.ping\"}" \
  https://volkern.app/api/v1/webhooks/test-sign
# Esperado: HTTP 400, body mencionando "URL inválida" o similar
```

Confirmar headers de routing (deben estar presentes cuando Cloudflare+LB→Vercel funcionan):

```bash
curl -i -s https://volkern.app/openapi.json | grep -iE 'cf-ray|x-vercel|server'
# Esperado:
#   server: cloudflare
#   cf-ray: <hash>-<IATA>
#   x-vercel-cache: HIT | MISS
#   x-vercel-id: <deployment-id>
```

---

## 🔀 Branch mismatch `master` vs `main`

Vercel permite configurar el **Production Branch** del proyecto (en el dashboard
→ Project → Settings → Git → Production Branch). El default de muchas guías
asume `main`, lo que puede causar confusión cuando el repo usa `master`.

### Síntoma clásico

Hiciste `git push origin master`, ves el commit en `git log origin/master`, pero
los deploys de Vercel siguen apuntando al commit anterior y `vercel ls --prod`
no lista tu commit.

### Diagnóstico

```bash
# ¿Está mi commit al frente del remote?
git log origin/master -3 --oneline

# ¿Está en la lista de producción de Vercel?
vercel ls --prod | head -5

# ¿Cuántos deploys hubo en las últimas 24h?
vercel ls --prod | wc -l
```

Si `git log` muestra tu commit pero `vercel ls --prod` no → la rama del push
diverge de la Producción configurada en Vercel Dashboard.

### Renombrar la rama a `main` (opcional)

```bash
# Local
git branch -m master main

# Remoto (cuidado: requiere permisos de force-push)
git push origin :master
git push --set-upstream origin main
```

### Cambiar el Production Branch en el dashboard

**No implementado por CLI** — ajustar manualmente en
[vercel.com/dashboard](https://vercel.com/dashboard) → Project `volkern` →
Settings → Git → Production Branch.

---

## 🩺 Troubleshooting

### `/docs/developers` devuelve 404 después de un push

**Causa más probable:** el push a GitHub no triggereó deploy (esperado, no
hay auto-deploy).

**Diagnóstico paso a paso:**

```bash
# 1. ¿Está el commit en el remoto?
git log origin/master -1 --oneline

# 2. ¿Está en la lista de producción de Vercel?
vercel ls --prod | head -3

# 3. ¿Cuál es el último deploy que responde en volkern.app?
curl -i -s https://volkern.app/docs/developers | grep -iE 'x-vercel-id|cf-ray'

# 4. (Si nada de lo anterior coincide) El alias volkern.app puede
#    apuntar a un deploy viejo. Re-asignar manualmente:
vercel alias set <latest-deployment-url> volkern.app
```

**Fix definitivo:** ejecutar `vercel deploy --prod --yes` (paso 3 del flujo).

### `x-vercel-cache: HIT` sirve la versión vieja de `public/openapi.json`

**Causa:** Vercel cachea archivos estáticos en el CDN aunque cambies su
contenido en el nuevo deploy.

**Fix:**

```bash
# Forzar deploy con cache invalidation
vercel deploy --prod --yes --force
```

Y/o desde el dashboard: Settings → Data Cache → Purge Cache. Tras purgar, el
próximo `curl` debería reflejar el contenido actualizado.

### `openapi:generate` falla durante `prebuild` en Vercel

**Síntoma:** el build aborta con mensaje tipo
`Error: Cannot find module 'tsx'` o
`[generate-openapi] lib/open-api-v1.ts no exporta openApiV1Document`.

**Diagnóstico local:**

```bash
npm run prebuild      # debe ejecutar sin error
node -e "require('./lib/open-api-v1.ts')"   # debe resolver sin error
```

**Causas típicas:**

1. `lib/open-api-v1.ts` no exporta `openApiV1Document` (importar/exportar roto).
2. Falta `tsx` en `devDependencies` (necesario para que Vercel loader TS funcione).

### `prisma generate` falla con error inesperado en Vercel

**Causa**: `prisma generate` solo lee `prisma/schema.prisma` y escribe el
Prisma Client a `node_modules/.prisma/client` — **NO conecta a la base de
datos** (la conexión solo se usa en `prisma db push`, `migrate` y runtime).
Si falla durante el build, suele ser por:

- Errores de sintaxis en `prisma/schema.prisma`.
- Schema incompatible con la versión de `prisma` instalada (`prisma@6.7.0`).
- `binaryTargets` no soportado por el runtime (requiere Prisma Accelerate o
  generación custom).

> 📌 **Recordatorio del flujo real en este repo**:
> `prebuild = "npm run openapi:generate"` y `build = "prisma generate && next build"`.
> npm corre automáticamente el lifecycle hook `prebuild` antes de `build`
> cuando `package.json` define scripts con esos nombres. Por eso
> `prisma generate` se invoca dentro de `build` (no en `prebuild`).

**Diagnóstico local:**

```bash
npx prisma validate                     # parsea sin generar cliente
npx prisma generate                     # reproduce la fase generate completa
```

**Fix:** corregir el error específico en el schema. NO requiere agregar
ningún env var placeholder a Vercel (este mito es incorrecto y suele
aparecer en soluciones StackOverflow desactualizadas).

### Webhook tester devuelve `Falta secret o es demasiado corto`

**Causa esperada:** HMAC-SHA256 con `crypto.subtle.importKey('raw', ...)`
requiere **exactamente 32 bytes** como raw key. Clientes con `< 32 chars` no
pueden firmar el webhook.

**Fix:** usar `openssl rand -hex 32` → 64 hex chars → 32 bytes raw. El
endpoint server-side `POST /api/v1/webhooks/test-sign` rechaza con HTTP 400
mensaje `"Falta secret o es demasiado corto (mínimo 32 chars)"`.

### `validateWebhookUrl` rechaza URLs públicas legítimas

**Síntoma:** una URL pública real (ej. `https://hooks.zapier.com/...`) es
rechazada con HTTP 400 "Webhook URL inválida".

**Causas:**

| URL | Status | Por qué |
|---|---|---|
| `http://127.0.0.1/...` o `http://localhost/...` | ❌ | loopback |
| `http://192.168.x.x/...` | ❌ | RFC1918 private |
| `http://10.x.x.x/...` | ❌ | RFC1918 private |
| `http://172.16-31.x.x/...` | ❌ | RFC1918 private |
| `http://169.254.169.254/...` | ❌ | AWS metadata link-local |
| `file://`, `data:`, `javascript:` | ❌ | protocolos no-HTTP |

**Fix:** verificar que la URL sea HTTPS pública sin private IPs. Si necesitas
apuntar a un dominio específico que se resuelve a una IP privada (ej. NAT
interno), usa un servicio de proxy reverso HTTPS público (Cloudflare Tunnel,
Ngrok con TLS, etc.).

### Smoke tests devuelven 200 inesperadamente para casos negativos

Si el endpoint devuelve 200 para `secret: "corto"` o `url: "not-a-url"`,
algo en las validaciones se rompió. Verificar:

```bash
git log --oneline -- app/api/v1/webhooks/test-sign/route.ts | head -5
# Confirmar que el commit desplegado tiene los checks de validación

curl -i -s -X POST -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","secret":"corto","eventType":"webhook.ping"}' \
  https://volkern.app/api/v1/webhooks/test-sign -w '\nHTTP:%{http_code}\n'
# Esperado: HTTP 400
```

---

## 🧪 Comandos útiles

| Comando | Descripción |
|---|---|
| `vercel whoami` | Usuario autenticado en Vercel CLI |
| `vercel ls` | Últimos 20 deploys (preview + producción mezclados) |
| `vercel ls --prod` | Solo deploys de producción |
| `vercel ls --prod -n 50` | Más histórico (por defecto `--n 20`) |
| `vercel inspect <deployment-url>` | Metadata del deploy (commit, build settings, env vars expuestas) |
| `vercel logs <deployment-url>` | Stream stdout/stderr del runtime |
| `vercel env ls` | Environment variables configuradas en Vercel |
| `vercel domains ls` | Dominios y aliases activos |
| `vercel alias set <url> <domain>` | Re-asignar manualmente un dominio a un deployment específico |
| `vercel rollback <previous-deployment-url>` | Rollback instantáneo al deploy N (sin rebuild) |
| `vercel --version` | Versión del CLI |

---

## ✅ Checklist post-deploy

Después de cada deploy, ejecutar:

```markdown
- [ ] `git log origin/master -1` muestra el commit esperado
- [ ] `vercel ls --prod -n 1` muestra el deployment URL del feature
- [ ] `curl -i https://volkern.app/docs/developers` → HTTP 200
- [ ] `curl -i https://volkern.app/openapi.json` → HTTP 200, contiene `"openapi":"3.0.3"`
- [ ] `curl -X POST https://volkern.app/api/v1/webhooks/test-sign -d '{...secret corto...}'` → HTTP 400
- [ ] `curl -X POST https://volkern.app/api/v1/webhooks/test-sign -d '{...URL inválida...}'` → HTTP 400
- [ ] Headers `cf-ray` y `x-vercel-*` presentes en respuestas (confirma routing Cloudflare→Vercel)
- [ ] Smoke test del feature específico del commit
```

Una vez todos los checks en verde → release completo.

---

## 📚 Referencias

- [`DEPLOY-GUIDE.md`](DEPLOY-GUIDE.md) — VPS / Docker / Nginx / Systemd (auto-hosted)
- [`OPERATIONAL-MANUAL-REAL-ESTATE.md`](OPERATIONAL-MANUAL-REAL-ESTATE.md) — Manual operativo del módulo inmobiliario
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Vercel Production Branch docs](https://vercel.com/docs/git#production-branch)
