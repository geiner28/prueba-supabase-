# 🤖 DeOne Backend — Documentación Completa de Endpoints para el Bot

> **Última actualización:** 12 de marzo de 2026  
> **Base URL producción:** `https://prueba-supabase.onrender.com/api`  
> **Total endpoints:** 21 (17 bot + 4 admin)  
> **⚙️ Jobs automáticos:**  
> - Cron job diario 9:00 AM → evalúa obligaciones, recalcula solicitudes, genera notificaciones  
> - Cron job cada 6 horas → detecta usuarios sin respuesta y genera alertas al admin

---

## 🔐 Autenticación

**Todos los endpoints requieren este header:**

```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

> También se puede usar `x-admin-api-key` con el mismo valor. Ambos funcionan para todos los endpoints del bot.

**Si no se envía el header o el valor es incorrecto:**
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "API Key inválida o ausente" }
}
```

---

## 📦 Formato de Respuesta (TODAS las respuestas)

Todas las respuestas del API siguen exactamente este formato, sin excepciones:

```json
{
  "ok": true,        // true = operación exitosa, false = hubo un error
  "data": { ... },   // datos de respuesta (null cuando hay error)
  "error": null       // null si ok=true, objeto { code, message, details } si ok=false
}
```

**Códigos de error posibles:**

| Código HTTP | `error.code` | Significado |
|-------------|--------------|-------------|
| 400 | `VALIDATION_ERROR` | Los datos enviados no cumplen con el formato requerido |
| 400 | `BAD_REQUEST` | Error lógico en la solicitud (ej: monto 0, sin facturas) |
| 401 | `UNAUTHORIZED` | API Key inválida, ausente o vencida |
| 404 | `NOT_FOUND` | Recurso no encontrado (usuario, factura, obligación, etc.) |
| 409 | `CONFLICT_DUPLICATE` | Ya existe un recurso con esos datos (duplicado) |
| 409 | `INSUFFICIENT_FUNDS` | No hay saldo suficiente para la operación |
| 409 | `INVALID_STATE_TRANSITION` | La entidad no está en el estado correcto para esta acción |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

---

## 📋 Índice de Endpoints

### Gestión de Usuarios
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 1 | `POST` | `/api/users/upsert` | Registra un usuario nuevo o actualiza uno existente usando su teléfono como clave única |
| 2 | `PUT` | `/api/users/plan` | Asigna o cambia el plan del usuario (control, tranquilidad, respaldo) |
| 2a | `DELETE` | `/api/users/:id` o `/api/users?telefono=XXX` | 🆕 Elimina usuario (soft delete por default; `?hard=true` borra físicamente) |

### Obligaciones (Compromisos Mensuales)
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 3 | `POST` | `/api/obligaciones` | Crea el compromiso mensual que agrupa todas las facturas de un periodo |
| 4 | `GET` | `/api/obligaciones?telefono=XXX` | Lista todas las obligaciones del usuario con sus facturas y progreso de pago |
| 5 | `GET` | `/api/obligaciones/:id` | Muestra el detalle completo de una obligación específica incluyendo datos del usuario |
| 5a | `DELETE` | `/api/obligaciones/:id` | 🆕 Elimina obligación (bloqueado si hay facturas pagadas/validadas; `?force=true` cascada) |

### Facturas
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 6 | `POST` | `/api/facturas/captura` | Registra una factura extraída por el bot (acepta campos null cuando la extracción es incompleta) |
| 7 | `GET` | `/api/facturas/obligacion/:id` | Lista todas las facturas de una obligación con todos sus campos y estados |
| 7a | `DELETE` | `/api/facturas/:id` | 🆕 Elimina una factura sin importar su estado (cascada en pagos asociados) |

### Recargas (Depósitos de Dinero)
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 8 | `POST` | `/api/recargas/reportar` | Reporta una recarga del usuario con comprobante; queda pendiente de aprobación por admin |

### Saldo
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 9 | `GET` | `/api/disponible?telefono=X&periodo=X` | Calcula el saldo disponible: recargas aprobadas menos pagos ya realizados |

### Notificaciones
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 10 | `GET` | `/api/notificaciones/pendientes/:telefono` | Obtiene todas las notificaciones pendientes de enviar al usuario por WhatsApp |
| 11 | `PUT` | `/api/notificaciones/:id` | Marca una notificación individual como enviada, fallida o leída |
| 12 | `POST` | `/api/notificaciones/batch-enviadas` | Marca múltiples notificaciones como enviadas en una sola llamada |
| 12a | `GET` | `/api/notificaciones/pendientes-hoy` | 🆕 Obtiene TODAS las notificaciones de inicio mes del día actual (global - auto-marca enviadas) |

### Pagos
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 13 | `POST` | `/api/pagos/crear` | Crea un pago para una factura validada verificando que haya saldo suficiente |

### 🆕 Solicitudes de Recarga Automáticas
| # | Método | Endpoint | Qué hace |
|---|--------|----------|----------|
| 14 | `POST` | `/api/solicitudes-recarga/generar` | Genera solicitudes de recarga automáticas según el plan del usuario y sus facturas pendientes |
| 15 | `GET` | `/api/solicitudes-recarga?telefono=X` | Lista las solicitudes de recarga del usuario con filtros opcionales por estado y obligación |
| 16 | `POST` | `/api/solicitudes-recarga/verificar-recordatorios` | Verifica si hay cuotas próximas a vencer sin saldo y genera notificaciones de recordatorio |
| 17 | `PUT` | `/api/solicitudes-recarga/:id/fechas` | Permite al usuario personalizar las fechas límite de sus cuotas de recarga |

### 🔧 Endpoints de Administración (Recargas y Alertas)
| # | Método | Endpoint | Auth | Qué hace |
|---|--------|----------|------|----------|
| 18 | `PUT` | `/api/recargas/:id/aprobar` | `x-admin-api-key` | Admin aprueba una recarga + auto-limpieza de notificaciones y solicitudes |
| 19 | `PUT` | `/api/recargas/:id/rechazar` | `x-admin-api-key` | Admin rechaza una recarga con motivo |
| 20 | `GET` | `/api/notificaciones/admin/alertas` | `x-admin-api-key` | Obtiene alertas pendientes de usuarios sin respuesta |
| 21 | `GET` | `/api/notificaciones` | `x-admin-api-key` | Lista todas las notificaciones con filtros y datos del usuario |

---

## 1. `POST /api/users/upsert` — Registrar o actualizar usuario

### ¿Qué hace?
Cuando un usuario nuevo llega por WhatsApp, el bot llama este endpoint para registrarlo en el sistema. Si el usuario ya existe (mismo teléfono), actualiza los datos que se envíen (nombre, apellido, correo) sin crear duplicados.

### ¿Cuándo usarlo?
- Al inicio de cada conversación nueva con un usuario desconocido
- Cuando el usuario quiere actualizar sus datos personales
- Es idempotente: llamarlo múltiples veces con el mismo teléfono no causa problemas

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario (mín 7 caracteres). Ej: `"573046757626"`. Es la clave única del usuario |
| `nombre` | `string` | ❌ No | Nombre del usuario. Si es nuevo y no se envía, se usa el teléfono como nombre |
| `apellido` | `string` | ❌ No | Apellido del usuario |
| `correo` | `string` | ❌ No | Email válido del usuario |

**Ejemplo — Usuario nuevo:**
```json
{
  "telefono": "573046757626",
  "nombre": "Laura",
  "apellido": "Durán",
  "correo": "laura@email.com"
}
```

**Ejemplo — Solo teléfono (mínimo requerido):**
```json
{
  "telefono": "573046757626"
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
| `usuario_id` | UUID interno del usuario. Guardar para referencias internas |
| `creado` | `true` = usuario nuevo fue creado, `false` = usuario existente fue actualizado |

**Errores posibles:**
```json
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 2. `PUT /api/users/plan` — Cambiar plan del usuario

### ¿Qué hace?
Asigna o cambia el plan de pago del usuario. El plan determina cómo se distribuyen las solicitudes de recarga: en 1 cuota (control) o en 2 cuotas (tranquilidad/respaldo).

### ¿Cuándo usarlo?
- Cuando el usuario elige su plan por primera vez
- Cuando quiere cambiar de plan
- Debe llamarse ANTES de generar solicitudes de recarga (endpoint 14)

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

**Diferencia entre planes:**

| Plan | Recargas/Mes | Distribución | Descripción |
|------|-------------|--------------|-------------|
| `control` | 1 | Día 1: pago total | El usuario hace 1 sola recarga por el monto total de todas sus facturas |
| `tranquilidad` | 2 | Día 1 y 15 | El sistema divide las facturas en 2 cuotas según sus fechas de vencimiento |
| `respaldo` | 2 | Día 1 y 15 | Igual que tranquilidad, 2 cuotas distribuidas por fecha de vencimiento |

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
    "plan_nuevo": "tranquilidad"
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `plan_anterior` | El plan que tenía antes del cambio |
| `plan_nuevo` | El plan asignado ahora |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 3. `POST /api/obligaciones` — Crear obligación

### ¿Qué hace?
Crea una obligación mensual: un contenedor que agrupa todas las facturas que el usuario debe pagar en un periodo (mes). Es como una "carpeta" donde se guardan las facturas de marzo, abril, etc. Los contadores de monto_total y facturas se actualizan automáticamente cuando se agregan facturas.

