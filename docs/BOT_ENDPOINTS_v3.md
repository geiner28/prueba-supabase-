# DeOne Backend — API para Bot WhatsApp
**Versión 3.2 — Notificaciones simplificadas** ✅ ACTUALIZADA  
**Base URL:** `https://prueba-supabase.onrender.com/api`  
**Clasificación:** Documento Técnico Confidencial

---

## 📋 Cambios en v3.2

- ✅ **Endpoint único para el bot:** `GET /api/notificaciones/bot/campanias` reemplaza a `/pendientes/:telefono` y `/pendientes-hoy`.
- ✅ **Mensaje pre-renderizado:** la respuesta entrega `{ telefono, mensaje, ids, tipo, ... }` con el texto ya listo para enviar. El bot no construye nada.
- ✅ **Solo 3 tipos** de mensaje al usuario: `solicitud_recarga`, `obligacion_cumplida`, `obligaciones_pagadas_grupal` (agrupación automática ≤ 30 min).
- ✅ **Doble timestamp:** `enviada_en` (sistema, al consumir la cola) + `entregada_en` (bot, vía `POST /bot/entregadas`).
- ✅ Endpoints legacy se marcan como deprecados (siguen activos por compatibilidad).

---

## 📋 Cambios en v3.1 (11 mayo 2026)

- ✅ Normalización completa de mensajes (sin placeholders)
- ✅ Especificación detallada de payloads para cada tipo de notificación
- ✅ Agrupamiento de pagos verificado (test unitario)
- ✅ Monto ahora visible en notificaciones de recarga
- ✅ Nueva columna "Facturas" en tabla admin (muestra agrupamiento)

---

## Autenticación

Todos los endpoints requieren el header:

```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

También se acepta `x-admin-api-key` con el mismo valor.

**Error si la key es inválida o no está presente:**
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "API Key inválida o ausente" }
}
```

---

## Formato de Respuesta

Todas las respuestas siguen este formato:

```json
{ "ok": true,  "data": { ... }, "error": null }
{ "ok": false, "data": null,   "error": { "code": "...", "message": "...", "details": null } }
```

| HTTP | `error.code` | Significado |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Datos no cumplen formato |
| 400 | `BAD_REQUEST` | Error lógico (monto 0, sin facturas) |
| 401 | `UNAUTHORIZED` | API Key inválida o ausente |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT_DUPLICATE` | Recurso duplicado |
| 409 | `INSUFFICIENT_FUNDS` | Saldo insuficiente |
| 409 | `INVALID_STATE_TRANSITION` | Estado incorrecto |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

---

## 1. Gestión de Usuarios

### EP1: `POST /api/users/upsert`

Registra o actualiza un usuario por teléfono. Idempotente — se puede llamar en cada conversación sin problema.

**Body:**

| Campo | Tipo | Req | Descripción |
|---|---|---|---|
| `telefono` | string | ✅ | Clave única (mín 7 caracteres) |
| `nombre` | string | No | Nombre del usuario |
| `apellido` | string | No | Apellido del usuario |
| `correo` | string | No | Email válido |
| `tipo_identificacion` | string | No | `"CC"` o `"CE"` |
| `numero_identificacion` | string | No | Número de identificación (máx 32 caracteres) |
| `ciudad` | string | No | Ciudad de residencia (máx 80 caracteres) |
| `direccion` | string | No | Dirección de residencia (máx 255 caracteres) |

**Ejemplo:**
```http
POST /api/users/upsert
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
Content-Type: application/json

{
  "telefono": "573046757626",
  "nombre": "Laura",
  "apellido": "Duran",
  "tipo_identificacion": "CC",
  "numero_identificacion": "1020304050",
  "ciudad": "Medellín",
  "direccion": "Calle 45 #32-10"
}
```

**Respuesta (201 nuevo / 200 existente):**
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

> Guardar `usuario_id` para referencias internas.

---

### EP2: `PUT /api/users/plan`

Asigna o cambia el plan del usuario. Llamar **antes** de generar solicitudes de recarga.

| Plan | Cuotas/Mes | Distribución |
|---|---|---|
| `control` | 1 | Día 1: total |
| `tranquilidad` | 2 | Día 1 y 15 por vencimiento |
| `respaldo` | 2 | Día 1 y 15 por vencimiento |

**Ejemplo:**
```http
PUT /api/users/plan
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
Content-Type: application/json

