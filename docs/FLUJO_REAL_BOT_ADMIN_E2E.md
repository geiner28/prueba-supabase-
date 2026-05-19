# Flujo Real E2E Bot + Admin (desde base vacia)

Fecha de ejecucion: 2026-05-19 UTC  
Base URL usada: http://localhost:3001/api

## 1) Objetivo

Documentar una simulacion real de punta a punta del sistema, incluyendo:
- endpoints del bot
- endpoints necesarios del admin
- request y response reales
- evidencia persistida en archivos JSON

Se uso un telefono nuevo para aislar la prueba: 3009001122.

## 2) Headers usados

Bot:
- x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3

Admin:
- x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3

Content-Type para POST/PUT:
- application/json

## 3) Flujo principal del sistema (real)

### Paso 1. Crear/actualizar usuario (bot)
Endpoint: POST /api/users/upsert

Request:
{
  "telefono": "3009001122",
  "nombre": "Cliente",
  "apellido": "E2E",
  "correo": "cliente.e2e@example.com",
  "tipo_identificacion": "CC",
  "numero_identificacion": "900112233",
  "ciudad": "Medellin",
  "direccion": "Calle 10 #20-30"
}

Response real:
{
  "ok": true,
  "data": {
    "usuario_id": "11ce943b-bbb6-44e8-ac2d-aefd548bfd49",
    "creado": true
  },
  "error": null
}

Evidencia: docs/e2e_artifacts/01_users_upsert.json

### Paso 2. Asignar plan (bot)
Endpoint: PUT /api/users/plan

Request:
{
  "telefono": "3009001122",
  "plan": "tranquilidad"
}

Response real: ok=true
Evidencia: docs/e2e_artifacts/02_users_plan.json

### Paso 3. Crear obligacion (bot)
Endpoint: POST /api/obligaciones

Request:
{
  "telefono": "3009001122",
  "descripcion": "Pagos Mayo 2026",
  "periodo": "2026-05-01",
  "servicio": "Agua EPM",
  "tipo_referencia": "referencia",
  "numero_referencia": "AGU-2026-0001",
  "pagina_pago": "Portal EPM",
  "periodicidad": "mensual",
  "receptor": "EPM",
  "grupo": 1
}

Response real (extracto):
{
  "ok": true,
  "data": {
    "id": "5e44ecc5-f1df-4366-b7fb-391c990010e1",
    "estado": "activa",
    "periodo": "2026-05-01"
  }
}

Evidencia: docs/e2e_artifacts/03_obligaciones_create.json

### Paso 4. Capturar factura (bot)
Endpoint: POST /api/facturas/captura

Request:
{
  "telefono": "3009001122",
  "obligacion_id": "5e44ecc5-f1df-4366-b7fb-391c990010e1",
  "servicio": "Agua EPM",
  "monto": 42000,
  "fecha_emision": "2026-05-01",
  "fecha_vencimiento": "2026-05-28",
  "fecha_recordatorio": "2026-05-25",
  "referencia_pago": "AGU-2026-00891",
  "tipo_referencia": "referencia",
  "etiqueta": "agua",
  "periodo": "2026-05-01",
  "pagina_pago": "https://epm.com.co/pago",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.95
}

Response real:
{
  "ok": true,
  "data": {
    "factura_id": "91f2eed6-b35b-4c89-af1a-81d71a4a21bf",
    "estado": "pendiente",
    "validacion_estado": "sin_revisar"
  }
}

Evidencia: docs/e2e_artifacts/04_facturas_captura.json

### Paso 5. Validar factura (admin)
Endpoint: PUT /api/facturas/91f2eed6-b35b-4c89-af1a-81d71a4a21bf/validar

Request:
{
  "monto": 42000,
  "servicio": "Agua EPM",
  "fecha_vencimiento": "2026-05-28",
  "referencia_pago": "AGU-2026-00891",
  "tipo_referencia": "referencia",
  "etiqueta": "agua",
  "observaciones_admin": "Factura validada en flujo E2E"
}

Response real:
{
  "ok": true,
  "data": {
    "factura_id": "91f2eed6-b35b-4c89-af1a-81d71a4a21bf",
    "estado": "pendiente",
    "validacion_estado": "revisada"
  }
}