### ¿Cuándo usarlo?
- Al inicio de cada mes o cuando el usuario quiere organizar sus pagos de un nuevo periodo
- Se crea UNA obligación por mes
- Después de crearla, se le asocian facturas con el endpoint 6

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `descripcion` | `string` | ✅ Sí | Descripción legible. Ej: `"Pagos de Marzo 2026"` |
| `periodo` | `string` | ✅ Sí | Fecha del periodo en formato `YYYY-MM-DD`. Se normaliza al día 1 del mes |

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
| `id` | UUID de la obligación. **Guardar este ID** para asociar facturas (endpoint 6) y generar solicitudes de recarga (endpoint 14) |
| `estado` | `"activa"` = recién creada |
| `total_facturas` | Empieza en 0, se incrementa al agregar facturas |
| `monto_total` | Empieza en 0, suma automáticamente los montos de las facturas |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
```

---

## 4. `GET /api/obligaciones?telefono=XXX` — Listar obligaciones

### ¿Qué hace?
Devuelve TODAS las obligaciones del usuario, cada una con su array de facturas, montos totales y porcentaje de progreso. Sirve para que el bot muestre al usuario un resumen de sus compromisos de pago.

### ¿Cuándo usarlo?
- Cuando el usuario pregunta "¿cómo van mis pagos?" o "¿qué debo?"
- Para mostrar un resumen general de todas las obligaciones

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `estado` | `string` | ❌ No | Filtrar por estado: `"activa"`, `"en_progreso"`, `"completada"`, `"cancelada"` |

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
      "usuario_id": "49f3c602-...",
      "descripcion": "Pagos de Marzo 2026",
      "periodo": "2026-03-01",
      "estado": "activa",
      "total_facturas": 3,
      "facturas_pagadas": 1,
      "monto_total": 250000,
      "monto_pagado": 85000,
      "progreso": 33,
      "completada_en": null,
      "creado_en": "2026-03-08T...",
      "facturas": [
        {
          "id": "18e6dcfd-...",
          "servicio": "Internet ETB",
          "monto": 85000,
          "estado": "pagada",
          "referencia_pago": "ETB-2026-001",
          "etiqueta": "internet",
          "fecha_vencimiento": "2026-03-10",
          "fecha_emision": "2026-02-25"
        }
      ]
    }
  ],
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `progreso` | Porcentaje de facturas pagadas (0-100). Útil para mostrar una barra de progreso |
| `facturas` | Array con todas las facturas de esa obligación y sus estados |
| `monto_total` | Suma de montos de todas las facturas |
| `monto_pagado` | Suma de montos de facturas ya pagadas |
| `estado` | `"activa"` → sin pagos, `"en_progreso"` → algunos pagos, `"completada"` → todo pagado |

---

## 5. `GET /api/obligaciones/:id` — Detalle de una obligación

### ¿Qué hace?
Muestra el detalle completo de UNA obligación específica, incluyendo todas sus facturas y los datos del usuario (nombre, teléfono). Más detallado que el listado del endpoint 4.

### ¿Cuándo usarlo?
- Cuando el usuario quiere ver el detalle de una obligación específica
- Para obtener la lista completa de facturas de un periodo

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
    "id": "86a0c709-...",
    "descripcion": "Pagos de Marzo 2026",
    "periodo": "2026-03-01",
    "estado": "activa",
    "total_facturas": 3,
    "facturas_pagadas": 0,
    "monto_total": 250000,
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

> Incluye el objeto `usuarios` con nombre, apellido y teléfono del propietario.

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Obligación no encontrada" }
```

---

## 6. `POST /api/facturas/captura` — Registrar factura/servicio

### ¿Qué hace?
Registra una factura dentro de una obligación. El bot extrae los datos de la factura (foto, PDF, o texto) y los envía aquí. Los campos que no pueda extraer se envían como `null`. Si la extracción es dudosa o el monto es null, la factura queda en estado `"en_revision"` para que el admin la valide manualmente.

### ¿Cuándo usarlo?
- Cuando el usuario envía una foto/PDF de su factura por WhatsApp
- Cuando el usuario dicta los datos de su factura manualmente
- Se llama UNA vez por cada factura/servicio diferente

### Comportamiento automático:
- Si `monto` es `null` o `extraccion_estado` es `"dudosa"`/`"fallida"` → estado `"en_revision"` (requiere revisión del admin)
- Si todo está ok → estado `"extraida"` (lista para que el admin la valide)
- Genera automáticamente una entrada en la tabla de revisiones si necesita revisión

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Acepta null | Descripción |
|-------|------|-----------|-------------|-------------|
| `telefono` | `string` | ✅ Sí | ❌ | Teléfono del usuario |
| `obligacion_id` | `string (UUID)` | ✅ Sí | ❌ | ID de la obligación (obtenido del endpoint 3) |
| `servicio` | `string` | ✅ Sí | ❌ | Nombre del servicio. Ej: `"EPM Energía"`, `"Vanti Gas"`, `"ETB Internet"` |
| `monto` | `number` | ❌ No | ✅ Sí | Valor de la factura en pesos. Si es `null` → queda en revisión |
| `fecha_vencimiento` | `string` | ❌ No | ✅ Sí | Fecha límite de pago. Formato `"YYYY-MM-DD"`. Importante para distribuir cuotas |
| `fecha_emision` | `string` | ❌ No | ✅ Sí | Fecha en que se emitió la factura. Formato `"YYYY-MM-DD"` |
| `referencia_pago` | `string` | ❌ No | ✅ Sí | Número de referencia de la factura (el que usa el usuario para pagar) |
| `etiqueta` | `string` | ❌ No | ✅ Sí | Etiqueta personalizada. Ej: `"internet"`, `"gas"`, `"energia"` |
| `periodo` | `string` | ❌ No | ✅ Sí | Periodo `"YYYY-MM-DD"`. Si no se envía, toma el de la obligación |
| `origen` | `string` | ❌ No | ✅ Sí | Origen de los datos: `"bot_whatsapp"`, `"manual"`, `"ocr"` |
| `archivo_url` | `string` | ❌ No | ✅ Sí | URL de la imagen/PDF de la factura en Supabase Storage |
| `extraccion_estado` | `string` | ❌ No | ❌ | Calidad de extracción: `"ok"` (default), `"dudosa"`, `"fallida"` |
| `extraccion_json` | `object` | ❌ No | ✅ Sí | JSON crudo con los datos brutos que el OCR/IA extrajo |
| `extraccion_confianza` | `number` | ❌ No | ✅ Sí | Nivel de confianza de la extracción (0.0 a 1.0) |

**Ejemplo — Bot envía factura completa:**
```json
{
  "telefono": "573046757626",
  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
  "servicio": "Vanti S.A. ESP",
  "monto": 50950,
  "fecha_vencimiento": "2026-03-24",
  "fecha_emision": "2026-03-01",
  "referencia_pago": "7890123456",
  "etiqueta": "gas",
  "origen": "bot_whatsapp",
  "archivo_url": "https://storage.supabase.co/facturas/gas_mar.pdf",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.95
}
```

**Ejemplo — Bot no pudo extraer todos los datos:**
```json
{
  "telefono": "573046757626",
  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
  "servicio": "Factura desconocida",
  "monto": null,
  "fecha_vencimiento": null,
  "referencia_pago": null,
  "origen": "bot_whatsapp",
  "archivo_url": "https://storage.supabase.co/facturas/borrosa.jpg",
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
| `factura_id` | UUID de la factura. **Guardar** para usarlo en el endpoint de pagos (13) |
| `estado` | `"extraida"` = capturada correctamente, `"en_revision"` = necesita revisión del admin |
| `requiere_revision` | `true` = el admin debe revisar esta factura antes de que se pueda pagar |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "NOT_FOUND", "message": "Obligación no encontrada o no pertenece al usuario" }
{ "code": "VALIDATION_ERROR", "message": "Error de validación en los datos enviados" }
```

---

## 7. `GET /api/facturas/obligacion/:obligacionId` — Listar facturas

### ¿Qué hace?
Lista todas las facturas de una obligación específica. Muestra TODOS los campos de cada factura, usando `referencia_pago` como identificador principal y `_id` como UUID interno técnico.

### ¿Cuándo usarlo?
- Para mostrar al usuario la lista de facturas de un mes
- Para verificar el estado de cada factura (extraida, validada, pagada, etc.)
- Para obtener los `_id` de facturas validadas y poder crear pagos

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
      "referencia_pago": "ETB-2026-001",
      "servicio": "Internet ETB",
      "monto": 85000,
      "estado": "validada",
      "origen": "bot_whatsapp",
      "archivo_url": "https://storage.supabase.co/facturas/etb.jpg",
      "etiqueta": "internet",
      "fecha_emision": "2026-02-25",
      "fecha_vencimiento": "2026-03-10",
      "periodo": "2026-03-01",
      "extraccion_estado": "ok",
      "extraccion_json": null,
      "extraccion_confianza": 0.95,
      "observaciones_admin": "Factura verificada",
      "motivo_rechazo": null,
      "_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"
    }
  ],
  "error": null
}
```

| Campo | Significado |
|-------|-------------|
| `referencia_pago` | Referencia de pago de la factura. Es el identificador que el usuario conoce |
| `_id` | UUID interno. Usar este valor para el endpoint de pagos (13) en el campo `factura_id` |
| `estado` | Estado actual de la factura (ver diagrama abajo) |
| `observaciones_admin` | Notas que el admin escribió al validar (null si no ha validado) |
| `motivo_rechazo` | Razón por la que se rechazó (null si no fue rechazada) |

**Estados posibles de una factura:**
| Estado | Significado |
|--------|-------------|
| `extraida` | Capturada correctamente por el bot. Pendiente de validación del admin |
| `en_revision` | La extracción fue dudosa. El admin debe verificar los datos |
| `validada` | El admin confirmó los datos. **Lista para pagar** |
| `pagada` | Ya se realizó el pago de esta factura |
| `rechazada` | El admin rechazó esta factura (datos incorrectos, duplicada, etc.) |

---

## 8. `POST /api/recargas/reportar` — Reportar recarga

### ¿Qué hace?
Registra que el usuario depositó dinero en la plataforma (por Nequi, PSE, Bancolombia, etc.). La recarga queda en estado `en_validacion` hasta que un admin la apruebe. Una vez aprobada, el monto se suma al saldo disponible del usuario.

### ¿Cuándo usarlo?
- Cuando el usuario envía un comprobante de pago/transferencia por WhatsApp
- El bot debe incluir la URL del comprobante y el monto

### Comportamiento importante:
- Si se envía `referencia_tx` y ya existe una recarga con esa referencia → NO se duplica, devuelve la existente
- La recarga NO está disponible inmediatamente. Debe ser aprobada por un admin primero
- Al ser aprobada, se genera automáticamente una notificación `recarga_aprobada`
- 🆕 **Además**, al ser aprobada también se genera una notificación `recarga_confirmada` con un mensaje personalizado que incluye el nombre del usuario y su saldo actualizado

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `periodo` | `string` | ✅ Sí | Periodo de la recarga `"YYYY-MM-DD"`. Ej: `"2026-03-01"` |
| `monto` | `number` | ✅ Sí | Monto recargado en pesos (debe ser positivo) |
| `comprobante_url` | `string` | ✅ Sí | URL de la imagen/captura del comprobante de pago |
| `referencia_tx` | `string` | ❌ No | Referencia de la transacción bancaria. **Previene duplicados** |

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "periodo": "2026-03-01",
  "monto": 130000,
  "comprobante_url": "https://storage.supabase.co/comprobantes/nequi_001.jpg",
  "referencia_tx": "NEQUI-2026030812345"
}
```

