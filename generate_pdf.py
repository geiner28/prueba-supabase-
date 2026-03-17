#!/usr/bin/env python3
"""
DeOne Backend API — Generador de PDF profesional
Solo endpoints del Bot (18 endpoints + cron jobs)
Usa fuentes TTF (Arial + Courier New) para soporte Unicode completo.
"""
from fpdf import FPDF
import os, re

# ── Colores ──
PRIMARY   = (22, 78, 99)
SECONDARY = (41, 128, 185)
ACCENT    = (39, 174, 96)
DARK      = (44, 62, 80)
WHITE     = (255, 255, 255)
TEXT_CLR  = (55, 65, 81)
MUTED     = (107, 114, 128)
CODE_BG   = (244, 244, 248)
CODE_BD   = (200, 205, 215)
TBL_HEAD  = (22, 78, 99)
TBL_ALT   = (248, 250, 252)
BORDER    = (200, 210, 220)
INFO_BG   = (232, 243, 255)
INFO_BD   = (41, 128, 185)
WARN_BG   = (255, 250, 230)
WARN_BD   = (220, 170, 20)
OK_BG     = (232, 255, 243)
OK_BD     = (39, 174, 96)

def ce(t):
    """Remove emojis."""
    for e in ['🤖','🔐','📦','📋','🆕','🔄','💡','⚙️','📨','📅','🔁','🗂️',
              '📊','🧹','🔧','✅','❌','⚡','✌🏼','👋🏼','🙌🏼','🎯','💳','📱']:
        t = t.replace(e, '')
    return re.sub(r'[\U00010000-\U0010ffff]', '', t).strip()


class PDF(FPDF):
    def __init__(self):
        super().__init__('P', 'mm', 'A4')
        self.set_auto_page_break(auto=True, margin=22)

    def header(self):
        if self.page_no() <= 1:
            return
        self.set_draw_color(*PRIMARY)
        self.set_line_width(0.6)
        self.line(15, 10, 195, 10)
        self.set_font('helvetica', 'I', 7)
        self.set_text_color(*MUTED)
        self.set_xy(15, 11)
        self.cell(90, 5, 'DeOne Backend - API Endpoints Bot')
        self.set_xy(105, 11)
        self.cell(90, 5, 'Documento Confidencial', align='R')
        self.ln(8)

    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-18)
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(2)
        self.set_font('helvetica', '', 7)
        self.set_text_color(*MUTED)
        self.cell(90, 4, '16 de marzo de 2026')
        self.cell(90, 4, f'Pagina {self.page_no() - 1}', align='R')


# ── Helpers ──

def section(pdf, title):
    """Section header - always starts new page."""
    pdf.add_page()
    pdf.set_fill_color(*PRIMARY)
    pdf.rect(15, pdf.get_y(), 180, 11, 'F')
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(*WHITE)
    pdf.set_x(19)
    pdf.cell(172, 11, ce(title))
    pdf.ln(15)