{ "telefono": "573046757626", "plan": "tranquilidad" }
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-...",
    "telefono": "573046757626",
    "plan_anterior": "control",
    "plan_nuevo": "tranquilidad"
  },
  "error": null
}
```

---

## 2. Obligaciones

### EP3: `POST /api/obligaciones`

Crea el contenedor mensual que agrupa todas las facturas del usuario para un período.

**Body:**

| Campo | Tipo | Req | Descripción |
|---|---|---|---|
| `telefono` | string | ✅ | |
| `descripcion` | string | ✅ | Ej: "Pagos de Mayo 2026" |
| `periodo` | string | ✅ | Fecha `YYYY-MM-DD` (se normaliza al día 1) |

**Respuesta (201):**
```json
{
  "ok": true,
  "data": {
    "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
    "usuario_id": "49f3c602-...",
    "descripcion": "Pagos de Mayo 2026",
    "periodo": "2026-05-01",
    "estado": "activa",
    "total_facturas": 0,
    "facturas_pagadas": 0,
    "monto_total": 0,
    "monto_pagado": 0,
    "creado_en": "2026-05-06T10:30:00.000Z"
  },
  "error": null
}
```

> Guardar `id` — se necesita para agregar facturas (EP6) y generar solicitudes de recarga (EP14).

---

### EP4: `GET /api/obligaciones?telefono=XXX`

Lista todas las obligaciones del usuario con sus facturas.

| Param | Tipo | Req | Descripción |
|---|---|---|---|
| `telefono` | string | ✅ | |
| `estado` | string | No | `activa`, `en_progreso`, `completada`, `cancelada` |

**Respuesta (200):** array de objetos. Cada uno tiene `facturas[]` con todas las facturas del período.

---

### EP5: `GET /api/obligaciones/:id`

Detalle completo de una obligación específica. Incluye campo `usuarios` con nombre y teléfono del dueño.

---

## 3. Facturas

### EP6: `POST /api/facturas/captura`

Registra una factura dentro de una obligación. El bot extrae datos (foto, PDF) y los envía aquí.

**Body:**

| Campo | Tipo | Req | Nullable | Descripción |
|---|---|---|---|---|
| `telefono` | string | ✅ | No | |
| `obligacion_id` | UUID | ✅ | No | |
| `servicio` | string | ✅ | No | Nombre del servicio |
| `monto` | number | No | ✅ | `null` si extracción incompleta |
| `fecha_vencimiento` | string | No | ✅ | `YYYY-MM-DD` |
| `fecha_emision` | string | No | ✅ | `YYYY-MM-DD` |
| `referencia_pago` | string | No | ✅ | |
| `etiqueta` | string | No | ✅ | `"internet"`, `"gas"`, `"energia"`, etc. |
| `periodo` | string | No | ✅ | `YYYY-MM-DD` |
| `origen` | string | No | ✅ | `"bot_whatsapp"`, `"manual"`, `"ocr"` |
| `archivo_url` | string | No | ✅ | URL imagen/PDF |
| `extraccion_estado` | string | No | No | `"ok"`, `"dudosa"`, `"fallida"` |
| `extraccion_confianza` | number | No | ✅ | 0.0 a 1.0 |

**Respuesta (201):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "63dd4b3b-...",
    "servicio": "Internet ETB",
    "monto": 85000,
    "estado": "pendiente",
    "validacion_estado": "sin_revisar",
    "requiere_revision": false
  },
  "error": null
}
```

> ⚠️ **Cambio v3:** El estado inicial ahora es `"pendiente"` (antes era `"extraida"`). Se añadió campo `validacion_estado` separado.

**Estados de factura:**

| `estado` | `validacion_estado` | Significado |
|---|---|---|
| `pendiente` | `sin_revisar` | Recién capturada, esperando revisión admin |
| `pendiente` | `revisada` | Factura revisada por admin |
| `pagada` | `revisada` | Pago ejecutado |
| `anulada` | cualquiera | Cancelada |

> Para crear un pago (EP13), la factura debe tener `validacion_estado = "revisada"` y no tener `motivo_rechazo`.

---

### EP7: `GET /api/facturas/obligacion/:obligacionId`

