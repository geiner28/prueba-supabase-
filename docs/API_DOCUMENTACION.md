# 📘 DeOne Backend — Documentación Completa de API

## 📋 Índice

1. [Información General](#información-general)
2. [Autenticación](#autenticación)
3. [Endpoints](#endpoints)
   - [Health Check](#1-health-check)
   - [Usuarios](#2-usuarios)
   - [Obligaciones](#3-obligaciones)
   - [Facturas](#4-facturas)
   - [Recargas](#5-recargas)
   - [Revisiones Admin](#6-revisiones-admin)
   - [Disponibilidad](#7-disponibilidad)
   - [Pagos](#8-pagos)
4. [Flujo Completo — Escenario Real](#flujo-completo--escenario-real-paso-a-paso)

---

## Información General

| Campo | Valor |
|-------|-------|
| **Base URL** | `http://localhost:3000/api` |
| **Formato** | JSON (`Content-Type: application/json`) |
| **Respuesta estándar** | `{ "ok": true/false, "data": {...}, "error": null/{code, message} }` |

---

## Autenticación

Todos los endpoints (excepto `/api/health`) requieren un header de API Key:

| Header | Valor | Uso |
|--------|-------|-----|
| `x-bot-api-key` | `bot-secret-key-cambiar-en-produccion` | Endpoints del bot (WhatsApp) |
| `x-admin-api-key` | `admin-secret-key-cambiar-en-produccion` | Endpoints de administración |

> Algunos endpoints aceptan ambas keys (bot O admin). Se indica en cada endpoint.

---

## Endpoints

---

### 1. Health Check

#### `GET /api/health`

**Descripción:** Verifica que el servidor está activo.  
**Auth:** Ninguna  

**Request:**
```
GET http://localhost:3000/api/health
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "service": "DeOne Backend",
    "status": "running",
    "timestamp": "2026-02-12T18:00:00.000Z"
  },
  "error": null
}
```

---

### 2. Usuarios

#### 2.1 `POST /api/users/upsert`

**Descripción:** Crea un usuario nuevo o actualiza si ya existe (busca por teléfono). Si el usuario ya existe, actualiza los campos enviados y retorna 200. Si es nuevo, retorna 201.  
**Auth:** `x-bot-api-key` o `x-admin-api-key`

**Request:**
```
POST http://localhost:3000/api/users/upsert
Headers:
  Content-Type: application/json
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "telefono": "+573001234567",
  "nombre": "Juan",
  "apellido": "Pérez",
  "correo": "juan@email.com"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí (min 7 chars) | Teléfono del usuario con código de país |
| `nombre` | string | ❌ No | Nombre del usuario |
| `apellido` | string | ❌ No | Apellido del usuario |
| `correo` | string | ❌ No | Email válido |

**Response (201 — creado):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "creado": true
  },
  "error": null
}
```

**Response (200 — actualizado):**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "creado": false
  },
  "error": null
}
```

---

#### 2.2 `GET /api/users/by-telefono/:telefono`

**Descripción:** Busca un usuario por su número de teléfono. Retorna toda la info del usuario incluyendo sus ajustes.  
**Auth:** `x-admin-api-key`

**Request:**
```
GET http://localhost:3000/api/users/by-telefono/%2B573001234567
Headers:
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

> ⚠️ El `+` debe enviarse como `%2B` en la URL

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "telefono": "+573001234567",
    "nombre": "Juan",
    "apellido": "Pérez",
    "correo": "juan@email.com",
    "plan": "freemium",
    "activo": true,
    "direccion": null,
    "creado_en": "2026-02-12T15:00:00.000Z",
    "ajustes_usuario": {
      "recordatorios_activos": true,
      "dias_anticipacion_recordatorio": 3,
      "tipo_notificacion": "whatsapp",
      "umbral_monto_alto": 500000
    }
  },
  "error": null
}
```

**Response (404 — no encontrado):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Usuario no encontrado"
  }
}
```

---

### 3. Obligaciones

#### 3.1 `POST /api/obligaciones`

**Descripción:** Registra una nueva obligación (servicio público, crédito, etc.) para un usuario. Detecta duplicados por `usuario + servicio + numero_referencia`.  
**Auth:** `x-bot-api-key` o `x-admin-api-key`

**Request:**
```
POST http://localhost:3000/api/obligaciones
Headers:
  Content-Type: application/json
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "telefono": "+573001234567",
  "servicio": "EPM Energia",
  "tipo_referencia": "contrato",
  "numero_referencia": "CON-123456",
  "periodicidad": "mensual",
  "pagina_pago": "https://www.epm.com.co/pago"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario dueño |
| `servicio` | string | ✅ Sí | Nombre del servicio (EPM, Claro, etc.) |
| `tipo_referencia` | string | ✅ Sí | Tipo: contrato, factura, NIT, etc. |
| `numero_referencia` | string | ✅ Sí | Número único de referencia |
| `periodicidad` | string | ❌ No | `"mensual"` (default) o `"quincenal"` |
| `pagina_pago` | string | ❌ No | URL de la página de pago |

**Response (201):**
```json
{
  "ok": true,
  "data": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "servicio": "EPM Energia",
    "numero_referencia": "CON-123456"
  },
  "error": null
}
```

**Response (409 — duplicado):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "DUPLICATE",
    "message": "Ya existe una obligación con ese servicio y referencia"
  }
}
```

---

#### 3.2 `GET /api/obligaciones?telefono=...`

**Descripción:** Lista todas las obligaciones de un usuario por su teléfono.  
**Auth:** `x-bot-api-key` o `x-admin-api-key`

**Request:**
```
GET http://localhost:3000/api/obligaciones?telefono=%2B573001234567
Headers:
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

**Response (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "servicio": "EPM Energia",
      "tipo_referencia": "contrato",
      "numero_referencia": "CON-123456",
      "periodicidad": "mensual",
      "estado": "activa",
      "pagina_pago": "https://www.epm.com.co/pago"
    }
  ],
  "error": null
}
```

---

#### 3.3 `PUT /api/obligaciones/:id`

**Descripción:** Actualiza datos de una obligación existente.  
**Auth:** `x-admin-api-key`

**Request:**
```
PUT http://localhost:3000/api/obligaciones/b2c3d4e5-f6a7-8901-bcde-f12345678901
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "estado": "inactiva",
  "pagina_pago": "https://nueva-url.com/pago",
  "periodicidad": "quincenal"
}
```

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `estado` | string | ❌ No | `"activa"`, `"inactiva"` |
| `periodicidad` | string | ❌ No | `"mensual"`, `"quincenal"` |
| `pagina_pago` | string | ❌ No | URL |
| `quincena_objetivo` | number | ❌ No | 1 - 31 |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "estado": "inactiva"
  },
  "error": null
}
```

---

### 4. Facturas

#### 4.1 `POST /api/facturas/captura`

**Descripción:** Captura/registra una factura. El bot envía los datos extraídos de una imagen/PDF. Si la extracción es `"ok"`, el estado queda `extraida`. Si es `"dudosa"`, queda `en_revision` y se crea automáticamente una revisión admin.  
**Auth:** `x-bot-api-key`

**Request:**
```
POST http://localhost:3000/api/facturas/captura
Headers:
  Content-Type: application/json
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

**Body JSON (extracción exitosa):**
```json
{
  "telefono": "+573001234567",
  "obligacion_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "periodo": "2026-02-15",
  "monto": 185000,
  "fecha_vencimiento": "2026-03-01",
  "fecha_emision": "2026-02-01",
  "origen": "imagen",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.95
}
```

**Body JSON (extracción dudosa):**
```json
{
  "telefono": "+573001234567",
  "obligacion_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "periodo": "2026-03-01",
  "monto": 92000,
  "fecha_vencimiento": "2026-04-01",
  "origen": "imagen",
  "extraccion_estado": "dudosa",
  "extraccion_confianza": 0.35,
  "extraccion_json": { "raw": "texto borroso extraido de la imagen" }
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `obligacion_id` | UUID | ✅ Sí | ID de la obligación asociada |
| `periodo` | string | ✅ Sí | Fecha del periodo (se normaliza a YYYY-MM-01) |
| `monto` | number | ❌ No | Monto de la factura (positivo) |
| `fecha_vencimiento` | string | ❌ No | Fecha límite de pago |
| `fecha_emision` | string | ❌ No | Fecha de emisión |
| `origen` | string | ❌ No | `"imagen"`, `"pdf"`, `"audio"`, `"texto"` |
| `archivo_url` | string | ❌ No | URL del archivo en Storage |
| `extraccion_estado` | string | ❌ No | `"ok"` (default), `"dudosa"`, `"fallida"` |
| `extraccion_confianza` | number | ❌ No | 0.0 - 1.0 |
| `extraccion_json` | object | ❌ No | JSON con datos raw de la extracción |

**Response (201 — extracción OK):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "estado": "extraida",
    "requiere_revision": false
  },
  "error": null
}
```

**Response (201 — extracción dudosa, genera revisión):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "estado": "en_revision",
    "requiere_revision": true,
    "revision_id": "e5f6a7b8-c9d0-1234-efab-345678901234"
  },
  "error": null
}
```

---

#### 4.2 `PUT /api/facturas/:id/validar`

**Descripción:** Un administrador valida una factura, confirmando/corrigiendo monto y fechas. Cambia el estado a `validada`.  
**Auth:** `x-admin-api-key`  
**Transiciones válidas:** `extraida` → `validada`, `en_revision` → `validada`

**Request:**
```
PUT http://localhost:3000/api/facturas/{factura_id}/validar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "monto": 185000,
  "fecha_vencimiento": "2026-03-01",
  "fecha_emision": "2026-02-01",
  "observaciones_admin": "Datos verificados correctamente"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `monto` | number | ✅ Sí | Monto confirmado (positivo) |
| `fecha_vencimiento` | string | ✅ Sí | Fecha de vencimiento confirmada |
| `fecha_emision` | string | ❌ No | Fecha de emisión |
| `observaciones_admin` | string | ❌ No | Notas del admin |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "estado": "validada"
  },
  "error": null
}
```

**Response (409 — estado inválido):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_STATE",
    "message": "Transición de estado no permitida: validada → validada"
  }
}
```

---

#### 4.3 `PUT /api/facturas/:id/rechazar`

**Descripción:** Un administrador rechaza una factura.  
**Auth:** `x-admin-api-key`  
**Transiciones válidas:** `extraida` → `rechazada`, `en_revision` → `rechazada`

**Request:**
```
PUT http://localhost:3000/api/facturas/{factura_id}/rechazar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "motivo_rechazo": "Imagen ilegible, no se puede verificar el monto"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_rechazo` | string | ✅ Sí | Razón del rechazo |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "estado": "rechazada"
  },
  "error": null
}
```

---

### 5. Recargas

#### 5.1 `POST /api/recargas/reportar`

**Descripción:** El usuario reporta que hizo una recarga/consignación de dinero. Si envía `referencia_tx` y ya existe una recarga con esa referencia, retorna la existente (idempotencia, 200). Si es nueva, retorna 201.  
**Auth:** `x-bot-api-key`

**Request:**
```
POST http://localhost:3000/api/recargas/reportar
Headers:
  Content-Type: application/json
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "telefono": "+573001234567",
  "periodo": "2026-02-01",
  "monto": 300000,
  "comprobante_url": "comprobantes_recarga/user1/2026-02/recarga1.jpg",
  "referencia_tx": "TX-PSE-12345"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `periodo` | string | ✅ Sí | Periodo de la recarga (YYYY-MM-DD) |
