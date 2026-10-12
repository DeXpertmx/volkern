#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# decidir-build.sh — ¿hay que reconstruir la imagen volkern-erp?
#
# Contrato (código de salida):
#   0 → CONSTRUIR   algún cambio afecta a lo que se hornea en la imagen.
#                   Sub-caso (desde 12-oct-2026): si TODO lo que afecta vive
#                   bajo prisma/ (migraciones y/o schema), imprime además
#                   «DECISION: SOLO_MIGRATOR» y «MIGRATOR_NEEDED=1»:
#                   deploy-local.sh construye SOLO el migrator y no toca la
#                   app (el entrypoint no lee migraciones en runtime). Con
#                   --force-build se ignora y se construye todo.
#   1 → SALTAR      desde el último despliegue solo cambió documentación,
#                   workflows, tests o ficheros que ni entran en el contexto
#   2 → INDECISO    sin baseline, sin git, baseline que no es ancestro de HEAD
#                   o uso incorrecto. El llamador DEBE construir.
#
# El gate se equivoca SIEMPRE hacia el lado caro: un `0` o un `2` de más solo
# cuesta minutos de build, mientras que un `1` de más serviría en producción
# una imagen vieja sin que nada lo delate. El sub-caso SOLO_MIGRATOR hereda
# esa regla: se decide mirando lo que ya quedó clasificado como afecta; ante
# cualquier duda (una sola ruta fuera de prisma/), CONSTRUIR.
#
# ────────────────────────────────────────────────────────────────────────────
# POR QUÉ EXISTE
# ────────────────────────────────────────────────────────────────────────────
# El stage `builder` del Dockerfile hace `COPY . .`, así que CUALQUIER archivo
# del contexto (nextjs_space/) invalida esa capa y arrastra `prisma generate` +
# `npm run build` detrás: 10-20 minutos. Pero un commit que solo toca
# documentación, un workflow de CI o un test no cambia NADA de lo que la imagen
# ejecuta. Reconstruirla es tiempo perdido y, como el pipeline termina en un
# `service update --force`, además es un reinicio de producción a cambio de cero.
#
# ────────────────────────────────────────────────────────────────────────────
# QUÉ CUENTA COMO «NO AFECTA A LA IMAGEN»
# ────────────────────────────────────────────────────────────────────────────
#   1. Fuera del contexto de build (p. ej. la documentación de la raíz del
#      repo): ni siquiera viaja en el `docker build`.
#   2. Dentro del contexto, en la lista blanca de `no_afecta`:
#        docs/**      → excluido por .dockerignore: no está en la imagen
#        tests/**     → excluido por .dockerignore
#        app-movil/** → excluido por .dockerignore
#        *.md         → inerte en runtime: ningún código de `app/` ni `lib/` lee
#                       markdown (los únicos lectores son scripts de generación
#                       de PDF y un test, fuera de la imagen). El cambio no
#                       altera el comportamiento, solo invalidaría la caché.
#        .github/**   → configuración de CI: nada la lee en ejecución
#      Los `.pdf` NO están en la lista a propósito: hay documentos servidos
#      desde el propio repositorio y no está verificado que ningún endpoint los
#      lea en runtime. Ante la duda, se construye.
#
# ────────────────────────────────────────────────────────────────────────────
# BASELINE (contra qué se compara)
# ────────────────────────────────────────────────────────────────────────────
#   1. `--since <ref>` (o `$DEPLOY_BASELINE`): comparación explícita, útil para
#      pruebas y para auditar un rango concreto.
#   2. El marcador `deploy-vps/.ultimo-deploy`, que escribe `--marcar` y que
#      `deploy-local.sh` refresca tras un despliegue que CONSTRUYÓ la imagen.
#      Registra el commit desplegado, si el árbol estaba limpio y la huella de
#      los `NEXT_PUBLIC_*` con los que se horneó.
#   3. Nada de lo anterior → `2` (se construye).
#
# ────────────────────────────────────────────────────────────────────────────
# GARANTÍAS Y LÍMITES
# ────────────────────────────────────────────────────────────────────────────
#   • Árbol sucio (cualquier cambio sin commitear dentro del contexto) → se
#     construye. El diff por commit no ve lo que aún no está commiteado.
#   • Los `.env*` están ignorados por git, así que `git status` no los ve: por
#     eso la huella de los `NEXT_PUBLIC_*` se compara aparte contra el marcador
#     (si build-imagen.sh cambia de dónde toma los `--build-arg`, esta huella
#     debe seguirlo: ver `huella_env`).
#   • Baseline que no sea ancestro de HEAD (rebase, rama aparte) → construir.
#   • Sin `.git` (árbol exportado) → `2`: se construye.
#   • Quien llame debe tratar cualquier código distinto de `1` como «construir».
#
# Uso:
#   bash deploy-vps/decidir-build.sh                 # 0 construir / 1 saltar
#   bash deploy-vps/decidir-build.sh --verbose       # lista las rutas clasificadas
#   bash deploy-vps/decidir-build.sh --since <ref>   # baseline explícito
#   bash deploy-vps/decidir-build.sh --marcar        # (re)escribe el marcador
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# Contexto de build = nextjs_space (donde vive el Dockerfile y desde donde
# `deploy-local.sh`/`build-imagen.sh` invocan `docker build ... .`).
CTX_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="$CTX_DIR/deploy-vps/.ultimo-deploy"

