#!/usr/bin/env bash
# Audit: find innerHTML assignments that interpolate `${...}`
# without using escapeHtml() on the same line.
# Run before releases to catch potential XSS regressions.
set -euo pipefail

FILE="src/main.ts"

echo "=== innerHTML lines with \${...} but no escapeHtml on same line ==="
echo ""

grep -n 'innerHTML\s*=' "$FILE" | while IFS=: read -r line rest; do
  # skip if line contains escapeHtml — it's protected
  if echo "$rest" | grep -q 'escapeHtml'; then
    continue
  fi
  # skip if line contains no interpolation
  if ! echo "$rest" | grep -q '\${'; then
    continue
  fi
  echo "  $FILE:$line"
done

echo ""
echo "Expected baseline (reviewed & safe — escapeHtml on subsequent lines):"
echo "  src/main.ts:3548  Paper QA file list  (escapeHtml at :3558, :3566, :3568, :3574-3575)"
echo "  src/main.ts:3590  Paper QA results    (escapeHtml at :3595, :3597-3599)"
echo ""
echo "Any lines above the baseline need XSS review."
