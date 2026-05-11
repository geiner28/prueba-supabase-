https://prueba-supabase.onrender.com/api
Version: 2.1 - 16 de marzo de 2026
Clasificacion: Documento Tecnico Confidencial
DeOne
BACKEND API

Documentacion de Endpoints para Bot

Integracion WhatsApp

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 1
Tabla de Contenido

Autenticacion y Formato de Respuesta
Gestion de Usuarios Endpoints 1-2
Obligaciones (Compromisos Mensuales) Endpoints 3-5
Facturas Endpoints 6-7
Recargas (Depositos de Dinero) Endpoint 8
Saldo Disponible Endpoint 9
Notificaciones Endpoints 10-12a
Pagos Endpoint 13
Solicitudes de Recarga Automaticas Endpoints 14-17
Flujo Completo del Sistema
Sistema Automatico (Cron Jobs)
Plantillas de Mensajes
Estados del Sistema
1
2
3
4
5
6
7
8
9

13
12
11
10

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 2
Ambas claves (x-bot-api-key y x-admin-api-key) utilizan el mismo valor y funcionan para todos los endpoints.

JSON
{
"ok": false,
"data": null,
"error": {
"code": "UNAUTHORIZED",
"message": "API Key invalida o ausente"
}
}

JSON
Autenticacion
Todos los endpoints requieren autenticacion mediante API Key enviada en los headers HTTP.
Header Valor
x-bot-api-key TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
x-admin-api-key (alternativo) TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3

Si no se envia el header o el valor es incorrecto:

Formato de Respuesta Estandar
Todas las respuestas siguen exactamente este formato:

ok = true si exitosa. data contiene los datos. error es null si ok=true, o un objeto {code, message, details} si ok=false.
Codigos de Error
HTTP error.code Significado
400 VALIDATION_ERROR Datos no cumplen formato
400 BAD_REQUEST Error logico (monto 0, sin facturas)
401 UNAUTHORIZED API Key invalida o ausente
404 NOT_FOUND Recurso no encontrado
409 CONFLICT_DUPLICATE Recurso duplicado
409 INSUFFICIENT_FUNDS Saldo insuficiente
409 INVALID_STATE_TRANSITION Estado incorrecto
500 INTERNAL_ERROR Error interno del servidor
1. Autenticacion y Formato de Respuesta

{
"ok": true,
"data": { ... },
"error": null
}

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 3
HTTP

JSON

creado: true = usuario nuevo, false = actualizado. Guardar usuario_id para referencias internas.
}
"ok": true,
"data": {
"usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
"creado": true
},
"error": null
{
Endpoint 1: POST /api/users/upsert
Registra un usuario nuevo o actualiza uno existente usando su telefono como clave unica. Idempotente.
Cuando usarlo:
- Al inicio de cada conversacion con un usuario desconocido
- Cuando el usuario quiere actualizar sus datos
Parametros del Body (JSON):
Campo Tipo Req Descripcion
telefono string Si Telefono del usuario (min 7 chars). Clave unica
nombre string No Nombre del usuario
apellido string No Apellido del usuario
correo string No Email valido del usuario
Ejemplo de Request:

Respuesta Exitosa (201 si nuevo, 200 si existente):

Endpoint 2: PUT /api/users/plan
Asigna o cambia el plan de pago del usuario. Debe llamarse ANTES de generar solicitudes de recarga (endpoint 14).
Planes Disponibles:
Plan Recargas/Mes Distribucion
control 1 Dia 1: pago total
tranquilidad 2 Dia 1 y 15: divide por vencimiento
respaldo 2 Dia 1 y 15: divide por vencimiento
2. Gestion de Usuarios

POST /api/users/upsert
Content-Type: application/json
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"nombre": "Laura",
"apellido": "Duran",
"correo": "laura@email.com"
}

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 4
JSON
PUT /api/users/plan
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"plan": "tranquilidad"
}

JSON
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
Request:

