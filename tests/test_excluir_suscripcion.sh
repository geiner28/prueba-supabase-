#!/bin/bash
# ==================================================
# TEST FLUJO: Excluir solo suscripciones en listado de facturas
# Caso de uso: mensaje "Ya registre estas obligaciones"
# Objetivo: ocultar tipo_referencia='suscripcion' y mantener obligaciones normales
# ==================================================

set -u

BASE="${BASE:-http://localhost:3000/api}"
BOT_KEY="${BOT_KEY:-TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3}"
CT="Content-Type: application/json"

PASS=0
FAIL=0
TOTAL=0

# Datos de prueba unicos
TS=$(date +%s)
TEL="5739${TS: -8}"
PERIODO="2026-05-01"

check_http() {
  TOTAL=$((TOTAL + 1))
  local desc="$1" expected="$2" code="$3" body="$4"
  if [ "$code" = "$expected" ]; then
    echo "✅ #$TOTAL $desc [HTTP $code]"
    PASS=$((PASS + 1))
  else
    echo "❌ #$TOTAL $desc [Esperado: $expected, Obtuvo: $code]"
    echo "   Body: $body"
    FAIL=$((FAIL + 1))
  fi
}

check_assert() {
  TOTAL=$((TOTAL + 1))
  local desc="$1" ok="$2" details="$3"
  if [ "$ok" = "true" ]; then
    echo "✅ #$TOTAL $desc"
    PASS=$((PASS + 1))
  else
    echo "❌ #$TOTAL $desc"
    echo "   $details"
    FAIL=$((FAIL + 1))
  fi
}

http_json() {
  # Uso: http_json METHOD URL JSON_BODY
  local method="$1"
  local url="$2"
  local body="${3:-}"

  if [ -n "$body" ]; then
    curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$CT" -H "x-bot-api-key: $BOT_KEY" -d "$body"
  else
    curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$CT" -H "x-bot-api-key: $BOT_KEY"
  fi
}

echo "========================================================="
echo "TEST: excluir_suscripcion en GET /facturas/obligacion/:id"
echo "BASE: $BASE"
echo "TEL:  $TEL"
echo "========================================================="

# 0) Health check
RESP=$(curl -s -w "\n%{http_code}" "$BASE/health")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" != "200" ]; then
  echo "❌ Backend no disponible en $BASE (health=$CODE)."
  echo "   Inicia el servidor y vuelve a ejecutar este script."
  exit 1
fi
check_http "GET /health" "200" "$CODE" "$BODY"

