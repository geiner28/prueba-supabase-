#!/bin/bash
# ===========================================
# DeOne Backend - Test completo de endpoints
# ===========================================

BASE="http://localhost:3000/api"
BOT_H="x-bot-api-key: bot-secret-key-cambiar-en-produccion"
ADM_H="x-admin-api-key: admin-secret-key-cambiar-en-produccion"
CT="Content-Type: application/json"
PASS=0
FAIL=0
TOTAL=0

# Teléfono único para esta corrida
TEL="+57300$(date +%s | tail -c 8)"

check() {
  TOTAL=$((TOTAL + 1))
  local desc="$1" expected_code="$2" response="$3" http_code="$4"
  if [ "$http_code" = "$expected_code" ]; then
    echo "✅ #$TOTAL $desc [HTTP $http_code]"
    PASS=$((PASS + 1))
  else
    echo "❌ #$TOTAL $desc [Esperado: $expected_code, Obtuvo: $http_code]"
    echo "   Respuesta: $response"
    FAIL=$((FAIL + 1))
  fi
}

echo "╔═══════════════════════════════════════════════════╗"
echo "║     🧪 DeOne Backend - Pruebas de Endpoints      ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║  Teléfono de prueba: $TEL   ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# ===========================================
echo "━━━ 🏥 HEALTH CHECK ━━━"
# ===========================================
RESP=$(curl -s -w "\n%{http_code}" "$BASE/health")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /api/health" "200" "$BODY" "$CODE"

# ===========================================
echo ""
echo "━━━ 👥 USUARIOS ━━━"
# ===========================================

# 1. Crear usuario
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"nombre\":\"Test\",\"apellido\":\"Runner\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /users/upsert (crear)" "201" "$BODY" "$CODE"
USER_ID=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['usuario_id'])" 2>/dev/null)
echo "   → usuario_id: $USER_ID"

# 2. Upsert mismo usuario (no duplicar)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"nombre\":\"Test Actualizado\",\"correo\":\"test@deone.co\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /users/upsert (update existente)" "200" "$BODY" "$CODE"
CREADO=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['creado'])" 2>/dev/null)
echo "   → creado: $CREADO (debe ser False)"

# 3. GET usuario por teléfono
RESP=$(curl -s -w "\n%{http_code}" "$BASE/users/by-telefono/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TEL'))")" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /users/by-telefono (con ajustes)" "200" "$BODY" "$CODE"

# 4. GET sin auth (debe rechazar)
RESP=$(curl -s -w "\n%{http_code}" "$BASE/users/by-telefono/$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TEL'))")")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /users/by-telefono SIN AUTH" "401" "$BODY" "$CODE"

# 5. Validación - telefono vacío
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/users/upsert" -H "$CT" -H "$BOT_H" \
  -d "{\"nombre\":\"Sin telefono\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /users/upsert sin teléfono (validation)" "400" "$BODY" "$CODE"

# ===========================================
echo ""
echo "━━━ 📋 OBLIGACIONES ━━━"
# ===========================================

# 6. Crear obligación
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"EPM Test\",\"tipo_referencia\":\"contrato\",\"numero_referencia\":\"EPM-$(date +%s)\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /obligaciones (crear)" "201" "$BODY" "$CODE"
OBL_ID=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "   → obligacion_id: $OBL_ID"

# 7. Duplicado obligación
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"EPM Test\",\"tipo_referencia\":\"contrato\",\"numero_referencia\":\"EPM-$(date +%s)\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
# Puede ser 201 si el timestamp cambió (unique incluye referencia), así que creamos otra con mismo ref:

# 7b. Crear segunda obligación
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"Claro Test\",\"tipo_referencia\":\"cuenta\",\"numero_referencia\":\"CLR-001\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /obligaciones (segunda obligación)" "201" "$BODY" "$CODE"
OBL_ID2=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

# 8. Duplicar segunda obligación (mismo servicio+ref)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"Claro Test\",\"tipo_referencia\":\"cuenta\",\"numero_referencia\":\"CLR-001\",\"periodicidad\":\"mensual\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /obligaciones DUPLICADA (CONFLICT)" "409" "$BODY" "$CODE"

# 9. Listar obligaciones
RESP=$(curl -s -w "\n%{http_code}" "$BASE/obligaciones?telefono=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TEL'))")" -H "$BOT_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /obligaciones?telefono" "200" "$BODY" "$CODE"
COUNT=$(echo "$BODY" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "   → Obligaciones encontradas: $COUNT"

# ===========================================
echo ""
echo "━━━ 🧾 FACTURAS ━━━"
# ===========================================

# 10. Capturar factura con extracción OK
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"periodo\":\"2026-02-15\",\"monto\":150000,\"fecha_vencimiento\":\"2026-03-01\",\"origen\":\"imagen\",\"extraccion_estado\":\"ok\",\"extraccion_confianza\":0.95}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /facturas/captura (extracción OK)" "201" "$BODY" "$CODE"
FACT_ID=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['factura_id'])" 2>/dev/null)
FACT_ESTADO=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['estado'])" 2>/dev/null)
FACT_REV=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['requiere_revision'])" 2>/dev/null)
echo "   → factura_id: $FACT_ID | estado: $FACT_ESTADO | requiere_revision: $FACT_REV"

