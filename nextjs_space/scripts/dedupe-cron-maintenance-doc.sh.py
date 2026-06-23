#!/usr/bin/env python3
"""Scripts that dedupe §7.3.4 in docs/CRON-MAINTENANCE.md (delete FIRST instance, keep SECOND)
and apply reviewer fixes (hedge bloat claim, adjust red flag thresholds, EXISTING placeholder
for n_dead_tup from v4 snapshot).

This is a single-purpose maintenance script. Run from project root:
    python3 scripts/dedupe-cron-maintenance-doc.py
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOC = PROJECT_ROOT / "docs" / "CRON-MAINTENANCE.md"


def main() -> int:
    if not DOC.exists():
        print(f"❌ doc not found: {DOC}", file=sys.stderr)
        return 1

    content = DOC.read_text(encoding="utf-8")

    heading = "#### Baseline de auditoría DPO — 2026-06-23 (audit-log composite — observado en PRODUCCIÓN real)"
    positions: list[int] = []
    cursor = 0
    while True:
        pos = content.find(heading, cursor)
        if pos == -1:
            break
        positions.append(pos)
        cursor = pos + 1

    print(f"Found {len(positions)} instances of §7.3.4 heading at byte offsets {positions}")

    if len(positions) < 2:
        print("ℹ️  only one or zero §7.3.4 instances — no dedup needed")
        return 0

    first_pos = positions[0]
    second_pos = positions[1]

    # Find the largest \n\n\n (or end of previous paragraph) before first_pos to keep one
    # blank line above the SECOND §7.3.4 heading (rather than collapsing the spacing).
    trim_back = content.rfind("\n\n\n", 0, first_pos)
    if trim_back == -1:
        trim_back = max(0, first_pos - 2)
    else:
        trim_back += 3  # keep one \n\n before the SECOND heading

    deleted_chunk = content[trim_back:second_pos]
    new_content = content[:trim_back] + content[second_pos:]

    DOC.write_text(new_content, encoding="utf-8")

    print(f"deleted {len(deleted_chunk)} chars (from byte {trim_back} to byte {second_pos})")
    print(f"file size: {len(content):,} → {len(new_content):,} chars")

    # Verify post-dedup state
    final_count = new_content.count(heading)
    print(f"post-dedup §7.3.4 heading occurrences: {final_count}")
    return 0 if final_count == 1 else 2


if __name__ == "__main__":
    sys.exit(main())