Lista todas las facturas de una obligación. El campo `_id` es el UUID necesario para el endpoint de pagos.

---

## 4. Recargas

### EP8: `POST /api/recargas/reportar`

Registra que el usuario envió un comprobante de depósito. Queda en `"en_validacion"` hasta aprobación admin.

| Campo | Tipo | Req | Descripción |
|---|---|---|---|
| `telefono` | string | ✅ | |
| `periodo` | string | ✅ | `YYYY-MM-DD` |
| `monto` | number | ✅ | Positivo |
| `comprobante_url` | string | ✅ | URL del comprobante |
| `referencia_tx` | string | No | Referencia bancaria. Previene duplicados |
| `nombre` | string | No | Si se envía, actualiza el nombre del usuario en el mismo llamado |
| `apellido` | string | No | Si se envía, actualiza el apellido del usuario en el mismo llamado |

> Si el usuario aún no tiene un nombre real registrado (solo su número de teléfono como nombre por defecto), el bot puede enviarlo aquí en el mismo llamado junto con el comprobante.

**Respuesta (201):**
```json
{
  "ok": true,
  "data": { "recarga_id": "974bad6d-...", "estado": "en_validacion" },
  "error": null
}
```

> Si se envía `referencia_tx` ya existente, devuelve la misma recarga (200, idempotente).

---

## 5. Saldo Disponible

### EP9: `GET /api/disponible?telefono=XXX&periodo=YYYY-MM-DD`

