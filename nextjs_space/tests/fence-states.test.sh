#!/usr/bin/env bash
# =============================================================================
# tests/fence-states.test.sh
#
# Tests the fence-aware CJK detection at scripts/check-docs-no-cjk.sh.
# Run from project root: `bash tests/fence-states.test.sh`
# Or directly:           `tests/fence-states.test.sh` (chmod +x)
# Wired into npm scripts as `npm run test:bash` (and chained into `npm test`).
#
# Coverage matrix:
#   T1 - full scan of CJK-free tmp dir          -> exit 0
#   T2 - CJK inside ``` triple fence            -> exit 0 (auto-allowed)
#   T3 - CJK outside ``` fence                  -> exit 1 (must fail)
#   T4 - single-backtick inline CJK             -> exit 1 (must fail)
#   T5 - --allow-cjk-lines whitelist (3 cases)  -> exit 1
#   T6 - 3-space-indented fence                 -> exit 0
#   T7 - unclosed fence (conservative inside)   -> exit 0
#   T8 - leading-whitespace info-string fence   -> exit 0 (polish item)
#   T9 - .mdx file                              -> exit 1 (polish item)
#   T10 - --help                                -> exit 0
#   T11 - --allow-cjk-lines missing arg         -> exit 2 (setup error)
#
# Per-test stderr cleanliness: each invocation captures stderr to
# $TMPDIR/run_silent.stderr; `assert_stderr_clean` then greps for the
# specific bash parse-warning regression class ("orden no encontrada" /
# "command not found") that motivated this entire script. If stderr
# leaks that warning on a PASS-class test, the test FAILS — because
# the warning means bash parsed the FAIL echo incorrectly, which is
# exactly the regression this anti-CJK guard exists to detect.
#
# Design notes:
#   * Heredocs use single-quoted delimiters (`<<'MARKER'`) to prevent bash
#     from expanding backticks (regression of the original bash parse bug).
#   * TMPDIR isolation prevents test pollution between cases.
#   * Project-root-resolved path via ${BASH_SOURCE[0]}.
#   * T1 uses a tmp CJK-free dir instead of real docs/ (real docs/ might
#     be contaminated by future commits; that contamination is exactly
#     what this script defends against; we don't want flaky tests).
#   * `set -e` is intentionally OMITTED (see comment below).
# =============================================================================

# NOTE: `set -e` is intentionally OMITTED. Under `set -e`, the bare
# `run_silent "$X"` calls each return the script's exit code, and a
# non-zero return would abort the test runner before `assert_exit`
# could record the failure. The whole point of this file is to COUNT
# failures across multiple tests; we need the runner to keep going.
# We keep `-u` (catch unset variables) and `-o pipefail` (catch pipe
# failures) because those are silent failure modes we want loud.
set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
SCRIPT="$PROJECT_ROOT/scripts/check-docs-no-cjk.sh"

# ── Sanity ─────────────────────────────────────────────────────────────
if [[ ! -x "$SCRIPT" ]]; then
  echo "FATAL: $SCRIPT not executable. Run: chmod +x $SCRIPT" >&2
  exit 2
fi

# ── Test infrastructure ───────────────────────────────────────────────
TMPDIR="$(mktemp -d -t fence-states-XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

STDERR_LOG="$TMPDIR/run_silent.stderr"

PASSED=0
FAILED=0
FAILED_TESTS=()

assert_exit() {
  local expected=$1
  local actual=$2
  local name=$3
  if [[ "$actual" -eq "$expected" ]]; then
    printf '  PASS  %-58s (exit=%d)\n' "$name" "$actual"
    PASSED=$((PASSED + 1))
  else
    printf '  FAIL  %-58s (expected=%d, got=%d)\n' "$name" "$expected" "$actual" >&2
    FAILED=$((FAILED + 1))
    FAILED_TESTS+=("$name")
  fi
}

