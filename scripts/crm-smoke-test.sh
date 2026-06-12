#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GRINGO CRM — smoke test (S43, 2026-06-12)
# Verifica en ~15s que el sistema completo esté vivo y el gate de seguridad firme:
#   1. Endpoints críticos del CRM responden ok:true (interno, sin token)
#   2. El gate externo BLOQUEA sin token (simulado con cf-ray + tunnel real)
#   3. El gate externo PERMITE con token
# Uso: bash crm-smoke-test.sh            (todo)
#      bash crm-smoke-test.sh --interno  (solo endpoints, sin tunnel)
# Exit 0 = todo verde. Exit 1 = algo falló (lista al final).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BRIDGE=${BRIDGE_URL:-http://127.0.0.1:3002}
TUNNEL=${TUNNEL_URL:-https://bridge.gringo.estate}
ENV_FILE=/home/franco/.openclaw/workspace/wispy-stack/.env
TOK=$(grep "^OFFICE_BRIDGE_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
FALLAS=()
PASS=0

chk() { # chk <descripcion> <esperado> <obtenido>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1"; else FALLAS+=("$1 (esperaba $2, dio $3)"); echo "  ❌ $1 → $3 (esperaba $2)"; fi
}

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$@" 2>/dev/null || echo "ERR"; }
okjson() { curl -s --max-time 25 "$@" 2>/dev/null | python3 -c "import json,sys
try: print('true' if json.load(sys.stdin).get('ok') else 'false')
except Exception: print('parse-error')" 2>/dev/null || echo "ERR"; }

echo "── 1. Endpoints CRM (interno $BRIDGE) ──"
chk "health"                 "200"  "$(code $BRIDGE/health)"
chk "crm/pipeline"           "true" "$(okjson $BRIDGE/api/crm/pipeline)"
chk "crm/contactos"          "true" "$(okjson $BRIDGE/api/crm/contactos)"
chk "crm/seguimientos"       "true" "$(okjson $BRIDGE/api/crm/seguimientos)"
chk "crm/metricas"           "true" "$(okjson $BRIDGE/api/crm/metricas)"
chk "crm/operaciones"        "true" "$(okjson $BRIDGE/api/crm/operaciones)"
chk "crm/tasaciones"         "true" "$(okjson $BRIDGE/api/crm/tasaciones)"
chk "crm/inbox"              "true" "$(okjson $BRIDGE/api/crm/inbox)"
chk "crm/busquedas"          "true" "$(okjson $BRIDGE/api/crm/busquedas)"
chk "crm/higiene"            "true" "$(okjson $BRIDGE/api/crm/higiene)"
chk "crm/matching"           "true" "$(okjson $BRIDGE/api/crm/matching)"
chk "crm/hablar-hoy"         "true" "$(okjson $BRIDGE/api/crm/hablar-hoy)"

# Legajo de la primera propiedad real (id dinámico desde el pipeline)
PROP_ID=$(curl -s --max-time 25 "$BRIDGE/api/crm/pipeline" 2>/dev/null | python3 -c "import json,sys
d=json.load(sys.stdin); ps=(d.get('propiedades') or {}).get('items') or []
print(ps[0]['id'] if ps else '')" 2>/dev/null || true)
if [ -n "$PROP_ID" ]; then
  chk "crm/propiedad/:id/legajo" "true" "$(okjson $BRIDGE/api/crm/propiedad/$PROP_ID/legajo)"
else
  echo "  ⚠️  sin propiedades para probar legajo (no es falla)"
fi

echo "── 2. Gate de seguridad ──"
chk "externo simulado SIN token → 401" "401" "$(code -H 'cf-ray: smoke' $BRIDGE/api/crm/contactos)"
if [ -n "$TOK" ]; then
  chk "externo simulado CON token → 200" "200" "$(code -H 'cf-ray: smoke' -H "x-office-token: $TOK" $BRIDGE/api/crm/pipeline)"
else
  FALLAS+=("OFFICE_BRIDGE_TOKEN vacío en $ENV_FILE")
fi

if [ "${1:-}" != "--interno" ]; then
  echo "── 3. Tunnel público real ──"
  chk "tunnel /health → 200"            "200" "$(code $TUNNEL/health)"
  chk "tunnel CRM sin token → 401"      "401" "$(code $TUNNEL/api/crm/contactos)"
  chk "tunnel Metropolitan sin token → 401" "401" "$(code $TUNNEL/api/business/profitability)"
fi

echo ""
if [ ${#FALLAS[@]} -eq 0 ]; then
  echo "🟢 SMOKE OK — $PASS checks verdes"
  exit 0
else
  echo "🔴 SMOKE FALLÓ — ${#FALLAS[@]} problema(s):"
  printf '   · %s\n' "${FALLAS[@]}"
  exit 1
fi