Calcula saldo en tiempo real: `disponible = total_recargas_aprobadas − total_pagos_realizados`

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "49f3c602-...",
    "periodo": "2026-05-01",
    "total_recargas_aprobadas": 250000,
    "total_pagos_pagados": 130000,
    "disponible": 120000
  },
  "error": null
}
```

---

## 6. Notificaciones ⚠️ SECCIÓN ACTUALIZADA v3.2

### ✅ TIPOS VÁLIDOS — Solo 3 mensajes llegan al bot

> ⚠️ **Cambio crítico v3.2:** El bot **ya no consulta por teléfono**. Existe **un único endpoint global** que entrega la cola de mensajes pendientes para **todos los usuarios**, con el texto del mensaje **ya generado por el sistema**. El bot solo necesita reenviarlo a WhatsApp.

| Tipo | Cuándo se genera |
|---|---|
| `solicitud_recarga` | Cron detecta obligaciones activas sin saldo suficiente |
| `obligacion_cumplida` | Se completó el pago de UNA factura (sin otros pagos cercanos) |
| `obligaciones_pagadas_grupal` | Dos o más pagos del mismo usuario en ventana ≤ 30 minutos |

**Doble timestamp por cada notificación:**

| Campo | Quién lo setea | Significado |
|---|---|---|
| `creado_en` | Sistema | Cuando se genera la notificación |
| `enviada_en` | Sistema | Cuando el bot consume la cola (al llamar `/bot/campanias`) |
| `entregada_en` | Bot | Cuando el mensaje llega al WhatsApp del usuario (vía `/bot/entregadas`) |

---

### EP10: `GET /api/notificaciones/bot/campanias` ✅ ENDPOINT CANÓNICO

**El único endpoint que el bot debe consumir para obtener mensajes.**

Devuelve, en una sola llamada, todos los mensajes pendientes para todos los usuarios, **con el texto ya renderizado**. Al servir la respuesta:

- Las notificaciones consumidas pasan a estado `enviada`.
- Se guarda `enviada_en = NOW()` (timestamp exacto del momento del consumo).
- Si dos o más pagos del mismo usuario están dentro de ≤ 30 minutos, se devuelven en **una sola campaña grupal**.

```http
GET /api/notificaciones/bot/campanias
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "total": 3,
    "campanias": [
      {
        "ids": ["7a7e4d47-cc2d-4380-bad3-0c5ee297d4b8"],
        "tipo": "solicitud_recarga",
        "telefono": "573241563727",
        "mensaje": "stiven 👋🏼\n\nEs momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼\n\n• Internet — $ 45.000\n• Luz — $ 30.000\n\nTu saldo actual en deOne es de $ 170.000\n\nValor a recargar: $ 80.000\n\nPuedes hacer la recarga a la llave 0090944088.\n\nCuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼",
        "creado_en": "2026-05-11T05:06:04.493Z",
        "enviada_en": "2026-05-11T05:30:12.001Z"
      },
      {
        "ids": ["08d5eade-64d3-43d7-84cb-bcf5a23000c1"],
        "tipo": "obligacion_cumplida",
        "telefono": "573046757626",
        "mensaje": "¡Carlos! 🙌🏼\nYa hice el pago de Internet por $ 45.000.\n\nTu saldo actualizado en deOne es de $ 25.000\n\nEl comprobante ya quedó cargado en tu enlace habitual.",
        "creado_en": "2026-05-11T04:10:00.000Z",
        "enviada_en": "2026-05-11T05:30:12.001Z"
      },
      {
        "ids": [
          "105e832a-d3c9-4ddb-848c-0a0a0580a3be",
          "9d2b4f7e-2c1a-44c2-94e0-1cfa9b1f0a01"
        ],
        "tipo": "obligaciones_pagadas_grupal",
        "telefono": "573012345678",
        "mensaje": "¡María! 🙌🏼\n\nYa hice el pago de:\nLuz por $ 30.000.\nAgua por $ 20.000.\n\nTu saldo actualizado en deOne es de $ 15.000\n\n¡Los comprobantes ya quedaron cargados en tu enlace habitual!",
        "creado_en": "2026-05-11T04:55:00.000Z",
        "enviada_en": "2026-05-11T05:30:12.001Z"
      }
    ]
  },
  "error": null
}
```

**Contrato del bot:**

| Campo | Tipo | Uso |
|---|---|---|
| `telefono` | string | Número al que enviar el mensaje por WhatsApp |
| `mensaje` | string | Texto ya generado por el sistema — **enviar tal cual** |
| `ids` | string[] | Ids de notificaciones que componen la campaña (1 individual, N grupal). Devolver en `/bot/entregadas`. |
| `tipo` | enum | `solicitud_recarga` \| `obligacion_cumplida` \| `obligaciones_pagadas_grupal` |
| `creado_en` | ISO | Cuando el sistema creó la notificación más antigua de la campaña |
| `enviada_en` | ISO | Cuando el sistema entregó la campaña al bot |

> Consulta siguiente del bot → devuelve `{ total: 0, campanias: [] }` (idempotente por diseño).

---

### EP10b: `POST /api/notificaciones/bot/entregadas` ✅ NUEVO

**El bot reporta los mensajes que efectivamente llegaron al usuario.** El sistema actualiza el estado a `entregada` y registra `entregada_en` con la hora exacta de entrega.

```http
POST /api/notificaciones/bot/entregadas
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
Content-Type: application/json
```

**Body:**
```json
{
  "ids": [
    "7a7e4d47-cc2d-4380-bad3-0c5ee297d4b8",
    "08d5eade-64d3-43d7-84cb-bcf5a23000c1",
    "105e832a-d3c9-4ddb-848c-0a0a0580a3be",
    "9d2b4f7e-2c1a-44c2-94e0-1cfa9b1f0a01"
  ],
  "entregada_en": "2026-05-11T05:30:18.420Z"
}
```

| Campo | Tipo | Req | Descripción |
|---|---|---|---|
| `ids` | uuid[] | ✅ | Ids individuales (los mismos de `campanias[].ids`). Para una campaña grupal hay que mandar todos. |
| `entregada_en` | ISO 8601 | No | Hora exacta reportada por el bot. Por defecto `NOW()` del servidor. |

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "actualizadas": 4,
    "entregada_en": "2026-05-11T05:30:18.420Z",
    "notificaciones": [
      { "id": "7a7e4d47-...", "estado": "entregada", "entregada_en": "2026-05-11T05:30:18.420Z" }
    ]
  },
  "error": null
}
```

---

### 📝 PLANTILLAS DE MENSAJE (referencia)

Las plantillas son aplicadas por el sistema. El bot **no necesita reconstruirlas**.

**1) `solicitud_recarga`**
```
(usuario) 👋🏼

Es momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼

• (etiqueta) — $(monto)
• (etiqueta) — $(monto)
...

Tu saldo actual en deOne es de $(saldo_usuario)

Valor a recargar: $(valor_recarga)

Puedes hacer la recarga a la llave 0090944088.

Cuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼
```