| `monto` | number | ✅ Sí | Monto de la recarga (positivo) |
| `comprobante_url` | string | ✅ Sí | URL del comprobante |
| `referencia_tx` | string | ❌ No | Referencia de transacción (para idempotencia) |

**Response (201 — nueva):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "f6a7b8c9-d0e1-2345-fab0-456789012345",
    "estado": "reportada"
  },
  "error": null
}
```

**Response (200 — idempotente, ya existía):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "f6a7b8c9-d0e1-2345-fab0-456789012345",
    "estado": "reportada",
    "mensaje": "Recarga ya existente con esa referencia"
  },
  "error": null
}
```

---

#### 5.2 `PUT /api/recargas/:id/aprobar`

**Descripción:** El admin verifica el comprobante y aprueba la recarga. Cambia estado a `aprobada`.  
**Auth:** `x-admin-api-key`  
**Transiciones válidas:** `reportada` → `aprobada`

**Request:**
```
PUT http://localhost:3000/api/recargas/{recarga_id}/aprobar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "observaciones_admin": "Comprobante verificado, monto correcto"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `observaciones_admin` | string | ❌ No | Notas del admin |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "f6a7b8c9-d0e1-2345-fab0-456789012345",
    "estado": "aprobada"
  },
  "error": null
}
```

