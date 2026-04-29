-- ===========================================
-- Migración 006 — Campos extra usuarios y obligaciones
-- Fecha: 2026-04-28
--
-- Cubre los puntos 7.1 y 7.2 del documento "BACKEND_REQUIREMENTS.md"
-- (rediseño modales "Agregar usuario" y "Agregar obligación").
--
--   USUARIOS:
--     - tipo_identificacion   (CC | NIT)
--     - numero_identificacion (varchar 32)
--     - ciudad                (varchar 80)
--
--   OBLIGACIONES:
--     - receptor              (varchar 120)  — proveedor/empresa al que se paga
--     - grupo                 (smallint 1|2) — clasificación interna
--
-- Idempotente. Re-ejecutable.
-- ===========================================

-- ────────────────────────────────────────────────────────────
-- 1. USUARIOS: nuevos campos opcionales
-- ────────────────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tipo_identificacion varchar(8);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS numero_identificacion varchar(32);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS ciudad varchar(80);

-- Constraint de valores permitidos para tipo_identificacion
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_tipo_identificacion;

ALTER TABLE usuarios
  ADD CONSTRAINT chk_usuarios_tipo_identificacion
  CHECK (tipo_identificacion IS NULL OR tipo_identificacion IN ('CC', 'NIT'));

CREATE INDEX IF NOT EXISTS idx_usuarios_numero_identificacion
  ON usuarios(numero_identificacion)
  WHERE numero_identificacion IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. OBLIGACIONES: receptor y grupo
-- ────────────────────────────────────────────────────────────
ALTER TABLE obligaciones
  ADD COLUMN IF NOT EXISTS receptor varchar(120);

ALTER TABLE obligaciones
  ADD COLUMN IF NOT EXISTS grupo smallint;

-- Constraint de valores permitidos para grupo
ALTER TABLE obligaciones
  DROP CONSTRAINT IF EXISTS chk_obligaciones_grupo;

ALTER TABLE obligaciones
  ADD CONSTRAINT chk_obligaciones_grupo
  CHECK (grupo IS NULL OR grupo IN (1, 2));

-- ========== FIN MIGRACIÓN 006 ==========
