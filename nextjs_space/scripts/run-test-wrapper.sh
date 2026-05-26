#!/usr/bin/env bash
# Wrapper with hard timeout for the e2e reconciliation test
set -euo pipefail
cd /home/dexpert/Volkern/nextjs_space
# Kill any existing server
kill $(ss -tlnp 'sport = :3099' 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p') 2>/dev/null || true
sleep 2
# Run the script with timeout
timeout 90 bash scripts/run-e2e-reconciliation.sh 2>&1
EXIT=$?
echo "WRAPPER EXIT: $EXIT"
exit $EXIT