---

#### 5.3 `PUT /api/recargas/:id/rechazar`

**Descripción:** El admin rechaza la recarga porque el comprobante no es válido.  
**Auth:** `x-admin-api-key`  
**Transiciones válidas:** `reportada` → `rechazada`

**Request:**
```
PUT http://localhost:3000/api/recargas/{recarga_id}/rechazar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "motivo_rechazo": "Comprobante borroso, no se verifica el monto"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_rechazo` | string | ✅ Sí | Razón del rechazo |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "f6a7b8c9-d0e1-2345-fab0-456789012345",
    "estado": "rechazada"
  },
  "error": null
}
```

---

### 6. Revisiones Admin

#### 6.1 `GET /api/revisiones`

**Descripción:** Lista las revisiones pendientes para el admin. Se pueden filtrar por tipo y estado.  
**Auth:** `x-admin-api-key`

**Request (sin filtros):**
```
GET http://localhost:3000/api/revisiones
Headers:
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Request (con filtros):**
```
GET http://localhost:3000/api/revisiones?tipo=factura&estado=pendiente
Headers:
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

| Query Param | Tipo | Requerido | Valores |
|-------------|------|-----------|---------|
| `tipo` | string | ❌ No | `"factura"`, `"recarga"` |
| `estado` | string | ❌ No | `"pendiente"`, `"en_proceso"`, `"resuelta"`, `"descartada"` |

**Response (200):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
      "tipo": "factura",
      "estado": "pendiente",
      "razon": "Extracción dudosa (confianza: 0.35)",
      "prioridad": 1,
      "factura_id": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "recarga_id": null,
      "creado_en": "2026-02-12T16:00:00.000Z",
      "usuarios": {
        "nombre": "Juan",
        "telefono": "+573001234567"
      }
    }
  ],
  "error": null
}
```

