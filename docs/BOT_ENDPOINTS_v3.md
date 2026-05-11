# DeOne Backend — API para Bot WhatsApp
**Versión 3.1 — 11 de mayo de 2026** ✅ ACTUALIZADA  
**Base URL:** `https://prueba-supabase.onrender.com/api`  
**Clasificación:** Documento Técnico Confidencial

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
| `tipo_identificacion` | string | No | `"CC"`, `"NIT"` o `"CE"` |
| `numero_identificacion` | string | No | Número de cédula/NIT (máx 32 caracteres) |
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
    "validacion_estado": "sin_validar",
    "requiere_revision": false
  },
  "error": null
}
```

> ⚠️ **Cambio v3:** El estado inicial ahora es `"pendiente"` (antes era `"extraida"`). Se añadió campo `validacion_estado` separado.

**Estados de factura:**

| `estado` | `validacion_estado` | Significado |
|---|---|---|
| `pendiente` | `sin_validar` | Recién capturada, esperando revisión admin |
| `pendiente` | `validada` | Admin confirmó los datos. Lista para generar pago |
| `pendiente` | `rechazada` | Admin rechazó la factura |
| `pagada` | `validada` | Pago ejecutado |
| `anulada` | cualquiera | Cancelada |

> Para crear un pago (EP13), la factura debe tener `validacion_estado = "validada"`.

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

## 6. Notificaciones ⚠️ SECCIÓN ACTUALIZADA v3

### ✅ TIPOS VÁLIDOS — Solo 3 tipos llegan al bot

> ⚠️ **Cambio crítico v3:** Los tipos anteriores (`solicitud_recarga_inicio_mes`, `recordatorio_recarga`, `recarga_confirmada`, `recarga_aprobada`, `recarga_rechazada`, `factura_validada`, `factura_rechazada`, `pago_confirmado`, `obligacion_completada`, `nueva_obligacion`) fueron **eliminados o internalizados**. El bot solo recibirá estos 3:

| Tipo | Cuándo se genera |
|---|---|
| `solicitud_recarga` | Cron cada 30 min detecta obligaciones activas sin saldo suficiente |
| `obligacion_cumplida` | Se completó el pago de UNA factura (sin otros pagos cercanos) |
| `obligaciones_pagadas_grupal` | Dos o más pagos ocurrieron dentro de una ventana de **30 minutos** |

---

### EP10: `GET /api/notificaciones/pendientes/:telefono`

**El endpoint central del bot.** Devuelve notificaciones pendientes del usuario y las marca como `"enviada"` automáticamente.

```http
GET /api/notificaciones/pendientes/573046757626
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Respuesta (200) — Ejemplo con los 3 tipos:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "7a7e4d47-cc2d-4380-bad3-0c5ee297d4b8",
      "tipo": "solicitud_recarga",
      "estado": "enviada",
      "usuarios": {
        "nombre": "stiven",
        "apellido": "moscoos",
        "telefono": "3241563727"
      },
      "payload": {
        "mensaje": "stiven 👋🏼\n\nEs momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼\n\nTu saldo actual en deOne es de $ 170.000\n\nValor a recargar: $ 80.000\n\nPuedes hacer la recarga a la llave 0090944088.\n\nCuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼",
        "saldo_actual": 170000,
        "saldo_usuario": 170000,
        "valor_recarga": 80000,
        "valor_a_recargar": 80000,
        "nombre_usuario": "stiven",
        "periodo": "2026-05-01"
      },
      "creado_en": "2026-05-11T05:06:04.493Z"
    },
    {
      "id": "105e832a-d3c9-4ddb-848c-0a0a0580a3be",
      "tipo": "obligacion_cumplida",
      "estado": "enviada",
      "payload": {
        "etiqueta": "Internet",
        "monto": 45000,
        "servicio": "Internet"
      },
      "creado_en": "2026-05-10T03:58:04.493Z"
    },
    {
      "id": "grp-105e832a-d3c9-4ddb-848c-0a0a0580a3be",
      "tipo": "obligaciones_pagadas_grupal",
      "estado": "sin_respuesta",
      "payload": {
        "obligaciones": [
          {
            "etiqueta": "Luz",
            "valor": 30000
          },
          {
            "etiqueta": "Agua",
            "valor": 20000
          }
        ]
      },
      "creado_en": "2026-05-11T05:06:04.493Z"
    }
  ],
  "error": null
}
```

---

### 📦 DETALLE COMPLETO DE PAYLOADS

#### **Tipo: `solicitud_recarga`**

**Campos del payload:**
```javascript
{
  "mensaje": string,              // ✅ NORMALIZADO: texto completo sin placeholders, lista para enviar
  "saldo_actual": number,         // Saldo actual calculado (recargas pagadas - pagos realizados)
  "saldo_usuario": number,        // Alias del anterior
  "valor_recarga": number,        // Monto sugerido a recargar
  "valor_a_recargar": number,     // Alias del anterior
  "nombre_usuario": string,       // Nombre del usuario
  "periodo": string               // YYYY-MM (período de la obligación)
}
```

**✅ Nota importante v3.1:**
- El campo `mensaje` ya contiene el texto **normalizado sin placeholders** como `(saldo_usuario)` o `(valor_recarga)`
- Contiene valores reales formateados con `$` y `.000` (ej: `$ 170.000`, `$ 80.000`)
- El bot puede **copiar directamente el mensaje y enviarlo sin modificaciones**

**Mensaje normalizado (ejemplo real):**
```
stiven 👋🏼

