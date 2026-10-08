# Rotación de credenciales

**Por qué existe este documento.** Las credenciales han estado escritas en el
repositorio. Retirarlas del código (hecho) **no las desexpone**: siguen en la historia
de git, y cualquiera con acceso al repositorio puede recuperarlas con `git log -S`. La
única reparación real es **cambiar las credenciales**, y este es el orden en que hay que
hacerlo para no quedarse fuera.

## Inventario

Columna «Estado»: los literales ya **no están en el árbol** (se retiraron leyendo del
entorno), pero **ninguna credencial está rotada todavía**.

| Credencial | Dónde estaba escrita | Estado |
|---|---|---|
| **Postgres de producción** (usuario propietario de Neon) | `scratch/reset_admin_volkern.js`, `scratch/reset_admin_direct.js`, `scratch/cleanup_db.sh`, `scripts/safe-insurance-migration.ts` | Retirada del código. **Sin rotar** — es el hallazgo más grave |
| `admin@volkern.app` | `verify-auth-bootstrap.ts`, `try-admin-passwords.ts`, `scratch/verify-admin.js`, `scratch/reset_admin_volkern.js`, `scratch/reset_admin_direct.js`, `seed.ts`, `README.md` | Retirada del código. Sin rotar |
| `admin@dexpert.volkern.app` | `verify-auth-bootstrap.ts`, `GUION_DEMO_DIMENSION_EXPERT.md` | Retirada del código. Sin rotar |
| `dximobilia@dimensionexpert.com` | `GUION_DEMO_DIMENSION_EXPERT.md` | Provisional y sin rotar; es cuenta de cliente |
| `direccion@dexpert.volkern.app` | `GUION_DEMO_DIMENSION_EXPERT.md` | Cuenta legada, sin rotar |
| `bruno.hess@dimensionexpert.com` | `add-user-bruno.ts`, `reset-user-password.ts`, `scratch/reset_admin_direct.js` | Retirada del código. **No rotar**: su contraseña es propia desde el 03/09 |
| `admin@volkern.com`, `admin@demorealestate.com`, `agente@demorealestate.com` | `README.md`, `GUION_DEMO_DIMENSION_EXPERT.md` | Retirada del código. Sin rotar |

Los ficheros `scratch/` siguen en el repositorio, ya saneados, por decisión explícita:
no se borran. Ojo: `scratch/` está en `nextjs_space/.gitignore`, así que sus ficheros
son rastreados de antes de esa regla; para volver a tocarlos hay que usar
`git add -u` (o `-f`), no un `git add` normal.

La misma cadena de conexión aparece además en `nextjs_space/.env` y
`nextjs_space/.env.production.local`. **No están rastreados** (`.gitignore` cubre
`.env*`), así que no se han tocado, pero hay que actualizarlos al rotar la base de
datos o la aplicación se quedará sin conexión.

## Variables de entorno

El contrato completo está en
[`scripts/bootstrap-admin.env.example`](../scripts/bootstrap-admin.env.example):

```
ADMIN_TEMP_PASSWORD            # admin@volkern.app
DEXPERT_ADMIN_TEMP_PASSWORD    # admin@dexpert.volkern.app
BRUNO_TEMP_PASSWORD            # bruno.hess@dimensionexpert.com
SUPERADMIN_TEMP_PASSWORD       # reset-superadmin-password.ts
DEMO_RE_PASSWORD               # capturador de pantallas de Real Estate
ADMIN_CHECK_PASSWORD           # scratch/verify-admin.js
ADMIN_CANDIDATES               # try-admin-passwords.ts (candidatos por comas)
SEED_SUPERADMIN_PASSWORD       # seed.ts
SEED_ADMIN_PASSWORD            # seed.ts
SEED_TEST_USER_PASSWORD        # seed.ts
```

Los scripts **abortan** si la variable falta. No hay valor por defecto, a propósito: un
fallback silencioso es una credencial publicada con otro nombre.

## Procedimiento

El orden importa: primero se cambia, después se verifica, y solo al final se retira el
acceso viejo. Nunca al revés.

### 0. Preparación

1. Genera las contraseñas nuevas con un gestor (no a mano, no reutilizadas).
2. Guárdalas en el gestor del equipo. **No** en este repositorio, ni en un `.env`
   versionado, ni en un mensaje de chat.
