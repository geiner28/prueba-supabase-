# Cambios entre la documentación v2.0 (PDF) y v3.1 (BOT_ENDPOINTS_v3.md)

**Documento origen:** `DeOne_API_Documentation.pdf` — Versión 2.0 / 2.1 (12–16 marzo 2026)
**Documento destino:** `BOT_ENDPOINTS_v3.md` — Versión 3.1 (11 mayo 2026)

Este documento lista, sección por sección, las diferencias entre la primera versión publicada de la documentación de la API del bot y la versión vigente.

---

## 1. Metadatos generales

| Aspecto | v2.0 (PDF) | v3.1 (MD) |
|---|---|---|
| Versión | 2.0 / 2.1 | 3.1 |
| Fecha | 12 – 16 de marzo de 2026 | 11 de mayo de 2026 |
| Endpoints anunciados | 18 | 18 (los mismos slots) |
| Cron jobs | 2 (9 AM diario + cada 6 h) | 2 (cada 30 min + cada 6 h) |

---

## 2. Usuarios

### EP1 — `POST /api/users/upsert`

**Nuevos campos opcionales en v3.1** que el PDF v2.0 no documenta:

- `tipo_identificacion` (`"CC"`, `"NIT"`, `"CE"`)
- `numero_identificacion` (máx. 32 caracteres)
- `ciudad` (máx. 80 caracteres)
- `direccion` (máx. 255 caracteres)

El resto del endpoint (formato de respuesta, idempotencia por teléfono) se mantiene igual.

### EP2 — `PUT /api/users/plan`

Sin cambios funcionales. Mismos planes (`control`, `tranquilidad`, `respaldo`).

---

## 3. Obligaciones (EP3 – EP5)

Sin cambios funcionales. Misma estructura de creación, listado y detalle.

---

## 4. Facturas — Cambio crítico de modelo de estados

### EP6 — `POST /api/facturas/captura`

**Cambio de esquema de estados:**

| Aspecto | v2.0 | v3.1 |
|---|---|---|
| Estado inicial | `"extraida"` | `"pendiente"` |
| Modelo de validación | Estado único `estado` | Dos campos: `estado` + `validacion_estado` |
| Estados de `estado` (v2.0) | `extraida`, `en_revision`, `validada`, `pagada`, `rechazada` | — |
| Estados de `estado` (v3.1) | — | `pendiente`, `pagada`, `anulada` |
| Estados de `validacion_estado` (v3.1) | — | `sin_validar`, `validada`, `rechazada` |

Combinaciones válidas en v3.1:

| `estado` | `validacion_estado` | Significado |
|---|---|---|
| `pendiente` | `sin_validar` | Recién capturada |
| `pendiente` | `validada` | Lista para generar pago |
| `pendiente` | `rechazada` | Admin la rechazó |
| `pagada` | `validada` | Pago ejecutado |
| `anulada` | cualquiera | Cancelada |

### Impacto en EP13 (crear pago)

- v2.0: requería `estado = "validada"`.
- v3.1: requiere `validacion_estado = "validada"`.

### EP7 — `GET /api/facturas/obligacion/:obligacionId`

Sin cambios estructurales. Sigue siendo el endpoint del que se obtiene `_id` para usar en EP13.

---

## 5. Recargas — EP8 `POST /api/recargas/reportar`

**Nuevos campos opcionales en v3.1:**

- `nombre`
- `apellido`

Permiten actualizar el nombre/apellido del usuario en la misma llamada cuando aún tiene el teléfono como nombre por defecto. El resto (idempotencia por `referencia_tx`, estado inicial `en_validacion`) se mantiene.

---

## 6. Saldo Disponible — EP9

Sin cambios. Misma fórmula `disponible = total_recargas_aprobadas − total_pagos_realizados`.

---

## 7. Notificaciones — Sección completamente reescrita ⚠️

Es el cambio más grande entre las dos versiones.

### 7.1 Tipos de notificación

| v2.0 (12 tipos) | v3.1 (3 tipos al bot) |
|---|---|
| `solicitud_recarga` | `solicitud_recarga` ✅ |
| `solicitud_recarga_inicio_mes` | ❌ eliminado / fusionado |
| `recordatorio_recarga` | ❌ eliminado |
| `recarga_confirmada` | ❌ internalizado (no llega al bot) |
| `recarga_aprobada` | ❌ internalizado |
| `recarga_rechazada` | ❌ internalizado |
| `factura_validada` | ❌ internalizado |
| `factura_rechazada` | ❌ internalizado |
| `pago_confirmado` | ❌ reemplazado por `obligacion_cumplida` |
| `obligacion_completada` | ❌ eliminado |
| `nueva_obligacion` | ❌ eliminado |
| `alerta_admin` | sigue existiendo (interno, no llega al bot) |
| — | `obligacion_cumplida` 🆕 |
| — | `obligaciones_pagadas_grupal` 🆕 |

### 7.2 Agrupamiento automático de pagos (nuevo en v3.1)

- Pagos con `creado_en` dentro de **≤ 30 minutos** se devuelven como un único registro `obligaciones_pagadas_grupal` con `payload.obligaciones[]`.
- 1 pago aislado → `obligacion_cumplida`.
- ID del registro grupal: `grp-{id_del_primero}`.
- Verificado con test unitario el 11 de mayo.

### 7.3 Normalización de mensajes en `solicitud_recarga`

| Aspecto | v2.0 | v3.1 |
|---|---|---|
| `payload.mensaje` | Contenía placeholders (`(saldo_usuario)`, `(valor_recarga)`) | Texto totalmente normalizado, valores reales formateados (`$ 170.000`) |
| Acción del bot | Reemplazar valores antes de enviar | Enviar `payload.mensaje` tal cual |
| Garantía | — | Normalización en write-time (`crearNotificacionInterna`) y read-time (`obtenerPendientesUsuario`) |