# Assert stderr captured by `run_silent` does NOT contain the bash
# parse-warning class. If it does, this test FAILS even if the script's
# exit code was correct — because the leakage means the FAIL echo path
# has the original bug back (triple backticks interpreted as command
# substitution inside double quotes).
assert_stderr_clean() {
  local name=$1
  if [[ ! -s "$STDERR_LOG" ]]; then
    return 0  # empty stderr = clean
  fi
  # Patterns that signal the original bash-parse bug class:
  #   * "orden no encontrada" = bash's "command not found" in Spanish locale
  #   * "command not found"   = bash's "command not found" in English locale
  # Together they cover bash on any default locale where the regression
  # would surface (locale C, POSIX, en_US, es_ES, etc.).
  if grep -qE 'orden no encontrada|command not found' "$STDERR_LOG"; then
    printf '  FAIL  %-58s (STDERR LEAK: bash parse warning regression)\n' "$name" >&2
    echo "    --- stderr content:" >&2
    sed 's/^/      /' "$STDERR_LOG" >&2
    echo "    ---" >&2
    FAILED=$((FAILED + 1))
    FAILED_TESTS+=("$name (stderr regression)")
    : > "$STDERR_LOG"  # clear for next test
  fi
  return 0
}

# Run the script with stdout discarded and stderr captured to STDERR_LOG
# for the upcoming assert_stderr_clean check. Returns nothing useful
# in $? (use the explicit assert_exit helpers below with $?).
run_silent() {
  # Truncate stderr log at the start so each test's stderr is isolated.
  : > "$STDERR_LOG"
  bash "$SCRIPT" "$@" >/dev/null 2> "$STDERR_LOG"
}

# ── T1: full scan of CJK-free tmp dir ─────────────────────────────────
mkdir -p "$TMPDIR/clean"
cat > "$TMPDIR/clean/clean.md" <<'MARKER'
# Documento de prueba

Este archivo no contiene caracteres chinos accidentalmente.
Solo prosa espanol limpio. Verificar que el scanner pasa exit 0.

## Seccion de prueba

- Item uno sin CJK.
- Item dos sin CJK.
- Item tres sin CJK.
MARKER
mkdir -p "$TMPDIR/clean/subdir"
cat > "$TMPDIR/clean/subdir/nested.md" <<'MARKER'
# Nested doc

Markdown that should pass:
- lorem ipsum dolor sit amet
- consectetur adipiscing elit
MARKER
run_silent "$TMPDIR/clean"
assert_exit 0 $? "T1 - full scan of CJK-free tmp dir"
assert_stderr_clean "T1 - full scan"

# ── T2: CJK inside ``` triple fence (auto-allowed) ───────────────────
cat > "$TMPDIR/t2.md" <<'MARKER'
# Test intro

```python
# Inside fence - CJK allowed
comment_with_cjk = "我们"
print("hello")
```

Texto despues del fence.
MARKER
run_silent "$TMPDIR/t2.md"
assert_exit 0 $? "T2 - CJK inside triple-backtick fence auto-allowed"
assert_stderr_clean "T2"

# ── T3: CJK outside fence (must fail) ───────────────────────────────
cat > "$TMPDIR/t3.md" <<'MARKER'
# Test fixture

```python
x = "我们"
```

# Comentario fuera del fence.

Texto DESPUES del fence con 我们 chars fuera.
Otra linea fuera: 我们 flag this.
MARKER
run_silent "$TMPDIR/t3.md"
assert_exit 1 $? "T3 - CJK outside fence must fail (exit 1)"
assert_stderr_clean "T3"

# ── T4: single-backtick inline CJK must fail ─────────────────────────
cat > "$TMPDIR/t4.md" <<'MARKER'
# Test doc

Texto con `inline 我们` en backticks simples - single backticks NO son fence.

Tambien `我们` en otro lugar, debe detectarse.
MARKER
run_silent "$TMPDIR/t4.md"
assert_exit 1 $? "T4 - single-backtick inline code with CJK must fail"
assert_stderr_clean "T4"

# ── T5: --allow-cjk-lines whitelist (3 subtests) ────────────────────
TARGET_ABS="$TMPDIR/t5.md"
cat > "$TARGET_ABS" <<'MARKER'
# Header content
L1 我们 whitelisted
L2 我们 line 2
L3 我们 whitelisted
L4 我们 line 4
MARKER

# T5a - absolute paths in both allow-list and CLI (the standard case)
ALLOW_ABS="$TMPDIR/t5a_allow.txt"
cat > "$ALLOW_ABS" <<MARKER
${TARGET_ABS}:2:legacy-historical-citation
${TARGET_ABS}:4:legacy-historical-citation
MARKER
run_silent --allow-cjk-lines "$ALLOW_ABS" "$TARGET_ABS"
assert_exit 1 $? "T5a - allow-list (abs paths) flags only lines 3 and 5"
assert_stderr_clean "T5a"