Respuesta Exitosa (200):

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 5
JSON
POST /api/obligaciones
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"descripcion": "Pagos de Marzo 2026",
"periodo": "2026-03-01"
}
Endpoint 3: POST /api/obligaciones
Crea una obligacion mensual: un contenedor que agrupa todas las facturas que el usuario debe pagar en un periodo (mes).
Parametros del Body:
Campo Tipo Req Descripcion
telefono string Si Telefono del usuario
descripcion string Si Ej: "Pagos de Marzo 2026"
periodo string Si Fecha YYYY-MM-DD (se normaliza al dia 1)
Request:

Respuesta Exitosa (201):

{

}
"ok": true,
"data": {
"id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
"usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
"descripcion": "Pagos de Marzo 2026",
"periodo": "2026-03-01",
"estado": "activa",
"total_facturas": 0,
"facturas_pagadas": 0,
"monto_total": 0,
"monto_pagado": 0,
"creado_en": "2026-03-08T10:30:00.000Z"
},
"error": null

Guardar el campo "id" de la respuesta. Se necesita para asociar facturas (endpoint 6) y generar solicitudes de recarga (endpoint
14).
Endpoint 4: GET /api/obligaciones?telefono=XXX
Devuelve TODAS las obligaciones del usuario con su array de facturas, montos y porcentaje de progreso.
Query Params:
Param Tipo Req Descripcion
telefono string Si Telefono del usuario
estado string No "activa", "en_progreso", "completada", "cancelada"
3. Obligaciones (Compromisos Mensuales)

JSON

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 6
JSON
{
"ok": true,
"data": [
{
"id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",
"descripcion": "Pagos de Marzo 2026",
"periodo": "2026-03-01",
"estado": "activa",
"total_facturas": 3,
"facturas_pagadas": 1,
"monto_total": 250000,
"monto_pagado": 85000,
"progreso": 33,
"facturas": [
{
"id": "18e6dcfd-...",
"servicio": "Internet ETB",
"monto": 85000,
"estado": "pagada",
"referencia_pago": "ETB-2026-001",
"etiqueta": "internet",
"fecha_vencimiento": "2026-03-10"
}
]
}
],
"error": null
}
Respuesta Exitosa (200):

Endpoint 5: GET /api/obligaciones/:id
Detalle completo de UNA obligacion especifica con todas sus facturas y datos del usuario (nombre, telefono).
Respuesta: Misma estructura que endpoint 4 pero un solo objeto en vez de array. Incluye el campo "usuarios" con nombre, apellido

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 7

ll

Si monto es null o extraccion_estado es "dudosa"/"fallida", la factura queda en estado "en_revision" para validacion manual del
admin.

JSON
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
Endpoint 6: POST /api/facturas/captura
Registra una factura dentro de una obligacion. El bot extrae los datos (foto, PDF, texto) y los envia aqui.

Parametros del Body:
Campo Tipo Req Puede ser nu Descripcion
telefono string Si No Telefono del usuario
obligacion_id UUID Si No ID de la obligacion
servicio string Si No Nombre del servicio
monto number No Si Valor en pesos. null = revision
fecha_vencimiento string No Si Fecha limite YYYY-MM-DD
fecha_emision string No Si Fecha emision YYYY-MM-DD
referencia_pago string No Si Referencia de factura
etiqueta string No Si "internet", "gas", etc.
periodo string No Si Periodo YYYY-MM-DD
origen string No Si "bot_whatsapp", "manual", "ocr"
archivo_url string No Si URL de imagen/PDF
extraccion_estado string No No "ok", "dudosa", "fallida"
extraccion_confianza number No Si Confianza 0.0 a 1.0
Ejemplo - Factura completa:

Ejemplo - Extraccion incompleta:
4. Facturas

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 8
JSON
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
Respuesta Exitosa (201):

Estados posibles de una factura:
Estado Significado
extraida Capturada correctamente. Pendiente de validacion admin
en_revision Extraccion dudosa. Admin debe verificar
validada Admin confirmo los datos. Lista para pagar
pagada Ya se realizo el pago
rechazada Admin rechazo esta factura
Endpoint 7: GET /api/facturas/obligacion/:obligacionId
Lista todas las facturas de una obligacion con todos los campos.
Respuesta Exitosa (200):
JSON
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

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 9
{

}
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
"extraccion_confianza": 0.95,
"observaciones_admin": "Factura verificada",
"motivo_rechazo": null,
"_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"
}
],
"error": null

