# 📘 DeOne Backend — Documentación Completa de API

> **Última actualización:** 13 de marzo de 2026  
> **Versión:** 2.0  
> **Base URL local:** `http://localhost:3001/api`  
> **Base URL producción (Render):** `https://tu-app.onrender.com/api`

---

## 📋 Índice

1. [Información General](#-información-general)
2. [Autenticación](#-autenticación)
3. [Formato Estándar de Respuesta](#-formato-estándar-de-respuesta)
4. [Códigos HTTP y Errores](#-códigos-http-y-errores)
5. **Endpoints:**
   - [Health Check](#1-health-check)
   - [Usuarios](#2-usuarios-apiusers) (4 endpoints)
   - [Obligaciones](#3-obligaciones-apiobligaciones) (4 endpoints)
   - [Facturas](#4-facturas-apifacturas) (4 endpoints)
   - [Recargas](#5-recargas-apirecargas) (3 endpoints)
   - [Disponibilidad (Saldo)](#6-disponibilidad-saldo-apidisponible) (1 endpoint)
   - [Pagos](#7-pagos-apipagos) (3 endpoints)
   - [Revisiones Admin](#8-revisiones-admin-apirevisiones) (3 endpoints)
  - [Notificaciones](#9-notificaciones-apinotificaciones) (7 endpoints)
   - [Admin Dashboard](#10-admin-dashboard-apiadmin) (4 endpoints)
6. [Máquinas de Estado](#-máquinas-de-estado)
7. [Comportamientos Automáticos](#-comportamientos-automáticos)
8. [Flujo Completo — Caso Real con Datos de Prueba](#-flujo-completo--caso-real-con-datos-de-prueba)
9. [Guía para Nuevo Frontend de Administración](#-guía-para-nuevo-frontend-de-administración)

---

## 📌 Información General

| Campo | Valor |
|-------|-------|
| **Base URL** | `http://localhost:3001/api` |
| **Formato de datos** | JSON (`Content-Type: application/json`) |
| **Framework** | Express 5 + Node.js |
| **Base de datos** | Supabase (PostgreSQL) |
| **Validación** | Zod (body y query params) |
| **Total de endpoints** | **35** |

---

## 🔐 Autenticación

Todos los endpoints (excepto `/api/health`) requieren un header de autenticación:

| Header | Valor | Quién lo usa |
|--------|-------|--------------|
| `x-bot-api-key` | `TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3` | Bot de WhatsApp |
| `x-admin-api-key` | `TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3` | Panel Admin / Frontend |

> **Nota:** Algunos endpoints aceptan **ambos** headers (bot o admin). Se indica en cada endpoint con 🤖 (bot), 👨‍💼 (admin), o 🤖👨‍💼 (ambos).

**Si no envías el header correcto:**
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "API Key requerida" }
}
```

---

## 📦 Formato Estándar de Respuesta

**TODAS** las respuestas siguen este formato:

```json
{
  "ok": true,       // true = éxito, false = error
  "data": { ... },  // Los datos (null cuando hay error)
  "error": null      // null cuando ok=true, objeto con code+message cuando ok=false
}
```

**Ejemplo de éxito:**
```json
{ "ok": true, "data": { "usuario_id": "abc-123" }, "error": null }
```

**Ejemplo de error:**
```json
{ "ok": false, "data": null, "error": { "code": "NOT_FOUND", "message": "Usuario no encontrado" } }
```

---

## ❌ Códigos HTTP y Errores

| HTTP | Código interno | Cuándo ocurre | Ejemplo |
|------|---------------|---------------|---------|
| `200` | — | Operación exitosa | GET, PUT exitosos |
| `201` | — | Recurso creado | POST exitosos |
| `400` | `VALIDATION_ERROR` | Body o query inválido (Zod) | Campo faltante, tipo incorrecto |
| `401` | `UNAUTHORIZED` | API Key faltante o incorrecta | Sin header x-bot-api-key |
| `404` | `NOT_FOUND` | Recurso no existe | Usuario, factura, obligación no encontrada |
| `409` | `INVALID_STATE` | Transición de estado no permitida | Validar factura ya pagada |
| `409` | `INSUFFICIENT_FUNDS` | Saldo insuficiente para pagar | Crear pago sin fondos |
| `500` | `INTERNAL_ERROR` | Error interno del servidor | Error de base de datos |

**Ejemplo de error de validación (400):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos inválidos",
    "details": [
      { "path": "telefono", "message": "Teléfono requerido" },
      { "path": "nombre", "message": "Expected string, received number" }
    ]
  }
}
```

---

# 📡 ENDPOINTS

---

## 1. Health Check

### `GET /api/health`

> Verifica que el servidor esté activo. **No requiere autenticación.**

**Request:**
```
GET /api/health
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "service": "DeOne Backend",
    "status": "running",
    "timestamp": "2026-02-20T03:58:22.915Z"
  },
  "error": null
}
```

---

## 2. Usuarios (`/api/users`)

---

### 2.1 `POST /api/users/upsert` — Crear o actualizar usuario

> 🤖👨‍💼 Crea un usuario nuevo (201) o actualiza si ya existe por teléfono (200).  
> Al crear, se generan automáticamente los **ajustes del usuario** (tabla `ajustes_usuario`).

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí (min 7 chars) | Número de teléfono del usuario |
| `nombre` | string | ❌ No | Nombre del usuario |
| `apellido` | string | ❌ No | Apellido del usuario |
| `correo` | string | ❌ No | Email válido |

**Ejemplo — Crear usuario nuevo:**
```json
{
  "telefono": "3001112233",
  "nombre": "Carlos",
  "apellido": "Frontend",
  "correo": "carlos.test@email.com"
}
```

**Response (201) — Usuario creado:**
```json
{
  "ok": true,
  "data": {
    "usuario": {
      "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
      "creado_en": "2026-02-20T03:59:07.226464+00:00",
      "nombre": "Carlos",
      "apellido": "Frontend",
      "correo": "carlos.test@email.com",
      "telefono": "3001112233",
      "direccion": null,
      "plan": "control",
      "activo": true
    },
    "ajustes": {
      "id": "38a7136d-a1d3-4e60-85e0-fe4af589004d",
      "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
      "tipo_notificacion": "whatsapp",
      "umbral_monto_alto": 300000,
      "recordatorios_activos": true,
      "dias_anticipacion_recordatorio": 5,
      "requiere_autorizacion_monto_alto": true
    },
    "es_nuevo": true
  },
  "error": null
}
```

**Ejemplo — Actualizar usuario existente (mismo teléfono):**
```json
{
  "telefono": "3001112233",
  "nombre": "Carlos Actualizado"
}
```

**Response (200) — Usuario actualizado:**
```json
{
  "ok": true,
  "data": {
    "usuario": {
      "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
      "nombre": "Carlos Actualizado",
      "apellido": "Frontend",
      "telefono": "3001112233",
      "plan": "control",
      "activo": true
    },
    "ajustes": { "..." : "..." },
    "es_nuevo": false
  },
  "error": null
}
```

**Response (400) — Validación fallida:**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos inválidos",
    "details": [{ "path": "telefono", "message": "Teléfono requerido" }]
  }
}
```

---

### 2.2 `PUT /api/users/plan` — Cambiar plan del usuario

> 🤖👨‍💼 Cambia el plan de un usuario. Planes disponibles: `control`, `tranquilidad`, `respaldo`.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores permitidos |
|-------|------|-----------|-------------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `plan` | string | ✅ Sí | `"control"`, `"tranquilidad"`, `"respaldo"` |

**Ejemplo:**
```json
{
  "telefono": "3001112233",
  "plan": "tranquilidad"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "usuario": {
      "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
      "nombre": "Carlos Actualizado",
      "apellido": "Frontend",
      "telefono": "3001112233",
      "plan": "tranquilidad",
      "activo": true
    },
    "plan_anterior": "control",
    "plan_nuevo": "tranquilidad"
  },
  "error": null
}
```

---

### 2.3 `GET /api/users/by-telefono/:telefono` — Buscar usuario por teléfono

> 👨‍💼 Retorna el usuario completo con sus ajustes.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Request:**
```
GET /api/users/by-telefono/3001112233
```

**Response (200) — Encontrado:**
```json
{
  "ok": true,
  "data": {
    "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "creado_en": "2026-02-20T03:59:07.226464+00:00",
    "nombre": "Carlos Actualizado",
    "apellido": "Frontend",
    "correo": "carlos.test@email.com",
    "telefono": "3001112233",
    "direccion": null,
    "plan": "tranquilidad",
    "activo": true,
    "ajustes_usuario": {
      "id": "38a7136d-a1d3-4e60-85e0-fe4af589004d",
      "tipo_notificacion": "whatsapp",
      "umbral_monto_alto": 300000,
      "recordatorios_activos": true,
      "dias_anticipacion_recordatorio": 5,
      "requiere_autorizacion_monto_alto": true
    }
  },
  "error": null
}
```

**Response (404) — No encontrado:**
```json
{
  "ok": false,
  "data": null,
  "error": "Usuario no encontrado"
}
```

---

### 2.4 `GET /api/users` — Listar usuarios (paginado + búsqueda)

> 👨‍💼 Lista todos los usuarios con paginación y búsqueda opcional.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | `1` | Página actual |
| `limit` | number | `20` | Registros por página (máx 100) |
| `search` | string | — | Busca en nombre, teléfono o correo |

**Ejemplo:**
```
GET /api/users?page=1&limit=10&search=carlos
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "usuarios": [
      {
        "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
        "nombre": "Carlos Actualizado",
        "apellido": "Frontend",
        "correo": "carlos.test@email.com",
        "telefono": "3001112233",
        "plan": "tranquilidad",
        "activo": true,
        "ajustes_usuario": {
          "tipo_notificacion": "whatsapp",
          "umbral_monto_alto": 300000,
          "recordatorios_activos": true,
          "dias_anticipacion_recordatorio": 5,
          "requiere_autorizacion_monto_alto": true
        }
      },
      {
        "id": "9a1ea3b4-f9a7-4990-a681-18c6447adc73",
        "nombre": "Carlos",
        "apellido": "Rodriguez",
        "telefono": "3005555555",
        "plan": "control",
        "activo": true,
        "ajustes_usuario": { "..." : "..." }
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 10,
    "total_pages": 1
  },
  "error": null
}
```

---

## 3. Obligaciones (`/api/obligaciones`)

> **Concepto:** Una obligación es un **compromiso de pago de un periodo** (ej: "Pagos de Febrero 2026"). Contiene múltiples **facturas** (agua, gas, energía). Se auto-completa cuando todas sus facturas quedan pagadas.

---

### 3.1 `POST /api/obligaciones` — Crear obligación

> 🤖👨‍💼 Crea una obligación para un periodo.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `descripcion` | string | ✅ Sí | Descripción (ej: "Servicios Febrero 2026") |
| `periodo` | string | ✅ Sí | Periodo en formato YYYY-MM-DD (se normaliza al 1er día del mes) |

**Ejemplo:**
```json
{
  "telefono": "3001112233",
  "descripcion": "Servicios Febrero 2026",
  "periodo": "2026-02-01"
}
```

**Response (201) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "81b23515-aa5e-4566-9adf-fa027db91757",
    "creado_en": "2026-02-20T04:00:06.285+00:00",
    "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "descripcion": "Servicios Febrero 2026",
    "servicio": "Servicios Febrero 2026",
    "tipo_referencia": "periodo",
    "numero_referencia": "2026-02-01-1740020406283",
    "periodicidad": null,
    "pagina_pago": null,
    "estado": "activa",
    "periodo": "2026-02-01",
    "total_facturas": 0,
    "facturas_pagadas": 0,
    "monto_total": 0,
    "monto_pagado": 0,
    "completada_en": null
  },
  "error": null
}
```

---

### 3.2 `GET /api/obligaciones?telefono=...` — Listar obligaciones de un usuario

> 🤖👨‍💼 Lista todas las obligaciones del usuario con sus facturas y progreso calculado.

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `estado` | string | ❌ No | Filtrar: `activa`, `en_progreso`, `completada`, `cancelada` |

**Ejemplo:**
```
GET /api/obligaciones?telefono=3001112233
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "81b23515-aa5e-4566-9adf-fa027db91757",
      "descripcion": "Servicios Febrero 2026",
      "estado": "completada",
      "periodo": "2026-02-01",
      "completada_en": "2026-02-20T04:03:56.136+00:00",
      "facturas": [
        {
          "id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
          "servicio": "EPM Energía",
          "monto": 85000,
          "estado": "pagada",
          "periodo": "2026-02-01"
        },
        {
          "id": "989491ed-9119-433f-b88d-01381b87b0dc",
          "servicio": "Agua EPM",
          "monto": 45000,
          "estado": "pagada",
          "periodo": "2026-02-01"
        },
        {
          "id": "07a7d72d-a3fd-4f2d-8ba2-b8e72dce3d37",
          "servicio": "Gas Natural Dudosa",
          "monto": 32000,
          "estado": "rechazada",
          "periodo": "2026-02-01"
        }
      ],
      "total_facturas": 3,
      "facturas_pagadas": 2,
      "monto_total": 162000,
      "monto_pagado": 130000,
      "progreso": 67
    }
  ],
  "error": null
}
```

---

### 3.3 `GET /api/obligaciones/:id` — Detalle de una obligación

> 🤖👨‍💼 Retorna el detalle completo de una obligación con facturas e info del usuario.

**Request:**
```
GET /api/obligaciones/81b23515-aa5e-4566-9adf-fa027db91757
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "81b23515-aa5e-4566-9adf-fa027db91757",
    "descripcion": "Servicios Febrero 2026",
    "estado": "completada",
    "periodo": "2026-02-01",
    "completada_en": "2026-02-20T04:03:56.136+00:00",
    "usuarios": {
      "nombre": "Carlos Actualizado",
      "apellido": "Frontend",
      "telefono": "3001112233"
    },
    "facturas": [
      {
        "id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
        "servicio": "EPM Energía",
        "monto": 85000,
        "estado": "pagada"
      },
      {
        "id": "989491ed-9119-433f-b88d-01381b87b0dc",
        "servicio": "Agua EPM",
        "monto": 45000,
        "estado": "pagada"
      },
      {
        "id": "07a7d72d-a3fd-4f2d-8ba2-b8e72dce3d37",
        "servicio": "Gas Natural Dudosa",
        "monto": 32000,
        "estado": "rechazada"
      }
    ],
    "total_facturas": 3,
    "facturas_pagadas": 2,
    "monto_total": 162000,
    "monto_pagado": 130000,
    "progreso": 67
  },
  "error": null
}
```

**Response (404):**
```json
{ "ok": false, "data": null, "error": "Obligación no encontrada" }
```

---

### 3.4 `PUT /api/obligaciones/:id` — Actualizar obligación

> 👨‍💼 Actualiza la descripción y/o estado de una obligación.

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `descripcion` | string | ❌ No | Nueva descripción |
| `estado` | string | ❌ No | `"activa"`, `"en_progreso"`, `"completada"`, `"cancelada"` |

**Ejemplo:**
```json
{
  "estado": "completada",
  "descripcion": "Servicios Feb 2026 - Pagados"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "81b23515-aa5e-4566-9adf-fa027db91757",
    "descripcion": "Servicios Feb 2026 - Pagados",
    "estado": "completada",
    "completada_en": "2026-02-20T04:01:04.397+00:00",
    "periodo": "2026-02-01"
  },
  "error": null
}
```

---

## 4. Facturas (`/api/facturas`)

> **Concepto:** Una factura es un **servicio individual** (EPM Energía, Agua, Gas) que pertenece a una obligación. El bot captura la factura y el admin la valida o rechaza.

---

### 4.1 `POST /api/facturas/captura` — Registrar factura

> 🤖 El bot registra una factura extraída de imagen/PDF.  
> Si `extraccion_estado` es `"ok"` → estado `extraida`.  
> Si es `"dudosa"` o `"fallida"` → estado `en_revision` + se crea revisión admin automáticamente.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `obligacion_id` | UUID | ✅ Sí | ID de la obligación asociada |
| `servicio` | string | ✅ Sí | Nombre del servicio (ej: "EPM Energía") |
| `monto` | number | ✅ Sí | Monto positivo |
| `periodo` | string | ❌ No | Periodo (se toma de la obligación si no se envía) |
| `fecha_vencimiento` | string | ❌ No | Fecha límite de pago |
| `fecha_emision` | string | ❌ No | Fecha de emisión |
| `origen` | string | ❌ No | `"imagen"`, `"pdf"`, `"audio"`, `"texto"` |
| `archivo_url` | string | ❌ No | URL del archivo original |
| `extraccion_estado` | string | ❌ No | `"ok"` (default), `"dudosa"`, `"fallida"` |
| `extraccion_json` | object | ❌ No | Datos raw de la extracción |
| `extraccion_confianza` | number | ❌ No | 0.0 a 1.0 |

**Ejemplo — Extracción exitosa:**
```json
{
  "telefono": "3001112233",
  "obligacion_id": "81b23515-aa5e-4566-9adf-fa027db91757",
  "servicio": "EPM Energía",
  "monto": 85000,
  "fecha_vencimiento": "2026-03-05",
  "fecha_emision": "2026-02-01",
  "origen": "imagen",
  "archivo_url": "https://storage.example.com/factura_epm.jpg",
  "extraccion_estado": "ok",
  "extraccion_confianza": 0.95
}
```

**Response (201) — Extracción OK (estado → `extraida`):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
    "servicio": "EPM Energía",
    "monto": 85000,
    "estado": "extraida",
    "requiere_revision": false
  },
  "error": null
}
```

**Ejemplo — Extracción dudosa:**
```json
{
  "telefono": "3001112233",
  "obligacion_id": "81b23515-aa5e-4566-9adf-fa027db91757",
  "servicio": "Gas Natural Dudosa",
  "monto": 32000,
  "extraccion_estado": "dudosa",
  "extraccion_confianza": 0.35,
  "extraccion_json": { "raw": "G4s N4tur4l $32.0?0" }
}
```

**Response (201) — Extracción dudosa (estado → `en_revision`):**
```json
{
  "ok": true,
  "data": {
    "factura_id": "07a7d72d-a3fd-4f2d-8ba2-b8e72dce3d37",
    "servicio": "Gas Natural Dudosa",
    "monto": 32000,
    "estado": "en_revision",
    "requiere_revision": true
  },
  "error": null
}
```

---

### 4.2 `GET /api/facturas/obligacion/:obligacion_id` — Facturas de una obligación

> 🤖👨‍💼 Lista todas las facturas asociadas a una obligación.

**Request:**
```
GET /api/facturas/obligacion/81b23515-aa5e-4566-9adf-fa027db91757
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
      "servicio": "EPM Energía",
      "monto": 85000,
      "estado": "pagada",
      "periodo": "2026-02-01",
      "fecha_vencimiento": "2026-03-05",
      "fecha_emision": "2026-02-01",
      "extraccion_estado": "ok",
      "extraccion_confianza": 0.95,
      "obligacion_id": "81b23515-aa5e-4566-9adf-fa027db91757"
    },
    {
      "id": "989491ed-9119-433f-b88d-01381b87b0dc",
      "servicio": "Agua EPM",
      "monto": 45000,
      "estado": "pagada",
      "periodo": "2026-02-01",
      "extraccion_estado": "ok",
      "extraccion_confianza": 0.9
    },
    {
      "id": "07a7d72d-a3fd-4f2d-8ba2-b8e72dce3d37",
      "servicio": "Gas Natural Dudosa",
      "monto": 32000,
      "estado": "rechazada",
      "motivo_rechazo": "Imagen ilegible, no se puede verificar el monto correcto",
      "extraccion_estado": "dudosa",
      "extraccion_confianza": 0.35
    }
  ],
  "error": null
}
```

---

### 4.3 `PUT /api/facturas/:id/validar` — Admin valida factura

> 👨‍💼 El admin confirma/corrige los datos de la factura. Cambia estado a `validada`.  
> ⚡ **Genera notificación automática** `factura_validada` al usuario.  
> ✅ **Transiciones válidas:** `extraida` → `validada`, `en_revision` → `validada`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `monto` | number | ✅ Sí | Monto confirmado (positivo) |
| `fecha_vencimiento` | string | ❌ No | Fecha de vencimiento confirmada |
| `fecha_emision` | string | ❌ No | Fecha de emisión |
| `observaciones_admin` | string | ❌ No | Notas del administrador |

**Ejemplo:**
```json
{
  "monto": 85000,
  "fecha_vencimiento": "2026-03-05",
  "observaciones_admin": "Datos verificados correctamente"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "factura_id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
    "servicio": "EPM Energía",
    "estado": "validada"
  },
  "error": null
}
```

**Response (409) — Transición inválida:**
```json
{
  "ok": false,
  "data": null,
  "error": "No se puede validar factura en estado 'pagada'. Debe estar en 'en_revision' o 'extraida'."
}
```

---

### 4.4 `PUT /api/facturas/:id/rechazar` — Admin rechaza factura

> 👨‍💼 El admin rechaza una factura que no se puede verificar.  
> ⚡ **Genera notificación automática** `factura_rechazada` al usuario.  
> ✅ **Transiciones válidas:** `extraida` → `rechazada`, `en_revision` → `rechazada`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_rechazo` | string | ✅ Sí | Razón del rechazo |

**Ejemplo:**
```json
{
  "motivo_rechazo": "Imagen ilegible, no se puede verificar el monto correcto"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "factura_id": "07a7d72d-a3fd-4f2d-8ba2-b8e72dce3d37",
    "servicio": "Gas Natural Dudosa",
    "estado": "rechazada"
  },
  "error": null
}
```

---

## 5. Recargas (`/api/recargas`)

> **Concepto:** Una recarga es cuando el usuario **deposita dinero** (por Nequi, PSE, Bancolombia, etc.) para que DeOne pague sus facturas. El usuario reporta la recarga con comprobante y el admin la aprueba o rechaza.

---

### 5.1 `POST /api/recargas/reportar` — Reportar recarga

> 🤖 El usuario reporta que hizo una consignación.  
> Si envía `referencia_tx` y ya existe → retorna la existente (idempotencia, status 200).  
> Se crea una **revisión admin** automáticamente para que el admin valide el comprobante.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `periodo` | string | ✅ Sí | Periodo (YYYY-MM-DD) |
| `monto` | number | ✅ Sí | Monto de la recarga (positivo) |
| `comprobante_url` | string | ✅ Sí | URL del comprobante |
| `referencia_tx` | string | ❌ No | Referencia de transacción (para idempotencia) |

**Ejemplo:**
```json
{
  "telefono": "3001112233",
  "periodo": "2026-02-01",
  "monto": 200000,
  "comprobante_url": "https://storage.example.com/comprobante_nequi.jpg",
  "referencia_tx": "NEQ-20260220-001"
}
```

**Response (201) — Nueva recarga:**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-c896-4ab3-a008-a64d071219b2",
    "estado": "en_validacion"
  },
  "error": null
}
```

**Response (200) — Ya existía (idempotencia por `referencia_tx`):**
```json
{
  "ok": true,
  "data": {
    "recarga_id": "974bad6d-c896-4ab3-a008-a64d071219b2",
    "estado": "en_validacion",
    "mensaje": "Recarga ya reportada con esta referencia de transacción"
  },
  "error": null
}
```

---

### 5.2 `PUT /api/recargas/:id/aprobar` — Admin aprueba recarga

> 👨‍💼 El admin verifica el comprobante y aprueba la recarga.  
> ⚡ **Genera notificación automática** `recarga_aprobada` al usuario.  
> ✅ **Transiciones válidas:** `en_validacion` → `aprobada`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `observaciones_admin` | string | ❌ No | Notas del admin |

**Ejemplo:**
```json
{
  "observaciones_admin": "Comprobante Nequi verificado, monto correcto"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "974bad6d-c896-4ab3-a008-a64d071219b2",
    "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "monto": 200000,
    "estado": "aprobada",
    "periodo": "2026-02-01",
    "comprobante_url": "https://storage.example.com/comprobante_nequi.jpg",
    "validada_en": "2026-02-20T04:02:16.159+00:00",
    "observaciones_admin": "Comprobante Nequi verificado, monto correcto"
  },
  "error": null
}
```

---

### 5.3 `PUT /api/recargas/:id/rechazar` — Admin rechaza recarga

> 👨‍💼 El admin rechaza la recarga porque el comprobante no es válido.  
> ⚡ **Genera notificación automática** `recarga_rechazada` al usuario.  
> ✅ **Transiciones válidas:** `en_validacion` → `rechazada`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `motivo_rechazo` | string | ✅ Sí | Razón del rechazo |

**Ejemplo:**
```json
{
  "motivo_rechazo": "Comprobante borroso, no se puede verificar el monto"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "676b3c7e-0fbd-4d74-a6e5-3fcdc94be234",
    "monto": 50000,
    "estado": "rechazada",
    "motivo_rechazo": "Comprobante borroso, no se puede verificar el monto",
    "validada_en": "2026-02-20T04:02:35.123+00:00"
  },
  "error": null
}
```

---

## 6. Disponibilidad / Saldo (`/api/disponible`)

---

### 6.1 `GET /api/disponible` — Consultar saldo disponible

> 🤖👨‍💼 Calcula el saldo disponible de un usuario:  
> **`disponible = recargas aprobadas − pagos (en_proceso + pagados)`**

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `periodo` | string | ✅ Sí | Periodo (YYYY-MM-DD) |

**Ejemplo:**
```
GET /api/disponible?telefono=3001112233&periodo=2026-02-01
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "periodo": "2026-02-01",
    "total_recargas": 200000,
    "total_pagos": 130000,
    "disponible": 70000
  },
  "error": null
}
```

> 💡 **Interpretación:** El usuario recargó $200,000. Se usaron $130,000 en pagos. Le quedan $70,000 disponibles.

---

## 7. Pagos (`/api/pagos`)

> **Concepto:** Un pago es la ejecución del pago de una factura validada usando fondos de las recargas. El sistema verifica saldo disponible antes de crear el pago.

---

### 7.1 `POST /api/pagos/crear` — Crear pago

> 👨‍💼 Crea un pago para una factura que esté en estado `validada`. **Verifica saldo disponible** antes de crear.

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `factura_id` | UUID | ✅ Sí | ID de la factura validada a pagar |

**Ejemplo:**
```json
{
  "telefono": "3001112233",
  "factura_id": "92eb26d4-661c-49d7-977a-3a30c05b2792"
}
```

**Response (201) — Pago creado:**
```json
{
  "ok": true,
  "data": {
    "pago_id": "8491016e-ab24-4c60-85ad-35c5345e415e",
    "estado": "en_proceso",
    "monto": 85000,
    "servicio": "EPM Energía"
  },
  "error": null
}
```

**Response (409) — Fondos insuficientes:**
```json
{
  "ok": false,
  "data": null,
  "error": "Fondos insuficientes. Disponible: $15,000, Requerido: $85,000"
}
```

**Response (409) — Factura no válida para pago:**
```json
{
  "ok": false,
  "data": null,
  "error": "No se puede crear pago para factura en estado 'pagada'. Debe estar 'validada'."
}
```

---

### 7.2 `PUT /api/pagos/:id/confirmar` — Confirmar pago exitoso

> 👨‍💼 Confirma que el pago fue procesado exitosamente.  
> ⚡ **Genera notificación automática** `pago_confirmado` al usuario.  
> ⚡ **Si la obligación se completa** (todas las facturas pagadas):
> 1. Auto-crea obligación del siguiente mes con las mismas facturas
> 2. Notifica `obligacion_completada`
> 3. Notifica `nueva_obligacion`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `proveedor_pago` | string | ❌ No | Pasarela usada (PSE, Nequi, etc.) |
| `referencia_pago` | string | ❌ No | Referencia de la transacción |
| `comprobante_pago_url` | string | ❌ No | URL del comprobante de pago |

**Ejemplo:**
```json
{
  "proveedor_pago": "PSE",
  "referencia_pago": "PSE-REF-001",
  "comprobante_pago_url": "https://storage.example.com/pago_001.pdf"
}
```

**Response (200) — Probado (obligación no se completa aún):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "8491016e-ab24-4c60-85ad-35c5345e415e",
    "estado": "pagado",
    "factura_estado": "pagada",
    "obligacion_estado": "en_progreso",
    "nueva_obligacion_id": null
  },
  "error": null
}
```

**Response (200) — Cuando se completa la obligación (último pago del periodo):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "0da485dd-a689-42fd-a88d-b3390fe3baac",
    "estado": "pagado",
    "factura_estado": "pagada",
    "obligacion_estado": "completada",
    "nueva_obligacion_id": "abc-nueva-obligacion-siguiente-mes"
  },
  "error": null
}
```

> 💡 Cuando `obligacion_estado === "completada"`, el sistema automáticamente:
> 1. Marca la obligación como completada
> 2. Crea una nueva obligación para el siguiente mes
> 3. Copia las mismas facturas (servicios) con el nuevo periodo
> 4. Envía notificación `obligacion_completada` al usuario
> 5. Envía notificación `nueva_obligacion` al usuario

---

### 7.3 `PUT /api/pagos/:id/fallar` — Marcar pago como fallido

> 👨‍💼 Marca un pago como fallido (error en pasarela, timeout, etc.).  
> ✅ **Transiciones válidas:** `en_proceso` → `fallido`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `error_detalle` | string | ✅ Sí | Descripción del error |

**Ejemplo:**
```json
{
  "error_detalle": "Timeout en la pasarela PSE, el banco no respondió"
}
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "pago_id": "...",
    "estado": "fallido"
  },
  "error": null
}
```

**Response (409) — Estado ya es final (Probado: intentar fallar un pago ya pagado):**
```json
{
  "ok": false,
  "data": null,
  "error": "No se puede confirmar pago en estado 'pagado'"
}
```

> 💡 La **máquina de estados protege** contra transiciones inválidas. Un pago que ya está `pagado` no puede cambiar a `fallido`.

---

## 8. Revisiones Admin (`/api/revisiones`)

> **Concepto:** Las revisiones se crean **automáticamente** cuando:
> - Se captura una factura con extracción dudosa/fallida
> - Se reporta una recarga (comprobante pendiente de validar)
>
> El admin las gestiona desde su panel.

---

### 8.1 `GET /api/revisiones` — Listar revisiones

> 👨‍💼 Lista las revisiones con filtros opcionales.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `tipo` | string | ❌ No | `"factura"`, `"recarga"` |
| `estado` | string | ❌ No | `"pendiente"`, `"en_proceso"`, `"resuelta"`, `"descartada"` |

**Ejemplo:**
```
GET /api/revisiones?estado=pendiente
GET /api/revisiones?tipo=factura&estado=pendiente
```

**Response (200) — Probado (6 revisiones pendientes de recargas):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "37a731a3-2659-4961-bc92-009e43c37ec9",
      "tipo": "recarga",
      "estado": "pendiente",
      "prioridad": 2,
      "razon": "Comprobante recibido: validar recarga",
      "factura_id": null,
      "recarga_id": "323008c0-6ab0-4d89-bb87-e9abdf532d3d",
      "creado_en": "2026-02-16T03:11:30.369564+00:00",
      "asignada_a": null,
      "resuelta_por": null,
      "resuelta_en": null,
      "notificada": false,
      "usuarios": {
        "nombre": "Juan Carlos",
        "apellido": "Pérez González",
        "telefono": "+573001234567"
      }
    },
    {
      "id": "1e038534-0330-44cb-bf30-b7e95f0158ba",
      "tipo": "recarga",
      "estado": "pendiente",
      "prioridad": 2,
      "razon": "Comprobante recibido: validar recarga",
      "usuarios": {
        "nombre": "ensayo 1",
        "apellido": "martinex",
        "telefono": "3456787887"
      }
    }
  ],
  "error": null
}
```

