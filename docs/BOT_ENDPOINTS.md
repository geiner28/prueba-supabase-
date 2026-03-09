# 🤖 DeOne Backend — Documentación de Endpoints para el Bot

> **Última actualización:** 8 de marzo de 2026  
> **Base URL producción:** `https://prueba-supabase.onrender.com/api`  
> **Total endpoints disponibles para el bot:** 15

---

## 🔐 Autenticación

**Todos los endpoints requieren este header:**

```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

> También se puede usar `x-admin-api-key` con el mismo valor. Ambos funcionan para todos los endpoints del bot.

---

## 📦 Formato de Respuesta (TODAS las respuestas)

```json
{
  "ok": true,        // true = éxito, false = error
  "data": { ... },   // datos (null cuando hay error)
  "error": null       // null si ok=true, objeto con code + message si ok=false
}
```

**Ejemplo de error:**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Usuario no encontrado con ese teléfono"
  }
}
```

---

## 📋 Índice de Endpoints

| # | Método | Endpoint | Descripción |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/users/upsert` | Registrar o actualizar usuario |
| 2 | `PUT` | `/api/users/plan` | Cambiar plan del usuario |
| 3 | `POST` | `/api/obligaciones` | Crear obligación (compromiso mensual) |
| 4 | `GET` | `/api/obligaciones?telefono=XXX` | Listar obligaciones del usuario |
| 5 | `GET` | `/api/obligaciones/:id` | Ver detalle de una obligación |
| 6 | `POST` | `/api/facturas/captura` | Registrar factura/servicio |
| 7 | `GET` | `/api/facturas/obligacion/:id` | Listar facturas de una obligación |
| 8 | `POST` | `/api/recargas/reportar` | Reportar recarga del usuario |
| 9 | `GET` | `/api/disponible?telefono=X&periodo=X` | Consultar saldo disponible |
| 10 | `GET` | `/api/notificaciones/pendientes/:telefono` | Obtener notificaciones pendientes |
| 11 | `PUT` | `/api/notificaciones/:id` | Marcar notificación como enviada |
| 12 | `POST` | `/api/notificaciones/batch-enviadas` | Marcar varias notificaciones como enviadas |
| 13 | `POST` | `/api/pagos/crear` | Crear un pago para una factura |
| 14 | `PUT` | `/api/pagos/:id/confirmar` | Confirmar un pago |
| 15 | `PUT` | `/api/pagos/:id/fallar` | Marcar un pago como fallido |

---

## 1. `POST /api/users/upsert` — Registrar o actualizar usuario

> Cuando llega un usuario nuevo por WhatsApp, se llama este endpoint. Si ya existe, actualiza los datos que se envíen.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario (mín 7 caracteres). Ej: `"573046757626"` |
| `nombre` | `string` | ❌ No | Nombre del usuario. Si es nuevo y no se envía, usa el teléfono |
| `apellido` | `string` | ❌ No | Apellido del usuario |
| `correo` | `string` | ❌ No | Email válido |

**Ejemplo — Usuario nuevo:**
```json
{
  "telefono": "573046757626",
  "nombre": "Laura",
  "apellido": "Durán",
  "correo": "laura@email.com"
}
```

**Respuesta exitosa (201 si es nuevo, 200 si ya existe):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "creado": true
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `usuario_id` | UUID interno del usuario (usar para referencias internas) |
| `creado` | `true` = usuario nuevo creado, `false` = usuario existente actualizado |

**Errores posibles:**
```json
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 2. `PUT /api/users/plan` — Cambiar plan del usuario

> Cuando el usuario elige su plan, se llama este endpoint.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores permitidos |
|-------|------|-----------|-------------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `plan` | `string` | ✅ Sí | `"control"` \| `"tranquilidad"` \| `"respaldo"` |

**Planes:**

| Plan | Recargas/Mes | Días programados |
|------|-------------|-----------------|
| `control` | 1 | Día 1 |
| `tranquilidad` | 2 | Día 1 y 15 |
| `respaldo` | 2 | Día 1 y 15 |

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "plan": "tranquilidad"
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "telefono": "573046757626",
    "plan_anterior": "control",
    "plan_nuevo": "tranquilidad",
    "actualizado_en": "2026-03-08T10:30:00.000Z"
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `plan_anterior` | El plan que tenía antes |
| `plan_nuevo` | El plan actualizado |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 3. `POST /api/obligaciones` — Crear obligación

> Una obligación es el compromiso mensual que agrupa todas las facturas del periodo. Se crea una por mes.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `descripcion` | `string` | ✅ Sí | Descripción. Ej: `"Pagos de Marzo 2026"` |
| `periodo` | `string` | ✅ Sí | Periodo en formato `YYYY-MM-DD`. Se normaliza al primer día del mes |

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "descripcion": "Pagos de Marzo 2026",
  "periodo": "2026-03-01"
}
```

