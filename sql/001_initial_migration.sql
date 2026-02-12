-- ===========================================
-- DeOne Backend - Migración SQL Completa
-- Ejecutar en Supabase SQL Editor
-- ===========================================

-- ========== ENUMS ==========

DO $$ BEGIN
  CREATE TYPE plan_tipo AS ENUM ('control', 'tranquilidad', 'respaldo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE obligacion_estado AS ENUM ('activa', 'inactiva');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE periodicidad AS ENUM ('mensual', 'quincenal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE factura_estado AS ENUM ('capturada', 'extraida', 'en_revision', 'validada', 'rechazada', 'pagada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE extraccion_estado AS ENUM ('ok', 'dudosa', 'fallida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recarga_estado AS ENUM ('reportada', 'en_validacion', 'aprobada', 'rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pago_estado AS ENUM ('pendiente', 'en_proceso', 'pagado', 'fallido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE revision_tipo AS ENUM ('factura', 'recarga');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE revision_estado AS ENUM ('pendiente', 'en_proceso', 'resuelta', 'descartada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canal_origen AS ENUM ('whatsapp', 'web_admin', 'sistema');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ========== TABLAS ==========

-- 1. USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  nombre      text NOT NULL,
  apellido    text,
  correo      text UNIQUE,
  telefono    text UNIQUE NOT NULL,
  direccion   text,
  plan        plan_tipo NOT NULL DEFAULT 'control',
  activo      boolean NOT NULL DEFAULT true
);

-- 2. AJUSTES_USUARIO (1:1 con usuarios)
CREATE TABLE IF NOT EXISTS ajustes_usuario (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id                      uuid UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en                       timestamptz NOT NULL DEFAULT now(),
  recordatorios_activos           boolean NOT NULL DEFAULT true,
  dias_anticipacion_recordatorio  int NOT NULL DEFAULT 5,
  tipo_notificacion               text NOT NULL DEFAULT 'whatsapp',
  requiere_autorizacion_monto_alto boolean NOT NULL DEFAULT true,
  umbral_monto_alto               numeric NOT NULL DEFAULT 300000
);

-- 3. OBLIGACIONES
CREATE TABLE IF NOT EXISTS obligaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  usuario_id        uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  servicio          text NOT NULL,
  pagina_pago       text,
  tipo_referencia   text NOT NULL,
  numero_referencia text NOT NULL,
  periodicidad      periodicidad NOT NULL DEFAULT 'mensual',
  estado            obligacion_estado NOT NULL DEFAULT 'activa',
  quincena_objetivo smallint,
  CONSTRAINT uq_obligacion_usuario_serv_ref UNIQUE (usuario_id, servicio, numero_referencia)
);

-- 4. FACTURAS
CREATE TABLE IF NOT EXISTS facturas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  usuario_id            uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  obligacion_id         uuid NOT NULL REFERENCES obligaciones(id) ON DELETE RESTRICT,
  periodo               date NOT NULL,                          -- Siempre YYYY-MM-01
  fecha_emision         date,
  fecha_vencimiento     date NOT NULL,
  monto                 numeric NOT NULL,
  estado                factura_estado NOT NULL DEFAULT 'capturada',
  origen                text,                                    -- imagen/pdf/audio/texto
  archivo_url           text,                                    -- ruta interna bucket facturas
  extraccion_estado     extraccion_estado NOT NULL DEFAULT 'ok',
  extraccion_json       jsonb,
  extraccion_confianza  numeric,
  validada_por          uuid,
  validada_en           timestamptz,
  observaciones_admin   text,
  motivo_rechazo        text,
  CONSTRAINT uq_factura_obligacion_periodo UNIQUE (obligacion_id, periodo)
);

-- 5. RECARGAS
CREATE TABLE IF NOT EXISTS recargas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  usuario_id        uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo           date NOT NULL,                              -- Siempre YYYY-MM-01
  monto             numeric NOT NULL,
  estado            recarga_estado NOT NULL DEFAULT 'reportada',
  canal_origen      canal_origen NOT NULL DEFAULT 'whatsapp',
  comprobante_url   text,                                       -- ruta interna bucket comprobantes_recarga
  referencia_tx     text,                                       -- para idempotencia
  reportada_en      timestamptz NOT NULL DEFAULT now(),
  validada_por      uuid,
  validada_en       timestamptz,
  motivo_rechazo    text,
  observaciones_admin text
);