3. Ten a mano el acceso SSH al VPS y confirma que puedes entrar en `admin.volkern.app`
   antes de tocar nada.

### 1. Empezar por la base de datos

Es la credencial de mayor alcance: con ella se lee y se escribe todo, sin pasar por la
autenticación de la aplicación.

1. En el panel de Neon, rota la contraseña del **usuario propietario**.
2. Actualiza `DATABASE_URL` en el entorno de producción del VPS.
3. Reinicia la aplicación y verifica que sigue sirviendo tráfico autenticado.

Si algo falla aquí, para: el resto del plan es inútil sin base de datos.

### 2. Escribir las contraseñas nuevas en el entorno del servidor

Ajusta `ADMIN_TEMP_PASSWORD` y `DEXPERT_ADMIN_TEMP_PASSWORD` en el fichero de entorno de
producción. No las imprimas por pantalla ni las pases por línea de comandos: quedan en
el historial del shell.

### 3. Aplicarlas

```bash
cd nextjs_space
npx tsx --require dotenv/config scripts/bootstrap-admin.ts
```

El script hace `upsert` y re-hashea, así que las cuentas existentes se actualizan sin
perder su rol, su tenant ni su histórico. Es idempotente.

### 4. Verificar antes de invalidar nada

```bash
ADMIN_TEMP_PASSWORD='…' DEXPERT_ADMIN_TEMP_PASSWORD='…' \
  npx tsx scripts/verify-auth-bootstrap.ts
```

Debe salir `pwd:OK` en las dos cuentas. Si alguna dice `NO`, **para**: la contraseña
anterior sigue funcionando y no se ha perdido el acceso.

### 5. Cerrar las sesiones emitidas con las contraseñas viejas

Las sesiones vivas no se invalidan solas al cambiar el hash. Cierra las sesiones de
administración (o rota `NEXTAUTH_SECRET` si el mecanismo de sesión lo permite) y vuelve a
entrar con la contraseña nueva para confirmar que el `authorize()` por subdominio
resuelve bien.

### 6. Cuentas de cliente y demo

- Pedir al cliente que cambie la contraseña provisional de `dximobilia@dimensionexpert.com`.
- Eliminar la cuenta legada `direccion@dexpert.volkern.app`.
- Confirmar que `bruno.hess@dimensionexpert.com` **no** se ha reseteado: su contraseña es
  propia desde el 03/09 y `scripts/reset-bruno-password.ts` lo advierte.
- Rotar las cuentas de demo (`admin@demorealestate.com`, `agente@demorealestate.com`) o
  aceptar por escrito que son descartables.

## Estado de la limpieza del repositorio

- [x] `scripts/verify-auth-bootstrap.ts`, `try-admin-passwords.ts`, `add-user-bruno.ts`, `reset-user-password.ts`
- [x] `scripts/seed.ts` (tres contraseñas, y ya no imprime ninguna)
- [x] `README.md` (tabla de credenciales → nombres de variables)
- [x] `GUION_DEMO_DIMENSION_EXPERT.md` (seis credenciales, dos de cliente)
- [x] `scratch/verify-admin.js`, `scratch/reset_admin_volkern.js`, `scratch/reset_admin_direct.js`
- [x] `scratch/cleanup_db.sh` y `scripts/safe-insurance-migration.ts` (cadena de Postgres,
      una de ellas como valor por defecto en código)
- [ ] Actualizar `.env` y `.env.production.local` al rotar la base de datos (no rastreados)
- [ ] **Rotar todo lo de arriba.** La limpieza no sustituye a la rotación.

## Qué no hacer

- **No** reescribir la historia de git para «borrar» las credenciales. No desexpone nada a
  quien ya clonó, y rompe todas las ramas y worktrees.
- **No** saltarse el paso 4. Verificar antes de invalidar es lo único que garantiza que un
  error de tipeo en el entorno no deje el ERP sin administración.
- **No** dejar un valor por defecto «para que funcione en local». Es exactamente el
  problema que este documento cierra.
- **No** dar por hecho que nadie las usó. Una cadena de conexión con permiso de escritura
  en el repositorio hay que asumirla comprometida.