---

#### 6.2 `PUT /api/revisiones/:id/tomar`

**Descripción:** El admin "toma" una revisión para trabajar en ella. Cambia estado a `en_proceso`.  
**Auth:** `x-admin-api-key`

**Request:**
```
PUT http://localhost:3000/api/revisiones/{revision_id}/tomar
Headers:
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body:** Ninguno requerido

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
    "estado": "en_proceso"
  },
  "error": null
}
```

---

#### 6.3 `PUT /api/revisiones/:id/descartar`

**Descripción:** Descarta una revisión que ya no es necesaria.  
**Auth:** `x-admin-api-key`

**Request:**
```
PUT http://localhost:3000/api/revisiones/{revision_id}/descartar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "razon": "Ya se resolvió directamente con el usuario"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `razon` | string | ❌ No | Motivo del descarte |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
    "estado": "descartada"
  },
  "error": null
}
```

---

### 7. Disponibilidad

#### 7.1 `GET /api/disponible`

**Descripción:** Calcula el saldo disponible de un usuario en un periodo. Fórmula: `disponible = recargas_aprobadas − pagos_pagados`.  
**Auth:** `x-bot-api-key` o `x-admin-api-key`

**Request:**
```
GET http://localhost:3000/api/disponible?telefono=%2B573001234567&periodo=2026-02-01
Headers:
  x-bot-api-key: bot-secret-key-cambiar-en-produccion
```