---

### 8.2 `PUT /api/revisiones/:id/tomar` — Admin toma una revisión

> 👨‍💼 El admin "toma" una revisión para trabajarla.  
> ✅ **Transiciones válidas:** `pendiente` → `en_proceso`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `admin_id` | string | ❌ No | ID del admin que toma la revisión |

**Ejemplo:**
```json
{
  "admin_id": "admin-geiner-01"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "37a731a3-2659-4961-bc92-009e43c37ec9",
    "tipo": "recarga",
    "estado": "en_proceso",
    "prioridad": 2,
    "razon": "Comprobante recibido: validar recarga",
    "recarga_id": "323008c0-6ab0-4d89-bb87-e9abdf532d3d",
    "asignada_a": null,
    "resuelta_por": null,
    "resuelta_en": null,
    "notificada": false
  },
  "error": null
}
```

---

### 8.3 `PUT /api/revisiones/:id/descartar` — Admin descarta revisión

> 👨‍💼 Descarta una revisión que ya no es necesaria.  
> ✅ **Transiciones válidas:** `pendiente` → `descartada`, `en_proceso` → `descartada`

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `razon` | string | ❌ No | Motivo del descarte |

**Ejemplo:**
```json
{
  "razon": "Duplicado, ya se procesó antes"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "1e038534-0330-44cb-bf30-b7e95f0158ba",
    "tipo": "recarga",
    "estado": "descartada",
    "resuelta_en": "2026-02-20T04:09:12.662+00:00",
    "notificada": false
  },
  "error": null
}
```

