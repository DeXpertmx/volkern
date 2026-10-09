#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# comprobar-head-desacoplado.sh — aviso de commit huérfano
#
# Dos alcances en el mismo comando, con el mismo contrato:
#
#   (por defecto)  el commit ACTUAL: HEAD está desacoplado (no apunta a ninguna
#                  rama) Y el commit no está contenido en ninguna rama, ni local
#                  ni remota. En ese estado nada lo referencia, `git gc` puede
#                  llevárselo cuando expire el reflog, y no aparece en ninguna
#                  rama: un commit que existe pero no está en ningún sitio.
#
#   --historial    TODO el repositorio: los commits que YA quedaron huérfanos,
#                  que `git gc` puede eliminar. Se listan antes de que eso pase
#                  y se distinguen dos clases, porque no urgen igual:
#
#                     · en el reflog   → solo lo sostiene el reflog de algún
#                       ref; aguanta hasta que expire `gc.reflogExpireUnreachable`
#                       (30 días por defecto).
#                     · sin reflog     → no lo sostiene nadie: `git gc` lo borra
#                       tras `gc.pruneExpire` (2 semanas por defecto). Más urgente.
#
#                  Esta segunda clase es invisible para cualquier comprobación
#                  que solo mire el reflog: son objetos que el reflog ya olvidó
#                  (stashes descartados, resets antiguos con reflog expirado…).
#
# No es hipotético: pasó en este proyecto. Un `git commit` en el checkout
# principal (que está desacoplado a propósito porque `master` está retirado en
# otro worktree) no avanzó ninguna rama, y `git commit` terminó en verde. Sin
# una comprobación, el commit se descubre tarde o no se descubre.
#
# ────────────────────────────────────────────────────────────────────────────
# CONTRATO (código de salida, igual en los dos alcances)
# ────────────────────────────────────────────────────────────────────────────
#   0 → sano: no hay nada huérfano (o se rescató con --rescatar)
#   1 → AVISO: hay un commit huérfano (HEAD desacoplado o huérfanos antiguos)
#   2 → no se puede comprobar (sin git, fuera de un repositorio)
#
# El 1 es un AVISO, no un fallo: el llamador decide qué hace con él. El hook
# `post-commit` lo invoca con `--quiet` y con `|| true`, porque el commit ya
# está hecho y un hook no debe tumbar nada.
#
# COSTE: el alcance por defecto son ~10 ms (un `rev-parse` y un `for-each-ref`).
# `--historial` corre un `git fsck` (0,10 s medidos en este repo con
# `--connectivity-only` frente a 1,70 s sin él, con respuesta idéntica), por eso
# NO lo llama el hook: se ejecuta a demanda o desde donde interese.
#
# ────────────────────────────────────────────────────────────────────────────
# NO AVISA CUANDO EL DESACOPLE ES DELIBERADO
# ────────────────────────────────────────────────────────────────────────────
# `rebase`, `bisect`, `cherry-pick` y `revert` desacoplan HEAD por diseño y
# crean commits ahí a propósito. Avisar en esos casos convertiría el aviso en
# ruido de fondo, que es la forma más rápida de que nadie lo lea. Si hay una de
# esas operaciones en curso, se sale en silencio con 0.
#
# Uso:
#   bash scripts/comprobar-head-desacoplado.sh              # el commit actual
#   bash scripts/comprobar-head-desacoplado.sh --historial  # todos los huérfanos del repo
#   bash scripts/comprobar-head-desacoplado.sh --quiet      # silencio si todo va bien
#   bash scripts/comprobar-head-desacoplado.sh --rescatar   # crea rescate/<sha7> con cada huérfano
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

QUIET=0
RESCATAR=0
HISTORIAL=0

for a in "$@"; do
  case "$a" in
    --quiet|-q) QUIET=1 ;;
    --rescatar) RESCATAR=1 ;;
    --historial) HISTORIAL=1 ;;
    -h|--help)
      # El encabezado ES el uso: se imprimen las líneas de comentario iniciales y
      # se corta en la primera que no lo sea (así no hay número de línea que
      # mantener cuando el encabezado crezca).
      awk 'NR == 1 { next } /^#/ { print; next } { exit }' "$0"
      exit 0
      ;;
    *)
      echo "✗ Opción desconocida: $a" >&2
      echo "  Uso: $0 [--historial] [--quiet] [--rescatar]" >&2
      exit 2
      ;;
  esac
done

ok() {
  if [ "$QUIET" = "0" ]; then echo "✓ $1"; fi
  exit 0
}

# Valor efectivo de una clave de configuración, con su valor por defecto de git
# cuando no está definida (lo que gobierna cuándo `git gc` puede llevarse algo).
valor_config() {
  local v
  v="$(git config --get "$1" 2>/dev/null || true)"
  if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "$2"; fi
}

