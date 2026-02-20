-- ===========================================
-- DeOne Backend - Migración v3
-- Índices para notificaciones y pagos
-- Ejecutar en Supabase SQL Editor
-- ===========================================

-- Índices para tabla notificaciones (ya existe)
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_estado ON notificaciones(estado);
CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo ON notificaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_creado ON notificaciones(creado_en);

-- Índices para pagos
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON pagos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_factura ON pagos(factura_id);

-- Índice para usuarios (búsqueda)
CREATE INDEX IF NOT EXISTS idx_usuarios_nombre ON usuarios(nombre);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);

-- ========== FIN MIGRACIÓN v3 ==========
