// ===========================================
// Disponibilidad - Service
// ===========================================
const supabase = require("../../config/supabase");
const { success, errors } = require("../../utils/response");
const { resolverUsuarioPorTelefono } = require("../../utils/resolverUsuario");
const { normalizarPeriodo } = require("../../utils/periodo");

/**
 * Calcula disponible = recargas aprobadas - pagos pagados para un usuario/periodo.
 */
async function calcularDisponible(telefono, periodo) {
  const usuario = await resolverUsuarioPorTelefono(telefono);
  if (!usuario) return errors.notFound("Usuario no encontrado con ese teléfono");

  const periodoNorm = normalizarPeriodo(periodo);
  if (!periodoNorm) return errors.validation("Periodo inválido");

  // Total recargas aprobadas del periodo
  const { data: recargas, error: recErr } = await supabase
    .from("recargas")
    .select("monto")
    .eq("usuario_id", usuario.usuario_id)
    .eq("periodo", periodoNorm)
    .eq("estado", "aprobada");

  if (recErr) throw new Error(`Error consultando recargas: ${recErr.message}`);

  const totalRecargas = (recargas || []).reduce((sum, r) => sum + Number(r.monto), 0);

  // Total pagos pagados del periodo (a través de facturas)
  const { data: pagos, error: pagErr } = await supabase
    .from("pagos")
    .select("monto_aplicado, facturas!inner(periodo)")
    .eq("usuario_id", usuario.usuario_id)
    .eq("estado", "pagado")
    .eq("facturas.periodo", periodoNorm);

  if (pagErr) throw new Error(`Error consultando pagos: ${pagErr.message}`);

  const totalPagos = (pagos || []).reduce((sum, p) => sum + Number(p.monto_aplicado), 0);

  const disponible = totalRecargas - totalPagos;

  return success({
    usuario_id: usuario.usuario_id,
    periodo: periodoNorm,
    total_recargas_aprobadas: totalRecargas,
    total_pagos_pagados: totalPagos,
    disponible,
  });
}

module.exports = { calcularDisponible };