---

## 9. Notificaciones (`/api/notificaciones`)

> **Concepto:** Sistema de notificaciones para comunicar al usuario eventos importantes.  
> Muchas se generan **automáticamente** (pago confirmado, recarga aprobada, etc.).  
> El bot consume las pendientes y las marca como enviadas.

### Tipos de notificación automática:

| Tipo | Se genera cuando... |
|------|-------------------|
| `factura_validada` | Admin valida una factura |
| `factura_rechazada` | Admin rechaza una factura |
| `recarga_aprobada` | Admin aprueba una recarga |
| `recarga_rechazada` | Admin rechaza una recarga |
| `pago_confirmado` | Se confirma un pago |
| `obligacion_completada` | Todas las facturas de una obligación quedan pagadas |
| `nueva_obligacion` | Se auto-crea la obligación del siguiente mes |

### Tipos de notificación manual:

| Tipo | Uso |
|------|-----|
| `recordatorio_recarga` | Recordar al usuario que debe recargar |
| `promocion` | Ofertas y promociones |
| *(cualquier string)* | Puedes crear tipos personalizados |

### Estados de una notificación:

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Creada, esperando ser enviada |
| `enviada` | Ya fue enviada al usuario |
| `fallida` | Falló el envío |
| `leida` | El usuario la leyó |