El campo _id (UUID interno) es el que se debe usar en el endpoint de pagos (13) como factura_id.
JSON

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 10
Si se envia referencia_tx y ya existe una recarga con esa referencia, NO se duplica, devuelve la existente. La recarga NO esta
disponible inmediatamente, debe ser aprobada por un admin.

JSON

JSON
{
"ok": true,
"data": {
"recarga_id": "974bad6d-a234-4b56-c789-d012ef345678",
"estado": "en_validacion"
},
"error": null
}

JSON
{
"ok": true,
"data": {
"recarga_id": "974bad6d-a234-4b56-c789-d012ef345678",
"estado": "en_validacion",
"mensaje": "Recarga ya reportada con esta referencia de transaccion"
},
"error": null
}
Endpoint 8: POST /api/recargas/reportar
Registra que el usuario deposito dinero (Nequi, PSE, etc.). Queda en "en_validacion" hasta que un admin la apruebe.

Parametros del Body:
Campo Tipo Req Descripcion
telefono string Si Telefono del usuario
periodo string Si Periodo YYYY-MM-DD
monto number Si Monto recargado (positivo)
comprobante_url string Si URL imagen del comprobante
referencia_tx string No Referencia bancaria. Previene duplicados
Request:

Respuesta Exitosa (201):

Si ya existia esa referencia_tx (200 - idempotente):
5. Recargas (Depositos de Dinero)

POST /api/recargas/reportar
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"periodo": "2026-03-01",
"monto": 130000,
"comprobante_url": "https://storage.supabase.co/comprobantes/nequi_001.jpg",
"referencia_tx": "NEQUI-2026030812345"
}

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 11
GET /api/disponible?telefono=573046757626&periodo=2026-03-01

JSON
{
"ok": true,
"data": {
"usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",
"periodo": "2026-03-01",
"total_recargas_aprobadas": 250000,
"total_pagos_pagados": 130000,
"disponible": 120000
},
"error": null
}
Endpoint 9: GET /api/disponible
Calcula en tiempo real cuanto dinero tiene disponible el usuario.
Formula: disponible = total_recargas_aprobadas - total_pagos_realizados
Query Params:
Param Tipo Req Descripcion
telefono string Si Telefono del usuario
periodo string Si Periodo YYYY-MM-DD
Ejemplo:

Respuesta Exitosa (200):
6. Saldo Disponible

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 12
[NUEVO] Comportamiento atomico: Al consultar, automaticamente cambia el estado a "enviada". Ya NO es necesario llamar los
endpoints 11 o 12 despues. Excluye notificaciones de tipo alerta_admin.

GET /api/notificaciones/pendientes/573046757626

JSON
{
"ok": true,
"data": [
{
"id": "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
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
"mensaje": "Hola, tu primera cuota es de $215,000..."
},
"ultimo_error": null,
"creado_en": "2026-03-09T16:04:24.222Z"
}
],
"error": null
}
Endpoint 10: GET /api/notificaciones/pendientes/:telefono
Devuelve notificaciones pendientes de enviar al usuario por WhatsApp. Cada notificacion tiene un payload.mensaje con el texto listo para
enviar.

Ejemplo:

Respuesta Exitosa (200):

Todos los tipos de notificacion:
Tipo Se genera cuando...
solicitud_recarga Se generan solicitudes de recarga automaticas
solicitud_recarga_inicio_mes Cron job detecta inicio de mes con obligaciones activas
recarga_confirmada Admin aprueba una recarga del usuario
recordatorio_recarga Cuotas proximas a vencer sin saldo
recarga_aprobada Admin aprueba una recarga
recarga_rechazada Admin rechaza una recarga
factura_validada Admin valida una factura
factura_rechazada Admin rechaza una factura
pago_confirmado Se confirma un pago exitoso
obligacion_completada Todas las facturas fueron pagadas
7. Notificaciones

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 13
1. GET /api/notificaciones/pendientes/573046757626
-> Las notificaciones se marcan como "enviada" AUTOMATICAMENTE
2. Por cada notificacion:
a. Leer payload.mensaje (texto listo para enviar)
b. Enviar por WhatsApp al usuario
3. NO necesita llamar batch-enviadas - ya estan marcadas