**Respuesta exitosa (201):**
```json
{
  "ok": true,
  "data": {
    "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "descripcion": "Pagos de Marzo 2026",
    "periodo": "2026-03-01",
    "servicio": "Pagos de Marzo 2026",
    "tipo_referencia": "periodo",
    "numero_referencia": "2026-03-01-1709900000000",
    "estado": "activa",
    "total_facturas": 0,
    "facturas_pagadas": 0,
    "monto_total": 0,
    "monto_pagado": 0,
    "creado_en": "2026-03-08T10:30:00.000Z",
    "completada_en": null
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `id` | UUID de la obligación (usar para asociar facturas) |
| `estado` | `"activa"` = recién creada, sin facturas pagadas |
| `total_facturas` | Cantidad de facturas asociadas (inicia en 0) |
| `monto_total` | Suma de todos los montos de facturas (inicia en 0) |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
```

---

## 4. `GET /api/obligaciones?telefono=XXX` — Listar obligaciones

> Obtiene todas las obligaciones del usuario con sus facturas incluidas.

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `estado` | `string` | ❌ No | Filtrar: `"activa"`, `"en_progreso"`, `"completada"`, `"cancelada"` |

**Ejemplo:**
```
GET /api/obligaciones?telefono=573046757626
GET /api/obligaciones?telefono=573046757626&estado=activa
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
      "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
      "descripcion": "Pagos de Marzo 2026",
      "periodo": "2026-03-01",
      "servicio": "Pagos de Marzo 2026",
      "estado": "activa",
      "total_facturas": 2,
      "facturas_pagadas": 0,
      "monto_total": 218980,
      "monto_pagado": 0,
      "progreso": 0,
      "completada_en": null,
      "creado_en": "2026-03-08T...",
      "facturas": [
        {
          "id": "18e6dcfd-...",
          "servicio": "ETB",
          "monto": 86900,
          "estado": "extraida",
          "origen": "bot_whatsapp",
          "fecha_emision": "2026-02-23",
          "fecha_vencimiento": "2026-01-01",
          "referencia_pago": null,
          "etiqueta": null,
          "archivo_url": null
        }
      ]
    }
  ],
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `progreso` | Porcentaje de facturas pagadas (0-100) |
| `facturas` | Array con todas las facturas de esa obligación |
| `estado` | `"activa"` → sin pagos, `"en_progreso"` → algunos pagos, `"completada"` → todo pagado |

---

## 5. `GET /api/obligaciones/:id` — Detalle de una obligación

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Ejemplo:**
```
GET /api/obligaciones/86a0c709-3ca9-41bc-9106-226cac7cf4ba
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
    "usuario_id": "49f3c602-...",
    "descripcion": "Pagos de Marzo 2026",
    "periodo": "2026-03-01",
    "estado": "activa",
    "total_facturas": 2,
    "facturas_pagadas": 0,
    "monto_total": 218980,
    "monto_pagado": 0,
    "progreso": 0,
    "facturas": [ ... ],
    "usuarios": {
      "nombre": "Laura",
      "apellido": "Durán",
      "telefono": "573046757626"
    }
  },
  "error": null
}
```

> Incluye los datos del usuario (`usuarios`) además de las facturas.

---

## 6. `POST /api/facturas/captura` — Registrar factura/servicio

> El bot envía los datos extraídos de una factura. Los campos que no pueda extraer se envían como `null`.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Acepta null | Descripción |
|-------|------|-----------|-------------|-------------|
| `telefono` | `string` | ✅ Sí | ❌ | Teléfono del usuario |
| `obligacion_id` | `string (UUID)` | ✅ Sí | ❌ | ID de la obligación a la que pertenece |
| `servicio` | `string` | ✅ Sí | ❌ | Nombre del servicio. Ej: `"EPM Energía"`, `"Vanti Gas"`, `"ETB"` |
| `monto` | `number` | ❌ No | ✅ Sí | Valor de la factura. Si es `null` → queda en revisión |
| `fecha_vencimiento` | `string` | ❌ No | ✅ Sí | Fecha de vencimiento. Formato `"YYYY-MM-DD"` |
| `fecha_emision` | `string` | ❌ No | ✅ Sí | Fecha de emisión. Formato `"YYYY-MM-DD"` |
| `referencia_pago` | `string` | ❌ No | ✅ Sí | Referencia de pago que aparece en la factura |
| `etiqueta` | `string` | ❌ No | ✅ Sí | Etiqueta personalizada. Ej: `"Factura gas enero"` |
| `periodo` | `string` | ❌ No | ✅ Sí | Periodo `"YYYY-MM-DD"`. Si no se envía, usa el de la obligación |
| `origen` | `string` | ❌ No | ✅ Sí | De dónde viene: `"bot_whatsapp"`, `"manual"`, etc. |
| `archivo_url` | `string` | ❌ No | ✅ Sí | URL del archivo/imagen de la factura |
| `extraccion_estado` | `string` | ❌ No | ❌ | `"ok"` (default), `"dudosa"`, `"fallida"` |
| `extraccion_json` | `object` | ❌ No | ✅ Sí | JSON crudo de la extracción (datos brutos) |
| `extraccion_confianza` | `number` | ❌ No | ✅ Sí | Nivel de confianza de la extracción (0 a 1) |

**⚠️ Comportamiento importante:**
- Si `extraccion_estado` es `"dudosa"` o `"fallida"`, O si `monto` es `null` → la factura queda en estado `"en_revision"` para que el admin la valide
- Si todo está bien → estado `"extraida"`

**Ejemplo — Bot envía factura completa:**
```json
{
  "telefono": "573046757626",
  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
  "servicio": "Vanti S.A. ESP",
  "monto": 50950,
  "fecha_vencimiento": "2026-02-24",
  "fecha_emision": "2026-02-11",
  "referencia_pago": "7890123456",
  "etiqueta": "Gas febrero",
  "origen": "bot_whatsapp",
  "archivo_url": "https://storage.supabase.co/facturas/gas_feb.pdf",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.95
}
```

**Ejemplo — Bot no pudo extraer todo:**
```json
{
  "telefono": "573046757626",
  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
  "servicio": "Factura desconocida",
  "monto": null,
  "fecha_vencimiento": null,
  "fecha_emision": null,
  "referencia_pago": null,
  "etiqueta": null,
  "origen": "bot_whatsapp",
  "archivo_url": "https://storage.supabase.co/facturas/img_001.jpg",
  "extraccion_estado": "dudosa",
  "extraccion_confianza": 0.3
}
```

**Respuesta exitosa (201):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733",
    "servicio": "Vanti S.A. ESP",
    "monto": 50950,
    "estado": "extraida",
    "requiere_revision": false
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `factura_id` | UUID de la factura creada |
| `estado` | `"extraida"` = ok, `"en_revision"` = el admin debe revisarla |
| `requiere_revision` | `true` = queda pendiente para el admin |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "NOT_FOUND", "message": "Obligación no encontrada o no pertenece al usuario" }
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 7. `GET /api/facturas/obligacion/:obligacionId` — Listar facturas

> Lista todas las facturas de una obligación con todos sus campos.

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Ejemplo:**
```
GET /api/facturas/obligacion/86a0c709-3ca9-41bc-9106-226cac7cf4ba
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": [
    {
      "referencia_pago": "7890123456",
      "servicio": "Vanti S.A. ESP",
      "monto": 50950,
      "estado": "validada",
      "origen": "bot_whatsapp",
      "archivo_url": "https://storage.supabase.co/facturas/gas_feb.pdf",
      "etiqueta": "Gas febrero",
      "fecha_emision": "2026-02-11",
      "fecha_vencimiento": "2026-02-24",
      "periodo": "2026-02-01",
      "extraccion_estado": "ok",
      "extraccion_json": null,
      "extraccion_confianza": 0.95,
      "observaciones_admin": null,
      "motivo_rechazo": null,
      "_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"
    },
    {
      "referencia_pago": null,
      "servicio": "ETB",
      "monto": 89000,
      "estado": "extraida",
      "origen": "bot_whatsapp",
      "archivo_url": null,
      "etiqueta": null,
      "fecha_emision": "2026-02-18",
      "fecha_vencimiento": "2026-02-16",
      "periodo": "2026-02-01",
      "extraccion_estado": "ok",
      "extraccion_json": null,
      "extraccion_confianza": 0.95,
      "observaciones_admin": null,
      "motivo_rechazo": null,
      "_id": "11735221-59b5-44f1-9bb6-facc6c525a33"
    }
  ],
  "error": null
}
```

| Campo | Significado |
|-------|-------------|
| `referencia_pago` | Referencia de pago de la factura (campo principal de identificación) |
| `_id` | ID interno (UUID) — solo para uso técnico |
| `estado` | `"extraida"` → capturada ok, `"en_revision"` → pendiente admin, `"validada"` → lista para pago, `"pagada"` → ya pagada, `"rechazada"` → rechazada por admin |
| `observaciones_admin` | Notas del admin al validar (null si no ha validado) |
| `motivo_rechazo` | Razón de rechazo (null si no fue rechazada) |

---

## 8. `POST /api/recargas/reportar` — Reportar recarga

> El usuario deposita dinero (Nequi, PSE, Bancolombia, etc.) y el bot reporta la recarga con el comprobante.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `periodo` | `string` | ✅ Sí | Periodo `"YYYY-MM-DD"`. Ej: `"2026-03-01"` |
| `monto` | `number` | ✅ Sí | Monto recargado (positivo) |
| `comprobante_url` | `string` | ✅ Sí | URL de la imagen/captura del comprobante |
| `referencia_tx` | `string` | ❌ No | Referencia de la transacción — **previene duplicados** |

**⚠️ Idempotencia:** Si envías el mismo `referencia_tx` dos veces, no se crea duplicado. Devuelve la recarga existente.

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "periodo": "2026-03-01",
  "monto": 200000,
  "comprobante_url": "https://storage.supabase.co/comprobantes/nequi_001.jpg",
  "referencia_tx": "NEQUI-2026030812345"
}
```