| Query Param | Tipo | Requerido | Descripción |
|-------------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `periodo` | string | ✅ Sí | Periodo a consultar (YYYY-MM-DD) |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "periodo": "2026-02-01",
    "total_recargas_aprobadas": 300000,
    "total_pagos_pagados": 185000,
    "disponible": 115000
  },
  "error": null
}
```

---

### 8. Pagos

#### 8.1 `POST /api/pagos/crear`

**Descripción:** Crea un pago para una factura validada. Verifica que haya fondos disponibles suficientes (recargas aprobadas − pagos existentes ≥ monto factura).  
**Auth:** `x-admin-api-key`  
**Precondiciones:** La factura debe estar en estado `validada` y debe haber saldo disponible.

**Request:**
```
POST http://localhost:3000/api/pagos/crear
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "telefono": "+573001234567",
  "factura_id": "c3d4e5f6-a7b8-9012-cdef-123456789012"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `factura_id` | UUID | ✅ Sí | ID de la factura validada |

**Response (201):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "a7b8c9d0-e1f2-3456-ab01-567890123456",
    "estado": "en_proceso",
    "monto": 185000
  },
  "error": null
}
```

**Response (409 — fondos insuficientes):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Fondos insuficientes. Disponible: 50000, Requerido: 185000"
  }
}
```

---

#### 8.2 `PUT /api/pagos/:id/confirmar`

**Descripción:** Confirma que el pago fue exitoso. Cambia el pago a `pagado` y la factura a `pagada`.  
**Auth:** `x-admin-api-key`  
**Transiciones:** pago `en_proceso` → `pagado`, factura `validada` → `pagada`

**Request:**
```
PUT http://localhost:3000/api/pagos/{pago_id}/confirmar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "proveedor_pago": "PSE",
  "referencia_pago": "PSE-REF-99887766",
  "comprobante_pago_url": "comprobantes_pago/user1/2026-02/pago1.pdf"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `proveedor_pago` | string | ❌ No | Pasarela usada (PSE, Nequi, etc.) |
| `referencia_pago` | string | ❌ No | Referencia de la transacción |
| `comprobante_pago_url` | string | ❌ No | URL del comprobante |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "a7b8c9d0-e1f2-3456-ab01-567890123456",
    "estado": "pagado",
    "factura_estado": "pagada"
  },
  "error": null
}
```

---

#### 8.3 `PUT /api/pagos/:id/fallar`

**Descripción:** Marca un pago como fallido (error en pasarela, timeout, etc.).  
**Auth:** `x-admin-api-key`  
**Transiciones:** pago `en_proceso` → `fallido`

**Request:**
```
PUT http://localhost:3000/api/pagos/{pago_id}/fallar
Headers:
  Content-Type: application/json
  x-admin-api-key: admin-secret-key-cambiar-en-produccion
```

**Body JSON:**
```json
{
  "error_detalle": "Timeout en la pasarela de pago, el banco no respondió"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `error_detalle` | string | ✅ Sí | Descripción del error |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "a7b8c9d0-e1f2-3456-ab01-567890123456",
    "estado": "fallido"
  },
  "error": null
}
```

---

## Flujo Completo — Escenario Real Paso a Paso

> Este flujo simula un caso real: un usuario registra sus servicios por WhatsApp, sube fotos de sus facturas, recarga dinero, un admin revisa y aprueba todo, y finalmente se pagan las facturas.

### 🎬 Escenario: María quiere que DeOne le pague sus facturas

---

### Paso 1: María se registra por WhatsApp

El bot crea su usuario:

```
POST http://localhost:3000/api/users/upsert
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "nombre": "María",
  "apellido": "García",
  "correo": "maria.garcia@gmail.com"
}
```
> ✅ Respuesta: `201` → `usuario_id: "USR-001..."`

---

### Paso 2: María registra sus servicios