SINCE_ARG="${DEPLOY_BASELINE:-}"
VERBOSE=0
MARCAR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --since)
      if [ $# -lt 2 ]; then
        echo "✗ --since necesita una referencia (commit, rama o tag)." >&2
        exit 2
      fi
      SINCE_ARG="$2"
      shift
      ;;
    --since=*) SINCE_ARG="${1#--since=}" ;;
    --verbose|-v) VERBOSE=1 ;;
    --marcar) MARCAR=1 ;;
    -h|--help)
      sed -n '2,50p' "$0"
      exit 2
      ;;
    *)
      echo "✗ Opción desconocida: $1" >&2
      echo "  Uso: $0 [--since <ref>] [--verbose] [--marcar]" >&2
      exit 2
      ;;
  esac
  shift
done

decidir() {
  echo "→ Build necesario: $1"
  echo "DECISIÓN: CONSTRUIR"
  exit 0
}

# Caso especial «solo la imagen migrator desfasa» (cambios SOLO en
# prisma/migrations o prisma/schema.prisma): el runner de la app no cambia
# en runtime (el entrypoint no ejecuta migraciones; las aplica el job
# migrator ANTES del service update), así que reconstruir la app sería 10-20
# min y un reinicio de producción a cambio de nada. En cambio, el migrator
# SÍ debe reconstruirse: si su catálogo no lleva la migración nueva, el job
# la vy a aplicar y tapa el drift con el workaround de hoy.
# deploy-local.sh parsea esta línea para el flujo de solo-migrator.
solo_migrator() {
  echo "→ Solo cambia la imagen migrator (cambios en prisma/): $1"
  echo "DECISION: SOLO_MIGRATOR"
  echo "MIGRATOR_NEEDED=1"
  exit 0
}

saltar() {
  echo "→ Build innecesario: $1"
  echo "DECISIÓN: SALTAR"
  exit 1
}

# ── Huella de los NEXT_PUBLIC_* con los que se hornea la imagen ──
# Espejo de la recolección de `build-imagen.sh`: `.env.production.local` y
# `.env` para todas las NEXT_PUBLIC_*, más NEXT_PUBLIC_APP_URL de
# `deploy-vps/.env.vps`. Se comparan solo las líneas (nunca los valores): el
# hash no revela secretos.
huella_env() {
  local lineas
  lineas="$(
    {
      grep -hE '^NEXT_PUBLIC_[A-Z_]+=' "$CTX_DIR/.env.production.local" "$CTX_DIR/.env" 2>/dev/null || true
      grep -hE '^NEXT_PUBLIC_APP_URL=' "$CTX_DIR/deploy-vps/.env.vps" 2>/dev/null || true
    } | sort
  )"
  printf '%s' "$lineas" | sha256sum | cut -d' ' -f1
}