Es momento de recargar tu cuenta para cubrir tus próximas obligaciones 🙌🏼

Tu saldo actual en deOne es de $ 170.000

Valor a recargar: $ 80.000

Puedes hacer la recarga a la llave 0090944088.

Cuando la hagas, envíame el comprobante y yo me encargo del resto deOne 👍🏼
```

---

#### **Tipo: `obligacion_cumplida`**

**Campos del payload:**
```javascript
{
  "etiqueta": string,             // Nombre del servicio (ej: "Internet", "Agua", "Luz")
  "monto": number,                // Monto pagado
  "servicio": string,             // Alias del anterior
  "monto_total": number,          // Alias del anterior
  "monto_aplicado": number        // Alias del anterior
}
```

**No incluye mensaje** — El bot debe construirlo:
```
¡{nombre_usuario}! 🙌🏼
Ya hice el pago de {etiqueta} por ${monto}.

Tu saldo actualizado en deOne es de ${nuevo_saldo}

El comprobante ya quedó cargado en tu enlace habitual.
```

---

#### **Tipo: `obligaciones_pagadas_grupal`**

**Campos del payload:**
```javascript
{
  "obligaciones": [                // Array de facturas pagadas en el mismo grupo (≤ 30 min)
    {
      "etiqueta": string,          // Nombre del servicio
      "valor": number              // Monto pagado
    },
    ...
  ]
}
```

**No incluye mensaje** — El bot debe construirlo iterando el array:
```
¡{nombre_usuario}! 🙌🏼

Ya hice el pago de:
{etiqueta_1} por ${valor_1}.
{etiqueta_2} por ${valor_2}.
{etiqueta_3} por ${valor_3}.

Tu saldo actualizado en deOne es de ${nuevo_saldo}

Los comprobantes ya quedaron cargados en tu enlace habitual!
```

---

### ✅ AGRUPAMIENTO DE PAGOS (Verificado con test unitario)

**Lógica automática en el servidor:**
- Cuando el bot consulta `GET /api/notificaciones/pendientes/{telefono}`, el backend busca **todos** los pagos pendientes
- Los pagos se ordenan por fecha de creación
- **Pagos dentro de una ventana de ≤ 30 minutos se agrupan automáticamente:**
  - Si `cantidad_pagos == 1` → retorna como `obligacion_cumplida`
  - Si `cantidad_pagos >= 2` → retorna como `obligaciones_pagadas_grupal` con `payload.obligaciones[]`

**Ejemplo real (test del 11 mayo):**
```
Usuario: stiven (3241563727)
├─ Pago 1: Internet $45.000 (hace 97 min) → obligacion_cumplida (solo)
└─ Pago 2+3: Luz $30.000 + Agua $20.000 (hace 28-29 min, diferencia 1 min)
            → obligaciones_pagadas_grupal (agrupados)
```

**Resultado del endpoint:**
```json
[
  {
    "id": "08d5eade-64d3-43d7-84cb-bcf5a23000c1",
    "tipo": "obligacion_cumplida",
    "payload": { "etiqueta": "Internet", "monto": 45000 }
  },
  {
    "id": "grp-105e832a-d3c9-4ddb-848c-0a0a0580a3be",
    "tipo": "obligaciones_pagadas_grupal",
    "payload": {
      "obligaciones": [
        { "etiqueta": "Luz", "valor": 30000 },
        { "etiqueta": "Agua", "valor": 20000 }
      ]
    }
  }
]
```

---

### 🤖 FLUJO RECOMENDADO PARA EL BOT

```javascript
// Cada 30 minutos, el bot ejecuta:

1. GET /api/notificaciones/pendientes/{telefono}
   → Backend marca automáticamente como "enviada"