**Servicio 1: Energía**
```
POST http://localhost:3000/api/obligaciones
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "servicio": "EPM Energia",
  "tipo_referencia": "contrato",
  "numero_referencia": "ENE-445566",
  "periodicidad": "mensual"
}
```
> ✅ Respuesta: `201` → `obligacion_id: "OBL-ENERGIA..."`

**Servicio 2: Internet**
```
POST http://localhost:3000/api/obligaciones
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "servicio": "Claro Internet",
  "tipo_referencia": "contrato",
  "numero_referencia": "INT-778899",
  "periodicidad": "mensual"
}
```
> ✅ Respuesta: `201` → `obligacion_id: "OBL-INTERNET..."`

---

### Paso 3: María envía foto de su factura de energía (extracción OK)

El bot procesa la imagen y extrae los datos correctamente:

```
POST http://localhost:3000/api/facturas/captura
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "obligacion_id": "OBL-ENERGIA...",
  "periodo": "2026-02-15",
  "monto": 145000,
  "fecha_vencimiento": "2026-03-05",
  "fecha_emision": "2026-02-01",
  "origen": "imagen",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.97
}
```
> ✅ Respuesta: `201` → `factura_id: "FACT-ENERGIA..."`, `estado: "extraida"`, `requiere_revision: false`

---

### Paso 4: María envía foto de su factura de internet (imagen borrosa)

La extracción es dudosa, se genera revisión automática:

```
POST http://localhost:3000/api/facturas/captura
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "obligacion_id": "OBL-INTERNET...",
  "periodo": "2026-02-10",
  "monto": 89000,
  "fecha_vencimiento": "2026-03-10",
  "origen": "imagen",
  "extraccion_estado": "dudosa",
  "extraccion_confianza": 0.30,
  "extraccion_json": { "raw": "Cl4r0 Int...net $89.0?0" }
}
```
> ⚠️ Respuesta: `201` → `factura_id: "FACT-INTERNET..."`, `estado: "en_revision"`, `requiere_revision: true`, `revision_id: "REV-001..."`

---

### Paso 5: María hace una recarga de $300.000

```
POST http://localhost:3000/api/recargas/reportar
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "periodo": "2026-02-01",
  "monto": 300000,
  "comprobante_url": "comprobantes_recarga/maria/2026-02/nequi-300k.jpg",
  "referencia_tx": "NEQ-20260212-001"
}
```
> ✅ Respuesta: `201` → `recarga_id: "REC-001..."`, `estado: "reportada"`

---

### Paso 6: El admin revisa las revisiones pendientes

```
GET http://localhost:3000/api/revisiones?estado=pendiente
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
> ✅ Respuesta: `200` → Lista con la revisión de la factura de internet

El admin toma la revisión:

```
PUT http://localhost:3000/api/revisiones/REV-001.../tomar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
> ✅ Respuesta: `200` → `estado: "en_proceso"`

---

### Paso 7: El admin valida ambas facturas

**Factura de energía (ya estaba extraida, solo valida):**

```
PUT http://localhost:3000/api/facturas/FACT-ENERGIA.../validar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "monto": 145000,
  "fecha_vencimiento": "2026-03-05",
  "fecha_emision": "2026-02-01",
  "observaciones_admin": "Datos correctos"
}
```
> ✅ Respuesta: `200` → `estado: "validada"`

**Factura de internet (estaba en revisión, admin corrige el monto):**

```
PUT http://localhost:3000/api/facturas/FACT-INTERNET.../validar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "monto": 89500,
  "fecha_vencimiento": "2026-03-10",
  "fecha_emision": "2026-02-05",
  "observaciones_admin": "Monto corregido de 89000 a 89500, verificado contra PDF original"
}
```
> ✅ Respuesta: `200` → `estado: "validada"`

---

### Paso 8: El admin aprueba la recarga

```
PUT http://localhost:3000/api/recargas/REC-001.../aprobar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "observaciones_admin": "Comprobante Nequi verificado, monto $300.000 correcto"
}
```
> ✅ Respuesta: `200` → `estado: "aprobada"`

---

### Paso 9: Verificar disponibilidad antes de pagar