**Respuesta exitosa (201):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-...",
    "estado": "en_validacion"
  },
  "error": null
}
```

**Si ya existía esa referencia_tx (200 — idempotente):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-...",
    "estado": "en_validacion",
    "mensaje": "Recarga ya reportada con esta referencia de transacción"
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `recarga_id` | UUID de la recarga |
| `estado` | `"en_validacion"` = esperando aprobación del admin |

---

## 9. `GET /api/disponible` — Consultar saldo disponible

### ¿Qué hace?
Calcula en tiempo real cuánto dinero tiene disponible el usuario para pagar facturas. La fórmula es: `disponible = total_recargas_aprobadas - total_pagos_realizados`. Solo cuenta recargas en estado "aprobada" y pagos en estado "pagado" o "en_proceso".

### ¿Cuándo usarlo?
- Antes de intentar crear un pago (endpoint 13)
- Cuando el usuario pregunta "¿cuánto tengo disponible?"
- Para verificar si necesita hacer una recarga adicional

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `periodo` | `string` | ✅ Sí | Periodo a consultar `"YYYY-MM-DD"` |

**Ejemplo:**
```
GET /api/disponible?telefono=573046757626&periodo=2026-03-01
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-...",
    "periodo": "2026-03-01",
    "total_recargas_aprobadas": 250000,
    "total_pagos_pagados": 130000,
    "disponible": 120000
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `total_recargas_aprobadas` | Suma de todas las recargas que el admin ya aprobó en este periodo |
| `total_pagos_pagados` | Suma de todos los pagos creados (en_proceso + pagados) en este periodo |
| `disponible` | Lo que queda para pagar. Si es 0 o negativo, el usuario necesita recargar |

---

## 10. `GET /api/notificaciones/pendientes/:telefono` — Notificaciones pendientes

### ¿Qué hace?
Devuelve todas las notificaciones que están en estado "pendiente" para un usuario. Estas son las notificaciones que el bot debe enviar por WhatsApp. Cada notificación tiene un `payload.mensaje` con el texto listo para enviar.

### 🆕 Comportamiento atómico (consulta + marcado):
- Al consultar este endpoint, **automáticamente cambia el estado de todas las notificaciones devueltas a `"enviada"`**
- Esto evita duplicados si el bot se reinicia o hace múltiples consultas
- Excluye automáticamente las notificaciones de tipo `alerta_admin` (esas solo las ve el admin)
- **Ya NO es necesario llamar los endpoints 11 o 12** después de consultar — el marcado es automático

### ¿Cuándo usarlo?
- El bot debe llamar este endpoint periódicamente (cada 30-60 segundos) para cada usuario activo
- O cuando el usuario inicia conversación, para enviarle las notificaciones acumuladas
- **Ya no necesita marcar como enviadas después** — se marca automáticamente al consultar

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
      "id": "7cc2d2eb-...",
      "tipo": "solicitud_recarga",
      "canal": "whatsapp",
      "estado": "pendiente",
      "payload": {
        "solicitud_id": "09e2ed08-...",
        "numero_cuota": 1,
        "total_cuotas": 2,
        "monto": 215000,
        "fecha_limite": "2026-03-10",
        "plan": "tranquilidad",
        "mensaje": "Hola, tu primera cuota es de $215,000. Fecha límite: 2026-03-10. Cuota 1 de 2."
      },
      "ultimo_error": null,
      "creado_en": "2026-03-09T16:04:24.222Z"
    }
  ],
  "error": null
}
```

**Todos los tipos de notificación que puede recibir el bot:**

| Tipo | Se genera cuando... | Ejemplo de `payload.mensaje` |
|------|---------------------|------------------------------|
| `solicitud_recarga` | Se generan solicitudes de recarga automáticas (endpoint 14) | "Hola, tu primera cuota es de $215,000. Fecha límite: 2026-03-10. Cuota 1 de 2." |
| `solicitud_recarga_inicio_mes` | 🆕 El cron job detecta que es inicio de mes y el usuario tiene obligaciones activas | Ver sección "Plantillas de mensajes automáticos" más abajo |
| `recarga_confirmada` | 🆕 El admin aprueba una recarga del usuario | "Recibido, {nombre} ✌🏼 Ya registré tu recarga. Tu saldo disponible es de ${saldo}." |
| `recordatorio_recarga` | El sistema detecta cuotas próximas a vencer sin saldo (endpoint 16) | "Recuerda que tienes una recarga pendiente de $120,000 antes del 2026-03-20. Cuota 2 de 2." |
| `recarga_aprobada` | El admin aprueba una recarga | "Tu recarga de $130,000 ha sido aprobada." |
| `recarga_rechazada` | El admin rechaza una recarga | "Tu recarga de $130,000 ha sido rechazada. Motivo: Comprobante borroso" |
| `factura_validada` | El admin valida una factura | "Tu factura de Internet ETB por $85,000 ha sido validada y está lista para pago." |
| `factura_rechazada` | El admin rechaza una factura | "Tu factura de Internet ETB fue rechazada. Motivo: Factura duplicada" |
| `pago_confirmado` | Se confirma un pago exitoso | "Se ha confirmado el pago de $85,000 para Internet ETB." |
| `obligacion_completada` | Todas las facturas de una obligación fueron pagadas | "¡Felicidades! Todas tus facturas del periodo marzo 2026 han sido pagadas." |
| `nueva_obligacion` | Se crea automáticamente la obligación del siguiente mes | "Se ha creado tu nueva obligación para abril 2026." |
| `alerta_admin` | 🆕 Job de inactividad detecta usuario sin respuesta 24h | Solo visible para admin en endpoint 20. No aparece en el bot |

**Flujo recomendado para el bot:**
```
1. GET /api/notificaciones/pendientes/573046757626 → obtener pendientes
   (⚡ las notificaciones devueltas se marcan como 'enviada' AUTOMÁTICAMENTE)
2. Por cada notificación:
   a. Leer payload.mensaje (texto formateado listo para enviar)
   b. Enviar por WhatsApp al usuario
3. ✅ NO necesita llamar batch-enviadas — ya están marcadas
```

> **🆕 Nota importante:** Ahora el sistema genera automáticamente notificaciones de tipo `solicitud_recarga_inicio_mes`, `solicitud_recarga` y `recarga_confirmada` con mensajes personalizados que incluyen el nombre del usuario, detalle de obligaciones con @etiquetas, montos y la llave de recarga `0090944088`. El bot solo necesita leer `payload.mensaje` y enviarlo.
>
> **Sobre duplicados:** Si el bot se cae después de consultar pero antes de enviar por WhatsApp, las notificaciones ya estarán marcadas como 'enviada'. El bot debe guardar localmente las notificaciones recibidas para re-enviarlas si falla.

---

## 11. `PUT /api/notificaciones/:id` — Marcar notificación como enviada

### ¿Qué hace?
Actualiza el estado de UNA notificación individual. Normalmente se usa para marcarla como "enviada" después de que el bot la envió por WhatsApp. También permite marcar como "fallida" si hubo un error al enviarla.

### ¿Cuándo usarlo?
- Después de enviar una notificación individual por WhatsApp
- Si hubo un error al enviar, marcar como "fallida" con el detalle del error
- Para lotes grandes, es más eficiente usar el endpoint 12 (batch)

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

**Ejemplo — Enviada con éxito:**
```json
{ "estado": "enviada" }
```

**Ejemplo — Error al enviar:**
```json
{
  "estado": "fallida",
  "ultimo_error": "WhatsApp API timeout después de 30 segundos"
}
```

**Respuesta exitosa (200):** Devuelve la notificación actualizada completa.

---

## 12. `POST /api/notificaciones/batch-enviadas` — Marcar varias como enviadas

### ¿Qué hace?
Marca múltiples notificaciones como "enviada" en una sola llamada al API. Es más eficiente que llamar al endpoint 11 una por una. Acepta un array de IDs.

### ¿Cuándo usarlo?
- Después de enviar un lote de notificaciones por WhatsApp
- Es la forma recomendada si hay más de 1 notificación pendiente

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `ids` | `string[]` | ✅ Sí | Array de UUIDs de las notificaciones a marcar |

**Ejemplo:**
```json
{
  "ids": [
    "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
    "a1b2c3d4-5678-90ab-cdef-1234567890ab"
  ]
}
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": { "actualizadas": 2 },
  "error": null
}
```

---

## 12a. `GET /api/notificaciones/pendientes-hoy` — Obtener notificaciones de inicio mes global

### ¿Qué hace?
🆕 **Endpoint estratégico para automatización:** Devuelve TODAS las notificaciones de inicio de mes (`solicitud_recarga_inicio_mes`) del día actual, para TODOS los usuarios. Se diseñó para ser consultado una sola vez diariamente por un job automático o cron job. Automáticamente marca todas las notificaciones devueltas como `"enviadas"` para evitar duplicados en reintentos.

### ¿Cuándo usarlo?

- **Una sola vez por día** (típicamente a las 9:00 AM junto con el cron job de evaluación de recargas)
- Para que un **bot global o job automático** distribuya notificaciones de inicio de mes a todos los usuarios
- Cuando inicia un nuevo mes y el cron job `jobEvaluacionRecargas` crea las notificaciones
- **NO es para consultas por usuario individual** — usa el endpoint 10 (pendientes/:telefono) para eso

### Flujo garantizado

1. **Job cron (9 AM):** Crea notificaciones de inicio mes para usuarios que detecta en esa fecha
2. **Misma hora:** Tu bot/process consulta este endpoint
3. **Respuesta:** Array con todos los usuarios + sus notificaciones + datos
4. **Acción:** Tu bot envía mensaje por WhatsApp a cada `usuarios.telefono`
5. **Automático:** Las notificaciones se marcan como `"enviada"` **en la misma consulta**
6. **Día siguiente:** Si consultas de nuevo, devuelve vacío (todo ya está marcado)

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

O también:
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Parámetros:** 
- **Sin query params**
- **Sin body JSON**

**Ejemplo de consulta:**
```
GET /api/notificaciones/pendientes-hoy
```

**Respuesta exitosa (200) — Hay notificaciones:**
```json
{
  "ok": true,
  "data": {
    "total": 2,
    "notificaciones": [
      {
        "id": "notif-001",
        "usuario_id": "user-001",
        "tipo": "solicitud_recarga_inicio_mes",
        "canal": "whatsapp",
        "estado": "pendiente",
        "payload": {
          "tipo_mensaje": "inicio_mes",
          "nombre_usuario": "Laura Durán",
          "mes_actual": "Marzo 2026",
          "mes_anterior": "Febrero 2026",
          "obligaciones": [
            { "etiqueta": "energia", "monto": 85000 },
            { "etiqueta": "gas", "monto": 50950 }
          ],
          "total_obligaciones": 135950,
          "saldo_actual": 0,
          "valor_a_recargar": 135950,
          "es_primera_recarga": true,
          "obligacion_id": "obl-123",
          "periodo": "2026-03-01",
          "mensaje": "Hola Laura Durán ✌🏼\nArrancamos mes!\n\nEn Febrero pagaste $ 0 y tienes un saldo de $ 0\n\nPara Marzo, tus obligaciones suman $ 135,950, así:\n\n\"@energia\": \"$ 85,000\".\n\"@gas\": \"$ 50,950\".\n\nLa recarga total sugerida para Marzo es de $ 135,950.\n\nPuedes hacer la recarga a la llave 0090944088.\n\nApenas la hagas, me envías el comprobante y yo me encargo del resto deOne! 🙌🏼"
        },
        "usuarios": {
          "nombre": "Laura",
          "apellido": "Durán",
          "telefono": "573046757626"
        },
        "creado_en": "2026-03-16T09:00:15.000Z"
      }
    ]
  },
  "error": null
}
```

**Respuesta exitosa (200) — Sin notificaciones:**
```json
{
  "ok": true,
  "data": {
    "total": 0,
    "notificaciones": []
  },
  "error": null
}
```

### Campos importantes en respuesta

| Campo | Descripción |
|-------|-------------|
| `id` | UUID único de la notificación |
| `tipo` | Siempre `"solicitud_recarga_inicio_mes"` para este endpoint |
| `estado` | `"pendiente"` — pero se marca a `"enviada"` automáticamente |
| `payload.mensaje` | **Texto final listo para enviar por WhatsApp** — no requiere post-procesamiento |
| `payload.valor_a_recargar` | Cantidad recomendada a recargar = obligaciones - saldo actual |
| `usuarios.telefono` | Número WhatsApp destino para el envío |
| `creado_en` | Timestamp de cuándo se generó automáticamente |

### Implementación típica en Python/Node.js

```javascript
// En tu job que corre cada día a las 9:00 AM