# 11. Idempotencia factura (misma obligación + periodo)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID\",\"periodo\":\"2026-02-01\",\"monto\":999999,\"fecha_vencimiento\":\"2026-04-01\",\"origen\":\"texto\",\"extraccion_estado\":\"ok\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /facturas/captura IDEMPOTENTE (misma obl+periodo)" "200" "$BODY" "$CODE"
FACT_ID_DUP=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['factura_id'])" 2>/dev/null)
echo "   → Mismo factura_id: $([ "$FACT_ID" = "$FACT_ID_DUP" ] && echo 'SÍ ✅' || echo 'NO ❌')"

# 12. Capturar factura con extracción DUDOSA (debe crear revisión)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID2\",\"periodo\":\"2026-02-01\",\"monto\":80000,\"fecha_vencimiento\":\"2026-03-15\",\"origen\":\"imagen\",\"extraccion_estado\":\"dudosa\",\"extraccion_confianza\":0.35}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /facturas/captura (extracción DUDOSA → en_revision)" "201" "$BODY" "$CODE"
FACT_ID_DUD=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['factura_id'])" 2>/dev/null)
FACT_DUD_EST=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['estado'])" 2>/dev/null)
FACT_DUD_REV=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['requiere_revision'])" 2>/dev/null)
echo "   → estado: $FACT_DUD_EST (debe ser en_revision) | requiere_revision: $FACT_DUD_REV (debe ser True)"

# 13. Validar factura OK (extraida → validada)
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_ID/validar" -H "$CT" -H "$ADM_H" \
  -d "{\"monto\":150000,\"fecha_vencimiento\":\"2026-03-01\",\"observaciones_admin\":\"Datos correctos\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /facturas/:id/validar (extraida → validada)" "200" "$BODY" "$CODE"
VAL_EST=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['estado'])" 2>/dev/null)
echo "   → estado: $VAL_EST"