---

### 9.1 `POST /api/notificaciones` — Crear notificación manual

> 👨‍💼 Crea una notificación dirigida a un usuario específico.

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `telefono` | string | ✅ Sí | Teléfono del usuario |
| `tipo` | string | ✅ Sí | Tipo de notificación (cualquier string) |
| `canal` | string | ❌ No | `"whatsapp"` (default), `"email"`, `"push"`, `"sms"` |
| `payload` | object | ❌ No | Datos adicionales (formato libre) |

**Ejemplo:**
```json
{
  "telefono": "3001112233",
  "tipo": "recordatorio_recarga",
  "canal": "whatsapp",
  "payload": {
    "mensaje": "Hola Carlos, recuerda recargar para pagar tus facturas de marzo.",
    "monto_sugerido": 200000
  }
}
```

**Response (201) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "c4e8c380-db41-4ad2-aed2-cf38af03d8a3",
    "creado_en": "2026-02-20T04:06:32.157013+00:00",
    "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "tipo": "recordatorio_recarga",
    "canal": "whatsapp",
    "payload": {
      "mensaje": "Hola Carlos, recuerda recargar para pagar tus facturas de marzo.",
      "monto_sugerido": 200000
    },
    "estado": "pendiente",
    "ultimo_error": null
  },
  "error": null
}
```

---

### 9.2 `POST /api/notificaciones/masiva` — Notificación masiva

> 👨‍💼 Envía una notificación a **todos los usuarios activos**, opcionalmente filtrados por plan.

**Headers:**
```
Content-Type: application/json
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `tipo` | string | ✅ Sí | Tipo de notificación |
| `canal` | string | ❌ No | `"whatsapp"` (default), `"email"`, `"push"`, `"sms"` |
| `payload` | object | ❌ No | Datos del mensaje |
| `filtro_plan` | string | ❌ No | `"control"`, `"tranquilidad"`, `"respaldo"` |