```
GET http://localhost:3000/api/disponible?telefono=%2B573015551234&periodo=2026-02-01
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
> ✅ Respuesta: `200`
```json
{
  "ok": true,
  "data": {
    "periodo": "2026-02-01",
    "total_recargas_aprobadas": 300000,
    "total_pagos_pagados": 0,
    "disponible": 300000
  }
}
```
> María tiene $300.000 disponibles. Sus facturas suman $145.000 + $89.500 = $234.500. ¡Alcanza!

---

### Paso 10: Pagar la factura de energía ($145.000)

```
POST http://localhost:3000/api/pagos/crear
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "factura_id": "FACT-ENERGIA..."
}
```
> ✅ Respuesta: `201` → `pago_id: "PAGO-001..."`, `estado: "en_proceso"`, `monto: 145000`

El sistema confirma el pago:

```
PUT http://localhost:3000/api/pagos/PAGO-001.../confirmar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "proveedor_pago": "PSE",
  "referencia_pago": "PSE-20260212-ENERGIA-001",
  "comprobante_pago_url": "comprobantes_pago/maria/2026-02/energia.pdf"
}
```
> ✅ Respuesta: `200` → `estado: "pagado"`, `factura_estado: "pagada"`

---

### Paso 11: Pagar la factura de internet ($89.500)

```
POST http://localhost:3000/api/pagos/crear
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "telefono": "+573015551234",
  "factura_id": "FACT-INTERNET..."
}
```
> ✅ Respuesta: `201` → `pago_id: "PAGO-002..."`, `estado: "en_proceso"`, `monto: 89500`

Confirmar:

```
PUT http://localhost:3000/api/pagos/PAGO-002.../confirmar
Header: x-admin-api-key: admin-secret-key-cambiar-en-produccion
```
```json
{
  "proveedor_pago": "PSE",
  "referencia_pago": "PSE-20260212-INTERNET-001",
  "comprobante_pago_url": "comprobantes_pago/maria/2026-02/internet.pdf"
}
```
> ✅ Respuesta: `200` → `estado: "pagado"`, `factura_estado: "pagada"`

---

### Paso 12: Verificar saldo final

```
GET http://localhost:3000/api/disponible?telefono=%2B573015551234&periodo=2026-02-01
Header: x-bot-api-key: bot-secret-key-cambiar-en-produccion
```
> ✅ Respuesta: `200`
```json
{
  "ok": true,
  "data": {
    "periodo": "2026-02-01",
    "total_recargas_aprobadas": 300000,
    "total_pagos_pagados": 234500,
    "disponible": 65500
  }
}
```

> 🎉 **Resultado final:** María recargó $300.000, se pagaron sus 2 facturas ($234.500) y le quedan $65.500 disponibles para el siguiente periodo.

---

## 📊 Diagrama de Estados

### Facturas
```
captura(ok)      captura(dudosa)
    ↓                  ↓
 extraida ——→ en_revision
    ↓    ↘        ↓    ↘
 validada  rechazada  validada  rechazada
    ↓
  pagada
```

### Recargas
```
reportar
   ↓
reportada
   ↓     ↘
aprobada  rechazada
```

### Pagos
```
crear
  ↓
en_proceso
  ↓      ↘
pagado   fallido
```

### Revisiones Admin
```
(creación automática)
       ↓
   pendiente
   ↓       ↘
en_proceso  descartada
   ↓
 resuelta
```

---

## ❌ Errores Comunes

| HTTP | Código | Descripción |
|------|--------|-------------|
| 400 | `VALIDATION_ERROR` | Body/query no cumple el schema (campos faltantes o inválidos) |
| 401 | `UNAUTHORIZED` | API Key faltante o incorrecta |
| 404 | `NOT_FOUND` | Recurso no encontrado (usuario, factura, etc.) |
| 409 | `DUPLICATE` | Registro duplicado (obligación con misma referencia) |
| 409 | `INVALID_STATE` | Transición de estado no permitida (ej: validar una factura ya pagada) |
| 409 | `INSUFFICIENT_FUNDS` | No hay saldo suficiente para crear el pago |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |
