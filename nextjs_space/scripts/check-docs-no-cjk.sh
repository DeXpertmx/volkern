#!/usr/bin/env bash
# =============================================================================
# scripts/check-docs-no-cjk.sh
#
# Verifica que los archivos de documentación (.md/.txt/.markdown) NO contengan
# caracteres chinos (CJK Unified Ideographs) — protege contra la regresión
# detectada el 2026-06-23 (mezcla español + chino accident en docs técnicos de
# Volkern; ver `docs/CRON-MAINTENANCE.md` §10 changelog).
#
# Implementación basada en **perl** (no `grep -P`) porque:
#   - GNU grep -P no siempre está compilado con libpcre (Ubuntu/Debian lite,
#     Alpine, macOS default).
#   - La sintaxis \x{NNNN} (PCRE) en perl es 100% portable y vendored.
#   - perl está disponible en todo Linux/macOS runner y Docker base images.
#
# USO:
#   $ bash scripts/check-docs-no-cjk.sh                       # full scan docs/
#   $ bash scripts/check-docs-no-cjk.sh file1.md file2.md     # scan sólo esos
#   $ bash scripts/check-docs-no-cjk.sh --allow-cjk-lines wl  # + whitelist
#   $ bash scripts/check-docs-no-cjk.sh --help
#
# COMPORTAMIENTO (2026-06-23 — fence-aware):
#   * Los bloques markdown code-fence triple (``` ... ```) son EXCLUIDOS del
#     scan por state machine en perl (sintaxis CommonMark: 3+ backticks al
#     inicio de linea, hasta 3 espacios de indent permitidos, info-string
#     opcional en apertura con leading-whitespace permitido, close = mismo
#     marker count + info-string blank).
#   * Tilde fences (~~~) NO soportados (intencional: usabilidad limitada
#     en este repo).
#   * Fences mal cerradas -> todo el resto del archivo se considera
#     "inside fence" (conservador; consistente con CommonMark).
#
# OPCIONES:
#   --allow-cjk-lines <file>    Whitelist explicita basada en file:line.
#                                Formato: una linea 'file:line:reason' por
#                                entrada en <file>. Paths normalizados:
#                                leading `./` se elimina automaticamente para
#                                matchear lo que perl emite en $ARGV (git
#                                root-relative en lint-staged, user-supplied
#                                en standalone). Util para casos legacy donde
#                                no se puede reestructurar.
#   -h, --help                  Show help.
#
# EXIT CODES:
#   0  -> cero CJK fuera de fences (pass).
#   1  -> CJK fuera de fences encontrado (fail) — el commit sera rechazado.
#   2  -> setup invalido (perl no disponible / allow-list no encontrada).
#
# INTEGRACION:
#   * Pre-commit hook: .husky/pre-commit invoca este script.
#   * lint-staged: `package.json` lo corre solo sobre archivos staged.
#   * CI / manual: invocar desde terminal; produce output accionable.
#
# =============================================================================

set -euo pipefail

# ── Sanity check de perl ────────────────────────────────────────────────
if ! command -v perl >/dev/null 2>&1; then
  echo "ERR ERROR: 'perl' no esta instalado en el PATH." >&2
  echo "    perl es requerido por este script (portable PCRE)." >&2
  exit 2
fi

# Test PCRE real: si perl no soporta \x{4e00} correctamente, NO procede.
if ! printf '%s' '我们' | perl -CSDA -ne 'exit(/[\x{4e00}-\x{9fff}]/ ? 0 : 1)' 2>/dev/null; then
  echo "ERR ERROR: perl PCRE no esta disponible o no soporta \x{4e00}-\x{9fff}." >&2
  exit 2
fi

# ── Parse arguments ────────────────────────────────────────────────────
ALLOW_LIST_FILE=""
TARGETS=()
PRINT_HELP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-cjk-lines)
      ALLOW_LIST_FILE="${2:-}"
      if [[ -z "$ALLOW_LIST_FILE" ]]; then
        echo "ERR --allow-cjk-lines requiere un path a un file." >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      PRINT_HELP=1
      shift
      ;;
    *)
      TARGETS+=("$1")
      shift
      ;;
  esac
done

if [[ $PRINT_HELP -eq 1 ]]; then
  cat <<'HELP'
