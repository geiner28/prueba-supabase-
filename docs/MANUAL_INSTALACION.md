# 📖 DeOne Backend — Manual de Instalación y Funcionamiento

---

## 📋 Índice

1. [¿Qué es DeOne?](#qué-es-deone)
2. [Requisitos Previos](#requisitos-previos)
3. [Instalación Paso a Paso](#instalación-paso-a-paso)
4. [Configuración de Supabase](#configuración-de-supabase)
5. [Configurar Variables de Entorno](#configurar-variables-de-entorno)
6. [Crear las Tablas en la Base de Datos](#crear-las-tablas-en-la-base-de-datos)
7. [Arrancar el Servidor](#arrancar-el-servidor)
8. [Verificar que Todo Funciona](#verificar-que-todo-funciona)
9. [Acceder al Panel de Administración](#acceder-al-panel-de-administración)
10. [Ejecutar Tests](#ejecutar-tests)
11. [Estructura del Proyecto](#estructura-del-proyecto)
12. [¿Cómo Funciona?](#cómo-funciona)
13. [Comandos Útiles](#comandos-útiles)
14. [Solución de Problemas](#solución-de-problemas)

---

## ¿Qué es DeOne?

DeOne es un sistema que permite a los usuarios:

1. **Registrar sus servicios** (energía, internet, agua, etc.) por WhatsApp
2. **Enviar fotos de sus facturas** → el bot extrae los datos automáticamente
3. **Recargar dinero** → el usuario deposita y sube el comprobante
4. **Pagar facturas** → un administrador verifica todo y ejecuta los pagos

El backend expone una **API REST** que consume un bot de WhatsApp y un **Panel de Administración** web.

---

## Requisitos Previos

Antes de empezar, asegúrate de tener instalado:

| Software | Versión mínima | Verificar | Instalación |
|----------|---------------|-----------|-------------|
| **Node.js** | v18 o superior | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | v9 o superior | `npm --version` | Viene con Node.js |
| **Git** | cualquiera | `git --version` | [git-scm.com](https://git-scm.com) |

También necesitas:
- Una **cuenta de Supabase** gratuita → [supabase.com](https://supabase.com)
- Un **editor de código** (recomendado: VS Code)

### Verificar requisitos

Abre tu terminal y ejecuta:

```bash
node --version    # Debe mostrar v18.x.x o superior
npm --version     # Debe mostrar 9.x.x o superior
```

Si no tienes Node.js, descárgalo de [nodejs.org](https://nodejs.org) (versión LTS recomendada).

---

## Instalación Paso a Paso

### Paso 1: Clonar o copiar el proyecto

Si tienes el proyecto en un repositorio Git:

```bash
git clone <URL_DEL_REPOSITORIO>
cd deone-backend
```

Si ya tienes la carpeta del proyecto, simplemente navega a ella:

```bash
cd /ruta/a/tu/carpeta/deone-backend
```

### Paso 2: Instalar dependencias

```bash
npm install
```

Esto descarga todas las librerías necesarias. Verás un mensaje similar a:

```
added 85 packages in 5s
```

Las dependencias que se instalan son:

| Paquete | Para qué sirve |
|---------|----------------|
| `express` | Framework web (servidor HTTP y rutas) |
| `@supabase/supabase-js` | Cliente para conectarse a Supabase (PostgreSQL) |
| `dotenv` | Cargar variables de entorno desde archivo `.env` |
| `zod` | Validar datos de entrada (schemas) |
| `helmet` | Seguridad HTTP (headers de protección) |
| `cors` | Permitir peticiones desde otros dominios |
| `morgan` | Logs de peticiones HTTP en consola |
| `uuid` | Generar identificadores únicos (request IDs) |

---

## Configuración de Supabase

### Paso 1: Crear un proyecto en Supabase

1. Ve a [app.supabase.com](https://app.supabase.com)
2. Click en **"New Project"**
3. Elige un nombre (ej: `deone-backend`)
4. Selecciona una región cercana (ej: `South America - São Paulo`)
5. Crea una contraseña para la base de datos
6. Click en **"Create new project"**
7. Espera ~2 minutos mientras se crea

### Paso 2: Obtener las credenciales

Una vez creado el proyecto:

1. Ve a **Settings** (ícono de engranaje) → **API**
2. Copia estos 3 valores:

| Valor | Dónde encontrarlo |
|-------|-------------------|
| **Project URL** | Sección "Project URL" → el campo con `https://xxxxx.supabase.co` |
| **anon public key** | Sección "Project API Keys" → `anon` `public` |
| **service_role key** | Sección "Project API Keys" → `service_role` `secret` (click en "Reveal") |

> ⚠️ **IMPORTANTE:** La `service_role` key tiene acceso total a la base de datos. Nunca la expongas en el frontend ni en repositorios públicos.

---

## Configurar Variables de Entorno

### Paso 1: Crear el archivo `.env`

En la raíz del proyecto, copia el archivo de ejemplo:

```bash
cp .env.example .env
```

### Paso 2: Editar `.env` con tus credenciales

Abre el archivo `.env` con tu editor y reemplaza los valores:

```env
# ===========================================
# DeOne Backend - Variables de Entorno
# ===========================================

# Servidor
PORT=3000
NODE_ENV=development

# Supabase (reemplaza con tus credenciales)
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# Autenticación Bot / Admin (cambia estos valores en producción)
BOT_API_KEY=bot-secret-key-cambiar-en-produccion
ADMIN_API_KEY=admin-secret-key-cambiar-en-produccion
```

### ¿Qué hace cada variable?

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto donde correrá el servidor (default: 3000) |
| `NODE_ENV` | Entorno: `development` o `production` |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_ANON_KEY` | Key pública (para operaciones del cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Key con permisos totales (para el backend) |
| `BOT_API_KEY` | Clave que usará el bot de WhatsApp para autenticarse |
| `ADMIN_API_KEY` | Clave que usará el panel admin para autenticarse |

> 💡 **Tip:** En producción, genera claves seguras para `BOT_API_KEY` y `ADMIN_API_KEY`. Puedes usar: `openssl rand -hex 32`

---

## Crear las Tablas en la Base de Datos

### Paso 1: Abrir el SQL Editor de Supabase

1. Ve a tu proyecto en [app.supabase.com](https://app.supabase.com)
2. En el menú lateral, click en **"SQL Editor"** (ícono de código `<>`)
3. Click en **"New query"**

### Paso 2: Ejecutar la migración

1. Abre el archivo `sql/001_initial_migration.sql` de tu proyecto
2. Copia **TODO** el contenido del archivo
3. Pégalo en el SQL Editor de Supabase
4. Click en **"Run"** (o `Ctrl+Enter` / `Cmd+Enter`)

Deberías ver: `Success. No rows returned.`

### Paso 3: Verificar las tablas

En el menú lateral de Supabase, ve a **"Table Editor"**. Debes ver estas 9 tablas:

| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Datos de los usuarios |
| `ajustes_usuario` | Configuraciones por usuario |
| `obligaciones` | Servicios registrados (energía, internet, etc.) |
| `facturas` | Facturas capturadas |
| `recargas` | Recargas/consignaciones de dinero |
| `revisiones_admin` | Cola de revisión para el admin |
| `pagos` | Pagos realizados |
| `notificaciones` | Notificaciones enviadas |
| `audit_log` | Registro de auditoría |

También se crea la vista `v_disponible_por_periodo` para calcular disponibilidad.

---

## Arrancar el Servidor

### Modo desarrollo (recomendado para trabajar)

```bash
npm run dev
```

Este modo **reinicia automáticamente** el servidor cuando cambias algún archivo.

### Modo producción

```bash
npm start
```

### ¿Qué debo ver?

Al arrancar, verás este banner en la consola:

```
╔═══════════════════════════════════════════╗
║         🚀 DeOne Backend                  ║
║─────────────────────────────────────────  ║
║  Puerto:     3000                         ║
║  Entorno:    development                  ║
║  Supabase:   Conectado                    ║
║  Health:     http://localhost:3000/api/health  ║
╚═══════════════════════════════════════════╝
```

> ✅ Si ves este banner, **el servidor está corriendo correctamente**.

### Detener el servidor

Presiona `Ctrl+C` en la terminal donde está corriendo.

---

## Verificar que Todo Funciona

### Test 1: Health Check

Abre tu navegador o ejecuta en otra terminal:

```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "data": {
    "service": "DeOne Backend",
    "status": "running"
  }
}
```

### Test 2: Crear un usuario de prueba

```bash
curl -X POST http://localhost:3000/api/users/upsert \
  -H "Content-Type: application/json" \
  -H "x-bot-api-key: bot-secret-key-cambiar-en-produccion" \
  -d '{"telefono": "+573001234567", "nombre": "Test", "apellido": "Usuario"}'
```

Respuesta esperada:

```json
{
  "ok": true,
  "data": { "usuario_id": "...", "creado": true }
}
```

### Test 3: Verificar autenticación

```bash
curl http://localhost:3000/api/users/by-telefono/+573001234567
```

Respuesta esperada (sin API key → rechazado):

```json
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "API Key de admin inválida o ausente" }
}
```

> ✅ Si los 3 tests pasan, **todo está funcionando perfectamente**.

---

## Acceder al Panel de Administración

El servidor sirve automáticamente un panel de administración web.

### Abrir el panel

1. Asegúrate de que el servidor esté corriendo
2. Abre tu navegador
3. Ve a: **[http://localhost:3000](http://localhost:3000)**

### ¿Qué puedes hacer en el panel?

| Sección | Funcionalidad |
|---------|---------------|
| 📊 **Dashboard** | Ver revisiones pendientes y estado del servidor |
| 👥 **Usuarios** | Buscar usuarios por teléfono, crear/actualizar |
| 📋 **Obligaciones** | Ver los servicios de un usuario, crear nuevos |
| 🧾 **Facturas** | Capturar facturas (simular bot), validar, rechazar |
| 💰 **Recargas** | Reportar recargas (simular bot), aprobar, rechazar |
| 🔍 **Revisiones** | Ver cola de revisión, tomar, descartar |
| 💳 **Pagos** | Crear pagos, confirmar, marcar como fallidos |
| 📈 **Disponibilidad** | Consultar saldo disponible por periodo |

### Indicador de conexión

En la esquina inferior izquierda del panel verás:
- 🟢 **"Servidor online"** → Todo conectado
- 🔴 **"Sin conexión"** → El servidor no está corriendo

---

## Ejecutar Tests

El proyecto incluye scripts de prueba que verifican todos los endpoints:

### Test completo de todos los endpoints

```bash
bash tests/test_endpoints.sh
```

Este script prueba 38 endpoints y muestra una tabla con los resultados.

### Test frontend → backend (simula el panel admin)

```bash
bash tests/test_frontend_to_backend.sh
```

Este script simula exactamente las llamadas que hace el panel admin al backend (33 pruebas).

### Resultado esperado

```
╔══════════════════════════════════════════════════╗
║  ✅ PASS: 33  ❌ FAIL: 0  📊 TOTAL: 33         ║
║  🎉 ¡TODO FUNCIONA PERFECTO! Front → Back OK    ║
╚══════════════════════════════════════════════════╝
```

---

## Estructura del Proyecto

```
deone-backend/
│
├── 📄 package.json              ← Dependencias y scripts npm
├── 📄 .env                      ← Variables de entorno (NO subir a Git)
├── 📄 .env.example              ← Plantilla de variables de entorno
├── 📄 .gitignore                ← Archivos ignorados por Git
│
├── 📁 src/                      ← Código fuente del backend
│   ├── 📄 server.js             ← Punto de entrada (arranca el servidor)
│   ├── 📄 app.js                ← Configuración de Express (rutas, middleware)
│   │
│   ├── 📁 config/               ← Configuración central
│   │   ├── 📄 index.js          ← Lee variables de entorno, valida que existan
│   │   └── 📄 supabase.js       ← Cliente Supabase (con service_role key)
│   │
│   ├── 📁 middleware/            ← Middleware de Express
│   │   ├── 📄 auth.js           ← Autenticación (bot, admin, botOrAdmin)
│   │   ├── 📄 errorHandler.js   ← Manejo centralizado de errores
│   │   ├── 📄 requestId.js      ← Genera UUID único por cada petición
│   │   └── 📄 validate.js       ← Validación de body/query con Zod
│   │
│   ├── 📁 modules/              ← Módulos de negocio (cada uno con 3 archivos)
│   │   ├── 📁 users/            ← 👥 Usuarios
│   │   │   ├── users.routes.js  ← Rutas: POST /upsert, GET /by-telefono
│   │   │   ├── users.schema.js  ← Validación con Zod
│   │   │   └── users.service.js ← Lógica de negocio
│   │   │
│   │   ├── 📁 obligaciones/     ← 📋 Obligaciones (servicios del usuario)
│   │   ├── 📁 facturas/         ← 🧾 Facturas
│   │   ├── 📁 recargas/         ← 💰 Recargas
│   │   ├── 📁 revisiones/       ← 🔍 Revisiones Admin
│   │   ├── 📁 disponibilidad/   ← 📈 Disponibilidad
│   │   └── 📁 pagos/            ← 💳 Pagos
│   │
│   └── 📁 utils/                ← Utilidades compartidas
│       ├── 📄 auditLog.js       ← Registra acciones en audit_log
│       ├── 📄 periodo.js        ← Normaliza fechas a YYYY-MM-01
│       ├── 📄 resolverUsuario.js← Convierte teléfono → usuario_id
│       ├── 📄 response.js       ← Formato estándar de respuestas
│       └── 📄 stateMachine.js   ← Transiciones de estado válidas
│
├── 📁 public/                   ← Frontend (Panel Admin)
│   ├── 📄 index.html            ← Estructura HTML del panel
│   ├── 📄 styles.css            ← Estilos (diseño completo)
│   └── 📄 app.js                ← Lógica del panel (SPA vanilla JS)
│
├── 📁 sql/                      ← Migraciones de base de datos
│   └── 📄 001_initial_migration.sql  ← Tablas, enums, índices, vistas
│
├── 📁 tests/                    ← Scripts de prueba
│   ├── 📄 test_endpoints.sh     ← Test de todos los endpoints (38 tests)
│   └── 📄 test_frontend_to_backend.sh ← Test frontend→backend (33 tests)
│
├── 📁 postman/                  ← Colección de Postman
│   └── 📄 DeOne_Backend.postman_collection.json
│
└── 📁 docs/                     ← Documentación
    ├── 📄 API_DOCUMENTACION.md  ← Documentación completa de la API
    └── 📄 MANUAL_INSTALACION.md ← Este archivo
```

---

## ¿Cómo Funciona?

### Arquitectura General

```
┌────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Bot WhatsApp │────▶│  DeOne Backend  │────▶│   Supabase   │
│   (cliente)    │ API │  (Node/Express) │ SQL │  (PostgreSQL)│
└────────────────┘     └─────────────────┘     └──────────────┘
                              │
                       ┌──────┴──────┐
                       │ Panel Admin │
                       │ (localhost) │
                       └─────────────┘
```

### Flujo de Datos Resumido

```
1. 👤 Usuario escribe al bot de WhatsApp
2. 🤖 El bot llama a la API con x-bot-api-key
3. 📡 El backend valida datos (Zod) y los guarda en Supabase
4. 👨‍💼 El admin abre el panel web (localhost:3000)
5. 🔍 Revisa facturas/recargas pendientes
6. ✅ Aprueba o ❌ Rechaza
7. 💳 Ejecuta los pagos
8. 📊 Verifica el saldo disponible
```

### Sistema de Autenticación

El backend usa **API Keys** en los headers HTTP:

```
Bot de WhatsApp  ──▶  x-bot-api-key: bot-secret-key-...
                      (puede crear usuarios, obligaciones, facturas, recargas)

Panel Admin      ──▶  x-admin-api-key: admin-secret-key-...
                      (puede validar, rechazar, aprobar, crear pagos)
```

Algunos endpoints aceptan ambas keys (ej: consultar obligaciones, disponibilidad).

### Máquina de Estados

Cada entidad tiene estados y transiciones controladas:

**Factura:**
```
captura(ok) → extraida → validada → pagada
captura(dudosa) → en_revision → validada → pagada
                               → rechazada
```

**Recarga:**
```
reportar → reportada → aprobada
                     → rechazada
```

**Pago:**
```
crear → en_proceso → pagado
                   → fallido
```

Si intentas una transición inválida (ej: validar una factura ya pagada), el sistema responde con `409 INVALID_STATE`.

### Formato de Respuesta

Todas las respuestas siguen el mismo formato:

```json
{
  "ok": true,          // true si la operación fue exitosa
  "data": { ... },     // los datos (null si hubo error)
  "error": null        // null si no hubo error, o { code, message }
}
```

---

## Comandos Útiles

| Comando | Qué hace |
|---------|----------|
| `npm install` | Instala todas las dependencias |
| `npm start` | Arranca el servidor (producción) |
| `npm run dev` | Arranca en modo desarrollo (auto-reinicio) |
| `bash tests/test_endpoints.sh` | Ejecuta 38 pruebas de la API |
| `bash tests/test_frontend_to_backend.sh` | Ejecuta 33 pruebas frontend→backend |
| `curl http://localhost:3000/api/health` | Verifica que el servidor responde |
| `lsof -ti:3000 \| xargs kill -9` | Mata procesos en el puerto 3000 (si está ocupado) |

---

## Solución de Problemas

### ❌ `Error: Cannot find module ...`

**Causa:** No instalaste las dependencias.  
**Solución:**
```bash
npm install
```

### ❌ `Error: listen EADDRINUSE: address already in use :::3000`

**Causa:** Ya hay algo corriendo en el puerto 3000.  
**Solución:**
```bash
# Matar el proceso que ocupa el puerto
lsof -ti:3000 | xargs kill -9

# Volver a arrancar
npm run dev
```

O cambia el puerto en `.env`:
```env
PORT=3001
```

### ❌ `SUPABASE_URL is required` o `SUPABASE_SERVICE_ROLE_KEY is required`

**Causa:** Falta el archivo `.env` o faltan variables.  
**Solución:**
```bash
# Crear el archivo .env a partir del ejemplo
cp .env.example .env

# Editar y poner tus credenciales de Supabase
nano .env    # o abrirlo con tu editor
```

### ❌ `401 Unauthorized` al llamar a un endpoint

**Causa:** Falta el header de autenticación.  
**Solución:** Asegúrate de incluir el header correcto:
```bash
# Para endpoints del bot:
-H "x-bot-api-key: bot-secret-key-cambiar-en-produccion"

# Para endpoints de admin:
-H "x-admin-api-key: admin-secret-key-cambiar-en-produccion"
```

### ❌ Las tablas no existen en Supabase

**Causa:** No ejecutaste la migración SQL.  
**Solución:**
1. Abre Supabase → SQL Editor
2. Copia el contenido de `sql/001_initial_migration.sql`
3. Pégalo y ejecuta (Run)

### ❌ El panel admin no carga o muestra errores

**Causa:** El servidor no está corriendo.  
**Solución:**
1. Verifica que el servidor esté activo: `curl http://localhost:3000/api/health`
2. Si no responde, arranca el servidor: `npm run dev`
3. Abre [http://localhost:3000](http://localhost:3000) en tu navegador

### ❌ `node: command not found`

**Causa:** Node.js no está instalado.  
**Solución:**
- **macOS:** `brew install node` o descarga de [nodejs.org](https://nodejs.org)
- **Ubuntu/Debian:** `sudo apt install nodejs npm`
- **Windows:** Descarga el instalador de [nodejs.org](https://nodejs.org)

---

## 🚀 Resumen Rápido (TL;DR)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# 3. Ejecutar migración SQL en Supabase
# → Copiar sql/001_initial_migration.sql al SQL Editor de Supabase y ejecutar

# 4. Arrancar el servidor
npm run dev

# 5. Verificar
curl http://localhost:3000/api/health

# 6. Abrir panel admin
open http://localhost:3000

# 7. Ejecutar tests
bash tests/test_endpoints.sh
```

**¡Listo! 🎉** El servidor está corriendo en `http://localhost:3000`
