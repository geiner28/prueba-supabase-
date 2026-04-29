-- ===========================================
-- Migración 008 — facturas.pagina_pago
-- Fecha: 2026-04-28
-- Permitir que cada factura tenga su propia URL de portal de pago
-- (separada del campo `archivo_url` que es el comprobante/factura).
-- ===========================================

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pagina_pago TEXT;