**Respuesta exitosa (201 nuevo, 200 si ya existía):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-1234-5678-abcd-ef0123456789",
    "estado": "en_validacion"
  },
  "error": null
}
```

**Si ya existía esa referencia_tx (200):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-1234-5678-abcd-ef0123456789",
    "estado": "en_validacion",
    "mensaje": "Recarga ya reportada con esta referencia de transacción"
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `recarga_id` | UUID de la recarga creada |
| `estado` | `"en_validacion"` = pendiente de que el admin la apruebe |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
```

---

## 9. `GET /api/disponible` — Consultar saldo disponible

> Verifica cuánto dinero disponible tiene el usuario para pagar facturas.

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `periodo` | `string` | ✅ Sí | Periodo `"YYYY-MM-DD"` |

**Ejemplo:**
```
GET /api/disponible?telefono=573046757626&periodo=2026-03-01
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "periodo": "2026-03-01",
    "total_recargas_aprobadas": 200000,
    "total_pagos_pagados": 75000,
    "disponible": 125000
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `total_recargas_aprobadas` | Suma de todas las recargas aprobadas del periodo |
| `total_pagos_pagados` | Suma de todos los pagos confirmados del periodo |
| `disponible` | `recargas_aprobadas - pagos_pagados` = lo que queda para pagar |

---

## 10. `GET /api/notificaciones/pendientes/:telefono` — Notificaciones pendientes

> El bot consulta las notificaciones que debe enviar al usuario por WhatsApp.

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Ejemplo:**
```
GET /api/notificaciones/pendientes/573046757626
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
      "usuario_id": "49f3c602-...",
      "tipo": "recarga_aprobada",
      "canal": "whatsapp",
      "estado": "pendiente",
      "payload": {
        "recarga_id": "974bad6d-...",
        "monto": 200000,
        "mensaje": "Tu recarga de $200,000 ha sido aprobada."
      },
      "ultimo_error": null,
      "creado_en": "2026-03-08T10:30:00.000Z",
      "enviada_en": null
    },
    {
      "id": "a1b2c3d4-...",
      "tipo": "pago_confirmado",
      "canal": "whatsapp",
      "estado": "pendiente",
      "payload": {
        "pago_id": "0da485dd-...",
        "monto": 50950,
        "servicio": "Vanti S.A. ESP",
        "mensaje": "Se ha confirmado el pago de $50,950 para Vanti S.A. ESP."
      },
      "ultimo_error": null,
      "creado_en": "2026-03-08T11:00:00.000Z",
      "enviada_en": null
    }
  ],
  "error": null
}
```

**Tipos de notificación que puede recibir el bot:**

| Tipo | Cuándo se genera | Qué dice el `payload.mensaje` |
|------|-----------------|-------------------------------|
| `recarga_aprobada` | Admin aprueba recarga | "Tu recarga de $X ha sido aprobada." |
| `recarga_rechazada` | Admin rechaza recarga | "Tu recarga de $X ha sido rechazada." |
| `factura_validada` | Admin valida factura | "Tu factura de X por $Y ha sido validada y está lista para pago." |
| `factura_rechazada` | Admin rechaza factura | "Tu factura de X fue rechazada. Motivo: ..." |
| `pago_confirmado` | Se confirma un pago | "Se ha confirmado el pago de $X para Y." |
| `obligacion_completada` | Todas las facturas pagadas | "Todas tus facturas del periodo han sido pagadas." |
| `nueva_obligacion` | Se crea obligación del siguiente mes | "Se ha creado tu nueva obligación para el siguiente periodo." |
| `recordatorio_recarga` | Admin crea manualmente | Mensaje personalizado |

**Flujo recomendado:**
1. `GET /api/notificaciones/pendientes/:telefono` → Obtener pendientes
2. Enviar cada mensaje al usuario por WhatsApp
3. `PUT /api/notificaciones/:id` con `{"estado":"enviada"}` → Marcar como enviada
4. O usar `POST /api/notificaciones/batch-enviadas` para marcar varias de golpe

---

## 11. `PUT /api/notificaciones/:id` — Marcar notificación como enviada

> Después de enviar una notificación por WhatsApp, el bot la marca como enviada.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `estado` | `string` | ✅ Sí | `"enviada"` \| `"fallida"` \| `"leida"` |
| `ultimo_error` | `string` | ❌ No | Detalle del error (solo si estado = `"fallida"`) |

**Ejemplo — Marcar como enviada:**
```json
{
  "estado": "enviada"
}
```

**Ejemplo — Marcar como fallida:**
```json
{
  "estado": "fallida",
  "ultimo_error": "WhatsApp API timeout"
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "id": "7cc2d2eb-...",
    "usuario_id": "49f3c602-...",
    "tipo": "recarga_aprobada",
    "canal": "whatsapp",
    "estado": "enviada",
    "payload": { ... },
    "ultimo_error": null,
    "creado_en": "...",
    "enviada_en": null
  },
  "error": null
}
```

---

## 12. `POST /api/notificaciones/batch-enviadas` — Marcar varias como enviadas

> Marca múltiples notificaciones como enviadas de una sola vez (más eficiente que marcar una por una).

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `ids` | `string[]` | ✅ Sí | Array de UUIDs de notificaciones |

**Ejemplo:**
```json
{
  "ids": [
    "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
    "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "b2c3d4e5-6789-0abc-def1-234567890abc"
  ]
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "actualizadas": 3
  },
  "error": null
}
```

**Error si no envías IDs (400):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Se requiere un array de IDs"
  }
}
```