**2) `obligacion_cumplida`** (1 pago)
```
¡(usuario)! 🙌🏼
Ya hice el pago de (etiqueta-obligacion) por $(valor_obligacion).

Tu saldo actualizado en deOne es de $(saldo_user)

El comprobante ya quedó cargado en tu enlace habitual.
```

**3) `obligaciones_pagadas_grupal`** (≥ 2 pagos en ≤ 30 min)
```
¡(usuario)! 🙌🏼

Ya hice el pago de:
(etiqueta-obligacion) por $(valor_obligacion).
(etiqueta-obligacion) por $(valor_obligacion).
...

Tu saldo actualizado en deOne es de $(saldo_user)

¡Los comprobantes ya quedaron cargados en tu enlace habitual!
```

---

### 🤖 FLUJO RECOMENDADO PARA EL BOT

```text
Cada N minutos:

1. GET /api/notificaciones/bot/campanias
     → Recibe { total, campanias: [{ ids, telefono, mensaje, ... }] }
     → El sistema ya marcó esos ids como 'enviada' y guardó enviada_en.

2. Por cada campaña:
     a. enviarWhatsApp(campania.telefono, campania.mensaje)
     b. Si la entrega fue OK → acumular campania.ids en un buffer

3. POST /api/notificaciones/bot/entregadas
     Body: { ids: [...buffer], entregada_en: <ISO de entrega real> }
     → El sistema marca estado='entregada' y guarda entregada_en.

4. Las que fallen pueden re-marcarse vía PUT /api/notificaciones/:id
   con estado='fallida' y ultimo_error.
```

---

### ⚠️ Endpoints legacy (compatibilidad)

Se mantienen activos pero **no deben usarse en el flujo nuevo del bot**:

- `GET /api/notificaciones/pendientes/:telefono` — consulta por usuario (legacy).
- `GET /api/notificaciones/pendientes-hoy` — variante global previa (legacy).

Prefiera siempre `GET /api/notificaciones/bot/campanias` + `POST /api/notificaciones/bot/entregadas`.

---

### EP11: `PUT /api/notificaciones/:id`

Actualiza el estado de UNA notificación. Uso opcional — EP10 ya marca automáticamente.

```http
PUT /api/notificaciones/7cc2d2eb-...
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
Content-Type: application/json

{ "estado": "fallida", "ultimo_error": "Timeout después de 30 segundos" }
```

---

### EP12: `POST /api/notificaciones/batch-enviadas`

Marca múltiples notificaciones como `"enviada"`. Uso opcional — EP10 ya marca automáticamente.

```json
{
  "ids": ["7cc2d2eb-...", "a1b2c3d4-..."]
}
```

---

### EP12a: `GET /api/notificaciones/pendientes-hoy` ⚠️ DEPRECADO

Reemplazado por **EP10 (`GET /api/notificaciones/bot/campanias`)**, que ya devuelve mensajes globales para todos los usuarios con texto generado por el sistema.

Se mantiene activo solo por compatibilidad. Para detalles consulte EP10.

---

## 7. Pagos

### EP13: `POST /api/pagos/crear`

Crea un pago para una factura. Requiere que la factura tenga `validacion_estado = "revisada"`, que no tenga `motivo_rechazo` y que el usuario tenga saldo suficiente.

| Campo | Tipo | Req | Descripción |
|---|---|---|---|
| `telefono` | string | ✅ | |
| `factura_id` | UUID | ✅ | Campo `_id` del EP7 |

**Ejemplo:**
```http
POST /api/pagos/crear
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
Content-Type: application/json

{ "telefono": "573046757626", "factura_id": "63dd4b3b-..." }
```

**Respuesta (201):**
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

| Código | Mensaje |
|---|---|
| `NOT_FOUND` | Factura no encontrada |
| `INVALID_STATE_TRANSITION` | No se puede crear pago para factura con `validacion_estado='sin_revisar'` o con `motivo_rechazo`. Debe estar `'revisada'` y aprobada por el admin. |
| `INSUFFICIENT_FUNDS` | Fondos insuficientes. Disponible: $X, Requerido: $Y |

---

## 8. Solicitudes de Recarga Automáticas

### EP14: `POST /api/solicitudes-recarga/generar`