async function enviarNotificacionesInicioMes() {
  // 1. Consultar notificaciones de hoy
  const response = await fetch('http://localhost:3001/api/notificaciones/pendientes-hoy', {
    method: 'GET',
    headers: {
      'x-bot-api-key': 'TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3'
    }
  });
  
  const { ok, data } = await response.json();
  
  if (!ok || data.total === 0) {
    console.log('No hay notificaciones para enviar hoy');
    return;
  }
  
  // 2. Iterar sobre cada notificación
  for (const notificacion of data.notificaciones) {
    const telefonoDestino = notificacion.usuarios.telefono;
    const mensaje = notificacion.payload.mensaje;
    
    // 3. Enviar por WhatsApp (usando tu bot)
    await enviarPorWhatsApp(telefonoDestino, mensaje);
    
    console.log(`✅ Notificación enviada a ${telefonoDestino}`);
  }
  
  // ¡Listo! Las notificaciones ya están marcadas como "enviadas"
  // No necesitas hacer nada más
  console.log(`${data.total} notificaciones de inicio mes distribuidas`);
}
```

### Casos especiales

**¿Qué pasa si consulto 2 veces en el mismo día?**
- 1ª consulta: Devuelve 5 notificaciones, las marca como enviadas
- 2ª consulta: Devuelve vacío `[]` (todas ya están marcadas)

**¿Qué pasa si mi job falla mientras envía?**
- Las notificaciones se devolvieron pero se marcaron como `"enviada"`
- Retiene el log de que fueron "enviadas" pero sin confirmación de WhatsApp
- Para reintentos, usa el endpoint 10 (pendientes/:telefono) con el usuario específico

**¿Cómo sé si un usuario recibió el mensaje?**
- Este endpoint solo marca como `"enviada"` (salió del sistema)
- El estado de WhatsApp (leído, fallido) se trackea en un campo separado `ultimo_error`
- Puedes consultar con el endpoint 3 (listar notificaciones) filtradas por `estado=enviada` y revisar `ultimo_error`

---

## 13. `POST /api/pagos/crear` — Crear un pago

### ¿Qué hace?
Crea un pago para una factura específica. Verifica automáticamente que:
1. La factura exista y esté en estado `"validada"` (el admin ya la revisó)
2. El usuario tenga saldo disponible suficiente (recargas aprobadas - pagos existentes ≥ monto de la factura)

Si ambas condiciones se cumplen, crea el pago en estado `"en_proceso"`. El monto se descuenta inmediatamente del saldo disponible.

### ¿Cuándo usarlo?
- Cuando el usuario tiene saldo disponible y facturas validadas
- Después de verificar el saldo con el endpoint 9
- El bot debería llamar este endpoint automáticamente cuando las condiciones se cumplan

### Flujo previo necesario:
1. La factura debe estar en estado `"validada"` (el admin la validó con `PUT /api/facturas/:id/validar`)
2. El usuario debe tener saldo suficiente (haber hecho recargas aprobadas)

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `factura_id` | `string (UUID)` | ✅ Sí | UUID de la factura a pagar. Obtenerlo del campo `_id` del endpoint 7 |

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
    "pago_id": "0da485dd-...",
    "estado": "en_proceso",
    "monto": 85000,
    "servicio": "Internet ETB"
  },
  "error": null
}
```

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Factura no encontrada" }
{ "code": "INVALID_STATE_TRANSITION", "message": "No se puede crear pago para factura en estado 'extraida'. Debe estar 'validada'." }
{ "code": "INSUFFICIENT_FUNDS", "message": "Fondos insuficientes. Disponible: $0, Requerido: $120,000" }
```

---

## 14. `POST /api/solicitudes-recarga/generar` — 🆕 Generar solicitudes de recarga automáticas

### ¿Qué hace?
Analiza las facturas de una obligación y genera automáticamente solicitudes de recarga según el plan del usuario. Es el "cerebro" que le dice al usuario cuánto recargar y cuándo.

### Lógica según plan:

**Plan `control` (1 cuota):**
- Genera 1 sola solicitud por el monto total de todas las facturas
- Fecha límite = fecha de vencimiento más próxima de las facturas
- Fecha de recordatorio = 5 días antes de la fecha límite
- 🆕 Si la factura no tiene fecha_vencimiento → usa `creado_en + 15 días`

**Plan `tranquilidad` o `respaldo` (2 cuotas):**
- Divide las facturas en 2 grupos según su fecha de vencimiento:
  - **Cuota 1**: facturas que vencen del día 1 al 15 del mes
  - **Cuota 2**: facturas que vencen del día 16 al 31 del mes
- Si TODAS las facturas caen en la misma mitad del mes → divide 50/50 por monto
- 🆕 Facturas sin fecha_vencimiento se asignan según `creado_en + 15 días`
- Fecha límite de cada cuota = la fecha de vencimiento más próxima de sus facturas
- Recordatorio = 5 días antes de cada fecha límite

### Comportamiento automático:
- Genera una notificación `solicitud_recarga` con el detalle de la primera cuota
- No permite duplicar: si ya hay solicitudes activas (pendiente/parcial) para esa obligación, devuelve error 409
- Registra audit log de la operación

### ¿Cuándo usarlo?
- Después de cargar todas las facturas del mes (endpoints 6)
- Después de asignar el plan al usuario (endpoint 2)
- Generalmente una vez al mes por obligación

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `obligacion_id` | `string (UUID)` | ✅ Sí | ID de la obligación (obtenido del endpoint 3) |

**Ejemplo:**
```json
{
  "telefono": "573046757626",
  "obligacion_id": "260b7859-a392-45bc-95c9-5a7f627a93f7"
}
```

**Respuesta exitosa (201) — Plan tranquilidad con 3 facturas:**
```json
{
  "ok": true,
  "data": {
    "solicitudes": [
      {
        "id": "09e2ed08-...",
        "numero_cuota": 1,
        "total_cuotas": 2,
        "monto_solicitado": 215000,
        "fecha_limite": "2026-03-10",
        "fecha_recordatorio": "2026-03-05",
        "facturas_ids": ["7bd45f33-...", "f1bf3f36-..."],
        "estado": "pendiente",
        "plan": "tranquilidad"
      },
      {
        "id": "3e30936d-...",
        "numero_cuota": 2,
        "total_cuotas": 2,
        "monto_solicitado": 120000,
        "fecha_limite": "2026-03-22",
        "fecha_recordatorio": "2026-03-17",
        "facturas_ids": ["845a1a5c-..."],
        "estado": "pendiente",
        "plan": "tranquilidad"
      }
    ],
    "plan": "tranquilidad",
    "monto_total": 335000,
    "total_cuotas": 2
  },
  "error": null
}
```

**Respuesta exitosa (201) — Plan control con las mismas facturas:**
```json
{
  "ok": true,
  "data": {
    "solicitudes": [
      {
        "id": "a1b2c3d4-...",
        "numero_cuota": 1,
        "total_cuotas": 1,
        "monto_solicitado": 335000,
        "fecha_limite": "2026-03-10",
        "fecha_recordatorio": "2026-03-05",
        "facturas_ids": ["7bd45f33-...", "f1bf3f36-...", "845a1a5c-..."],
        "estado": "pendiente",
        "plan": "control"
      }
    ],
    "plan": "control",
    "monto_total": 335000,
    "total_cuotas": 1
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `solicitudes` | Array con cada cuota generada |
| `solicitudes[].id` | UUID de la solicitud. Usar para el endpoint 17 (cambiar fechas) |
| `solicitudes[].numero_cuota` | 1 = primera (o única) cuota, 2 = segunda cuota |
| `solicitudes[].total_cuotas` | 1 = plan control, 2 = plan tranquilidad/respaldo |
| `solicitudes[].monto_solicitado` | Cuánto debe recargar el usuario para esta cuota |
| `solicitudes[].fecha_limite` | Fecha máxima para hacer la recarga |
| `solicitudes[].fecha_recordatorio` | 5 días antes de la fecha límite. El sistema genera recordatorio automático |
| `solicitudes[].facturas_ids` | Array de UUIDs de las facturas que cubre esta cuota |
| `plan` | Plan del usuario al momento de generar |
| `monto_total` | Suma total de todas las facturas |
| `total_cuotas` | 1 o 2 según el plan |

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado con ese teléfono" }
{ "code": "NOT_FOUND", "message": "Obligación no encontrada o no pertenece al usuario" }
{ "code": "BAD_REQUEST", "message": "No hay facturas validadas o extraídas en esta obligación" }
{ "code": "BAD_REQUEST", "message": "El monto total de las facturas es 0. No se puede generar solicitud." }
{ "code": "CONFLICT_DUPLICATE", "message": "Ya existen solicitudes de recarga activas para esta obligación. Cancélalas primero si deseas regenerar." }
```

---

## 15. `GET /api/solicitudes-recarga` — 🆕 Listar solicitudes de recarga

### ¿Qué hace?
Lista todas las solicitudes de recarga de un usuario. Permite filtrar por estado y por obligación. Devuelve información completa de cada solicitud incluyendo montos, fechas, facturas asignadas y si se enviaron notificaciones/recordatorios.

### ¿Cuándo usarlo?
- Para mostrar al usuario cuánto debe recargar y para cuándo
- Para verificar si hay cuotas pendientes
- Para el dashboard del bot con el estado de las solicitudes

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario |
| `estado` | `string` | ❌ No | Filtrar: `"pendiente"`, `"parcial"`, `"cumplida"`, `"vencida"`, `"cancelada"` |
| `obligacion_id` | `string (UUID)` | ❌ No | Filtrar por obligación específica |

**Ejemplos:**
```
GET /api/solicitudes-recarga?telefono=573046757626
GET /api/solicitudes-recarga?telefono=573046757626&estado=pendiente
GET /api/solicitudes-recarga?telefono=573046757626&obligacion_id=260b7859-...
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "09e2ed08-...",
      "creado_en": "2026-03-09T16:04:24.011544+00:00",
      "usuario_id": "d630868d-...",
      "obligacion_id": "260b7859-...",
      "numero_cuota": 1,
      "total_cuotas": 2,
      "monto_solicitado": 215000,
      "monto_recargado": 0,
      "fecha_limite": "2026-03-08",
      "fecha_recordatorio": "2026-03-03",
      "estado": "pendiente",
      "facturas_ids": ["7bd45f33-...", "0c1327ce-...", "f1bf3f36-..."],
      "plan": "tranquilidad",
      "notificacion_enviada": false,
      "recordatorio_enviado": true,
      "actualizado_en": "2026-03-09T16:04:58.864+00:00"
    }
  ],
  "error": null
}
```

| Campo | Significado |
|-------|-------------|
| `monto_solicitado` | Cuánto debe recargar en total para esta cuota |
| `monto_recargado` | Cuánto ha recargado hasta ahora (para tracking parcial) |
| `estado` | `pendiente` = no ha recargado, `parcial` = recargó algo pero no todo, `cumplida` = recargó todo, `vencida` = se pasó la fecha, `cancelada` = cancelada |
| `notificacion_enviada` | Si ya se envió la notificación inicial de esta cuota |
| `recordatorio_enviado` | Si ya se envió el recordatorio de 5 días antes |

---

## 16. `POST /api/solicitudes-recarga/verificar-recordatorios` — 🆕 Verificar y generar recordatorios

### ¿Qué hace?
Busca solicitudes de recarga que están próximas a vencer (la fecha de recordatorio ya pasó o es hoy), verifica si el usuario tiene saldo suficiente para cubrirlas, y si NO tiene saldo suficiente genera una notificación `recordatorio_recarga` para que el bot la envíe por WhatsApp.

> **🆕 Nota:** El cron job diario (9:00 AM) ya ejecuta esta verificación automáticamente para TODOS los usuarios. Este endpoint es útil como respaldo o para verificar un usuario específico bajo demanda.

### Lógica detallada:
1. Busca solicitudes en estado `pendiente` o `parcial` donde `recordatorio_enviado = false` Y `fecha_recordatorio <= hoy`
2. Para cada solicitud encontrada:
   a. Calcula el saldo disponible del usuario (recargas aprobadas - pagos pagados)
   b. Calcula cuánto le falta recargar (`monto_solicitado - monto_recargado`)
   c. Si el saldo disponible < monto faltante → genera notificación `recordatorio_recarga`
   d. Marca `recordatorio_enviado = true` para no enviar duplicados
3. Si el usuario ya tiene saldo suficiente → NO genera recordatorio

### ¿Cuándo usarlo?
- 🆕 **Ya no es obligatorio llamarlo periódicamente** — el cron job diario lo hace automáticamente para todos los usuarios
- Útil si quieres forzar una verificación inmediata para un usuario específico
- Es seguro llamarlo múltiples veces: no genera recordatorios duplicados gracias al flag `recordatorio_enviado`

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | `string` | ✅ Sí | Teléfono del usuario a verificar |

**Ejemplo:**
```json
{
  "telefono": "573046757626"
}
```

**Respuesta exitosa — Se generaron recordatorios (200):**
```json
{
  "ok": true,
  "data": {
    "recordatorios_generados": 1,
    "detalle": [
      {
        "solicitud_id": "09e2ed08-...",
        "monto_faltante": 215000,
        "fecha_limite": "2026-03-08"
      }
    ]
  },
  "error": null
}
```

**Respuesta exitosa — No se necesitan recordatorios (200):**
```json
{
  "ok": true,
  "data": {
    "recordatorios_generados": 0,
    "detalle": []
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `recordatorios_generados` | Cantidad de recordatorios nuevos creados |
| `detalle[].solicitud_id` | ID de la solicitud que generó el recordatorio |
| `detalle[].monto_faltante` | Cuánto le falta recargar al usuario (después de restar saldo disponible) |
| `detalle[].fecha_limite` | Fecha máxima para la recarga |

> Las notificaciones generadas aparecerán en el endpoint 10 (`GET /api/notificaciones/pendientes/:telefono`) con tipo `recordatorio_recarga`.

---

## 17. `PUT /api/solicitudes-recarga/:id/fechas` — 🆕 Personalizar fechas de cuotas

### ¿Qué hace?
Permite al usuario cambiar las fechas límite de sus cuotas de recarga. Por defecto las cuotas se calculan automáticamente según las fechas de vencimiento de las facturas, pero el usuario puede personalizarlas.

### Comportamiento:
- Si se envían `fecha_cuota_1` Y `fecha_cuota_2` y la solicitud es de 2 cuotas → actualiza AMBAS solicitudes de esa obligación
- Si solo se envía una fecha → actualiza solo la cuota correspondiente
- Recalcula automáticamente la `fecha_recordatorio` (5 días antes de la nueva fecha)
- Resetea `recordatorio_enviado` a `false` para que se envíe un nuevo recordatorio con la fecha actualizada
- Solo se pueden modificar solicitudes en estado `pendiente` o `parcial`

### ¿Cuándo usarlo?
- Cuando el usuario dice "quiero pagar la primera cuota el día 5 en vez del día 10"
- Para ajustar las fechas a la conveniencia del usuario

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**URL Params:**
- `:id` = UUID de cualquiera de las solicitudes de esa obligación

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_cuota_1` | `string` | ❌ No | Nueva fecha límite para la cuota 1. Formato `"YYYY-MM-DD"` |
| `fecha_cuota_2` | `string` | ❌ No | Nueva fecha límite para la cuota 2. Formato `"YYYY-MM-DD"` |

> Debe enviarse al menos una de las dos fechas.

**Ejemplo — Cambiar ambas fechas:**
```json
{
  "fecha_cuota_1": "2026-03-05",
  "fecha_cuota_2": "2026-03-18"
}
```

**Ejemplo — Cambiar solo cuota 1:**
```json
{
  "fecha_cuota_1": "2026-03-05"
}
```

**Respuesta exitosa — Ambas cuotas actualizadas (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "09e2ed08-...",
      "numero_cuota": 1,
      "total_cuotas": 2,
      "monto_solicitado": 215000,
      "fecha_limite": "2026-03-05",
      "fecha_recordatorio": "2026-02-28",
      "estado": "pendiente",
      "recordatorio_enviado": false,
      "actualizado_en": "2026-03-09T..."
    },
    {
      "id": "3e30936d-...",
      "numero_cuota": 2,
      "total_cuotas": 2,
      "monto_solicitado": 120000,
      "fecha_limite": "2026-03-18",
      "fecha_recordatorio": "2026-03-13",
      "estado": "pendiente",
      "recordatorio_enviado": false,
      "actualizado_en": "2026-03-09T..."
    }
  ],
  "error": null
}
```

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Solicitud no encontrada" }
{ "code": "BAD_REQUEST", "message": "Solo se pueden modificar solicitudes pendientes o parciales" }
```

---

---

## 🔄 Flujo Completo con Todos los Actores (Paso a Paso)

```
═══════════════════════════════════════════════════════════
 FASE 1: REGISTRO Y CONFIGURACIÓN (Bot ↔ Usuario)
═══════════════════════════════════════════════════════════

1. USUARIO LLEGA POR WHATSAPP
   └─ POST /api/users/upsert → registrar usuario
   └─ (guardar usuario_id)

2. ELIGE PLAN
   └─ PUT /api/users/plan → asignar plan (control / tranquilidad / respaldo)

3. CREAR OBLIGACIÓN DEL MES
   └─ POST /api/obligaciones → crear compromiso mensual
   └─ (guardar obligacion_id)

4. CARGAR FACTURAS (una por cada servicio)
   └─ POST /api/facturas/captura → Internet ETB
   └─ POST /api/facturas/captura → Gas Vanti
   └─ POST /api/facturas/captura → Energía Enel
   └─ (repetir por cada servicio)

5. GENERAR SOLICITUDES DE RECARGA AUTOMÁTICAS
   └─ POST /api/solicitudes-recarga/generar
   └─ (calcula cuánto y cuándo recargar según el plan)
   └─ (genera notificación automática al usuario)

═══════════════════════════════════════════════════════════
 FASE 2: EVALUACIÓN AUTOMÁTICA (Cron Jobs del Sistema)
═══════════════════════════════════════════════════════════

6. ⚙️ CRON JOB 9:00 AM — jobEvaluacionRecargas
   └─ Evalúa TODAS las obligaciones activas
   └─ Para cada una: calcula montos, verifica saldo
   └─ Detecta si es primera recarga del mes
   └─ Genera notificación tipo:
      • "solicitud_recarga_inicio_mes" (primera del mes)
      • "solicitud_recarga" (genérica)
   └─ Previene duplicados con existeNotificacionHoy()
   └─ (NO requiere acción del bot — completamente automático)

7. ⚙️ CRON JOB CADA 6 HORAS — jobVerificarInactividad
   └─ Busca notificaciones de cobro enviadas hace 24-48h
   └─ Verifica si el usuario hizo alguna recarga después
   └─ Si NO hay recarga → crea alerta_admin (usuario_id: null)
   └─ Admin las ve en: GET /api/notificaciones/admin/alertas

═══════════════════════════════════════════════════════════
 FASE 3: RECARGA Y APROBACIÓN (Bot ↔ Usuario ↔ Admin)
═══════════════════════════════════════════════════════════

8. BOT ENTREGA NOTIFICACIONES AL USUARIO
   └─ GET /api/notificaciones/pendientes/:telefono
   └─ ⚡ Las notificaciones se marcan como "enviada" AUTOMÁTICAMENTE
   └─ Bot lee payload.mensaje y envía por WhatsApp
   └─ ✅ NO necesita llamar batch-enviadas

9. USUARIO RECARGA DINERO
   └─ POST /api/recargas/reportar → reportar con comprobante
   └─ (queda en_validacion + se crea revisión administrativa)

10. ADMIN VALIDA COMPROBANTE
    └─ PUT /api/recargas/:id/aprobar
    └─ 🧹 Auto-limpieza automática:
       a. Cancela notificaciones de cobro pendientes del usuario
       b. Actualiza solicitudes_recarga a 'cumplida' o 'parcial'
       c. Crea notificación "recarga_aprobada"
       d. Crea notificación "recarga_confirmada" con saldo actualizado
    └─ O si rechaza: PUT /api/recargas/:id/rechazar
       └─ Crea notificación "recarga_rechazada" con motivo

11. BOT ENTREGA CONFIRMACIÓN
    └─ GET /api/notificaciones/pendientes/:telefono
    └─ Recibe notificación "recarga_confirmada" con saldo
    └─ Envía por WhatsApp al usuario

═══════════════════════════════════════════════════════════
 FASE 4: PAGOS Y SEGUIMIENTO
═══════════════════════════════════════════════════════════

12. VERIFICAR SALDO
    └─ GET /api/disponible?telefono=X&periodo=X

13. CREAR PAGOS (cuando hay facturas validadas + saldo suficiente)
    └─ POST /api/pagos/crear → pago para factura validada

14. CONSULTAR ESTADO GENERAL
    └─ GET /api/obligaciones?telefono=X → ver obligaciones y progreso
    └─ GET /api/facturas/obligacion/:id → ver detalle de facturas
    └─ GET /api/solicitudes-recarga?telefono=X → ver cuotas pendientes

15. ADMIN CONSULTA ALERTAS (usuarios sin respuesta)
    └─ GET /api/notificaciones/admin/alertas

16. PERSONALIZAR FECHAS (si el usuario lo solicita)
    └─ PUT /api/solicitudes-recarga/:id/fechas

17. VERIFICAR RECORDATORIOS MANUALMENTE (opcional, el cron ya lo hace)
    └─ POST /api/solicitudes-recarga/verificar-recordatorios
```

---

## 💡 Ejemplo Completo: Caso Real

### Escenario: Carlos tiene plan tranquilidad, 3 facturas en marzo

**1. Registrar usuario:**
```json
POST /api/users/upsert
{ "telefono": "573001234567", "nombre": "Carlos", "apellido": "Pérez" }
→ { "usuario_id": "d630868d-...", "creado": true }
```

**2. Asignar plan:**
```json
PUT /api/users/plan
{ "telefono": "573001234567", "plan": "tranquilidad" }
→ { "plan_nuevo": "tranquilidad" }
```

**3. Crear obligación:**
```json
POST /api/obligaciones
{ "telefono": "573001234567", "descripcion": "Pagos Marzo 2026", "periodo": "2026-03-01" }
→ { "id": "260b7859-..." }
```

**4. Cargar facturas:**
```json
POST /api/facturas/captura
{ "telefono": "573001234567", "obligacion_id": "260b7859-...", "servicio": "Internet ETB", "monto": 85000, "fecha_vencimiento": "2026-03-10", "referencia_pago": "ETB-001", "etiqueta": "internet" }
→ Internet $85,000 — vence 10 marzo (1ra mitad)

POST /api/facturas/captura
{ ... "servicio": "Gas Vanti", "monto": 45000, "fecha_vencimiento": "2026-03-12", "referencia_pago": "VANTI-001", "etiqueta": "gas" }
→ Gas $45,000 — vence 12 marzo (1ra mitad)

POST /api/facturas/captura
{ ... "servicio": "Energía Enel", "monto": 120000, "fecha_vencimiento": "2026-03-22", "referencia_pago": "ENEL-001", "etiqueta": "energia" }
→ Energía $120,000 — vence 22 marzo (2da mitad)
```

**5. Generar solicitudes de recarga:**
```json
POST /api/solicitudes-recarga/generar
{ "telefono": "573001234567", "obligacion_id": "260b7859-..." }
→ Resultado:
   Cuota 1: $130,000 (Internet + Gas) — límite: 10 marzo — recordatorio: 5 marzo
   Cuota 2: $120,000 (Energía)         — límite: 22 marzo — recordatorio: 17 marzo
```

**6. El bot envía la notificación:** "Hola Carlos, tu primera cuota es de $130,000. Fecha límite: 2026-03-10. Cuota 1 de 2."

**7. Carlos recarga $130,000 por Nequi → admin aprueba → saldo disponible: $130,000**

**8. Bot crea pagos para Internet y Gas → saldo disponible: $0**

**9. Bot verifica recordatorios el 17 de marzo → detecta que Carlos no tiene saldo para la cuota 2 → genera notificación:** "Recuerda que tienes una recarga pendiente de $120,000 antes del 2026-03-22. Cuota 2 de 2."

**10. Carlos recarga $120,000 → admin aprueba → bot paga Energía Enel → ¡Obligación completada!**

---

## ⚙️ Sistema Automático de Evaluación (Cron Job)

### ¿Qué es?
El servidor ejecuta automáticamente un **cron job diario a las 9:00 AM** (hora del servidor) que evalúa todas las obligaciones activas, recalcula solicitudes de recarga y genera notificaciones sin intervención del bot ni del admin.

### ¿Qué hace el cron job?

**Job principal — `jobEvaluacionRecargas` (9:00 AM diario):**

```
Por cada obligación activa en el sistema:
  1. Obtener facturas validadas/extraídas
  2. Calcular fecha de recordatorio por factura:
     - Si tiene fecha_vencimiento → vencimiento - 5 días
     - Si NO tiene fecha_vencimiento → creado_en + 15 días
  3. Si hoy < fecha_recordatorio → solo actualizar solicitud (sin notificación)
  4. Si hoy ≥ fecha_recordatorio:
     a. Calcular monto pendiente = total facturas - saldo usuario
     b. Si monto pendiente ≤ 0 → marcar solicitud como "cumplida"
     c. Si monto pendiente > 0 → crear/actualizar solicitud
  5. Detectar si es la primera recarga del mes del usuario
  6. Verificar si ya se envió notificación hoy (evitar duplicados)
  7. Si no se envió → crear notificación:
     - Primera recarga del mes → tipo "solicitud_recarga_inicio_mes"
     - Recargas posteriores → tipo "solicitud_recarga"
```

**Job completo — `jobRecordatoriosCompleto`:**
1. Recalcula TODAS las solicitudes activas (por si cambiaron facturas)
2. Verifica recordatorios globales para TODOS los usuarios

**Job 2 — `jobVerificarInactividad` (cada 6 horas):**

```
1. Calcular rango temporal: 24h a 48h atrás
2. Buscar notificaciones tipo 'solicitud_recarga' o 'solicitud_recarga_inicio_mes'
   con estado 'enviada' creadas en ese rango
3. Para cada notificación:
   a. Verificar si ya existe una alerta para esta notificación (evitar duplicados)
   b. Buscar recargas del usuario posteriores a la notificación
   c. Si NO hay recarga → crearAlertaAdmin()
      → Crea notificación tipo 'alerta_admin' con usuario_id: null
      → Incluye: nombre usuario, teléfono, periodo, días sin respuesta
4. Las alertas aparecen en: GET /api/notificaciones/admin/alertas (endpoint 20)
```

### ¿Qué significa para el bot?
- **No necesita llamar al endpoint 16 periódicamente** → el cron job lo hace automáticamente
- El bot solo necesita **consultar las notificaciones pendientes** (endpoint 10) y enviarlas
- Las notificaciones de tipo `solicitud_recarga_inicio_mes` y `solicitud_recarga` aparecerán automáticamente en el endpoint 10
- Las alertas de inactividad (`alerta_admin`) **NO aparecen** en el endpoint 10 — son exclusivas del admin

### Protecciones:
- ✅ No genera notificaciones duplicadas el mismo día (`existeNotificacionHoy`)
- ✅ Control de concurrencia (un solo job ejecutándose a la vez)
- ✅ Si node-cron no está instalado, el servidor arranca sin jobs (degradación elegante)
- ✅ Los montos de solicitudes se recalculan automáticamente cuando cambian las facturas
- ✅ Job de inactividad verifica que no exista alerta previa antes de crear una nueva
- ✅ Solo detecta inactividad entre 24-48h (no alerta repetidamente)

---

## 📨 Plantillas de Mensajes Automáticos

Las notificaciones generadas por el sistema incluyen mensajes formateados listos para enviar por WhatsApp. El bot debe leer `payload.mensaje` y enviarlo tal cual.

### Tipo: `solicitud_recarga_inicio_mes`
Se genera al inicio de cada mes cuando el usuario tiene obligaciones activas. Incluye resumen del mes anterior y detalle del nuevo mes.

**Ejemplo de `payload.mensaje`:**
```
Hola Carlos ✌🏼
Arrancamos mes!

En Febrero 2026 pagaste "$ 162,000" y tienes un saldo de "$ 70,000"

Para Marzo 2026, tus obligaciones suman "$ 250,000", así:

"@EPM Energía": "$ 120,000".
"@Internet ETB": "$ 85,000".
"@Gas Vanti": "$ 45,000".

La recarga total sugerida para Marzo 2026 es de "$ 180,000".

Puedes hacer la recarga a la llave 0090944088.

Apenas la hagas, me envías el comprobante y yo me encargo del resto deOne! 🙌🏼
```

### Tipo: `solicitud_recarga` (genérico)
Se genera cuando el usuario tiene obligaciones pendientes (no es inicio de mes).

**Ejemplo de `payload.mensaje`:**
```
Hola Carlos! 👋🏼
Ya estamos listos para recibir tu recarga, con la que cubriremos:
"@EPM Energía": "$ 120,000".
"@Internet ETB": "$ 85,000".
"@Gas Vanti": "$ 45,000".

Total: "$ 250,000"
Aplicamos tu saldo: "$ 50,000"

Total a recargar: "$ 200,000".
Puedes hacer la recarga a la llave 0090944088.

Apenas la hagas, me envías el comprobante y yo me encargo del resto deOne! 🙌🏼
```

### Tipo: `recarga_confirmada`
Se genera automáticamente cuando el admin aprueba una recarga del usuario.

**Ejemplo de `payload.mensaje`:**
```
Recibido, Carlos ✌🏼

Ya registré tu recarga. Tu saldo disponible en deOne es de $ 130,000
```

### Datos que incluye `payload` en notificaciones automáticas:

| Campo en `payload` | Descripción |
|--------------------|-------------|
| `mensaje` | Texto completo formateado, listo para enviar por WhatsApp |
| `tipo_mensaje` | `"inicio_mes"` \| `"generico"` \| `"confirmada"` |
| `nombre_usuario` | Nombre del usuario |
| `mes_actual` | Nombre del mes actual (ej: "Marzo 2026") |
| `mes_anterior` | Nombre del mes anterior (ej: "Febrero 2026") |
| `obligaciones` | Array de objetos `{ etiqueta, monto }` — cada factura como obligación |
| `total_obligaciones` | Suma total de todas las facturas |
| `saldo_actual` | Saldo actual del usuario |
| `valor_a_recargar` | Diferencia: total_obligaciones - saldo_actual |
| `es_primera_recarga` | `true` si es la primera recarga del mes |
| `obligacion_id` | ID de la obligación relacionada |
| `periodo` | Periodo de la obligación (ej: "2026-03-01") |

> **Llave de recarga:** `0090944088` — Esta llave aparece en los mensajes automáticos para que el usuario sepa dónde recargar.

---

## 18. `PUT /api/recargas/:id/aprobar` — Admin aprueba recarga

### ¿Qué hace?
El admin valida el comprobante de recarga y aprueba la operación. Ejecuta automáticamente una serie de acciones de limpieza.

**Auth:** `x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3`

**URL Params:** `:id` = UUID de la recarga

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `observaciones_admin` | `string` | ❌ No | Notas del admin sobre la verificación |

**Ejemplo:**
```json
{ "observaciones_admin": "Comprobante Nequi verificado correctamente, monto coincide" }
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "id": "974bad6d-...",
    "usuario_id": "7f98125c-...",
    "periodo": "2026-03-01",
    "monto": 200000,
    "estado": "aprobada",
    "comprobante_url": "https://storage...",
    "validada_por": "admin-001",
    "validada_en": "2026-03-12T10:30:15.123Z",
    "observaciones_admin": "Comprobante Nequi verificado correctamente, monto coincide"
  },
  "error": null
}
```

### 🧹 Acciones automáticas al aprobar (Auto-limpieza):
1. **Valida transición** de estado (`en_validacion` → `aprobada`)
2. **Cierra revisión administrativa** asociada (estado → `resuelta`)
3. **Crea notificación `recarga_aprobada`** con monto y periodo
4. **Crea notificación `recarga_confirmada`** con mensaje personalizado y saldo actualizado
5. **Cancela notificaciones de cobro pendientes** del usuario:
   - Busca notificaciones tipo `solicitud_recarga` / `solicitud_recarga_inicio_mes` en estado `pendiente` o `enviada`
   - Las cambia a estado `cancelada` con `payload.cancelacion = { cancelada_por: 'aprobar_recarga', recarga_aprobada_id: '...' }`
6. **Actualiza solicitudes de recarga** del usuario:
   - Suma el monto de la recarga a `monto_recargado`
   - Si `monto_recargado >= monto_solicitado` → estado `cumplida`
   - Si no → estado `parcial`
7. **Registra audit log**

**Errores posibles:**
```json
{ "code": "NOT_FOUND", "message": "Recarga no encontrada" }
{ "code": "INVALID_STATE_TRANSITION", "message": "No se puede aprobar recarga en estado 'aprobada'. Debe estar en 'en_validacion'." }
```

---

## 19. `PUT /api/recargas/:id/rechazar` — Admin rechaza recarga

### ¿Qué hace?
El admin rechaza una recarga (comprobante borroso, monto incorrecto, etc.).

**Auth:** `x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3`

**URL Params:** `:id` = UUID de la recarga

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_rechazo` | `string` | ✅ Sí | Razón del rechazo |