# ── Marcador: qué árbol produjo la imagen que está desplegada ──
escribir_marcador() {
  local commit arbol huella sucios
  commit="$(git -C "$CTX_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [ -z "$commit" ]; then
    echo "✗ No se pudo resolver HEAD: no se escribe el marcador." >&2
    return 2
  fi

  sucios="$(git -C "$CTX_DIR" status --porcelain --untracked-files=all -- . 2>/dev/null | head -1 || true)"
  if [ -n "$sucios" ]; then arbol="sucio"; else arbol="limpio"; fi

  huella="$(huella_env)"

  {
    echo "# Marcador del pipeline local→VPS: qué árbol produjo la imagen desplegada."
    echo "# Lo escribe «decidir-build.sh --marcar» desde deploy-local.sh tras un"
    echo "# despliegue que construyó la imagen; lo lee el propio decidir-build.sh."
    echo "# Es estado local de la máquina que construye: no se versiona."
    echo "commit=$commit"
    echo "arbol=$arbol"
    echo "env_sha=$huella"
  } > "$MARKER"

  echo "→ Marcador actualizado: $MARKER (commit ${commit:0:12}, árbol $arbol)"
}

if [ "$MARCAR" = "1" ]; then
  escribir_marcador
  exit 0
fi

# ── 1. ¿Hay con qué comparar? ──
if ! command -v git >/dev/null 2>&1; then
  decidir "git no está disponible: no hay historial con el que comparar"
fi

if ! git -C "$CTX_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  decidir "el contexto de build no está dentro de un repositorio git"
fi

CTX_SHA="$(git -C "$CTX_DIR" rev-parse HEAD 2>/dev/null || true)"
if [ -z "$CTX_SHA" ]; then
  decidir "no se pudo resolver HEAD en el contexto de build"
fi

REPO_ROOT="$(git -C "$CTX_DIR" rev-parse --show-toplevel)"
# Ruta del contexto dentro del repo (`nextjs_space`), o vacío si el repo ES el
# contexto. Se usa como pathspec para no mirar cambios que no viajan al build.
if [ "$REPO_ROOT" = "$CTX_DIR" ]; then
  CTX_REL=""
else
  CTX_REL="${CTX_DIR#"$REPO_ROOT"/}"
fi

# Lee un campo `clave=valor` del marcador (vacío si no está).
leer_marcador() {
  sed -n "s/^$1=//p" "$MARKER" 2>/dev/null | head -1 || true
}

ORIGEN_TIPO=""
if [ -n "$SINCE_ARG" ]; then
  SINCE="$SINCE_ARG"
  ORIGEN_TIPO="since"
  ORIGEN="explícito (--since)"
elif [ -f "$MARKER" ]; then
  SINCE="$(leer_marcador commit)"
  ORIGEN_TIPO="marcador"
  ORIGEN="marcador $MARKER"
else
  SINCE=""
  ORIGEN=""
fi

if [ -z "$SINCE" ]; then
  decidir "no hay baseline (ni --since ni marcador): sin referencia no se puede afirmar que la imagen ya corresponde al árbol"
fi

if ! git -C "$REPO_ROOT" cat-file -e "${SINCE}^{commit}" 2>/dev/null; then
  decidir "el baseline '$SINCE' no existe en este repositorio ($ORIGEN)"
fi

if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$SINCE" HEAD 2>/dev/null; then
  decidir "el baseline ${SINCE:0:12} no es ancestro de HEAD (¿rebase o rama distinta?)"
