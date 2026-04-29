# Cambios Backend — Cierre Dashboard Admin

**Fecha:** 28 de abril de 2026
**Migración SQL:** [`sql/005_dashboard_admin_extras.sql`](../sql/005_dashboard_admin_extras.sql)
**Alcance:** Implementa los puntos 1–6 del documento *"Requerimientos al Backend — Pendientes para cerrar el Dashboard Admin"*.

> **Acción operativa requerida:** ejecutar la migración `005_dashboard_admin_extras.sql` en Supabase **antes** de desplegar este backend. Hace `ADD COLUMN IF NOT EXISTS` y backfill, es idempotente.

---

## Resumen ejecutivo

| Prioridad | Cambio | Estado | Endpoints afectados |
|-----------|--------|--------|---------------------|
| 🔴 Alta | Auto-disparar `obligacion_cumplida` al confirmar pago | ✅ | `PUT /api/pagos/:id/confirmar` |
| 🔴 Alta | Filtros `?canal`, `?canal_grupo`, `?destinatario` | ✅ | `/api/admin/notificaciones/*` |
| 🔴 Alta | Columna `destinatario` en `notificaciones` | ✅ | DB + todas las respuestas |
| 🟡 Media | Campos extra en creación de obligación | ✅ | `POST /api/obligaciones` |
| 🟡 Media | Persistir/devolver `etiqueta` consistentemente | ✅ | `POST /api/facturas/captura` + GETs |
| 🟡 Media | Validar transiciones + suspender jobs en `cancelada` | ✅ | `PUT /api/obligaciones/:id` |
| 🟢 Baja | Aceptar `periodo` en validación de factura | ✅ | `PUT /api/facturas/:id/validar` |
| 🟢 Baja | Catálogo de etiquetas (Opción B) | ✅ | `GET /api/facturas/etiquetas-distinct` |

---

## 1. Filtrar notificaciones por canal (server-side)

Todos los endpoints admin de notificaciones aceptan ahora **server-side**:

```
?canal=whatsapp|telegram|email|push|sms|sistema|admin|interno
?canal_grupo=bot|admin
   bot   = canal IN (whatsapp, telegram)
   admin = canal IN (admin, interno, sistema)
?destinatario=admin|usuario
```

Aplica a:

- `GET /api/admin/notificaciones/list`
- `GET /api/admin/notificaciones/estadisticas`
- `GET /api/admin/notificaciones/alertas`
- `GET /api/admin/notificaciones/automaticas`

Las **estadísticas también respetan el filtro** (totales y distribución por tipo).

Ejemplos:

```
GET /api/admin/notificaciones/list?canal_grupo=bot&page=1&limit=50
GET /api/admin/notificaciones/list?destinatario=admin
GET /api/admin/notificaciones/estadisticas?canal=whatsapp&periodo=2026-04
```

Implementación: [src/modules/admin/admin.routes.js](../src/modules/admin/admin.routes.js), [src/modules/admin/admin.service.js](../src/modules/admin/admin.service.js).

---

## 2. Columna `destinatario` en `notificaciones`

**Migración SQL:**

```sql
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS destinatario varchar(10) NOT NULL DEFAULT 'usuario';
ALTER TABLE notificaciones
  ADD CONSTRAINT chk_notificaciones_destinatario
  CHECK (destinatario IN ('admin', 'usuario'));

-- Backfill aplicado:
--   tipo='alerta_admin'   → 'admin'
--   usuario_id IS NULL    → 'admin'
```

**Comportamiento en el backend:**

- `crearNotificacion` (POST `/api/notificaciones`) acepta `destinatario` (default `usuario`).
- `crearNotificacionInterna` infiere `admin` si `usuario_id` es `null`, `usuario` en otro caso (override explícito permitido).
- `crearAlertaAdmin` siempre escribe `destinatario: 'admin'`.
- `crearNotificacionMasiva` acepta `destinatario` (default `usuario`).

El campo se devuelve en todas las respuestas (los `select *` ya lo incluyen).

---

## 3. Campaña automática `obligacion_cumplida`

Cuando `PUT /api/pagos/:id/confirmar` detecta que la obligación pasa a `completada`, ahora dispara dos notificaciones internas:

1. `obligacion_completada` (compatibilidad con flujos previos).
2. **`obligacion_cumplida`** ← **nueva campaña para el bot/usuario**, con el payload exacto solicitado:

```json
{
  "usuario_id": "...",
  "tipo": "obligacion_cumplida",
  "canal": "whatsapp",
  "destinatario": "usuario",
  "estado": "pendiente",
  "payload": {
    "obligacion_id": "...",
    "servicio": "EPM Energía",
    "periodo": "2026-04-01",
    "monto_total": 250000,
    "monto_pagado": 250000,
    "nueva_obligacion_id": "...",
    "mensaje": "✅ ¡Tu obligación de Abril 2026 fue completada!"
  }
}
```

> **Frontend:** ya puede eliminar la llamada manual a `crearNotificacion('obligacion_cumplida')` en `PagarFacturaModal.tsx`.

La campaña también se dispara cuando un admin **mueve manualmente** la obligación a `completada` vía `PUT /api/obligaciones/:id` (ver punto 4).