**Ejemplo:**
```json
{ "motivo_rechazo": "Comprobante borroso, no se puede verificar el monto" }
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "id": "676b3c7e-...",
    "estado": "rechazada",
    "motivo_rechazo": "Comprobante borroso, no se puede verificar el monto"
  },
  "error": null
}
```

### Acciones automáticas al rechazar:
1. Valida transición de estado (`en_validacion` → `rechazada`)
2. Cierra revisión administrativa asociada
3. Crea notificación `recarga_rechazada` con el motivo
4. Registra audit log

---

## 20. `GET /api/notificaciones/admin/alertas` — Alertas para el admin

### ¿Qué hace?
Devuelve todas las alertas pendientes generadas por el job de inactividad. Estas alertas indican usuarios que recibieron notificación de cobro pero no respondieron en 24 horas.

**Auth:** `x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3`

**Ejemplo:**
```
GET /api/notificaciones/admin/alertas
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "creado_en": "2026-03-12T15:00:00.000Z",
      "usuario_id": null,
      "tipo": "alerta_admin",
      "canal": "sistema",
      "payload": {
        "tipo_alerta": "usuario_sin_respuesta",
        "mensaje": "El usuario Juan Pérez (3001112233) no ha respondido a la solicitud de recarga hace más de 24 horas.",
        "usuario_id": "7f98125c-...",
        "usuario_nombre": "Juan Pérez",
        "usuario_telefono": "3001112233",
        "notificacion_cobro_id": "716d4170-...",
        "periodo": "2026-03-01",
        "dias_sin_respuesta": 1,
        "fecha_deteccion": "2026-03-12T15:00:00.000Z"
      },
      "estado": "pendiente"
    }
  ],
  "error": null
}
```