**Ejemplo — A todos los usuarios activos:**
```json
{
  "tipo": "promocion",
  "canal": "whatsapp",
  "payload": {
    "mensaje": "¡Aprovecha el 10% de descuento en recargas este fin de semana!"
  }
}
```

**Response (201) — Probado (22 usuarios activos):**
```json
{
  "ok": true,
  "data": {
    "total_enviadas": 22
  },
  "error": null
}
```

**Ejemplo — Solo usuarios del plan tranquilidad:**
```json
{
  "tipo": "upgrade_disponible",
  "canal": "whatsapp",
  "payload": { "mensaje": "Upgrade al plan Respaldo con beneficios exclusivos" },
  "filtro_plan": "tranquilidad"
}
```

---

### 9.3 `GET /api/notificaciones` — Listar notificaciones (admin)

> 👨‍💼 Lista notificaciones con filtros. Incluye info del usuario.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `telefono` | string | — | Filtrar por usuario |
| `tipo` | string | — | Filtrar por tipo (ej: `pago_confirmado`) |
| `estado` | string | — | `"pendiente"`, `"enviada"`, `"fallida"`, `"leida"` |
| `limit` | number | `50` | Registros por consulta (máx 100) |
| `offset` | number | `0` | Offset para paginación |

**Ejemplo:**
```
GET /api/notificaciones?telefono=3001112233
```

**Response (200) — Probado (8 notificaciones auto-generadas + manuales):**
```json
{
  "ok": true,
  "data": {
    "notificaciones": [
      {
        "id": "c4e8c380-db41-4ad2-aed2-cf38af03d8a3",
        "tipo": "recordatorio_recarga",
        "canal": "whatsapp",
        "estado": "pendiente",
        "payload": {
          "mensaje": "Hola Carlos, recuerda recargar para pagar tus facturas de marzo.",
          "monto_sugerido": 200000
        },
        "creado_en": "2026-02-20T04:06:32.157013+00:00",
        "ultimo_error": null,
        "usuarios": {
          "nombre": "Carlos Actualizado",
          "apellido": "Frontend",
          "telefono": "3001112233"
        }
      },
      {
        "id": "...",
        "tipo": "pago_confirmado",
        "estado": "pendiente",
        "payload": {
          "pago_id": "0da485dd-...",
          "monto": 45000,
          "servicio": "Agua EPM",
          "mensaje": "Se ha confirmado el pago de $45,000 para Agua EPM."
        }
      },
      {
        "id": "...",
        "tipo": "pago_confirmado",
        "estado": "pendiente",
        "payload": {
          "pago_id": "8491016e-...",
          "monto": 85000,
          "servicio": "EPM Energía",
          "mensaje": "Se ha confirmado el pago de $85,000 para EPM Energía."
        }
      },
      {
        "id": "...",
        "tipo": "recarga_rechazada",
        "payload": {
          "recarga_id": "676b3c7e-...",
          "monto": 50000,
          "mensaje": "Tu recarga de $50,000 ha sido rechazada."
        }
      },
      {
        "id": "...",
        "tipo": "recarga_aprobada",
        "payload": {
          "recarga_id": "974bad6d-...",
          "monto": 200000,
          "mensaje": "Tu recarga de $200,000 ha sido aprobada."
        }
      },
      {
        "id": "...",
        "tipo": "factura_rechazada",
        "payload": {
          "servicio": "Gas Natural Dudosa",
          "mensaje": "Tu factura de Gas Natural Dudosa ha sido rechazada."
        }
      },
      {
        "id": "...",
        "tipo": "factura_validada",
        "payload": {
          "servicio": "Agua EPM",
          "monto": 45000,
          "mensaje": "Tu factura de Agua EPM por $45,000 ha sido validada y está lista para pago."
        }
      },
      {
        "id": "...",
        "tipo": "factura_validada",
        "payload": {
          "servicio": "EPM Energía",
          "monto": 85000,
          "mensaje": "Tu factura de EPM Energía por $85,000 ha sido validada y está lista para pago."
        }
      }
    ],
    "total": 8,
    "limit": 50,
    "offset": 0
  },
  "error": null
}
```

---

### 9.4 `GET /api/notificaciones/pendientes/:telefono` — Pendientes de un usuario

> 🤖👨‍💼 **Para el bot:** Obtiene las notificaciones pendientes de enviar a un usuario. Ordenadas cronológicamente (más antigua primero).

**Headers:**
```
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Request:**
```
GET /api/notificaciones/pendientes/3001112233
```

**Response (200) — Probado (8 pendientes):**
```json
{
  "ok": true,
  "data": [
    {
      "id": "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
      "tipo": "factura_validada",
      "canal": "whatsapp",
      "estado": "pendiente",
      "payload": {
        "factura_id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
        "servicio": "EPM Energía",
        "monto": 85000,
        "mensaje": "Tu factura de EPM Energía por $85,000 ha sido validada y está lista para pago."
      },
      "creado_en": "2026-02-20T04:02:12.649851+00:00"
    },
    {
      "id": "716d4170-...",
      "tipo": "factura_validada",
      "payload": { "servicio": "Agua EPM", "monto": 45000 }
    },
    {
      "id": "...",
      "tipo": "recarga_aprobada",
      "payload": { "monto": 200000, "mensaje": "Tu recarga de $200,000 ha sido aprobada." }
    },
    {
      "id": "...",
      "tipo": "pago_confirmado",
      "payload": { "monto": 85000, "servicio": "EPM Energía" }
    }
  ],
  "error": null
}
```

> 💡 **Flujo recomendado para el bot:**
> 1. `GET /api/notificaciones/pendientes/:telefono` → Obtener pendientes
> 2. Enviar cada notificación al usuario por WhatsApp
> 3. `PUT /api/notificaciones/:id` con `{"estado":"enviada"}` → Marcar como enviada
> 4. O usar `POST /api/notificaciones/batch-enviadas` para marcar varias de golpe

---

### 9.5 `PUT /api/notificaciones/:id` — Actualizar estado de notificación

> 🤖👨‍💼 Marca una notificación como enviada, fallida o leída.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `estado` | string | ✅ Sí | `"enviada"`, `"fallida"`, `"leida"` |
| `ultimo_error` | string | ❌ No | Detalle del error (si estado=`fallida`) |

**Ejemplo — Marcar como enviada:**
```json
{
  "estado": "enviada"
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "id": "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
    "creado_en": "2026-02-20T04:02:12.649851+00:00",
    "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
    "tipo": "factura_validada",
    "canal": "whatsapp",
    "payload": {
      "monto": 85000,
      "servicio": "EPM Energía",
      "factura_id": "92eb26d4-661c-49d7-977a-3a30c05b2792",
      "mensaje": "Tu factura de EPM Energía por $85,000 ha sido validada y está lista para pago."
    },
    "estado": "enviada",
    "ultimo_error": null
  },
  "error": null
}
```

**Ejemplo — Marcar como fallida:**
```json
{
  "estado": "fallida",
  "ultimo_error": "WhatsApp API timeout después de 30s"
}
```

**Response (404) — Notificación no existe:**
```json
{ "ok": false, "data": null, "error": "Notificación no encontrada" }
```

---

### 9.6 `POST /api/notificaciones/batch-enviadas` — Marcar varias como enviadas

> 🤖👨‍💼 Marca múltiples notificaciones como enviadas de una sola vez. Ideal para el bot después de enviar un batch.

**Headers:**
```
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Body JSON:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `ids` | array de UUID | ✅ Sí | IDs de las notificaciones a marcar |