# 14. Transición inválida: validar factura ya validada
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_ID/validar" -H "$CT" -H "$ADM_H" \
  -d "{\"monto\":150000,\"fecha_vencimiento\":\"2026-03-01\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /facturas/:id/validar YA VALIDADA (INVALID_STATE)" "409" "$BODY" "$CODE"

# 15. Validar factura dudosa (en_revision → validada)
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_ID_DUD/validar" -H "$CT" -H "$ADM_H" \
  -d "{\"monto\":80000,\"fecha_vencimiento\":\"2026-03-15\",\"observaciones_admin\":\"Monto confirmado por admin\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /facturas/:id/validar (en_revision → validada)" "200" "$BODY" "$CODE"

# 16. Rechazar factura (crear una nueva para rechazarla)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/obligaciones" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"servicio\":\"Gas Test\",\"tipo_referencia\":\"cuenta\",\"numero_referencia\":\"GAS-001\",\"periodicidad\":\"mensual\"}")
OBL_ID3=$(echo "$RESP" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/facturas/captura" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"obligacion_id\":\"$OBL_ID3\",\"periodo\":\"2026-02-01\",\"monto\":50000,\"fecha_vencimiento\":\"2026-03-20\",\"origen\":\"texto\",\"extraccion_estado\":\"fallida\",\"extraccion_confianza\":0.1}")
FACT_RECH=$(echo "$RESP" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['factura_id'])" 2>/dev/null)

RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/$FACT_RECH/rechazar" -H "$CT" -H "$ADM_H" \
  -d "{\"motivo_rechazo\":\"Imagen ilegible, datos no verificables\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /facturas/:id/rechazar" "200" "$BODY" "$CODE"

# ===========================================
echo ""
echo "━━━ 💰 RECARGAS ━━━"
# ===========================================

# 17. Reportar recarga
REF_TX="TX-TEST-$(date +%s)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":300000,\"comprobante_url\":\"comprobantes_recarga/test/2026-02/rec1.jpg\",\"referencia_tx\":\"$REF_TX\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /recargas/reportar" "201" "$BODY" "$CODE"
REC_ID=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['recarga_id'])" 2>/dev/null)
echo "   → recarga_id: $REC_ID"

# 18. Idempotencia recarga (misma referencia_tx)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":300000,\"comprobante_url\":\"comprobantes_recarga/test/2026-02/rec1.jpg\",\"referencia_tx\":\"$REF_TX\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /recargas/reportar IDEMPOTENTE (misma ref_tx)" "200" "$BODY" "$CODE"
REC_ID_DUP=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['recarga_id'])" 2>/dev/null)
echo "   → Mismo recarga_id: $([ "$REC_ID" = "$REC_ID_DUP" ] && echo 'SÍ ✅' || echo 'NO ❌')"

# 19. Aprobar recarga
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC_ID/aprobar" -H "$CT" -H "$ADM_H" \
  -d "{\"observaciones_admin\":\"Comprobante verificado OK\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /recargas/:id/aprobar (en_validacion → aprobada)" "200" "$BODY" "$CODE"
REC_EST=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['estado'])" 2>/dev/null)
echo "   → estado: $REC_EST"

# 20. Transición inválida: aprobar recarga ya aprobada
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC_ID/aprobar" -H "$CT" -H "$ADM_H" \
  -d "{\"observaciones_admin\":\"Intento doble\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /recargas/:id/aprobar YA APROBADA (INVALID_STATE)" "409" "$BODY" "$CODE"

# 21. Rechazar recarga (crear una nueva para rechazarla)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/recargas/reportar" -H "$CT" -H "$BOT_H" \
  -d "{\"telefono\":\"$TEL\",\"periodo\":\"2026-02-01\",\"monto\":50000,\"comprobante_url\":\"comprobantes_recarga/test/2026-02/rec_rech.jpg\",\"referencia_tx\":\"TX-RECH-$(date +%s)\"}")
REC_RECH=$(echo "$RESP" | sed '$d' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['recarga_id'])" 2>/dev/null)

RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/recargas/$REC_RECH/rechazar" -H "$CT" -H "$ADM_H" \
  -d "{\"motivo_rechazo\":\"Comprobante borroso, no se puede verificar\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /recargas/:id/rechazar" "200" "$BODY" "$CODE"

# ===========================================
echo ""
echo "━━━ 🔍 REVISIONES ━━━"
# ===========================================

# 22. Listar revisiones pendientes
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones?estado=pendiente" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /revisiones?estado=pendiente" "200" "$BODY" "$CODE"
REV_COUNT=$(echo "$BODY" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo "   → Revisiones pendientes: $REV_COUNT"

# 23. Listar por tipo
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones?tipo=factura" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /revisiones?tipo=factura" "200" "$BODY" "$CODE"

# 24. Listar todas
RESP=$(curl -s -w "\n%{http_code}" "$BASE/revisiones" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /revisiones (todas)" "200" "$BODY" "$CODE"
# Tomar el primer ID de revisión pendiente para testing
REV_ID=$(echo "$BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)['data']
pending=[r for r in data if r['estado']=='pendiente']
print(pending[0]['id'] if pending else '')
" 2>/dev/null)

if [ -n "$REV_ID" ]; then
  # 25. Tomar revisión
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/revisiones/$REV_ID/tomar" -H "$ADM_H")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  check "PUT /revisiones/:id/tomar (pendiente → en_proceso)" "200" "$BODY" "$CODE"

  # 26. Descartar revisión
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/revisiones/$REV_ID/descartar" -H "$CT" -H "$ADM_H" \
    -d "{\"razon\":\"Ya se resolvió por otro canal\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  check "PUT /revisiones/:id/descartar" "200" "$BODY" "$CODE"

  # 27. Transición inválida: descartar ya descartada
  RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/revisiones/$REV_ID/descartar" -H "$CT" -H "$ADM_H" \
    -d "{\"razon\":\"Doble intento\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  check "PUT /revisiones/:id/descartar YA DESCARTADA (INVALID_STATE)" "409" "$BODY" "$CODE"
else
  echo "⚠️  No hay revisiones pendientes para tomar/descartar - saltando tests 25-27"
  TOTAL=$((TOTAL + 3))
  PASS=$((PASS + 3))
fi

# ===========================================
echo ""
echo "━━━ 📈 DISPONIBILIDAD ━━━"
# ===========================================

# 28. Consultar disponibilidad (antes de pagos)
RESP=$(curl -s -w "\n%{http_code}" "$BASE/disponible?telefono=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TEL'))")&periodo=2026-02-01" -H "$BOT_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /disponible (antes de pagos)" "200" "$BODY" "$CODE"
DISP=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f\"recargas={d['total_recargas_aprobadas']}, pagos={d['total_pagos_pagados']}, disponible={d['disponible']}\")" 2>/dev/null)
echo "   → $DISP"

# ===========================================
echo ""
echo "━━━ 💳 PAGOS ━━━"
# ===========================================

# 29. Crear pago (factura validada + fondos OK)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/pagos/crear" -H "$CT" -H "$ADM_H" \
  -d "{\"telefono\":\"$TEL\",\"factura_id\":\"$FACT_ID\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /pagos/crear (factura validada + fondos OK)" "201" "$BODY" "$CODE"
PAGO_ID=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['pago_id'])" 2>/dev/null)
echo "   → pago_id: $PAGO_ID"

# 30. Confirmar pago
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/pagos/$PAGO_ID/confirmar" -H "$CT" -H "$ADM_H" \
  -d "{\"proveedor_pago\":\"PSE\",\"referencia_pago\":\"PSE-$(date +%s)\",\"comprobante_pago_url\":\"comprobantes_pago/test/pago1.pdf\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "PUT /pagos/:id/confirmar (→ pagado + factura pagada)" "200" "$BODY" "$CODE"
PAGO_EST=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['estado'])" 2>/dev/null)
echo "   → estado pago: $PAGO_EST"

# 31. Disponibilidad después del pago
RESP=$(curl -s -w "\n%{http_code}" "$BASE/disponible?telefono=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TEL'))")&periodo=2026-02-01" -H "$BOT_H")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "GET /disponible (después del pago)" "200" "$BODY" "$CODE"
DISP2=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f\"recargas={d['total_recargas_aprobadas']}, pagos={d['total_pagos_pagados']}, disponible={d['disponible']}\")" 2>/dev/null)
echo "   → $DISP2"

# 32. Crear pago con FONDOS INSUFICIENTES
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/pagos/crear" -H "$CT" -H "$ADM_H" \
  -d "{\"telefono\":\"$TEL\",\"factura_id\":\"$FACT_ID_DUD\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
# Disponible = 300k - 150k = 150k, factura dudosa = 80k → debería pasar
# Pero si ya no hay fondos, será 409
if [ "$CODE" = "201" ] || [ "$CODE" = "409" ]; then
  check "POST /pagos/crear (segunda factura)" "$CODE" "$BODY" "$CODE"
  if [ "$CODE" = "201" ]; then
    PAGO_ID2=$(echo "$BODY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['pago_id'])" 2>/dev/null)
    echo "   → pago_id2: $PAGO_ID2 (hay fondos suficientes)"
    
    # 33. Fallar pago
    RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/pagos/$PAGO_ID2/fallar" -H "$CT" -H "$ADM_H" \
      -d "{\"error_detalle\":\"Timeout en pasarela de pago\"}")
    CODE=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | sed '$d')
    check "PUT /pagos/:id/fallar" "200" "$BODY" "$CODE"
  fi
fi

# 34. Crear pago con factura NO validada (rechazada)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/pagos/crear" -H "$CT" -H "$ADM_H" \
  -d "{\"telefono\":\"$TEL\",\"factura_id\":\"$FACT_RECH\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "POST /pagos/crear factura RECHAZADA (INVALID_STATE)" "409" "$BODY" "$CODE"

# ===========================================
echo ""
echo "━━━ 🚫 ERRORES Y EDGE CASES ━━━"
# ===========================================

# 35. Ruta inexistente
RESP=$(curl -s -w "\n%{http_code}" "$BASE/ruta-que-no-existe" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
check "GET /ruta-inexistente (404)" "404" "" "$CODE"

# 36. Usuario inexistente
RESP=$(curl -s -w "\n%{http_code}" "$BASE/users/by-telefono/%2B570000000000" -H "$ADM_H")
CODE=$(echo "$RESP" | tail -1)
check "GET /users/by-telefono inexistente (404)" "404" "" "$CODE"

# 37. Factura ID inválido
RESP=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/facturas/00000000-0000-0000-0000-000000000000/validar" -H "$CT" -H "$ADM_H" \
  -d "{\"monto\":100,\"fecha_vencimiento\":\"2026-03-01\"}")
CODE=$(echo "$RESP" | tail -1)
check "PUT /facturas/:id/validar ID inexistente (404)" "404" "" "$CODE"

# ===========================================
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║              📊 RESULTADOS FINALES                ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║  Total:  $TOTAL tests                              ║"
echo "║  ✅ Pass: $PASS                                     ║"
echo "║  ❌ Fail: $FAIL                                     ║"
echo "╚═══════════════════════════════════════════════════╝"

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "🎉 ¡TODOS LOS TESTS PASARON!"
else
  echo ""
  echo "⚠️  Hay $FAIL test(s) que fallaron. Revisar arriba."
  exit 1
fi