| Campo en `payload` | Significado |
|--------------------|-------------|
| `tipo_alerta` | Siempre `"usuario_sin_respuesta"` |
| `usuario_id` | UUID del usuario que no respondió |
| `usuario_nombre` | Nombre del usuario |
| `usuario_telefono` | Teléfono del usuario |
| `notificacion_cobro_id` | ID de la notificación de cobro que no fue respondida |
| `dias_sin_respuesta` | Días sin respuesta (mínimo 1) |

> **Nota:** Las alertas se crean con `usuario_id: null` en la tabla para que el endpoint 10 (pendientes por teléfono) NO las devuelva al bot. Solo son visibles en este endpoint de admin.

---

## 21. `GET /api/notificaciones` — Listar todas las notificaciones (admin)

### ¿Qué hace?
Lista todas las notificaciones del sistema con datos del usuario. Permite filtrar por teléfono, tipo, estado y paginar.

**Auth:** `x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3`

**Query Params (todos opcionales):**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `telefono` | `string` | Filtrar por usuario |
| `tipo` | `string` | Filtrar por tipo de notificación |
| `estado` | `string` | Filtrar: `pendiente`, `enviada`, `fallida`, `leida`, `cancelada` |
| `limit` | `number` | Máximo resultados (1-100, default: 50) |
| `offset` | `number` | Para paginación (default: 0) |