Evidencia: docs/e2e_artifacts/05_facturas_validar.json

### Paso 6. Reportar recarga (bot)
Endpoint: POST /api/recargas/reportar

Request:
{
  "telefono": "3009001122",
  "periodo": "2026-05-01",
  "monto": 100000,
  "comprobante_url": "https://example.com/comprobante-e2e.png",
  "referencia_tx": "TX-E2E-001"
}

Response real:
{
  "ok": true,
  "data": {
    "recarga_id": "f8708510-77d1-4d4d-b057-86b66e19e7b8",
    "estado": "en_validacion"
  }
}

Evidencia: docs/e2e_artifacts/06_recargas_reportar.json

### Paso 7. Aprobar recarga (admin)
Endpoint: PUT /api/recargas/f8708510-77d1-4d4d-b057-86b66e19e7b8/aprobar

Request:
{
  "observaciones_admin": "Recarga aprobada en flujo E2E"
}

Response real (extracto):
{
  "ok": true,
  "data": {
    "id": "f8708510-77d1-4d4d-b057-86b66e19e7b8",
    "estado": "aprobada"
  }
}

Evidencia: docs/e2e_artifacts/07_recargas_aprobar.json

### Paso 8. Crear pago (admin)
Endpoint: POST /api/pagos/crear

Request:
{
  "telefono": "3009001122",
  "factura_id": "91f2eed6-b35b-4c89-af1a-81d71a4a21bf"
}

Response real:
{
  "ok": true,
  "data": {
    "pago_id": "bc08a56d-53e3-41a2-8b10-fbbed16c2449",
    "estado": "en_proceso",
    "monto": 42000,
    "servicio": "Agua EPM"
  }
}

Evidencia: docs/e2e_artifacts/08_pagos_crear.json

### Paso 9. Confirmar pago (admin)
Endpoint: PUT /api/pagos/bc08a56d-53e3-41a2-8b10-fbbed16c2449/confirmar

Request:
{
  "proveedor_pago": "Bancolombia",
  "referencia_pago": "PAGO-E2E-001",
  "comprobante_pago_url": "https://example.com/pago-e2e.pdf"
}

Response real (extracto):
{
  "ok": true,
  "data": {
    "pago_id": "bc08a56d-53e3-41a2-8b10-fbbed16c2449",
    "estado": "pagado",
    "factura_estado": "pagada",
    "obligacion_estado": "completada",
    "obligacion_completada": true
  }
}

Evidencia: docs/e2e_artifacts/09_pagos_confirmar.json

### Paso 10. Job admin de evaluacion de recargas (admin)
Endpoint: POST /api/admin/jobs/evaluacion-recargas

Resultado real en esta ejecucion:
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Cannot find module '../../../jobs/recordatorios.job'"
  }
}

Evidencia: docs/e2e_artifacts/10_admin_job_eval_recargas.json

Nota tecnica:
- El endpoint existe en rutas, pero falla por ruta de require invalida en runtime.
- Esto no bloqueo el resto del flujo E2E.

### Paso 11. Obtener campañas para bot (canónico)
Endpoint: GET /api/notificaciones/bot/campanias

Request: sin body

Response real:
{
  "ok": true,
  "data": {
    "total": 1,
    "campanias": [
      {
        "ids": ["9f8328d4-d959-4e24-891d-cd37908901df"],
        "tipo": "obligacion_cumplida",
        "telefono": "3009001122",
        "mensaje": "¡Cliente! ...",
        "creado_en": "2026-05-19T04:06:20.769712+00:00",
        "enviada_en": "2026-05-19T04:06:21.386Z"
      }
    ]
  }
}

Evidencia: docs/e2e_artifacts/11_bot_campanias.json

### Paso 12. Reportar entregadas por bot
Endpoint: POST /api/notificaciones/bot/entregadas

Request:
{
  "ids": ["9f8328d4-d959-4e24-891d-cd37908901df"]
}

