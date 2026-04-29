-- ===========================================
-- Migración 007 — Rediseño estados de facturas + grupo + suscripción
-- Fecha: 2026-04-28
--
-- Cubre cambios solicitados (ver chat 28-abr-2026):
--   • Estados visibles al usuario: pendiente | pagada | sin_factura | aproximada
--   • Estados internos admin: sin_validar | validada | rechazada
--     (los estados viejos: capturada/extraida/en_revision/validada/rechazada/pagada
--      se migran al nuevo modelo; la columna `estado` pasa a representar el
--      estado VISIBLE, y se agrega `validacion_estado` para el flujo admin).
--   • Grupo (1 | 2) a nivel factura (no de obligación).
--   • Porcentaje de aproximación (default 10).
--   • Suscripción como tipo de obligación: tipo_referencia='suscripcion'.
--
-- Idempotente. Re-ejecutable.
-- ===========================================

-- ────────────────────────────────────────────────────────────
-- 1. Nuevo enum: validacion_estado (proceso admin)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factura_validacion') THEN
    CREATE TYPE factura_validacion AS ENUM ('sin_validar', 'validada', 'rechazada');
  END IF;
END$$;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS validacion_estado factura_validacion
    NOT NULL DEFAULT 'sin_validar';

-- ────────────────────────────────────────────────────────────
-- 2. Backfill de validacion_estado a partir de estado_legacy
--    (antes de cambiar el enum de `estado`)
-- ────────────────────────────────────────────────────────────
UPDATE facturas
SET validacion_estado = CASE
    WHEN estado::text IN ('capturada','extraida','en_revision') THEN 'sin_validar'::factura_validacion
    WHEN estado::text = 'validada' THEN 'validada'::factura_validacion
    WHEN estado::text = 'rechazada' THEN 'rechazada'::factura_validacion
    WHEN estado::text = 'pagada' THEN 'validada'::factura_validacion
    ELSE 'sin_validar'::factura_validacion
  END
WHERE TRUE;

-- ────────────────────────────────────────────────────────────
-- 3. Cambiar el enum de `estado` al nuevo modelo
--    Estrategia: pasar a TEXT, mapear, recrear enum, volver al tipo
-- ────────────────────────────────────────────────────────────

-- 3.1 Quitar default temporalmente para poder cambiar el tipo
ALTER TABLE facturas ALTER COLUMN estado DROP DEFAULT;

-- 3.2 Convertir a text para poder re-mapear sin restricciones
ALTER TABLE facturas
  ALTER COLUMN estado TYPE text USING estado::text;

-- 3.3 Mapear valores viejos a los nuevos
UPDATE facturas
SET estado = CASE
    WHEN estado IN ('capturada','extraida','en_revision','validada','rechazada') THEN 'pendiente'
    WHEN estado = 'pagada' THEN 'pagada'
    ELSE 'pendiente'
  END
WHERE TRUE;

-- 3.4 Recrear enum factura_estado con los nuevos valores
DROP TYPE IF EXISTS factura_estado_old CASCADE;
ALTER TYPE factura_estado RENAME TO factura_estado_old;
CREATE TYPE factura_estado AS ENUM ('pendiente', 'pagada', 'sin_factura', 'aproximada');

-- 3.5 Migrar la columna al nuevo tipo
ALTER TABLE facturas
  ALTER COLUMN estado TYPE factura_estado USING estado::factura_estado;

-- 3.6 Restaurar default
ALTER TABLE facturas
  ALTER COLUMN estado SET DEFAULT 'pendiente'::factura_estado;

-- 3.7 Drop del enum antiguo (ya nadie lo referencia)
DROP TYPE IF EXISTS factura_estado_old;

-- ────────────────────────────────────────────────────────────
-- 4. Nueva columna: grupo (a nivel factura)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS grupo smallint;

ALTER TABLE facturas
  DROP CONSTRAINT IF EXISTS chk_facturas_grupo;

ALTER TABLE facturas
  ADD CONSTRAINT chk_facturas_grupo
  CHECK (grupo IS NULL OR grupo IN (1, 2));

-- Backfill: heredar el grupo de la obligación si la factura no lo tiene
UPDATE facturas f
SET grupo = o.grupo
FROM obligaciones o
WHERE f.obligacion_id = o.id
  AND f.grupo IS NULL
  AND o.grupo IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Porcentaje de aproximación
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS aproximacion_porcentaje numeric(5,2);

ALTER TABLE facturas
  DROP CONSTRAINT IF EXISTS chk_facturas_aproximacion_porcentaje;

ALTER TABLE facturas
  ADD CONSTRAINT chk_facturas_aproximacion_porcentaje
  CHECK (aproximacion_porcentaje IS NULL OR (aproximacion_porcentaje >= 0 AND aproximacion_porcentaje <= 100));

-- ────────────────────────────────────────────────────────────
-- 6. Fecha de recordatorio (opcional, para timeline)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS fecha_recordatorio date;

-- ────────────────────────────────────────────────────────────
-- 7. Índices útiles
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_facturas_validacion_estado
  ON facturas(validacion_estado);

CREATE INDEX IF NOT EXISTS idx_facturas_grupo
  ON facturas(grupo)
  WHERE grupo IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 8. (Opcional) Etiqueta para identificar obligación de suscripción
--    No requiere columna nueva: el backend la creará con
--      tipo_referencia = 'suscripcion'
--      numero_referencia = '<plan>'  (control|tranquilidad|respaldo)
--      receptor          = 'DeOne'
--      grupo             = 1
--      monto_total       = 0
-- ────────────────────────────────────────────────────────────

-- ========== FIN MIGRACIÓN 007 ==========