JSON
PUT /api/notificaciones/7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"estado": "enviada"
}

JSON
{
"estado": "fallida",
"ultimo_error": "WhatsApp API timeout despues de 30 segundos"
}

JSON
POST /api/notificaciones/batch-enviadas
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"ids": [
"7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",
"a1b2c3d4-5678-90ab-cdef-1234567890ab"
]
}
Tipo Se genera cuando...
nueva_obligacion Se crea obligacion del siguiente mes
alerta_admin Usuario sin respuesta 24h (solo admin)
Flujo recomendado para el bot:

Endpoint 11: PUT /api/notificaciones/:id
Actualiza el estado de UNA notificacion. Permite marcar como "enviada", "fallida" o "leida".
Ejemplo - Enviada con exito:

Ejemplo - Error al enviar:

Endpoint 12: POST /api/notificaciones/batch-enviadas
Marca multiples notificaciones como "enviada" en una sola llamada.
Request:

Respuesta Exitosa (200):

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 14
GET /api/notificaciones/pendientes-hoy
Headers:
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
(o x-admin-api-key trabajar tambien)

JSON
Endpoint 12a: GET /api/notificaciones/pendientes-hoy
Endpoint estrategico para bot de distribucion. Devuelve TODAS las notificaciones de inicio de mes (solicitud_recarga_inicio_mes) creadas
hoy en estado pendiente, para TODOS los usuarios. Marca automaticamente todas como "enviada" en la misma consulta. Disenado para
consultar una sola vez al dia por un job automatico.
Cuando usarlo:
- Una sola vez por dia (tipicamente a las 9:00 AM)
- Para que un bot global o job automatico distribuya notificaciones de inicio mes
- Para el cron job que ejecuta jobEvaluacionRecargas
- Consulta diaria unica para evitar duplicados
Request:

Respuesta Exitosa (200) - Con notificaciones:
JSON
{
"ok": true,
"data": {
"actualizadas": 2
},
"error": null
}

{
"ok": true,
"data": {
"total": 2,
"notificaciones": [
{
"id": "e4c9a1f2-...",
"usuario_id": "user-001",
"tipo": "solicitud_recarga_inicio_mes",
"estado": "pendiente",
"usuarios": {
"nombre": "Laura",
"apellido": "Duran",
"telefono": "573046757626"
},
"payload": {
"tipo_mensaje": "inicio_mes",
"nombre_usuario": "Laura Duran",
"mes_actual": "Marzo 2026",
"mes_anterior": "Febrero 2026",
"obligaciones": [
{"etiqueta": "energia", "monto": 85000},
{"etiqueta": "gas", "monto": 50950}
],
"total_obligaciones": 135950,
"saldo_actual": 0,
"valor_a_recargar": 135950,
"es_primera_recarga": true,
"obligacion_id": "obl-123",
"periodo": "2026-03-01",
"mensaje": "Hola Laura Duran xX\nArrancamos mes!\n\nEn Febrero pagaste $ 0 y tienes un saldo de $...

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 15
JSON
{
"ok": true,
"data": {
"total": 0,
"notificaciones": []
},
"error": null
}
Respuesta cuando NO hay notificaciones (200):

Errores posibles:
Codigo Mensaje
UNAUTHORIZED API Key invalida o ausente
500 Error interno del servidor (si algo falla)
Garantias de comportamiento:
- Filtra SOLO "solicitud_recarga_inicio_mes"
- Solo notificaciones del dia actual en "pendiente"
- Marca TODAS como "enviada" automaticamente
- Idempotente: 2da consulta mismo dia devuelve [] (vacio)
- Si job falla, notificaciones permanecen "pendiente"
- Tiempo ~100-200ms para 2-50 usuarios/dia

},
"creado_en": "2026-03-16T09:00:15.000Z"
},
{
"id": "f5d1b2e3-...",
"usuario_id": "user-002",
"tipo": "solicitud_recarga_inicio_mes",
"estado": "pendiente",
"usuarios": {
"nombre": "Carlos",
"apellido": "Perez",
"telefono": "3001112233"
},
"payload": {"tipo_mensaje": "inicio_mes", "nombre_usuario": "Carlos Perez", ...}
}
]
},
"error": null
}

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 16
JSON
POST /api/pagos/crear
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"
}