**Ejemplo:**
```json
{
  "ids": [
    "716d4170-3831-49f2-9fa8-9b15a6c63018",
    "b4503a04-3fc1-4fcb-bf04-fd161f5eda48"
  ]
}
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "actualizadas": 2
  },
  "error": null
}
```

**Response (400) — Sin IDs:**
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Se requiere un array de IDs" }
}
```

---

## 10. Admin Dashboard (`/api/admin`)

> Todos los endpoints de esta sección requieren `x-admin-api-key`.

---

### 10.1 `GET /api/admin/dashboard` — Panel de métricas globales

> 👨‍💼 Estadísticas consolidadas de toda la plataforma en tiempo real.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Request:**
```
GET /api/admin/dashboard
```

**Response (200) — Probado con datos reales:**
```json
{
  "ok": true,
  "data": {
    "clientes": {
      "total": 22,
      "activos": 22
    },
    "obligaciones": {
      "activas": 21,
      "completadas": 2
    },
    "financiero": {
      "total_recargas_aprobadas": 4900000,
      "total_pagos_realizados": 1224333,
      "pagos_en_proceso": 45000,
      "recargas_pendientes_validacion": 9640000,
      "saldo_global": 3675667
    },
    "revisiones_pendientes": {
      "total": 10,
      "facturas": 4,
      "recargas": 6
    },
    "notificaciones_pendientes": 25
  },
  "error": null
}
```

> 💡 **Campos del financiero explicados:**
> | Campo | Significado |
> |-------|-------------|
> | `total_recargas_aprobadas` | Dinero total confirmado por recargas de todos los usuarios |
> | `total_pagos_realizados` | Dinero total ya pagado a proveedores de servicios |
> | `pagos_en_proceso` | Dinero en pagos que aún no se han confirmado |
> | `recargas_pendientes_validacion` | Dinero en recargas reportadas esperando aprobación |
> | `saldo_global` | Recargas aprobadas − Pagos realizados (dinero disponible en plataforma) |

---

### 10.2 `GET /api/admin/clientes` — Listar clientes (paginado)

> 👨‍💼 Lista todos los clientes con búsqueda, filtro por plan y paginación.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | `1` | Página actual |
| `limit` | number | `20` | Registros por página (máx 100) |
| `search` | string | — | Busca en nombre, teléfono o correo |
| `plan` | string | — | `"control"`, `"tranquilidad"`, `"respaldo"` |
| `activo` | boolean | — | `true` o `false` |

**Ejemplo:**
```
GET /api/admin/clientes?page=1&limit=3&search=carlos
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "clientes": [
      {
        "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
        "creado_en": "2026-02-20T03:59:07.226464+00:00",
        "nombre": "Carlos Actualizado",
        "apellido": "Frontend",
        "correo": "carlos.test@email.com",
        "telefono": "3001112233",
        "direccion": null,
        "plan": "tranquilidad",
        "activo": true,
        "ajustes_usuario": {
          "id": "38a7136d-a1d3-4e60-85e0-fe4af589004d",
          "tipo_notificacion": "whatsapp",
          "umbral_monto_alto": 300000,
          "recordatorios_activos": true,
          "dias_anticipacion_recordatorio": 5,
          "requiere_autorizacion_monto_alto": true
        }
      },
      {
        "id": "9a1ea3b4-f9a7-4990-a681-18c6447adc73",
        "nombre": "Carlos",
        "apellido": "Rodriguez",
        "correo": "carlos@email.com",
        "telefono": "3005555555",
        "plan": "control",
        "activo": true,
        "ajustes_usuario": { "..." : "..." }
      },
      {
        "id": "1e81f928-1640-4d8f-bd3b-e89d1bf573d3",
        "nombre": "Juan Carlos",
        "apellido": "Pérez González",
        "correo": "juan.perez@email.com",
        "telefono": "+573001234567",
        "plan": "tranquilidad",
        "activo": true,
        "ajustes_usuario": { "..." : "..." }
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 3,
    "total_pages": 1
  },
  "error": null
}
```

---

### 10.3 `GET /api/admin/clientes/:telefono` — Perfil completo de un cliente

> 👨‍💼 Retorna **toda** la información de un cliente: datos personales, resumen financiero, obligaciones con progreso, recargas, pagos y notificaciones recientes.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Request:**
```
GET /api/admin/clientes/3001112233
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "usuario": {
      "id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
      "creado_en": "2026-02-20T03:59:07.226464+00:00",
      "nombre": "Carlos Actualizado",
      "apellido": "Frontend",
      "correo": "carlos.test@email.com",
      "telefono": "3001112233",
      "direccion": null,
      "plan": "tranquilidad",
      "activo": true,
      "ajustes_usuario": {
        "tipo_notificacion": "whatsapp",
        "umbral_monto_alto": 300000,
        "recordatorios_activos": true,
        "dias_anticipacion_recordatorio": 5,
        "requiere_autorizacion_monto_alto": true
      }
    },
    "resumen": {
      "total_obligaciones": 1,
      "obligaciones_activas": 0,
      "obligaciones_completadas": 1,
      "total_recargas_aprobadas": 200000,
      "total_pagos_realizados": 130000,
      "saldo_disponible": 70000
    },
    "obligaciones": [
      {
        "id": "81b23515-aa5e-4566-9adf-fa027db91757",
        "descripcion": "Servicios Febrero 2026",
        "estado": "completada",
        "periodo": "2026-02-01",
        "completada_en": "2026-02-20T04:03:56.136+00:00",
        "facturas": [
          { "id": "92eb26d4-...", "servicio": "EPM Energía", "monto": 85000, "estado": "pagada" },
          { "id": "989491ed-...", "servicio": "Agua EPM", "monto": 45000, "estado": "pagada" },
          { "id": "07a7d72d-...", "servicio": "Gas Natural Dudosa", "monto": 32000, "estado": "rechazada" }
        ],
        "total_facturas": 3,
        "facturas_pagadas": 2,
        "monto_total": 162000,
        "monto_pagado": 130000,
        "progreso": 67
      }
    ],
    "recargas": [
      {
        "id": "676b3c7e-0fbd-4d74-a6e5-3fcdc94be234",
        "monto": 50000,
        "estado": "rechazada",
        "periodo": "2026-02-01",
        "comprobante_url": "https://...",
        "motivo_rechazo": "Comprobante borroso, no se puede verificar el monto"
      },
      {
        "id": "974bad6d-c896-4ab3-a008-a64d071219b2",
        "monto": 200000,
        "estado": "aprobada",
        "periodo": "2026-02-01",
        "comprobante_url": "https://...",
        "observaciones_admin": "Comprobante Nequi verificado, monto correcto"
      }
    ],
    "pagos": [
      {
        "id": "0da485dd-a689-42fd-a88d-b3390fe3baac",
        "monto_aplicado": 45000,
        "estado": "pagado",
        "ejecutado_en": "2026-02-20T04:03:56.082+00:00",
        "proveedor_pago": "PSE",
        "referencia_pago": "PSE-REF-002",
        "facturas": { "servicio": "Agua EPM", "monto": 45000, "periodo": "2026-02-01" }
      },
      {
        "id": "8491016e-ab24-4c60-85ad-35c5345e415e",
        "monto_aplicado": 85000,
        "estado": "pagado",
        "ejecutado_en": "2026-02-20T04:03:24.998+00:00",
        "proveedor_pago": "PSE",
        "referencia_pago": "PSE-REF-001",
        "comprobante_pago_url": "https://storage.example.com/pago_001.pdf",
        "facturas": { "servicio": "EPM Energía", "monto": 85000, "periodo": "2026-02-01" }
      }
    ],
    "notificaciones_recientes": [
      {
        "id": "c4e8c380-...",
        "tipo": "recordatorio_recarga",
        "estado": "pendiente",
        "canal": "whatsapp",
        "payload": { "mensaje": "Hola Carlos, recuerda recargar..." },
        "creado_en": "2026-02-20T04:06:32.157013+00:00"
      },
      {
        "id": "...",
        "tipo": "pago_confirmado",
        "estado": "pendiente",
        "payload": { "monto": 45000, "servicio": "Agua EPM" }
      }
    ]
  },
  "error": null
}
```

**Response (404):**
```json
{ "ok": false, "data": null, "error": "Usuario no encontrado con ese teléfono" }
```

---

### 10.4 `GET /api/admin/pagos` — Historial de pagos (paginado + filtros)

> 👨‍💼 Historial de todos los pagos de la plataforma con filtros opcionales. Incluye info de la factura y del usuario.

**Headers:**
```
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

