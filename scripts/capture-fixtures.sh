#!/usr/bin/env bash
# Captures baseline API responses for capacity-unification diffing.
# Usage: BASE_URL=http://localhost:3000 AUTH_PASSWORD=... ./scripts/capture-fixtures.sh BOARD_ID SPRINT_ID [SPRINT_ID2]
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
BOARD_ID="$1"; shift
OUT=test-fixtures/api
mkdir -p "$OUT"
JAR="$(mktemp)"
curl -sf -c "$JAR" -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"${AUTH_PASSWORD:?set AUTH_PASSWORD}\"}" > /dev/null

TEAM_ID="$(curl -sf -b "$JAR" "$BASE_URL/api/organisation/squads" | python3 -c "
import json,sys
squads=json.load(sys.stdin)['data']
print(next(s['id'] for s in squads if s.get('boardId')==int('$BOARD_ID')))")"

for SPRINT_ID in "$@"; do
  curl -sf -b "$JAR" "$BASE_URL/api/sprint/$SPRINT_ID?boardId=$BOARD_ID" \
    | python3 -m json.tool > "$OUT/home-sprint-$SPRINT_ID.json"
  curl -sf -b "$JAR" "$BASE_URL/api/sprint-performance?sprintId=$SPRINT_ID&boardId=$BOARD_ID" \
    | python3 -m json.tool > "$OUT/sprint-performance-$SPRINT_ID.json"
  curl -sf -b "$JAR" "$BASE_URL/api/organisation/squads/$TEAM_ID/performance" \
    | python3 -m json.tool > "$OUT/squad-performance-$SPRINT_ID.json"
  echo "captured sprint $SPRINT_ID"
done