Response real:
{
  "ok": true,
  "data": {
    "actualizadas": 1,
    "entregada_en": "2026-05-19T04:06:21.593Z",
    "notificaciones": [
      {
        "id": "9f8328d4-d959-4e24-891d-cd37908901df",
        "estado": "entregada",
        "entregada_en": "2026-05-19T04:06:21.593+00:00"
      }
    ]
  }
}

Evidencia: docs/e2e_artifacts/12_bot_entregadas.json

### Paso 13. Verificacion admin de notificaciones por telefono
Endpoint: GET /api/notificaciones?telefono=3009001122&limit=50&offset=0

Resultado real (resumen):
- total: 3 notificaciones
- obligacion_cumplida con estado entregada y timestamps enviada_en/entregada_en
- factura_por_validar y recarga_por_validar en estado revisada (flujo interno admin)

Evidencia: docs/e2e_artifacts/13_admin_notificaciones_verify.json

### Paso 14. Verificacion integral de perfil admin
Endpoint: GET /api/admin/clientes/3009001122?periodo=2026-05-01

Resultado real (resumen):
- recargas aprobadas mes: 100000
- pagos realizados mes: 42000
- saldo disponible: 58000
- factura principal en estado pagada y validacion revisada
- notificacion reciente obligacion_cumplida en estado entregada

Evidencia: docs/e2e_artifacts/14_admin_cliente_perfil.json

## 4) Cobertura adicional de tipos canónicos del bot

Para cubrir explicitamente solicitud_recarga y agrupacion de pagos en una sola corrida:

### Paso 20. Crear solicitud_recarga manual (admin)
Endpoint: POST /api/notificaciones
Evidencia: docs/e2e_artifacts/20_manual_solicitud.json

### Paso 21. Crear dos pago_confirmado manuales (admin)
Endpoint: POST /api/notificaciones (x2)
Evidencia:
- docs/e2e_artifacts/21_manual_pago1.json
- docs/e2e_artifacts/22_manual_pago2.json

### Paso 22b. Consumir campañas del bot
Endpoint: GET /api/notificaciones/bot/campanias

Response real (resumen):
- total: 2 campañas
- tipos devueltos: solicitud_recarga y obligaciones_pagadas_grupal
- ids compuestos: 3 ids individuales consolidados

Evidencia: docs/e2e_artifacts/23_bot_campanias_tres_tipos.json

### Paso 24. Marcar entregadas esas campañas
Endpoint: POST /api/notificaciones/bot/entregadas

Response real (resumen):
- ok: true
- actualizadas: 3

Evidencia: docs/e2e_artifacts/24_bot_entregadas_tres_tipos.json

## 5) Conclusiones

- Flujo real core del sistema (usuario -> obligacion -> factura -> validacion admin -> recarga -> aprobacion -> pago -> confirmacion -> bot campañas -> bot entregadas) ejecutado con exito.
- Endpoints del bot canónicos validados con datos reales:
  - GET /api/notificaciones/bot/campanias
  - POST /api/notificaciones/bot/entregadas
- Endpoints admin necesarios para operacion diaria validados en el flujo:
  - PUT /api/facturas/:id/validar
  - PUT /api/recargas/:id/aprobar
  - POST /api/pagos/crear
  - PUT /api/pagos/:id/confirmar
  - GET /api/admin/clientes/:telefono
- Hallazgo: POST /api/admin/jobs/evaluacion-recargas fallo por require de modulo con ruta invalida.

## 6) Inventario de artefactos generados

Carpeta: docs/e2e_artifacts

- 00_health.json
- 01_users_upsert.json
- 02_users_plan.json
- 03_obligaciones_create.json
- 04_facturas_captura.json
- 05_facturas_validar.json
- 06_recargas_reportar.json
- 07_recargas_aprobar.json
- 08_pagos_crear.json
- 09_pagos_confirmar.json
- 10_admin_job_eval_recargas.json
- 11_bot_campanias.json
- 12_bot_entregadas.json
- 13_admin_notificaciones_verify.json
- 14_admin_cliente_perfil.json
- 20_manual_solicitud.json
- 21_manual_pago1.json
- 22_manual_pago2.json
- 23_bot_campanias_tres_tipos.json
- 24_bot_entregadas_tres_tipos.json