def sub(pdf, title):
    """Subsection header."""
    y = pdf.get_y()
    if y > 250:
        pdf.add_page()
    pdf.set_draw_color(*SECONDARY)
    pdf.set_line_width(0.6)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(2)
    pdf.set_font('helvetica', 'B', 10.5)
    pdf.set_text_color(*SECONDARY)
    pdf.cell(0, 7, ce(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

def sub3(pdf, title):
    """Level 3 header."""
    if pdf.get_y() > 260:
        pdf.add_page()
    pdf.set_font('helvetica', 'B', 9)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 5, ce(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

def para(pdf, text):
    """Paragraph."""
    if pdf.get_y() > 265:
        pdf.add_page()
    pdf.set_font('helvetica', '', 8.5)
    pdf.set_text_color(*TEXT_CLR)
    pdf.multi_cell(0, 4.5, ce(text))
    pdf.ln(2)

def note(pdf, text, kind='info'):
    """Note box."""
    if pdf.get_y() > 255:
        pdf.add_page()
    bd_map = {'info': INFO_BD, 'warn': WARN_BD, 'ok': OK_BD}
    bg_map = {'info': INFO_BG, 'warn': WARN_BG, 'ok': OK_BG}
    bd = bd_map.get(kind, INFO_BD)
    bg = bg_map.get(kind, INFO_BG)
    pdf.set_font('helvetica', '', 8)
    t = ce(text)
    # Measure height
    w = 168
    lines = pdf.multi_cell(w, 4.2, t, dry_run=True, output="LINES")
    h = len(lines) * 4.2 + 5
    y0 = pdf.get_y()
    if y0 + h > 272:
        pdf.add_page()
        y0 = pdf.get_y()
    pdf.set_fill_color(*bg)
    pdf.rect(15, y0, 180, h, 'F')
    pdf.set_fill_color(*bd)
    pdf.rect(15, y0, 2.5, h, 'F')
    pdf.set_xy(21, y0 + 2.5)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(w, 4.2, t)
    pdf.set_y(y0 + h + 2)


def codeblock(pdf, text, lang=''):
    """Render a code block. Uses text() for reliable rendering."""
    t = ce(text)
    raw_lines = t.split('\n')
    LH = 3.8   # line height
    PAD = 3     # padding top/bottom

    # Check if we need a new page before starting
    needed = min(len(raw_lines) * LH + PAD * 2 + 6, 80)
    if pdf.get_y() + needed > 272:
        pdf.add_page()

    y_start = pdf.get_y()

    # Language badge
    if lang:
        pdf.set_fill_color(*DARK)
        pdf.set_font('helvetica', 'B', 6)
        pdf.set_text_color(*WHITE)
        bw = pdf.get_string_width(lang) + 6
        pdf.set_xy(15, y_start)
        pdf.cell(bw, 4, f' {lang} ', fill=True)
        y_start += 4

    # Render in page-chunks
    pdf.set_font('courier', '', 7)
    remaining = list(raw_lines)
    block_start_y = y_start

    while remaining:
        avail_h = 270 - block_start_y - PAD
        max_lines_fit = max(int(avail_h / LH), 1)
        chunk = remaining[:max_lines_fit]
        remaining = remaining[max_lines_fit:]

        block_h = len(chunk) * LH + PAD * 2

        # Draw background FIRST
        pdf.set_fill_color(*CODE_BG)
        pdf.set_draw_color(*CODE_BD)
        pdf.set_line_width(0.3)
        pdf.rect(15, block_start_y, 180, block_h, 'DF')

        # Draw text ON TOP using pdf.text() which is the most reliable method
        pdf.set_font('courier', '', 7)
        pdf.set_text_color(45, 45, 45)
        cy = block_start_y + PAD
        for line in chunk:
            # Truncate if too wide
            display = line
            if len(display) > 110:
                display = display[:107] + '...'
            pdf.text(18, cy + 2.8, display)  # text() places at baseline
            cy += LH

        if remaining:
            pdf.add_page()
            block_start_y = pdf.get_y()
        else:
            pdf.set_y(cy + PAD + 1)


def table(pdf, headers, rows, widths=None):
    """Render a table."""
    if pdf.get_y() > 248:
        pdf.add_page()
    nc = len(headers)
    if not widths:
        widths = [180 / nc] * nc
    rh = 6.5
    x0 = 15

    def draw_hdr():
        y = pdf.get_y()
        pdf.set_fill_color(*TBL_HEAD)
        pdf.set_font('helvetica', 'B', 7)
        pdf.set_text_color(*WHITE)
        for i, h in enumerate(headers):
            pdf.set_xy(x0 + sum(widths[:i]), y)
            pdf.cell(widths[i], rh, f' {ce(h)}', fill=True, border=1)
        pdf.set_y(y + rh)

    draw_hdr()

    for ri, row in enumerate(rows):
        if pdf.get_y() > 264:
            pdf.add_page()
            draw_hdr()

        bg = TBL_ALT if ri % 2 == 0 else WHITE
        pdf.set_font('helvetica', '', 7)

        # Calculate row height
        cell_texts = [ce(str(c)) for c in row]
        max_lines = 1
        for i, ct in enumerate(cell_texts):
            nlines = len(pdf.multi_cell(widths[i] - 2, 4, ct, dry_run=True, output="LINES"))
            max_lines = max(max_lines, nlines)
        row_h = max(max_lines * 4 + 1, rh)

        yr = pdf.get_y()
        for i, ct in enumerate(cell_texts):
            xc = x0 + sum(widths[:i])
            pdf.set_fill_color(*bg)
            pdf.set_draw_color(*BORDER)
            pdf.rect(xc, yr, widths[i], row_h, 'DF')
            pdf.set_xy(xc + 1, yr + 0.5)
            pdf.set_text_color(*TEXT_CLR)
            pdf.multi_cell(widths[i] - 2, 4, ct)
        pdf.set_y(yr + row_h)
    pdf.ln(2)


# ══════════════════════════════════════════════════════════════
# DOCUMENTO
# ══════════════════════════════════════════════════════════════

def build():
    pdf = PDF()

    # ══════ PORTADA ══════
    pdf.add_page()
    pdf.set_fill_color(*PRIMARY)
    pdf.rect(0, 0, 210, 120, 'F')
    pdf.set_fill_color(18, 65, 83)
    pdf.rect(0, 0, 210, 3, 'F')

    pdf.set_y(38)
    pdf.set_font('helvetica', 'B', 38)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 14, 'DeOne', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.set_font('helvetica', '', 13)
    pdf.set_text_color(180, 220, 240)
    pdf.cell(0, 7, 'BACKEND API', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(1.5)
    pdf.line(75, 68, 135, 68)
    pdf.set_y(74)
    pdf.set_font('helvetica', '', 14)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 9, 'Documentacion de Endpoints para Bot', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.set_font('helvetica', '', 10)
    pdf.set_text_color(180, 220, 240)
    pdf.cell(0, 7, 'Integracion WhatsApp', align='C', new_x="LMARGIN", new_y="NEXT")

    # Cards
    pdf.set_y(138)
    cards = [('18', 'Endpoints\nBot', SECONDARY), ('2', 'Cron Jobs\nAutomaticos', ACCENT), ('4', 'Modulos\nPrincipales', PRIMARY)]
    for i, (n, l, clr) in enumerate(cards):
        x = 25 + i * 60
        pdf.set_fill_color(*WHITE)
        pdf.rect(x, 138, 50, 33, 'F')
        pdf.set_fill_color(*clr)
        pdf.rect(x, 138, 50, 3, 'F')
        pdf.set_font('helvetica', 'B', 24)
        pdf.set_text_color(*clr)
        pdf.set_xy(x, 143)
        pdf.cell(50, 10, n, align='C')
        pdf.set_font('helvetica', '', 7.5)
        pdf.set_text_color(*MUTED)
        pdf.set_xy(x, 155)
        pdf.multi_cell(50, 3.5, l, align='C')

    pdf.set_y(190)
    for lab, val in [('Base URL:', 'https://prueba-supabase.onrender.com/api'),
                     ('Version:', '2.0 - 12 de marzo de 2026'),
                     ('Clasificacion:', 'Documento Tecnico Confidencial')]:
        pdf.set_x(35)
        pdf.set_font('helvetica', 'B', 8.5)
        pdf.set_text_color(*TEXT_CLR)
        pdf.cell(30, 6, lab)
        pdf.set_font('helvetica', '', 8.5)
        pdf.cell(120, 6, val, new_x="LMARGIN", new_y="NEXT")

    # ══════ TOC ══════
    pdf.add_page()
    pdf.set_font('helvetica', 'B', 18)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 10, 'Tabla de Contenido', new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(1)
    pdf.line(15, pdf.get_y() + 1, 75, pdf.get_y() + 1)
    pdf.ln(8)
    toc_items = [
        ('1', 'Autenticacion y Formato de Respuesta'),
        ('2', 'Gestion de Usuarios', 'Endpoints 1-2'),
        ('3', 'Obligaciones (Compromisos Mensuales)', 'Endpoints 3-5'),
        ('4', 'Facturas', 'Endpoints 6-7'),
        ('5', 'Recargas (Depositos de Dinero)', 'Endpoint 8'),
        ('6', 'Saldo Disponible', 'Endpoint 9'),
        ('7', 'Notificaciones', 'Endpoints 10-12a'),
        ('8', 'Pagos', 'Endpoint 13'),
        ('9', 'Solicitudes de Recarga Automaticas', 'Endpoints 14-17'),
        ('10', 'Flujo Completo del Sistema'),
        ('11', 'Sistema Automatico (Cron Jobs)'),
        ('12', 'Plantillas de Mensajes'),
        ('13', 'Estados del Sistema'),
    ]
    for item in toc_items:
        n, t = item[0], item[1]
        d = item[2] if len(item) > 2 else ''
        pdf.set_fill_color(*PRIMARY)
        pdf.set_font('helvetica', 'B', 8)
        pdf.set_text_color(*WHITE)
        bw = 8 if len(n) < 2 else 10
        pdf.set_x(15)
        pdf.cell(bw, 6.5, n, fill=True, align='C')
        pdf.set_font('helvetica', 'B', 9.5)
        pdf.set_text_color(*DARK)
        pdf.set_x(28)
        pdf.cell(100, 6.5, t)
        if d:
            pdf.set_font('helvetica', 'I', 7.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(60, 6.5, d, align='R')
        pdf.ln(9)

    # ══════════════════════════════════════════
    # 1. AUTENTICACION
    # ══════════════════════════════════════════
    section(pdf, '1. Autenticacion y Formato de Respuesta')

    sub(pdf, 'Autenticacion')
    para(pdf, 'Todos los endpoints requieren autenticacion mediante API Key enviada en los headers HTTP.')
    table(pdf, ['Header', 'Valor'],
          [['x-bot-api-key', 'TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3'],
           ['x-admin-api-key (alternativo)', 'TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3']],
          [60, 120])
    note(pdf, 'Ambas claves (x-bot-api-key y x-admin-api-key) utilizan el mismo valor y funcionan para todos los endpoints.')

    para(pdf, 'Si no se envia el header o el valor es incorrecto:')
    codeblock(pdf, '{\n  "ok": false,\n  "data": null,\n  "error": {\n    "code": "UNAUTHORIZED",\n    "message": "API Key invalida o ausente"\n  }\n}', 'JSON')

    sub(pdf, 'Formato de Respuesta Estandar')
    para(pdf, 'Todas las respuestas siguen exactamente este formato:')
    codeblock(pdf, '{\n  "ok": true,\n  "data": { ... },\n  "error": null\n}', 'JSON')
    para(pdf, 'ok = true si exitosa. data contiene los datos. error es null si ok=true, o un objeto {code, message, details} si ok=false.')

    sub3(pdf, 'Codigos de Error')
    table(pdf, ['HTTP', 'error.code', 'Significado'],
          [['400', 'VALIDATION_ERROR', 'Datos no cumplen formato'],
           ['400', 'BAD_REQUEST', 'Error logico (monto 0, sin facturas)'],
           ['401', 'UNAUTHORIZED', 'API Key invalida o ausente'],
           ['404', 'NOT_FOUND', 'Recurso no encontrado'],
           ['409', 'CONFLICT_DUPLICATE', 'Recurso duplicado'],
           ['409', 'INSUFFICIENT_FUNDS', 'Saldo insuficiente'],
           ['409', 'INVALID_STATE_TRANSITION', 'Estado incorrecto'],
           ['500', 'INTERNAL_ERROR', 'Error interno del servidor']],
          [18, 48, 114])

    # ══════════════════════════════════════════
    # 2. USUARIOS
    # ══════════════════════════════════════════
    section(pdf, '2. Gestion de Usuarios')

    # EP 1
    sub(pdf, 'Endpoint 1: POST /api/users/upsert')
    para(pdf, 'Registra un usuario nuevo o actualiza uno existente usando su telefono como clave unica. Idempotente.')
    sub3(pdf, 'Cuando usarlo:')
    para(pdf, '- Al inicio de cada conversacion con un usuario desconocido\n- Cuando el usuario quiere actualizar sus datos')
    sub3(pdf, 'Parametros del Body (JSON):')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario (min 7 chars). Clave unica'],
           ['nombre', 'string', 'No', 'Nombre del usuario'],
           ['apellido', 'string', 'No', 'Apellido del usuario'],
           ['correo', 'string', 'No', 'Email valido del usuario']],
          [28, 16, 12, 124])
    sub3(pdf, 'Ejemplo de Request:')
    codeblock(pdf, 'POST /api/users/upsert\nContent-Type: application/json\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "nombre": "Laura",\n  "apellido": "Duran",\n  "correo": "laura@email.com"\n}', 'HTTP')
    sub3(pdf, 'Respuesta Exitosa (201 si nuevo, 200 si existente):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",\n    "creado": true\n  },\n  "error": null\n}', 'JSON')
    note(pdf, 'creado: true = usuario nuevo, false = actualizado. Guardar usuario_id para referencias internas.')

    # EP 2
    sub(pdf, 'Endpoint 2: PUT /api/users/plan')
    para(pdf, 'Asigna o cambia el plan de pago del usuario. Debe llamarse ANTES de generar solicitudes de recarga (endpoint 14).')
    sub3(pdf, 'Planes Disponibles:')
    table(pdf, ['Plan', 'Recargas/Mes', 'Distribucion'],
          [['control', '1', 'Dia 1: pago total'],
           ['tranquilidad', '2', 'Dia 1 y 15: divide por vencimiento'],
           ['respaldo', '2', 'Dia 1 y 15: divide por vencimiento']],
          [35, 28, 117])
    sub3(pdf, 'Request:')
    codeblock(pdf, 'PUT /api/users/plan\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "plan": "tranquilidad"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",\n    "telefono": "573046757626",\n    "plan_anterior": "control",\n    "plan_nuevo": "tranquilidad"\n  },\n  "error": null\n}', 'JSON')

    # ══════════════════════════════════════════
    # 3. OBLIGACIONES
    # ══════════════════════════════════════════
    section(pdf, '3. Obligaciones (Compromisos Mensuales)')

    # EP 3
    sub(pdf, 'Endpoint 3: POST /api/obligaciones')
    para(pdf, 'Crea una obligacion mensual: un contenedor que agrupa todas las facturas que el usuario debe pagar en un periodo (mes).')
    sub3(pdf, 'Parametros del Body:')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['descripcion', 'string', 'Si', 'Ej: "Pagos de Marzo 2026"'],
           ['periodo', 'string', 'Si', 'Fecha YYYY-MM-DD (se normaliza al dia 1)']],
          [28, 16, 12, 124])
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/obligaciones\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "descripcion": "Pagos de Marzo 2026",\n  "periodo": "2026-03-01"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",\n    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",\n    "descripcion": "Pagos de Marzo 2026",\n    "periodo": "2026-03-01",\n    "estado": "activa",\n    "total_facturas": 0,\n    "facturas_pagadas": 0,\n    "monto_total": 0,\n    "monto_pagado": 0,\n    "creado_en": "2026-03-08T10:30:00.000Z"\n  },\n  "error": null\n}', 'JSON')
    note(pdf, 'Guardar el campo "id" de la respuesta. Se necesita para asociar facturas (endpoint 6) y generar solicitudes de recarga (endpoint 14).', 'warn')

    # EP 4
    sub(pdf, 'Endpoint 4: GET /api/obligaciones?telefono=XXX')
    para(pdf, 'Devuelve TODAS las obligaciones del usuario con su array de facturas, montos y porcentaje de progreso.')
    sub3(pdf, 'Query Params:')
    table(pdf, ['Param', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['estado', 'string', 'No', '"activa", "en_progreso", "completada", "cancelada"']],
          [25, 16, 12, 127])
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": [\n    {\n      "id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",\n      "descripcion": "Pagos de Marzo 2026",\n      "periodo": "2026-03-01",\n      "estado": "activa",\n      "total_facturas": 3,\n      "facturas_pagadas": 1,\n      "monto_total": 250000,\n      "monto_pagado": 85000,\n      "progreso": 33,\n      "facturas": [\n        {\n          "id": "18e6dcfd-...",\n          "servicio": "Internet ETB",\n          "monto": 85000,\n          "estado": "pagada",\n          "referencia_pago": "ETB-2026-001",\n          "etiqueta": "internet",\n          "fecha_vencimiento": "2026-03-10"\n        }\n      ]\n    }\n  ],\n  "error": null\n}', 'JSON')

    # EP 5
    sub(pdf, 'Endpoint 5: GET /api/obligaciones/:id')
    para(pdf, 'Detalle completo de UNA obligacion especifica con todas sus facturas y datos del usuario (nombre, telefono).')
    sub3(pdf, 'Respuesta: Misma estructura que endpoint 4 pero un solo objeto en vez de array. Incluye el campo "usuarios" con nombre, apellido y telefono.')

    # ══════════════════════════════════════════
    # 4. FACTURAS
    # ══════════════════════════════════════════
    section(pdf, '4. Facturas')

    # EP 6
    sub(pdf, 'Endpoint 6: POST /api/facturas/captura')
    para(pdf, 'Registra una factura dentro de una obligacion. El bot extrae los datos (foto, PDF, texto) y los envia aqui.')
    note(pdf, 'Si monto es null o extraccion_estado es "dudosa"/"fallida", la factura queda en estado "en_revision" para validacion manual del admin.', 'warn')
    sub3(pdf, 'Parametros del Body:')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Puede ser null', 'Descripcion'],
          [['telefono', 'string', 'Si', 'No', 'Telefono del usuario'],
           ['obligacion_id', 'UUID', 'Si', 'No', 'ID de la obligacion'],
           ['servicio', 'string', 'Si', 'No', 'Nombre del servicio'],
           ['monto', 'number', 'No', 'Si', 'Valor en pesos. null = revision'],
           ['fecha_vencimiento', 'string', 'No', 'Si', 'Fecha limite YYYY-MM-DD'],
           ['fecha_emision', 'string', 'No', 'Si', 'Fecha emision YYYY-MM-DD'],
           ['referencia_pago', 'string', 'No', 'Si', 'Referencia de factura'],
           ['etiqueta', 'string', 'No', 'Si', '"internet", "gas", etc.'],
           ['periodo', 'string', 'No', 'Si', 'Periodo YYYY-MM-DD'],
           ['origen', 'string', 'No', 'Si', '"bot_whatsapp", "manual", "ocr"'],
           ['archivo_url', 'string', 'No', 'Si', 'URL de imagen/PDF'],
           ['extraccion_estado', 'string', 'No', 'No', '"ok", "dudosa", "fallida"'],
           ['extraccion_confianza', 'number', 'No', 'Si', 'Confianza 0.0 a 1.0']],
          [30, 14, 8, 18, 110])
    sub3(pdf, 'Ejemplo - Factura completa:')
    codeblock(pdf, '{\n  "telefono": "573046757626",\n  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",\n  "servicio": "Vanti S.A. ESP",\n  "monto": 50950,\n  "fecha_vencimiento": "2026-03-24",\n  "fecha_emision": "2026-03-01",\n  "referencia_pago": "7890123456",\n  "etiqueta": "gas",\n  "origen": "bot_whatsapp",\n  "archivo_url": "https://storage.supabase.co/facturas/gas_mar.pdf",\n  "extraccion_estado": "ok",\n  "extraccion_confianza": 0.95\n}', 'JSON')
    sub3(pdf, 'Ejemplo - Extraccion incompleta:')
    codeblock(pdf, '{\n  "telefono": "573046757626",\n  "obligacion_id": "86a0c709-3ca9-41bc-9106-226cac7cf4ba",\n  "servicio": "Factura desconocida",\n  "monto": null,\n  "fecha_vencimiento": null,\n  "referencia_pago": null,\n  "origen": "bot_whatsapp",\n  "archivo_url": "https://storage.supabase.co/facturas/borrosa.jpg",\n  "extraccion_estado": "dudosa",\n  "extraccion_confianza": 0.3\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733",\n    "servicio": "Vanti S.A. ESP",\n    "monto": 50950,\n    "estado": "extraida",\n    "requiere_revision": false\n  },\n  "error": null\n}', 'JSON')

    sub3(pdf, 'Estados posibles de una factura:')
    table(pdf, ['Estado', 'Significado'],
          [['extraida', 'Capturada correctamente. Pendiente de validacion admin'],
           ['en_revision', 'Extraccion dudosa. Admin debe verificar'],
           ['validada', 'Admin confirmo los datos. Lista para pagar'],
           ['pagada', 'Ya se realizo el pago'],
           ['rechazada', 'Admin rechazo esta factura']],
          [30, 150])

    # EP 7
    sub(pdf, 'Endpoint 7: GET /api/facturas/obligacion/:obligacionId')
    para(pdf, 'Lista todas las facturas de una obligacion con todos los campos.')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": [\n    {\n      "referencia_pago": "ETB-2026-001",\n      "servicio": "Internet ETB",\n      "monto": 85000,\n      "estado": "validada",\n      "origen": "bot_whatsapp",\n      "archivo_url": "https://storage.supabase.co/facturas/etb.jpg",\n      "etiqueta": "internet",\n      "fecha_emision": "2026-02-25",\n      "fecha_vencimiento": "2026-03-10",\n      "periodo": "2026-03-01",\n      "extraccion_estado": "ok",\n      "extraccion_confianza": 0.95,\n      "observaciones_admin": "Factura verificada",\n      "motivo_rechazo": null,\n      "_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"\n    }\n  ],\n  "error": null\n}', 'JSON')
    note(pdf, 'El campo _id (UUID interno) es el que se debe usar en el endpoint de pagos (13) como factura_id.')

    # ══════════════════════════════════════════
    # 5. RECARGAS
    # ══════════════════════════════════════════
    section(pdf, '5. Recargas (Depositos de Dinero)')

    # EP 8
    sub(pdf, 'Endpoint 8: POST /api/recargas/reportar')
    para(pdf, 'Registra que el usuario deposito dinero (Nequi, PSE, etc.). Queda en "en_validacion" hasta que un admin la apruebe.')
    note(pdf, 'Si se envia referencia_tx y ya existe una recarga con esa referencia, NO se duplica, devuelve la existente. La recarga NO esta disponible inmediatamente, debe ser aprobada por un admin.', 'warn')
    sub3(pdf, 'Parametros del Body:')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['periodo', 'string', 'Si', 'Periodo YYYY-MM-DD'],
           ['monto', 'number', 'Si', 'Monto recargado (positivo)'],
           ['comprobante_url', 'string', 'Si', 'URL imagen del comprobante'],
           ['referencia_tx', 'string', 'No', 'Referencia bancaria. Previene duplicados']],
          [32, 16, 12, 120])
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/recargas/reportar\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "periodo": "2026-03-01",\n  "monto": 130000,\n  "comprobante_url": "https://storage.supabase.co/comprobantes/nequi_001.jpg",\n  "referencia_tx": "NEQUI-2026030812345"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "recarga_id": "974bad6d-a234-4b56-c789-d012ef345678",\n    "estado": "en_validacion"\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Si ya existia esa referencia_tx (200 - idempotente):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "recarga_id": "974bad6d-a234-4b56-c789-d012ef345678",\n    "estado": "en_validacion",\n    "mensaje": "Recarga ya reportada con esta referencia de transaccion"\n  },\n  "error": null\n}', 'JSON')

    # ══════════════════════════════════════════
    # 6. SALDO
    # ══════════════════════════════════════════
    section(pdf, '6. Saldo Disponible')

    # EP 9
    sub(pdf, 'Endpoint 9: GET /api/disponible')
    para(pdf, 'Calcula en tiempo real cuanto dinero tiene disponible el usuario.\nFormula: disponible = total_recargas_aprobadas - total_pagos_realizados')
    sub3(pdf, 'Query Params:')
    table(pdf, ['Param', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['periodo', 'string', 'Si', 'Periodo YYYY-MM-DD']],
          [25, 16, 12, 127])
    sub3(pdf, 'Ejemplo:')
    codeblock(pdf, 'GET /api/disponible?telefono=573046757626&periodo=2026-03-01', '')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "usuario_id": "49f3c602-80c8-4c59-9ee6-a005bbb86f08",\n    "periodo": "2026-03-01",\n    "total_recargas_aprobadas": 250000,\n    "total_pagos_pagados": 130000,\n    "disponible": 120000\n  },\n  "error": null\n}', 'JSON')

    # ══════════════════════════════════════════
    # 7. NOTIFICACIONES
    # ══════════════════════════════════════════
    section(pdf, '7. Notificaciones')

    # EP 10
    sub(pdf, 'Endpoint 10: GET /api/notificaciones/pendientes/:telefono')
    para(pdf, 'Devuelve notificaciones pendientes de enviar al usuario por WhatsApp. Cada notificacion tiene un payload.mensaje con el texto listo para enviar.')
    note(pdf, '[NUEVO] Comportamiento atomico: Al consultar, automaticamente cambia el estado a "enviada". Ya NO es necesario llamar los endpoints 11 o 12 despues. Excluye notificaciones de tipo alerta_admin.', 'ok')
    sub3(pdf, 'Ejemplo:')
    codeblock(pdf, 'GET /api/notificaciones/pendientes/573046757626', '')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": [\n    {\n      "id": "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",\n      "tipo": "solicitud_recarga",\n      "canal": "whatsapp",\n      "estado": "pendiente",\n      "payload": {\n        "solicitud_id": "09e2ed08-...",\n        "numero_cuota": 1,\n        "total_cuotas": 2,\n        "monto": 215000,\n        "fecha_limite": "2026-03-10",\n        "plan": "tranquilidad",\n        "mensaje": "Hola, tu primera cuota es de $215,000..."\n      },\n      "ultimo_error": null,\n      "creado_en": "2026-03-09T16:04:24.222Z"\n    }\n  ],\n  "error": null\n}', 'JSON')

    sub3(pdf, 'Todos los tipos de notificacion:')
    table(pdf, ['Tipo', 'Se genera cuando...'],
          [['solicitud_recarga', 'Se generan solicitudes de recarga automaticas'],
           ['solicitud_recarga_inicio_mes', 'Cron job detecta inicio de mes con obligaciones activas'],
           ['recarga_confirmada', 'Admin aprueba una recarga del usuario'],
           ['recordatorio_recarga', 'Cuotas proximas a vencer sin saldo'],
           ['recarga_aprobada', 'Admin aprueba una recarga'],
           ['recarga_rechazada', 'Admin rechaza una recarga'],
           ['factura_validada', 'Admin valida una factura'],
           ['factura_rechazada', 'Admin rechaza una factura'],
           ['pago_confirmado', 'Se confirma un pago exitoso'],
           ['obligacion_completada', 'Todas las facturas fueron pagadas'],
           ['nueva_obligacion', 'Se crea obligacion del siguiente mes'],
           ['alerta_admin', 'Usuario sin respuesta 24h (solo admin)']],
          [55, 125])

    sub3(pdf, 'Flujo recomendado para el bot:')
    codeblock(pdf, '1. GET /api/notificaciones/pendientes/573046757626\n   -> Las notificaciones se marcan como "enviada" AUTOMATICAMENTE\n2. Por cada notificacion:\n   a. Leer payload.mensaje (texto listo para enviar)\n   b. Enviar por WhatsApp al usuario\n3. NO necesita llamar batch-enviadas - ya estan marcadas', '')

    # EP 11
    sub(pdf, 'Endpoint 11: PUT /api/notificaciones/:id')
    para(pdf, 'Actualiza el estado de UNA notificacion. Permite marcar como "enviada", "fallida" o "leida".')
    sub3(pdf, 'Ejemplo - Enviada con exito:')
    codeblock(pdf, 'PUT /api/notificaciones/7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "estado": "enviada"\n}', 'JSON')
    sub3(pdf, 'Ejemplo - Error al enviar:')
    codeblock(pdf, '{\n  "estado": "fallida",\n  "ultimo_error": "WhatsApp API timeout despues de 30 segundos"\n}', 'JSON')

    # EP 12
    sub(pdf, 'Endpoint 12: POST /api/notificaciones/batch-enviadas')
    para(pdf, 'Marca multiples notificaciones como "enviada" en una sola llamada.')
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/notificaciones/batch-enviadas\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "ids": [\n    "7cc2d2eb-6b6b-4d6e-b3c2-2e9e4e6ed7ca",\n    "a1b2c3d4-5678-90ab-cdef-1234567890ab"\n  ]\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "actualizadas": 2\n  },\n  "error": null\n}', 'JSON')

    # EP 12a
    sub(pdf, 'Endpoint 12a: GET /api/notificaciones/pendientes-hoy')
    para(pdf, 'Endpoint estrategico para bot de distribucion. Devuelve TODAS las notificaciones de inicio de mes (solicitud_recarga_inicio_mes) creadas hoy en estado pendiente, para TODOS los usuarios. Marca automaticamente todas como "enviada" en la misma consulta. Disenado para consultar una sola vez al dia por un job automatico.')
    sub3(pdf, 'Cuando usarlo:')
    para(pdf, '- Una sola vez por dia (tipicamente a las 9:00 AM)\n- Para que un bot global o job automatico distribuya notificaciones de inicio mes\n- Para el cron job que ejecuta jobEvaluacionRecargas\n- Consulta diaria unica para evitar duplicados')
    sub3(pdf, 'Request:')
    codeblock(pdf, 'GET /api/notificaciones/pendientes-hoy\nHeaders:\n  x-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n  (o x-admin-api-key trabajar tambien)', '')
    sub3(pdf, 'Respuesta Exitosa (200) - Con notificaciones:')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "total": 2,\n    "notificaciones": [\n      {\n        "id": "e4c9a1f2-...",\n        "usuario_id": "user-001",\n        "tipo": "solicitud_recarga_inicio_mes",\n        "estado": "pendiente",\n        "usuarios": {\n          "nombre": "Laura",\n          "apellido": "Duran",\n          "telefono": "573046757626"\n        },\n        "payload": {\n          "tipo_mensaje": "inicio_mes",\n          "nombre_usuario": "Laura Duran",\n          "mes_actual": "Marzo 2026",\n          "mes_anterior": "Febrero 2026",\n          "obligaciones": [\n            {"etiqueta": "energia", "monto": 85000},\n            {"etiqueta": "gas", "monto": 50950}\n          ],\n          "total_obligaciones": 135950,\n          "saldo_actual": 0,\n          "valor_a_recargar": 135950,\n          "es_primera_recarga": true,\n          "obligacion_id": "obl-123",\n          "periodo": "2026-03-01",\n          "mensaje": "Hola Laura Duran xX\\nArrancamos mes!\\n\\nEn Febrero pagaste $ 0 y tienes un saldo de $ 0\\n\\nPara Marzo, tus obligaciones suman $ 135,950..."\n        },\n        "creado_en": "2026-03-16T09:00:15.000Z"\n      },\n      {\n        "id": "f5d1b2e3-...",\n        "usuario_id": "user-002",\n        "tipo": "solicitud_recarga_inicio_mes",\n        "estado": "pendiente",\n        "usuarios": {\n          "nombre": "Carlos",\n          "apellido": "Perez",\n          "telefono": "3001112233"\n        },\n        "payload": {"tipo_mensaje": "inicio_mes", "nombre_usuario": "Carlos Perez", ...}\n      }\n    ]\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Respuesta cuando NO hay notificaciones (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "total": 0,\n    "notificaciones": []\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Errores posibles:')
    table(pdf, ['Codigo', 'Mensaje'],
          [['UNAUTHORIZED', 'API Key invalida o ausente'],
           ['500', 'Error interno del servidor (si algo falla)']],
          [45, 135])
    sub3(pdf, 'Garantias de comportamiento:')
    para(pdf, '- Filtra SOLO "solicitud_recarga_inicio_mes"\n- Solo notificaciones del dia actual en "pendiente"\n- Marca TODAS como "enviada" automaticamente\n- Idempotente: 2da consulta mismo dia devuelve [] (vacio)\n- Si job falla, notificaciones permanecen "pendiente"\n- Tiempo ~100-200ms para 2-50 usuarios/dia')

    # ══════════════════════════════════════════
    # 8. PAGOS
    # ══════════════════════════════════════════
    section(pdf, '8. Pagos')

    # EP 13
    sub(pdf, 'Endpoint 13: POST /api/pagos/crear')
    para(pdf, 'Crea un pago para una factura especifica. Verifica que:\n1. La factura exista y este en estado "validada"\n2. El usuario tenga saldo disponible suficiente\n\nSi ambas se cumplen, crea el pago en estado "en_proceso". El monto se descuenta del saldo.')
    sub3(pdf, 'Parametros del Body:')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['factura_id', 'UUID', 'Si', 'UUID de la factura (campo _id del endpoint 7)']],
          [28, 16, 12, 124])
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/pagos/crear\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "factura_id": "63dd4b3b-9e6c-43b1-a6b6-ff5858554733"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "pago_id": "0da485dd-f234-5678-9abc-def012345678",\n    "estado": "en_proceso",\n    "monto": 85000,\n    "servicio": "Internet ETB"\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Errores posibles:')
    table(pdf, ['Codigo', 'Mensaje'],
          [['NOT_FOUND', 'Factura no encontrada'],
           ['INVALID_STATE_TRANSITION', 'No se puede crear pago para factura en estado "extraida". Debe estar "validada".'],
           ['INSUFFICIENT_FUNDS', 'Fondos insuficientes. Disponible: $0, Requerido: $120,000']],
          [45, 135])

    # ══════════════════════════════════════════
    # 9. SOLICITUDES RECARGA
    # ══════════════════════════════════════════
    section(pdf, '9. Solicitudes de Recarga Automaticas')

    # EP 14
    sub(pdf, 'Endpoint 14: POST /api/solicitudes-recarga/generar')
    para(pdf, 'Analiza las facturas de una obligacion y genera solicitudes de recarga segun el plan del usuario.')
    sub3(pdf, 'Logica segun plan:')
    note(pdf, 'Plan CONTROL (1 cuota): 1 solicitud por el monto total. Fecha limite = vencimiento mas proximo. Recordatorio = 5 dias antes.')
    note(pdf, 'Plan TRANQUILIDAD / RESPALDO (2 cuotas): Divide facturas en 2 grupos por fecha de vencimiento. Cuota 1: vencen dia 1-15. Cuota 2: vencen dia 16-31. Si todas caen en la misma mitad, divide 50/50.')
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/solicitudes-recarga/generar\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626",\n  "obligacion_id": "260b7859-a392-45bc-95c9-5a7f627a93f7"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201) - Plan tranquilidad:')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "solicitudes": [\n      {\n        "id": "09e2ed08-a234-4b56-c789-d012ef345678",\n        "numero_cuota": 1,\n        "total_cuotas": 2,\n        "monto_solicitado": 215000,\n        "fecha_limite": "2026-03-10",\n        "fecha_recordatorio": "2026-03-05",\n        "facturas_ids": ["7bd45f33-...", "f1bf3f36-..."],\n        "estado": "pendiente",\n        "plan": "tranquilidad"\n      },\n      {\n        "id": "3e30936d-b345-5678-d890-e123fa456789",\n        "numero_cuota": 2,\n        "total_cuotas": 2,\n        "monto_solicitado": 120000,\n        "fecha_limite": "2026-03-22",\n        "fecha_recordatorio": "2026-03-17",\n        "facturas_ids": ["845a1a5c-..."],\n        "estado": "pendiente",\n        "plan": "tranquilidad"\n      }\n    ],\n    "plan": "tranquilidad",\n    "monto_total": 335000,\n    "total_cuotas": 2\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (201) - Plan control:')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "solicitudes": [\n      {\n        "id": "a1b2c3d4-...",\n        "numero_cuota": 1,\n        "total_cuotas": 1,\n        "monto_solicitado": 335000,\n        "fecha_limite": "2026-03-10",\n        "fecha_recordatorio": "2026-03-05",\n        "facturas_ids": ["7bd45f33-...", "f1bf3f36-...", "845a1a5c-..."],\n        "estado": "pendiente",\n        "plan": "control"\n      }\n    ],\n    "plan": "control",\n    "monto_total": 335000,\n    "total_cuotas": 1\n  },\n  "error": null\n}', 'JSON')
    sub3(pdf, 'Campos de la respuesta:')
    table(pdf, ['Campo', 'Significado'],
          [['solicitudes[].id', 'UUID de la solicitud'],
           ['solicitudes[].numero_cuota', '1 = primera cuota, 2 = segunda cuota'],
           ['solicitudes[].monto_solicitado', 'Cuanto debe recargar para esta cuota'],
           ['solicitudes[].fecha_limite', 'Fecha maxima para hacer la recarga'],
           ['solicitudes[].fecha_recordatorio', '5 dias antes de fecha_limite'],
           ['solicitudes[].facturas_ids', 'UUIDs de las facturas que cubre']],
          [50, 130])

    # EP 15
    sub(pdf, 'Endpoint 15: GET /api/solicitudes-recarga')
    para(pdf, 'Lista todas las solicitudes de recarga de un usuario. Permite filtrar por estado y obligacion.')
    sub3(pdf, 'Query Params:')
    table(pdf, ['Param', 'Tipo', 'Req', 'Descripcion'],
          [['telefono', 'string', 'Si', 'Telefono del usuario'],
           ['estado', 'string', 'No', '"pendiente", "parcial", "cumplida", "vencida", "cancelada"'],
           ['obligacion_id', 'UUID', 'No', 'Filtrar por obligacion']],
          [28, 16, 12, 124])
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": [\n    {\n      "id": "09e2ed08-...",\n      "creado_en": "2026-03-09T16:04:24.011Z",\n      "usuario_id": "d630868d-...",\n      "obligacion_id": "260b7859-...",\n      "numero_cuota": 1,\n      "total_cuotas": 2,\n      "monto_solicitado": 215000,\n      "monto_recargado": 0,\n      "fecha_limite": "2026-03-08",\n      "fecha_recordatorio": "2026-03-03",\n      "estado": "pendiente",\n      "facturas_ids": ["7bd45f33-...", "0c1327ce-...", "f1bf3f36-..."],\n      "plan": "tranquilidad",\n      "notificacion_enviada": false,\n      "recordatorio_enviado": true\n    }\n  ],\n  "error": null\n}', 'JSON')

    # EP 16
    sub(pdf, 'Endpoint 16: POST /api/solicitudes-recarga/verificar-recordatorios')
    para(pdf, 'Busca solicitudes proximas a vencer, verifica si el usuario tiene saldo, y genera notificacion recordatorio_recarga si no tiene saldo.')
    note(pdf, 'El cron job diario (9:00 AM) ya ejecuta esta verificacion automaticamente para TODOS los usuarios. Este endpoint es util como respaldo o para verificar un usuario especifico.')
    sub3(pdf, 'Request:')
    codeblock(pdf, 'POST /api/solicitudes-recarga/verificar-recordatorios\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "telefono": "573046757626"\n}', 'JSON')
    sub3(pdf, 'Respuesta - Se generaron recordatorios (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": {\n    "recordatorios_generados": 1,\n    "detalle": [\n      {\n        "solicitud_id": "09e2ed08-...",\n        "monto_faltante": 215000,\n        "fecha_limite": "2026-03-08"\n      }\n    ]\n  },\n  "error": null\n}', 'JSON')

    # EP 17
    sub(pdf, 'Endpoint 17: PUT /api/solicitudes-recarga/:id/fechas')
    para(pdf, 'Permite al usuario cambiar las fechas limite de sus cuotas. Recalcula automaticamente fecha_recordatorio (5 dias antes) y resetea recordatorio_enviado.')
    sub3(pdf, 'Parametros del Body:')
    table(pdf, ['Campo', 'Tipo', 'Req', 'Descripcion'],
          [['fecha_cuota_1', 'string', 'No*', 'Nueva fecha limite cuota 1 (YYYY-MM-DD)'],
           ['fecha_cuota_2', 'string', 'No*', 'Nueva fecha limite cuota 2 (YYYY-MM-DD)']],
          [28, 16, 12, 124])
    note(pdf, '* Debe enviarse al menos una fecha. Solo se pueden modificar solicitudes en estado "pendiente" o "parcial".', 'warn')
    sub3(pdf, 'Request:')
    codeblock(pdf, 'PUT /api/solicitudes-recarga/09e2ed08-.../fechas\nx-bot-api-key: TK2026A7F9X3M8N2P5Q1R4T6Y8U0I9O3\n\n{\n  "fecha_cuota_1": "2026-03-05",\n  "fecha_cuota_2": "2026-03-18"\n}', 'JSON')
    sub3(pdf, 'Respuesta Exitosa (200):')
    codeblock(pdf, '{\n  "ok": true,\n  "data": [\n    {\n      "id": "09e2ed08-...",\n      "numero_cuota": 1,\n      "total_cuotas": 2,\n      "monto_solicitado": 215000,\n      "fecha_limite": "2026-03-05",\n      "fecha_recordatorio": "2026-02-28",\n      "estado": "pendiente",\n      "recordatorio_enviado": false\n    },\n    {\n      "id": "3e30936d-...",\n      "numero_cuota": 2,\n      "total_cuotas": 2,\n      "monto_solicitado": 120000,\n      "fecha_limite": "2026-03-18",\n      "fecha_recordatorio": "2026-03-13",\n      "estado": "pendiente",\n      "recordatorio_enviado": false\n    }\n  ],\n  "error": null\n}', 'JSON')

    # ══════════════════════════════════════════
    # 10. FLUJO COMPLETO
    # ══════════════════════════════════════════
    section(pdf, '10. Flujo Completo del Sistema')

    phases = [
        ('FASE 1: REGISTRO Y CONFIGURACION', 'Bot <-> Usuario', [
            '1. Usuario llega por WhatsApp -> POST /api/users/upsert',
            '2. Elige plan -> PUT /api/users/plan',
            '3. Crear obligacion del mes -> POST /api/obligaciones',
            '4. Cargar facturas -> POST /api/facturas/captura',
            '5. Generar solicitudes de recarga -> POST /api/solicitudes-recarga/generar',
        ]),
        ('FASE 2: EVALUACION AUTOMATICA', 'Cron Jobs', [
            '6. Cron Job 9:00 AM - jobEvaluacionRecargas:',
            '   Evalua obligaciones activas, calcula montos, verifica saldo',
            '   Genera notificaciones: solicitud_recarga_inicio_mes o solicitud_recarga',
            '7. Cron Job cada 6h - jobVerificarInactividad:',
            '   Busca notificaciones sin respuesta (24-48h)',
            '   Si no hay recarga -> crea alerta_admin',
        ]),
        ('FASE 3: RECARGA Y APROBACION', 'Bot <-> Usuario <-> Admin', [
            '8. Bot entrega notificaciones -> GET /api/notificaciones/pendientes/:tel',
            '   (marcado automatico como "enviada")',
            '9. Usuario recarga dinero -> POST /api/recargas/reportar',
            '10. Admin valida -> PUT /api/recargas/:id/aprobar',
            '    Auto-limpieza: cancela cobros, actualiza solicitudes, notifica',
        ]),
        ('FASE 4: PAGOS Y SEGUIMIENTO', 'Bot + Admin', [
            '11. Verificar saldo -> GET /api/disponible',
            '12. Crear pagos -> POST /api/pagos/crear',
            '13. Consultar estado -> GET /api/obligaciones, facturas, solicitudes',
            '14. Personalizar fechas -> PUT /api/solicitudes-recarga/:id/fechas',
        ]),
    ]

    for ph_title, actors, steps in phases:
        if pdf.get_y() > 230:
            pdf.add_page()
        pdf.set_fill_color(*PRIMARY)
        pdf.rect(15, pdf.get_y(), 180, 7.5, 'F')
        pdf.set_font('helvetica', 'B', 8.5)
        pdf.set_text_color(*WHITE)
        pdf.set_x(18)
        pdf.cell(110, 7.5, ph_title)
        pdf.set_font('helvetica', 'I', 7.5)
        pdf.cell(67, 7.5, actors, align='R')
        pdf.ln(9)
        pdf.set_font('helvetica', '', 8)
        pdf.set_text_color(*TEXT_CLR)
        for st in steps:
            if pdf.get_y() > 268:
                pdf.add_page()
            pdf.set_x(20)
            pdf.multi_cell(170, 4.2, ce(st))
        pdf.ln(3)

    # ══════════════════════════════════════════
    # 11. CRON JOBS
    # ══════════════════════════════════════════
    section(pdf, '11. Sistema Automatico de Evaluacion (Cron Jobs)')

    para(pdf, 'El servidor ejecuta cron jobs automaticamente que evaluan obligaciones, recalculan solicitudes y generan notificaciones.')

    sub(pdf, 'Job 1: jobEvaluacionRecargas - 9:00 AM diario')
    para(pdf, 'Archivo: src/jobs/recordatorios.job.js\nProgramacion: cron.schedule("0 9 * * *", ...)')
    codeblock(pdf, 'Secuencia de ejecucion:\n1. obtenerObligacionesActivas() -> Lista de obligaciones activas\n2. FOR cada obligacion:\n   a. evaluarObligacion() -> Calcula monto pendiente\n   b. detectarPrimeraRecargaDelMes() -> Tipo de mensaje\n   c. existeNotificacionHoy() -> Evita duplicados diarios\n   d. prepararDatosNotificacion() -> Construye payload\n   e. crearNotificacionRecarga() -> Inserta notificacion\n3. Retorna resumen: procesadas, creadas, errores', '')

    sub(pdf, 'Job 2: jobVerificarInactividad - Cada 6 horas')
    para(pdf, 'Archivo: src/modules/notificaciones/notificaciones.service.js\nProgramacion: cron.schedule("0 */6 * * *", ...)')
    codeblock(pdf, 'Logica de deteccion:\n1. Rango: notificaciones enviadas 24-48h atras\n2. Tipos: solicitud_recarga | solicitud_recarga_inicio_mes\n3. Estado: enviada\n4. Verifica: Ya existe alerta para esta notificacion? -> omitir si si\n5. Verifica: Hay recargas despues del mensaje?\n   -> Si NO -> crearAlertaAdmin() con usuario_id: null', '')

    sub3(pdf, 'Protecciones del sistema:')
    para(pdf, '- No genera notificaciones duplicadas el mismo dia\n- Control de concurrencia (un solo job a la vez)\n- Si node-cron no esta instalado, el servidor arranca sin jobs\n- Los montos se recalculan automaticamente al cambiar facturas\n- Job de inactividad verifica que no exista alerta previa\n- Solo detecta inactividad entre 24-48h')

    # ══════════════════════════════════════════
    # 12. PLANTILLAS
    # ══════════════════════════════════════════
    section(pdf, '12. Plantillas de Mensajes Automaticos')

    para(pdf, 'Las notificaciones incluyen mensajes formateados listos para WhatsApp. El bot debe leer payload.mensaje y enviarlo tal cual.')

    sub(pdf, 'Tipo: solicitud_recarga_inicio_mes')
    para(pdf, 'Se genera al inicio de cada mes cuando el usuario tiene obligaciones activas.')
    codeblock(pdf, 'Hola Carlos\nArrancamos mes!\n\nEn Febrero 2026 pagaste "$ 162,000" y tienes un saldo de "$ 70,000"\n\nPara Marzo 2026, tus obligaciones suman "$ 250,000", asi:\n\n"@EPM Energia": "$ 120,000".\n"@Internet ETB": "$ 85,000".\n"@Gas Vanti": "$ 45,000".\n\nLa recarga total sugerida para Marzo 2026 es de "$ 180,000".\n\nPuedes hacer la recarga a la llave 0090944088.\n\nApenas la hagas, me envias el comprobante y yo me encargo del resto deOne!', 'WhatsApp')

    sub(pdf, 'Tipo: solicitud_recarga (generico)')
    codeblock(pdf, 'Hola Carlos!\nYa estamos listos para recibir tu recarga, con la que cubriremos:\n"@EPM Energia": "$ 120,000".\n"@Internet ETB": "$ 85,000".\n"@Gas Vanti": "$ 45,000".\n\nTotal: "$ 250,000"\nAplicamos tu saldo: "$ 50,000"\n\nTotal a recargar: "$ 200,000".\nPuedes hacer la recarga a la llave 0090944088.\n\nApenas la hagas, me envias el comprobante y yo me encargo del resto deOne!', 'WhatsApp')

    sub(pdf, 'Tipo: recarga_confirmada')
    codeblock(pdf, 'Recibido, Carlos\n\nYa registre tu recarga. Tu saldo disponible en deOne es de $ 130,000', 'WhatsApp')

    sub(pdf, 'Campos del payload en notificaciones automaticas:')
    table(pdf, ['Campo', 'Descripcion'],
          [['mensaje', 'Texto completo listo para WhatsApp'],
           ['tipo_mensaje', '"inicio_mes" | "generico" | "confirmada"'],
           ['nombre_usuario', 'Nombre del usuario'],
           ['mes_actual', 'Nombre del mes (ej: "Marzo 2026")'],
           ['obligaciones', 'Array de { etiqueta, monto }'],
           ['total_obligaciones', 'Suma total de facturas'],
           ['saldo_actual', 'Saldo actual del usuario'],
           ['valor_a_recargar', 'total_obligaciones - saldo_actual'],
           ['es_primera_recarga', 'true si es primera del mes'],
           ['obligacion_id', 'ID de la obligacion'],
           ['periodo', 'Periodo (ej: "2026-03-01")']],
          [38, 142])
    note(pdf, 'Llave de recarga: 0090944088 - Esta llave aparece en los mensajes automaticos.', 'warn')

    # ══════════════════════════════════════════
    # 13. ESTADOS
    # ══════════════════════════════════════════
    section(pdf, '13. Resumen de Estados del Sistema')

    states = [
        ('Recargas', 'en_validacion -> aprobada | rechazada'),
        ('Notificaciones', 'pendiente -> enviada -> leida\n         -> cancelada (auto-limpieza)\n         -> fallida'),
        ('Solicitudes de Recarga', 'pendiente -> parcial -> cumplida\n         -> vencida\n         -> cancelada'),
        ('Facturas', 'extraida -> validada -> pagada\n    |          |\nen_revision   rechazada'),
        ('Obligaciones', 'activa -> en_progreso -> completada\n       -> cancelada'),
        ('Pagos', 'en_proceso -> pagado | fallido'),
    ]
    for entity, diagram in states:
        if pdf.get_y() > 252:
            pdf.add_page()
        sub3(pdf, entity + ':')
        codeblock(pdf, diagram, '')

    # ══════ FINAL ══════
    pdf.add_page()
    pdf.set_y(100)
    pdf.set_font('helvetica', 'B', 20)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 14, 'Fin del Documento', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(1.5)
    pdf.line(75, pdf.get_y() + 4, 135, pdf.get_y() + 4)
    pdf.ln(12)
    pdf.set_font('helvetica', '', 11)
    pdf.set_text_color(*TEXT_CLR)
    pdf.cell(0, 7, 'DeOne Backend API v2.1', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, '18 Endpoints Bot | 2 Cron Jobs | 4 Modulos', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font('helvetica', 'I', 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 7, '16 de marzo de 2026', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, 'https://prueba-supabase.onrender.com/api', align='C', new_x="LMARGIN", new_y="NEXT")

    # Guardar (ruta relativa)
    out = os.path.join(os.path.dirname(__file__), 'docs', 'DeOne_API_Documentation.pdf')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pdf.output(out)
    print(f'\n  PDF generado: {out}')
    print(f'   Paginas: {pdf.page_no()}')


if __name__ == '__main__':
    build()