# 1) Crear/Upsert usuario
RESP=$(http_json "POST" "$BASE/users/upsert" "{\"telefono\":\"$TEL\",\"nombre\":\"Test\",\"apellido\":\"Filtro\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
# Puede ser 201 (nuevo) o 200 (existente)
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  check_http "POST /users/upsert" "$CODE" "$CODE" "$BODY"
else
  check_http "POST /users/upsert" "201" "$CODE" "$BODY"
fi

# 2) Crear obligacion
DESC="Pagos test excluir suscripcion $TS"
RESP=$(http_json "POST" "$BASE/obligaciones" "{\"telefono\":\"$TEL\",\"descripcion\":\"$DESC\",\"periodo\":\"$PERIODO\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_http "POST /obligaciones" "201" "$CODE" "$BODY"
if [ "$CODE" != "201" ]; then
  echo "\nFin anticipado por fallo en creacion de obligacion."
  exit 1
fi

OBL_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
if [ -z "$OBL_ID" ]; then
  echo "❌ No se pudo extraer obligacion_id"
  exit 1
fi
echo "   obligacion_id: $OBL_ID"

# 3) Capturar factura de suscripcion (debe ocultarse con filtro)
RESP=$(http_json "POST" "$BASE/facturas/captura" "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"servicio\":\"tranquilidad\",\"monto\":10000,\"periodo\":\"$PERIODO\",\"referencia_pago\":\"tranquilidad\",\"tipo_referencia\":\"suscripcion\",\"extraccion_estado\":\"ok\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
# idempotente: puede devolver 201 o 200
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  check_http "POST /facturas/captura (suscripcion)" "$CODE" "$CODE" "$BODY"
else
  check_http "POST /facturas/captura (suscripcion)" "201" "$CODE" "$BODY"
fi

# 4) Capturar factura normal ETB
RESP=$(http_json "POST" "$BASE/facturas/captura" "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"servicio\":\"ETB\",\"monto\":85000,\"periodo\":\"2026-05-02\",\"referencia_pago\":\"12054726145\",\"tipo_referencia\":\"contrato\",\"extraccion_estado\":\"ok\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  check_http "POST /facturas/captura (normal ETB)" "$CODE" "$CODE" "$BODY"
else
  check_http "POST /facturas/captura (normal ETB)" "201" "$CODE" "$BODY"
fi

# 5) Capturar factura normal conjunto
RESP=$(http_json "POST" "$BASE/facturas/captura" "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"servicio\":\"CONJUNTO RESIDENCIAL FONTANA PARK APARTAMENTOS PH.\",\"monto\":120000,\"periodo\":\"2026-05-03\",\"referencia_pago\":null,\"tipo_referencia\":\"cuenta\",\"extraccion_estado\":\"ok\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  check_http "POST /facturas/captura (normal conjunto)" "$CODE" "$CODE" "$BODY"
else
  check_http "POST /facturas/captura (normal conjunto)" "201" "$CODE" "$BODY"
fi

# 6) Listado SIN filtro: deben venir 3 (incluye suscripcion)
RESP=$(http_json "GET" "$BASE/facturas/obligacion/$OBL_ID")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_http "GET /facturas/obligacion/:id (sin filtro)" "200" "$CODE" "$BODY"

COUNT_ALL=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
HAS_SUB_ALL=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(str(any(str(x.get('tipo_referencia') or '').lower()=='suscripcion' for x in d)).lower())" 2>/dev/null)
check_assert "Sin filtro trae >= 3 registros" "$([ "${COUNT_ALL:-0}" -ge 3 ] && echo true || echo false)" "count=$COUNT_ALL"
check_assert "Sin filtro incluye suscripcion" "${HAS_SUB_ALL:-false}" "has_sub=$HAS_SUB_ALL"

# 7) Listado CON filtro: NO debe venir suscripcion
RESP=$(http_json "GET" "$BASE/facturas/obligacion/$OBL_ID?excluir_suscripcion=true")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_http "GET /facturas/obligacion/:id?excluir_suscripcion=true" "200" "$CODE" "$BODY"

COUNT_FIL=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
HAS_SUB_FIL=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(str(any(str(x.get('tipo_referencia') or '').lower()=='suscripcion' for x in d)).lower())" 2>/dev/null)
HAS_ETB=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(str(any(str(x.get('servicio') or '').strip()=='ETB' for x in d)).lower())" 2>/dev/null)
HAS_CONJ=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(str(any('FONTANA PARK' in str(x.get('servicio') or '') for x in d)).lower())" 2>/dev/null)

check_assert "Con filtro NO incluye suscripcion" "$([ "${HAS_SUB_FIL:-true}" = "false" ] && echo true || echo false)" "has_sub_filtered=$HAS_SUB_FIL"
check_assert "Con filtro mantiene ETB" "${HAS_ETB:-false}" "has_etb=$HAS_ETB"
check_assert "Con filtro mantiene conjunto" "${HAS_CONJ:-false}" "has_conjunto=$HAS_CONJ"
check_assert "Con filtro devuelve menos registros que sin filtro" "$([ "${COUNT_FIL:-0}" -lt "${COUNT_ALL:-0}" ] && echo true || echo false)" "count_all=$COUNT_ALL, count_filtered=$COUNT_FIL"

echo ""
echo "========================================================="
echo "RESULTADO: PASS=$PASS | FAIL=$FAIL | TOTAL=$TOTAL"
echo "========================================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
