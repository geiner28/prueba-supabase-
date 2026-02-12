#!/bin/bash
# ==================================================
# TEST: Simular EXACTAMENTE las llamadas del Frontend
# Mismo Content-Type, mismos headers, mismos bodies
# ==================================================

BASE="http://localhost:3000/api"
BOT_KEY="bot-secret-key-cambiar-en-produccion"
ADMIN_KEY="admin-secret-key-cambiar-en-produccion"
TEL="+573109999999"
TIMESTAMP=$(date +%s)

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PASS=0
FAIL=0
RESULTS=""

test_endpoint() {
  local name="$1"
  local module="$2"
  local expected="$3"
  local response="$4"
  local http_code="$5"

  if echo "$expected" | grep -q "$http_code"; then
    PASS=$((PASS+1))
    RESULTS="${RESULTS}\n${GREEN}✅ PASS${NC} | ${CYAN}${module}${NC} | ${name} | HTTP ${http_code}"
  else
    FAIL=$((FAIL+1))
    RESULTS="${RESULTS}\n${RED}❌ FAIL${NC} | ${CYAN}${module}${NC} | ${name} | Esperado: ${expected}, Recibido: HTTP ${http_code}"
    RESULTS="${RESULTS}\n   ${YELLOW}Response:${NC} $(echo "$response" | head -c 200)"
  fi
}

echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  🖥️  TEST FRONTEND → BACKEND (simulación exacta) ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}\n"

# ===================================================
# 1. DASHBOARD: Health Check + Revisiones
# (El dashboard llama GET /health y GET /revisiones)
# ===================================================
echo -e "${CYAN}━━━ 📊 DASHBOARD (renderDashboard) ━━━${NC}"

# Health check - el dashboard lo llama
RESP=$(curl -s -w "\n%{http_code}" "$BASE/health" -H "Content-Type: application/json")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /health (dashboard init)" "Dashboard" "200" "$BODY" "$CODE"

# Revisiones - el dashboard las carga
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones" -H "Content-Type: application/json" -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /revisiones (dashboard cards)" "Dashboard" "200" "$BODY" "$CODE"

# ===================================================
# 2. USUARIOS: Crear + Buscar
# (El frontend envía POST /users/upsert con x-bot-api-key)
# ===================================================
echo -e "${CYAN}━━━ 👥 USUARIOS (renderUsuarios) ━━━${NC}"