2. Para cada notificación en la respuesta:

   if (tipo === 'solicitud_recarga') {
     // ✅ El mensaje ya está normalizado, enviar directamente
     enviarWhatsApp(telefono, payload.mensaje);
   }
   
   else if (tipo === 'obligacion_cumplida') {
     // Construir mensaje
     const msg = `¡${usuario.nombre}! 🙌🏼
Ya hice el pago de ${payload.etiqueta} por $${formatCurrency(payload.monto)}.

Tu saldo actualizado en deOne es de ${obtenerSaldoActual()}

El comprobante ya quedó cargado en tu enlace habitual.`;
     enviarWhatsApp(telefono, msg);
   }
   
   else if (tipo === 'obligaciones_pagadas_grupal') {
     // Iterar obligaciones
     const lineas = payload.obligaciones
       .map(o => `${o.etiqueta} por $${formatCurrency(o.valor)}.`)
       .join('\n');
     
     const msg = `¡${usuario.nombre}! 🙌🏼

Ya hice el pago de:
${lineas}

Tu saldo actualizado en deOne es de ${obtenerSaldoActual()}

Los comprobantes ya quedaron cargados en tu enlace habitual!`;
     enviarWhatsApp(telefono, msg);
   }

3. ❌ NO llamar EP11 (PUT /api/notificaciones/:id)
   → Ya están marcadas como "enviada" automáticamente

4. Segunda consulta del usuario → devuelve [] (idempotente)
```

---

**Comportamiento del agrupamiento de pagos (anterior v3.0):**

- Los registros de tipo `obligacion_cumplida` y `pago_confirmado` (legados en DB) se **agrupan automáticamente** en el servidor antes de devolver la respuesta.
- Si dos o más pagos tienen `creado_en` con diferencia ≤ 30 minutos entre sí → se devuelven como **un solo** registro `obligaciones_pagadas_grupal` con `payload.obligaciones[]`.
- Si solo hay 1 pago en el grupo → se devuelve como `obligacion_cumplida`.
- El id del grupal tiene formato `grp-{id_del_primero}`.

**Flujo recomendado para el bot:**
```
1. GET /api/notificaciones/pendientes/{telefono}
   → Las notificaciones se marcan como "enviada" AUTOMÁTICAMENTE
2. Por cada notificación:
   a. Si tipo = "solicitud_recarga":
      → Leer payload.mensaje (texto listo para enviar) O construir desde payload.valor_recarga
   b. Si tipo = "obligacion_cumplida":
      → Usar payload.etiqueta y payload.monto_total
   c. Si tipo = "obligaciones_pagadas_grupal":
      → Iterar payload.obligaciones[] (array de {etiqueta, valor})
      → Construir mensaje con la lista de facturas pagadas
3. NO llamar EP11 ni EP12 después — ya están marcadas
```

**Segunda consulta del mismo usuario devuelve `[]`** (idempotente por diseño).

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

### EP12a: `GET /api/notificaciones/pendientes-hoy`

Para un **job global diario**. Devuelve todas las notificaciones `solicitud_recarga` creadas HOY en estado `pendiente`, para todos los usuarios. Las marca como `"entregada"` automáticamente.

> ⚠️ **Cambio v3:** Antes filtraba tipo `solicitud_recarga_inicio_mes`. Ahora filtra `solicitud_recarga`.

```http
GET /api/notificaciones/pendientes-hoy
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Respuesta (200):**
```json
{
  "ok": true,
  "data": {
    "total": 2,
    "notificaciones": [
      {
        "id": "e4c9a1f2-...",
        "usuario_id": "user-001",
        "tipo": "solicitud_recarga",
        "estado": "pendiente",
        "usuarios": {
          "nombre": "Laura",
          "apellido": "Duran",
          "telefono": "573046757626"
        },
        "payload": {
          "valor_recarga": 215000,
          "periodo": "2026-05-01",
          "mensaje": "Hola Laura Duran 👋🏼\n\nEs momento de recargar..."
        },
        "creado_en": "2026-05-06T09:00:15.000Z"
      }
    ]
  },
  "error": null
}
```

**Segunda consulta del mismo día devuelve `{ total: 0, notificaciones: [] }`** (idempotente).

---

## 7. Pagos

### EP13: `POST /api/pagos/crear`

Crea un pago para una factura. Requiere que la factura tenga `validacion_estado = "validada"` (aprobada por admin) y que el usuario tenga saldo suficiente.

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
| `INVALID_STATE_TRANSITION` | No se puede crear pago para factura con `validacion_estado='sin_validar'`. Debe estar `'validada'` por el admin. |
| `INSUFFICIENT_FUNDS` | Fondos insuficientes. Disponible: $X, Requerido: $Y |

---

## 8. Solicitudes de Recarga Automáticas

### EP14: `POST /api/solicitudes-recarga/generar`

Genera solicitudes de recarga según el plan. Requiere que la obligación tenga facturas en estado `validada` o `extraida`.

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
11. Crear pago por factura        → POST /api/pagos/crear  (solo si validacion_estado="validada")
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
  pendiente (sin_validar) → pendiente (validada) → pagada
                          → pendiente (rechazada) → anulada

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