**Query Params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | `1` | Página actual |
| `limit` | number | `20` | Registros por página (máx 100) |
| `telefono` | string | — | Filtrar por usuario |
| `estado` | string | — | `"en_proceso"`, `"pagado"`, `"fallido"` |
| `periodo` | string | — | Filtrar por periodo (YYYY-MM-DD) |

**Ejemplo:**
```
GET /api/admin/pagos?page=1&limit=5&estado=pagado
```

**Response (200) — Probado:**
```json
{
  "ok": true,
  "data": {
    "pagos": [
      {
        "id": "0da485dd-a689-42fd-a88d-b3390fe3baac",
        "creado_en": "2026-02-20T04:03:45.686151+00:00",
        "usuario_id": "7f98125c-fbba-48b7-bc9f-b46e515f25ce",
        "factura_id": "989491ed-9119-433f-b88d-01381b87b0dc",
        "recarga_id": "974bad6d-c896-4ab3-a008-a64d071219b2",
        "monto_aplicado": 45000,
        "estado": "pagado",
        "ejecutado_en": "2026-02-20T04:03:56.082+00:00",
        "proveedor_pago": "PSE",
        "referencia_pago": "PSE-REF-002",
        "comprobante_pago_url": null,
        "error_detalle": null,
        "facturas": {
          "monto": 45000,
          "periodo": "2026-02-01",
          "servicio": "Agua EPM",
          "obligacion_id": "81b23515-aa5e-4566-9adf-fa027db91757"
        },
        "usuarios": {
          "nombre": "Carlos Actualizado",
          "apellido": "Frontend",
          "telefono": "3001112233"
        }
      },
      {
        "id": "8491016e-ab24-4c60-85ad-35c5345e415e",
        "creado_en": "2026-02-20T04:03:08.84605+00:00",
        "monto_aplicado": 85000,
        "estado": "pagado",
        "ejecutado_en": "2026-02-20T04:03:24.998+00:00",
        "proveedor_pago": "PSE",
        "referencia_pago": "PSE-REF-001",
        "comprobante_pago_url": "https://storage.example.com/pago_001.pdf",
        "facturas": {
          "monto": 85000,
          "periodo": "2026-02-01",
          "servicio": "EPM Energía",
          "obligacion_id": "81b23515-aa5e-4566-9adf-fa027db91757"
        },
        "usuarios": {
          "nombre": "Carlos Actualizado",
          "apellido": "Frontend",
          "telefono": "3001112233"
        }
      }
    ],
    "total": 9,
    "page": 1,
    "limit": 5,
    "total_pages": 2
  },
  "error": null
}
```

---

## 🔄 Máquinas de Estado

> El sistema usa una máquina de transiciones que **protege** contra cambios inválidos. Si intentas una transición no permitida, recibirás **409 INVALID_STATE**.

### Obligaciones
```
activa ─────→ en_progreso ─────→ completada
  │                                    
  └──→ cancelada      cancelada ←──────┘
```

### Facturas
```
         captura(ok)                captura(dudosa/fallida)
              ↓                           ↓
          extraida ───────────→ en_revision
              │          ↘          │         ↘
              ↓        rechazada    ↓       rechazada
          validada              validada
              ↓
           pagada
```

### Recargas
```
reportar → en_validacion ──→ aprobada
                          └─→ rechazada
```

### Pagos
```
crear → en_proceso ──→ pagado
                   └─→ fallido
```

### Revisiones Admin
```
(automática) → pendiente ──→ en_proceso ──→ resuelta
                          └─→ descartada ←──┘
```

---

## ⚡ Comportamientos Automáticos

El sistema realiza acciones automáticas que debes tener en cuenta al consumir la API:

| Evento disparador | Acción automática |
|-------------------|-------------------|
| Factura con `extraccion_estado: "dudosa"` o `"fallida"` | Crea **revisión admin** pendiente |
| Recarga reportada | Crea **revisión admin** pendiente |
| Admin valida factura | Crea notificación `factura_validada` |
| Admin rechaza factura | Crea notificación `factura_rechazada` |
| Admin aprueba recarga | Crea notificación `recarga_aprobada` |
| Admin rechaza recarga | Crea notificación `recarga_rechazada` |
| Pago confirmado | Crea notificación `pago_confirmado` |
| Pago confirmado + última factura del periodo | Obligación → `completada` automáticamente |
| Obligación completada | Crea notificación `obligacion_completada` |
| Obligación completada | **Auto-crea** obligación del siguiente mes con mismos servicios |
| Nueva obligación auto-creada | Crea notificación `nueva_obligacion` |
| Al menos 1 factura pagada en obligación | Obligación cambia a `en_progreso` |
| Admin aprueba/rechaza recarga | Cierra revisión admin asociada |
| Admin valida/rechaza factura | Cierra revisión admin asociada |

---

## 🎬 Flujo Completo — Caso Real con Datos de Prueba

> Este flujo fue ejecutado el **19 de febrero de 2026** con datos reales contra la base de datos de Supabase.

### Paso 1 — Crear usuario
```
POST /api/users/upsert
→ 201: usuario_id = 7f98125c-fbba-48b7-bc9f-b46e515f25ce
```

### Paso 2 — Cambiar plan a "tranquilidad"
```
PUT /api/users/plan
→ 200: plan control → tranquilidad
```

### Paso 3 — Crear obligación "Servicios Febrero 2026"
```
POST /api/obligaciones
→ 201: obligacion_id = 81b23515-aa5e-4566-9adf-fa027db91757
```

### Paso 4 — Capturar 3 facturas
```
POST /api/facturas/captura × 3
→ EPM Energía $85,000 (ok → extraida)
→ Agua EPM $45,000 (ok → extraida)
→ Gas Natural $32,000 (dudosa → en_revision + revisión admin creada)
```

### Paso 5 — Reportar 2 recargas
```
POST /api/recargas/reportar × 2
→ $200,000 Nequi (en_validacion + revisión admin)
→ $50,000 Bancolombia (en_validacion + revisión admin)
```

### Paso 6 — Admin valida/rechaza facturas
```
PUT /api/facturas/.../validar → EPM Energía validada ✅ (notificación auto)
PUT /api/facturas/.../validar → Agua EPM validada ✅ (notificación auto)
PUT /api/facturas/.../rechazar → Gas rechazada ❌ (notificación auto)
```

### Paso 7 — Admin gestiona recargas
```
PUT /api/recargas/.../aprobar → $200,000 aprobada ✅ (notificación auto)
PUT /api/recargas/.../rechazar → $50,000 rechazada ❌ (notificación auto)
```

### Paso 8 — Verificar saldo
```
GET /api/disponible?telefono=3001112233&periodo=2026-02-01
→ recargas: $200,000 | pagos: $0 | disponible: $200,000
```

### Paso 9 — Crear y confirmar pagos
```
POST /api/pagos/crear → EPM $85,000 → en_proceso
PUT /api/pagos/.../confirmar → pagado ✅ (obligación: en_progreso)

POST /api/pagos/crear → Agua $45,000 → en_proceso
PUT /api/pagos/.../confirmar → pagado ✅ (obligación: completada!)
  → Auto-crea obligación de Marzo 2026
  → Notificaciones: obligacion_completada + nueva_obligacion
```

### Paso 10 — Saldo final
```
GET /api/disponible?telefono=3001112233&periodo=2026-02-01
→ recargas: $200,000 | pagos: $130,000 | disponible: $70,000
```

### Paso 11 — Bot consume notificaciones
```
GET /api/notificaciones/pendientes/3001112233 → 8 pendientes
PUT /api/notificaciones/:id → {"estado":"enviada"} (una por una)
POST /api/notificaciones/batch-enviadas → {"ids":[...]} (o batch)
```

### ✅ Resultado
| Concepto | Valor |
|----------|-------|
| Facturas pagadas | 2 ($130,000) |
| Factura rechazada | 1 (Gas Natural) |
| Saldo disponible | $70,000 |
| Obligación Feb | ✅ Completada |
| Obligación Mar | 🆕 Auto-creada |
| Notificaciones generadas | 8 automáticas |