Implementación: [src/modules/pagos/pagos.service.js](../src/modules/pagos/pagos.service.js), [src/modules/obligaciones/obligaciones.service.js](../src/modules/obligaciones/obligaciones.service.js).

---

## 4. Validaciones en cambio de estado de obligación

`PUT /api/obligaciones/:id` ahora valida transiciones:

| Estado actual | Transiciones permitidas |
|---------------|-------------------------|
| `activa` | `en_progreso`, `completada`, `cancelada` |
| `en_progreso` | `completada`, `cancelada` |
| `completada` | _terminal_ (bloqueado para no inconsistencias con pagos) |
| `cancelada` | `activa` (reactivar) |

Una transición inválida responde **409** `INVALID_TRANSITION`:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Transición no válida: 'completada' → 'activa'. Desde 'completada' solo se permite: [ninguno]."
  }
}
```

**Efectos colaterales del cambio de estado:**

- → `cancelada`:
  - `solicitudes_recarga` asociadas a esa obligación → estado `cancelada`.
  - Notificaciones pendientes tipo `solicitud_recarga`, `solicitud_recarga_inicio_mes`, `recordatorio_recarga` del usuario → estado `fallida` con `ultimo_error: "Obligación cancelada (...)"`.
  - El cron job ya no las volverá a evaluar (sólo procesa estados `pendiente`/`parcial`).

- → `completada` (manual): dispara la campaña `obligacion_cumplida` (ver punto 3).

Además, `PUT /api/obligaciones/:id` ahora acepta `pagina_pago` y `periodicidad` para edición.

---

## 5. Campos faltantes en endpoints

### 5a. `POST /api/obligaciones`

Acepta los campos opcionales solicitados:

```json
{
  "telefono": "...",
  "descripcion": "Pagos de Abril 2026",
  "periodo": "2026-04-01",
  "servicio": "EPM Energía",
  "tipo_referencia": "factura",
  "numero_referencia": "EPM-2026-04",
  "pagina_pago": "https://www.epm.com.co/pagar",
  "periodicidad": "mensual"
}
```

- `pagina_pago` y `periodicidad` se agregaron a la tabla `obligaciones` en la migración 005.
- Si no se envían, los valores anteriores siguen funcionando (fallback al comportamiento existente).

### 5b. `etiqueta` en facturas

- `POST /api/facturas/captura`: ya guarda `etiqueta` (no había bug).
- `GET /api/facturas/obligacion/:id`: ya devuelve `etiqueta` en la proyección.
- `GET /api/admin/facturas`: la proyección ya incluye `etiqueta`.
- `GET /api/admin/clientes/:telefono`: usa `select *` sobre facturas → `etiqueta` viene incluido.

(Verificado, no requirió cambios de código adicionales.)

### 5c. `PUT /api/facturas/:id/validar` acepta `periodo`

Schema actualizado: `periodo` opcional. Si se envía, sobreescribe el periodo de la factura (normalizado a `YYYY-MM-01`). Si no se envía, se hereda del valor actual (comportamiento previo).

---

## 6. Catálogo de etiquetas — Opción B

Endpoint nuevo:

```
GET /api/facturas/etiquetas-distinct        (auth: bot o admin)
```

Respuesta:

```json
{
  "ok": true,
  "data": {
    "total": 6,
    "etiquetas": ["agua", "celular", "energia", "gas", "internet", "tv"]
  }
}
```

Implementación: `SELECT etiqueta FROM facturas WHERE etiqueta IS NOT NULL` + DISTINCT en memoria + orden alfabético `es-CO`.

---

## Archivos modificados

- `sql/005_dashboard_admin_extras.sql` (nuevo)
- `src/modules/notificaciones/notificaciones.schema.js`
- `src/modules/notificaciones/notificaciones.service.js`
- `src/modules/admin/admin.routes.js`
- `src/modules/admin/admin.service.js`
- `src/modules/pagos/pagos.service.js`
- `src/modules/obligaciones/obligaciones.schema.js`
- `src/modules/obligaciones/obligaciones.service.js`
- `src/modules/facturas/facturas.schema.js`
- `src/modules/facturas/facturas.routes.js`
- `src/modules/facturas/facturas.service.js`

---

## Checklist de despliegue

1. Mergear este branch.
2. Ejecutar `sql/005_dashboard_admin_extras.sql` en Supabase (idempotente; seguro re-ejecutar).
3. Reiniciar el backend (los nuevos campos ya se leen al insertar/listar).
4. Frontend puede:
   - Quitar la llamada manual a `crearNotificacion('obligacion_cumplida')` en `PagarFacturaModal.tsx`.
   - Mover el filtro de canal a query string (`?canal_grupo=bot|admin`) en lugar de filtrar client-side — la paginación volverá a ser correcta.
   - Usar `?destinatario=admin|usuario` para separar las pestañas Admin / Bot·WhatsApp.
   - Consumir `GET /api/facturas/etiquetas-distinct` para autocompletar etiquetas en el modal de captura/validación.
   - Enviar los nuevos campos opcionales en `POST /api/obligaciones` y `PUT /api/facturas/:id/validar`.
