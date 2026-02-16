# 🏢 DeOne Admin Panel

Sistema de administración web para gestión de usuarios, facturas, obligaciones, recargas y pagos.

## 🚀 **Características**

- **📊 Dashboard** con estadísticas en tiempo real
- **👥 Gestión de Usuarios** - Crear, editar, listar usuarios
- **🧾 Gestión de Facturas** - Captura, validación, seguimiento
- **📋 Gestión de Obligaciones** - Control de pagos mensuales
- **💰 Gestión de Recargas** - Aprobación de saldos
- **💳 Gestión de Pagos** - Procesamiento y confirmación
- **🔍 Sistema de Revisiones** - Validación administrativa
- **📈 Control de Disponibilidad** - Saldos y límites

## 🛠️ **Tecnologías**

- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Backend**: Node.js, Express.js
- **Autenticación**: Token único (Bearer Token)
- **Base de Datos**: Supabase (configurado para producción)

## 🔐 **Autenticación**

El sistema utiliza un token único para todos los endpoints:

```
Authorization: Bearer TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

## 📦 **Instalación Local**

```bash
# Clonar repositorio
git clone <URL-del-repositorio>
cd prueba-supabase

# Instalar dependencias
npm install

# Iniciar servidor
npm start
```

El servidor estará disponible en: `http://localhost:3000`

## 🌐 **Endpoints Principales**

### Health Check
```
GET /api/health
```

### Usuarios
```
GET  /api/usuarios     - Listar usuarios
POST /api/usuarios     - Crear usuario
```

### Facturas
```
GET  /api/facturas     - Listar facturas
POST /api/facturas     - Crear factura
```

## 📱 **Uso con Bot**

Para integrar con el bot de WhatsApp:

```javascript
const config = {
    apiUrl: "https://tu-api-production.com/api",
    authToken: "TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3"
};

// Ejemplo de llamada
const response = await fetch(`${config.apiUrl}/usuarios`, {
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`
    }
});
```

## 📁 **Estructura del Proyecto**

```
├── public/
│   ├── index.html      # Página principal
│   ├── app.js          # Lógica del frontend
│   └── styles.css      # Estilos
├── docs/
│   ├── API_DOCUMENTACION_COMPLETA.md
│   ├── PRUEBAS_API_EJECUTADAS.md
│   └── PRUEBAS_API_REALES.md
├── server.js           # Servidor API
├── package.json        # Dependencias
└── README.md           # Este archivo
```

## 🚀 **Despliegue**

### Render (Producción)
El proyecto está configurado para despliegue en Render. Variables de entorno requeridas:

- `API_URL`: URL de la API en producción
- `AUTH_TOKEN`: Token de autenticación (opcional, usa el por defecto)

### Variables de Entorno
```bash
API_URL=https://tu-api-production.com/api
AUTH_TOKEN=TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
```

## 📖 **Documentación**

- **API Completa**: `docs/API_DOCUMENTACION_COMPLETA.md`
- **Pruebas Ejecutadas**: `docs/PRUEBAS_API_EJECUTADAS.md`
- **Pruebas Reales**: `docs/PRUEBAS_API_REALES.md`

## 🔄 **Flujo de Trabajo**

1. **Bot WhatsApp** → Captura datos del usuario
2. **API** → Procesa y valida información
3. **Admin Panel** → Revisión y aprobación
4. **Sistema** → Ejecuta pagos y actualiza estados

## 🛡️ **Seguridad**

- Token único de autenticación
- Validación de datos en todos los endpoints
- Manejo seguro de información sensible
- CORS configurado para producción

## 📞 **Soporte**

Para dudas o soporte técnico:
- Revisar la documentación en `docs/`
- Verificar logs del servidor
- Validar configuración del token

---

**Versión**: 1.0.0  
**Última actualización**: 16 de Febrero de 2026  
**Estado**: ✅ Activo y funcionando