# Ficha de un commit para el listado del barrido.
listar_commit() {
  local fecha rel asunto
  fecha="$(git log -1 --format='%ad' --date=short "$1" 2>/dev/null || echo '?')"
  rel="$(git log -1 --format='%cr' "$1" 2>/dev/null || true)"
  asunto="$(git log -1 --format='%s' "$1" 2>/dev/null || echo '(sin asunto)')"
  printf '   %s  %s  (%s)\n' "${1:0:12}" "$fecha" "$rel"
  printf '      %s\n' "$asunto"
  case "$asunto" in
    "WIP on "*|"index on "*|"On "*:*)
      printf '      → resto de un stash descartado: `git stash apply %s` lo devuelve\n' "${1:0:12}"
      ;;
  esac
}

# ── Barrido de TODO el historial (--historial) ──────────────────
# Autoridad: `git fsck`. El reflog NO basta: un objeto que el reflog ya olvidó
# (stash descartado, reset antiguo con el reflog expirado) sigue en la base de
# objetos y `git gc` lo elimina, pero no aparece en ningún reflog. Medido en este
# repositorio: 6 commits así, invisibles para cualquier barrido solo de reflogs.
barrido() {
  # Ojo: con `set -u`, un `local x` SIN asignar está unset (no vacío) y leerlo
  # aborta el script. Los acumuladores se inicializan por eso, no por estilo.
  local crudos="" objetos="" commits="" en_reflog="" sha=""
  local con_reflog="" sin_reflog="" errores="" tmp=""
  local n_con=0 n_sin=0 n_total=0 creadas=0

  # `--no-reflogs` → el reflog no cuenta como referencia, así que salen las DOS
  # clases y luego se separan. `--connectivity-only` → no lee el contenido de
  # los blobs (0,10 s frente a 1,70 s en este repo, misma respuesta).
  # El código de salida de fsck NO se usa: fsck sale distinto de cero cuando
  # encuentra justo lo que buscamos (objetos inalcanzables).
  tmp="$(mktemp)"
  crudos="$(LC_ALL=C git fsck --unreachable --no-reflogs --connectivity-only 2>"$tmp" || true)"
  errores="$(cat "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"

  # Se toma el último campo de toda línea con forma «<palabra> <tipo> <sha>» y se
  # confirma el tipo después: así no se depende del idioma de git (fsck traduce
  # sus mensajes: «unreachable commit» / «inalcanzable commit») ni de su formato.
  objetos="$(printf '%s\n' "$crudos" | awk 'NF==3 && $3 ~ /^[0-9a-f]{40}$/ {print $3}' | sort -u)"

  if [ -z "$objetos" ]; then
    if [ -n "$errores" ]; then
      echo "✗ git fsck informó de un problema: no se puede afirmar que no haya huérfanos." >&2
      printf '%s\n' "$errores" | sed 's/^/    /' >&2
      exit 2
    fi
    ok "no hay ningún objeto inalcanzable en todo el historial"
  fi

  commits="$(printf '%s\n' "$objetos" \
    | git cat-file --batch-check='%(objectname) %(objecttype)' 2>/dev/null \
    | awk '$2 == "commit" {print $1}' || true)"

  if [ -z "$commits" ]; then
    ok "hay $(printf '%s\n' "$objetos" | grep -c .) objetos inalcanzables, pero ninguno es un commit"
  fi

  # Los commits se separan por lo que los sostiene, porque no urgen igual.
  en_reflog="$(git reflog show --all --format='%H' 2>/dev/null | sort -u || true)"
  for sha in $commits; do
    if [ -n "$en_reflog" ] && printf '%s\n' "$en_reflog" | grep -qx "$sha"; then
      con_reflog="$con_reflog $sha"
    else
      sin_reflog="$sin_reflog $sha"
    fi
  done
  n_sin="$(printf '%s' "$sin_reflog" | wc -w)"
  n_con="$(printf '%s' "$con_reflog" | wc -w)"
  n_total=$((n_sin + n_con))

  {
    echo ""
    echo "⚠️  COMMITS HUÉRFANOS en este repositorio: $n_total"
    echo "    Existen en la base de objetos, pero ninguna rama, tag ni reflog los alcanza."
    echo ""
  } >&2

  if [ "$n_sin" -gt 0 ]; then
    {
      echo "── SIN reflog ($n_sin): lo más urgente ──────────────────────────"
      echo "   No los sostiene nadie: 'git gc' los elimina cuando vence"
      echo "   gc.pruneExpire = $(valor_config gc.pruneExpire '2 semanas, por defecto')"
      echo ""
    } >&2
    for sha in $sin_reflog; do listar_commit "$sha" >&2; done
    echo "" >&2
  fi

  if [ "$n_con" -gt 0 ]; then
    {
      echo "── Solo en el reflog ($n_con): protegidos de momento ────────────"
      echo "   Aguanta hasta que venza la entrada del reflog:"
      echo "   gc.reflogExpireUnreachable = $(valor_config gc.reflogExpireUnreachable '30 días, por defecto')"
      echo ""
    } >&2
    for sha in $con_reflog; do listar_commit "$sha" >&2; done
    echo "" >&2
  fi

  {
    echo "   Rescátalos (una rama por commit):  bash $0 --historial --rescatar"
    echo "   O uno a uno:                       git branch <nombre> <sha>"
    echo "   Limpiar las ramas tras revisarlas: git branch -D \$(git branch --list 'rescate/*')"
    echo ""
  } >&2

  if [ "$RESCATAR" = "1" ]; then
    creadas=0
    for sha in $commits; do
      if git show-ref --verify --quiet "refs/heads/rescate/${sha:0:7}"; then continue; fi
      git branch "rescate/${sha:0:7}" "$sha"
      creadas=$((creadas + 1))
    done
    echo "→ $creadas rama(s) 'rescate/*' con los commits huérfanos: ya no pueden perderse." >&2
    exit 0
  fi

  exit 1
}

