-- ===========================================
-- Migración: Solicitudes de Recarga
-- Tabla para gestionar solicitudes automáticas
-- de recarga según el plan del usuario
-- ===========================================

-- Tipo enum para estado de solicitud
DO $$ BEGIN
  CREATE TYPE solicitud_recarga_estado AS ENUM (
    'pendiente',        -- Solicitud generada, esperando que el usuario recargue
    'parcial',          -- El usuario ha recargado parte del monto
    'cumplida',         -- El usuario recargó el monto completo
    'vencida',          -- La fecha límite pasó sin recarga
    'cancelada'         -- Cancelada manualmente
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabla principal
CREATE TABLE IF NOT EXISTS solicitudes_recarga (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  usuario_id        uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  obligacion_id     uuid NOT NULL REFERENCES obligaciones(id) ON DELETE CASCADE,
  
  -- Datos de la solicitud
  numero_cuota      integer NOT NULL DEFAULT 1,        -- 1 = única/primera cuota, 2 = segunda cuota
  total_cuotas      integer NOT NULL DEFAULT 1,        -- 1 = plan control, 2 = tranquilidad/respaldo
  monto_solicitado  numeric NOT NULL,                  -- Monto que debe recargar
  monto_recargado   numeric NOT NULL DEFAULT 0,        -- Cuánto ha recargado hasta ahora
  
  -- Fechas
  fecha_limite      date NOT NULL,                     -- Fecha límite para recargar
  fecha_recordatorio date,                             -- 5 días antes de la fecha límite
  
  -- Estado
  estado            solicitud_recarga_estado NOT NULL DEFAULT 'pendiente',
  
  -- Facturas que cubre esta cuota
  facturas_ids      uuid[] NOT NULL DEFAULT '{}',      -- IDs de las facturas asignadas a esta cuota
  
  -- Metadata
  plan              text NOT NULL,                     -- Plan al momento de generar
  notificacion_enviada boolean NOT NULL DEFAULT false,  -- Si ya se envió notificación de solicitud
  recordatorio_enviado boolean NOT NULL DEFAULT false,  -- Si ya se envió recordatorio
  
  -- Auditoría
  actualizado_en    timestamptz
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sol_recarga_usuario ON solicitudes_recarga(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sol_recarga_obligacion ON solicitudes_recarga(obligacion_id);
CREATE INDEX IF NOT EXISTS idx_sol_recarga_estado ON solicitudes_recarga(estado);
CREATE INDEX IF NOT EXISTS idx_sol_recarga_fecha_limite ON solicitudes_recarga(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_sol_recarga_fecha_recordatorio ON solicitudes_recarga(fecha_recordatorio);