fi

if [ "$VERBOSE" = "1" ]; then
  echo "   · baseline: $SINCE ($ORIGEN)  HEAD: ${CTX_SHA:0:12}"
fi

# ── 2. El marcador manda sobre los `.env*` (que git no ve) ──
# Solo cuando el baseline VIENE del marcador: con un `--since` explícito la
# comparación la pide el operador y no se mezcla con estado local.
if [ "$ORIGEN_TIPO" = "marcador" ]; then
  MARKER_ARBOL="$(leer_marcador arbol)"
  MARKER_ENV="$(leer_marcador env_sha)"

  if [ "$MARKER_ARBOL" = "sucio" ]; then
    decidir "el despliegue anterior se construyó con cambios sin commitear: la imagen no corresponde a ningún commit"
  fi
  if [ -n "$MARKER_ENV" ]; then
    HUELLA="$(huella_env)"
    if [ "$MARKER_ENV" != "$HUELLA" ]; then
      decidir "los NEXT_PUBLIC_* horneados en el build cambiaron desde el último despliegue (huella distinta)"
    fi
  fi
fi

# ── 3. Cambios sin commitear dentro del contexto → construir ──
SUCIOS="$(git -C "$CTX_DIR" status --porcelain --untracked-files=all -- . 2>/dev/null | sed -n '1,5p' || true)"
if [ -n "$SUCIOS" ]; then
  decidir "hay cambios sin commitear en el contexto de build: $(printf '%s' "$SUCIOS" | tr '\n' ' ')"
fi

# ── 4. Clasificar lo que cambió entre el baseline y HEAD ──
# `no_afecta` recibe rutas RELATIVAS AL CONTEXTO de build. En `case` el `*`
# también casa «/», así que `*.md` cubre cualquier profundidad.
no_afecta() {
  case "$1" in
    docs/*|tests/*|app-movil/*|.github/*|*.md) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$SINCE" = "$CTX_SHA" ]; then
  saltar "el árbol desplegado ya es HEAD (${CTX_SHA:0:12}) y no hay cambios sin commitear"
fi

CAMBIOS="$(git -C "$REPO_ROOT" diff --name-only --no-renames "$SINCE" "$CTX_SHA" -- "${CTX_REL:-.}" 2>/dev/null || true)"

AFECTA=""
while IFS= read -r ruta; do
  [ -n "$ruta" ] || continue
  if [ -n "$CTX_REL" ]; then
    rel="${ruta#"$CTX_REL"/}"
  else
    rel="$ruta"
  fi
  if no_afecta "$rel"; then
    if [ "$VERBOSE" = "1" ]; then
      echo "   · no afecta: $rel"
    fi
  else
    echo "   · afecta a la imagen: $rel"
    AFECTA="$AFECTA $rel"
  fi
done <<< "$CAMBIOS"

if [ -n "$AFECTA" ]; then
  # Sub-clasificación: si TODO lo que afecta vive bajo prisma/ (migraciones
  # o schema), el runner no cambia — solo el migrator. Con el proveedor de
  # migraciones en puerta (run-migrations.sh + filtrar-destructivas.sh,
  # 12-oct-2026), el despliegue de una migración NO debería costar un build
  # de 10-20 minutos ni un reinicio a cambio de nada.
  SOLO_PRISMA=1
  for ruta in $AFECTA; do
    case "$ruta" in
      prisma/*) : ;;
      *) SOLO_PRISMA=0 ; break ;;
    esac
  done
  if [ "$SOLO_PRISMA" = "1" ]; then
    solo_migrator "hay cambios SOLO bajo prisma/:$AFECTA"
  fi
  decidir "hay cambios que entran en la imagen:$AFECTA"
fi

saltar "de ${SINCE:0:12} a ${CTX_SHA:0:12} solo cambiaron documentación/workflows/tests (nada que entre en la imagen)"
