-- ===========================================
-- Migración 005 — Cierre Dashboard Admin
-- Fecha: 2026-04-28
--
-- Cubre los puntos del documento "Requerimientos al Backend":
--   1) Filtrar notificaciones por canal (server-side)
--   2) Separar destinatario admin vs usuario en notificaciones
--   5a) Campos extra en obligaciones (pagina_pago, periodicidad)
--
-- Idempotente. Re-ejecutable.
-- ===========================================

-- ────────────────────────────────────────────────────────────
-- 1. NOTIFICACIONES: columna `destinatario`
-- ────────────────────────────────────────────────────────────
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS destinatario varchar(10)
  NOT NULL DEFAULT 'usuario';

-- Constraint de valores permitidos (drop+create para que sea idempotente)
ALTER TABLE notificaciones
  DROP CONSTRAINT IF EXISTS chk_notificaciones_destinatario;

ALTER TABLE notificaciones
  ADD CONSTRAINT chk_notificaciones_destinatario
  CHECK (destinatario IN ('admin', 'usuario'));

-- Backfill: las alertas existentes son para el admin
UPDATE notificaciones
SET destinatario = 'admin'
WHERE tipo = 'alerta_admin'
  AND destinatario <> 'admin';

-- Las que no tienen usuario (created with usuario_id NULL) son admin
UPDATE notificaciones
SET destinatario = 'admin'
WHERE usuario_id IS NULL
  AND destinatario <> 'admin';

CREATE INDEX IF NOT EXISTS idx_notificaciones_destinatario
  ON notificaciones(destinatario);

CREATE INDEX IF NOT EXISTS idx_notificaciones_canal
  ON notificaciones(canal);

-- ────────────────────────────────────────────────────────────
-- 2. NOTIFICACIONES: ampliar valores aceptados de `canal`
--    Hoy la app solo enviaba 'whatsapp'/'email'/'push'/'sms'/'sistema'.
--    Ampliamos para soportar 'telegram', 'admin', 'interno'
--    (el campo es texto/varchar, así que no hay enum a alterar).
-- ────────────────────────────────────────────────────────────
-- (no-op si la columna es text/varchar libre)

-- ────────────────────────────────────────────────────────────
-- 3. OBLIGACIONES: campos opcionales nuevos
-- ────────────────────────────────────────────────────────────
ALTER TABLE obligaciones
  ADD COLUMN IF NOT EXISTS pagina_pago text;

ALTER TABLE obligaciones
  ADD COLUMN IF NOT EXISTS periodicidad text;

-- ========== FIN MIGRACIÓN 005 ==========