CREATE INDEX IF NOT EXISTS idx_recargas_usuario ON recargas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_recargas_estado ON recargas(estado);
CREATE INDEX IF NOT EXISTS idx_recargas_periodo ON recargas(periodo);
CREATE INDEX IF NOT EXISTS idx_recargas_referencia_tx ON recargas(referencia_tx);

-- 6. PAGOS
CREATE TABLE IF NOT EXISTS pagos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  factura_id          uuid NOT NULL REFERENCES facturas(id) ON DELETE RESTRICT,
  recarga_id          uuid REFERENCES recargas(id) ON DELETE SET NULL,
  monto_aplicado      numeric NOT NULL,
  estado              pago_estado NOT NULL DEFAULT 'pendiente',
  ejecutado_en        timestamptz,
  proveedor_pago      text,
  referencia_pago     text,
  comprobante_pago_url text,                                    -- ruta interna bucket comprobantes_pago
  error_detalle       text
);

-- 7. REVISIONES_ADMIN
CREATE TABLE IF NOT EXISTS revisiones_admin (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  tipo          revision_tipo NOT NULL,
  estado        revision_estado NOT NULL DEFAULT 'pendiente',
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  factura_id    uuid REFERENCES facturas(id) ON DELETE CASCADE,
  recarga_id    uuid REFERENCES recargas(id) ON DELETE CASCADE,
  prioridad     smallint NOT NULL DEFAULT 2,                    -- 1=alta, 2=media, 3=baja
  razon         text NOT NULL,
  asignada_a    uuid,
  resuelta_por  uuid,
  resuelta_en   timestamptz,
  notificada    boolean NOT NULL DEFAULT false,
  CONSTRAINT chk_revision_entidad CHECK (
    (tipo = 'factura' AND factura_id IS NOT NULL AND recarga_id IS NULL) OR
    (tipo = 'recarga' AND recarga_id IS NOT NULL AND factura_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_revisiones_estado ON revisiones_admin(estado);
CREATE INDEX IF NOT EXISTS idx_revisiones_tipo ON revisiones_admin(tipo);

-- 8. NOTIFICACIONES
CREATE TABLE IF NOT EXISTS notificaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  usuario_id    uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo          text NOT NULL,
  canal         text NOT NULL DEFAULT 'whatsapp',
  payload       jsonb,
  estado        text NOT NULL DEFAULT 'pendiente',
  ultimo_error  text
);

-- 9. AUDIT_LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actor_tipo  text NOT NULL,                                  -- admin/bot/sistema
  actor_id    uuid,
  accion      text NOT NULL,
  entidad     text NOT NULL,
  entidad_id  uuid NOT NULL,
  antes       jsonb,
  despues     jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_log(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_audit_creado ON audit_log(creado_en);


-- ========== VISTA: Disponible por periodo ==========

CREATE OR REPLACE VIEW v_disponible_por_periodo AS
SELECT
  u.id AS usuario_id,
  u.telefono,
  r.periodo,
  COALESCE(SUM(r.monto) FILTER (WHERE r.estado = 'aprobada'), 0) AS total_recargas_aprobadas,
  COALESCE(
    (SELECT SUM(p.monto_aplicado)
     FROM pagos p
     JOIN facturas f ON p.factura_id = f.id
     WHERE p.usuario_id = u.id
       AND p.estado = 'pagado'
       AND f.periodo = r.periodo),
    0
  ) AS total_pagos_pagados,
  COALESCE(SUM(r.monto) FILTER (WHERE r.estado = 'aprobada'), 0) -
  COALESCE(
    (SELECT SUM(p.monto_aplicado)
     FROM pagos p
     JOIN facturas f ON p.factura_id = f.id
     WHERE p.usuario_id = u.id
       AND p.estado = 'pagado'
       AND f.periodo = r.periodo),
    0
  ) AS disponible
FROM usuarios u
JOIN recargas r ON r.usuario_id = u.id
GROUP BY u.id, u.telefono, r.periodo;


-- ========== STORAGE BUCKETS ==========
-- Ejecutar estos comandos en Supabase Dashboard > Storage o SQL:

-- INSERT INTO storage.buckets (id, name, public) VALUES ('facturas', 'facturas', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes_recarga', 'comprobantes_recarga', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('comprobantes_pago', 'comprobantes_pago', false) ON CONFLICT DO NOTHING;


-- ========== FIN MIGRACIÓN ==========
-- Ahora puedes iniciar el backend con: npm run dev
