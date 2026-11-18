#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Guardia: el commit a construir/desplegar existe en origin/master
#
# Una imagen sirviendo un commit que la mainline no tiene deja el árbol
# desplegado irrecuperable: no se puede revisar, ni comparar, ni reconstruir lo
# que corre. El push a origin/master es el único acto que publica el árbol, así
# que el pipeline aborta antes de construir o de exportar si el commit no es
# ancestro de origin/master.
#
# Uso: bash deploy-vps/verificar-commit-publicado.sh <commit>
# Sale 0 si el commit está en origin/master; 1 si no lo está o si no se pudo
# consultar el remoto (sin red no se puede afirmar nada: ante la duda, aborta).
# No toca la imagen local ni el VPS.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

RAMA_REMOTA="origin/master"

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo "✗ Uso: bash deploy-vps/verificar-commit-publicado.sh <commit>" >&2
  exit 2
fi

COMMIT=$(git rev-parse --verify --quiet "$1^{commit}" 2>/dev/null) || {
  echo "✗ No existe el commit «$1» en este repositorio: no se puede verificar contra $RAMA_REMOTA." >&2
  exit 1
}

# Se consulta el remoto en cada pasada: un origin/master cacheado de hace días
# diría que un commit ya está publicado cuando en realidad solo está en local.
if ! GIT_TERMINAL_PROMPT=0 timeout 120 git fetch --quiet origin master 2>/dev/null; then
  echo "✗ No se pudo consultar $RAMA_REMOTA (sin red o sin acceso a origin):" >&2
  echo "  no se puede afirmar que ${COMMIT:0:12} esté publicado, así que no se despliega." >&2
  exit 1
fi

if git merge-base --is-ancestor "$COMMIT" "$RAMA_REMOTA"; then
  echo "   ✓ Commit ${COMMIT:0:12} alcanzable desde $RAMA_REMOTA ($(git rev-parse --short "$RAMA_REMOTA"))"
  exit 0
fi

echo "✗ El commit ${COMMIT:0:12} NO está en $RAMA_REMOTA:" >&2
echo "  $(git log -1 --format='%s' "$COMMIT")" >&2
echo "  Construir o desplegar desde aquí dejaría en producción un árbol que el" >&2
echo "  repositorio no tiene. Publica el commit (push a origin/master) y repite." >&2
exit 1