if ! command -v git >/dev/null 2>&1; then
  echo "✗ git no está disponible: no se puede comprobar HEAD." >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✗ Esto no es un repositorio git: no hay HEAD que comprobar." >&2
  exit 2
fi

# ── Alcance «todo el historial»: no mira HEAD, barre la base de objetos ──
if [ "$HISTORIAL" = "1" ]; then
  barrido
fi

# ── Operaciones que desacoplan HEAD a propósito: no avisar ──
for estado in rebase-merge rebase-apply BISECT_LOG CHERRY_PICK_HEAD REVERT_HEAD sequencer; do
  if [ -e "$(git rev-parse --git-path "$estado")" ]; then
    ok "operación en curso ($estado): el HEAD desacoplado es esperado, no se avisa"
  fi
done

# ── ¿HEAD está en una rama? ──
RAMA="$(git symbolic-ref -q --short HEAD 2>/dev/null || true)"
if [ -n "$RAMA" ]; then
  ok "HEAD está en la rama '$RAMA'"
fi

# Detached con HEAD sin nacer (aún sin commits): no hay nada que perder.
SHA="$(git rev-parse HEAD 2>/dev/null || true)"
if [ -z "$SHA" ]; then
  ok "HEAD desacoplado pero sin ningún commit: no hay nada que pueda quedar huérfano"
fi

# ── ¿Alguna rama contiene el commit? (local o de seguimiento remoto) ──
EN_RAMAS="$(git for-each-ref --contains "$SHA" --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null || true)"
if [ -n "$EN_RAMAS" ]; then
  ok "el commit ${SHA:0:12} lo contiene $(printf '%s' "$EN_RAMAS" | tr '\n' ' ')"
fi

# ── Commit huérfano ──
# Un tag también lo mantiene vivo (no lo recicla gc), pero no lo pone en ninguna
# rama: se dice, porque cambia la urgencia, no la naturaleza del problema.
EN_TAGS="$(git for-each-ref --contains "$SHA" --format='%(refname:short)' refs/tags 2>/dev/null || true)"
ASUNTO="$(git log -1 --format='%s' "$SHA" 2>/dev/null || echo '(sin asunto)')"

{
  echo ""
  echo "⚠️  COMMIT HUÉRFANO — HEAD está desacoplado y ninguna rama contiene el commit"
  echo ""
  echo "   commit   ${SHA}"
  echo "   asunto   ${ASUNTO}"
  if [ -n "$EN_TAGS" ]; then
    echo "   ramas    (ninguna)"
    echo "   tags     $(printf '%s' "$EN_TAGS" | tr '\n' ' ')  ← lo mantiene vivo, pero no está en ninguna rama"
  else
    echo "   ramas    (ninguna)   tags  (ninguno)"
    echo "            Nada lo referencia: cuando expire el reflog, 'git gc' puede eliminarlo."
  fi
  echo ""
  echo "   Arréglalo en una línea:"
  echo "     git branch <nombre-de-rama> ${SHA:0:12}          # en esta misma copia"
  echo "     git push origin ${SHA:0:12}:refs/heads/<nombre>  # o publícalo en el remoto"
  echo ""
  echo "   Si la rama debe avanzar desde OTRO worktree (aquí 'master' está retirado"
  echo "   en otro árbol de trabajo, que es lo que hace que HEAD esté desacoplado):"
  echo "     git -C <ruta-del-otro-worktree> branch -f master ${SHA:0:12}"
  echo ""
  echo "   O deja que este script lo salve:  bash $0 --rescatar"
  echo ""
} >&2

if [ "$RESCATAR" = "1" ]; then
  RAMA_RESCATE="rescate/${SHA:0:7}"
  if git show-ref --verify --quiet "refs/heads/$RAMA_RESCATE"; then
    echo "→ La rama '$RAMA_RESCATE' ya existe: el commit está a salvo." >&2
    exit 0
  fi
  git branch "$RAMA_RESCATE" "$SHA"
  echo "→ Rama creada: $RAMA_RESCATE → ${SHA:0:12}. El commit ya no puede perderse." >&2
  exit 0
fi

exit 1
