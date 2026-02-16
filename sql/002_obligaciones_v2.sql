-- ===========================================
-- DeOne Backend - Migración v2
-- Rediseño: Obligación = compromiso del periodo
-- Ejecutar en Supabase SQL Editor
-- ===========================================

-- 1. Agregar nuevos estados al enum obligacion_estado
ALTER TYPE obligacion_estado ADD VALUE IF NOT EXISTS 'en_progreso';
ALTER TYPE obligacion_estado ADD VALUE IF NOT EXISTS 'completada';
ALTER TYPE obligacion_estado ADD VALUE IF NOT EXISTS 'cancelada';

-- 2. Agregar campos a obligaciones
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS periodo date;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS total_facturas int NOT NULL DEFAULT 0;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS facturas_pagadas int NOT NULL DEFAULT 0;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS monto_total numeric NOT NULL DEFAULT 0;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS monto_pagado numeric NOT NULL DEFAULT 0;
ALTER TABLE obligaciones ADD COLUMN IF NOT EXISTS completada_en timestamptz;

-- 3. Quitar constraint unique antigua de obligaciones (usuario+servicio+ref)
--    porque ahora puede haber múltiples obligaciones por periodo
ALTER TABLE obligaciones DROP CONSTRAINT IF EXISTS uq_obligacion_usuario_serv_ref;

-- 4. Hacer obligacion_id NULLABLE en facturas (para facturas sin obligación aún)
--    y quitar el constraint unique de factura+obligacion+periodo
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS uq_factura_obligacion_periodo;
ALTER TABLE facturas ALTER COLUMN obligacion_id DROP NOT NULL;

-- 5. Agregar campo 'servicio' a facturas (nombre del servicio: EPM Energía, Agua, Gas, etc.)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS servicio text;

-- 6. Hacer fecha_vencimiento nullable (puede no conocerse al capturar)
ALTER TABLE facturas ALTER COLUMN fecha_vencimiento DROP NOT NULL;

-- 7. Índices nuevos
CREATE INDEX IF NOT EXISTS idx_obligaciones_usuario_periodo ON obligaciones(usuario_id, periodo);
CREATE INDEX IF NOT EXISTS idx_obligaciones_estado ON obligaciones(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_obligacion ON facturas(obligacion_id);

-- ========== FIN MIGRACIÓN v2 ==========
