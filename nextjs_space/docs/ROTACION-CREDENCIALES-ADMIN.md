# Rotación de credenciales de administración

**Por qué existe este documento.** Las contraseñas de administración han estado
escritas en el repositorio. Sacarlas del código (hecho en `scripts/*.ts`, que ahora
leen del entorno) **no las desexpone**: siguen en la historia de git, y cualquiera con
acceso al repositorio puede recuperarlas con `git log -S`. La única reparación real es
**cambiar las contraseñas**, y este es el orden en que hay que hacerlo para no quedarse
fuera.

## Inventario de lo expuesto

| Cuenta | Dónde estaba escrita | Estado |
|---|---|---|
| `admin@volkern.app` | `scripts/verify-auth-bootstrap.ts`, `scripts/try-admin-passwords.ts`, `scratch/verify-admin.js`, `scratch/reset_admin_volkern.js`, `scratch/reset_admin_direct.js`, `scripts/seed.ts` | Literales retirados de `scripts/`; **pendiente** en `scratch/` y `seed.ts` |
| `admin@dexpert.volkern.app` | `scripts/verify-auth-bootstrap.ts`, `GUION_DEMO_DIMENSION_EXPERT.md` | Literal retirado del script; **pendiente** en el guion |
| `dximobilia@dimensionexpert.com` | `GUION_DEMO_DIMENSION_EXPERT.md` | **Pendiente**; el guion la marca como provisional |
| `direccion@dexpert.volkern.app` | `GUION_DEMO_DIMENSION_EXPERT.md` | **Pendiente**; cuenta legada, el guion la da por pendiente de eliminar |
| `bruno.hess@dimensionexpert.com` | `scripts/add-user-bruno.ts`, `scripts/reset-user-password.ts` | Literales retirados. El propietario ya cambió su contraseña: **no resetear** |
| `admin@volkern.com`, `admin@demorealestate.com`, `agente@demorealestate.com` | `README.md`, `GUION_DEMO_DIMENSION_EXPERT.md` | **Pendiente** |

## Variables de entorno

Todas las contraseñas de administración se pasan por entorno. El contrato está en
[`scripts/bootstrap-admin.env.example`](../scripts/bootstrap-admin.env.example):

```
ADMIN_TEMP_PASSWORD            # admin@volkern.app
DEXPERT_ADMIN_TEMP_PASSWORD    # admin@dexpert.volkern.app
BRUNO_TEMP_PASSWORD            # bruno.hess@dimensionexpert.com
SUPERADMIN_TEMP_PASSWORD       # reset-superadmin-password.ts
DEMO_RE_PASSWORD               # capturador de pantallas de Real Estate
ADMIN_CANDIDATES               # try-admin-passwords.ts (candidatos separados por comas)
```

Los scripts **abortan** si la variable falta. No hay valor por defecto, a propósito:
un fallback silencioso es una credencial publicada con otro nombre.

## Procedimiento

El orden importa: primero se cambia, después se verifica, y solo al final se borra el
acceso viejo. Nunca al revés.

### 0. Preparación

1. Genera las contraseñas nuevas con un gestor (no a mano, no reutilizadas).
2. Guárdalas en el gestor de contraseñas del equipo. **No** en este repositorio, ni en
   `.env` versionado, ni en un mensaje de chat.
3. Ten a mano el acceso SSH al VPS y confirmación de que puedes iniciar sesión en
   `admin.volkern.app` antes de tocar nada.

### 1. Escribir las nuevas contraseñas en el entorno del servidor

En el fichero de entorno de producción del VPS, ajusta `ADMIN_TEMP_PASSWORD` y
`DEXPERT_ADMIN_TEMP_PASSWORD`. No las imprimas por pantalla ni las pases por línea de
comandos: quedan en el historial del shell.

### 2. Aplicarlas

```bash
cd nextjs_space
npx tsx --require dotenv/config scripts/bootstrap-admin.ts
```

El script hace `upsert` y re-hashea, así que las cuentas existentes se actualizan sin
perder su rol, su tenant ni su histórico. Es idempotente.

### 3. Verificar antes de invalidar nada

```bash
ADMIN_TEMP_PASSWORD='…' DEXPERT_ADMIN_TEMP_PASSWORD='…' \
  npx tsx scripts/verify-auth-bootstrap.ts
```

Debe salir `pwd:OK` en las dos cuentas. Si alguna dice `NO`, **para**: la contraseña
anterior sigue funcionando y no se ha perdido el acceso.

### 4. Cerrar las sesiones emitidas con las contraseñas viejas

Las sesiones vivas no se invalidan solas al cambiar el hash. Cierra las sesiones de
administración (o rota `NEXTAUTH_SECRET` si el mecanismo de sesión lo permite) y vuelve
a entrar con la contraseña nueva para confirmar que el `authorize()` por subdominio
resuelve bien.

### 5. Retirar lo que ya no debe existir

- Eliminar la cuenta legada `direccion@dexpert.volkern.app`.
- Confirmar que `bruno.hess@dimensionexpert.com` **no** se ha reseteado (su contraseña
  es propia desde el 03/09; `scripts/reset-bruno-password.ts` lo advierte).
- Pedir al cliente que cambie la contraseña provisional de `dximobilia@dimensionexpert.com`.

### 6. Limpiar el repositorio

- [ ] `scratch/verify-admin.js`, `scratch/reset_admin_volkern.js`, `scratch/reset_admin_direct.js`
- [ ] `scripts/seed.ts` (semilla con contraseña conocida y que además la imprime)
- [ ] `README.md` (tabla de credenciales)
- [ ] `GUION_DEMO_DIMENSION_EXPERT.md` (seis credenciales, dos de ellas de cliente)
- [ ] `.env.example` y `bootstrap-admin.env.example`: solo nombres de variables, nunca valores

## Qué no hacer

- **No** reescribir la historia de git para «borrar» las contraseñas. No desexpone nada
  a quien ya clonó, y rompe todas las ramas y worktrees.
- **No** saltarse el paso 3. Verificar antes de invalidar es lo único que garantiza que
  un error de tipeo en el entorno no deje el ERP sin administración.
- **No** dejar un valor por defecto «para que funcione en local». Es exactamente el
  problema que este documento cierra.