Uso: bash scripts/check-docs-no-cjk.sh [opciones] [archivos...]

Opciones:
  --allow-cjk-lines <file>    Whitelist explicita (formato: 'file:line:reason'
                              por linea en <file>).
  -h, --help                  Show this help.

Comportamiento por defecto:
  * Los bloques markdown code-fence triple (``` ... ```) son EXCLUIDOS del scan
    (state machine en perl, sintaxis CommonMark §4.5).
  * Tilde fences (~~~) NO soportados.
  * Si no se pasan archivos: scan completo de docs/.
  * Fences mal cerradas -> resto del archivo tratado como inside-fence
    (conservador; consistente con CommonMark).

Exit codes:
  0  -> cero CJK fuera de fences.
  1  -> CJK fuera de fences encontrado.
  2  -> setup invalido.

Integracion:
  * Pre-commit: .husky/pre-commit.
  * lint-staged: package.json.
  * CI / manual: invocacion directa.
HELP
  exit 0
fi

# ── Resolver targets ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$PROJECT_ROOT/docs"

if [[ ${#TARGETS[@]} -gt 0 ]]; then
  MODE="lint-staged (${#TARGETS[@]} file(s))"
else
  if [[ ! -d "$DOCS_DIR" ]]; then
    echo "AVISO  El directorio docs/ no existe relativo a $SCRIPT_DIR." >&2
    echo "    Skip check — entorno sin docs/ no es bloqueante." >&2
    exit 0
  fi
  TARGETS=("$DOCS_DIR")
  MODE="full docs/ scan"
fi

# ── Allow-list (opcional) ─────────────────────────────────────────────
ALLOW_ENV_EXPORT=""
if [[ -n "$ALLOW_LIST_FILE" ]]; then
  if [[ ! -f "$ALLOW_LIST_FILE" ]]; then
    echo "ERR Allow-list file no encontrado: $ALLOW_LIST_FILE" >&2
    exit 2
  fi
  echo "OK  Allow-list cargado: $ALLOW_LIST_FILE"
  export CHECK_DOCS_ALLOW_LIST="$ALLOW_LIST_FILE"
  ALLOW_ENV_EXPORT="with allow-list (${ALLOW_LIST_FILE})"
else
  ALLOW_ENV_EXPORT="(no allow-list)"
fi

# ── Patron de deteccion (PCRE via perl) ────────────────────────────────
# [\x{3400}-\x{4dbf}]  -> CJK Unified Ideographs Extension A
# [\x{4e00}-\x{9fff}]  -> CJK Unified Ideographs (bloque principal)
# [\x{f900}-\x{faff}]  -> CJK Compatibility Ideographs
PERL_PATTERN='[\x{3400}-\x{4dbf}\x{4e00}-\x{9fff}\x{f900}-\x{faff}]'

# ── Ejecutar scan ──────────────────────────────────────────────────────
echo "OK  Scanning for CJK characters ($MODE) $ALLOW_ENV_EXPORT"
echo "  (markdown code-fences triple-backtick son EXCLUIDOS; use --allow-cjk-lines para whitelist explicita)"

MATCHES=$(perl -CSDA -ne '
  BEGIN {
    # NOTA: $ARGV dentro de BEGIN esta VACIO en `perl -n` (todavia no se ha
    # abierto ningun archivo). Por eso el filtro de extension debe ir en
    # el cuerpo del loop, NO aqui — bug latente del script original que
    # silenciosamente saltaba la primera linea de cada archivo.

    # Fence state (package vars; reset en cada file boundary)
    $in_fence = 0;
    $fence_marker = "";

    # Allow-list (declarada explicitamente para silenciar autovivification
    # warnings bajo `use warnings`; futuro-proofing de hygiene).
    my %allow;

    # Allow-list: leer una vez al startup si $ENV{CHECK_DOCS_ALLOW_LIST}
    if ($ENV{CHECK_DOCS_ALLOW_LIST} && -f $ENV{CHECK_DOCS_ALLOW_LIST}) {
      open(my $afh, "<", $ENV{CHECK_DOCS_ALLOW_LIST})
        or die "Cannot open allow-list " . $ENV{CHECK_DOCS_ALLOW_LIST} . ": $!";
      while (my $aline = <$afh>) {
        chomp $aline;
        if ($aline =~ /^([^:]+):(\d+)/) {
          # Convencion: paths en el allow-list deben matchear lo que perl
          # emite como $ARGV:
          #   * lint-staged: relativos a git root, sin prefijo (e.g.
          #     `docs/foo.md`). Usar el mismo formato en allow-list.
          #   * Standalone: el path que el usuario paso en CLI (relativo
          #     o absoluto). Algunos shells/tools prefijan `./` que perl
          #     NO reproduce -> strip `^\./` aqui.
          my $path = $1;
          $path =~ s|^\./||;
          $allow{$path}{$2} = 1;
        }
      }
      close($afh);
    }
  }

  # Reset fence state al inicio de cada file (perl -n resetea $. a 1
  # automaticamente al cambiar de archivo).
  $. == 1 and do { $in_fence = 0; $fence_marker = ""; };

  # Filter por extension: AQUI (no en BEGIN) porque $ARGV ya esta poblado.
  next unless $ARGV =~ /\.md$|\.mdx$|\.txt$|\.markdown$/i;

  # Markdown code-fence state machine (CommonMark §4.5):
  #   * Open:  <=3 indent + 3+ backticks + info-string opcional con leading
  #            whitespace permitido (`\`\`\`  python` valido).
  #   * Close: MISMO marker count (group 1) + nada despues del fin de linea
  #            (group 2 captura info-string; cierre = info-string blank).
  #   * Si estamos dentro de un fence y aparece una linea fence-like con
  #     marker distinto, se trata como contenido del fence (no toggle).
  if (/^\s{0,3}(\`{3,})(.*)?\s*$/) {
    my $marker = $1;
    my $info   = $2 // "";
    if (!$in_fence) {
      $in_fence = 1;
      $fence_marker = $marker;
    } elsif ($marker eq $fence_marker && $info =~ /^[ \t]*$/) {
      $in_fence = 0;
      $fence_marker = "";
    }
    # Si estamos in_fence y la linea fence-like no cierra (marker distinto
    # o info-string no blank), caemos al `next` final -> se considera
    # contenido del fence (skip CJK check).
    next;
  }

  # Dentro de fence -> skip CJK detection (auto-documentacion permitida).
  next if $in_fence;

  # Allow-list check (excepcion explicita).
  next if $allow{$ARGV}{$.};

  # CJK detection (patron solo se aplica FUERA de fences y en lineas no
  # listadas en allow-list).
  if (m{'"$PERL_PATTERN"'}) {
    print $ARGV, "\t", $., "\t", $_;
  }
' "${TARGETS[@]}" 2>/dev/null || true)

# ── Reporte ────────────────────────────────────────────────────────────
if [[ -z "$MATCHES" ]]; then
  echo "OK  PASS: cero caracteres CJK en docs/ (fuera de fences)."
  exit 0
fi

COUNT=$(echo "$MATCHES" | wc -l)
echo "BAD FAIL: encontrados $COUNT linea(s) con caracteres CJK fuera de fences en docs/." >&2
echo >&2
echo "Detalles (formato archivo:linea:contenido):" >&2
echo "$MATCHES" | awk -F'\t' '{ printf "%s:%s:  %s\n", $1, $2, $3 }' | head -50 >&2
if [[ "$COUNT" -gt 50 ]]; then
  REMAINING=$((COUNT - 50))
  echo "  ... (+$REMAINING linea(s) mas; re-ejecutar el script para ver el listado completo)" >&2
fi
echo >&2
echo "Accion requerida:" >&2
echo "  1. Reemplaza cada caracter CJK por su equivalente en espanol." >&2
echo "  2. Si el CJK esta DENTRO de un markdown code-fence (\`\`\` ... \`\`\`)," >&2
echo "     es una excepcion automatica — re-estructura el fence si quieres" >&2
echo "     que el contenido sea escaneado." >&2
echo "  3. Si necesitas whitelist explicita (legacy / no se puede" >&2
echo "     reestructurar), crea un file con formato 'file:line:reason'" >&2
echo "     por linea y pasa --allow-cjk-lines <path>." >&2
echo "  4. Referencia: docs/CRON-MAINTENANCE.md §10 entrada 2026-06-23." >&2
exit 1
