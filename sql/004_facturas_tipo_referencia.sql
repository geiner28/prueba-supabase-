-- ===========================================
-- DeOne Backend - Migración v4
-- Agregar tipo_referencia a facturas
-- ===========================================

-- Campo para identificar a qué plataforma o proceso corresponde
-- la referencia de pago de cada factura (ej: "PSE", "Bancolombia", "Nequi", etc.)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo_referencia text;