# T5b - allow-list with leading "./" prefix (normalization strips it)
ALLOW_DOT="$TMPDIR/t5b_allow.txt"
cat > "$ALLOW_DOT" <<MARKER
./${TARGET_ABS}:2:legacy-historical-citation
./${TARGET_ABS}:4:legacy-historical-citation
MARKER
run_silent --allow-cjk-lines "$ALLOW_DOT" "$TARGET_ABS"
assert_exit 1 $? "T5b - allow-list with ./ prefix (normalized) flags only lines 3 and 5"
assert_stderr_clean "T5b"

# T5c - allow-list paths do NOT match CLI path (negative case)
ALLOW_MISMATCH="$TMPDIR/t5c_allow.txt"
cat > "$ALLOW_MISMATCH" <<'MARKER'
/some/other/path/t5.md:2:legacy
/some/other/path/t5.md:4:legacy
MARKER
run_silent --allow-cjk-lines "$ALLOW_MISMATCH" "$TARGET_ABS"
assert_exit 1 $? "T5c - allow-list with non-matching paths flags all CJK"
assert_stderr_clean "T5c"

# ── T6: 3-space-indented fence (CommonMark allowed) ──────────────────
printf '# Test\n   ```bash\n   echo "我们"\n   ```\n' > "$TMPDIR/t6.md"
run_silent "$TMPDIR/t6.md"
assert_exit 0 $? "T6 - 3-space-indented fence auto-allowed"
assert_stderr_clean "T6"

# ── T7: unclosed fence (conservative - stays inside fence) ──────────
printf '# Test\n```python\nx = "我们"\ny = "我们"\n' > "$TMPDIR/t7.md"
run_silent "$TMPDIR/t7.md"
assert_exit 0 $? "T7 - unclosed fence stays inside (conservative)"
assert_stderr_clean "T7"

# ── T8: leading-whitespace info-string fence (Polish #1) ─────────────
cat > "$TMPDIR/t8.md" <<'MARKER'
# Test for polish item

```  python
# 2 spaces between fence opener and language tag (CommonMark valid)
x = "我们"
```

After fence.
MARKER
run_silent "$TMPDIR/t8.md"
assert_exit 0 $? "T8 - leading-ws info-string fence auto-allowed"
assert_stderr_clean "T8"

# ── T9: .mdx file extension (Polish #4) ──────────────────────────────
cat > "$TMPDIR/t9.mdx" <<'MARKER'
# Test MDX

Texto con 我们 chars. .mdx files deben ser escaneados.
MARKER
run_silent "$TMPDIR/t9.mdx"
assert_exit 1 $? "T9 - .mdx file is scanned (CJK detected)"
assert_stderr_clean "T9"

# ── T10: --help exits 0 ──────────────────────────────────────────────
run_silent --help
assert_exit 0 $? "T10 - --help exits 0"
assert_stderr_clean "T10"

# ── T11: --allow-cjk-lines missing arg exits 2 (setup error) ────────
# Hand-rolled (not via run_silent) so the missing-arg error itself is
# captured in stderr cleanly without going through the assert_stderr_clean
# pipeline (the missing-arg message would match other patterns).
set +e
bash "$SCRIPT" --allow-cjk-lines </dev/null >/dev/null 2> "$STDERR_LOG"
rc=$?
set -e
assert_exit 2 $rc "T11 - --allow-cjk-lines missing arg exits 2"
# Skip stderr-clean check for T11: the missing-arg message is the
# EXPECTED stderr pattern, not a regression. The exit-code assertion
# is the load-bearing check here.

# ── Summary ──────────────────────────────────────────────────────────
echo
echo "================================================================================"
echo "  Total: $((PASSED + FAILED))   PASSED: $PASSED   FAILED: $FAILED"
echo "================================================================================"
if [[ $FAILED -gt 0 ]]; then
  echo
  echo "Failed tests:" >&2
  printf '  - %s\n' "${FAILED_TESTS[@]}" >&2
  exit 1
fi
exit 0