JSON
Endpoint 13: POST /api/pagos/crear
Crea un pago para una factura especifica. Verifica que:
1. La factura exista y este en estado "validada"
2. El usuario tenga saldo disponible suficiente
Si ambas se cumplen, crea el pago en estado "en_proceso". El monto se descuenta del saldo.
Parametros del Body:
Campo Tipo Req Descripcion
telefono string Si Telefono del usuario
factura_id UUID Si UUID de la factura (campo _id del endpoint 7)
Request:

Respuesta Exitosa (201):

Errores posibles:
Codigo Mensaje
NOT_FOUND Factura no encontrada
INVALID_STATE_TRANSITION No se puede crear pago para factura en estado "extraida". Debe estar "validada".
INSUFFICIENT_FUNDS Fondos insuficientes. Disponible: $0, Requerido: $120,000
8. Pagos

{
"ok": true,
"data": {
"pago_id": "0da485dd-f234-5678-9abc-def012345678",
"estado": "en_proceso",
"monto": 85000,
"servicio": "Internet ETB"
},
"error": null
}

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 17
Plan CONTROL (1 cuota): 1 solicitud por el monto total. Fecha limite = vencimiento mas proximo. Recordatorio = 5 dias antes.
Plan TRANQUILIDAD / RESPALDO (2 cuotas): Divide facturas en 2 grupos por fecha de vencimiento. Cuota 1: vencen dia 1-15.
Cuota 2: vencen dia 16-31. Si todas caen en la misma mitad, divide 50/50.

JSON
POST /api/solicitudes-recarga/generar
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626",
"obligacion_id": "260b7859-a392-45bc-95c9-5a7f627a93f7"
}

JSON
Endpoint 14: POST /api/solicitudes-recarga/generar
Analiza las facturas de una obligacion y genera solicitudes de recarga segun el plan del usuario.
Logica segun plan:

Request:

Respuesta Exitosa (201) - Plan tranquilidad:
9. Solicitudes de Recarga Automaticas

