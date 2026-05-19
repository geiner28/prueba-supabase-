-- =====================================================
-- Migracion 009: Simplificar validacion_estado de facturas
-- Nuevo modelo interno admin:
--   sin_revisar | revisada
-- Nota: Se conserva la columna motivo_rechazo para distinguir revisadas rechazadas.
-- =====================================================

BEGIN;

-- 1) Renombrar valores del enum existente si estan presentes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'factura_validacion' AND e.enumlabel = 'sin_validar'
  ) THEN
    ALTER TYPE factura_validacion RENAME VALUE 'sin_validar' TO 'sin_revisar';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'factura_validacion' AND e.enumlabel = 'validada'
  ) THEN
    ALTER TYPE factura_validacion RENAME VALUE 'validada' TO 'revisada';
  END IF;
END $$;

-- 2) Backfill de registros legacy con estado interno 'rechazada'
-- Se normaliza a 'revisada' y se conserva traza en motivo_rechazo.
UPDATE facturas
SET
  validacion_estado = 'revisada'::factura_validacion,
  motivo_rechazo = COALESCE(NULLIF(motivo_rechazo, ''), 'rechazo_legacy_migracion_009')
WHERE validacion_estado::text = 'rechazada';

-- 3) Asegurar default del nuevo estado inicial
ALTER TABLE facturas
  ALTER COLUMN validacion_estado SET DEFAULT 'sin_revisar'::factura_validacion;

COMMIT;