**Ejemplo:**
```
GET /api/notificaciones?estado=pendiente
GET /api/notificaciones?telefono=3001112233&tipo=solicitud_recarga
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "notificaciones": [
      {
        "id": "7cc2d2eb-...",
        "usuario_id": "d630868d-...",
        "tipo": "solicitud_recarga_inicio_mes",
        "canal": "whatsapp",
        "estado": "enviada",
        "payload": { "mensaje": "Hola Carlos ✌🏼 ..." },
        "creado_en": "2026-03-12T14:00:00.000Z",
        "usuarios": {
          "nombre": "Carlos",
          "apellido": "Pérez",
          "telefono": "573001234567"
        }
      }
    ],
    "total": 5,
    "limit": 50,
    "offset": 0
  },
  "error": null
}
```

---

## 📅 Manejo de Facturas sin Fecha de Vencimiento

Cuando una factura no tiene `fecha_vencimiento` (es `null`), el sistema usa la siguiente lógica alternativa:

| Situación | Cálculo de fecha_recordatorio |
|-----------|------------------------------|
| Factura **con** `fecha_vencimiento` | `fecha_vencimiento - 5 días` |
| Factura **sin** `fecha_vencimiento` | `creado_en + 15 días` (se calcula el día en el mes actual) |

**Ejemplo:**
- Factura creada el 28 de febrero sin fecha de vencimiento
- `28 + 15 = 43` → como febrero tiene 28 días → `43 - 28 = 15`
- Fecha de recordatorio = **15 de marzo**

Este cálculo es importante porque:
- Las facturas heredadas o capturadas sin fecha de vencimiento no se quedan sin recordatorio
- El sistema rota automáticamente al siguiente mes si el cálculo supera los días del mes actual
- Aplica tanto para el cron job como para la generación manual de solicitudes

---

## 🔁 Recálculo Automático de Solicitudes

Cuando las facturas de una obligación cambian (se agregan, validan, o rechazan), el sistema **recalcula automáticamente** las solicitudes de recarga:

1. Obtiene todas las facturas válidas (validadas/extraídas) de la obligación
2. Si no hay facturas → cancela todas las solicitudes pendientes
3. Recalcula el `monto_solicitado` distribuyendo las facturas según el plan:
   - **control**: 1 cuota con el monto total
   - **tranquilidad/respaldo**: 2 cuotas distribuidas por fecha de vencimiento
4. Actualiza `fecha_limite` y `fecha_recordatorio`
5. Solo resetea `recordatorio_enviado` cuando la `fecha_recordatorio` realmente cambió (evita re-enviar recordatorios innecesariamente)

