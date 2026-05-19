-- ============================================================
-- 009 — Timestamps de envío y entrega para notificaciones (bot)
-- ============================================================
-- Objetivo:
--   El bot pasivo necesita registrar dos momentos exactos por
--   cada mensaje generado por el sistema:
--     • enviada_en   → cuando el sistema entrega la campaña al bot
--                       (se setea cuando el bot consume la cola).
--     • entregada_en → cuando el destinatario recibe el mensaje
--                       en WhatsApp (lo reporta el bot).
-- ============================================================

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS enviada_en   timestamptz,
  ADD COLUMN IF NOT EXISTS entregada_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_notificaciones_enviada_en
  ON notificaciones(enviada_en);

CREATE INDEX IF NOT EXISTS idx_notificaciones_entregada_en
  ON notificaciones(entregada_en);