---

## 13. `POST /api/pagos/crear` — Crear un pago

> Crea un pago para una factura validada. Verifica que haya saldo suficiente.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `factura_id` | `string (UUID)` | ✅ Sí | ID de la factura a pagar (debe estar en estado `"validada"`) |

**⚠️ Validaciones:**
- La factura debe estar en estado `"validada"`
- Debe haber saldo disponible suficiente (recargas aprobadas - pagos existentes ≥ monto de la factura)

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"
}
```

**Respuesta exitosa (201):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "0da485dd-1234-5678-abcd-ef0123456789",
    "estado": "en_proceso",
    "monto": 50950,
    "servicio": "Vanti S.A. ESP"
  },
  "error": null
}
```

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "NOT_FOUND", "message": "Factura no encontrada" }
{ "code": "INVALID_STATE_TRANSITION", "message": "La factura debe estar en estado 'validada'" }
{ "code": "INSUFFICIENT_FUNDS", "message": "Fondos insuficientes. Disponible: $125,000, requerido: $200,000" }
```

---

## 14. `PUT /api/pagos/:id/confirmar` — Confirmar pago

> Confirma que un pago fue exitoso. Esto desencadena muchas acciones automáticas.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON (todos opcionales):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `proveedor` | `string` | ❌ No | Nombre del proveedor de pago |
| `referencia_proveedor` | `string` | ❌ No | Referencia del proveedor |
| `comprobante_url` | `string` | ❌ No | URL del comprobante de pago |

**Ejemplo:**
```json
{
  "proveedor": "Nequi",
  "referencia_proveedor": "NEQ-2026030812345",
  "comprobante_url": "https://storage.supabase.co/comprobantes/pago_001.jpg"
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "0da485dd-...",
    "estado": "pagado",
    "factura_estado": "pagada",
    "obligacion_estado": "completada",
    "obligacion_completada": true,
    "nueva_obligacion_id": "f1e2d3c4-..."
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `estado` | `"pagado"` = pago confirmado |
| `factura_estado` | `"pagada"` = la factura asociada ya está pagada |
| `obligacion_estado` | Estado actual de la obligación |
| `obligacion_completada` | `true` si TODAS las facturas de la obligación están pagadas |
| `nueva_obligacion_id` | UUID de la nueva obligación del siguiente mes (solo si se completó la actual) |

**⚠️ Efectos automáticos al confirmar:**
1. El pago pasa a `"pagado"`
2. La factura pasa a `"pagada"`
3. Se actualizan los contadores de la obligación
4. Si TODAS las facturas quedan pagadas → obligación se marca `"completada"`
5. Si la obligación se completa → se crea automáticamente la obligación del siguiente mes con las mismas facturas
6. Se genera notificación `pago_confirmado`
7. Si la obligación se completa → notificación `obligacion_completada`
8. Si se crea nueva obligación → notificación `nueva_obligacion`

---

## 15. `PUT /api/pagos/:id/fallar` — Marcar pago como fallido

> Cuando un pago falla (error del proveedor, timeout, etc.).

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_fallo` | `string` | ✅ Sí | Razón del fallo |

**Ejemplo:**
```json
{
  "motivo_fallo": "Timeout en la pasarela de pago"
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "0da485dd-...",
    "estado": "fallido"
  },
  "error": null
}
```

---

## 🔄 Flujo Completo del Bot (Paso a Paso)

```
1. USUARIO LLEGA POR WHATSAPP
   └─ POST /api/users/upsert → registrar o actualizar

