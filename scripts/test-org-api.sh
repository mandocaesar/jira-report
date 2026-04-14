#!/bin/bash
# Test organisation API endpoints

BASE="http://localhost:3000"

# Login and capture cookie
echo "=== Login ==="
curl -s -c /tmp/org-cookies.txt "$BASE/api/auth/login" \
  -X POST -H 'Content-Type: application/json' \
  -d '{"password":"changeme123"}'
echo ""

# Create Group
echo "=== Create Group ==="
curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/groups" \
  -X POST -H 'Content-Type: application/json' \
  -d '{"name":"Technology","code":"TECH"}'
echo ""

# Get groups
echo "=== List Groups ==="
GROUPS=$(curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/groups")
echo "$GROUPS"
GROUP_ID=$(echo "$GROUPS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
echo "Group ID: $GROUP_ID"

# Create Division
echo "=== Create Division ==="
curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/divisions" \
  -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"Digital Banking\",\"code\":\"DIGBANK\",\"groupId\":\"$GROUP_ID\"}"
echo ""

# Get divisions
echo "=== List Divisions ==="
DIVS=$(curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/divisions")
echo "$DIVS"
DIV_ID=$(echo "$DIVS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
echo "Division ID: $DIV_ID"

# Create Department
echo "=== Create Department ==="
curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/departments" \
  -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"Payments\",\"code\":\"PAY\",\"divisionId\":\"$DIV_ID\"}"
echo ""

# Full tree
echo "=== Full Tree ==="
curl -s -b /tmp/org-cookies.txt "$BASE/api/organisation/structure" | python3 -m json.tool

echo ""
echo "=== Done ==="