# crearUsuario() - exactamente como lo envía el frontend
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"nombre\":\"PruebaFront\",\"apellido\":\"Test\",\"correo\":\"front$TIMESTAMP@test.co\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /users/upsert (crearUsuario)" "Usuarios" "201 200" "$BODY" "$CODE"
USER_ID=$(echo "$BODY" | grep -o '"usuario_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "   ${YELLOW}→ usuario_id: $USER_ID${NC}"

# buscarUsuario() - el frontend llama con x-admin-api-key
RESP=$(curl -s -w "\n%{http_code}" "$BASE/users/by-telefono/$(echo $TEL | sed 's/+/%2B/g')" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /users/by-telefono (buscarUsuario)" "Usuarios" "200" "$BODY" "$CODE"
echo -e "   ${YELLOW}→ nombre: $(echo "$BODY" | grep -o '"nombre":"[^"]*"' | head -1 | cut -d'"' -f4)${NC}"

# Upsert de nuevo (actualización)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"nombre\":\"PruebaFront\",\"apellido\":\"Actualizado\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /users/upsert (update)" "Usuarios" "200" "$BODY" "$CODE"

# ===================================================
# 3. OBLIGACIONES: Crear + Listar
# ===================================================
echo -e "${CYAN}━━━ 📋 OBLIGACIONES (renderObligaciones) ━━━${NC}"

# crearObligacion() - el frontend usa x-bot-api-key
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"Claro Internet\",\"tipo_referencia\":\"contrato\",\"numero_referencia\":\"FRONT-$TIMESTAMP\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /obligaciones (crearObligacion)" "Obligaciones" "201" "$BODY" "$CODE"
OBL_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "   ${YELLOW}→ obligacion_id: $OBL_ID${NC}"

# buscarObligaciones() - el frontend usa x-bot-api-key
RESP=$(curl -s -w "\n%{http_code}" "$BASE/obligaciones?telefono=$(echo $TEL | sed 's/+/%2B/g')" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /obligaciones?telefono= (buscarObligaciones)" "Obligaciones" "200" "$BODY" "$CODE"
COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
echo -e "   ${YELLOW}→ total obligaciones: $COUNT${NC}"

# Duplicado
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"Claro Internet\",\"tipo_referencia\":\"contrato\",\"numero_referencia\":\"FRONT-$TIMESTAMP\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /obligaciones duplicada (409)" "Obligaciones" "409" "$BODY" "$CODE"

# ===================================================
# 4. FACTURAS: Capturar OK + Capturar Dudosa + Validar + Rechazar
# ===================================================
echo -e "${CYAN}━━━ 🧾 FACTURAS (renderFacturas) ━━━${NC}"

# capturarFactura() con extraccion OK
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"periodo\":\"2026-02-15\",\"monto\":200000,\"fecha_vencimiento\":\"2026-03-01\",\"origen\":\"imagen\",\"extraccion_estado\":\"ok\",\"extraccion_confianza\":0.95}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /facturas/captura OK (capturarFactura)" "Facturas" "201 200" "$BODY" "$CODE"
FACT_ID=$(echo "$BODY" | grep -o '"factura_id":"[^"]*"' | head -1 | cut -d'"' -f4)
FACT_ESTADO=$(echo "$BODY" | grep -o '"estado":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "   ${YELLOW}→ factura_id: $FACT_ID | estado: $FACT_ESTADO${NC}"

# capturarFactura() con extraccion DUDOSA → debe crear revisión
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"periodo\":\"2026-04-01\",\"monto\":85000,\"fecha_vencimiento\":\"2026-05-01\",\"origen\":\"imagen\",\"extraccion_estado\":\"dudosa\",\"extraccion_confianza\":0.30,\"extraccion_json\":{\"raw\":\"texto borroso\"}}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /facturas/captura DUDOSA (→ revisión)" "Facturas" "201" "$BODY" "$CODE"
FACT_DUD_ID=$(echo "$BODY" | grep -o '"factura_id":"[^"]*"' | head -1 | cut -d'"' -f4)
REQ_REV=$(echo "$BODY" | grep -o '"requiere_revision":true')
echo -e "   ${YELLOW}→ factura_dudosa_id: $FACT_DUD_ID | requiere_revision: ${REQ_REV:-false}${NC}"

# validarFactura() - el frontend usa x-admin-api-key
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_ID/validar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"monto\":200000,\"fecha_vencimiento\":\"2026-03-01\",\"fecha_emision\":\"2026-02-01\",\"observaciones_admin\":\"Verificado desde panel\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /facturas/:id/validar (validarFactura)" "Facturas" "200" "$BODY" "$CODE"

# Validar de nuevo (debe dar 409 - estado inválido)
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_ID/validar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"monto\":200000,\"fecha_vencimiento\":\"2026-03-01\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /facturas/:id/validar (ya validada → 409)" "Facturas" "409" "$BODY" "$CODE"

# rechazarFactura() - la factura dudosa
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_DUD_ID/rechazar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"motivo_rechazo\":\"Imagen ilegible, datos no verificables\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /facturas/:id/rechazar (rechazarFactura)" "Facturas" "200" "$BODY" "$CODE"

# ===================================================
# 5. RECARGAS: Reportar + Idempotencia + Aprobar + Rechazar
# ===================================================
echo -e "${CYAN}━━━ 💰 RECARGAS (renderRecargas) ━━━${NC}"

# reportarRecarga() - el frontend usa x-bot-api-key
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":500000,\"comprobante_url\":\"comprobantes_recarga/front/rec-$TIMESTAMP.jpg\",\"referencia_tx\":\"TX-FRONT-$TIMESTAMP\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /recargas/reportar (reportarRecarga)" "Recargas" "201" "$BODY" "$CODE"
REC_ID=$(echo "$BODY" | grep -o '"recarga_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "   ${YELLOW}→ recarga_id: $REC_ID${NC}"

# Idempotencia (misma referencia_tx) - el frontend obtiene el existente
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":500000,\"comprobante_url\":\"comprobantes_recarga/front/rec-$TIMESTAMP.jpg\",\"referencia_tx\":\"TX-FRONT-$TIMESTAMP\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /recargas/reportar idempotente (200)" "Recargas" "200" "$BODY" "$CODE"

# aprobarRecargaRapido() - el frontend usa x-admin-api-key (default)
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC_ID/aprobar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"observaciones_admin\":\"Aprobada desde panel admin\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /recargas/:id/aprobar (aprobarRecargaRapido)" "Recargas" "200" "$BODY" "$CODE"

# Aprobar de nuevo (409)
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC_ID/aprobar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"observaciones_admin\":\"intento doble\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /recargas/:id/aprobar (ya aprobada → 409)" "Recargas" "409" "$BODY" "$CODE"

# Segunda recarga para rechazar
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":100000,\"comprobante_url\":\"comprobantes_recarga/front/rec2-$TIMESTAMP.jpg\",\"referencia_tx\":\"TX-FRONT-B-$TIMESTAMP\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
REC2_ID=$(echo "$BODY" | grep -o '"recarga_id":"[^"]*"' | head -1 | cut -d'"' -f4)

# rechazarRecarga()
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC2_ID/rechazar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"motivo_rechazo\":\"Comprobante borroso, no se puede verificar monto\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "PUT /recargas/:id/rechazar (rechazarRecarga)" "Recargas" "200" "$BODY" "$CODE"

# ===================================================
# 6. REVISIONES: Listar + Filtrar + Tomar + Descartar
# ===================================================
echo -e "${CYAN}━━━ 🔍 REVISIONES (renderRevisiones) ━━━${NC}"

# Listar todas (filtro default: estado=pendiente) - como el frontend
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones?estado=pendiente" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /revisiones?estado=pendiente (filtro default)" "Revisiones" "200" "$BODY" "$CODE"
PEND_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
echo -e "   ${YELLOW}→ pendientes: $PEND_COUNT${NC}"

# Filtrar por tipo=factura
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones?tipo=factura" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /revisiones?tipo=factura (filtro tipo)" "Revisiones" "200" "$BODY" "$CODE"

# Filtrar por tipo=recarga
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones?tipo=recarga" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /revisiones?tipo=recarga (filtro tipo)" "Revisiones" "200" "$BODY" "$CODE"

# Sin filtros (como "Limpiar filtros" en el frontend)
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /revisiones (sin filtros - limpiar)" "Revisiones" "200" "$BODY" "$CODE"

# tomarRevision() - tomar la primera pendiente
REV_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$REV_ID" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/revisiones/$REV_ID/tomar" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: $ADMIN_KEY")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  test_endpoint "PUT /revisiones/:id/tomar (tomarRevision)" "Revisiones" "200" "$BODY" "$CODE"
  echo -e "   ${YELLOW}→ revision_id tomada: $REV_ID${NC}"

  # doDescartarRevision()
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/revisiones/$REV_ID/descartar" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: $ADMIN_KEY" \
    -d "{\"razon\":\"Ya se resolvió por otro canal\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  test_endpoint "PUT /revisiones/:id/descartar (doDescartarRevision)" "Revisiones" "200" "$BODY" "$CODE"
else
  echo -e "   ${YELLOW}⚠️ No hay revisiones para tomar/descartar${NC}"
fi

# ===================================================
# 7. DISPONIBILIDAD: Consultar antes y después de pagos
# ===================================================
echo -e "${CYAN}━━━ 📈 DISPONIBILIDAD (renderDisponibilidad) ━━━${NC}"

# consultarDisponibilidad() - exactamente como el frontend
RESP=$(curl -s -w "\n%{http_code}" "$BASE/disponible?telefono=$(echo $TEL | sed 's/+/%2B/g')&periodo=2026-02-01" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /disponible?telefono=&periodo= (consultarDisponibilidad)" "Disponibilidad" "200" "$BODY" "$CODE"
DISPONIBLE=$(echo "$BODY" | grep -o '"disponible":[0-9.]*' | cut -d':' -f2)
RECARGAS=$(echo "$BODY" | grep -o '"total_recargas_aprobadas":[0-9.]*' | cut -d':' -f2)
PAGOS=$(echo "$BODY" | grep -o '"total_pagos_pagados":[0-9.]*' | cut -d':' -f2)
echo -e "   ${YELLOW}→ recargas: $RECARGAS | pagos: $PAGOS | disponible: $DISPONIBLE${NC}"

# ===================================================
# 8. PAGOS: Crear + Confirmar + Fallar
# ===================================================
echo -e "${CYAN}━━━ 💳 PAGOS (renderPagos) ━━━${NC}"

# crearPago() - el frontend usa x-admin-api-key (default, no useBot)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/pagos/crear" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"telefono\":\"$TEL\",\"factura_id\":\"$FACT_ID\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "POST /pagos/crear (crearPago)" "Pagos" "201" "$BODY" "$CODE"
PAGO_ID=$(echo "$BODY" | grep -o '"pago_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "   ${YELLOW}→ pago_id: $PAGO_ID${NC}"

# confirmarPago() - con datos del proveedor
if [ -n "$PAGO_ID" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/pagos/$PAGO_ID/confirmar" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: $ADMIN_KEY" \
    -d "{\"proveedor_pago\":\"PSE\",\"referencia_pago\":\"PSE-FRONT-$TIMESTAMP\",\"comprobante_pago_url\":\"comprobantes_pago/front/pago-$TIMESTAMP.pdf\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  test_endpoint "PUT /pagos/:id/confirmar (confirmarPago)" "Pagos" "200" "$BODY" "$CODE"

  # Confirmar de nuevo (409)
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/pagos/$PAGO_ID/confirmar" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: $ADMIN_KEY" \
    -d "{\"proveedor_pago\":\"PSE\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  test_endpoint "PUT /pagos/:id/confirmar (ya pagado → 409)" "Pagos" "409" "$BODY" "$CODE"
fi

# Crear otro pago para probar fallarPago()
# Primero necesitamos otra factura validada
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"periodo\":\"2026-06-01\",\"monto\":100000,\"fecha_vencimiento\":\"2026-07-01\",\"origen\":\"pdf\",\"extraccion_estado\":\"ok\",\"extraccion_confianza\":0.99}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
FACT2_ID=$(echo "$BODY" | grep -o '"factura_id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Validar esa factura
curl -s -o /dev/null -X PUT "$BASE/facturas/$FACT2_ID/validar" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"monto\":100000,\"fecha_vencimiento\":\"2026-07-01\"}"

# Crear pago
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/pagos/crear" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_KEY" \
  -d "{\"telefono\":\"$TEL\",\"factura_id\":\"$FACT2_ID\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
PAGO2_ID=$(echo "$BODY" | grep -o '"pago_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$PAGO2_ID" ]; then
  # fallarPago()
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/pagos/$PAGO2_ID/fallar" \
    -H "Content-Type: application/json" \
    -H "x-admin-api-key: $ADMIN_KEY" \
    -d "{\"error_detalle\":\"Timeout en pasarela de pago\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  test_endpoint "PUT /pagos/:id/fallar (fallarPago)" "Pagos" "200" "$BODY" "$CODE"
fi

# ===================================================
# 9. DISPONIBILIDAD POST-PAGO
# ===================================================
echo -e "${CYAN}━━━ 📈 DISPONIBILIDAD POST-PAGO ━━━${NC}"

RESP=$(curl -s -w "\n%{http_code}" "$BASE/disponible?telefono=$(echo $TEL | sed 's/+/%2B/g')&periodo=2026-02-01" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
test_endpoint "GET /disponible post-pago (saldo restado)" "Disponibilidad" "200" "$BODY" "$CODE"
DISPONIBLE2=$(echo "$BODY" | grep -o '"disponible":[0-9.]*' | cut -d':' -f2)
echo -e "   ${YELLOW}→ disponible después del pago: $DISPONIBLE2 (antes: $DISPONIBLE)${NC}"

# ===================================================
# 10. EDGE CASES (como el frontend maneja errores)
# ===================================================
echo -e "${CYAN}━━━ 🚫 EDGE CASES ━━━${NC}"

# Sin auth (como si el frontend no enviara el header)
RESP=$(curl -s -w "\n%{http_code}" "$BASE/users/by-telefono/$TEL")
CODE=$(echo "$RESP" | tail -1)
test_endpoint "GET sin auth header (401)" "Edge Cases" "401" "" "$CODE"

# Body vacío en POST con validación
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: $BOT_KEY" \
  -d "{}")
CODE=$(echo "$RESP" | tail -1)
test_endpoint "POST body vacío validación (400)" "Edge Cases" "400" "" "$CODE"

# Ruta inexistente
RESP=$(curl -s -w "\n%{http_code}" "$BASE/ruta-que-no-existe")
CODE=$(echo "$RESP" | tail -1)
test_endpoint "GET ruta inexistente (404)" "Edge Cases" "404" "" "$CODE"

# Frontend estático (el panel HTML)
RESP=$(curl -s -w "\n%{http_code}" "http://localhost:3000/")
CODE=$(echo "$RESP" | tail -1)
HAS_DEONE=$(echo "$RESP" | grep -c "DeOne" || true)
test_endpoint "GET / (frontend HTML servido)" "Frontend" "200" "" "$CODE"
if [ "$HAS_DEONE" -gt 0 ]; then
  echo -e "   ${YELLOW}→ HTML contiene 'DeOne' ✅ - Frontend se sirve correctamente${NC}"
fi

# CSS del frontend
RESP=$(curl -s -w "\n%{http_code}" "http://localhost:3000/styles.css")
CODE=$(echo "$RESP" | tail -1)
test_endpoint "GET /styles.css (CSS servido)" "Frontend" "200" "" "$CODE"

# JS del frontend
RESP=$(curl -s -w "\n%{http_code}" "http://localhost:3000/app.js")
CODE=$(echo "$RESP" | tail -1)
test_endpoint "GET /app.js (JS servido)" "Frontend" "200" "" "$CODE"

# ===================================================
# RESUMEN FINAL
# ===================================================
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              📋 RESULTADOS DETALLADOS            ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
echo -e "$RESULTS"
echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
TOTAL=$((PASS + FAIL))
echo -e "${BOLD}║  ${GREEN}✅ PASS: $PASS${NC}  ${RED}❌ FAIL: $FAIL${NC}  📊 TOTAL: $TOTAL         ${BOLD}║${NC}"
if [ $FAIL -eq 0 ]; then
  echo -e "${BOLD}║  ${GREEN}🎉 ¡TODO FUNCIONA PERFECTO! Front → Back OK    ${NC}${BOLD}║${NC}"
else
  echo -e "${BOLD}║  ${RED}⚠️  Hay $FAIL test(s) fallidos. Revisar arriba.  ${NC}${BOLD}║${NC}"
fi
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