2. ELIGE PLAN
   └─ PUT /api/users/plan → asignar plan

3. CREAR OBLIGACIÓN DEL MES
   └─ POST /api/obligaciones → crear compromiso mensual

4. CARGAR FACTURAS (una por servicio)
   └─ POST /api/facturas/captura → enviar cada factura
   └─ POST /api/facturas/captura → enviar cada factura
   └─ (repetir por cada servicio)

5. USUARIO RECARGA DINERO
   └─ POST /api/recargas/reportar → reportar con comprobante
   └─ (el admin aprueba/rechaza por su lado)

6. VERIFICAR SALDO
   └─ GET /api/disponible?telefono=X&periodo=X → ver cuánto hay

7. CONSULTAR ESTADO
   └─ GET /api/obligaciones?telefono=X → ver obligaciones y facturas
   └─ GET /api/facturas/obligacion/:id → ver detalle de facturas

8. ENVIAR NOTIFICACIONES
   └─ GET /api/notificaciones/pendientes/:telefono → obtener pendientes
   └─ (enviar por WhatsApp)
   └─ POST /api/notificaciones/batch-enviadas → marcar como enviadas

9. CREAR PAGOS (cuando hay facturas validadas y saldo)
   └─ POST /api/pagos/crear → crear pago
   └─ PUT /api/pagos/:id/confirmar → confirmar pago
   └─ (si falla → PUT /api/pagos/:id/fallar)
```

---

## 📊 Estados de las Entidades

### Facturas:
```
extraida → en_revision → validada → pagada
                      ↘ rechazada
```

### Recargas:
```
en_validacion → aprobada
              ↘ rechazada
```

### Obligaciones:
```
activa → en_progreso → completada
       ↘ cancelada
```

### Pagos:
```
en_proceso → pagado
           ↘ fallido
```

### Notificaciones:
```
pendiente → enviada
          ↘ fallida
          ↘ leida
```