{
"ok": true,
"data": {
"solicitudes": [
{
"id": "09e2ed08-a234-4b56-c789-d012ef345678",
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
"id": "3e30936d-b345-5678-d890-e123fa456789",
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

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 18
JSON
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
Respuesta Exitosa (201) - Plan control:

Campos de la respuesta:
Campo Significado
solicitudes[].id UUID de la solicitud
solicitudes[].numero_cuota 1 = primera cuota, 2 = segunda cuota
solicitudes[].monto_solicitado Cuanto debe recargar para esta cuota
solicitudes[].fecha_limite Fecha maxima para hacer la recarga
solicitudes[].fecha_recordatorio 5 dias antes de fecha_limite
solicitudes[].facturas_ids UUIDs de las facturas que cubre
Endpoint 15: GET /api/solicitudes-recarga
Lista todas las solicitudes de recarga de un usuario. Permite filtrar por estado y obligacion.
Query Params:
Param Tipo Req Descripcion
telefono string Si Telefono del usuario
estado string No "pendiente", "parcial", "cumplida", "vencida", "cancelada"
obligacion_id UUID No Filtrar por obligacion
Respuesta Exitosa (200):

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 19
El cron job diario (9:00 AM) ya ejecuta esta verificacion automaticamente para TODOS los usuarios. Este endpoint es util como
respaldo o para verificar un usuario especifico.

JSON

JSON
Endpoint 16: POST /api/solicitudes-recarga/verificar-recordatorios
Busca solicitudes proximas a vencer, verifica si el usuario tiene saldo, y genera notificacion recordatorio_recarga si no tiene saldo.

Request:

Respuesta - Se generaron recordatorios (200):
JSON
{
"ok": true,
"data": [
{
"id": "09e2ed08-...",
"creado_en": "2026-03-09T16:04:24.011Z",
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
"recordatorio_enviado": true
}
],
"error": null
}

POST /api/solicitudes-recarga/verificar-recordatorios
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"telefono": "573046757626"
}

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

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 20
* Debe enviarse al menos una fecha. Solo se pueden modificar solicitudes en estado "pendiente" o "parcial".

JSON
PUT /api/solicitudes-recarga/09e2ed08-.../fechas
x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3
{
"fecha_cuota_1": "2026-03-05",
"fecha_cuota_2": "2026-03-18"
}

JSON
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
"recordatorio_enviado": false
},
{
"id": "3e30936d-...",
"numero_cuota": 2,
"total_cuotas": 2,
"monto_solicitado": 120000,
"fecha_limite": "2026-03-18",
"fecha_recordatorio": "2026-03-13",
"estado": "pendiente",
"recordatorio_enviado": false
}
],
"error": null
}
Endpoint 17: PUT /api/solicitudes-recarga/:id/fechas
Permite al usuario cambiar las fechas limite de sus cuotas. Recalcula automaticamente fecha_recordatorio (5 dias antes) y resetea
recordatorio_enviado.
Parametros del Body:
Campo Tipo Req Descripcion
fecha_cuota_1 string No* Nueva fecha limite cuota 1 (YYYY-MM-DD)
fecha_cuota_2 string No* Nueva fecha limite cuota 2 (YYYY-MM-DD)

Request:

Respuesta Exitosa (200):

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 21
FASE 1: REGISTRO Y CONFIGURACION Bot <-> Usuario

FASE 2: EVALUACION AUTOMATICA Cron Jobs

FASE 3: RECARGA Y APROBACION Bot <-> Usuario <-> Admin

FASE 4: PAGOS Y SEGUIMIENTO Bot + Admin
1. Usuario llega por WhatsApp -> POST /api/users/upsert
2. Elige plan -> PUT /api/users/plan
3. Crear obligacion del mes -> POST /api/obligaciones
4. Cargar facturas -> POST /api/facturas/captura
5. Generar solicitudes de recarga -> POST /api/solicitudes-recarga/generar

6. Cron Job 9:00 AM - jobEvaluacionRecargas:
Evalua obligaciones activas, calcula montos, verifica saldo
Genera notificaciones: solicitud_recarga_inicio_mes o solicitud_recarga
7. Cron Job cada 6h - jobVerificarInactividad:
Busca notificaciones sin respuesta (24-48h)
Si no hay recarga -> crea alerta_admin

8. Bot entrega notificaciones -> GET /api/notificaciones/pendientes/:tel
(marcado automatico como "enviada")
9. Usuario recarga dinero -> POST /api/recargas/reportar
10. Admin valida -> PUT /api/recargas/:id/aprobar
Auto-limpieza: cancela cobros, actualiza solicitudes, notifica

11. Verificar saldo -> GET /api/disponible
12. Crear pagos -> POST /api/pagos/crear
13. Consultar estado -> GET /api/obligaciones, facturas, solicitudes
14. Personalizar fechas -> PUT /api/solicitudes-recarga/:id/fechas
10. Flujo Completo del Sistema

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 22
Secuencia de ejecucion:
1. obtenerObligacionesActivas() -> Lista de obligaciones activas
2. FOR cada obligacion:
a. evaluarObligacion() -> Calcula monto pendiente
b. detectarPrimeraRecargaDelMes() -> Tipo de mensaje
c. existeNotificacionHoy() -> Evita duplicados diarios
d. prepararDatosNotificacion() -> Construye payload
e. crearNotificacionRecarga() -> Inserta notificacion
3. Retorna resumen: procesadas, creadas, errores