Nuevos campos del payload de `solicitud_recarga` en v3.1:

- `saldo_actual` / `saldo_usuario` (alias)
- `valor_recarga` / `valor_a_recargar` (alias)
- `nombre_usuario`
- `periodo`

### 7.4 EP12a — `GET /api/notificaciones/pendientes-hoy`

| Aspecto | v2.0 | v3.1 |
|---|---|---|
| Tipo filtrado | `solicitud_recarga_inicio_mes` | `solicitud_recarga` |
| Estado destino al consultar | `enviada` | `entregada` |

### 7.5 EP10 / EP11 / EP12

Misma firma. Se reafirma en v3.1 que EP11 y EP12 son **opcionales** porque EP10 marca automáticamente como `enviada`.

---

## 8. Pagos — EP13

Único cambio: la precondición pasa de `estado = "validada"` (v2.0) a `validacion_estado = "validada"` (v3.1). El cuerpo, respuesta y errores (`NOT_FOUND`, `INVALID_STATE_TRANSITION`, `INSUFFICIENT_FUNDS`) se mantienen.

Adicionalmente, en v3.1 cada pago exitoso genera notificaciones `obligacion_cumplida` (que pueden agruparse en `obligaciones_pagadas_grupal`).

---

## 9. Solicitudes de Recarga — EP14 a EP17

Sin cambios funcionales relevantes. La lógica por plan (`control` 1 cuota, `tranquilidad`/`respaldo` 2 cuotas con corte en día 15) y los estados (`pendiente → parcial → cumplida` / `vencida` / `cancelada`) se mantienen.

Diferencias menores:

- v3.1 documenta explícitamente que **el cron de evaluación corre cada 30 minutos** y dispara EP16 internamente.
- v3.1 menciona la **auto-limpieza** al aprobar recargas (cancela solicitudes que quedan cubiertas).

---

## 10. Cron Jobs (sección "Sistema Automático")

| Job | v2.0 | v3.1 |
|---|---|---|
| Evaluación de recargas | `0 9 * * *` (1 vez al día, 9:00 AM) | `*/30 * * * *` (cada 30 min) |
| Verificación de inactividad | `0 */6 * * *` (cada 6 h), genera `alerta_admin` | `0 */6 * * *` (cada 6 h), genera alerta interna (no llega al bot) |

---

## 11. Plantillas de mensajes

| Plantilla | v2.0 | v3.1 |
|---|---|---|
| `solicitud_recarga_inicio_mes` | Documentada (largo, con lista de obligaciones del mes) | Eliminada |
| `solicitud_recarga` (genérico) | Documentada con placeholders | Documentada como texto normalizado, copia directa |
| `recarga_confirmada` | Documentada | Eliminada (no llega al bot) |
| `obligacion_cumplida` | — | Nueva. El bot construye desde `etiqueta` y `monto` |
| `obligaciones_pagadas_grupal` | — | Nueva. El bot itera `payload.obligaciones[]` |

Llave de recarga visible en mensajes: `0090944088` (igual en ambas versiones).

---

## 12. Estados del sistema (resumen)

### Facturas

- v2.0: `extraida → validada → pagada` con ramas `en_revision` y `rechazada` sobre el mismo campo `estado`.
- v3.1: dos campos separados (`estado`, `validacion_estado`) con las combinaciones listadas en la sección 4.

### Notificaciones

- v2.0: `pendiente → enviada → leida` / `cancelada` / `fallida`.
- v3.1: añade el estado **`entregada`** (usado exclusivamente por `pendientes-hoy`).

### Recargas, Solicitudes de recarga, Obligaciones, Pagos

Sin cambios entre v2.0 y v3.1.

---

## 13. Cambios v3.1 declarados explícitamente en el MD

Bloque `## 📋 Cambios en v3.1` del documento nuevo:

- Normalización completa de mensajes (sin placeholders).
- Especificación detallada de payloads para cada tipo de notificación.
- Agrupamiento de pagos verificado con test unitario.
- Monto ahora visible en notificaciones de recarga (columna admin pasó de `—` a `$ 80.000`).
- Nueva columna **"Facturas"** en la tabla admin (`—` / `1 factura` / `N facturas`).

---

## 14. Tabla resumen de impacto para el bot

| Área | ¿Cambio rompe compatibilidad? | Acción requerida del bot |
|---|---|---|
| `users/upsert` con campos de identificación | No (campos opcionales) | Opcional: enviar `tipo_identificacion`, `numero_identificacion`, `ciudad`, `direccion` |
| Estados de factura | **Sí** | Leer `validacion_estado` además de `estado`; ya no usar `"extraida"` ni `"en_revision"` |
| Crear pago (EP13) | **Sí** | Validar `validacion_estado === "validada"` antes de llamar |
| Notificaciones — tipos | **Sí** | Manejar solo 3 tipos: `solicitud_recarga`, `obligacion_cumplida`, `obligaciones_pagadas_grupal` |
| `solicitud_recarga.payload.mensaje` | No (mejora) | Enviar tal cual, sin reemplazar placeholders |
| Agrupamiento de pagos | **Sí** | Soportar el tipo `obligaciones_pagadas_grupal` con `payload.obligaciones[]` |
| `pendientes-hoy` (EP12a) | **Sí** | Filtra `solicitud_recarga` y marca como `entregada` |
| `recargas/reportar` con nombre/apellido | No (campos opcionales) | Opcional cuando el usuario aún no tiene nombre real |
| Cron de evaluación | No afecta al bot directamente | Esperar notificaciones cada 30 min, no solo a las 9 AM |