Este recálculo ocurre:
- Automáticamente en el cron job diario
- Cuando se ejecuta `recalcularSolicitudesPorObligacion(obligacionId)` internamente

---

## 🗂️ Detalle Técnico de los Cron Jobs

### Job 1: `jobEvaluacionRecargas()`
- **Archivo:** `src/jobs/recordatorios.job.js`
- **Programación:** `cron.schedule("0 9 * * *", ...)` — 9:00 AM diario
- **Protecciones:**
  - Lock concurrente con `isJobRunning` (previene ejecuciones paralelas)
  - Verificación de duplicados con `existeNotificacionHoy()`
  - Detección primera recarga del mes con `detectarPrimeraRecargaDelMes()`

**Secuencia de ejecución:**
```
1. obtenerObligacionesActivas() → Lista de obligaciones estado 'activa'
2. FOR cada obligación:
   a. evaluarObligacion() → Calcula monto pendiente
   b. detectarPrimeraRecargaDelMes() → Determina tipo mensaje
   c. existeNotificacionHoy() → Evita duplicados diarios
   d. prepararDatosNotificacion() → Construye payload con obligaciones
   e. crearNotificacionRecarga() → Inserta notificación (estado 'pendiente')
3. Retorna resumen: procesadas, creadas, errores
```

### Job 2: `jobVerificarInactividad()`
- **Archivo:** `src/modules/notificaciones/notificaciones.service.js`
- **Programación:** `cron.schedule("0 */6 * * *", ...)` — Cada 6 horas
- **Diferenciación temporal:**
  - Cada 6h = Frecuencia de ejecución
  - 24h = Umbral para considerar "sin respuesta"
  - No envía alertas cada ejecución — solo cuando detecta casos nuevos

**Lógica de detección:**
```
1. Rango: notificaciones enviadas 24-48h atrás
2. Tipos: 'solicitud_recarga' | 'solicitud_recarga_inicio_mes'
3. Estado: 'enviada'
4. VERIFICA: ¿Ya existe alerta para esta notificación? → Si sí, omitir
5. VERIFICA: ¿Hay recargas después del mensaje?
   → Si NO → crearAlertaAdmin() con usuario_id: null
```

### Job 3: `jobRecordatoriosCompleto()`
- **Archivo:** `src/jobs/recordatorios.job.js`
- **Uso:** Se puede ejecutar manualmente para recalcular todo
- **Pasos:**
  1. `recalcularTodasSolicitudes()` — Recalcula montos de solicitudes activas
  2. `verificarRecordatoriosGlobal()` — Envía recordatorios a todos los usuarios

---

## 📊 Resumen Completo de Estados del Sistema

### Recargas:
```
en_validacion → aprobada | rechazada
```

### Notificaciones:
```
pendiente → enviada → leida
          ↘ cancelada (por auto-limpieza)
          ↘ fallida
```

### Solicitudes de Recarga:
```
pendiente → parcial → cumplida
          ↘ vencida
          ↘ cancelada
```

### Facturas:
```
extraida → validada → pagada
   ↓          ↓
en_revision   rechazada
   ↓
validada → pagada
```

### Obligaciones:
```
activa → en_progreso → completada
       ↘ cancelada
```

### Pagos:
```
en_proceso → pagado | fallido
```

### Revisiones Admin:
```
pendiente → resuelta | descartada
```

---

## 🆕 2a. `DELETE /api/users/:id` (o `/api/users?telefono=XXX`) — Eliminar usuario

### ¿Qué hace?
Elimina un usuario del sistema. Por defecto realiza **soft delete** (marca `activo=false` preservando todo el historial). Con `?hard=true` realiza **hard delete** físico, lo cual elimina en cascada ajustes, obligaciones, facturas, recargas, pagos, revisiones y solicitudes_recarga (las notificaciones quedan con `usuario_id=NULL` para histórico).

### ¿Cuándo usarlo?
- Soft delete: cuando un usuario se da de baja pero se desea conservar histórico contable.
- Hard delete: solo para depuración / GDPR / pruebas. **No recomendado en producción** si hay datos financieros.

### Auth
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```
> Solo admin. Bot key NO autoriza este endpoint.

### Variantes
- `DELETE /api/users/:id` — borra por UUID
- `DELETE /api/users?telefono=573046757626` — borra por teléfono

### Query params

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `hard` | `boolean` | `false` | Si `true`, borra físicamente la fila (cascada) |
| `force` | `boolean` | `false` | Si `true`, ignora restricciones (obligaciones activas / pagos confirmados) |

### Reglas / Restricciones

| Caso | Comportamiento |
|------|----------------|
| Soft delete sobre usuario ya inactivo | Devuelve 200 con mensaje "ya estaba inactivo" (idempotente) |
| Soft/Hard con obligaciones `activa` o `en_progreso` | **Bloqueado** con `INVALID_STATE_TRANSITION`. Usar `?force=true` para forzar |
| Hard delete con pagos en estado `pagado`/`en_proceso` | **Bloqueado** por integridad financiera. Usar `?force=true` para forzar |

### Ejemplo — Soft delete por teléfono
```
DELETE /api/users?telefono=573046757626
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "telefono": "573046757626",
    "modo": "soft",
    "eliminado": true,
    "activo": false
  },
  "error": null
}
```

### Ejemplo — Hard delete forzado
```
DELETE /api/users/49f3c602-80c8-4c59-9ee6-a005bbb86f08?hard=true&force=true
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
    "telefono": "573046757626",
    "modo": "hard",
    "eliminado": true
  },
  "error": null
}
```

### Errores posibles
```json
{ "code": "NOT_FOUND", "message": "Usuario no encontrado" }
{ "code": "INVALID_STATE_TRANSITION", "message": "El usuario tiene 2 obligación(es) activa(s)/en progreso. Use ?force=true para eliminar de todos modos." }
{ "code": "INVALID_STATE_TRANSITION", "message": "El usuario tiene 5 pago(s) confirmado(s). Hard delete bloqueado por integridad financiera. Use ?force=true para forzar." }
{ "code": "BAD_REQUEST", "message": "Debe indicar id o telefono" }
```

### Auditoría
Cada operación queda registrada en `audit_log` con `accion = "soft_delete_usuario"` o `"hard_delete_usuario"`, incluyendo el snapshot del usuario antes del cambio.

---

## 🆕 5a. `DELETE /api/obligaciones/:id` — Eliminar obligación

### ¿Qué hace?
Elimina una obligación (compromiso mensual). Es **hard delete** con restricciones estrictas para proteger datos financieros. Las solicitudes de recarga asociadas se eliminan automáticamente por CASCADE en BD; las facturas requieren cascada explícita con `?force=true`.

### ¿Cuándo usarlo?
- Para corregir obligaciones creadas por error que aún no tienen pagos.
- Para limpiar periodos de prueba.

### Auth
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```
> Solo admin.

### Query params

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `force` | `boolean` | `false` | Si `true`, elimina en cascada las facturas no protegidas |

### Reglas / Restricciones

| Caso | Comportamiento |
|------|----------------|
| Existe ≥1 factura en estado `pagada` o `validada` | **Bloqueado SIEMPRE** (ni siquiera `force=true` lo permite) — protege integridad contable |
| Hay facturas en otros estados (`extraida`, `en_revision`, `rechazada`) y `force=false` | Bloqueado con sugerencia de usar `?force=true` |
| `force=true` y solo facturas no protegidas | Borra primero las facturas, luego la obligación |
| Sin facturas asociadas | Elimina directamente |

### Ejemplo — Sin facturas
```
DELETE /api/obligaciones/86a0c709-3ca9-41bc-9106-226cac7cf4ba
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
    "eliminada": true,
    "facturas_eliminadas": 0
  },
  "error": null
}
```

### Ejemplo — Con facturas (force)
```
DELETE /api/obligaciones/86a0c709-3ca9-41bc-9106-226cac7cf4ba?force=true
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
    "eliminada": true,
    "facturas_eliminadas": 3
  },
  "error": null
}
```

### Errores posibles
```json
{ "code": "NOT_FOUND", "message": "Obligación no encontrada" }
{ "code": "INVALID_STATE_TRANSITION", "message": "No se puede eliminar: la obligación tiene 1 factura(s) pagada(s)/validada(s). Esta acción está bloqueada por integridad financiera." }
{ "code": "INVALID_STATE_TRANSITION", "message": "La obligación tiene 3 factura(s) asociada(s). Use ?force=true para eliminarlas en cascada." }
```

### Auditoría
Cada eliminación se registra en `audit_log` con `accion = "eliminar_obligacion"` y snapshot completo de la obligación + cantidad de facturas eliminadas.

---

## 🆕 7a. `DELETE /api/facturas/:id` — Eliminar factura

### ¿Qué hace?
Elimina una factura **sin importar su estado** (extraida, en_revision, validada, pagada o rechazada). Antes de borrar la factura, elimina automáticamente los pagos asociados (la FK `pagos.factura_id` es `ON DELETE RESTRICT`). Las revisiones_admin asociadas se eliminan por CASCADE. Tras el borrado, recalcula los contadores de la obligación contenedora.

### ¿Cuándo usarlo?
- Limpieza administrativa de facturas duplicadas o incorrectas.
- Corrección de errores de captura.
- Borrado forzado durante pruebas.

> ⚠️ **Atención:** Si la factura tiene pagos confirmados, esos pagos también se eliminan. Esto puede afectar el saldo disponible del usuario. Úselo con criterio.

### Auth
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```
> Solo admin.

### Ejemplo
```
DELETE /api/facturas/63dd4b3b-9e6c-43b1-a6b6-ff5858554733
```

**Respuesta exitosa (200):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733",
    "eliminada": true,
    "estado_anterior": "pagada",
    "pagos_eliminados": 1,
    "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba"
  },
  "error": null
}
```

| Campo respuesta | Significado |
|-----------------|-------------|
| `estado_anterior` | Estado en que se encontraba la factura antes de borrarla |
| `pagos_eliminados` | Cantidad de pagos asociados que se borraron en cascada |
| `obligacion_id` | Obligación a la que pertenecía (sus contadores se recalculan automáticamente) |

### Errores posibles
```json
{ "code": "NOT_FOUND", "message": "Factura no encontrada" }
```

### Auditoría
Cada eliminación queda registrada en `audit_log` con `accion = "eliminar_factura"`, snapshot completo de la factura y la cantidad de pagos eliminados.