Logica de deteccion:
1. Rango: notificaciones enviadas 24-48h atras
2. Tipos: solicitud_recarga | solicitud_recarga_inicio_mes
3. Estado: enviada
4. Verifica: Ya existe alerta para esta notificacion? -> omitir si si
5. Verifica: Hay recargas despues del mensaje?
-> Si NO -> crearAlertaAdmin() con usuario_id: null
El servidor ejecuta cron jobs automaticamente que evaluan obligaciones, recalculan solicitudes y generan notificaciones.
Job 1: jobEvaluacionRecargas - 9:00 AM diario
Archivo: src/jobs/recordatorios.job.js
Programacion: cron.schedule("0 9 * * *", ...)

Job 2: jobVerificarInactividad - Cada 6 horas
Archivo: src/modules/notificaciones/notificaciones.service.js
Programacion: cron.schedule("0 */6 * * *", ...)

Protecciones del sistema:
- No genera notificaciones duplicadas el mismo dia
- Control de concurrencia (un solo job a la vez)
- Si node-cron no esta instalado, el servidor arranca sin jobs
- Los montos se recalculan automaticamente al cambiar facturas
- Job de inactividad verifica que no exista alerta previa
- Solo detecta inactividad entre 24-48h
11. Sistema Automatico de Evaluacion (Cron Jobs)

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 23
WhatsApp
Hola Carlos
Arrancamos mes!
En Febrero 2026 pagaste "$ 162,000" y tienes un saldo de "$ 70,000"
Para Marzo 2026, tus obligaciones suman "$ 250,000", asi:
"@EPM Energia": "$ 120,000".
"@Internet ETB": "$ 85,000".
"@Gas Vanti": "$ 45,000".
La recarga total sugerida para Marzo 2026 es de "$ 180,000".
Puedes hacer la recarga a la llave 0090944088.
Apenas la hagas, me envias el comprobante y yo me encargo del resto deOne!

WhatsApp
Hola Carlos!
Ya estamos listos para recibir tu recarga, con la que cubriremos:
"@EPM Energia": "$ 120,000".
"@Internet ETB": "$ 85,000".
"@Gas Vanti": "$ 45,000".
Total: "$ 250,000"
Aplicamos tu saldo: "$ 50,000"
Total a recargar: "$ 200,000".
Puedes hacer la recarga a la llave 0090944088.
Apenas la hagas, me envias el comprobante y yo me encargo del resto deOne!

WhatsApp
Recibido, Carlos
Ya registre tu recarga. Tu saldo disponible en deOne es de $ 130,000
Las notificaciones incluyen mensajes formateados listos para WhatsApp. El bot debe leer payload.mensaje y enviarlo tal cual.
Tipo: solicitud_recarga_inicio_mes
Se genera al inicio de cada mes cuando el usuario tiene obligaciones activas.

Tipo: solicitud_recarga (generico)

Tipo: recarga_confirmada

Campos del payload en notificaciones automaticas:
Campo Descripcion
mensaje Texto completo listo para WhatsApp
tipo_mensaje "inicio_mes" | "generico" | "confirmada"
nombre_usuario Nombre del usuario
12. Plantillas de Mensajes Automaticos

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 24
Llave de recarga: 0090944088 - Esta llave aparece en los mensajes automaticos.
Campo Descripcion
mes_actual Nombre del mes (ej: "Marzo 2026")
obligaciones Array de { etiqueta, monto }
total_obligaciones Suma total de facturas
saldo_actual Saldo actual del usuario
valor_a_recargar total_obligaciones - saldo_actual
es_primera_recarga true si es primera del mes
obligacion_id ID de la obligacion
periodo Periodo (ej: "2026-03-01")

DeOne Backend — API Endpoints Bot Documento Confidencial

16 de marzo de 2026 Pagina 25
en_validacion -> aprobada | rechazada

pendiente -> enviada -> leida
-> cancelada (auto-limpieza)
-> fallida

pendiente -> parcial -> cumplida
-> vencida
-> cancelada

extraida -> validada -> pagada
| |
en_revision rechazada

activa -> en_progreso -> completada
-> cancelada

en_proceso -> pagado | fallido