Genera solicitudes de recarga según el plan. Requiere que la obligación tenga facturas en estado `revisada` o `extraida`.

**Body:** `{ "telefono": "...", "obligacion_id": "..." }`

**Lógica por plan:**
- `control`: 1 cuota, monto total, fecha límite = vencimiento más próximo.
- `tranquilidad` / `respaldo`: 2 cuotas divididas por vencimiento (día 1-15 vs 16-31). Si todas caen en la misma mitad, divide 50/50.

**Respuesta (201):**
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
        "fecha_limite": "2026-05-10",
        "fecha_recordatorio": "2026-05-05",
        "facturas_ids": ["7bd45f33-...", "f1bf3f36-..."],
        "estado": "pendiente",
        "plan": "tranquilidad"
      },
      {
        "id": "3e30936d-...",
        "numero_cuota": 2,
        "total_cuotas": 2,
        "monto_solicitado": 120000,
        "fecha_limite": "2026-05-22",
        "fecha_recordatorio": "2026-05-17",
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

---

### EP15: `GET /api/solicitudes-recarga?telefono=XXX`

Lista solicitudes del usuario. Filtro opcional por `estado` y `obligacion_id`.

| `estado` | Significado |
|---|---|
| `pendiente` | Generada, esperando recarga |
| `parcial` | Recarga parcial recibida |
| `cumplida` | Recarga completa aprobada |
| `vencida` | Pasó fecha límite sin recarga |
| `cancelada` | Cancelada (recarga aprobada cubrió el total) |

---

### EP16: `POST /api/solicitudes-recarga/verificar-recordatorios`

Busca solicitudes próximas a vencer sin saldo y genera notificación `solicitud_recarga` si el usuario no tiene fondos.

**Body:** `{ "telefono": "..." }`

**Respuesta:**
```json
{
  "ok": true,
  "data": {
    "recordatorios_generados": 1,
    "detalle": [
      { "solicitud_id": "09e2ed08-...", "monto_faltante": 215000, "fecha_limite": "2026-05-10" }
    ]
  }
}
```

> El cron job (cada 30 min) ya ejecuta esto automáticamente para todos los usuarios. Este endpoint es para verificar un usuario específico manualmente.

---

### EP17: `PUT /api/solicitudes-recarga/:id/fechas`

Cambia fechas límite de las cuotas. Recalcula `fecha_recordatorio` (5 días antes) y resetea `recordatorio_enviado`.

```json
{
  "fecha_cuota_1": "2026-05-05",
  "fecha_cuota_2": "2026-05-18"
}
```

> Solo funciona en solicitudes con estado `pendiente` o `parcial`. Enviar al menos una fecha.

---

## 9. Flujo Completo del Sistema

### Fase 1 — Registro y Configuración

```
1. Usuario llega por WhatsApp     → POST /api/users/upsert
2. Elige plan                     → PUT /api/users/plan
3. Crear obligación del mes       → POST /api/obligaciones
4. Cargar facturas (fotos/PDF)    → POST /api/facturas/captura  (por cada factura)
5. Admin valida facturas          → (admin usa panel web)
6. Generar solicitudes de recarga → POST /api/solicitudes-recarga/generar
```

### Fase 2 — Evaluación Automática (Cron Jobs)

```
Cron cada 30 minutos (*/30 * * * *):
  → Evalúa obligaciones activas
  → Calcula montos pendientes vs saldo
  → Genera notificación tipo "solicitud_recarga" para cada usuario que deba recargar
  → No genera duplicados si ya existe una del mismo día

Cron cada 6 horas (0 */6 * * *):
  → Detecta usuarios sin respuesta 24-48h
  → Si no hay recarga → crea alerta interna (solo admin, bot no la recibe)
```

### Fase 3 — Recarga y Aprobación

```
7. Bot entrega notificaciones     → GET /api/notificaciones/pendientes/:tel
8. Usuario envía comprobante      → POST /api/recargas/reportar
9. Admin aprueba recarga          → (admin usa panel web)X
   → Auto-limpieza: cancela solicitudes cubiertas, actualiza saldo
```

### Fase 4 — Pagos y Seguimiento

```
10. Verificar saldo               → GET /api/disponible
11. Crear pago por factura        → POST /api/pagos/crear  (solo si validacion_estado="revisada")
12. Consultar estado              → GET /api/obligaciones, /facturas, /solicitudes-recarga
13. Bot recibe notif de pago      → GET /api/notificaciones/pendientes/:tel
    → obligacion_cumplida (1 factura) o obligaciones_pagadas_grupal (varias en <30 min)
```

---

## 10. Plantillas de Mensajes ✅ ACTUALIZADO v3.1

> **v3.1 Cambio importante:** El campo `payload.mensaje` en `solicitud_recarga` **YA VIENE NORMALIZADO Y LISTO PARA ENVIAR** sin placeholders.
> Para `obligacion_cumplida` y `obligaciones_pagadas_grupal` el bot debe construir el mensaje desde los campos del payload.

### `solicitud_recarga` — ✅ COPIA DIRECTA

**El payload.mensaje ya contiene el texto normalizado. Ejemplo real (11 mayo 2026):**

```
stiven 👋🏼

Es momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼

Tu saldo actual en deOne es de $ 170.000

Valor a recargar: $ 80.000

Puedes hacer la recarga a la llave 0090944088.

Cuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼
```

**Lo que el bot debe hacer:**
```javascript
const { nombre_usuario, mensaje } = payload;
// ✅ Enviar mensaje tal cual — SIN modificaciones, SIN reemplazos
enviarWhatsApp(telefono, mensaje);
```

**Campos del payload:**
- `mensaje`: Texto **normalizado** (sin placeholders como `(saldo_usuario)`)
- `saldo_actual`: 170000 (número puro para consultas internas)
- `valor_a_recargar`: 80000 (número puro para consultas internas)
- `nombre_usuario`: "stiven"
- `periodo`: "2026-05"

---

### `obligacion_cumplida` — Bot construye el mensaje

**Campos del payload:**
- `etiqueta`: "Internet" (nombre del servicio)
- `monto`: 45000 (monto pagado)

**Plantilla para construir:**
```
¡{nombre_usuario}! 🙌🏼
Ya hice el pago de {etiqueta} por ${formatCurrency(monto)}.

Tu saldo actualizado en deOne es de ${obtenerSaldoActualizado()}

El comprobante ya quedó cargado en tu enlace habitual.
```

**Ejemplo real:**
```
¡stiven! 🙌🏼
Ya hice el pago de Internet por $ 45.000.

Tu saldo actualizado en deOne es de $ 120.000

El comprobante ya quedó cargado en tu enlace habitual.
```

---

### `obligaciones_pagadas_grupal` — Bot itera array

**Campos del payload:**
- `obligaciones[]`: Array de facturas pagadas juntas
  - `etiqueta`: Nombre del servicio
  - `valor`: Monto pagado

**Plantilla para construir (iterar obligaciones):**
```
¡{nombre_usuario}! 🙌🏼

Ya hice el pago de:
{obligaciones.map(o => `${o.etiqueta} por ${formatCurrency(o.valor)}.`).join('\n')}

Tu saldo actualizado en deOne es de ${obtenerSaldoActualizado()}

Los comprobantes ya quedaron cargados en tu enlace habitual!
```

**Ejemplo real (test 11 mayo):**
```
¡stiven! 🙌🏼

Ya hice el pago de:
Luz por $ 30.000.
Agua por $ 20.000.

Tu saldo actualizado en deOne es de $ 120.000

Los comprobantes ya quedaron cargados en tu enlace habitual!
```

---

## 11. Estados del Sistema

```
Facturas:
  pendiente (sin_revisar) → pendiente (revisada)
  pendiente (revisada + motivo_rechazo) → anulada
  pendiente (revisada sin motivo_rechazo) → pagada

Recargas:
  en_validacion → aprobada | rechazada

Notificaciones:
  pendiente → enviada | fallida
  pendiente → entregada  (solo pendientes-hoy global)
  pendiente → cancelada  (auto-limpieza)

Solicitudes de Recarga:
  pendiente → parcial → cumplida
            → vencida
            → cancelada

Obligaciones:
  activa → en_progreso → completada
         → cancelada

Pagos:
  en_proceso → pagado | fallido
```

---

## 12. Verificación de Endpoints (11 mayo 2026) ✅ ACTUALIZADO

Todos los endpoints fueron probados contra el servidor en producción/local. **Cambios v3.1 (11 mayo):**

| EP | Ruta | Estado | Nota v3.1 |
|---|---|---|---|
| 1 | `POST /api/users/upsert` | ✅ Funcional | - |
| 2 | `PUT /api/users/plan` | ✅ Funcional | - |
| 3 | `POST /api/obligaciones` | ✅ Funcional | - |
| 4 | `GET /api/obligaciones?telefono` | ✅ Funcional | - |
| 5 | `GET /api/obligaciones/:id` | ✅ Funcional | - |
| 6 | `POST /api/facturas/captura` | ✅ Funcional | - |
| 7 | `GET /api/facturas/obligacion/:id` | ✅ Funcional | - |
| 8 | `POST /api/recargas/reportar` | ✅ Funcional | - |
| 9 | `GET /api/disponible` | ✅ Funcional | - |
| 10 | `GET /api/notificaciones/pendientes/:tel` | ✅ Funcional | Payload normalizado, agrupamiento verificado con test |
| 11 | `PUT /api/notificaciones/:id` | ✅ Funcional | Opcional (EP10 marca automáticamente) |
| 12 | `POST /api/notificaciones/batch-enviadas` | ✅ Funcional | Opcional (EP10 marca automáticamente) |
| 12a | `GET /api/notificaciones/pendientes-hoy` | ✅ Funcional | Filtra `solicitud_recarga`, marca como `entregada` |
| 13 | `POST /api/pagos/crear` | ✅ Funcional | Genera notificaciones `obligacion_cumplida` |
| 14 | `POST /api/solicitudes-recarga/generar` | ✅ Funcional | Genera `solicitud_recarga` con payload normalizado |
| 15 | `GET /api/solicitudes-recarga` | ✅ Funcional | - |
| 16 | `POST /api/solicitudes-recarga/verificar-recordatorios` | ✅ Funcional | - |
| 17 | `PUT /api/solicitudes-recarga/:id/fechas` | ✅ Funcional | - |

---

## 13. Cambios en v3.1 (11 mayo 2026)

### Normalización de Mensajes

**Problema resuelto:** Los placeholders `(saldo_usuario)`, `(valor_recarga)`, `(valor_obligacion)` NO aparecen en los mensajes enviados al bot.

**Solución implementada:**
1. Backend normaliza en **write-time** (`crearNotificacionInterna`) y **read-time** (`obtenerPendientesUsuario`)
2. Frontend elimina fallbacks de placeholders en message builder
3. El campo `payload.mensaje` llega **siempre normalizado** con valores reales

**Verificación:**
- Script test confirma 0 notificaciones con placeholders en BD
- Endpoint devuelve: `$ 170.000` (real), NO `(saldo_usuario)`
- Endpoint devuelve: `$ 80.000` (real), NO `(valor_recarga)`

### Monto Visible en Notificaciones Recarga

**Cambio:** La columna `Monto` en tabla admin ahora muestra `$ 80.000` para solicitudes de recarga (antes mostraba "—").

**Implementación:** Función `getMonto()` ahora busca `valor_a_recargar` y `valor_recarga` en payload.

### Nueva Columna "Facturas" en UI Admin

**Nueva columna:** Muestra cuántas facturas se pagarán juntas.

**Lógica:**
- `solicitud_recarga` → "—" (no aplica)
- `obligacion_cumplida` → "1 factura"
- `obligaciones_pagadas_grupal` → "N facturas" (ej: "3 facturas")

**Implementación:** Busca obligaciones cercanas (≤30 min) del mismo usuario en estado `pendiente`.

### Agrupamiento de Pagos (Test Unitario)

**Verificación con test real (11 mayo, usuario: stiven):**
```
Pago 1: Internet $45.000 (hace 97 min) → obligacion_cumplida (único)
Pago 2: Luz $30.000 (hace 29 min)
Pago 3: Agua $20.000 (hace 28 min)
→ Pagos 2+3 agrupados (diferencia 1 min) → obligaciones_pagadas_grupal

Resultado: Endpoint devuelve 2 notificaciones
- [1] obligacion_cumplida: Internet
- [2] obligaciones_pagadas_grupal: [Luz, Agua]
```

Status: ✅ **Funcionando correctamente**