---

## 📊 Tabla Resumen — 35 Endpoints

| # | Método | Endpoint | Auth | Descripción |
|---|--------|----------|------|-------------|
| 1 | `GET` | `/api/health` | 🔓 | Health check |
| 2 | `POST` | `/api/users/upsert` | 🤖👨‍💼 | Crear/actualizar usuario |
| 3 | `PUT` | `/api/users/plan` | 🤖👨‍💼 | Cambiar plan |
| 4 | `GET` | `/api/users/by-telefono/:tel` | 👨‍💼 | Buscar usuario por teléfono |
| 5 | `GET` | `/api/users` | 👨‍💼 | Listar usuarios (paginado) |
| 6 | `POST` | `/api/obligaciones` | 🤖👨‍💼 | Crear obligación |
| 7 | `GET` | `/api/obligaciones?telefono=` | 🤖👨‍💼 | Listar obligaciones de usuario |
| 8 | `GET` | `/api/obligaciones/:id` | 🤖👨‍💼 | Detalle de obligación |
| 9 | `PUT` | `/api/obligaciones/:id` | 👨‍💼 | Actualizar obligación |
| 10 | `POST` | `/api/facturas/captura` | 🤖 | Registrar factura |
| 11 | `GET` | `/api/facturas/obligacion/:id` | 🤖👨‍💼 | Facturas de una obligación |
| 12 | `PUT` | `/api/facturas/:id/validar` | 👨‍💼 | Validar factura |
| 13 | `PUT` | `/api/facturas/:id/rechazar` | 👨‍💼 | Rechazar factura |
| 14 | `POST` | `/api/recargas/reportar` | 🤖 | Reportar recarga |
| 15 | `PUT` | `/api/recargas/:id/aprobar` | 👨‍💼 | Aprobar recarga |
| 16 | `PUT` | `/api/recargas/:id/rechazar` | 👨‍💼 | Rechazar recarga |
| 17 | `GET` | `/api/disponible` | 🤖👨‍💼 | Consultar saldo disponible |
| 18 | `POST` | `/api/pagos/crear` | 👨‍💼 | Crear pago |
| 19 | `PUT` | `/api/pagos/:id/confirmar` | 👨‍💼 | Confirmar pago |
| 20 | `PUT` | `/api/pagos/:id/fallar` | 👨‍💼 | Marcar pago fallido |
| 21 | `GET` | `/api/revisiones` | 👨‍💼 | Listar revisiones |
| 22 | `PUT` | `/api/revisiones/:id/tomar` | 👨‍💼 | Tomar revisión |
| 23 | `PUT` | `/api/revisiones/:id/descartar` | 👨‍💼 | Descartar revisión |
| 24 | `POST` | `/api/notificaciones` | 👨‍💼 | Crear notificación |
| 25 | `POST` | `/api/notificaciones/masiva` | 👨‍💼 | Notificación masiva |
| 26 | `GET` | `/api/notificaciones` | 👨‍💼 | Listar notificaciones |
| 27 | `GET` | `/api/notificaciones/pendientes/:tel` | 🤖👨‍💼 | Pendientes de usuario |
| 28 | `GET` | `/api/notificaciones/pendientes-hoy` | 🤖👨‍💼 | Pendientes globales de hoy (auto-mark enviada) |
| 29 | `PUT` | `/api/notificaciones/:id` | 🤖👨‍💼 | Actualizar notificación |
| 30 | `POST` | `/api/notificaciones/batch-enviadas` | 🤖👨‍💼 | Batch marcar enviadas |
| 31 | `GET` | `/api/notificaciones/admin/alertas` | 👨‍💼 | Alertas admin pendientes |
| 32 | `GET` | `/api/admin/dashboard` | 👨‍💼 | Dashboard métricas |
| 33 | `GET` | `/api/admin/clientes` | 👨‍💼 | Listar clientes |
| 34 | `GET` | `/api/admin/clientes/:tel` | 👨‍💼 | Perfil completo cliente |
| 35 | `GET` | `/api/admin/pagos` | 👨‍💼 | Historial pagos |

**Leyenda:** 🔓 Sin auth · 🤖 Bot (`x-bot-api-key`) · 👨‍💼 Admin (`x-admin-api-key`) · 🤖👨‍💼 Ambos

---

## 🧭 Guía para Nuevo Frontend de Administración

Esta sección define cómo construir el nuevo panel admin sin adivinar contratos de API.

### 1) Header de autenticación (obligatorio)

Todas las llamadas del frontend admin deben enviar:

```http
x-admin-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

Opcional (si quieres trazabilidad por operador):

```http
x-admin-id: <uuid-del-admin-logueado>
```

---

### 2) Mapa de pantallas → endpoints

#### A. Dashboard principal

- `GET /api/admin/dashboard`
- Objetivo UI: tarjetas KPI, conteos por estado, resumen operativo del día.

#### B. Clientes (tabla + filtros)

- `GET /api/admin/clientes?page=1&limit=20&search=&plan=&activo=`
- Filtros soportados:
  - `page` (min 1)
  - `limit` (1 a 100)
  - `search` (texto libre)
  - `plan` (`control`, `tranquilidad`, `respaldo`)
  - `activo` (`true/false`)

#### C. Perfil completo de cliente

- `GET /api/admin/clientes/:telefono`
- Objetivo UI: ficha 360 (usuario, obligaciones, facturas, recargas, pagos, saldo).

#### D. Historial de pagos

- `GET /api/admin/pagos?page=1&limit=20&telefono=&periodo=&estado=`
- Filtros soportados: `telefono`, `periodo`, `estado`, `page`, `limit`.

#### E. Cola de revisiones (operación diaria)

- `GET /api/revisiones?tipo=factura|recarga&estado=pendiente|en_proceso|resuelta|descartada`
- `PUT /api/revisiones/:id/tomar`
- `PUT /api/revisiones/:id/descartar`

#### F. Moderación de facturas y recargas

- Facturas:
  - `PUT /api/facturas/:id/validar`
  - `PUT /api/facturas/:id/rechazar`
- Recargas:
  - `PUT /api/recargas/:id/aprobar`
  - `PUT /api/recargas/:id/rechazar`

#### G. Notificaciones para operación

- `GET /api/notificaciones?telefono=&tipo=&estado=&limit=&offset=`
- `GET /api/notificaciones/admin/alertas` (alertas pendientes por inactividad)

---

### 3) Flujo recomendado del panel admin

1. Abrir dashboard (`/api/admin/dashboard`).
2. Entrar a revisiones (`/api/revisiones?estado=pendiente`).
3. Tomar revisión (`PUT /tomar`).
4. Resolver por tipo:
   - factura → validar/rechazar
   - recarga → aprobar/rechazar
5. Verificar impacto en cliente (`/api/admin/clientes/:telefono`).
6. Monitorear alertas (`/api/notificaciones/admin/alertas`).

---

### 4) Integración con bot (nuevo endpoint global)

Para coordinación con el bot se agregó:

- `GET /api/notificaciones/pendientes-hoy` (🤖👨‍💼)

Comportamiento:

1. Devuelve notificaciones de **hoy** con `estado = "pendiente"`.
2. Excluye `tipo = "alerta_admin"`.
3. En la misma consulta las marca a `estado = "enviada"` para evitar doble entrega.

Respuesta:

```json
{
  "ok": true,
  "data": {
    "total": 2,
    "notificaciones": [
      {
        "id": "uuid-notificacion",
        "tipo": "solicitud_recarga",
        "estado": "pendiente",
        "payload": { "mensaje": "Hola..." },
        "usuarios": {
          "nombre": "Carlos",
          "apellido": "Pérez",
          "telefono": "3001112233"
        }
      }
    ]
  },
  "error": null
}
```

---

### 5) Reglas UI importantes

- Siempre mostrar estados con color por entidad (`pendiente`, `en_proceso`, `resuelta`, etc.).
- Si una acción devuelve `409`, refrescar datos y mostrar mensaje de transición inválida.
- Si una acción devuelve `401`, redirigir al login/admin-key input.
- Para tablas con paginación, persistir filtros en query string del frontend.

---

### 6) Checklist técnico para iniciar frontend admin

- Base URL configurable por entorno (`localhost`/`render`).
- Cliente HTTP único (interceptor para `x-admin-api-key`).
- Módulos sugeridos:
  - `dashboard`
  - `clientes`
  - `revisiones`
  - `pagos`
  - `notificaciones`
- Manejo estándar de respuesta `{ ok, data, error }`.
- Tabla reutilizable con filtros y paginación para clientes/pagos/revisiones.

